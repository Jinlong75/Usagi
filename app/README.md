# Usagi 桌宠程序骨架

默认加载 Usagi（VRM 1.0），Seed-san 仅在显式指定时使用。Electron 主进程管理透明窗口、托盘与配置，three + three-vrm 渲染模型。包含程序化行为、叫声音效、气泡、自言自语、DeepSeek 聊天与设置；支持 macOS arm64 DMG 与 Windows x64 NSIS 安装包。

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

在仓库根目录、且命令不经过 shell 解释时（例如 AgentRouter 门禁按参数数组运行验收命令，`cd app && …` 里的 `cd`/`&&` 不会生效），改用等价的 `--prefix` 写法，每条单独运行：

```sh
npm --prefix app ci
npm --prefix app run typecheck
npm --prefix app test
npm --prefix app run smoke
```

任务 013 的执行者自测只运行 `npm --prefix app run typecheck` 和 `npm --prefix app test -- --no-cache --no-fsModuleCache`；两个 Vitest 参数仅关闭结果缓存与模块缓存，不筛选测试或改变断言，避免在仓库根 `node_modules/` 生成任务范围外文件。完整验收及 GUI 冒烟由门禁执行。

`smoke` 构建后用 `--smoke` 启动隐藏窗口，设置 `offscreen: true`，不创建托盘、不读写应用配置、不轮询鼠标，开发时默认加载 `assets/models/usagi.vrm`，打包后加载包内同一模型。模型加载并渲染 60 帧后，依次播放待机、原地步态、开心、惊讶、喊叫、伸懒腰、拖动姿态和甩耳朵（走路不实际移动窗口）。每段按固定 1/60 秒步长推进并在代表时刻冻结弹簧状态，开心在跳跃最高点（175ms）截图，通过 `capturePage({stayHidden:true})` 获取带 alpha 的 PNG，检查非零 alpha 的占比在 2%～95%，并检查 VRM 版本为 1。开心最高点、喊叫和伸懒腰截图最上方两行 alpha 必须全为 0，模型触顶会打印 `ok:false`。60 秒超时或加载、截图失败均打印 `ok:false` JSON 并退出 1。

输出为 `AR_GATE_ARTIFACT_DIR/smoke.png` 以及 `smoke-idle.png`、`smoke-walk.png`、`smoke-happy.png`、`smoke-surprised.png`、`smoke-shout.png`、`smoke-stretch.png`、`smoke-drag.png`、`smoke-ear-shake.png`；未指定目录时写到 `app/smoke-out/`。标准输出 JSON 包含实际模型路径、`opaqueRatio`、`vrmVersion`、`expressions`、`behaviors: ["idle","walk","happy","surprised","shout","stretch","drag","ear-shake"]` 与 `behaviorOpaqueRatios`（每种行为的不透明像素占比），以及 `behaviorTopTransparent: {happy:true, shout:true, stretch:true}`。九张图均检查 2%～95%，启动脚本还检查八种行为、八个占比和三种顶部透明检查齐全。`earDifferenceRatio` 要求甩耳与 idle 上方 30% 区域像素差异 > 3%；`happyFaceDifferenceRatio` 要求跟随脸部贴片投影取区后差异 > 0，避免跳跃位移造成假阳性。`earDegrees` 记录耳根到耳尖相对中性的偏角（含头/身体倾斜）。截图与真实动作观感由主导走查。首次运行时 Electron npm 包可能按其官方机制下载当前平台二进制；无需额外安装命令。

主进程写完结果 JSON 后才退出，启动脚本会等待子进程输出管道关闭再判定结果。静默提前退出、缺少结果字段、非零退出、信号终止、启动失败和超时都会输出带原因的 `ok:false` JSON 并返回 1；即使 Electron 返回 0，也必须收到完整、有效的成功结果。相关回归测试只启动 Node fixture，不启动 Electron 或桌面窗口。

单元测试涵盖配置默认合并/损坏备份/读写、DPR 1/2 下像素坐标与 alpha 阈值、点击/拖动边界、大小与多屏位置恢复、模型路径优先级，以及眨眼、呼吸、鼠标朝向、行为掷骰与滞回、全部动作复位、窗口移动取消、弹簧力恢复、音效筛选/单通道、省电和七行为冒烟报告。

## 操作与配置

- 角色上的左键短按（<300ms）随机触发开心、惊讶、喊叫之一，排除上一次；新点击可打断任何动作。拖动阈值为 `5px × 窗口宽度/320`（小 3.75px、中 5px、大 6.875px），曾拖出再回起点也不会点击；拖后 150ms 内忽略点击。
- 透明像素穿透到桌面，模型像素通过 WebGL `readPixels` 读取 alpha，严格大于 0.1 接收鼠标。全局光标闲时约每 50ms 更新，按下后以 60Hz 检查拖动并发送速度，隐藏后暂停轮询，使用画布实际 backing 尺寸换算 DPR。
- 角色右键和托盘提供和乌萨奇聊天、设置、自言自语、鼠标穿透、始终置顶、小/中/大、显示/隐藏、重新载入模型和退出。整窗鼠标穿透开启后只能从托盘关闭，透明像素命中穿透仍按原规则运行。
- `config.json` 位于 Electron 的 `app.getPath('userData')`，通常为 macOS `~/Library/Application Support/usagi-desktop-pet/` 或 Windows `%APPDATA%/usagi-desktop-pet/`。程序使用 Electron 返回的路径，不依赖这些示例路径。

配置示例：

```json
{
  "modelPath": null,
  "size": "medium",
  "position": null,
  "alwaysOnTop": true,
  "chat": {
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-flash",
    "temperature": 0.7,
    "maxTokens": 2048,
    "thinking": "disabled"
  },
  "selfTalk": { "enabled": true, "minSec": 20, "maxSec": 60, "lines": [] },
  "volume": 0.7,
  "mousePassthrough": false
}
```

大小固定为 240×315、320×420、440×578。窗口恢复时须完整落在任一当前屏幕工作区，否则回到主屏右下角、距边缘 40px。配置损坏时原文件改名为 `config.broken-<时间>.json`，使用默认值；写入采用临时文件加 rename。设置写盘失败会记录日志、保留原有内存配置，不广播或应用失败的设置；设置页用红字显示具体原因，保留编辑内容和窗口，供修复磁盘空间或权限后重试。

模型路径顺序：有效的 `modelPath` → `assets/models/usagi.vrm`（缺失则报错，Seed-san 仅显式指定时加载）；相对路径以仓库根目录解析，可指定绝对路径。VRM 以二进制 IPC 传给隔离的渲染进程，当前支持自包含 VRM（贴图等资源内嵌）。加载失败显示“模型加载失败：原因”并记录日志，可从托盘重新加载。Seed-san 仅用于开发；正式包不得包含，缺正式模型时只生成带 -dev 后缀的开发包，不分发，模型许可和来源见项目目标文档。

## 平台差异与实现

macOS 隐藏 Dock 图标并调用 `setVisibleOnAllWorkspaces(true)`；Windows 设置 `skipTaskbar: true`。两个平台均使用 `setAlwaysOnTop(value, 'floating')`，透明无边框窗口关闭阴影，通过 `setIgnoreMouseEvents(..., {forward:true})` 控制穿透。Windows 和 macOS 桌面交互仍需主导实际走查；无头截图只能验证渲染与透明背景。

主进程在 `src/main/`，preload 在 `src/preload/`，渲染器在 `src/renderer/`，基础待机在 `src/renderer/behaviors/`，状态机/省电/音频在 `src/renderer/behavior/`，动作采样/骨骼复位/弹簧受力在 `src/renderer/motion/`。TypeScript strict；`contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`。preload 暴露模型/受限音效二进制加载、窗口信息、移动/取消、光标/拖动/点击/完成通知、命中、重载、冒烟姿态与渲染结果接口；主进程只接收本窗口主 frame 的 IPC，阻止页面导航与新窗口。

依赖：Electron、three、three-vrm 为运行功能所需；Vite 负责渲染器构建，esbuild 负责把主进程/preload 编译为 Electron 可加载的 CJS，TypeScript/类型包用于静态检查，Vitest 用于纯逻辑测试。依赖解析锁定在 `package-lock.json`。

打包后模型使用 `process.resourcesPath/models/usagi.vrm`，音效使用 `process.resourcesPath/sounds/usagi/`；有效的用户 modelPath 仍优先。托盘使用 `build/` 下的 Usagi 头像。

参考官方示例：[three-vrm 加载与优化](https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm/examples/basic.html)、[Electron 离屏渲染](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering/)、[BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window/)。

## 行为、走动与音效

待机或随机动作结束后按 30% 待机 / 10% 转向 / 40% 随机动作 / 20% 移动掷骰。待机/转向经过屏幕中线 ±7% 滞回闸门，动作池只排除上一个；移动池拒绝后退回随机动作，空池退回待机。默认正面，走路前转到 ±50°，完成后转回正面。随机动作包括两次小跳、伸懒腰、甩头带动耳朵和开心转圈，动作结束或接管时复位。

移动仅沿当前 Y 高度，距工作区边缘 20px，单次 60～240px，平均速度固定 90 DIP/s。原生窗口使用 60Hz 三次 ease-in-out 插值；步态每 45 DIP 一步（平均 2 步/秒），相位取同一缓动函数的累计距离，因此加速/减速时步频同步变化。点击按下或拖动接管立即作废原路线，从当前位置重新规划。移动结束沿用原有配置保存。移动与拖动均不调用 `focus()`、`show()` 或 `moveTop()`；窗口 `focusable:false`，显式显示用 `showInactive()`。

渲染进程先把终点裁到工作区可达范围，再以真实距离计算时长与步数；例如宽 1000px 的工作区、宽 320px 的窗口位于 x=750 时，最短计划终点裁到 x=660，真实距离 90px、时长 1 秒、2 步。主进程再次安全裁剪时按距离比例重算时长，完成通知包含 `{ok:true, distance}`；拒绝请求则回 `{ok:false, reason}`，状态机立即回 idle。计划时长 + 1 秒仍未收到完成通知，会回 idle 并取消原生移动。

拖动姿态最大倾斜 15°，四肢下垂，`surprised` 权重 0.4。额外弹簧力系数为 `0.00008`（屏幕 DIP/s² 转模型力），总额外力限幅 3，以 `exp(-10t)` 衰减；恢复后精确还原每个 joint 原本的 gravityDir/gravityPower。Seed-san 有 28 个 spring joint，点击所需 `happy/surprised/aa/angry` 预设均存在（来自 VRM 元数据）；视觉自然度和晃动幅度由门禁图片与实际走查判断。

主进程从仓库根 `assets/sounds/usagi/manifest.json` 按 uses 筛选非空 file 且 quality 为 clean/bgm 的片段，拒绝越界路径（包括符号链接），只通过受信 IPC 发送字节。Web Audio 音量默认 0.7，可在设置调整；新声打断旧声，异步读盘/解码结果也受同一代号控制；确认点击后才播点击声，拖动开始以 30% 概率播 drag 声。缺 manifest/某类声音则静默跳过，相同原因只记一次日志；当前 manifest 未分配 drag 素材，实际拖动不会出声。

托盘隐藏/显示时主进程显式发送 `pet:visibility {visible}`，隐藏立即取消 requestAnimationFrame、暂停状态机计时与掷骰，显示先回 idle 并重新计时再恢复渲染；不依赖 `backgroundThrottling:false` 下仍可能为 visible 的 `document.visibilityState`。连续 8 秒无动作/移动/点击/拖动时限制 30fps，被动呼吸、眨眼、看鼠标不重置闲置时间，活动立即恢复满帧。模型加载后、首次绘制前，依次采样喊叫、开心跳跃最高点、伸懒腰、甩头两侧、转圈每 45°、走路最高点（正面与左右转向）以及左右最大拖动倾斜。每个姿态先更新 VRM 和骨骼世界矩阵，再用 `Box3.setFromObject(scene, true)` 读取包含蒙皮变形的顶点范围并求并集，四边各加并集尺寸 4% 边距。中性脚底保持距画面底部 5%；动作向下超出时按需整体上移角色。采样后恢复中性姿态和弹簧状态，用户看不到采样过程。窗口缩放复用该范围，避免随当前动作改变取景。

TODO(lead): Windows 实测走动流畅度（Windows 高频 setPosition 可能掉帧）。TODO(lead): mac 实际拖动复核弹簧受力系数和耳朵/头发晃动幅度。


## 聊天、设置与气泡

从右键或托盘打开“和乌萨奇聊天”，Enter 发送，Shift+Enter 换行，流式回复时按“停止”可中断。关闭聊天窗只隐藏，保留本次运行的位置与消息；下次启动打开时从本机单会话记录恢复。“清空对话”有二次确认。消息只作为纯文本显示，不解释 HTML 或 Markdown。

设置包含 AI 对话、桌宠、关于三组，点击“保存”或关闭设置窗都会保存并立即生效。首次填写 DeepSeek Key 后可“测试连接”；可选择模型、温度、深度思考和高级 API 地址。API Key 不写入 config.json，主进程在 app.whenReady() 后用 Electron 45 的 isAsyncEncryptionAvailable/encryptStringAsync/decryptStringAsync，接线层 AsyncKeyStore 适配核心 KeyStore 的同步注入接口，实际加解密不调用弃用的同步 API。默认只给设置页掩码，点击“显示”才返回 Key；加密不可用时返回 KeyStore 原因并用红字提示仅本次运行有效，不把 Key 明文写盘。退出先停止聊天请求，无条件启动 sessionStore.flush()（独立最多 2 秒），同时请求可见设置页保存（独立最多 1.5 秒），随后等待 keyStore.flush()（最多 1.5 秒）。设置页失败、超时或无响应都不会阻止会话写盘，总退出等待最多 3 秒，快路径提前结束。

自言自语默认开启，每 20～60 秒随机一句，下一轮再加本次显示的 3.2 秒；间隔下限 5 秒，空台词使用内置十句，只排除上一句。桌宠隐藏、拖动、聊天请求或聊天气泡占用时跳过并正常重排，30% 概率播 idle_talk。聊天发送时出现思考气泡，首段正文后以 200ms 节流更新前 60 字；完成显示 5 秒，并按情绪叠加 2 秒 happy/surprised/angry/sad 表情，平静保持当前动作，50% 概率播 chat_reply。所有音效使用设置中的音量。

气泡是独立的透明、无边框、置顶、不抢焦点且完全鼠标穿透的窗口，通过桌宠 move/resize 事件立即重新计算位置，无位置轮询。默认在桌宠窗口上方居中；空间不足时选空闲最多的一侧，文字使用 textContent、2px 深棕描边、150ms 淡入淡出。聊天、设置、气泡各有独立 preload，所有 IPC 校验窗口和主 frame，禁止页面导航与弹新窗口。

冒烟保留原有模型/行为截图及新增甩耳截图与全部检查，再注入 app/scripts/smoke-ui.ts 的假 ChatService 接口、内存会话和无密钥存储，不联网、不读写真实 Key/会话。脚本通过聊天输入框提交“乌萨奇，今天开心吗？”，假服务按片段返回 `[开心]呀哈！今天也要元气满满！`，经过情绪过滤，等待真实界面的打字机完成后截图。在 AR_GATE_ARTIFACT_DIR 额外生成 smoke-bubble.png（按实际窗口坐标合成桌宠与气泡）、smoke-chat.png、smoke-settings.png；JSON 增加 `"ui": ["bubble","chat","settings"]`，启动脚本要求这三项齐全。生产聊天、界面与核心均使用同一接线，假服务只在既有 --smoke 启动路径中注入。截图由门禁生成，执行者自测只跑 typecheck 与相关无 GUI 单测。

Windows 托盘位于任务栏右下角，可能收在折叠区；macOS 位于顶部菜单栏。气泡在两端均请求 floating 置顶级别，Windows 的原生置顶层级与 macOS 不同，截图不能确认跨应用的实际层叠效果或拖动延迟。

TODO(lead): Windows 实测气泡跟随与托盘。TODO(lead): 用个人测试 Key 走查测试连接、流式聊天、声音和表情联动；macOS/Windows 的实际拖动延迟交由主导实测。

## 安装包与打包后冒烟

普通用户参见 [安装与使用](../docs/guides/02-安装与使用.md)。安装包仅供个人使用，不上传发布。

```sh
npm --prefix app run dist:mac
npm --prefix app run dist:win
npm --prefix app run dist
```

输出到被 Git 忽略的 `app/release/`。electron-builder 固定为 26.18.1；macOS 使用 `identity: "-"` 做 ad-hoc 签名，`hardenedRuntime: false`，不公证。DMG 支持拖到 Applications。Windows NSIS 一键安装到当前用户，自动运行，创建桌面/开始菜单快捷方式，卸载保留用户数据；`signAndEditExecutable: false` 避免 macOS 需要 Wine 的 rcedit，所以应用 EXE 自身可能保留 Electron 默认图标（安装器配置 Usagi 图标，快捷方式可能沿用应用 EXE 默认图标）。不安装 Wine；若交叉构建仍失败，可在 Windows 上运行同一条 `dist:win` 命令。TODO(lead): Windows 实机安装验证。

打包前选择 `assets/models/usagi.vrm`；缺失时自动用 Seed-san 生成 `Usagi-0.1.0-mac-arm64-dev.dmg` / `Usagi-0.1.0-win-x64-dev.exe`，关于页显示“开发版（占位模型）”。正式模型若仍是改名后的 Seed-san 会拒绝构建。打包后核对模型 SHA-256 与所有 Ogg/manifest 的内容，不携带开发 assets 目录。不得直接绕过 dist 脚本运行 electron-builder 制作正式包。图标重生成方法见 [build/README.md](build/README.md)。

Electron 下载镜像在 `.npmrc` 与 `electron-builder.yml` 配为 npmmirror（本机直连很慢）。可在命令前设置 `ELECTRON_MIRROR=https://其他镜像/` 覆盖；npm 新版可能对 `electron_mirror` 自定义配置提示警告。

启动前在仓库根执行 `ar gui check electron --headless`（系统 ar 若是归档工具，使用上文的 AgentRouter 核心入口），通过后运行：

```sh
npm --prefix app run smoke:packaged -- /绝对路径/Usagi.app/Contents/MacOS/Usagi
```

也可直接运行该可执行文件加 `--smoke`。所有窗口离屏隐藏，不联网，不读写真实配置、Key 或聊天记录。模型与全部行为图、气泡/聊天/设置页共用开发冒烟逻辑；读取全部可用 Ogg 并在渲染进程实际解码一段，JSON 增加 `sounds: {directory, clips, decoded:true}`。模型或声音缺失时输出 `ok:false` 并退出 1。`AR_GATE_ARTIFACT_DIR` 可指定截图目录；开发模式默认写入 `app/smoke-out/`，打包后默认写入系统临时目录的 `usagi-smoke-进程号/`，不会向只读应用包写文件。

`npm run smoke` 的外层超时覆盖构建、首次 import Electron 时的同步下载及 Electron 冒烟，10 分钟后杀掉本次进程树、输出原因并退出 1。`smoke:packaged` 同样有此保护，应用内部的 60 秒渲染超时仍保留。

配置依据：[electron-builder macOS](https://www.electron.build/v26/docs/mac/)、[NSIS](https://www.electron.build/v26/docs/nsis/)。

本次 Apple Silicon 交叉构建 Windows：`makensis` 为 x86_64 可执行文件，在当前 arm64 主机启动时报 `Unknown system error -86`（架构兼容限制），未生成最终 NSIS EXE；未安装 Wine 或 Rosetta。可在 Windows x64 环境 `npm --prefix app ci` 后运行 `npm --prefix app run dist:win`。中间的 `win-unpacked/Usagi.exe` 不是安装包。


### Usagi 动作调校（013）

最终模型从 `assets/model/usagi.vrm` 原样复制至 `assets/models/usagi.vrm`，不修改模型、弹簧碰撞体或打包配置。平移幅度使用实测模型高度 H；角度为弧度。动作时长、掷骰链和 90 DIP/s 移动速度沿用原值。

| 动作 | 原参数 | Usagi 参数 |
| --- | --- | --- |
| 呼吸 | Chest 前后摆 ±0.018，3.5s | Chest ±0.035、Spine ±0.01225，3.5s |
| 待机 / 张望 | 身体 ±0.025，头 ±0.3 | 身体 ±0.025，头 ±0.12，3.5s |
| 走路 | 颠 0.018、侧摆 ±0.025；大腿 ±0.3、小腿 0.25、手臂 ±0.18 | 颠 0.028H、侧摆 ±0.1；大腿 ±0.16、小腿 0.12、手臂 ±0.025；仍每 45 DIP 一步 |
| 跳跃 / 开心 | 峰高 0.08；落地 Y 0.85、XZ 1.075 | 峰高 0.10H；落地 Y 0.85、XZ 1.08；双跳各飞行 350ms、落地挤压 220ms |
| 伸展 / 喊叫 | 手臂增量 ±2.1、前摆 -0.12；Chest -0.12 / +0.2 | 手臂增量 ±2.6（相对休息位净抬约 86°）、前摆 -0.06；Chest 后仰 -0.1；Hips 上移 0.025H |
| 甩耳 | 头水平 ±0.32 | 头水平 ±0.38、侧摆 ±0.18；1.2s 五周期，约 4.17Hz |
| 惊讶 | 后撤 0.09、头后仰 -0.18、Y 0.92 / XZ 0.95 | 后撤 0.04H；头后仰及缩放沿用 |
| 拖动 | 身体最多 ±15°；手臂 ±0.4 + 速度偏移 0.12；腿 ±0.07 / 0.08 | 身体最多 ±15°；手臂 ±0.16 + 速度偏移 0.05；腿 ±0.035 / 0.04 |
| 转身 / 转圈 | 转身 50°、转圈 2π | 保留；转圈 happy 改为 1 |
| 看鼠标 | Head 水平/竖直合成限幅 20°，且启用 VRM lookAt | 水平总量 ≤20°、竖直总量 ≤10°，Head/Neck 各承担一半，禁用 VRM lookAt 自动更新 |

拖动弹簧加速度系数 `0.00008 → 0.00012`，额外合力上限 `3 → 0.85`，按 `exp(-10Δt)` 衰减，释放立即恢复模型原 gravityDir/gravityPower；不更改原碰撞体。真实 VRM 的 CPU 检查覆盖甩头、拖动、释放 1.5s 后残余偏角 <2°及入画边界。

取景使用真实蒙皮顶点的动作并集，加长耳侧向 35°的余量。窗口宽仍为 240/320/440，高按动作范围自动计算；当前模型中号约 320×314。中性脚底以画面下方 5% 为锚，气泡随头顶在相机内的投影留白定位。模型更换或缩放窗口时重新计算。

点击、聊天、转圈、拖动统一使用互斥的二值情绪（happy/surprised/angry/sad/relaxed）。喊叫只设 angry，不叠 aa；整段拖动保持 surprised，优先于聊天情绪。平静不改变当前情绪。blink 输出二值，由模型自身的 overrideBlink 阻止；结束/打断时复位所有动作骨骼（含 Neck、Hips 位移）、缩放和表情。

TODO(lead): 门禁生成截图后核对五官贴片、耳朵碰撞与动作观感，并在 mac 实际拖动走查；本任务执行者不运行 GUI 冒烟，不以 CPU 偏角代替截图观感结论。

### 作息与问候

默认每 30 秒读取本机时钟与系统空闲秒数。早上 06:00–10:00 问好和问早饭，中午 11:30–13:00 问午饭，13:00–14:00 午睡，17:30–19:00 问晚饭；从 22:30 起每 30 分钟催睡一次，最多三次，00:00–06:00 睡觉。设置页“作息”可改时间、关闭整个调度或开启免打扰，开始时间等于结束时间表示关闭该时段。托盘和角色右键菜单也能切换免打扰。免打扰只抑制作息气泡和对应叫声，仍切换休息状态；关闭作息则不发送状态事件。午睡和睡觉期间暂停自言自语，角色抱枕打盹并停止眨眼。

用户空闲达到 60 秒，或桌宠隐藏、拖动、聊天/设置窗口打开、聊天气泡占用时，问候推迟到条件解除；错过整个时段不补。离开电脑至少 30 分钟后恢复活动会招呼，间隔至少两小时，午睡/睡觉期间不招呼。早上问好默认附带天气，可在作息中取消“早上说天气”。IP 自动定位按 ip.sb、geojs.io 顺序回退，再从 Open-Meteo 查询当天预报，无需账号；设置页显示缓存中的城市。定位缓存 24 小时，天气缓存 1 小时，同存于 userData/weather-cache.json，采用临时文件加 rename 原子写入。每次网络请求最多 5 秒，问好最多等 3 秒，失败或超时保留原句、不弹提示；启动前 5 分钟内进入早上时段会预取一次。使用 Electron net.fetch 跟随系统代理，关闭天气后不发请求。

早上、中午、晚饭的问话气泡可点击，10 秒后消失。点击会把括号里的中文原文作为 assistant 消息存入当前聊天记录，再打开聊天窗口，用户可直接回答；已有聊天窗口通过 chat:history-changed 重读记录并保留输入草稿，读取完成前暂时禁止发送。普通气泡仍穿透鼠标。未填 Key 时沿用聊天发送后的设置提示。

去重文件位于 userData/routine-state.json，采用临时文件加 rename 原子写入，损坏文件改名为 routine-state.broken-时间戳.json。逻辑日以本地 05:00 为界，跨越该边界的一段连续睡眠仍只说一次晚安，重启不会重复。主进程 Routine 注入 now、idleSeconds、blocked、weatherLine、state、show、sound；天气最多等 3 秒。preload 的 onRoutine 订阅 routine:state（nap、sleep、awake），角色渲染层据此切换抱枕打盹或醒来伸展。

本任务聚焦自测：`npm --prefix app test -- tests/routine.test.ts tests/ui.test.ts tests/ui-ipc.test.ts tests/config.test.ts tests/settings-renderer.test.ts tests/renderer-cursor.test.ts tests/chat/service.test.ts tests/chat/renderer.test.ts`。完整 typecheck/test/smoke 由门禁运行，设置截图沿用 `AR_GATE_ARTIFACT_DIR/smoke-settings.png`（默认 `app/smoke-out/smoke-settings.png`），新增作息卡片可滚动查看。


### 道具互动（024）

角色右键和托盘菜单的“玩耍”可立即播放“跳绳”（6.5 秒）或“吹泡泡”（5 秒），会取消当前移动/动作，拖动期间不接管。两项也进入随机动作池，每项权重 0.5，原四项各 1，只排除上次动作。跳绳六圈每圈 0.6 秒，绳过脚底与身体 0.06H 腾空顶点同相，最后落地后开心半秒，片段结束播放现有 click_shout。

道具实现位于 `src/renderer/props/`，`createProp(name)` 返回含 Group、apply、dispose 的句柄，`PropRig` 将 Pose.props 的位置、角度、缩放与透明度应用到模型局部空间；位置以模型高度 H 的分数表示。Usagi VRM 1 的正面为 +Z。道具使用限定单色 MeshBasicMaterial 和同几何体放大 3.5% 的深棕 BackSide 外壳。缺失道具立即释放几何与材质，隐藏、换模型和重新载入均清理。绳为两手柄间下垂 0.42H 的二次贝塞尔 U 弧，绕 X 轴转动，准备和收尾时停在脚下。泡泡棒从右手 (-0.328, 0.263, 0.015)H 斜伸到嘴角外侧圆环 (-0.108, 0.355, 0.32)H，泡泡从圆环向外向上漂浮，以缩放完成出生与消失，带同色高光。软枕为浅粉 #F6C9D3 圆角长方体，宽 0.46H（约身体宽度的 0.7）、高 0.184H（枕宽 0.4）、厚 0.10H，中心 (0, 0.06, 0.295)H，上沿低于嘴至少一个嘴高；头侧倾 10° 并使用 relaxed 闭眼表情。

| 事件 | 行为 |
| --- | --- |
| routine nap / sleep | 取消移动和随机动作，循环四秒抱枕打盹，relaxed 闭眼表情，呼吸幅度为待机两倍 |
| 打盹时点击 | surprised + click_surprise，正常状态机保持清醒 60 秒；到期仍是 nap/sleep 才重新打盹 |
| 打盹时拖动 | 道具隐藏并释放；放手后两秒重新打盹 |
| routine awake | 伸懒腰一次后回正常状态机；拖动中收到则等放手 |
| 休息时选择玩耍 | 立即播放并清醒 60 秒，随后按当前作息决定是否打盹 |
| 关闭作息 | 渲染层立即清除休息状态与枕头，恢复正常待机；忽略停用期间迟来的作息事件 |
| 重新开启作息 | 等主进程状态事件；主进程立即按当前时钟补发，仍在 nap/sleep 时段就恢复打盹 |

取景测量补充完整一圈绳旋转/弹跳、泡泡漂浮和抱枕点头姿态，并把道具实际包围盒与角色蒙皮顶点求并集，沿用四边 4% 边距和耳朵余量。

门禁冒烟新增 `smoke-jumpRope.png`、`smoke-blowBubbles.png`、`smoke-napPillow.png`，路径为 `AR_GATE_ARTIFACT_DIR`（默认 `app/smoke-out/`）。取样年龄分别为 2.575 秒（第三次腾空顶点，绳在脚下，避开脸）、1.65 秒（三个泡泡已分散上飘）、2 秒（抱枕点头）。JSON 的 `propOpaqueRatios` 记录 handles、rope、wand、bubble、pillow 的可见像素占比：在同一冻结姿态下逐类隐藏道具重绘，比较真实合成帧 RGBA，仅计原帧 alpha > 0 且有变化的像素；这样包含角色遮挡和半透明泡泡，不依赖色差猜测。每项必须 > 0，`propFraming` 要求三个动作道具的全部包围盒顶点都位于视口内。完整 test/smoke 由门禁执行。

只复查这三种道具截图：先 `ar gui check Electron --headless`，通过后执行 `npm --prefix app run build`，再 `node app/scripts/smoke.mjs --only=jumpRope,blowBubbles,napPillow`。使用同一隐藏离屏渲染入口，只捕获指定行为和初始模型图，不打开聊天、气泡、设置界面；聚焦报告仍要求每类道具有可见像素且包围盒在窗内。全量冒烟的十一种行为、界面和音效检查保持完整。

024 R2-1：跳绳上半圈按相位平滑插值到深 0.85H 的椭圆拱形，避开头部和耳朵；中间相位横向最多外展 3%，避开小手，绳端仍与握柄半径重叠。脚下相位、准备与收尾保持原有 0.42H 二次 U 弧，截图仍取 2.575 秒。形变复用顶点缓冲与材质，更新几何包围盒，现有 48 相位取景测量自动包含张开的绳弧。

R2-1 聚焦自测（从 `app/` 目录运行）：`npm exec -- vitest run tests/props.test.ts tests/usagi-model.test.ts tests/behavior-motion.test.ts`；类型检查为 `npm --prefix app run typecheck`（从仓库根目录）。真实 VRM 回归对整圈 48 相位检查绳管、描边的全部顶点及各 129 个中心线点，以射线奇偶和最近三角面距离检查身体、头、耳、手和尾巴。头顶通过 head 骨骼位置向上发射射线、读取真实蒙皮交点得到；上翻最高点必须高出头顶至少 0.06H。每相位是独立测试用例，沿用测试默认超时。另断言脚下帧的顶点数组与原始 U 弧逐项相等、形变不重建缓冲且资源正确释放。


### 进食互动（025）

右键与托盘的“喂食”位于“玩耍”上方，包含饭团（6 秒）、西瓜（5 秒）、冰淇淋（5.5 秒）。三项只由菜单触发，沿用取消当前待机/动作/移动、拖动不接管的规则。“偷吃被发现”（4.5 秒）只进随机池，权重 0.5，与跳绳、吹泡泡相同；原四项各 1，仍只排除上次动作。

饭团是白色圆角三角挤出体加海苔，三口后按 1→0.65→0.3→消失，落下四粒米；每口 0.25 秒 aa、0.9 秒 sad，两次轻压，末尾开心小跳并播 click_happy。西瓜有绿皮、窄白边、红瓤和五颗黑籽，弧边朝上，左右中间三口后压低瓤和籽。冰淇淋是饼干色圆锥和粉球，身体前探，四次 ih 各 0.4 秒；第三次结束（2.6 秒）滴落，0.8 秒后消失，缩头惊讶 0.6 秒后继续舔。食物独立飘在嘴前偏下，上臂只抬 0.2rad。四个动作全程停眨眼和聊天表情叠加，保持圆眼；首尾 neutral，道具按同一 PropRig 生命周期回收。

偷吃在原生 press 时保存动作年龄，显示同一时刻的身体姿态、surprised 和隐藏饼干；release 后的 click 正式进入 400ms caught 状态。此间身体不继续咀嚼或呼吸，两耳弹簧刚度暂加 5，结束精确恢复；到时再进入普通 surprised 点击反应并播 click_surprise。拖动会清掉偷吃标记，隐藏/reload 恢复弹簧并释放道具。

主进程在三餐问话气泡成功显示后记时；两分钟内菜单喂食才标记“好吃”。每次喂食分配递增 feedId，随 pet:activity 传入动作状态；渲染器实际播完发送带同一 feedId 的 pet:activity-done。经窗口/主 frame 验证、食物及 feedId 匹配当前请求且仍在三餐时段后，主进程才清除请求并调用 ui.bubble.showBubble('呀哈！（好吃！）', 3200)。连续选择同一种食物时，旧 feedId 回执不清除新请求；中断不发完成、重复/非可信回执被忽略；隐藏、免打扰和停用作息时也不冒泡。

四个动作的路径端点与姿态极值加入取景，包含米粒、滴落和小跳。新增 smoke-eatRiceball.png、smoke-eatWatermelon.png、smoke-iceCream.png、smoke-sneakSnack.png，位于 AR_GATE_ARTIFACT_DIR，默认 app/smoke-out/；取样年龄 0.72、0.72、2.3、1.6 秒，饭团、西瓜和偷吃使用 aa 咬食口型；冰淇淋保留第三次舔的 ih（小张口带舌）。报告要求 riceball、watermelon、iceCream、cookie 各自可见像素占比 > 0 且完整入画，沿用冻结合成帧逐类隐藏重绘的方法。全量冒烟扩为十五种行为，保留原有界面、音效和顶部透明断言。

聚焦复查：先运行 ar gui check Electron --headless，通过后 npm --prefix app run build，再 node app/scripts/smoke.mjs --only=eatRiceball,eatWatermelon,iceCream,sneakSnack。只生成初始模型与四个指定动作，不打开其他界面。执行者自测使用 typecheck 和相关无 GUI 测试；完整 test/smoke 交门禁。
