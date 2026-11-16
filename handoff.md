# 接续工作入口

更新时间：2026-11-16 16:30，主导 Claude Code（Opus 5.5）。本文件覆盖改写，按需写全但不无限增加：150 行以内最好，最多 250 行；历史移到 docs/autonomy/ 下的归档文件，不追加流水账。带 `ar:handoff` 标记的段落由 `ar lead handoff --write` 生成，其余都由主导写，软件不动；写完运行 `ar lead handoff check`。

## 一句话

**暂离中（用户 11-16 23:0x 起 12 小时，日志 docs/autonomy/2026-11-16-夜间.md）**。本轮：022 模型形状（usagi3d2）→ 023 五官重画；020 作息 → 021 天气；全部合入后全量验收、打 dmg/exe，停在待用户 Windows 复测，SendMessage agentrouter-dev 主导"Usagi 已完成"。道具动作（5a 七个）与吸附窗口（5c）本轮就做（D13）；收尾 `ar push` 推送 + `gh release create` 私有仓库 Release 传 dmg/exe（用户已同意）。

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

- 2026-11-16 21:0x 用户 Windows 实测（截图 /Users/mac/Desktop/QQ20261116-220421.png）：①"模型应当是乌萨奇的头和身子之间有线，且乌撒气的手上方部位是没有凸起的……参考 material 下的 chatgpt 四视图"；②"windows上的安装版图标是electron的默认图标"；③"帧率较低……略微的掉帧感"，"除了行走以外，跟随鼠标还有其他表情都会有点卡顿，只有静止挂机不会卡顿"；④"切换了鼠标窗口焦点之后无法点击和拉动"；⑤"乌萨奇在做不同动作和表情的时候，五官的形态是不会发生变化的……只做位置的改变，表情可以调整修改"（AskUserQuestion 确认是**期望**，不是 bug）；⑥"全量查看material下的视频和动态图……参照里面的表情来做……现在的表情只能说合格但不符合乌萨奇这个角色的特点"。要求和 AgentRouter 主导沟通让 Usagi 优先（对方同意，Usagi 是公平值最低的项目，空名额先给我们，不用插队）。
- 2026-11-16 用户纠正⑤：【⑤部分作废】"五官的动作和表情不是绝对保持原样的。你可以看material下的视频usagi voice。乌萨奇在发出不同声音的时候会有不同的表情。动态图也有不同的表情下五官的变化。"→ 017（关表情）已停止作废；表情按参考随叫声/情绪变化，普通动作时五官是否保持由 018 结论定。
- 2026-11-16 用户要求同步 GitHub（已做，见新决定与教训）。

## 在跑与待处理任务

<!-- ar:handoff:tasks -->
（软件生成，`ar lead handoff --write` 更新；只改"主导判断"一列；处理完的失败任务删掉那一行）

公共目录：~/.config/agent-router
任务表生成于：2026-11-16T16:01:41Z

| 记录名 | 状态 | 启动方式 | 接回命令 | 主导判断 |
|---|---|---|---|---|
| 020-作息时段与问候 | 运行中 | 托管 | `ar wait 020-作息时段与问候` |  |
| 022-身体形状还原Tripo原始模型-2-2 | 运行中 | 托管 | `ar wait 022-身体形状还原Tripo原始模型-2-2` |  |
| 001-Tripo建模操作指南 | 已停止 | — | `ar status 001-Tripo建模操作指南` |  |
| 005-Usagi叫声切片 | 失败 | — | `ar status 005-Usagi叫声切片` |  |
| 017-五官形态保持不变 | 已停止 | — | `ar status 017-五官形态保持不变` |  |
<!-- /ar:handoff:tasks -->

## 下一步

1. **已由主导直接修好并提交**：②Windows 图标——`app/electron-builder.yml` 打开 `signAndEditExecutable`（electron-builder 26 在 mac 上无需 wine 就能改 exe 资源，核对 win-unpacked/Usagi.exe 含 icon.ico 全部 7 个尺寸，3b036a2）；①的"手上方凸起"——手臂静止下垂 1.1→0.35（`ARM_REST`，app/src/renderer/motion/index.ts；伸懒腰/喊叫相对它计算，绝对抬角 0.4/0.3 不变；5907386）；冒烟 `UnknownVizError` 改为不论是否刚下载都重跑一次（高负载下非首启也会出，21:10 复现）。
2. 016 已合入（审查 R1-1 主导补测试替身）；015 已合入但被用户否定，由 022 撤回：无需操作，完成条件：022 合入。
4. ~~017~~ 已作废（用户纠正，见上）：无需操作，完成条件：表情改由 018 后的新说明承接。
5. **018 已合入**（docs/research/usagi-表情动作/，看 face/overview.png 与 REPORT.md）。主导结论：眉毛永远高弧不变；眼只有 带高光圆眼 / 短横线眨眼(F09) / 闭眼弧(F08) 三种；嘴是 ω 闭口(F01) → 小开ω带舌(F03/F19/F21) → 大开竖长ω带舌(F05/F06)，外加鼓腮咀嚼(F11~F13)；腮红 3~4 斜线。删掉怒眉/八字眉/椭圆嘴。映射：happy/yaha→小开ω、shout/ura→大开ω、surprised/哈→小开ω圆眼、angry/sad→不用；口型 aa/oh→大开ω，ih/ee/ou→小开ω；新增 chew、sleep。023 说明已提交（depends 022，含按 usagi3d2 重量贴片位置）：022 合入后 `ar next --dispatch`。完成条件：023 accept。
5d. **022-身体形状还原Tripo原始模型-2-2**（托管，`ar wait 022-身体形状还原Tripo原始模型-2-2`；新模型尾巴是独立块，主导已放宽 009 检查 eb3f09f，诊断模型第二块 11180 面过大待查；用户放了更细致的 usagi3d2.glb，D12，说明已改为以它为输入和标准）：用户"身子旁边有凸起……tripo 原始模型的形状就是最标准的形状"。撤 015 凹口、smooth_face 不碰腰线、新增与原始模型形状一致性检查(≤0.5mm)、ARM_REST=0。验收并排看 assets/model/preview_original/ 与 preview/。完成条件：accept。
5a. **道具动作说明已提交**：024 框架+跳绳/吹泡泡/抱枕打盹（depends 021、022）、025 进食四个（depends 023、024）。依赖链 020→021→024→025→026（都改 main/index.ts，串行），023 与之并行。每次任务结束 `ar next --dispatch`。完成条件：024、025 accept。
5b. **020-作息时段与问候 在跑**（托管，`ar wait 020-作息时段与问候`）→ 021 早安天气 depends 020：D9。睡觉/打瞌睡动作与闭眼等五官重画后另写；全屏检测留给 D10。完成条件：accept。
5c. **026 吸附窗口顶端与全屏检测**（说明已提交，depends 025；koffi 调 EnumWindows/CGWindowList）。Windows 效果只能用户复测。完成条件：026 accept。
6. 全部合入后：`ar verify --detach` 全量验收 → `npm --prefix app run dist`（mac+win 都在本机打，Rosetta 已装）→ 主导核对 exe 图标与装包冒烟 → 交用户 Windows 复测（帧率数字、焦点后点击、模型线、图标、表情）→ 用户复测反馈处理完、没有在跑和排队的任务后，SendMessage 给 agentrouter-dev 主导"Usagi 已完成"（用户要求：之后由它通知 Waypoint 主导恢复开发；地址变了就 ListAgents 找）。完成条件：用户复测反馈。
7. Windows 待用户验证（旧清单仍有效）：安装/自动启动/托盘、卸载保留数据、Mate Engine 导入 `assets/model/usagi.vrm`。

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
- 检查脚本 `docs/specs/checks/0xx-check*.{sh,py}` 归主导维护；写新检查前先用 Seed-san 跑一遍验证 VRM 插件属性路径（插件模块 bl_ext.blender_org.vrm；需要插件时 Blender 不能带 --factory-startup）。 注意 `sh docs/specs/checks/009-check.sh` 会在当前目录重跑 prep 改写 assets/model/**；在主工作区单独验证检查时只跑 `009-check-blend.py`，跑完 `git status` 还原。
- 带 `--rebase` 的 retry 只重跑门禁、不让执行者动手；要执行者改东西用普通 retry --note。
- 审查常抓真问题（丢数据、弹簧末端、取景），逐条 confirm；小修主导可在 worktree 改后 `retry --regate`。
- DeepSeek 当前模型 ID：deepseek-flash（默认）、deepseek-v4-pro；deepseek-v4-flash 是旧名。
- `--ack external:` 后面必须是 `ar status <记录名>` 里"外部改动摘要"那一串哈希（external:<64位>），写文字说明不认。
- `accept --ack` 只认一个：外部改动摘要和"已知问题"确认要写进同一个字符串（`--ack "external:<摘要> 已知问题：…"`），写两个 `--ack` 只有最后一个生效。
- 反向实验（缺陷 226，AgentRouter-dev 在修）：说明有 `gate_artifacts` 时，汇报 `## 反向实验` 里的可执行 JSON 只要命令不是 `node --test …`/`node <脚本>` 就被预检拒、整个门禁不跑（即使逐字等于验收命令）。修好前：本项目 Python/Blender 测试的反向实验让执行者写纯文字、不写 ```json exec 块，主导手动核对；或暂时去掉 gate_artifacts。
- GitHub：远程 `origin` = https://github.com/Jinlong75/Usagi.git（**私有**，含版权素材，不能改公开）。2026-11-16 用户要求同步，已合并建仓 README 提交后用 `ar push <项目路径> --by lead` 推送（14b05f0）；project.json `push.allowLead: true`。之后的提交需要时同样用 ar push，推送前先问用户。安装包（app/release/）不进 git。
- Electron 首启：npm ci 后刚解压的 Electron 在 macOS 首次启动大概率 `UnknownVizError`，`app/scripts/smoke.mjs` 已对'刚下载且正是该错'重跑一次；别处（新脚本）启动 Electron 也要考虑这一点。
- 跨项目协调：Waypoint、AgentRouter-dev 主导会发消息要求让出门禁/暂停，按对方要求做并回复；地址会随换窗口变，发失败就 ListAgents 找新名字。
- 全局名额常被别的项目占满时，`ar next --dispatch` 不派；直接 `ar dispatch <说明> --detach` 能进队列。

## 已知问题与证据

- 用户问是否要买 Tripo API：主导答不需要（道具用 three.js 几何体，本体用 usagi3d2）。
- Mate Engine 没有 macOS 版，只能在 Windows 上检查兼容（用户自己）。
- 本机没有 Homebrew、ffmpeg；Blender 在 `~/Applications/Blender.app`（不在 /Applications）；blender-mcp 只配置在 DeadZone 项目，本项目不用它。
