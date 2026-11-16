## 完成了什么

本次为第 2 次尝试，在已有提交 4389e89 上诊断，没有推倒重来。**任务尚未完成，不能通过验收；需要主导解除分区规则限制后继续。** 没有修改正式模型、分区函数、动作或任何测试断言。

上次失败原因：`sh pipeline/run_tests.sh` 在 `test_09_real_product_boundaries` 失败。旧分区场应用到新模型后，左耳 2 条闭环、右耳 1 条、尾巴 3 条，且最大转角超出 35°。上次报告已记录此问题，但未按“需要越界”格式提出语义范围冲突，导致继续进入必然失败的门禁。本次明确记录阻塞。

新增只读诊断 `pipeline/022-boundary-diagnostic.py`，在进入 `split_region_boundaries` **以前**采样既有分区函数，不改变模型或函数：

- 尾巴独立网格保持原始 353 顶点 / 702 面，其中 168 个顶点满足现有 `tail_field < 0`；主体背部另有 9 个顶点也满足相同条件。这两组选点分属互不相连的原始网格，已经形成两个独立区域。仅优化切割或细分无法将两者变成同一条闭环；需要改变分区判定，或改变当前每区仅一条闭环的要求。任务同时禁止改规则、改形状和放宽断言，因此不能自行选择。
- 耳内椭圆及正面位置约束已满足的顶点，仍有左耳 15 个（8+7 两组）、右耳 5 个被 `normal.y >= -0.25` 的现有阈值排除。左耳这些点位于约 z=0.8075..0.8635，法线 y 最大为 +0.0161。额外排除在切割前就存在；它解释了内部缺口/附加边界的来源，不能通过平滑原始耳朵几何来消除。
- 这不是环境失败，也不是本次新增诊断造成的失败。现有尾巴规则选择主体背部已足以证明规则与“单条尾巴边界”要求冲突。当前证据不宣称解释了每个大转角的全部数值原因。

本次聚焦复现：边界单项测试失败（退出 1），数值与上次门禁完全相同；现有正式底模双向形状单项测试通过（退出 0）。未运行完整门禁或 GUI。

任务要求回答的其余问题，沿用已有实现与证据，未改动：

1. 腰线破坏原因由上一轮反向实验确认：旧 `.28 <= z <= .68` 脸部范围改动了 z<0.30 的腰线顶点。旧模型最大位移 17.075 mm，新模型 21.831 mm；015 的侧腰压入是另一处形变。见 `assets/model/usagi_022_experiments.report.json`。
2. 五官区共用 `feature_regions` / `in_feature_region`，按实际独立雕刻 AABB 外扩 6 mm；原始区域内 5353 点、底模内 115 点。本次重新检查正式底模：底模→原始最大 6.10993069472e-08，位置 [0.0383555964, -0.0471285917, 0.8231558204]；原始→底模最大 0，最大值位置之一 [0.3466047943, -0.0061065126, 0.2628236413]，均低于 0.0005（高度归一为 1）。
3. 新旧原始网格分别为 14809/29414、5276/10278 顶点/面；本次没有减面、重建产物或改静止姿态。现有 rig 未把网格摆成 T-pose；`ARM_REST=0` 的静止蒙皮测试上一轮已通过。smoke 小手画面仍待门禁，不能宣称已观察通过。
4. 需要的是任务语义范围调整，路径均已在允许清单；详见末节。没有修改 `docs/specs/checks/**` 或其他工作区。

## 改动了哪些文件

- `pipeline/022-boundary-diagnostic.py`：只读、可重复运行的分区场诊断；不导出模型。
- `assets/model/022-boundary-diagnostic.json`：切割前分区场证据。
- `assets/model/022-boundary-diagnostic.log`：诊断运行日志。
- `assets/model/022-boundary-focused.log`：仅真实产物边界测试的失败输出。
- `assets/model/022-shape-focused.log`：仅正式产物形状一致性测试的成功输出。
- `pipeline/022-retry-report.md`：本次汇报。

日志中的本机安装目录、工作区绝对路径已替换为占位符或仓库相对路径。测试临时场景未写入正式产物。按本次指令由 AgentRouter 在门禁前代提交，未手动暂存或提交。

## TODO(lead) 清单

- 批准调整新模型的耳朵/尾巴分区规则，或明确修改任务验收目标后再继续。建议优先明确尾巴仅作用于独立尾巴块，以及耳内法线异常的处理规则；这是待主导决策的建议，本次没有实施。
- 上一轮报告里的 stretch/shout 两项旧动作几何断言仍未解决：固定 0.4/0.3 rad 后，stretch 手高 0.316257H 未达到 neck−0.02H=0.326459H，shout 抬高 0.046937H 未达到 0.05H。需要主导明确动作要求与旧验收之间的取舍；本次没有修改角度、骨骼或断言，也未重复运行这些已知失败。
- 现有 `split_region_boundaries` 的 TODO(lead) 保留；本次没有添加越权修复。

## 推断清单

- 切割前对顶点连边做负值连通分量分析，足以证明尾巴场在主体/尾巴上选出了不相连的区域；它不是对连续等值线曲率的完整证明，不据此声称全部转角已定位。
- 耳内位置条件成立但法线条件失败的选点，说明当前法线阈值对新网格的局部法线异常敏感。是否改阈值、改法线取样方式或采用其他分区方法，留给主导决定。

## 偏离说明

- 未完成修复和整条流水线重出：根据任务第 7 条“做不通就停下汇报”以及 worker 的范围硬规则，在确认需要改变禁止修改的分区规则后停止产品修改。
- 本次新增诊断与聚焦复现，不放宽/删除断言，不运行 `sh pipeline/run_tests.sh`、009/010/011 完整检查、完整 app test 或 smoke。
- 按要求使用 `rg -n` 完整检索，等价于任务给出的 grep；完整输出及逐项处置列在下方。

## 已知问题

- 边界单项仍失败：右耳 110.545580°，左耳 154.702719° / 171.712008°，尾巴 102.964931° / 29.160854° / 33.125711°。先遇到的断言可能随集合遍历顺序为闭环数量或角度断言，完整指标相同；不是偶发检查。
- 上一轮两项动作几何断言失败仍存在，详见 TODO(lead)。当前结果不得合入为完成任务。
- 冒烟仍由门禁生成；本次没有新截图。

## 验证与证据

实际命令中 B 为任务既定 Blender 绝对路径。每次启动前执行 `node /Users/mac/.codex/skills/agent-router/core/ar.mjs gui check Blender --headless`，退出 0。最初 `ar gui check` 命中了系统归档工具，退出 1，随后按已有安装入口调用正确的 AgentRouter 核心；未改变 PATH、权限或任何守卫变量。

| 实际命令 | 退出结果 | 证据 |
| --- | --- | --- |
| `B -b --factory-startup --python-exit-code 1 --python pipeline/022-boundary-diagnostic.py` | 0 | `assets/model/022-boundary-diagnostic.json` / `.log` |
| `B -b --factory-startup --python-exit-code 1 --python-expr 'import sys, unittest; sys.path.insert(0, "pipeline/tests"); import test_prep_usagi; unittest.main(module=test_prep_usagi, argv=["test_prep_usagi", "PrepTests.test_09_real_product_boundaries"], verbosity=2)'` | 1；只选中 1 项，失败 | `assets/model/022-boundary-focused.log` |
| `B -b --factory-startup --python-exit-code 1 --python-expr 'import sys, unittest; sys.path.insert(0, "pipeline/tests"); import test_shape_consistency; unittest.main(module=test_shape_consistency, argv=["test_shape_consistency", "ShapeTests.test_committed_surface"], verbosity=2)'` | 0；只选中 1 项，通过 | `assets/model/022-shape-focused.log` |
| `git diff --check` | 0 | 收尾检查 |

诊断首次运行后补上显式 `bm.normal_update()` 并重新运行，结果相同；这次重跑只用于核实法线采样与 prep 一致，没有循环运行失败测试求绿。

## 反向实验

本次没有改形状算法，未重复执行上一轮反向实验。已有证据 `assets/model/usagi_022_experiments.report.json`：临时恢复旧 fixed-z smooth_face 后，双向最大距离分别为 0.009985227 和 0.005096730，均超 0.0005，检查失败。本次未修改该证据，未提供 json exec 代码块。

## 开工检索与逐项处置

第一组完整输出：

```text
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/tests/test_prep_usagi.py:286:            report = smooth_face(bm, regions)
app/tests/renderer-cursor.test.ts:34:vi.mock('../src/renderer/motion', () => ({ ARM_REST: 1, MotionRig: class { reset() {} apply() {} }, sampleMotion: () => ({}) }));
app/tests/usagi-model.test.ts:7:import { ARM_REST, MotionRig, sampleMotion } from '../src/renderer/motion';
app/tests/usagi-model.test.ts:35:  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -ARM_REST;
app/tests/usagi-model.test.ts:36:  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:69:    expect(ARM_REST).toBe(0);
app/tests/usagi-model.test.ts:107:    arms[0]!.rotation.z = -ARM_REST; arms[1]!.rotation.z = ARM_REST;
app/tests/behavior-motion.test.ts:4:import { ARM_REST, MOTION_SECONDS, MotionRig, jumps, neutralPose, sampleMotion } from '../src/renderer/motion';
app/tests/behavior-motion.test.ts:189:    normalized.rotation.z = -ARM_REST; // Use the same neutral arm angle as the deployed model.
app/tests/behavior-motion.test.ts:263:  expect(stretch.bones.leftUpperArm![2] - ARM_REST).toBeCloseTo(0.4);
```

第二组完整输出：

```text
pipeline/tests/test_prep_usagi.py:21:from prep_usagi import (ear_inner_region, tail_region, smooth_waist, waist_depth,
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/tests/test_prep_usagi.py:88:                       report=str(cls.report_file), smooth_waist="on", waist_iterations=100))
pipeline/tests/test_prep_usagi.py:149:    def test_04_waist_depth_volume_and_pinned_vertices(self):
pipeline/tests/test_prep_usagi.py:153:            report = smooth_waist(bm, .5, half_width=.30, iterations=100)
pipeline/tests/test_prep_usagi.py:165:    def test_05_waist_off_and_excluded_arms_unchanged(self):
pipeline/tests/test_prep_usagi.py:169:            report = smooth_waist(bm, .5, half_width=.30, enabled=False)
pipeline/tests/test_prep_usagi.py:172:            smooth_waist(bm, .5, half_width=.30, trunk_limit=.15, iterations=10)
pipeline/tests/test_prep_usagi.py:200:    def assert_smooth_boundaries(self, obj, expected):
pipeline/tests/test_prep_usagi.py:210:    def test_08_synthetic_cut_ellipse_closed_and_smooth(self):
pipeline/tests/test_prep_usagi.py:227:        self.assert_smooth_boundaries(obj, {"ear_l"})
pipeline/tests/test_prep_usagi.py:235:        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r", "tail"})
pipeline/tests/test_prep_usagi.py:255:                       smooth_waist="off", waist_iterations=100))
pipeline/tests/test_prep_usagi.py:258:        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r", "tail"})
pipeline/tests/test_prep_usagi.py:286:            report = smooth_face(bm, regions)
docs/specs/checks/009-check.sh:8:         assets/model/preview_nosmooth/preview_sheet.png; do
docs/specs/checks/009-check.sh:14:  mkdir -p "$AR_GATE_ARTIFACT_DIR/preview" "$AR_GATE_ARTIFACT_DIR/preview_nosmooth"
docs/specs/checks/009-check.sh:16:  cp assets/model/preview_nosmooth/*.png "$AR_GATE_ARTIFACT_DIR/preview_nosmooth/"
pipeline/tests/test_shape_consistency.py:56:                       smooth_waist='off', waist_iterations=100))
```

全部命中本次不改，逐项说明：

- `test_prep_usagi.py:21,22,88,149,153,165,169,172`：腰线合成测试及禁用逻辑不涉及此次边界阻塞，保留。
- `test_prep_usagi.py:200,210,227,235,255,258`：闭环数、角度、真实重建与禁止腰线形变断言全部保留；仅聚焦复现 235 的真实产物检查。
- `test_prep_usagi.py:286`：已有区域外逐点不动断言保留。
- `renderer-cursor.test.ts:34`：隔离 mock，不在本任务允许路径，不碰。
- `usagi-model.test.ts:7,35,36,69,107`：ARM_REST=0 及实际静止姿态要求保留；不放宽其他动作断言。
- `behavior-motion.test.ts:4,189,263`：中性角夹具及 0.4 rad 要求保留。
- `009-check.sh:8,14,16`：主导维护，不修改或运行完整脚本。
- `test_shape_consistency.py:56`：重建底模必须关闭腰线平滑，保留；本次只运行已提交产物的形状检查。

## 需要越界

- `pipeline/blender/prep_usagi.py`：路径已获允许，但任务第 7 条明确禁止修改耳朵/尾巴分区规则；新模型上现有尾巴规则在原始两个独立网格上都选出区域，与每区一条边界的现有断言冲突。需要主导批准调整分区语义后才能继续修复；不是申请焊接尾巴、改变原始形状或放宽测试。本次已停止产品修改。
