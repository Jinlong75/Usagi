## 完成了什么

在已有 a1bc05e / 4389e89 的实现上继续修复，没有重做。**022 仍未完成，不能通过验收或合入：主导补充 B/C 实施后，暴露出两项仍需主导决定的几何约束冲突。**

上一次（第 2 次）没有通过，是因为执行者报告了分区语义需要越界，门禁只核对范围后停止，没有运行验收命令；“20 条命令无法判定”不计违规。主导本轮已用 A–E 解除旧阻塞。本次已落实授权的规则，没有沿用旧阻塞作为失败理由。

- 尾巴按连通块识别：背面、面数 <5% 的整个独立块全部标 Tail，主体 Tail 面数为 0；不再在新模型主体上运行 tail_field 切线。尾巴保持原始 353 顶点 / 702 面，不细分、不焊接。历史相连尾巴合成夹具保留原回退算法。
- 耳内场移除逐顶点 normal.y + 0.25 条件，只由原椭圆和位置条件决定；切割后对面连通分量用面积加权平均法线 y < -0.25 筛选。左右各保留一条闭环，平均法线分别约 -0.96192 / -0.96194。没有改变椭圆参数、颜色或图集。剩余 3D 转角仍为 82.2847° / 79.6626°，未放宽原 <35° 断言。
- ARM_REST 继续为 0，伸懒腰/喊叫抬臂统一为 0.75 rad。这是按 0.05 rad 步长、上限 1.2 rad，满足原两条高度断言并各留至少 0.01H 余量的最小值。0.70 的颈部余量不足。保留原轮廓断言后，两项动作测试仍失败，详见“已知问题”。
- 完成最终 prep → rig → face → cp 全链重出，底模、VRM、预览及原始同机位五视图都已更新。VRM 为 1,467,320 字节（约 1.47 MB），两份逐字节相同，SHA-256 为 919f8d19e93bc3cf836b129e4e76fbbc6b44d21c9fbc3dc98ad5c5a4e9b10297。没有减面：旧原始网格 5,276 顶点 / 10,278 面，新原始网格 14,809 顶点 / 29,414 面；最终 prep 内部 19,184 顶点 / 38,351 三角面（材质接缝导出会拆点）。
- 修复本次重出时发现的两项实现问题：嵌套 Blender 属性用 to_dict() 递归转为 JSON；最终退化边消融后再显式三角化，删除其产生的 5 个零面积面，避免 glTF 自行细分 n-gon 时输出退化三角面。没有放宽零面积检查或移动原始顶点。
- 按 D 删除全部点名诊断脚本、旧 retry 汇报与诊断 JSON/log；结论及本次角度扫描/局部折面数据保存在本报告和 assets/model/usagi_022_experiments.report.json。临时 .blend1 及本轮临时诊断日志也已清理。

任务要求的四个问题：

1. 腰线损坏原因沿用前次实测证据：旧 smooth_face 固定 .28 ≤ z ≤ .68 候选带误选腰线。旧模型被改 10 点全部 z<.30，最大 17.075 mm；新模型被改 24 点也全部 z<.30，最大 21.831 mm。015 的侧腰压入是另一处额外形变。不是新模型本身的轮廓问题。
2. 五官区域仍是 10 个真实独立雕刻块的三维包围盒，各轴外扩 6 mm；prep 与 BVH 检查共用 feature_regions / in_feature_region。原始区域内 5,353 顶点，底模区域内 115 顶点，底模本轮没有平滑移动顶点。最终双向最大距离及位置如下（高度归一为 1）：

| 方向 | 区域外顶点 | 最大距离 | 最大距离位置 |
| --- | ---: | ---: | --- |
| base_to_original | 19,580 | 6.06433303574e-8 | [-0.0597119257, -0.0352125950, 0.9786027074] |
| original_to_base | 9,456 | 0 | [0.3466047943, -0.0061065126, 0.2628236413] |

两方向均 ≤0.0005。正式底模和临时重建底模均通过形状测试。
3. rig 没有改网格静止姿态、摆 T-pose 或烘焙手臂形变。ARM_REST=0 的真实 VRM 蒙皮表面测试通过（所有检查顶点偏差 <1e-6），两只小手保留原模型静止位置。face 报告 body_unchanged=true，贴片沿新表面重建。没有运行全量 smoke，故不宣称已观察 smoke-idle / walk / happy；截图交门禁。
4. 不需要增加文件路径范围，但继续完成需要主导决定“需要越界”所列的语义范围冲突；执行者没有改动禁止的规则、几何标准或外部检查。

## 改动了哪些文件

相对本轮起点 a1bc05e：

- pipeline/blender/prep_usagi.py：尾巴整块着色、耳内分量法线筛选、导出退化面修复和递归报告序列化。
- app/src/renderer/motion/index.ts：新增 ARM_RAISE 常量并使用最小 0.75 rad 抬角，保留 ARM_REST=0。
- pipeline/tests/test_prep_usagi.py、pipeline/tests/test_shape_consistency.py：按主导决定更新尾巴断言，保留耳内闭环与转角检查。
- app/tests/behavior-motion.test.ts、app/tests/usagi-model.test.ts：断言引用新动作常量；新增真实几何的允许角度扫描，保留既有高度、轮廓及复位断言。
- pipeline/report.md：本次汇报。
- assets/model/ 下重出的底模、绑骨和最终 VRM、blend、关键点、prep/rig/face/shape 报告、preview / preview_nosmooth / preview_original / preview_rig / preview_face，以及构建和聚焦测试日志；usagi_022_experiments.report.json 补充本次证据。
- assets/models/usagi.vrm：同步部署资源。
- 删除 D 点名的 pipeline/022-boundary-diagnostic.py、pipeline/022-retry-report.md、assets/model/022-boundary-diagnostic.json、022-boundary-diagnostic.log、022-boundary-focused.log、022-shape-focused.log。

完整变更路径见文末。未修改 Material、docs/specs/checks、其他任务的文件、主工作区、公共配置、技能目录或 CLI 配置。无新增依赖。按本次指令交由 AgentRouter 在门禁前代提交，没有执行主导操作或自行提交。

## TODO(lead) 清单

- pipeline/blender/prep_usagi.py 的 TODO(lead)：确定原始耳部折面处的 3D 转角应如何达到 <35°；现有 position-only 切线已各一条闭环，但不满足转角。
- app/src/renderer/motion/index.ts 的 TODO(lead)：仅调整规定范围内的上臂角无法同时满足高度余量和原轮廓突出量。需要决定后续动作/绑骨方向，执行者不自行改变肩部动作、手臂长度、骨骼位置或放宽视觉断言。
- 解决上述冲突后再运行完整门禁及 smoke 截图；当前状态不可合入。

## 推断清单

- “平均法线满足原阈值”实现为面面积加权平均 normal.y < -0.25，避免细长三角面的数量影响筛选。
- 耳内最大转角位置在原表面折面上：左耳最大拐点 [0.03769182, -0.04731063, 0.80482763]，相邻边长约 0.001076H / 0.000171H，邻面法线 y 分别约 -0.447 / +0.032。证据指向原始耳部局部折面造成 3D 曲线急转；正面投影的椭圆已经连续，单纯增加线性细分不能去掉现存折点。不据此断言所有可能切线算法均无解。
- 主导 C 的“这两条断言、各留 0.01H 余量”按共享动作测试中的两项高度检查同时应用于 stretch / shout；两动作使用相同上臂、胸部和 Hips 姿势，所得最小角相同。
- 沿用上轮依据真实五官包围盒各轴外扩 6 mm 的选择，本轮没有重新扩大五官区域。

## 偏离说明

- 未达到 B 的耳内最大转角目标，以及保留全部既有动作几何断言后的通过状态。发现新的冲突后，没有追加未经授权的分区/动作取舍；仅完成已授权的产物重出、针对性自测和清理。
- 只跑相关 Blender 测试文件及两份相关 Vitest 文件，没有运行完整 run_tests.sh、009/010/011 验收脚本、npm ci、全量 app test 或 smoke。未使用跳过检查换取通过，失败未归为环境问题。
- 用 rg / git grep 的等价完整检索记录，未截断；文末按本轮开工 HEAD 复现命中，注明逐项处置。
- 反向实验按任务覆盖规则只写纯文字，不提供 json exec 代码块。

## 已知问题

1. 耳内真实产物测试失败，原断言完整保留。左耳 1 条闭环、258 段、最大转角 82.284716°；右耳 1 条闭环、253 段、79.662579°。尾巴、双连通块、零面积面的断言均先行通过。正式边界失败后该项测试没有进入临时重建分支；独立形状测试已完成临时 prep 重建。
2. stretch / shout 均在原“突出身体轮廓 >0.025H”处失败：当前只有 0.003266515H。0.75 rad 的抬高为 0.074458338H，比原 0.05H 下限多 0.024458338H；手高为 neck−0.009389936H，比原 neck−0.02H 下限多 0.010610064H，均满足主导新增余量。0.70 rad 只有 0.007952491H 的颈部余量，不合要求。完整扫描 0.05–1.20 rad 的 24 个允许值，没有一个同时满足两条高度余量和原轮廓要求。
3. 即使只看原高度要求、去掉本次新增余量，允许角度也没有同时满足全部原轮廓要求的值。例如 0.35 rad 的轮廓突出 0.025979821H，但手高仅 neck−0.033524410H；0.60 rad 能通过原两项高度要求，突出量却只剩 0.010173544H。
4. 最终自测：prep 8 通过 / 1 失败；shape 3 通过；两份动作相关测试合计 34 通过 / 2 失败（behavior-motion 31 全通过，usagi-model 3 通过 / 2 失败）。均为本次几何要求相关失败，没有为失败改无关文件，也没有重复运行同一失败以求绿。
5. 未执行全量 GUI 冒烟，不能评价桌宠最终画面或声称 smoke 已通过。VRM 未超过 5 MB，没有触发减面条件。

## 断言改写

- pipeline/tests/test_prep_usagi.py：真实模型 Tail “一条闭环、闭合、转角 <35°” → “Tail 面集合恰等于整个独立尾巴块、主体 Tail 面数=0、尾巴恰为原始 702 面”，保留两块、<5%、背面和零面积要求 → 新模型尾巴是独立网格，主导决定 A；ear_l / ear_r 的原闭环和 <35° 断言保留不放宽。两处相同的拓扑检查提取到 helper，正式产物和重建产物仍各调用一次，不减少覆盖。
- 同文件：尾巴材质占比 ≥50% → Tail 面集合与尾巴面集合严格相等 → 同一主导决定，强化整块着色与主体零 Tail 要求；增加切割后分量平均法线阈值检查。
- pipeline/tests/test_shape_consistency.py：独立尾巴蒙皮区域顶点数 >353 → 恰好=353 → 新尾巴不再细分或按材质切出缝线，必须保留原始整块；保留逐点 tail 标签、Tail=1 权重与双向 ≤0.0005 断言。
- app/tests/behavior-motion.test.ts：stretch 相对 ARM_REST 的抬角固定为 0.4 → ARM_RAISE.stretch（0.75）；并增加 shout=ARM_RAISE.shout（0.75）检查 → 主导决定 C，使用真实几何的最小合格高度角。其他动作断言不放宽。
- app/tests/usagi-model.test.ts：原两项高度、轮廓突出及结束复位断言 → 全部保留；新增允许角度扫描、0.01H 余量及当前常量为最小值的检查 → 验证主导 C，展示新发现的轮廓冲突。当前原轮廓断言仍失败，没有删除或降低阈值。
- 前次提交中按原任务删除的 deepen_side_waist 专用测试及其他旧断言改写，详见 pipeline/022-worker-report.md；本次没有再次删除测试。

## 需要越界

这里是语义范围，不申请扩大 allowed_paths，也没有越界实施。

- pipeline/blender/prep_usagi.py：B 指定的椭圆/位置切线及分量法线筛选已落实，仍在原始耳表面折面处出现 >35° 转角。继续处理需要主导明确是否允许进一步改变原椭圆/位置切线路径或采用其他局部边界方案；不自行移动原始耳朵、放宽转角或改门禁。
- app/src/renderer/motion/index.ts：C 指定的仅增大抬臂角、0.05 rad 步长且 ≤1.2 的变量范围已完整扫描。高度余量和原轮廓突出量不能同时满足；需要主导决定超出“只改抬臂角”的动作/绑骨处理范围或明确该轮廓要求的处理。原两项高度断言继续保留，不自行改身体、小手形状或其他测试标准。

## 反向实验

沿用 assets/model/usagi_022_experiments.report.json 中已实际运行的旧 smooth_face 固定 z 候选反向实验，未伪称本轮重跑。临时恢复旧候选后，底模→原始最大 0.009985227H，原始→底模最大 0.005096730H，均超过 0.0005，检查失败；现场已恢复。新尾巴/耳内处理不影响该反例对腰线形变的检出。按任务与缺陷 226 的要求，仅用纯文字记录。

## 验证与证据

B 表示 pipeline/build_usagi.sh 所配置的 Blender 绝对路径。所有 Blender 启动前均执行已安装 AgentRouter 核心入口的 gui check Blender --headless，退出 0；程序使用该绝对路径无头运行。没有改动权限、PATH、守卫变量或用户进程。提交日志中的私有根路径已替换为 <PROJECT> / <USER_HOME>，不改变结果。

| 实际命令 | 退出结果 | 证据 |
| --- | --- | --- |
| sh pipeline/build_usagi.sh prep | 最终 0；最初嵌套属性序列化失败已修复，最终退化面修复后再重出 | assets/model/build-prep-022.log、usagi_prep.report.json、usagi_shape.report.json |
| sh pipeline/build_usagi.sh rig | 0；prep 修复后同步重出 | assets/model/build-rig-022.log、usagi_rig.report.json |
| sh pipeline/build_usagi.sh face | 0；rig 重出后同步重出 | assets/model/build-face-022.log、usagi_face.report.json |
| cp assets/model/usagi.vrm assets/models/usagi.vrm | 0 | 最终两份 VRM |
| B -b --factory-startup --python-exit-code 1 --python pipeline/tests/test_prep_usagi.py | 最终 1，8 通过 / 1 失败；早期零面积断言失败已修复，新代码自测仍因原转角断言失败 | assets/model/test-prep-022.log、usagi_022_experiments.report.json |
| B -b --factory-startup --python-exit-code 1 --python pipeline/tests/test_shape_consistency.py | 0，3 通过 | assets/model/test-shape-022.log |
| npm --prefix app test -- --run tests/usagi-model.test.ts --testNamePattern '两只小手' | 1，初次角度扫描显示全部约束无共同解 | usagi_022_experiments.report.json 的 third_attempt.arm_angle_sweeps |
| npm --prefix app test -- --run tests/behavior-motion.test.ts tests/usagi-model.test.ts | 1，34 通过 / 2 失败 | assets/model/test-motion-022.log |
| cmp assets/model/usagi.vrm assets/models/usagi.vrm | 0 | 两份 SHA-256 相同 |
| git diff --check | 0 | 收尾检查 |

没有运行任务 verify 的完整门禁命令。pipeline/022-boundary-diagnostic.py 的本轮只读定位已运行（B -b --factory-startup --python-exit-code 1 --python pipeline/022-boundary-diagnostic.py，退出 0），结论已转录 experiments JSON；脚本按 D 删除，不是最终依赖。

## 开工检索与逐项处置

以下为本轮开工 a1bc05e 的完整命中（使用等价 git grep 复现；起始时已运行 rg，内容相同）。旧的 deepen_side_waist 调用和测试已在前次提交删除，因此本轮不会再命中。


第一组：ARM_REST|deepen_side_waist|smooth_face，范围 app/tests、pipeline/tests、app/scripts、docs/specs/checks。

~~~text
app/tests/behavior-motion.test.ts:4:import { ARM_REST, MOTION_SECONDS, MotionRig, jumps, neutralPose, sampleMotion } from '../src/renderer/motion';
app/tests/behavior-motion.test.ts:189:    normalized.rotation.z = -ARM_REST; // Use the same neutral arm angle as the deployed model.
app/tests/behavior-motion.test.ts:263:  expect(stretch.bones.leftUpperArm![2] - ARM_REST).toBeCloseTo(0.4);
app/tests/renderer-cursor.test.ts:34:vi.mock('../src/renderer/motion', () => ({ ARM_REST: 1, MotionRig: class { reset() {} apply() {} }, sampleMotion: () => ({}) }));
app/tests/usagi-model.test.ts:7:import { ARM_REST, MotionRig, sampleMotion } from '../src/renderer/motion';
app/tests/usagi-model.test.ts:35:  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -ARM_REST;
app/tests/usagi-model.test.ts:36:  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:69:    expect(ARM_REST).toBe(0);
app/tests/usagi-model.test.ts:107:    arms[0]!.rotation.z = -ARM_REST; arms[1]!.rotation.z = ARM_REST;
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/tests/test_prep_usagi.py:286:            report = smooth_face(bm, regions)
~~~

第二组：waist|smooth，范围 docs/specs/checks、pipeline/tests。

~~~text
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
pipeline/tests/test_prep_usagi.py:235:        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r", "tail"})
pipeline/tests/test_prep_usagi.py:255:                       smooth_waist="off", waist_iterations=100))
pipeline/tests/test_prep_usagi.py:258:        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r", "tail"})
pipeline/tests/test_prep_usagi.py:286:            report = smooth_face(bm, regions)
pipeline/tests/test_shape_consistency.py:56:                       smooth_waist='off', waist_iterations=100))
~~~

| 开工命中 | 本轮处置 |
| --- | --- |
| app/tests/renderer-cursor.test.ts:34 | 不改；隔离 mock、不在允许清单。 |
| app/tests/usagi-model.test.ts:7,35,36,69,107 | 静止角及 ARM_REST=0 断言保持；导入 ARM_RAISE 并新增允许角度扫描，所有原视觉断言保持。 |
| app/tests/behavior-motion.test.ts:4,189,263 | 导入新常量并将 0.4 改为新常量断言；-ARM_REST 中性夹具保持。 |
| pipeline/tests/test_prep_usagi.py:21,22,88 | 保留现有导入、smooth_face API 和合成腰线开关；未重新启用生产腰线平滑。 |
| pipeline/tests/test_prep_usagi.py:149,153,165,169,172 | 全部保留腰线合成算法、禁用及排除手臂断言。 |
| pipeline/tests/test_prep_usagi.py:200,210,227 | 保留边界 helper 的单闭环、闭合和 <35°，以及合成椭圆检查。 |
| pipeline/tests/test_prep_usagi.py:235,258 | 真实模型分离 Tail 的材质全块断言取代 Tail 闭环检查，耳内原断言不变；两处共用 helper。 |
| pipeline/tests/test_prep_usagi.py:255 | 临时重建 smooth_waist=off 保持。 |
| pipeline/tests/test_prep_usagi.py:286 | 五官区域限定的 smooth_face 和区域外逐点不变检查保持。 |
| pipeline/tests/test_shape_consistency.py:56 | 临时重建 smooth_waist=off 保持；本轮完整运行本文件 3 项。 |
| docs/specs/checks/009-check.sh:8,14,16 | 全部不改；完整验收脚本由门禁运行。 |

## 完整变更路径

本轮只交付以下允许范围内的改动（M 修改、D 删除、?? 新增；未自行暂存）：

~~~text
 M app/src/renderer/motion/index.ts
 M app/tests/behavior-motion.test.ts
 M app/tests/usagi-model.test.ts
 D assets/model/022-boundary-diagnostic.json
 D assets/model/022-boundary-diagnostic.log
 D assets/model/022-boundary-focused.log
 D assets/model/022-shape-focused.log
 M assets/model/build-face-022.log
 M assets/model/build-prep-022.log
 M assets/model/build-rig-022.log
 M assets/model/preview/ears_closeup_front.png
 M assets/model/preview/preview_34.png
 M assets/model/preview/preview_back.png
 M assets/model/preview/preview_front.png
 M assets/model/preview/preview_landmarks_front.png
 M assets/model/preview/preview_landmarks_left.png
 M assets/model/preview/preview_left.png
 M assets/model/preview/preview_right.png
 M assets/model/preview/preview_sheet.png
 M assets/model/preview/tail_closeup_back.png
 M assets/model/preview_face/aa.png
 M assets/model/preview_face/angry.png
 M assets/model/preview_face/blink.png
 M assets/model/preview_face/blinkLeft.png
 M assets/model/preview_face/blinkRight.png
 M assets/model/preview_face/ee.png
 M assets/model/preview_face/expression_sheet.png
 M assets/model/preview_face/happy.png
 M assets/model/preview_face/ih.png
 M assets/model/preview_face/neutral.png
 M assets/model/preview_face/oh.png
 M assets/model/preview_face/ou.png
 M assets/model/preview_face/relaxed.png
 M assets/model/preview_face/sad.png
 M assets/model/preview_face/surprised.png
 M assets/model/preview_nosmooth/preview_34.png
 M assets/model/preview_nosmooth/preview_back.png
 M assets/model/preview_nosmooth/preview_front.png
 M assets/model/preview_nosmooth/preview_left.png
 M assets/model/preview_nosmooth/preview_right.png
 M assets/model/preview_nosmooth/preview_sheet.png
 M assets/model/preview_original/preview_34.png
 M assets/model/preview_original/preview_back.png
 M assets/model/preview_original/preview_front.png
 M assets/model/preview_original/preview_left.png
 M assets/model/preview_original/preview_right.png
 M assets/model/preview_rig/arms_down_70_45.png
 M assets/model/preview_rig/arms_down_70_front.png
 M assets/model/preview_rig/arms_up_45.png
 M assets/model/preview_rig/arms_up_front.png
 M assets/model/preview_rig/ears_back_25_45.png
 M assets/model/preview_rig/ears_back_25_front.png
 M assets/model/preview_rig/head_left_20_front.png
 M assets/model/preview_rig/head_left_30_45.png
 M assets/model/preview_rig/head_left_30_front.png
 M assets/model/preview_rig/neutral_t_45.png
 M assets/model/preview_rig/neutral_t_front.png
 M assets/model/preview_rig/one_leg_up_45.png
 M assets/model/preview_rig/one_leg_up_front.png
 M assets/model/preview_rig/pose_sheet.png
 M assets/model/test-motion-022.log
 M assets/model/test-prep-022.log
 M assets/model/test-shape-022.log
 M assets/model/usagi.vrm
 M assets/model/usagi_022_experiments.report.json
 M assets/model/usagi_base.glb
 M assets/model/usagi_body.vrm
 M assets/model/usagi_face.report.json
 M assets/model/usagi_landmarks.json
 M assets/model/usagi_prep.report.json
 M assets/model/usagi_rig.blend
 M assets/model/usagi_rig.report.json
 M assets/model/usagi_shape.report.json
 M assets/models/usagi.vrm
 D pipeline/022-boundary-diagnostic.py
 D pipeline/022-retry-report.md
 M pipeline/blender/prep_usagi.py
 M pipeline/tests/test_prep_usagi.py
 M pipeline/tests/test_shape_consistency.py
?? pipeline/report.md
~~~
