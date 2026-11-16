# 接续工作入口

更新时间：2026-11-16 13:25，主导 Claude Code（Opus 5.5）。本文件覆盖改写，按需写全但不无限增加：150 行以内最好，最多 250 行；历史移到 docs/autonomy/ 下的归档文件，不追加流水账。带 `ar:handoff` 标记的段落由 `ar lead handoff --write` 生成，其余都由主导写，软件不动；写完运行 `ar lead handoff check`。

## 一句话

接回 006（第 3 次，等门禁）与 009（第 2 次）验收；006+007 合入后派 008；009 合入后写 010 骨骼权重弹簧 VRM、011 五官贴片表情；最后换模型、调动作、打包。

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
- 2026-11-16 用户自己用 ChatGPT 参考图在 Tripo 生成了 `Material/tripo/usagi_3d.glb`（没用我们的四视图）；"腰线不用平滑，保留"（D8）。
- 2026-11-16 "用中文和我交流"。素材在 `Material/`（GIF 参考图 + `Usagi_Voice.mp4` 声音）。
- 目标、里程碑、已定方案 D1～D6 都在 `.agent-router/target.md`，拆任务前先读。

## 在跑与待处理任务

<!-- ar:handoff:tasks -->
（软件生成，`ar lead handoff --write` 更新；只改"主导判断"一列；处理完的失败任务删掉那一行）

公共目录：~/.config/agent-router
任务表生成于：2026-11-16T06:23:02Z

| 记录名 | 状态 | 启动方式 | 接回命令 | 主导判断 |
|---|---|---|---|---|
| 006-行为状态机与互动 | 运行中 | 托管 | `ar wait 006-行为状态机与互动` |  |
| 009-Usagi模型整备 | 运行中 | 托管 | `ar wait 009-Usagi模型整备` |  |
| 001-Tripo建模操作指南 | 已停止 | — | `ar status 001-Tripo建模操作指南` |  |
| 005-Usagi叫声切片 | 失败 | — | `ar status 005-Usagi叫声切片` |  |
<!-- /ar:handoff:tasks -->

## 下一步

1. **006-行为状态机与互动**（第 3 次尝试，执行者已提交 9b854b3，排门禁名额）：通过后看 attempts/3 的冒烟截图（shout/happy/stretch 顶部不能被裁），review show 逐条 confirm，accept（要 `--ack external:<摘要>`，摘要在最新 attempts/N/external-audit.json；先核对 non-concurrent 项）。这是第 3 次，再失败就主导自己接手。
2. **009-Usagi模型整备**（第 2 次，--rebase 重试）：主导已修检查脚本（6bb54fb，merge_vertices）；要求底模保留腰线（--smooth-waist 默认 off）。通过后看 assets/model/preview/ 与 preview_landmarks_*.png，核对：正面朝 -Y、脸部干净、耳内粉色、尾巴白、关键点位置。完成条件：`ar accept 009-Usagi模型整备` 成功。
3. 006 合入后派 008（`ar dispatch docs/specs/008-气泡聊天窗设置页接线.md --detach`，依赖 006/007）；派前 `ar spec impact` 复核受影响测试。
4. 009 合入后写 010：基于 assets/model/usagi_base.glb + usagi_landmarks.json 建 VRM humanoid 骨骼（短手短脚 Q 版）、耳朵骨链（各 3～4 节）、尾巴骨、自动权重+修复、MToon 材质（平涂色 + 深棕描边 #4A2A1A）、耳朵 spring bone + 头/身碰撞球，VRM 插件导出 VRM 1.0 到 assets/models/usagi.vrm（桌宠程序按这个路径加载），出姿态预览。再写 011：脸部贴片（照 Material/tripo/usagi_3d_ref.png 与原作描眼、嘴、眉、腮红）+ UV 平移表情（blink/happy/angry/sad/surprised/aa/ih/ou/ee/oh）。完成条件：010、011 说明提交并 `ar dispatch <说明> --detach` 派出。
5. 合流：换成 Usagi 模型后按 Q 版身材调动作幅度与取景；012 打包（electron-builder mac dmg arm64 + win nsis；本机下载 Electron 很慢，用镜像/缓存；审查 R5-1 冒烟首次下载无超时一并处理）。完成条件：门禁出 .dmg。

## 授权与边界

- 已授权：自己安装需要的工具（用户原话"其他的没有你可以自己安装"）；已装 Blender VRM 插件（extensions: vrm）。
- 要用户批准：推送、发布、花钱的操作（Tripo 积分由用户自己花）、`accept --force`。
- 不能碰：不公开发布任何 Usagi 素材或成品（版权角色，个人使用）；不提交 API key（DeepSeek key 只存在用户本机）。

## 新决定与教训

- D1～D6 见 `.agent-router/target.md`（自建 Electron 桌宠；用户手动 Tripo；模型无五官、表情用贴片 + UV 平移；Blender 全用命令行脚本；耳朵弹簧骨骼；目录约定）。
- 本机 `ar` 是系统的 /usr/bin/ar，AgentRouter 一律用 `node /Users/mac/.claude/skills/agent-router/core/ar.mjs`。
- **门禁不经过 shell**：verify 每条按空格拆开直接执行，`cd app && …` 会"0 秒假通过"，`&&`、`for`、管道都不能用。写成单条命令（`npm --prefix app test`）或主导维护的检查脚本（`sh docs/specs/checks/<编号>-check.sh`）。已反馈给 AgentRouter 开发会话。
- type: chore 默认不开 worktree，在主工作区跑；两个这样的任务会被同时放进主工作区互相污染门禁（AgentRouter 缺陷 221/222，修复任务 958）。958 合入前：chore 说明里写 `worktree: true`（spec check 报"不认识的字段"可忽略，派发认它），或一次只派一个不开 worktree 的写任务。这类任务门禁被误判时不要 accept --force：主导手动跑验收命令确认，再 `ar lead pending seen` 写明原因。
- 全量验收已配（project.json fullVerify），首次 11:59 通过（20 分钟，主要在下载 Electron）。合入时 accept 常要 `--ack external:<摘要>`：看 external-audit.json 里非 concurrent 的项，确认都不是本任务执行者在工作区外写的。
- DeepSeek 当前模型 ID：deepseek-flash（默认）、deepseek-v4-pro；deepseek-v4-flash 是旧名。
- 全局名额常被别的项目占满时，`ar next --dispatch` 不派；直接 `ar dispatch <说明> --detach` 能进队列。

## 已知问题与证据

- Mate Engine 没有 macOS 版，只能在 Windows 上检查兼容（用户自己）。
- 本机没有 Homebrew、ffmpeg；Blender 在 `~/Applications/Blender.app`（不在 /Applications）；blender-mcp 只配置在 DeadZone 项目，本项目不用它。
