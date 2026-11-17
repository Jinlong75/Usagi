# 接续工作入口

更新时间：2026-11-17 07:2x，主导 Claude Code（Opus 5.5）。本文件覆盖改写，按需写全但不无限增加：150 行以内最好，最多 250 行；历史移到 docs/autonomy/ 下的归档文件，不追加流水账。带 `ar:handoff` 标记的段落由 `ar lead handoff --write` 生成，其余都由主导写，软件不动；写完运行 `ar lead handoff check`。

## 一句话

**暂离中，本轮已做完，停在待用户 Windows 复测**（用户 11-16 23:0x 起 12 小时，截止约 11-17 11:00，日志 docs/autonomy/2026-11-16-夜间.md）。020～026 全部合入；全量验收 e29ab71 通过；dmg/exe 已打（app/release/），main 已推送，私有预发布 https://github.com/Jinlong75/Usagi/releases/tag/v0.1.0-test2 。复测文档 docs/guides/03-本轮Windows复测.md。

## 开工必做

<!-- ar:handoff:startup -->
1. 以开工包为入口：已注入就直接阅读，没有注入则运行 ar lead brief。交接文件每条都要遵守。 读 AGENTS.md（宿主已自动载入的不用再读，例如 Claude Code 经 CLAUDE.md 的 @AGENTS.md）。
2. Claude Code 开工只加载 agent-router 技能；其他宿主运行 ar lead guide。lead-workflow 在建立分工或新项目时使用；到相应时刻再用 lead-practices 技能或 ar lead practices <编号> 自查。
3. 按开工包的补读提示读齐缺失内容，再按末行运行 ar lead ack <确认码>。
4. 先核对"在跑与待处理任务"，接回在跑的任务，不重复派发；运行 `ar next`，能派的先派满。

换窗口：全自动，阈值 30%（软件设置）

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
- 2026-11-17 09:1x 用户曾把 GitHub 仓库改公开想开源，随后决定"算了不开源了"，仓库已改回私有（09:18 核实 PRIVATE）。主导意见已告知：动画叫声与参考 GIF 不进任何公开发布。
- 2026-11-17 09:1x 用户 Windows 实测两个问题（截图对应以用户 09:3x 指认为准：1.png=⑤抬手头部皱缩，2.png=②手上方鼓起，3.png=③西瓜倒置；都在 /Users/mac/Desktop/），"你先记着"：①"无法吸附窗口坐下，这个功能也不是必须的，可以删除"（026 吸附窗口顶端功能→删除）；②"模型在头部旋转/鼠标拖动的时候手的上面会出现凸起，也就是模型绘制有问题，这个必须改"（与 11-16 第①条"手上方没有凸起"同类，022 后仍复现，疑似头/颈骨骼权重影响到肩臂上方顶点，待查）。
- 2026-11-17 09:2x 用户补充第三个问题："喂食的西瓜整个西瓜是倒过来的。模型的手和脚都不会动，手脚应该也要能动。"（③西瓜道具朝向反了；④手脚要有动作——先查 VRM 是否有手臂/腿骨骼与权重、动作代码是否驱动四肢）
- 2026-11-17 09:2x 用户第五个问题："模型的手如果抬起来，模型的头部就会皱缩"（截图 /Users/mac/Desktop/1.png）。⑤与②互为镜像：头动→手上方鼓、手抬→头皱，高度怀疑头/身体与手臂骨骼的蒙皮权重互相串了。
- 2026-11-17 09:3x 用户第六个问题："进行多次对话后会崩溃闪退，我不确定是多次对话是直接原因，还是软件开启时间过长自动崩溃"（Windows）。主导核实：打包版没有持久崩溃日志，render-process-gone 只 console.error（app/src/main/index.ts:412），主进程无 uncaughtException/child-process-gone 记录，无法事后诊断。
  用户 09:4x 补充："图标也没了，整个画面退出。可以确定就是多次对话会退出，我总共发送了6轮消息，在第6轮的时候退出，并且我只发送了1～6六个数字。"→ 主进程整体退出（托盘消失），与对话次数相关，可复现。主导初查：chat/ 下没有明显的 5/6 次阈值；主进程退出路径有 window-all-closed→app.quit（index.ts:632）、start 失败 app.exit(1)；Windows 上 perch/windows.ts 每 100ms 用 koffi 调 EnumWindows（原生崩溃也会无声退出，且 ① 本来就要删）。调研要逐一排除这几条。

## 在跑与待处理任务

<!-- ar:handoff:tasks -->
（软件生成，`ar lead handoff --write` 更新；只改"主导判断"一列；处理完的失败任务删掉那一行）

公共目录：~/.config/agent-router
任务表生成于：2026-11-17T03:02:16Z

| 记录名 | 状态 | 启动方式 | 接回命令 | 主导判断 |
|---|---|---|---|---|
| 031-臂根蒙皮权重修复 | 运行中 | 托管 | `ar wait 031-臂根蒙皮权重修复` |  |
| 028-删除吸附窗口坐下 | 运行中 | 托管 | `ar wait 028-删除吸附窗口坐下` |  |
| 001-Tripo建模操作指南 | 已停止 | — | `ar status 001-Tripo建模操作指南` |  |
| 005-Usagi叫声切片 | 失败 | — | `ar status 005-Usagi叫声切片` |  |
| 017-五官形态保持不变 | 已停止 | — | `ar status 017-五官形态保持不变` |  |
<!-- /ar:handoff:tasks -->

## 下一步

0. ~~暂停派发~~ 已解除（agentrouter-dev 09:2x 通知：全量验收 70ef23dd 通过、重装技能 16f658b4；claude-2* 配置已删，说明不要写 worker: claude-2*；新核心对说明检查更严，不写用户目录路径）。完成条件：已完成。
0b. **用户实测问题修复中**：029 西瓜已合入 951e207（主导看图确认）；030 调研已合入 3248288（结论：臂根权重硬盒子把头下侧划给手臂；手脚不动是动作设计）；027 已合入（加 crash.log；macOS 12 轮未复现，Windows 根因待用户用新版复现，日志在 %APPDATA%\usagi-desktop-pet\crash.log；12 轮 RSS +69MB 待查；首要嫌疑 koffi，028 已删 100ms 轮询）；031（臂根权重修复，②⑤）在跑；028（删吸附，并入 027 审查 R2-1）10:5x 已派；032（手脚动作，④）等 027/028/031。全部合入后重新打包请用户 Windows 复测。原记录：：①删除吸附窗口坐下（026 功能，含全屏检测是否保留待定，删前看 026 说明）；②头部旋转/拖动时手上方凸起，必须修，先派只读调研查权重/弹簧骨骼原因再写修复说明。③喂食西瓜整个倒过来（3.png：现在是平的切面朝上、绿皮弧线朝下），整体翻转 180°，改后截图给用户确认朝向；④手脚不会动，要能动；⑤抬手时头部皱缩。②④⑤同查骨骼与蒙皮权重，合并成一份只读调研。⑥多次对话后/长时间运行闪退：先派一份"崩溃日志"任务（userData 下 crash.log：主进程未捕获异常、render-process-gone / child-process-gone 原因与退出码、每 10 分钟内存采样、对话次数），同时派只读调研排查对话路径的泄漏（气泡/聊天窗口重复创建、会话历史无上限、WebGL 上下文丢失）；日志版装好后请用户复现并发回 crash.log。AgentRouter-dev 暂停解除后派。完成条件：六条都合入并请用户复测（⑥以用户长时间多次对话不再闪退为准）。
1. **等用户 Windows 复测**：用户回来后请他按 `docs/guides/03-本轮Windows复测.md` 走 7 项并填结果表。按反馈写新说明修；完成条件：复测反馈逐条处理完。
2. **待用户确认的主导决定**（暂离期间，详见夜间日志）：022 尾巴整块分区、耳内转角改正面投影 2D、伸懒腰手高放宽到 neck−0.04H（扫描证明原三条无解）；"头和身子之间有线"理解为腰部收进轮廓；024 休息时手动"玩耍"沿用 60 秒清醒期；025 冰淇淋舔用 ih。完成条件：用户逐条确认或要求改（022 回退命令 `ar revert 022-身体形状还原Tripo原始模型-2-2`）。
3. ~~报 AgentRouter-dev "Usagi 已完成"~~ 11-17 07:1x 用户决定"现在就算完成"，已 SendMessage 给 agentrouter-dev-75（对方记缺陷 239 并按计划恢复 Waypoint）。之后复测的修复任务按普通优先级派，不再要求别的项目让路。完成条件：已完成（消息已送达）。
4. ~~待转告 AgentRouter-dev：scope approve 丢上次 retry note~~ 已于 11-17 07:1x 经用户授权直接 SendMessage 给 agentrouter-dev-75（已送达）。绕路仍有效：scope approve 后若上次 note 未完成，再 `retry --note` 重给全文。
5. Windows 待用户验证（旧清单仍有效）：安装/自动启动/托盘、卸载保留数据、Mate Engine 导入 `assets/model/usagi.vrm`。完成条件：用户反馈。

## 授权与边界

- 已授权：自己安装需要的工具（用户原话"其他的没有你可以自己安装"）；已装 Blender VRM 插件（extensions: vrm）。
- 要用户批准：推送、发布、花钱的操作（Tripo 积分由用户自己花）、`accept --force`。
- 不能碰：不公开发布任何 Usagi 素材或成品（版权角色，个人使用）；不提交 API key（DeepSeek key 只存在用户本机）。

## 新决定与教训

- D1～D6 见 `.agent-router/target.md`（自建 Electron 桌宠；用户手动 Tripo；模型无五官、表情用贴片 + UV 平移；Blender 全用命令行脚本；耳朵弹簧骨骼；目录约定）。
- 本窗口教训：①`accept --ack external:` 合入时会重扫，偶发"证据已经变化"，再跑一次同一摘要即可（016 实例）；②用户在暂离前已答完四个问题（D13），暂离期间不再发提问卡片，按 docs/autonomy/README.md 第 4 节记决定。
- 本窗口（11-16 23:1x～11-17 04:5x）教训：①执行者在仓库根目录跑 vitest 会生成根目录 node_modules 缓存并被代提交带入、门禁判越界——已在 .gitignore 加 `node_modules/`，重试说明里写"用 npm --prefix app，不在根目录跑 vitest"；②流水线产物要可重复（022 修了集合遍历与切面交点顺序），门禁会重出模型并逐字节比对部署副本；③Electron 窗口 `backgroundThrottling: false` 时隐藏窗口仍报 visible，复用页面的刷新要靠 focus 或主进程通知；④说明里"不改 X"与新素材冲突时执行者会停下要决定，写说明前先核实新素材（如尾巴独立网格）是否违反旧规则。
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
