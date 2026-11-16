## 完成了什么

在第 4 次已有提交上修复了门禁重出模型后的逐字节不一致；主导已接受的耳内、动作和形状实现保持不动。

上次未通过原因：009→010→011 会重新生成模型；prep 的 `split_region_boundaries` 用无序集合 `pending.pop()` 决定耳内分量报告顺序，`usagi_boundary_cut.ear_components` 又作为 extras 写进底模并传到两个 VRM。因此即使几何完全一致，重出后的文件也可能与部署副本不同，触发 app/tests/usagi-model.test.ts:58。

本次真实复现：

- 修复前先按顺序运行 009、010、011，三项均退出 0，`cmp assets/model/usagi.vrm assets/models/usagi.vrm` 退出 0；第一轮恰好与已提交模型相同。
- 同一份未修复源码再次完整运行 prep→rig→face；逐一 cmp 三份模型均退出 1。两个耳内报告从 `[2675, 2713]` 变成 `[2713, 2675]`（数字为面数）。三份模型的 BIN 块均相同；仅在分析副本中排序这一列表后，全部 JSON 也完全相同。未修改任何导出的 GLB/VRM 来规避断言。证据：assets/model/022-nondeterminism-before.json。
- 首次修复分量报告顺序后，新增完整链回归又检出 JSON 相同、BIN 不同。进一步定位到 `cut_isocontour` 的 `a, b = points`：集合两个交点的方向不确定，`face_split(a,b)` 与反向调用保留不同的原面槽，导致后续三角面索引及极少数法线不同；顶点位置不变。证据：022-nondeterminism-after-components.json 和 022-test-reproducibility-after-components.log。
- 最终修复两处来源：边切完后更新顶点索引，按顶点索引固定 face_split 方向；面切完后更新面索引，按最小面索引选耳内分量起点，分量内按面索引累计面积和法线。区域规则、阈值、材质、耳内平滑、顶点位置及动作代码均未改；逐材质三角形坐标多重集也与主导接受产物完全相同。没有固定全局随机数、修改导出文件字节或修改用户配置/VRM 插件。
- 新增独立进程回归：两轮都从真实 usagi3d2 输入完成 prep→rig→face，各阶段独立 Blender 进程，无预览、无部署复制，比较三份模型的完整字节与 SHA-256。已接入 pipeline/run_tests.sh。

前四次已接受结果继续沿用：旧输入 5,276 顶点 / 10,278 面，新输入 14,809 顶点 / 29,414 面；未减面。保留原始独立尾巴 353 顶点 / 702 面，蒙皮全 Tail，跟随 Hips 子骨 Tail。只删除正面独立雕刻五官，五官 AABB 每轴外扩 0.006，与形状检查共用区域函数；区域内原始 5,353 点、底模 115 点，现有面已满足拟合容差，这 115 点也未移动。

腰线根因沿用已完成反向实验结论：旧 smooth_face 的 `.28 <= z <= .68` 把腰线纳入球面异常处理；旧/新模型误动点均在 z<0.30，最大位移分别 17.075 / 21.831 mm。015 侧腰压入也已按用户要求删除。原实验仍在 assets/model/usagi_022_experiments.report.json。

rig 未摆 T-pose、未变更网格或骨位置；ARM_REST=0。主导接受的 stretch/shout 上臂 0.43、前臂 −0.10 rad（右侧 Z 取反）、手高 >neck−0.04H、抬高 >0.05H、突出轮廓 >0.025H 均不改。已接受余量及扫描依据保留在 assets/model/usagi_arm_scan.report.json。最终无界面真实 VRM 的静止无蒙皮形变、抬高/轮廓/手高及复位检查均通过。两动作最小抬高 0.0522166053H、相对 neck −0.0316316863H、突出轮廓 0.0250935868H，与第 4 次数值相同。桌宠 GUI 里的静止小手仍交门禁 smoke-idle/walk/happy 观察。

## 改动了哪些文件

本次源码、测试与说明：

- pipeline/blender/prep_usagi.py
- pipeline/tests/test_reproducibility.py（新增）
- pipeline/run_tests.sh
- pipeline/README.md
- pipeline/022-worker-report.md

本次产物与证据：assets/model/ 下最终重出的模型、报告、blend、预览、复现与聚焦测试日志、022-nondeterminism-before.json、最终一致性证据；assets/models/usagi.vrm。最终具体清单在本报告末尾。

没有修改 app 的源码/测试、docs/specs/checks/**、Material 输入、020 文件或其他任务工作区。按本次明确安排，由 AgentRouter 在门禁前代提交，执行者不自行暂存/提交。

## TODO(lead) 清单

- 运行剩余完整门禁（包括 app 全量 test、smoke），生成 smoke-idle/walk/happy 并审看桌宠位置。执行者只跑本次授权的复现步骤与聚焦检查。

## 推断清单

- 采用更新后的 BMesh 面索引固定诊断数据顺序，保留全部区域和形状算法；没有新增审美或动作取舍。

## 偏离说明

- 本次主导补充明确要求执行者真实运行 009→010→011 两轮（修复前复现、最终验证）；因此执行这三条特定命令。未运行其他全量验收、npm ci、app 全量 test 或 smoke。
- 原任务动作 0.4/0.3 与 neck−0.02H 已在前四次由主导批准覆盖；本次原样保留主导接受的动作、耳内和形状结果。
- 不自行 Git 写入，按本次用户明确说明由 AgentRouter 代提交。

## 已知问题

- 新增聚焦测试首次因错误地从执行者的隔离 HOME 推断 Blender 位置，在启动 Blender 前失败。已改为使用 run_tests.sh 导出的 BLENDER（或 PATH 中的 Blender），单独运行时显式指定。原失败日志保留为 022-test-reproducibility.log；这不是模型失败，也没有为此改范围外配置或替换守卫环境。
- 第一次模型回归（分量顺序修复后）检出上述切面方向问题，保留现场并继续定位，未循环求绿；第二次源码修复后先运行三次独立 prep（两次 cmp 均 0），再重新运行完整链回归。
- 未在执行者侧运行完整 app 验收与 GUI 冒烟，不将聚焦测试表述为完整验收通过。

## 断言改写

- 本次新增 pipeline/tests/test_reproducibility.py：严格要求独立进程的两轮完整构建三份模型逐字节相同，同时记录 JSON/BIN 比较及 SHA-256；没有删除、放宽或提高既有断言超时。
- app/tests/usagi-model.test.ts:58 的 `deployed.equals(source)` 原样保留；docs/specs/checks/** 原样保留。
- 前轮已批准改写继续沿用：删除侧腰凹口函数及其测试（用户否定）；严格一块改为主体+完整原始尾巴两块且尾巴 702 面/<5%/背面/全 Tail；脸部改为实际小区域并检查区域外逐点不变；耳内以 X/Z 正面投影测角 <35°，保留每耳单闭环与 3D 数值输出；手高 neck−0.02H 改为主导批准的 neck−0.04H，抬高和轮廓原阈值不变；动作扫描改为主导批准的多骨组合，静止零角/无蒙皮形变断言保留。本次没有再次改写这些断言。

## 反向实验

沿用本工作区前轮已实际完成并保留的反向实验：临时恢复旧 smooth_face 固定 z 区间，用临时 GLB 做同一双向检查。底模→原始最大 0.009985227（9.985 mm），位置 [−0.2425501,−0.1451819,0.2838300]；原始→底模 0.005096730（5.097 mm），位置 [−0.2044455,−0.1692721,0.2818759]，均超过 0.0005，检查失败。正式函数已恢复，最终重建/检查再次通过。本轮没有重复改变已证明的无关平滑算法。证据：assets/model/usagi_022_experiments.report.json。本节仅纯文字，无 json exec 块。

## 验证与证据

所有 Blender 调用均在 AgentRouter `gui check Blender --headless` 退出 0 后运行；系统 ar 是归档工具，使用已安装 AgentRouter 核心的只读入口。没有运行主导操作、改变权限或 AR 守卫变量。

| 实际命令 | 退出结果 | 证据 |
| --- | --- | --- |
| 修复前 `sh docs/specs/checks/009-check.sh` → `010-check.sh` → `011-check.sh` | 均 0 | assets/model/022-repro-009.log、022-repro-010.log、022-repro-011.log |
| 修复前第二轮 `sh pipeline/build_usagi.sh prep` → `rig` → `face` | 三阶段均 0；三份模型 cmp 均 1，确认不确定性 | 022-repeat-prep.log、022-repeat-rig.log、022-repeat-face.log、022-nondeterminism-before.json |
| 分量顺序修复后的独立进程回归 | 1，JSON 同而 BIN 不同；定位并修复切面方向 | 022-test-reproducibility-after-components.log、022-nondeterminism-after-components.json |
| 固定切面方向后三次独立 `prep_usagi.py` 无预览重出 | 均 0，两个 cmp 均 0 | 022-prep-reproducibility.json |
| `BLENDER=<项目约定路径> sh -eu -c '. pipeline/face/python_env.sh; "$FACE_PYTHON" pipeline/tests/test_reproducibility.py'` | 0，完整两轮三份模型均字节一致，1 项 / 142.316 秒 | 022-test-reproducibility-final.log |
| `B -b --factory-startup --python-exit-code 1 --python pipeline/tests/test_prep_usagi.py` | 0，9 项 / 29.422 秒 | 022-test-prep-final.log |
| 最终 `sh pipeline/build_usagi.sh prep` → `rig` → `face`，再 `cp assets/model/usagi.vrm assets/models/usagi.vrm` | 均 0 | 022-final-prep.log、022-final-rig.log、022-final-face.log |
| 最终 `sh docs/specs/checks/009-check.sh` → `010-check.sh` → `011-check.sh` | 均 0；三份模型重出前后实际 cmp 均 0，部署副本 cmp 也为 0 | 022-final-009.log、022-final-010.log、022-final-011.log、022-final-reproduction.json |
| `B -b --factory-startup --python-exit-code 1 --python pipeline/tests/test_shape_consistency.py` | 0，3 项 | 022-test-shape-final.log、usagi_shape.report.json |
| `npm --prefix app test -- tests/usagi-model.test.ts tests/behavior-motion.test.ts` | 0，2 文件 / 36 项 | 022-test-motion-final.log |
| `git diff --check` | 0 | 收尾空白检查 |

独立进程两轮一致的 SHA-256：

- usagi_base.glb：`012adab94af18bb2d9897b99839af81b5ac0a86853fd3a436b8bc48795ffa144`
- usagi_body.vrm：`6421b5b783fb035e6522ea24815cc6d6cb32b50261ea43cf6c1a2f753d93987a`
- usagi.vrm：`b427535e4b7363d29406bb2acbaac8bbc0d71a874316ef7f2b831466cfbda338`

最终三份模型与上述回归哈希全部相同，部署 usagi.vrm 为 1,467,356 字节。最终门禁重出后，已有的 deployed.equals(source) 在聚焦测试中已通过。双向形状距离仍为底模→原始 6.06433303574e-08、原始→底模 0，均 ≤0.0005。两方向最大距离位置分别为 [−0.0597119257,−0.0352125950,0.9786027074] 与 [0.3466047943,−0.0061065126,0.2628236413]；区域内点数分别为 115 / 5,353，区域外 19,580 / 9,456。

几何保留证据：assets/model/022-geometry-preserved.json。Body 32,008、EarInner 5,641、Tail 702 个三角面，逐材质的全部顶点坐标和三角形坐标多重集与主导接受的第 4 次产物相同。预览与 blend 随要求重出，不要求它们的渲染元数据逐字节稳定。

三次 git status 现场在 assets/model/022-reproduction-status.txt。修复前首次重出只出现预览、blend、prep/shape 诊断报告变化，三份模型碰巧相同；第二轮三份模型均变化，原因与 cmp/JSON/BIN 分析见上文；最终重出的改动清单如下，全部在 allowed_paths。临时比较副本已清理，失败回归现场仍保留在系统临时目录，提交日志已去除本机私有目录前缀。

## 开工检索与逐项处置

命令 `rg -n 'ARM_REST|deepen_side_waist|smooth_face' app/tests pipeline/tests app/scripts docs/specs/checks` 的完整输出：

```text
app/tests/renderer-cursor.test.ts:34:vi.mock('../src/renderer/motion', () => ({ ARM_REST: 1, MotionRig: class { reset() {} apply() {} }, sampleMotion: () => ({}) }));
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/tests/test_prep_usagi.py:285:            report = smooth_face(bm, regions)
app/tests/behavior-motion.test.ts:4:import { ARM_FOREARM, ARM_RAISE, ARM_REST, MOTION_SECONDS, MotionRig, jumps, neutralPose, sampleMotion } from '../src/renderer/motion';
app/tests/behavior-motion.test.ts:189:    normalized.rotation.z = -ARM_REST; // Use the same neutral arm angle as the deployed model.
app/tests/behavior-motion.test.ts:267:  expect(stretch.bones.leftUpperArm![2] - ARM_REST).toBeCloseTo(ARM_RAISE.stretch);
app/tests/behavior-motion.test.ts:268:  expect(sampleMotion('shout', 0.55).bones.leftUpperArm![2] - ARM_REST).toBeCloseTo(ARM_RAISE.shout);
app/tests/usagi-model.test.ts:7:import { ARM_FOREARM, ARM_RAISE, ARM_REST, MotionRig, sampleMotion } from '../src/renderer/motion';
app/tests/usagi-model.test.ts:35:  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -ARM_REST;
app/tests/usagi-model.test.ts:36:  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:69:    expect(ARM_REST).toBe(0);
app/tests/usagi-model.test.ts:126:    arms[0]!.rotation.z = -ARM_REST; arms[1]!.rotation.z = ARM_REST;
```

逐项处置：renderer-cursor mock 不改（范围外）；prep 的 smooth_face 导入/局部调用不改；app 真实模型零角/静止姿态/动作检查、behavior-motion 相对角及前臂检查全部不改；deepen_side_waist 已不存在，保持删除。

命令 `rg -n 'waist|smooth' docs/specs/checks pipeline/tests` 的完整输出：

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
pipeline/tests/test_prep_usagi.py:212:    def test_08_synthetic_cut_ellipse_closed_and_smooth(self):
pipeline/tests/test_prep_usagi.py:229:        self.assert_smooth_boundaries(obj, {"ear_l"})
pipeline/tests/test_prep_usagi.py:244:                       smooth_waist="off", waist_iterations=100))
pipeline/tests/test_prep_usagi.py:270:        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r"})
pipeline/tests/test_prep_usagi.py:285:            report = smooth_face(bm, regions)
```

逐项处置：009-check.sh 的三处 preview_nosmooth 引用全部不改；shape/prep 的正式 smooth_waist=off、合成夹具 on、腰线合成算法与固定点断言均不改；耳内闭环/正面角度 helper 及其合成与真实调用不改；局部 smooth_face 测试不改。本轮仅增加跨进程字节一致性回归。

## 本轮文件清单

```text
assets/model/022-final-009.log
assets/model/022-final-010.log
assets/model/022-final-011.log
assets/model/022-final-face.log
assets/model/022-final-prep.log
assets/model/022-final-reproduction.json
assets/model/022-final-rig.log
assets/model/022-geometry-preserved.json
assets/model/022-nondeterminism-after-components.json
assets/model/022-nondeterminism-before.json
assets/model/022-prep-reproducibility.json
assets/model/022-repeat-face.log
assets/model/022-repeat-prep.log
assets/model/022-repeat-rig.log
assets/model/022-repro-009.log
assets/model/022-repro-010.log
assets/model/022-repro-011.log
assets/model/022-reproduction-status.txt
assets/model/022-test-motion-final.log
assets/model/022-test-prep-final.log
assets/model/022-test-reproducibility-after-components.log
assets/model/022-test-reproducibility-final.log
assets/model/022-test-reproducibility.log
assets/model/022-test-shape-final.log
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
assets/model/usagi_base.glb
assets/model/usagi_body.vrm
assets/model/usagi_prep.report.json
assets/model/usagi_rig.blend
assets/model/usagi_rig.blend1
assets/models/usagi.vrm
pipeline/022-worker-report.md
pipeline/README.md
pipeline/blender/prep_usagi.py
pipeline/run_tests.sh
pipeline/tests/test_reproducibility.py
```

范围外改动 0；没有新增依赖，没有改写门禁检查或 app 字节断言。未运行完整 run_tests.sh、app 全量 test、npm ci 或 smoke；由门禁执行。提交按本次明确指令交由 AgentRouter 代办。
