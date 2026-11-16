---
id: 016
title: Windows 上动起来掉帧、切换焦点后点不了拖不动：查因并修，加帧率诊断
type: fix
worker: auto
effort: high
allowed_paths:
  - app/src/main/**
  - app/src/renderer/index.ts
  - app/src/renderer/behaviors/look.ts
  - app/src/shared/**
  - app/src/preload/**
  - app/tests/*.test.ts
  - app/README.md
  - docs/guides/02-安装与使用.md
verify:
  - npm --prefix app ci
  - npm --prefix app run typecheck
  - npm --prefix app test
  - npm --prefix app run smoke
gate_artifacts:
  - npm --prefix app run smoke
expect_commit: true
verify_timeout_min: 25
review: true
---

## 目标

用户 2026-11-16 在 Windows 安装版上实测，原话：
- "桌宠的帧率较低……行走不是卡顿，是感觉帧率较低不够流畅，会有略微的掉帧感"；"除了行走以外，跟随鼠标还有其他表情都会有点卡顿，只有静止挂机不会卡顿"。
- "切换了鼠标窗口焦点之后无法点击和拉动"。

本机是 Mac，没有 Windows 可测。任务是：读代码找出最可能的原因，按 Electron/Chromium 在 Windows 上的已知行为修好；同时加一个用户能打开的**帧率诊断**，让用户在 Windows 上把数字报回来。

## 已知线索（先核实再用，不对就说明）

1. 渲染：`app/src/renderer/index.ts` 用 `requestAnimationFrame` 驱动 three，`renderer.setPixelRatio(window.devicePixelRatio)`（Windows 常见 150%/175% 缩放 → 像素量 2.25～3 倍）；透明窗口在 Windows 上每帧要整窗合成，开销大。Chromium 在 Windows 上会按"原生窗口遮挡计算"把它认为被遮住的窗口降频（`CalculateNativeWinOcclusion`），透明置顶小窗容易被误判。
2. 走路：`app/src/main/motion.ts` 用 `setInterval(…, 1000/60)` 调 `setPosition`；Windows 默认计时器精度约 15.6ms，16.7ms 的间隔实际变成 15/31ms 交替，步子不均匀。
3. 看鼠标：`app/src/main/index.ts` 的 `cursorTimer` 同样 `setInterval(1000/60)`（还有 50ms 节流）轮询光标发给渲染进程，渲染端若直接用最新值，转头会一顿一顿。
4. 点击：`applyHit()` 用 `setIgnoreMouseEvents(!hit && !gesture, { forward: true })` 做透明区域穿透；Windows 上窗口失去焦点/别的程序激活后，`forward` 的 mousemove 转发可能停止，渲染端收不到移动事件、`hit` 不再更新，窗口一直处于穿透状态 → 点不到、拖不动。主进程已经在轮询光标，可以改为由主进程轮询结果驱动命中判断，不依赖转发的 DOM 事件。

## 要求

- 帧率：渲染像素比在 win32 上设上限（建议 `Math.min(devicePixelRatio, 1.25)`，常量写清理由），确认 `antialias` 设置合理；win32 上关闭原生遮挡降频（`app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')` 一类，若已有 disable-features 要合并），以及 `disable-renderer-backgrounding`/`backgroundThrottling: false` 在正式窗口上生效（核对 `app/src/main/index.ts` 289 行一带只在 smoke 还是全部）。
- 走路与光标轮询：不再依赖 `setInterval` 的间隔精度——每个 tick 按真实经过时间计算位置（走路已按时间插值，核对）；光标与命中轮询用自校正的 `setTimeout` 循环或更高频率；渲染端对看向目标做逐帧平滑插值（不是直接跳到最新值），参数写成常量。
- 焦点后点不了：命中判断不依赖 `forward` 转发的 DOM mousemove；用主进程轮询到的光标位置（已发 `pet:cursor`）在渲染端算命中（已有 `alphaHit`），再回传主进程 `applyHit`。另外在窗口 `blur`/`focus`、其它窗口激活后重新调用一次 `setIgnoreMouseEvents`。拖动中途失焦也不能卡在拖动状态。
- 诊断：托盘/右键菜单加"显示帧率"开关（默认关，存配置），开启时角色窗口左上角显示最近 1 秒平均 FPS 与最长帧间隔（ms），并每 10 秒把同样数字写一行到用户数据目录 `logs/fps.log`；`docs/guides/02-安装与使用.md` 加一小节"觉得卡时怎么报数字"。
- 只在 win32 生效的分支，用 `process.platform` 判断并能被单测注入；mac 行为不变（冒烟截图应与改前一致）。
- 不做：改模型、`app/src/renderer/motion/**`（主导与 017 在改）、打包配置。做不通就停下汇报。

## 验收标准

- 门禁通过；冒烟截图与改前一致。
- 新单测：命中判断由光标轮询驱动（模拟"没有 DOM mousemove，只有 pet:cursor"时仍能从穿透切回可点）；`blur` 后重新 `setIgnoreMouseEvents`；自校正定时循环在模拟 15.6ms 粒度时位置按时间均匀；平滑插值收敛；像素比上限只在 win32 生效。
- 汇报给出一份**用户 Windows 复测清单**（打开"显示帧率"、走路/看鼠标/表情各看几秒、切到别的窗口再回来点和拖），写进 `docs/guides/02-安装与使用.md` 那一节。

## 自测

`npm --prefix app run typecheck`、`npm --prefix app test`。冒烟由门禁跑。

## 受影响的已有测试

开工先跑 `grep -rn -E "setIgnoreMouseEvents|applyHit|cursorTimer|pet:cursor|setPixelRatio|WindowMotion|backgroundThrottling" app/tests app/src`，把完整结果贴进汇报，据此改测试。改写断言在 `## 断言改写` 逐条写"原 → 新 → 原因"。

## 反向实验

只写纯文字，**不要写 ```json exec 代码块**（AgentRouter 缺陷 226 未修）。

## 汇报要回答的问题

1. 四条线索各自是否成立、证据（代码行）。
2. 做了哪些改动、各自针对哪个症状。
3. 用户 Windows 复测清单。
