# 接续工作入口

更新时间：2026-11-16 09:40，主导 Claude Code（Opus 5.5）。本文件覆盖改写，按需写全但不无限增加：150 行以内最好，最多 250 行；历史移到 docs/autonomy/ 下的归档文件，不追加流水账。带 `ar:handoff` 标记的段落由 `ar lead handoff --write` 生成，其余都由主导写，软件不动；写完运行 `ar lead handoff check`。

## 一句话

接回 001～003 三个托管任务并验收；用户把 Tripo 模型放到 `Material/tripo/usagi_tripo.glb` 后，跑清理脚本并写 M2（骨骼/权重/VRM）的任务说明。

## 开工必做

<!-- ar:handoff:startup -->
1. 读本文件（每条都要遵守）、`AGENTS.md`、`docs/roles/lead.md`。
2. 操作说明：Claude Code 加载 `agent-router`、`lead-workflow`、`lead-practices` 三个技能；其他工具运行 `ar lead guide`。经验清单：`ar lead practices`。
3. 运行 `ar lead brief` 看开工包，读完按最后一行运行 `ar lead ack <确认码>`。
4. 先核对"在跑与待处理任务"，接回在跑的任务，不重复派发；运行 `ar next`，能派的先派满。

本机核心命令：`node "$HOME/.claude/skills/agent-router/core/ar.mjs"`（这台机器上的 `ar` 不是 AgentRouter，上面写的 `ar` 都换成它）。
<!-- /ar:handoff:startup -->

## 用户总体要求

- 2026-11-16 需求原文见 `usagi3Dpet.md`：Tripo 生成 T-pose 多视图 → 智能拓扑网格；Blender 合并重合点、删多余网格；VRM 骨骼；权重修复；弹簧骨骼和碰撞体；表情；桌宠软件；"最后把做好的角色导入 Mate Engine"；"要求桌宠能一键安装，并且可以接 deepseek 的 api"；参考桌宠 https://github.com/MerZlin/dsh-pet-indesktop 。
- 2026-11-16 用户选择：自己做跨平台桌宠（Mac/Windows），Mate Engine 只做 Windows 兼容；Tripo 由用户自己在网页上生成；"这个mac有blender并且安装了mcp工具，其他的没有你可以自己安装"。
- 2026-11-16 "用中文和我交流"。素材在 `Material/`（GIF 参考图 + `Usagi_Voice.mp4` 声音）。
- 目标、里程碑、已定方案 D1～D6 都在 `.agent-router/target.md`，拆任务前先读。

## 在跑与待处理任务

<!-- ar:handoff:tasks -->
（软件生成，`ar lead handoff --write` 更新；只改"主导判断"一列；处理完的失败任务删掉那一行）

公共目录：~/.config/agent-router
任务表生成于：2026-11-16T02:26:06Z

| 记录名 | 状态 | 启动方式 | 接回命令 | 主导判断 |
|---|---|---|---|---|
| 001-Tripo建模操作指南 | 排队中 | 托管 | `ar wait 001-Tripo建模操作指南` |  |
| 002-Blender网格清理与预览脚本 | 排队中 | 托管 | `ar wait 002-Blender网格清理与预览脚本` |  |
| 003-桌宠程序骨架 | 排队中 | 托管 | `ar wait 003-桌宠程序骨架` |  |
<!-- /ar:handoff:tasks -->

## 下一步

1. 等 001/002/003（托管）结束：`ar wait <记录名>` 放后台；逐个验收（status → gate.json → review show/confirm → report.md → diff），看 002 的预览图和 003 的 smoke.png。
2. 001 合入后把 `docs/guides/01-Tripo建模.md` 的要点转告用户，请用户按指南生成模型放到 `Material/tripo/`。
3. 003 合入后写 004（DeepSeek 聊天：设置里填 key、safeStorage 加密保存、气泡对话、Usagi 人设，depends 003）和 005（Usagi_Voice.mp4 切音效；本机没有 ffmpeg，任务里用 npm 的 ffmpeg-static 或 Blender 不行就让执行者装 imageio-ffmpeg 到临时环境，需要先定）。完成条件：两份说明提交并 `ar dispatch <说明> --detach` 派出。
4. 模型到了以后：跑 `pipeline/blender/cleanup_mesh.py` 出 `assets/cleaned/`，看预览图；再写 M2 骨骼权重、M3 弹簧骨骼、M4 表情（D3 贴片 + UV 平移）的说明。
5. M6 安装包（electron-builder：mac dmg arm64、win nsis），Windows 包能否在 mac 上构建要先调研（`ar research "<问题>"`）。完成条件：门禁里 `npm run dist` 产出 .dmg，Windows 包有构建方案。

## 授权与边界

- 已授权：自己安装需要的工具（用户原话"其他的没有你可以自己安装"）；已装 Blender VRM 插件（extensions: vrm）。
- 要用户批准：推送、发布、花钱的操作（Tripo 积分由用户自己花）、`accept --force`。
- 不能碰：不公开发布任何 Usagi 素材或成品（版权角色，个人使用）；不提交 API key（DeepSeek key 只存在用户本机）。

## 新决定与教训

- D1～D6 见 `.agent-router/target.md`（自建 Electron 桌宠；用户手动 Tripo；模型无五官、表情用贴片 + UV 平移；Blender 全用命令行脚本；耳朵弹簧骨骼；目录约定）。
- 本机 `ar` 是系统的 /usr/bin/ar，AgentRouter 一律用 `node /Users/mac/.claude/skills/agent-router/core/ar.mjs`。
- 全局名额常被别的项目占满时，`ar next --dispatch` 不派；直接 `ar dispatch <说明> --detach` 能进队列。

## 已知问题与证据

- Mate Engine 没有 macOS 版，只能在 Windows 上检查兼容（用户自己）。
- 本机没有 Homebrew、ffmpeg；Blender 在 `~/Applications/Blender.app`（不在 /Applications）；blender-mcp 只配置在 DeadZone 项目，本项目不用它。
