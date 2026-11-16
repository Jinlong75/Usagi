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
- 2026-11-16 用户："我建议是使用图生3d建模，而不是用文字生成……因为我要做的是完全还原的乌萨奇"；脸部选"方案a"（无五官，表情用贴片）。指南 `docs/guides/01-Tripo建模.md` 已给用户（主导自写，001 执行者记录已停用）。
- 2026-11-16 用户："t-pose图你来截取并生成，你可以用codex。整个项目由我参与的部分只有使用t-pose图在tripo上生成3d模型，其他都由你自动完成"；"参考桌宠项目你要做一个全量阅读……还有桌宠表情和与人互动的功能等"（调研见 docs/research/参考桌宠调研.md，功能分级 D7 在 target.md）。
- 2026-11-16 "用中文和我交流"。素材在 `Material/`（GIF 参考图 + `Usagi_Voice.mp4` 声音）。
- 目标、里程碑、已定方案 D1～D6 都在 `.agent-router/target.md`，拆任务前先读。

## 在跑与待处理任务

<!-- ar:handoff:tasks -->
（软件生成，`ar lead handoff --write` 更新；只改"主导判断"一列；处理完的失败任务删掉那一行）

公共目录：~/.config/agent-router
任务表生成于：2026-11-16T04:00:51Z

| 记录名 | 状态 | 启动方式 | 接回命令 | 主导判断 |
|---|---|---|---|---|
| 003-桌宠程序骨架 | 排队中 | 托管 | `ar wait 003-桌宠程序骨架` |  |
| 004-T-pose四视图生成-2 | 运行中 | 托管 | `ar wait 004-T-pose四视图生成-2` |  |
| 005-Usagi叫声切片 | 运行中 | 托管 | `ar wait 005-Usagi叫声切片` |  |
| 002-Blender网格清理与预览脚本 | 待验收 | — | `ar status 002-Blender网格清理与预览脚本` |  |
| 001-Tripo建模操作指南 | 已停止 | — | `ar status 001-Tripo建模操作指南` |  |
<!-- /ar:handoff:tasks -->

## 下一步

1. 主工作区被 004-T-pose四视图生成-2（杂务，非 worktree）占用期间**不要提交**。它结束后：验收四视图（对照原作看 sheet.png，第二轮意见在说明 004 里）；`ar accept 002-Blender网格清理与预览脚本`（已验收，只差主工作区干净）；提交 006、007 说明并派发（完成条件：两份都派出）。
2. 003 正在重跑门禁（主导补了 acceptFirstMouse 5f05d04），通过后看 smoke.png 再 accept；005 叫声切片在跑，完成后抽听几段（`afplay`）再 accept。
3. 四视图合格后交给用户去 Tripo（用户只做这一步），等 `Material/tripo/usagi_tripo.glb`；到了就跑 `pipeline/blender/cleanup_mesh.py`（命令见 pipeline/README.md），看预览，再写 M2 骨骼权重、M3 弹簧骨骼、M4 表情说明。
4. 006、007 合入后写 008：气泡与自言自语、聊天窗口、设置页（Key、模型 deepseek-flash / deepseek-v4-pro、测试连接）、IPC 接线、聊天情绪联动表情。完成条件：008 派出。
5. M6 安装包（electron-builder：mac dmg arm64、win nsis），Windows 包能否在 mac 上构建要先调研（`ar research "<问题>"`）。完成条件：门禁里 `npm run dist` 产出 .dmg，Windows 包有构建方案。

## 授权与边界

- 已授权：自己安装需要的工具（用户原话"其他的没有你可以自己安装"）；已装 Blender VRM 插件（extensions: vrm）。
- 要用户批准：推送、发布、花钱的操作（Tripo 积分由用户自己花）、`accept --force`。
- 不能碰：不公开发布任何 Usagi 素材或成品（版权角色，个人使用）；不提交 API key（DeepSeek key 只存在用户本机）。

## 新决定与教训

- D1～D6 见 `.agent-router/target.md`（自建 Electron 桌宠；用户手动 Tripo；模型无五官、表情用贴片 + UV 平移；Blender 全用命令行脚本；耳朵弹簧骨骼；目录约定）。
- 本机 `ar` 是系统的 /usr/bin/ar，AgentRouter 一律用 `node /Users/mac/.claude/skills/agent-router/core/ar.mjs`。
- **门禁不经过 shell**：verify 每条按空格拆开直接执行，`cd app && …` 会"0 秒假通过"，`&&`、`for`、管道都不能用。写成单条命令（`npm --prefix app test`）或主导维护的检查脚本（`sh docs/specs/checks/<编号>-check.sh`）。已反馈给 AgentRouter 开发会话。
- type: chore 的任务默认不开 worktree，在主工作区跑，期间主导任何提交都会进它的门禁范围；要并行就别用 chore（frontmatter 的 worktree 字段软件不认）。
- DeepSeek 当前模型 ID：deepseek-flash（默认）、deepseek-v4-pro；deepseek-v4-flash 是旧名。
- 全局名额常被别的项目占满时，`ar next --dispatch` 不派；直接 `ar dispatch <说明> --detach` 能进队列。

## 已知问题与证据

- Mate Engine 没有 macOS 版，只能在 Windows 上检查兼容（用户自己）。
- 本机没有 Homebrew、ffmpeg；Blender 在 `~/Applications/Blender.app`（不在 /Applications）；blender-mcp 只配置在 DeadZone 项目，本项目不用它。
