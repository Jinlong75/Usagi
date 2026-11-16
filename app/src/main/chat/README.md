# 聊天核心（供 008 接线）

从 `index.ts` 导入公开接口。本目录不导入 Electron、不访问 UI/IPC；所有生产网络请求由主进程原生 fetch 发出。

## 初始化与退出

- `new DeepSeekClient()` 默认使用原生 fetch；测试可注入同签名的模拟 fetch。
- `new SessionStore(userData, now?)`：`load()`、`append(message)`、`clear()` 都返回 Promise。读取与写入共用串行队列；返回值与输入消息均做快照。`flush()` 等待队列，发生过写入失败时会拒绝，调用方需处理。
- `new KeyStore(userData, safeStorage)`：`load()` 返回 `{apiKey, needsReentry}`；`save(key)` 返回 `{persisted:true}` 或 `{persisted:false, reason}`。保存空字符串会删除旧 Key。加密不可用/失败时仅留内存，并移除旧密文，避免重启恢复旧 Key。不要把 `apiKey`、请求选项或原始异常写日志；需要展示时用 `maskKey()`。
- 生产接线应在 `await app.whenReady()` 之后注入 safeStorage、访问存储。退出前先停止请求，再等待 sessionStore/keyStore 的 `flush()`，不要直接退出进程。

项目锁定 Electron 45.3.2，其随包 `electron.d.ts` 与 [官方 safeStorage 文档](https://www.electronjs.org/docs/latest/api/safe-storage) 一致：同步接口在 Windows 要 ready 后可用，macOS 取决于 Keychain，Linux 还取决于密钥后端。同步接口从 45 起已弃用，但本任务按指定同步注入契约实现；升级到 Electron 46 前须迁移到异步接口。

## 服务事件

`new ChatService({client, store, keyStore, getSettings, now?, onEvent?})`；也可通过 `service.onEvent(callback)` 订阅，返回函数用于取消订阅。

- `send(text)` 同步返回请求 UUID，事件从后续微任务开始；忙时同步抛出 `ChatError`（`code === 'busy'`），不排队。
- 所有事件携带 `requestId`。正常顺序：`{type:'status',status:'thinking'}` → `{type:'delta',text}` → `{type:'done',text,emotion}`；失败为 `{type:'error',code,message}`。思考过程不会作为 delta 发给界面或保存。
- 无 Key 时只发 `no_key` 错误，不保存用户消息。正常发送在请求前保存用户原文，只有完整成功的助手正文才保存。日期前缀只加在发给模型的上下文中。
- `stop()` 中止流并发一次 `{type:'stopped'}`；旧迭代器收尾前仍会拒绝新请求。完整回复已经进入原子提交时 `stop()` 返回 false，此时接下来是 done/error；不会把完整已提交的回复称为已停止。
- `testConnection()` 使用当下设置和 Key，返回 `{ok:true,models}` 或 `{ok:false,message}`。

## 请求与边界规则

默认模型 `deepseek-flash`，temperature 0.7，maxTokens 2048，整次请求超时 60 秒。客户端使用 `response.body.getReader()`；外部 abort 与超时均中止 fetch/读取，finally 取消 reader、释放锁并清理定时器及监听器。消费方提前 return 也会执行清理。EOF 有 finish_reason 时允许正常完成；既没有 `[DONE]` 也没有 finish_reason 时视为连接截断，不保存半截回复。

`thinking:'disabled'` 显式发 `{type:'disabled'}`，避免官方 API 默认开启思考；`enabled` 显式开启。`auto` 只在主机名为 deepseek.com 或其子域时发送 enabled，其他地址省略该字段。任务未明确 auto 对应的 type，代码保留了 `TODO(lead)` 供确认。

情绪流过滤在开头最多缓冲 8 个字符；超出后把已缓冲内容作为普通正文放行。因此开头有超过预算的空白时，流式路径会保留标签原文并使用 neutral。完整字符串的 `parseEmotion()` 可接受任意前导空白。

## 聚焦验证

在仓库根目录执行：

```sh
npm --prefix app run typecheck
npm exec --prefix app -- vitest run --root app tests/chat
```

Vitest 的现有 `tests/**/*.test.ts` 配置自动包含本目录测试。全部网络均模拟 fetch，不使用真实 Key、不联网、不启动 Electron。
