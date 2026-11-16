---
id: 013
title: 合流：桌宠换上 Usagi 模型，按 Q 版身材调校动作、取景、耳朵弹簧与表情联动
type: code
worker: auto
depends: ["011", "012"]
effort: high
allowed_paths:
  - assets/models/**
  - app/src/**
  - app/scripts/**
  - app/tests/*.test.ts
  - app/README.md
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

把 011 产出的最终角色 `assets/model/usagi.vrm` 放到桌宠程序默认加载的位置 `assets/models/usagi.vrm`，并按 Usagi 的身材（圆团身体、长耳朵、极短的手脚）调校桌宠：动作幅度、取景、看鼠标、耳朵弹簧受力、点击反应与聊天情绪的表情映射，让它在桌面上自然好看。冒烟截图全部换成 Usagi。

## 范围 / 不做什么

- 做：拷贝模型、调动作参数与取景、表情映射、弹簧受力系数、冒烟断言更新、单测更新。
- 不做：改模型本身（`assets/model/**`、`pipeline/**`；发现模型问题写 `TODO(lead)`）、改打包配置（012 已做）、新功能。

## 参照

- 模型：`assets/model/usagi.vrm`（011 产物）。骨骼：标准人形（Hips/Spine/Chest/Neck/Head、极短的 UpperArm/LowerArm/Hand 与 UpperLeg/LowerLeg/Foot）、耳朵 `EarL_1..4`/`EarR_1..4`（弹簧）、`Tail`（弹簧）；没有眼球骨骼。表情：`blink`、`blinkLeft`、`blinkRight`、`happy`、`angry`、`sad`、`relaxed`、`surprised`、`aa/ih/ou/ee/oh`、`neutral`，全部是二值 UV 切换（`isBinary`），`happy/angry/sad/relaxed/surprised` 会阻止 blink 和口型。010 的姿态预览：`.agent-runs/010-骨骼权重弹簧VRM导出/attempts/2/artifacts/verify-2/preview_rig/`；011 的表情预览在其任务记录里。
- 桌宠程序：`app/src/renderer/behavior/`、`motion/`（006 的程序化动作，原本按人形占位模型调的幅度）、`app/src/renderer/index.ts`（按动作范围自动取景）、`app/src/main/`（008 的气泡、聊天联动）。
- 参数来源：`docs/research/参考桌宠调研.md` B 节；目标 `.agent-router/target.md` D7。

## 要求

1. **模型**：把 `assets/model/usagi.vrm` 复制为 `assets/models/usagi.vrm`（开发与打包都默认加载它）。冒烟默认用它；Seed-san 只在显式指定时用。
2. **动作幅度**（Usagi 手脚极短、身体是圆团）：
   - 呼吸：用 Chest/Spine 的轻微缩放感（或小角度前后摆）代替人形的胸部起伏，幅度让圆团肉眼可见地"鼓一鼓"。
   - 走路：Usagi 走路主要是**整个身体左右摇摆 + 上下颠**，短腿小幅交替；手臂几乎不摆。
   - 伸懒腰 / 举手（shout、stretch）：短手臂抬到接近竖直即可，身体同时向上拉伸一点（Hips 上移 + Chest 后仰）。
   - 蹦跳、开心：弹跳高度按模型高度的 8%～12%，落地挤压（Y 缩 0.85、XZ 涨 1.08）。
   - 甩耳朵：头左右快速摆，让耳朵弹簧甩起来——必须在截图里能看到耳朵明显偏离静止位置。
   - 拖动：身体随速度方向倾斜，耳朵靠弹簧受力甩向运动反方向；四肢下垂幅度按短手脚调小。
   - 所有动作结束后骨骼回中性，不残留。
3. **看鼠标**：Usagi 没有眼球骨骼，用 Head 骨小角度转动（水平 ≤ 20°、竖直 ≤ 10°），Neck 分担一半；不要用 VRM lookAt 的眼球模式。
4. **耳朵弹簧受力**：重新标定拖动时的额外受力系数，让拖动时耳朵明显甩动、松手后 1.5 秒内回稳；耳朵不能穿进头里（头部碰撞体已在模型里）。
5. **表情映射**（二值表情，不要用中间权重）：
   - 点击 happy 反应 → `happy`；surprised → `surprised`；shout → `angry`（模型里的 angry 嘴型就是大喊）；不要同时设 `aa`（会被阻止，也没必要）。
   - 聊天情绪：开心→`happy`、惊讶→`surprised`、生气→`angry`、难过→`sad`、平静→不变。
   - 眨眼仍用 `blink`，在其他表情激活期间自动被模型阻止，不要额外处理。
   - 拖动时 `surprised`（二值，整段拖动期间保持）。
   - 设表情时把其它情绪表情清零，避免两个情绪同时为 1 导致 UV 偏移相加串格。
6. **取景**：窗口宽高比按 Usagi 的动作范围（含耳朵甩动）重新计算；中号窗口宽 320、高按比例；脚底在画面下方 5%；气泡位置跟着新的头顶高度。
7. **冒烟**：用 Usagi 跑完原有全部步骤（idle、walk、happy、surprised、shout、stretch、drag、bubble、chat、settings），新增两项检查：
   - `ear-shake` 截图与 `idle` 截图在耳朵区域（画面上 30%）的像素差异比例 > 3%（证明弹簧在动）；
   - `happy` 截图脸部区域与 `idle` 不同（证明表情生效）。
   截图仍写到 `AR_GATE_ARTIFACT_DIR`。冒烟 JSON 的 `model` 字段应指向 `assets/models/usagi.vrm`。
8. 单测：表情映射（含清零其它情绪）、看鼠标角度限幅、动作回中性、取景计算，按新参数更新。

## 验收标准

- verify 四条通过；主导逐张看冒烟截图：Usagi 完整入画、五官在脸上、各动作自然、耳朵甩动可见、表情正确。
- 主导在 mac 上 `npm --prefix app run dev` 实际看一会儿。

## 自测

`npm --prefix app run typecheck`、`npm --prefix app test`；冒烟交给门禁。

## 受影响的已有测试

派发前主导用 `ar spec impact` 复核。预计会改动 `app/tests/behavior-motion.test.ts`（幅度参数）、`app/tests/behavior-machine.test.ts`（表情映射）、`app/tests/smoke-process.test.ts`（新增检查项与 model 字段），都在允许范围内；改写按 `docs/roles/worker.md` 写 `## 断言改写`。

## 换环境

无。

## 汇报要回答的问题

1. 每个动作调整前后的关键参数（幅度、角度、频率）对照表。
2. 耳朵弹簧受力系数最终取值，以及 ear-shake 与 drag 截图里耳朵偏离的大致角度。
3. 你看截图觉得最不自然的一个动作是哪个。
