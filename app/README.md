# Usagi 桌宠程序骨架

开发用 Seed-san（VRM 1.0），Electron 主进程管理透明窗口、托盘与配置，three + three-vrm 渲染模型。包含程序化行为、叫声音效、气泡、自言自语、DeepSeek 聊天与设置；安装包由后续任务接入。

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

`smoke` 构建后用 `--smoke` 启动隐藏窗口，设置 `offscreen: true`，不创建托盘、不读写应用配置、不轮询鼠标，始终加载仓库里的占位模型。模型加载并渲染 60 帧后，依次播放待机、原地步态、开心、惊讶、喊叫、伸懒腰、拖动姿态（走路不实际移动窗口）。每段在代表时刻定格，开心在跳跃最高点（175ms）截图，通过 `capturePage({stayHidden:true})` 获取带 alpha 的 PNG，检查非零 alpha 的占比在 2%～95%，并检查 VRM 版本为 1。开心最高点、喊叫和伸懒腰截图最上方两行 alpha 必须全为 0，模型触顶会打印 `ok:false`。60 秒超时或加载、截图失败均打印 `ok:false` JSON 并退出 1。

输出为 `AR_GATE_ARTIFACT_DIR/smoke.png` 以及 `smoke-idle.png`、`smoke-walk.png`、`smoke-happy.png`、`smoke-surprised.png`、`smoke-shout.png`、`smoke-stretch.png`、`smoke-drag.png`；未指定目录时写到 `app/smoke-out/`。标准输出 JSON 包含实际模型路径、`opaqueRatio`、`vrmVersion`、`expressions`、`behaviors: ["idle","walk","happy","surprised","shout","stretch","drag"]` 与 `behaviorOpaqueRatios`（每种行为的不透明像素占比），以及 `behaviorTopTransparent: {happy:true, shout:true, stretch:true}`。八张图均检查 2%～95%，启动脚本还检查七种行为、七个占比和三种顶部透明检查齐全。单张拖动截图不能判断头发晃动幅度，仍需主导走查。首次运行时 Electron npm 包可能按其官方机制下载当前平台二进制；无需额外安装命令。

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

大小固定为 240×315、320×420、440×578。窗口恢复时须完整落在任一当前屏幕工作区，否则回到主屏右下角、距边缘 40px。配置损坏时原文件改名为 `config.broken-<时间>.json`，使用默认值；写入采用临时文件加 rename。配置 I/O 失败会记录日志，应用继续使用内存配置。

模型路径顺序：有效的 `modelPath` → `assets/models/usagi.vrm` → `assets/placeholder/Seed-san.vrm`；相对路径以仓库根目录解析，可指定绝对路径。VRM 以二进制 IPC 传给隔离的渲染进程，当前支持自包含 VRM（贴图等资源内嵌）。加载失败显示“模型加载失败：原因”并记录日志，可从托盘重新加载。Seed-san 仅用于开发，不应随安装包分发，模型许可和来源见项目目标文档。

## 平台差异与实现

macOS 隐藏 Dock 图标并调用 `setVisibleOnAllWorkspaces(true)`；Windows 设置 `skipTaskbar: true`。两个平台均使用 `setAlwaysOnTop(value, 'floating')`，透明无边框窗口关闭阴影，通过 `setIgnoreMouseEvents(..., {forward:true})` 控制穿透。Windows 和 macOS 桌面交互仍需主导实际走查；无头截图只能验证渲染与透明背景。

主进程在 `src/main/`，preload 在 `src/preload/`，渲染器在 `src/renderer/`，基础待机在 `src/renderer/behaviors/`，状态机/省电/音频在 `src/renderer/behavior/`，动作采样/骨骼复位/弹簧受力在 `src/renderer/motion/`。TypeScript strict；`contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`。preload 暴露模型/受限音效二进制加载、窗口信息、移动/取消、光标/拖动/点击/完成通知、命中、重载、冒烟姿态与渲染结果接口；主进程只接收本窗口主 frame 的 IPC，阻止页面导航与新窗口。

依赖：Electron、three、three-vrm 为运行功能所需；Vite 负责渲染器构建，esbuild 负责把主进程/preload 编译为 Electron 可加载的 CJS，TypeScript/类型包用于静态检查，Vitest 用于纯逻辑测试。依赖解析锁定在 `package-lock.json`。

待主导处理：打包后的模型路径，以及把临时托盘图标换成 Usagi 图标；对应代码已留 `TODO(lead)`。

参考官方示例：[three-vrm 加载与优化](https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm/examples/basic.html)、[Electron 离屏渲染](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering/)、[BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window/)。

## 行为、走动与音效

待机或随机动作结束后按 30% 待机 / 10% 转向 / 40% 随机动作 / 20% 移动掷骰。待机/转向经过屏幕中线 ±7% 滞回闸门，动作池只排除上一个；移动池拒绝后退回随机动作，空池退回待机。默认正面，走路前转到 ±50°，完成后转回正面。随机动作包括两次小跳、伸懒腰、甩头带动耳朵和开心转圈，动作结束或接管时复位。

移动仅沿当前 Y 高度，距工作区边缘 20px，单次 60～240px，平均速度固定 90 DIP/s。原生窗口使用 60Hz 三次 ease-in-out 插值；步态每 45 DIP 一步（平均 2 步/秒），相位取同一缓动函数的累计距离，因此加速/减速时步频同步变化。点击按下或拖动接管立即作废原路线，从当前位置重新规划。移动结束沿用原有配置保存。移动与拖动均不调用 `focus()`、`show()` 或 `moveTop()`；窗口 `focusable:false`，显式显示用 `showInactive()`。

渲染进程先把终点裁到工作区可达范围，再以真实距离计算时长与步数；例如宽 1000px 的工作区、宽 320px 的窗口位于 x=750 时，最短计划终点裁到 x=660，真实距离 90px、时长 1 秒、2 步。主进程再次安全裁剪时按距离比例重算时长，完成通知包含 `{ok:true, distance}`；拒绝请求则回 `{ok:false, reason}`，状态机立即回 idle。计划时长 + 1 秒仍未收到完成通知，会回 idle 并取消原生移动。

拖动姿态最大倾斜 15°，四肢下垂，`surprised` 权重 0.4。额外弹簧力系数为 `0.00008`（屏幕 DIP/s² 转模型力），总额外力限幅 3，以 `exp(-10t)` 衰减；恢复后精确还原每个 joint 原本的 gravityDir/gravityPower。Seed-san 有 28 个 spring joint，点击所需 `happy/surprised/aa/angry` 预设均存在（来自 VRM 元数据）；视觉自然度和晃动幅度由门禁图片与实际走查判断。

主进程从仓库根 `assets/sounds/usagi/manifest.json` 按 uses 筛选非空 file 且 quality 为 clean/bgm 的片段，拒绝越界路径（包括符号链接），只通过受信 IPC 发送字节。Web Audio 音量默认 0.7，可在设置调整；新声打断旧声，异步读盘/解码结果也受同一代号控制；确认点击后才播点击声，拖动开始以 30% 概率播 drag 声。缺 manifest/某类声音则静默跳过，相同原因只记一次日志；当前 manifest 未分配 drag 素材，实际拖动不会出声。

托盘隐藏/显示时主进程显式发送 `pet:visibility {visible}`，隐藏立即取消 requestAnimationFrame、暂停状态机计时与掷骰，显示先回 idle 并重新计时再恢复渲染；不依赖 `backgroundThrottling:false` 下仍可能为 visible 的 `document.visibilityState`。连续 8 秒无动作/移动/点击/拖动时限制 30fps，被动呼吸、眨眼、看鼠标不重置闲置时间，活动立即恢复满帧。模型加载后、首次绘制前，依次采样喊叫、开心跳跃最高点、伸懒腰、甩头两侧、转圈每 45°、走路最高点（正面与左右转向）以及左右最大拖动倾斜。每个姿态先更新 VRM 和骨骼世界矩阵，再用 `Box3.setFromObject(scene, true)` 读取包含蒙皮变形的顶点范围并求并集，四边各加并集尺寸 4% 边距。中性脚底保持距画面底部 5%；动作向下超出时按需整体上移角色。采样后恢复中性姿态和弹簧状态，用户看不到采样过程。窗口缩放复用该范围，避免随当前动作改变取景。

TODO(lead): 打包后的音效路径。TODO(lead): Windows 实测走动流畅度（Windows 高频 setPosition 可能掉帧）。TODO(lead): mac 实际拖动复核弹簧受力系数和耳朵/头发晃动幅度。


## 聊天、设置与气泡

从右键或托盘打开“和乌萨奇聊天”，Enter 发送，Shift+Enter 换行，流式回复时按“停止”可中断。关闭聊天窗只隐藏，保留本次运行的位置与消息；下次启动打开时从本机单会话记录恢复。“清空对话”有二次确认。消息只作为纯文本显示，不解释 HTML 或 Markdown。

设置包含 AI 对话、桌宠、关于三组，点击“保存”或关闭设置窗都会保存并立即生效。首次填写 DeepSeek Key 后可“测试连接”；可选择模型、温度、深度思考和高级 API 地址。API Key 不写入 config.json，主进程在 app.whenReady() 后用 Electron 45 的 isAsyncEncryptionAvailable/encryptStringAsync/decryptStringAsync，接线层 AsyncKeyStore 适配核心 KeyStore 的同步注入接口，实际加解密不调用弃用的同步 API。默认只给设置页掩码，点击“显示”才返回 Key；加密不可用时返回 KeyStore 原因并用红字提示仅本次运行有效，不把 Key 明文写盘。退出会先请求可见设置页保存，再等待 sessionStore/keyStore.flush()，整个等待最多 2 秒。

自言自语默认开启，每 20～60 秒随机一句，下一轮再加本次显示的 3.2 秒；间隔下限 5 秒，空台词使用内置十句，只排除上一句。桌宠隐藏、拖动、聊天请求或聊天气泡占用时跳过并正常重排，30% 概率播 idle_talk。聊天发送时出现思考气泡，首段正文后以 200ms 节流更新前 60 字；完成显示 5 秒，并按情绪叠加 2 秒 happy/surprised/angry/sad 表情，平静保持当前动作，50% 概率播 chat_reply。所有音效使用设置中的音量。

气泡是独立的透明、无边框、置顶、不抢焦点且完全鼠标穿透的窗口，通过桌宠 move/resize 事件立即重新计算位置，无位置轮询。默认在桌宠窗口上方居中；空间不足时选空闲最多的一侧，文字使用 textContent、2px 深棕描边、150ms 淡入淡出。聊天、设置、气泡各有独立 preload，所有 IPC 校验窗口和主 frame，禁止页面导航与弹新窗口。

冒烟保留原八张模型/行为截图与全部检查，再注入 app/scripts/smoke-ui.ts 的假 ChatService 接口、内存会话和无密钥存储，不联网、不读写真实 Key/会话。脚本通过聊天输入框提交“乌萨奇，今天开心吗？”，假服务按片段返回 `[开心]呀哈！今天也要元气满满！`，经过情绪过滤，等待真实界面的打字机完成后截图。在 AR_GATE_ARTIFACT_DIR 额外生成 smoke-bubble.png（按实际窗口坐标合成桌宠与气泡）、smoke-chat.png、smoke-settings.png；JSON 增加 `"ui": ["bubble","chat","settings"]`，启动脚本要求这三项齐全。生产聊天、界面与核心均使用同一接线，假服务只在既有 --smoke 启动路径中注入。截图由门禁生成，执行者自测只跑 typecheck 与相关无 GUI 单测。

Windows 托盘位于任务栏右下角，可能收在折叠区；macOS 位于顶部菜单栏。气泡在两端均请求 floating 置顶级别，Windows 的原生置顶层级与 macOS 不同，截图不能确认跨应用的实际层叠效果或拖动延迟。

TODO(lead): Windows 实测气泡跟随与托盘。TODO(lead): 用个人测试 Key 走查测试连接、流式聊天、声音和表情联动；macOS/Windows 的实际拖动延迟交由主导实测。
