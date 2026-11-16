---
id: 007
title: DeepSeek 聊天核心模块（主进程，不含界面）
type: code
worker: auto
depends: ["003"]
allowed_paths:
  - app/src/main/chat/**
  - app/tests/chat/**
verify:
  - npm --prefix app ci
  - npm --prefix app run typecheck
  - npm --prefix app test
expect_commit: true
verify_timeout_min: 15
review: true
---

## 目标

在 `app/src/main/chat/` 下做好 Usagi 桌宠聊天的全部"后台"能力：DeepSeek 流式请求、SSE 解析、提示词拼装（人设 + 时间感知 + 历史裁剪）、情绪标签解析、错误转人话、API Key 加密保存、会话安全落盘、测试连接。全部用单元测试覆盖（模拟 fetch），**不做任何界面和 IPC 接线**（下一份说明 008 做）。

## 范围 / 不做什么

- 做：下面列出的模块和测试。
- 不做：聊天窗口、设置页、气泡、IPC、preload、修改 `app/src/main/index.ts`；联网搜索、看图、记忆、余额（第二批）。
- 不加新的 npm 依赖（用 Node / Electron 自带的 `fetch`、`fs/promises`、`crypto`、`safeStorage`）。
- 只改 `app/src/main/chat/**` 和 `app/tests/chat/**`。vitest 配置若不包含 `tests/chat/` 子目录，在汇报里说明，不要改配置（留 `TODO(lead)`）。

## 参照

- 功能分级与行为参数：`.agent-router/target.md` 的 D7「AI 对话」一条。
- 参考项目的实现细节（照规则写，不抄代码）：`docs/research/参考桌宠调研.md` 的 C1～C7 和 E9、E11、E12、E13。
- DeepSeek 官方：base URL `https://api.deepseek.com`（OpenAI 兼容），`POST /chat/completions`，`GET /models`。当前模型 ID：`deepseek-flash`（默认）、`deepseek-v4-pro`；旧名 `deepseek-v4-flash` 仍可用。文档：https://api-docs.deepseek.com/api/create-chat-completion/ 。
- 现有代码风格：`app/src/main/config.ts`（配置读写与损坏容错的写法）。

## 要求

### 1. `sse.ts`：SSE 解析器
- 增量喂入字节/字符串，按 `\n\n` 或 `\r\n\r\n` 切事件；忽略空 `data:` 心跳和注释行；`data: [DONE]` 标记结束。
- 每个 JSON 事件取 `choices[0].delta.content`（正文）、`choices[0].delta.reasoning_content`（思考过程）、`choices[0].finish_reason`。
- 缓冲超过 1MB 未成事件 → 抛 `ChatError('stream_too_large')`。坏 JSON 行跳过并计数，不中断。

### 2. `client.ts`：DeepSeek 客户端
- `streamChat(opts, signal)` 返回异步迭代器，产出 `{type:'content', text}` / `{type:'reasoning', text}` / `{type:'done', finishReason}`。
- `opts`：`baseUrl`（默认 `https://api.deepseek.com`，规范化：去尾 `/`；已以 `/chat/completions` 结尾就原样用，否则补上）、`apiKey`、`model`（默认 `deepseek-flash`）、`messages`、`temperature`（默认 0.7）、`maxTokens`（默认 2048）、`thinking`（`'auto'|'enabled'|'disabled'`，默认 `'disabled'`；`enabled` 时请求体加 `{"thinking":{"type":"enabled"}}`；`auto` 只在 baseUrl 是 deepseek.com 时才发思考参数）、`timeoutMs`（默认 60000）。
- 请求体 `{model, messages, stream:true, temperature, max_tokens}`；头 `Authorization: Bearer <key>`、`Content-Type: application/json`、`Accept: text/event-stream`。
- `listModels(baseUrl, apiKey)`：`GET /models`，返回模型 id 列表，用于"测试连接"。
- 外部 `AbortSignal` 能中途停止；超时也用 abort 实现。

### 3. `errors.ts`：错误转人话
`ChatError` 带 `code` 和中文 `message`（下面文案照抄），并保留 `detail`（服务端原文截 300 字，不含 Key）：
- 401/403 → `API Key 无效或没有权限，请在设置里检查 Key。`
- 402 → `DeepSeek 账户余额不足，请到 platform.deepseek.com 充值后再试。`
- 429 → `请求太频繁了，稍等一会儿再试。`
- 5xx → `DeepSeek 服务暂时出问题了，稍后再试。`
- 网络失败 → `连不上 DeepSeek：<原因>。如果开着代理或 VPN，试试关掉或换线路。`
- 证书错误（原因含 cert / certificate / ssl / tls）→ 在上一条后追加 `（看起来是证书被拦截，常见于开着代理软件。）`
- 超时 → `DeepSeek 回复超时了，稍后再试。`
- 空回复 → `模型没有返回任何内容，请稍后重试或检查模型设置。`
- 只有思考没有正文且 `finish_reason=length` → `深度思考用完了最大输出长度（当前 N），请在设置里调大或关掉深度思考。`
- 未知 → `请求失败：<HTTP 状态> <服务端原文>`

### 4. `persona.ts` + `prompt.ts`：提示词
- `persona.ts` 导出默认 Usagi 人设 `DEFAULT_PERSONA`（下面全文照抄），允许外部传入自定义人设覆盖：

  > 你是乌萨奇（Usagi），《Chiikawa》里那只奶黄色、长耳朵的兔子，现在住在主人的电脑桌面上。你精力旺盛、无厘头、自由自在，经常大喊"呀哈！""乌拉！""哈？""噗噜噜噜"。用中文回复，每次 1～3 句，短而有活力，语气词多，偶尔突然大喊；主人认真问问题时，先喊一声再用一两句话把要点说清楚，不长篇大论。不要说自己是 AI 或语言模型，不要用 Markdown 标题和列表。每次回复的最开头必须加一个情绪标签，只能是 [开心] [惊讶] [生气] [难过] [平静] 之一，标签后面直接接回复内容。

- `prompt.ts` 的 `buildMessages({persona, history, userText, now, lastMessageAt, historyLimit=40, historyCharLimit=24000})`：
  1. system = 人设 + `\n\n【时间信息】当前时间：YYYY-MM-DD 周X HH:MM。`；若 `now - lastMessageAt ≥ 10 分钟`，再加 `距离上一条消息已经过去约 X 天/小时/分钟。`；再加 `用户消息开头的 [日期 时间] 是系统附加的，不要复述或模仿。`
  2. 历史裁剪：从最新往旧取，条数达到 `historyLimit` 或累计字符超过 `historyCharLimit` 就停（超限那条整条丢）；一条都放不下时只取最新一条的尾部 `historyCharLimit` 字符。system 和本次用户消息不计入额度。
  3. 历史里的用户消息发送时加前缀 `[YYYY-MM-DD 周X HH:MM] `（按该条 `createdAt`），助手消息不加；不改动存盘内容。
  4. 最后追加本次用户消息（同样加时间前缀，`trim()`）。
  - 时间格式化用本地时区，`now` 可注入，测试里固定时间。

### 5. `emotion.ts`：情绪标签
- `parseEmotion(text)`：识别开头的 `[开心|惊讶|生气|难过|平静]`（允许前导空白、全角方括号【】），返回 `{emotion: 'happy'|'surprised'|'angry'|'sad'|'neutral', text: 去掉标签后的正文}`；没有标签 → `neutral`，正文不变。
- 流式时标签可能被拆在多个片段里：提供 `EmotionStreamFilter`，在确认开头是否为标签之前先缓冲（最多 8 个字符），之后原样放行；测试覆盖标签被拆成 `[`、`开`、`心]` 三片的情况。

### 6. `keyStore.ts`：API Key 加密保存
- 依赖注入一个 `{isEncryptionAvailable(), encryptString(s), decryptString(buf)}`（生产用 Electron `safeStorage`，测试用假实现）和数据目录路径。
- 加密后 base64 存到 `<userData>/secrets.json` 的 `deepseekApiKey` 字段，写法同 session 的原子写。
- 加密不可用时：只保存在内存，`save()` 返回 `{persisted:false, reason:'加密存储不可用，Key 只在本次运行有效，重启后需要重新填写。'}`；**不得把明文写盘**。
- 读出失败（损坏、换机器解不开）→ 返回空并标记 `needsReentry: true`。
- 日志里永远不出现 Key（只记长度或掩码 `sk-****abcd`），提供 `maskKey()`。

### 7. `sessionStore.ts`：会话存储
- 单会话文件 `<userData>/chat/session.json`，结构参照调研报告 C7（`sessionId`、`createdAt`、`updatedAt`、`messages[{id, role, content, createdAt, emotion?}]`），时间用 ISO。
- 原子写：写 `*.tmp` → `fsync` → `rename`；所有写入排进一个串行队列；`flush()` 等待队列清空（给退出前调用）。
- 读到坏 JSON：把文件改名为 `session.corrupt-<毫秒时间戳>.json`，返回新空会话。
- `append(msg)`、`clear()`（清空消息、换 sessionId）、`load()`。

### 8. `service.ts`：聊天服务
- `ChatService({client, store, keyStore, getSettings, now})`；`getSettings()` 返回 `{baseUrl, model, temperature, maxTokens, thinking, persona?}`。
- `send(userText)`：返回请求 id，并通过事件回调依次发出 `status: 'thinking'` → 多个 `delta`（已过情绪过滤的正文增量）→ `done {text, emotion}` 或 `error {code, message}`。用户消息在发送前就存盘；助手回复完整结束才存盘（带 emotion）；**停止或出错时半截回复不存**。
- 同一时间只允许一个请求；新的 `send` 在旧请求进行中时直接拒绝并返回 `busy` 错误（不排队）。
- `stop()`：中止当前请求，发 `stopped` 事件。
- `testConnection()`：用当前 Key 调 `listModels`，返回 `{ok, models | message}`；没有 Key 时返回 `请先填写 API Key。`。
- 没有 Key 时 `send` 直接给出 `error {code:'no_key', message:'还没有填写 DeepSeek API Key，在设置里填好就能聊天啦。'}`。

### 9. 测试（`app/tests/chat/`，vitest，全部模拟 fetch，不联网）
至少覆盖：SSE 切分（含心跳、`[DONE]`、坏 JSON、1MB 上限、片段从任意字节处断开）；客户端请求体与头、URL 规范化三种情况、思考参数三态、abort 与超时；每个错误码映射文案；提示词时间段（固定 now）、间隔提示、历史裁剪三种边界、时间前缀；情绪解析与流式拆片；keyStore 加密可用/不可用/解不开三种情况且不落明文（检查文件内容不含原 Key）；sessionStore 原子写、串行队列、坏文件改名、flush；service 的完整流程、busy、stop 不存半截、no_key、testConnection。

## 验收标准

- verify 三条通过。
- 代码里没有硬编码的 Key、没有本机绝对路径；日志不打印 Key。

## 自测

`npm --prefix app run typecheck`，`npx --prefix app vitest run tests/chat`（或等价命令）。

## 受影响的已有测试

无：只新增 `app/src/main/chat/` 和 `app/tests/chat/`，不改已有模块。搜过的关键词：chat、deepseek、session、safeStorage（003 的代码里都没有）。

## 换环境

Windows 上 `safeStorage` 走 DPAPI，接口相同；本任务只用注入的假实现测试。

## 汇报要回答的问题

1. vitest 是否自动包含 `tests/chat/` 子目录。
2. 用的 Electron 版本里 `safeStorage` 在主进程何时可用（是否必须在 `app.whenReady()` 之后），在汇报里写明，008 接线时要用。
3. `fetch` 的流式读取用的是哪种写法（`response.body.getReader()` 或 `for await`），以及中止后迭代器怎样收尾。
