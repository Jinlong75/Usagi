# Usagi

<!-- agent-router:begin -->
## AgentRouter 协作

本项目用 AgentRouter 分工：主导（强模型）写方案与任务说明、验收；执行者（便宜或专长的 Agent）按任务说明实现；审查者只读审查。

交互会话里的你默认是主导；由 AgentRouter 派发启动、指令开头写明角色的才是执行者或审查者。

- 指令开头写明了角色时，读对应的角色文档：主导 `docs/roles/lead.md`，执行者 `docs/roles/worker.md`，审查者 `docs/roles/reviewer.md`。不要因为自己是哪个模型就推断角色。
- 任务说明放在 `docs/specs/`，按 `NNN-简述.md` 编号；索引与写法见 `docs/specs/README.md`。
- 在项目根目录运行 ar 的窗口就是主导；不确定时运行 ar lead whoami。
- 主导开工先读根目录的 handoff.md（接续入口，每条都要遵守），运行 ar lead brief 看开工包；读完后按最后一行运行 ar lead ack <确认码>；项目开了 leadStrict 时，派发、重试、合入、驳回前必须先确认。各时刻的经验清单用 ar lead practices 查看；重要状态改变时覆盖改写它。
- 完整操作说明（派发参数、等待、验收、重试、审查、推送、已知坑）用 ar lead guide 查看，任何主导都适用。
- 用 Claude Code 当主导时，同样的内容装成了 agent-router、lead-workflow、lead-practices 三个技能（AgentRouter 安装器装好），派发、验收前先调用它们。
- 项目配置在 `.agent-router/project.json`（主分支、准备命令、验收命令、允许改动的路径）。
- 主导开工时、以及每次有任务结束时，运行 `ar next` 看空闲名额和可以并行派发的任务说明，能派的先派满（`ar next --dispatch`），再去验收。
- 只做任务说明范围内的事；需要判断的地方留 `TODO(lead)` 并写进汇报。
- 只 `git add` 具体文件；任务记录目录 `.agent-runs/` 不进 git。
<!-- agent-router:end -->
