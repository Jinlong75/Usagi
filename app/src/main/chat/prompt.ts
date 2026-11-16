import { DEFAULT_PERSONA } from './persona';
import type { ChatMessage, Message } from './types';

export function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 周${'日一二三四五六'[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export interface PromptOptions {
  persona?: string;
  history: readonly Message[];
  userText: string;
  now?: Date;
  lastMessageAt?: Date | string;
  historyLimit?: number;
  historyCharLimit?: number;
}
export function buildMessages({ persona = DEFAULT_PERSONA, history, userText, now = new Date(), lastMessageAt, historyLimit = 40, historyCharLimit = 24000 }: PromptOptions): ChatMessage[] {
  let system = `${persona}\n\n【时间信息】当前时间：${formatTime(now)}。`;
  if (lastMessageAt) {
    const minutes = Math.floor((now.getTime() - new Date(lastMessageAt).getTime()) / 60000);
    if (minutes >= 10) {
      const gap = minutes >= 1440 ? `${Math.floor(minutes / 1440)} 天` : minutes >= 60 ? `${Math.floor(minutes / 60)} 小时` : `${minutes} 分钟`;
      system += `距离上一条消息已经过去约 ${gap}。`;
    }
  }
  system += '用户消息开头的 [日期 时间] 是系统附加的，不要复述或模仿。';
  const kept: Message[] = [];
  const countLimit = Math.max(0, Math.floor(historyLimit));
  const charLimit = Math.max(0, Math.floor(historyCharLimit));
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && kept.length < countLimit; i--) {
    const msg = history[i]!;
    if (chars + msg.content.length > charLimit) {
      if (kept.length === 0 && charLimit > 0) kept.push({ ...msg, content: msg.content.slice(-charLimit) });
      break;
    }
    kept.push(msg);
    chars += msg.content.length;
  }
  const messages: ChatMessage[] = [{ role: 'system', content: system }];
  for (const msg of kept.reverse()) {
    messages.push({ role: msg.role, content: msg.role === 'user' ? `[${formatTime(new Date(msg.createdAt))}] ${msg.content}` : msg.content });
  }
  messages.push({ role: 'user', content: `[${formatTime(now)}] ${userText.trim()}` });
  return messages;
}
