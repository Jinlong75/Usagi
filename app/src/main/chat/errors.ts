export function safeDetail(value: string, apiKey = ''): string {
  let text = apiKey ? value.split(apiKey).join('[REDACTED]') : value;
  text = text.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/sk-[\w-]+/g, '[REDACTED]');
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

export class ChatError extends Error {
  constructor(public readonly code: string, message?: string, public readonly detail = '') {
    super(message ?? (code === 'stream_too_large' ? '回复数据过大，请稍后重试。' : '请求失败。'));
    this.name = 'ChatError';
  }
}

export function httpError(status: number, raw: string, apiKey = ''): ChatError {
  let detail = raw;
  try {
    const data = JSON.parse(raw);
    if (typeof data?.error?.message === 'string') detail = data.error.message;
  } catch { /* Non-JSON error pages are also useful diagnostics. */ }
  detail = safeDetail(detail, apiKey);
  if (status === 401 || status === 403) return new ChatError('auth', 'API Key 无效或没有权限，请在设置里检查 Key。', detail);
  if (status === 402) return new ChatError('insufficient_balance', 'DeepSeek 账户余额不足，请到 platform.deepseek.com 充值后再试。', detail);
  if (status === 429) return new ChatError('rate_limit', '请求太频繁了，稍等一会儿再试。', detail);
  if (status >= 500 && status <= 599) return new ChatError('server', 'DeepSeek 服务暂时出问题了，稍后再试。', detail);
  return new ChatError('http_error', `请求失败：${status} ${detail}`, detail);
}

export function networkError(error: unknown, apiKey = ''): ChatError {
  if (error instanceof ChatError) return error;
  const reasons: string[] = [];
  let cause: unknown = error;
  for (let depth = 0; cause && depth < 4; depth++) {
    reasons.push(cause instanceof Error ? cause.message : String(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  const detail = safeDetail(reasons.join(': ') || '网络连接失败', apiKey);
  const certificate = /cert|certificate|ssl|tls/i.test(detail);
  return new ChatError('network', `连不上 DeepSeek：${detail}。如果开着代理或 VPN，试试关掉或换线路。${certificate ? '（看起来是证书被拦截，常见于开着代理软件。）' : ''}`, detail);
}

export function emptyReplyError(reasoning: boolean, finishReason: string | null, maxTokens: number): ChatError {
  return reasoning && finishReason === 'length'
    ? new ChatError('reasoning_limit', `深度思考用完了最大输出长度（当前 ${maxTokens}），请在设置里调大或关掉深度思考。`)
    : new ChatError('empty_reply', '模型没有返回任何内容，请稍后重试或检查模型设置。');
}
