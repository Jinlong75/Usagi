## 完成了什么

在当前工作区三次尝试已有实现上完成修复。上次未通过的原因是两项语义调整需主导批准，验收仅核对范围、未执行验收命令；42 条命令无法判定不计违规。本次按照主导已批准的补充决定实现，没有扩大路径范围。

- 保留 usagi3d2 输入、撤掉侧腰凹口、只在五官实际包围盒内平滑、双向形状检查、整块尾巴及 ARM_REST=0；没有推倒重来。
- 耳内转角改在与 ear 椭圆场一致的正面 X/Z 投影计算，投影重合点按 1e-7 容差合并后测角。每只耳仍严格一条闭环、转角 <35°。左耳局部投影折返需要 4 次、权重 0.25 的边界 Laplacian 平滑；只动异常点及邻点，每步 BVHTree 投回原表面。右耳未平滑。没有改变椭圆参数、分量法线筛选、尾巴整块规则。
- 最终耳内：左 258 段 / 2D 25.2424206° / 3D 38.9393422°；右 253 段 / 2D 19.8562393° / 3D 79.6625795°。两耳均恰好一条闭环。3D 最大转角只输出，不作断言。
- 动作先扫描原三条要求且各留 0.005H 的组合，没有解；随后按授权采用 neck−0.04H。最终 stretch/shout 均为左上臂 [0,0,0.43]、左前臂 [0,0,−0.10] rad，右侧 Z 取反，其余臂轴/手骨为 0，肩不动。保留抬高 >0.05H、突出轮廓 >0.025H。选择依据是记录的扫描网格内与 0.75 rad 纯抬臂的关节角平方距离最小。
- 扫描可通过 `USAGI_SCAN_ARMS=1 npm --prefix app test -- tests/usagi-model.test.ts -t '小手向' --testTimeout=120000` 复现。120 秒只用于此显式诊断命令，正常测试超时未修改；扫描默认不开启。原要求扫描 42,525 组，后备扫描枚举 2,251,795 组，利用角距离剪枝。各轴范围和步长全部写在 `assets/model/usagi_arm_scan.report.json`。上臂三轴、前臂三轴均纳入后备扫描；手骨旋转不改变手关节原点，选 0 最接近基准。
- 左右手实际最小抬高 0.0522166053H、相对 neck 高度 −0.0316316863H、突出轮廓 0.0250935868H。原手高标准下，即使将所有旋转的可达域放宽成根部为中心、半径等于两段骨长和的球，沿整个测量高度区间求上界也仅能突出约 0.01176H，低于 0.025H；因此不是继续旋转手骨能解决的冲突。

原任务问题的核实及保留实现：

- 腰线真正原因已由前轮反向实验确认：旧 smooth_face 固定 `.28 <= z <= .68` 候选带把腰线当作脸部球面异常。旧模型 10 个被改点全部在 z<0.30，最大位移 17.075 mm；新模型 24 个被改点也全部在 z<0.30，最大位移 21.831 mm。015 的侧腰径向压入是另一处人为形变，已删除。原始实验报告继续保留。
- 旧输入 5,276 顶点 / 10,278 面；新输入 14,809 顶点 / 29,414 面。没有减面。prep 合并距离 0.000001，实际不合并顶点，只删 5 个退化面；耳部二等分，独立尾巴 353 顶点 / 702 面不细分。主体与尾巴共两块，尾巴全 Tail，蒙皮跟随 Hips 子骨 Tail，不焊到身体。
- 五官区域：转正后 10 个独立正面雕刻块的三维 AABB 各轴外扩 0.006；prep 和检查共用 feature_regions / in_feature_region。原始区域内 5,353 点，底模区域内 115 点。原表面局部偏差 0.001369 已满足 0.004 容差，因此这 115 点也未移动。
- 最终双向形状距离（高度=1，限值 0.0005）：底模→原始 6.06433303574e-08，位置 [−0.0597119257,−0.0352125950,0.9786027074]，区域外 19,580 点；原始→底模 0，位置 [0.3466047943,−0.0061065126,0.2628236413]，区域外 9,456 点。已提交底模与临时从原始模型重建均通过。
- prep → rig → face 已按顺序全部重出，预览与原始同机位对照已更新；最终 VRM 1,467,356 字节（约 1.47 MB），没有减面。face 的 body_unchanged=true、插件错误为空，五官贴片从新表面重贴并沿法线外移原有 0.0015。assets/model/usagi.vrm 已复制到 assets/models/usagi.vrm。
- rig 使用原始网格内的骨骼静止位置，没有把网格改成 T-pose，没有改骨位置、数量或弹簧参数。ARM_REST=0；无界面真实 VRM 检查静止蒙皮与导出原始顶点差 <1e-6，小手保持原始位置。GUI 中的小手位置尚未冒烟观察，smoke-idle/walk/happy 由门禁生成。

## 改动了哪些文件

本轮源码和测试：

- app/src/renderer/motion/index.ts
- app/tests/usagi-model.test.ts
- app/tests/behavior-motion.test.ts
- pipeline/blender/prep_usagi.py
- pipeline/blender/region_boundary.py
- pipeline/tests/test_prep_usagi.py
- pipeline/README.md
- pipeline/022-worker-report.md

本轮重出：assets/model/usagi_base.glb、usagi_body.vrm、usagi.vrm、usagi_rig.blend、prep/rig/face/shape 报告与 preview/、preview_nosmooth/、preview_original/、preview_rig/、preview_face/，以及 assets/models/usagi.vrm。新增 usagi_arm_scan.report.json 与 022 聚焦验证日志。具体清单见本报告末尾。

前轮已完成且本轮保留：pipeline/build_usagi.sh、run_tests.sh、blender/check_shape.py、rig_usagi.py、render_preview.py、tests/test_shape_consistency.py；全部仍在任务允许范围。不修改 Material、docs/specs/checks、其他 worktree、020 文件、真实技能或 CLI 配置。按本次明确指令由 AgentRouter 在门禁前代提交，执行者不自行暂存/提交。

## TODO(lead) 清单

- 运行完整门禁及 smoke-idle/walk/happy，审看同机位原始/底模预览与桌宠动作。完整验收、全量界面检查没有在执行者侧运行。

## 推断清单

- 小边距采用各轴 6 mm，来自前轮已批准实现；最低 z 约 0.29884 的盒子还受 X/Y 约束，不包含腰线顶点。
- 正面投影平面采用 Blender X/Z；与 ear 椭圆场的横向/高度坐标相同，没有重新拟合椭圆。
- “最近”按扫描网格中左右对称关节相对纯上臂 Z=0.75 的角度平方和排序，不声称是连续角域的全局最优。
- 原手高要求无解后，按主导授权将后备阈值设为 neck−0.04H；后备姿态满足保留的三条阈值，但不宣称各项仍有 0.005H 余量。

## 偏离说明

- 原要求伸懒腰/喊叫绝对角度 0.4/0.3 已由后续主导决定覆盖为扫描组合；静止 ARM_REST 仍为 0，网格/骨位置/数量不变。
- 原 neck−0.02H 改为 neck−0.04H，原因及扫描范围/结果见上文；没有更改抬高 0.05H 或轮廓 0.025H 的原断言。
- 自测只运行改动相关 Blender 文件和两个 Vitest 文件；没有运行完整 verify、门禁专用 009/010/011 检查或全量 GUI。没有新增依赖。

## 已知问题

- 后备姿态余量较小：抬高比 0.05H 多约 0.00222H，轮廓比 0.025H 多约 0.000094H；neck−0.04H 余量约 0.00837H。当前真实模型几何测试通过；后续修改 rig 或模型时应保留这些检查。
- 诊断初次遇到投影零长段，已改为合并投影重合点；全边界均匀平滑试验产生局部翻面，已收敛为仅异常点及邻点平滑，最终 EarInner 最大面法线 Y 回到原值约 0.03217，预览无该翻面痕迹。
- 大组合扫描曾触发 Vitest 默认 5 秒诊断超时；改用显式扫描命令 120 秒，标准测试文件没有改超时。最终结果以验证表为准。
- 完整门禁与 GUI 冒烟仍待主导/门禁，不将聚焦测试结果表述为完整验收通过。

## 断言改写

本轮：

- pipeline/tests/test_prep_usagi.py：ear 转角 3D → 正面投影 2D，原因：原表面折面，主导决定。原最大三维转角 <35° → 与椭圆场同一 X/Z 平面最大转角 <35°。每耳恰好一条闭环、闭合性、分段数记录、拓扑和尾巴要求全部保留；3D 值继续输出，不作断言。
- app/tests/usagi-model.test.ts：原手高 >neck−0.02H → >neck−0.04H → 原标准带余量扫描无解，且可达域上界低于原轮廓要求，依据本次主导明确授权。抬高 >0.05H、突出轮廓 >0.025H、动作后复位全部不变。
- 同文件：原纯 Z 轴 0.05 rad 步进扫描、要求存在只满足两项高度条件的最小角且 ARM_RAISE 等于它 → 显式诊断多轴扫描，原三项带余量无解后选后备阈值下距 0.75 最近组合；正常测试将实际角与扫描产物比对，并保留三条实际几何及复位断言 → 主导批准从纯上臂角度扩展为多骨组合。未删除测试用例。
- 同文件：轮廓原按全顶点过滤求最大宽度 → 对同一批点、同一严格高度带用排序/区间最大值求宽度 → 大组合扫描需要加速，阈值与几何定义不变；空高度带不计通过。
- app/tests/behavior-motion.test.ts：保留 stretch/shout 相对 ARM_REST 的角度断言，新增两侧上臂/前臂完整角度断言；只改变被测动作，不删除或放宽既有断言。

前轮保留的改写，避免覆盖汇报后丢失：

- pipeline/tests/test_prep_usagi.py：test_015_side_notch_pins_center_and_limits_depth 及 deepen_side_waist 导入删除 → 用户否定侧腰凹口，任务明确要求连函数与测试一起删除；由双向形状回归防止其恢复。
- 同文件：严格一块主体 → 严格主体+原始尾巴两块，尾巴 <5%、背面、全部 Tail、702 面；真实材质边界预期耳+尾闭环 → 两耳各一条闭环，尾巴整块无需主体切线 → 主导批准整块原始独立尾巴，不能焊接或过度细分。旧零面积检查保留。
- 同文件：smooth_face 隐式全高度候选 → 显式小区域，保留偏差/处理点断言并新增区域外逐点不变 → 任务要求只碰雕刻五官。
- app/tests/behavior-motion.test.ts：旧夹具静止上臂 −1.1 → −ARM_REST → 与真实中性姿态一致，原包围盒/恢复检查保留。
- app/tests/usagi-model.test.ts：新增 ARM_REST=0、两侧零角、静止真实蒙皮不变；前轮 0.4/0.3 固定相对角改为 ARM_RAISE 实际扫描角 → 前轮主导批准扫描起点 0.75。
- pipeline/tests/test_shape_consistency.py 为前轮新增，双向 0.0005 限值、已提交/临时重建与完整尾巴蒙皮检查未放宽。

## 反向实验

沿用本工作区前轮已实际完成并保留的反向实验：临时恢复旧 smooth_face 固定 z 区间，用临时 GLB 做同一双向检查。底模→原始最大 0.009985227（9.985 mm），位置 [−0.2425501,−0.1451819,0.2838300]；原始→底模 0.005096730（5.097 mm），位置 [−0.2044455,−0.1692721,0.2818759]，均超过 0.0005，检查失败。正式函数已恢复，最终重建/检查再次通过。本轮没有重复改变已证明的无关平滑算法。证据：assets/model/usagi_022_experiments.report.json。本节仅纯文字，无 json exec 块。

## 验证与证据

所有 Blender 命令前已运行 `node <AgentRouter核心>/ar.mjs gui check Blender --headless`，退出 0。系统 ar 是归档程序，因此使用已安装 AgentRouter 核心的只读检查入口；未改 PATH、AR 环境、权限或守卫。下表 B 表示 README 中约定的 Blender 绝对路径；日志提交前已去除本机目录。

| 实际命令 | 退出结果 | 证据 |
| --- | --- | --- |
| `sh pipeline/build_usagi.sh prep` | 0 | assets/model/022-prep.log、preview/、preview_nosmooth/、preview_original/、usagi_shape.report.json |
| `sh pipeline/build_usagi.sh rig` | 0，weights.valid=true，plugin_validation=[] | assets/model/022-rig.log、usagi_rig.report.json、preview_rig/ |
| `sh pipeline/build_usagi.sh face` | 0，body_unchanged=true，plugin_validation=[] | assets/model/022-face.log、usagi_face.report.json、preview_face/ |
| `cp assets/model/usagi.vrm assets/models/usagi.vrm` | 0 | 两份逐字节相同，1,467,356 字节 |
| `B -b --factory-startup --python-exit-code 1 --python pipeline/tests/test_prep_usagi.py` | 0，9 项通过 | assets/model/022-test-prep.log；含静态底模及从原始模型临时重建 |
| `B -b --factory-startup --python-exit-code 1 --python pipeline/tests/test_shape_consistency.py` | 0，3 项通过 | assets/model/022-test-shape.log；两方向最大距离 ≤0.0005 |
| `USAGI_SCAN_ARMS=1 npm --prefix app test -- tests/usagi-model.test.ts -t '小手向' --testTimeout=120000` | 0，2 项通过 / 3 未选取；40.13 秒 | assets/model/022-arm-scan.log、usagi_arm_scan.report.json；最终部署 VRM |
| `npm --prefix app test -- tests/behavior-motion.test.ts tests/usagi-model.test.ts` | 0，36 项通过 | assets/model/022-test-motion.log；最终部署 VRM，正常默认超时 |
| `git diff --check` | 0 | 收尾空白检查 |
| `cmp assets/model/usagi.vrm assets/models/usagi.vrm` | 0 | 与 Python 字节比较、SHA-256 同时核对 |

最终两份 VRM SHA-256：c63bb267b3e65fa3f1e7e04d02221e65ac5c6c4ae0f6e795ba4d146f3bc9b149。

本轮初始诊断的零长投影异常现场 `usagi-prep-2vc0zdb3` 保留在系统临时目录；根因已经查明并修复。中间扫描触发默认 5 秒超时，最终使用显式诊断超时完成；标准测试默认超时下通过。没有运行完整 run_tests.sh、009/010/011 门禁脚本、app 全量 test、npm ci 或 smoke；后者均交门禁。

范围核对：所有当前 Git 改动和新增文件均在 allowed_paths 内，范围外 0。未运行任何主导操作。本次提交按用户明确安排由 AgentRouter 门禁前代办。

## 开工检索与逐项处置

第一组完整输出，命令 `rg -n 'ARM_REST|deepen_side_waist|smooth_face' app/tests pipeline/tests app/scripts docs/specs/checks`，使用与 grep 等价的完整检索，未截断：

```text
app/tests/renderer-cursor.test.ts:34:vi.mock('../src/renderer/motion', () => ({ ARM_REST: 1, MotionRig: class { reset() {} apply() {} }, sampleMotion: () => ({}) }));
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/tests/test_prep_usagi.py:283:            report = smooth_face(bm, regions)
app/tests/usagi-model.test.ts:7:import { ARM_RAISE, ARM_REST, MotionRig, sampleMotion } from '../src/renderer/motion';
app/tests/usagi-model.test.ts:35:  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -ARM_REST;
app/tests/usagi-model.test.ts:36:  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:69:    expect(ARM_REST).toBe(0);
app/tests/usagi-model.test.ts:107:    arms[0]!.rotation.z = -ARM_REST; arms[1]!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:116:      pose.bones.leftUpperArm![2] = ARM_REST + step * 0.05;
app/tests/usagi-model.test.ts:117:      pose.bones.rightUpperArm![2] = -ARM_REST - step * 0.05;
app/tests/behavior-motion.test.ts:4:import { ARM_RAISE, ARM_REST, MOTION_SECONDS, MotionRig, jumps, neutralPose, sampleMotion } from '../src/renderer/motion';
app/tests/behavior-motion.test.ts:189:    normalized.rotation.z = -ARM_REST; // Use the same neutral arm angle as the deployed model.
app/tests/behavior-motion.test.ts:263:  expect(stretch.bones.leftUpperArm![2] - ARM_REST).toBeCloseTo(ARM_RAISE.stretch);
app/tests/behavior-motion.test.ts:264:  expect(sampleMotion('shout', 0.55).bones.leftUpperArm![2] - ARM_REST).toBeCloseTo(ARM_RAISE.shout);
```

处置：renderer-cursor mock 不改（隔离 mock，且不在允许路径）；prep 的导入和局部 smooth_face 调用不改；真实模型测试的零角/静止角使用不改，将纯上臂步进改为多轴扫描；behavior-motion 保留现有相对角断言并加前臂检查。开工时 deepen_side_waist 已不存在，保留其删除结果。

第二组完整输出，命令 `rg -n 'waist|smooth' docs/specs/checks pipeline/tests`：

```text
pipeline/tests/test_shape_consistency.py:56:                       smooth_waist='off', waist_iterations=100))
docs/specs/checks/009-check.sh:8:         assets/model/preview_nosmooth/preview_sheet.png; do
docs/specs/checks/009-check.sh:14:  mkdir -p "$AR_GATE_ARTIFACT_DIR/preview" "$AR_GATE_ARTIFACT_DIR/preview_nosmooth"
docs/specs/checks/009-check.sh:16:  cp assets/model/preview_nosmooth/*.png "$AR_GATE_ARTIFACT_DIR/preview_nosmooth/"
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
pipeline/tests/test_prep_usagi.py:242:                       smooth_waist="off", waist_iterations=100))
pipeline/tests/test_prep_usagi.py:268:        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r"})
pipeline/tests/test_prep_usagi.py:283:            report = smooth_face(bm, regions)
```

逐项处置：shape 第56行与 prep 第242行的正式 off 保留；009-check.sh 三个引用全部不改；prep 第21/22行导入、第88行合成 on、第149/153/165/169/172行腰线合成算法与固定点断言全部保留；第200行 helper 仅将 ear 的转角改为正面投影；第210/227行合成椭圆和第268行真实两耳闭环调用保留；第283行脸部区域调用保留。

## 本轮文件清单

```text
app/src/renderer/motion/index.ts
app/tests/behavior-motion.test.ts
app/tests/usagi-model.test.ts
assets/model/022-arm-scan.log
assets/model/022-face.log
assets/model/022-prep.log
assets/model/022-rig.log
assets/model/022-test-motion.log
assets/model/022-test-prep.log
assets/model/022-test-shape.log
assets/model/preview/ears_closeup_front.png
assets/model/preview/preview_34.png
assets/model/preview/preview_back.png
assets/model/preview/preview_front.png
assets/model/preview/preview_landmarks_front.png
assets/model/preview/preview_landmarks_left.png
assets/model/preview/preview_left.png
assets/model/preview/preview_right.png
assets/model/preview/preview_sheet.png
assets/model/preview/tail_closeup_back.png
assets/model/preview_face/aa.png
assets/model/preview_face/angry.png
assets/model/preview_face/blink.png
assets/model/preview_face/blinkLeft.png
assets/model/preview_face/blinkRight.png
assets/model/preview_face/ee.png
assets/model/preview_face/expression_sheet.png
assets/model/preview_face/happy.png
assets/model/preview_face/ih.png
assets/model/preview_face/neutral.png
assets/model/preview_face/oh.png
assets/model/preview_face/ou.png
assets/model/preview_face/relaxed.png
assets/model/preview_face/sad.png
assets/model/preview_face/surprised.png
assets/model/preview_nosmooth/preview_34.png
assets/model/preview_nosmooth/preview_back.png
assets/model/preview_nosmooth/preview_front.png
assets/model/preview_nosmooth/preview_left.png
assets/model/preview_nosmooth/preview_right.png
assets/model/preview_nosmooth/preview_sheet.png
assets/model/preview_original/preview_34.png
assets/model/preview_original/preview_back.png
assets/model/preview_original/preview_front.png
assets/model/preview_original/preview_left.png
assets/model/preview_original/preview_right.png
assets/model/preview_rig/arms_down_70_45.png
assets/model/preview_rig/arms_down_70_front.png
assets/model/preview_rig/arms_up_45.png
assets/model/preview_rig/arms_up_front.png
assets/model/preview_rig/ears_back_25_45.png
assets/model/preview_rig/ears_back_25_front.png
assets/model/preview_rig/head_left_20_front.png
assets/model/preview_rig/head_left_30_45.png
assets/model/preview_rig/head_left_30_front.png
assets/model/preview_rig/neutral_t_45.png
assets/model/preview_rig/neutral_t_front.png
assets/model/preview_rig/one_leg_up_45.png
assets/model/preview_rig/one_leg_up_front.png
assets/model/preview_rig/pose_sheet.png
assets/model/usagi.vrm
assets/model/usagi_arm_scan.report.json
assets/model/usagi_base.glb
assets/model/usagi_body.vrm
assets/model/usagi_prep.report.json
assets/model/usagi_rig.blend
assets/model/usagi_rig.blend1
assets/model/usagi_shape.report.json
assets/models/usagi.vrm
pipeline/022-worker-report.md
pipeline/README.md
pipeline/blender/prep_usagi.py
pipeline/blender/region_boundary.py
pipeline/tests/test_prep_usagi.py
```
