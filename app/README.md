# Usagi 桌宠程序骨架

开发用 Seed-san（VRM 1.0），Electron 主进程管理透明窗口、托盘与配置，three + three-vrm 渲染模型。当前不含聊天、音效、安装包或设置页。

## 运行

需要 Node.js 22.12+（或满足 Vite 要求的更新 LTS）与 npm；推荐 Node.js 24 LTS。

```sh
cd app
npm ci
npm run dev
```

`dev` 先编译主进程和 preload，再启动仅监听本机的 Vite 服务和 Electron。渲染代码支持热更新；主进程/preload 修改后重新运行。退出托盘中的“退出”会同时关闭开发服务器。`npm run build` 生成 `out/`（主进程、preload）与 `dist/`（页面）；构建后可以用本项目本地 Electron 加载 `app/`。

在 AgentRouter 执行环境中，运行 GUI 前须在仓库根目录先执行 `ar gui check electron`；无头冒烟用 `ar gui check electron --headless`。若系统的 `ar` 是 macOS 归档工具，请使用已安装 AgentRouter 核心的 `node <核心目录>/ar.mjs gui check electron --headless`。检查被拒时交给门禁，不直接启动。

## 验证与截图

```sh
cd app
npm run typecheck
npm test
npm run smoke
```

`smoke` 构建后用 `--smoke` 启动隐藏窗口，设置 `offscreen: true`，不创建托盘、不读写应用配置、不轮询鼠标，始终加载仓库里的占位模型。模型加载并渲染 60 帧后通过 `capturePage({stayHidden:true})` 获取带 alpha 的 PNG，检查非零 alpha 的占比在 2%～95%，并检查 VRM 版本为 1。60 秒超时或加载、截图失败均打印 `ok:false` JSON 并退出 1。

输出为 `AR_GATE_ARTIFACT_DIR/smoke.png`，未指定时为 `app/smoke-out/smoke.png`。标准输出 JSON 包含实际模型路径、`opaqueRatio`、`vrmVersion`、`expressions`。首次运行时 Electron npm 包可能按其官方机制下载当前平台二进制；无需额外安装命令。

单元测试涵盖配置默认合并/损坏备份/读写、DPR 1/2 下像素坐标与 alpha 阈值、点击/拖动边界、大小与多屏位置恢复、模型路径优先级，以及眨眼、呼吸、开心跳跃、鼠标朝向。

## 操作与配置

- 角色上的左键短按触发开心表情和跳跃；移动达到 4px 视为拖动，曾拖出再回到起点也不会点击。300ms 及以上长按不触发点击。
- 透明像素穿透到桌面，模型像素通过 WebGL `readPixels` 读取 alpha，严格大于 0.1 接收鼠标。全局光标每 50ms 更新，使用画布实际 backing 尺寸换算 DPR。
- 托盘提供显示/隐藏、始终置顶、小/中/大、重新载入模型和退出。
- `config.json` 位于 Electron 的 `app.getPath('userData')`，通常为 macOS `~/Library/Application Support/usagi-desktop-pet/` 或 Windows `%APPDATA%/usagi-desktop-pet/`。程序使用 Electron 返回的路径，不依赖这些示例路径。

配置示例：

```json
{
  "modelPath": null,
  "size": "medium",
  "position": null,
  "alwaysOnTop": true
}
```

大小固定为 240×315、320×420、440×578。窗口恢复时须完整落在任一当前屏幕工作区，否则回到主屏右下角、距边缘 40px。配置损坏时原文件改名为 `config.broken-<时间>.json`，使用默认值；写入采用临时文件加 rename。配置 I/O 失败会记录日志，应用继续使用内存配置。

模型路径顺序：有效的 `modelPath` → `assets/models/usagi.vrm` → `assets/placeholder/Seed-san.vrm`；相对路径以仓库根目录解析，可指定绝对路径。VRM 以二进制 IPC 传给隔离的渲染进程，当前支持自包含 VRM（贴图等资源内嵌）。加载失败显示“模型加载失败：原因”并记录日志，可从托盘重新加载。Seed-san 仅用于开发，不应随安装包分发，模型许可和来源见项目目标文档。

## 平台差异与实现

macOS 隐藏 Dock 图标并调用 `setVisibleOnAllWorkspaces(true)`；Windows 设置 `skipTaskbar: true`。两个平台均使用 `setAlwaysOnTop(value, 'floating')`，透明无边框窗口关闭阴影，通过 `setIgnoreMouseEvents(..., {forward:true})` 控制穿透。Windows 和 macOS 桌面交互仍需主导实际走查；无头截图只能验证渲染与透明背景。

主进程在 `src/main/`，preload 在 `src/preload/`，渲染器在 `src/renderer/`，行为在 `src/renderer/behaviors/`。TypeScript strict；`contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`。preload 只暴露模型加载、光标订阅、命中/拖动、重载/点击订阅、渲染结果与日志接口；主进程只接收本窗口主 frame 的 IPC，阻止页面导航与新窗口。

依赖：Electron、three、three-vrm 为运行功能所需；Vite 负责渲染器构建，esbuild 负责把主进程/preload 编译为 Electron 可加载的 CJS，TypeScript/类型包用于静态检查，Vitest 用于纯逻辑测试。依赖解析锁定在 `package-lock.json`。

待主导处理：打包后的模型路径，以及把临时托盘图标换成 Usagi 图标；对应代码已留 `TODO(lead)`。

参考官方示例：[three-vrm 加载与优化](https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm/examples/basic.html)、[Electron 离屏渲染](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering/)、[BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window/)。
