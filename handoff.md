# 接续工作入口

更新时间：2026-11-16 16:30，主导 Claude Code（Opus 5.5）。本文件覆盖改写，按需写全但不无限增加：150 行以内最好，最多 250 行；历史移到 docs/autonomy/ 下的归档文件，不追加流水账。带 `ar:handoff` 标记的段落由 `ar lead handoff --write` 生成，其余都由主导写，软件不动；写完运行 `ar lead handoff check`。

## 一句话

全量验收已通过（20:35，da36f2e）；正式 mac dmg 已出并通过装包后冒烟；Windows 包在打；下一步把安装说明交给用户试用，收集 Windows/Mate Engine 待验证清单。

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
任务表生成于：2026-11-16T12:54:25Z

| 记录名 | 状态 | 启动方式 | 接回命令 | 主导判断 |
|---|---|---|---|---|
| 001-Tripo建模操作指南 | 已停止 | — | `ar status 001-Tripo建模操作指南` |  |
| 005-Usagi叫声切片 | 失败 | — | `ar status 005-Usagi叫声切片` |  |
<!-- /ar:handoff:tasks -->

## 下一步

1. **011 已合入**（合并提交 8cefaec）：第 2 次审查 pass；脚骨 TRS 与逆绑定矩阵已与输入一致（新测试覆盖），MASK 队列 0，线宽/腮红/嘴按参考图。主导随后自己微调 ω 嘴尾巴方向（1fe930a，从左弯底部垂下、末端右勾，照参考图），重出 usagi.vrm，pipeline/run_tests.sh 通过。遗留：耳朵内侧粉色边缘锯齿（010 身体贴图），013 后另开小任务。完成条件：已完成，无需操作（`ar status 011-五官贴片与表情` 为已合并）。
2. **012 已合入**（16:5x，合并提交 185359f）：-dev 占位 dmg 127MB，打包冒烟 ok；图标从参考图正面裁出（主导看过，好）。遗留：`dist:win` 在本机失败——NSIS 的 makensis 是 x86_64，本机 arm64 没装 Rosetta（`Unknown system error -86`）；出正式包时主导先 `softwareupdate --install-rosetta --agree-to-license`（用户已授权装工具）再试，仍不行就交用户在 Windows 上跑 `npm --prefix app run dist:win`。EXE 资源编辑被关掉，exe/快捷方式可能是 Electron 默认图标，正式包时核对。
3. **013 已合入**（e540564，第 4 次）：位置漂移修好（回归测试覆盖）。举手 R4-1 成立、主导接手：Usagi 手臂约 0.075H、根在身体侧面、够不到头顶，转肩会把手转进头里并鼓包；改为肩不转、上臂外展 1.5/1.4（伸懒腰/喊叫），手卡在头身交界凹处伸出轮廓（fa29171，探针量过：手骨伸出轮廓约 0.06H）。完成条件：已完成；全量验收的 smoke-stretch/shout 截图里看得到小手（看不到再调 `app/src/renderer/motion/index.ts` 的 upperArm）。
3b. **014 已合入**（第 4 次，审查 R4-1 判不成立：尾巴骨 0.55mm 漂移）：耳朵粉色边界完全平滑（最大转角 144°→26°）。主导随后把尾巴白区 1.15r→1.03r 去掉球上方白色月牙，整条流水线重出并同步 `assets/models/usagi.vrm`（81395e0），pipeline 测试、app 254 项单测、typecheck 通过。完成条件：已完成。
4. **全量验收已通过**（20261116-202714-351d）。前两次失败是环境：npm ci 后刚解压的 Electron 首启在 macOS 上大概率 UnknownVizError（删 dist 复现 3/4），主导在 app/scripts/smoke.mjs 加了"刚下载且正是该错才重跑一次"（da36f2e，单测覆盖）。正式包：`app/release/Usagi-0.1.0-mac-arm64.dmg`（120MB，正式模型，挂载检查模型与仓库逐字节一致，装包后 --smoke ok）。Rosetta 已装（20:3x），`npm --prefix app run dist:win` 在跑。完成条件：用户收到 docs/guides/02-安装与使用.md 与 dmg 路径。
5. 收尾：Windows 实机安装与 Mate Engine 导入需要用户在 Windows 电脑上验证（Mate Engine wiki 第三方镜像称支持 VRM 0.x/1.x，未官方确认）。完成条件：把待用户验证清单交给用户。

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
- 已合入：002、003、004（第三轮四视图，用户没用）、005（主导手动验收）、006、007、008、009、010。模型产物：`assets/model/usagi_base.glb`（009）、`usagi_body.vrm`（010，VRM 1.0，弹簧 9 关节）、011 将出 `usagi.vrm`；桌宠默认加载 `assets/models/usagi.vrm`（013 负责拷贝）。
- 检查脚本 `docs/specs/checks/0xx-check*.{sh,py}` 归主导维护；写新检查前先用 Seed-san 跑一遍验证 VRM 插件属性路径（插件模块 bl_ext.blender_org.vrm；需要插件时 Blender 不能带 --factory-startup）。
- 带 `--rebase` 的 retry 只重跑门禁、不让执行者动手；要执行者改东西用普通 retry --note。
- 审查常抓真问题（丢数据、弹簧末端、取景），逐条 confirm；小修主导可在 worktree 改后 `retry --regate`。
- DeepSeek 当前模型 ID：deepseek-flash（默认）、deepseek-v4-pro；deepseek-v4-flash 是旧名。
- `accept --ack` 只认一个：外部改动摘要和"已知问题"确认要写进同一个字符串（`--ack "external:<摘要> 已知问题：…"`），写两个 `--ack` 只有最后一个生效。
- 反向实验（缺陷 226，AgentRouter-dev 在修）：说明有 `gate_artifacts` 时，汇报 `## 反向实验` 里的可执行 JSON 只要命令不是 `node --test …`/`node <脚本>` 就被预检拒、整个门禁不跑（即使逐字等于验收命令）。修好前：本项目 Python/Blender 测试的反向实验让执行者写纯文字、不写 ```json exec 块，主导手动核对；或暂时去掉 gate_artifacts。
- 全局名额常被别的项目占满时，`ar next --dispatch` 不派；直接 `ar dispatch <说明> --detach` 能进队列。

## 已知问题与证据

- Mate Engine 没有 macOS 版，只能在 Windows 上检查兼容（用户自己）。
- 本机没有 Homebrew、ffmpeg；Blender 在 `~/Applications/Blender.app`（不在 /Applications）；blender-mcp 只配置在 DeadZone 项目，本项目不用它。
