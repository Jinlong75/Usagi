## 完成了什么

本轮主形状还原及全部产物重建已完成，但不能宣告 022 完成或可验收：保留原规则后，现有材质闭环测试与两项旧动作几何断言未通过。依据任务“做不通就停下汇报”，停止进一步改变分区或动作标准。

- 输入换为 `Material/tripo/usagi3d2.glb`，旧文件未删除；旧原始网格 5,276 顶点 / 10,278 面，新原始网格 14,809 顶点 / 29,414 面。
- 删除 `deepen_side_waist` 及其专用测试。合并距离从原始单位 0.0001 收紧为 0.000001，新网格没有合并顶点；只去掉 5 个退化面，没有减面。
- 原朝向判断依赖“次块小于主体 5%”，但新嘴部 3,138 面，已超过此限制。改用次块中心的中位数判断正面，转正后只删正面雕刻，保留背面独立尾巴。
- 脸部候选范围由 10 块独立五官的实际三维 AABB 各轴外扩 6 mm 得出；prep 和形状检查共用 `feature_regions` / `in_feature_region`。原始网格区域内 5,353 顶点，底模区域内 115 顶点（其余是删除的雕刻）。局部球面偏差最大 1.369 mm，已满足原 4 mm 容差，因此这 115 个点也没有移动。
- 新增双向 BVH 表面回归，直接比较未经清理的原始模型与已提交/临时重建底模；并新增原始模型同机位五视图与机器可读距离报告。
- 尾巴过大原因已定位：旧尾巴场的 0.025H 邻域覆盖独立球体几乎全部边，`cuts=3` 将 702 面近似乘以 16。改为只二等分实际跨越等值线的边；耳朵按新密度二等分。当前主体和尾巴为 2 个连通块，聚焦 009 检查通过，零面积面为 0；没有把尾巴焊到身体。
- 独立尾巴的 Body 色隐藏端盖也统一标为 Tail 蒙皮区域，跟随 Hips 子骨 Tail，避免端盖被躯干权重与白色球体拉开；保留原骨骼数量与弹簧参数。
- `ARM_REST=0`，保留伸懒腰/喊叫公式 `ARM_REST + 0.4/0.3`，注释含用户原话与日期。rig 没有把网格变为 T-pose，没有烘焙手臂姿势；骨骼直接位于原网格内。真实 VRM 的静止蒙皮顶点与导出原始位置差 <1e-6，聚焦无界面测试通过。
- `prep`、`rig`、`face` 均已成功运行；五官贴片从新网格重新生成，沿新表面法线外移原有 1.5 mm，`body_unchanged=true`，插件验证错误为空。最终 VRM 1,501,208 字节，未超过 5 MB，两份 VRM SHA-256 相同。
- 冒烟里的小手位置尚未观察：项目没有单项冒烟入口，本轮不运行全量 GUI；smoke-idle / walk / happy 交由门禁生成。

腰线真正原因已实测确认：旧固定 `.28 <= z <= .68` 候选带把腰线当球面异常。旧模型 10 个被改点全部位于 z<0.30，最大位移 17.075 mm；新模型 24 个被改点也全部位于 z<0.30，最大位移 21.831 mm。此后 015 额外的侧腰径向压入是另一处人为形变。证据见 `assets/model/usagi_022_experiments.report.json`。

最终形状检查（高度归一为 1，阈值 0.0005）：

| 方向 | 区域内顶点 | 区域外顶点 | 最大距离 | 最大距离位置 |
| --- | ---: | ---: | ---: | --- |
| base_to_original | 115 | 20241 | 6.10993069472e-08 | [0.038355596363544464, -0.0471285916864872, 0.8231558203697205] |
| original_to_base | 5353 | 9456 | 0 | [0.3466047942638397, -0.006106512621045113, 0.2628236413002014] |

## 改动了哪些文件

代码、测试和说明：

- `app/src/renderer/motion/index.ts`
- `app/tests/behavior-motion.test.ts`
- `app/tests/usagi-model.test.ts`
- `pipeline/build_usagi.sh`
- `pipeline/run_tests.sh`
- `pipeline/blender/prep_usagi.py`
- `pipeline/blender/rig_usagi.py`
- `pipeline/blender/render_preview.py`
- `pipeline/blender/check_shape.py`（新增）
- `pipeline/tests/test_prep_usagi.py`
- `pipeline/tests/test_shape_consistency.py`（新增）
- `pipeline/README.md`
- `pipeline/022-worker-report.md`（本汇报）

产物：`assets/model/usagi_base.glb`、`usagi_body.vrm`、`usagi.vrm`、`usagi_rig.blend`、关键点及 prep/rig/face 报告；`preview/`、`preview_nosmooth/`、`preview_rig/`、`preview_face/`；新增 `preview_original/`、`usagi_shape.report.json`、`usagi_022_experiments.report.json` 以及本轮聚焦验证日志。部署资源 `assets/models/usagi.vrm` 已同步。

未修改 `Material/`、`docs/specs/checks/`、颜色值、五官图集、骨骼数量或弹簧参数。未接触其他工作区或 020 的文件。按本次指令由 AgentRouter 在门禁前代提交，执行者未手动暂存或提交。

## TODO(lead) 清单

- `pipeline/blender/prep_usagi.py:split_region_boundaries` 留有 TODO(lead)：新模型沿原有分区场切分产生多条闭环及 >35° 转角。需主导确定后续分区计算方案；022 明确禁止改耳朵/尾巴分区规则，本轮没有自行取舍。
- 确认旧动作验收与本次绝对角度 0.4/0.3 的冲突应如何处理。没有调整角度、手臂长度或放宽旧几何断言。
- 完成全量门禁与 smoke 截图；本轮不宣称已通过完整验收。

## 推断清单

- “外扩一个小边距”采用各轴 6 mm；从实际雕刻包围盒得出，最低 z 为约 0.29884，且相应 Y/X 范围不包含 z≈0.28–0.29 的腰线顶点。
- 为适应新网格密度，耳朵采用二等分；尾巴仅对跨等值线的边二等分。保持所有分区函数及参数常量，未改变分区规则。
- 原始模型以头顶到脚底高度归一为 1，与 prep 清理归一方式相同；先归一再用相同转向函数处理原始模型，原始雕刻及尾巴均保留，作为 BVH 与预览基线。

## 偏离说明

- 本轮没有完成可验收交付：真实模型的材质边界测试失败，且两项旧动作测试与指定的新角度冲突。按任务“做不通就停下汇报”停止进一步实现，保留失败断言。
- 本轮自测使用相关 Blender 测试文件和两个相关 Vitest 文件，没有重复全量 `run_tests.sh` / 009、010、011 全脚本 / 全量 app test / 全量 GUI smoke；这些交门禁。另运行 009 的 Blender 聚焦检查以确认两块拓扑符合主导新要求。
- 开工使用 `rg -n` 执行与任务所列 grep 等价的完整检索；下方完整贴出该开工基线的命中内容，并通过 `git grep ... HEAD` 复核，未截断。

## 已知问题

1. `pipeline/tests/test_prep_usagi.py::test_09_real_product_boundaries` 失败：左耳 2 条闭环（最大转角 171.712° / 154.703°），右耳 1 条（110.546°），尾巴 3 条（102.965° / 29.161° / 33.126°）。原断言要求每区 1 条且最大转角 <35°。原始新网格在耳部有明显的局部法线跳变；尾巴表面和拟合球面有偏差，使原有球面/半空间场切出多块。分区规则与 35° 限值均未更改，失败不能归为环境问题。
2. `app/tests/usagi-model.test.ts` 的旧动作几何断言失败：stretch 小手 y=0.316257H，要求 >0.326459H（neck−0.02H）；shout 抬高 0.046937H，要求 >0.05H。原动作举手角度实际随 ARM_REST 从 0.75/0.65 变为本次指定的 0.4/0.3；没有为通过测试改变任务要求或放宽原断言。初次全文件运行还捕获了新增零角测试对 -0/+0 的 Object.is 区别，此处已改为比较角度绝对值，聚焦静止测试通过。
3. 没有修改允许清单外文件，不需要扩大文件路径范围；但上述分区规则及动作验收冲突需要主导决策。此状态应阻止合入，不能把下列局部通过理解为完整任务成功。

## 断言改写

- `pipeline/tests/test_prep_usagi.py`：原 `test_015_side_notch_pins_center_and_limits_depth` 要求压腰发生、左右对称、限制压入深度及固定支撑区 → 整条测试删除 → 用户明确否定 015 的侧腰做法，任务要求函数和专用测试一并删除；由新增双向 BVH 形状一致性检查防止侧腰或其他非法形变。
- 同文件 `test_09_real_product_boundaries` 两处“严格 1 个连通块” → “严格主体+尾巴 2 块，尾巴 <5% 面数、中心在背面、Tail 材质占比 ≥50%” → 新输入真实自带独立尾巴，与主导更新的 009 检查一致。零面积断言不变。
- 同文件 `test_07_face_sphere_local_bump` 原隐式调用全固定高度候选 → 显式传入凸起区域，保留原前后偏差与处理点数断言，新增区域外所有点逐坐标相等断言 → 新 API 严格限定五官范围。
- `app/tests/behavior-motion.test.ts` 原夹具静止上臂 -1.1 rad → 使用 `-ARM_REST`（本次为 0） → 与实际桌宠中性姿态一致；原“实际顶点超出缓存包围盒 0.5”及恢复状态等全部断言保持。
- `app/tests/usagi-model.test.ts`：新增 `ARM_REST=0`、两侧实际静止角为零、真实蒙皮顶点不变的断言；原有两个动作的高度/轮廓/复位断言全部保留，因此当前仍报告旧动作测试失败。
- `pipeline/tests/test_shape_consistency.py` 为新增文件，不删除/替换既有断言；分别检查已提交底模、临时重建底模、独立尾巴完整蒙皮区域。

## 反向实验

已实际临时恢复旧的 smooth_face 固定 z 候选函数，保持新的朝向/尾巴保留逻辑及其余流程，用临时 GLB 运行同一双向检查。底模→原始最大距离 0.009985227（9.985 mm），位置 [-0.2425501, -0.1451819, 0.2838300]；原始→底模最大距离 0.005096730（5.097 mm），位置 [-0.2044455, -0.1692721, 0.2818759]。两者均超过 0.0005，检查明确失败；临时文件随后随本轮临时目录清理，正式代码及产物未被改坏。证据在 `assets/model/usagi_022_experiments.report.json`。按任务要求仅用纯文字记录，不提供 json exec 代码块。

## 验证与证据

以下 B 表示 `任务约定的 Blender 绝对路径`，这里只写任务已约定的程序名，提交日志已去除本机隐私路径。所有 Blender 启动前已运行 `node <AgentRouter核心>/ar.mjs gui check Blender --headless`，退出 0；最初 shell 的 ar 指向系统归档命令，改用已安装 AgentRouter 核心执行正确的只读检查，未改变环境或守卫。

| 实际命令 | 结果 | 证据 |
| --- | --- | --- |
| `sh pipeline/build_usagi.sh prep` | 0 | `assets/model/build-prep-022.log`、原始与底模五视图 |
| `sh pipeline/build_usagi.sh rig` | 0；完整尾巴蒙皮修复后重建一次 | `assets/model/build-rig-022.log` |
| `sh pipeline/build_usagi.sh face` | 0 | `assets/model/build-face-022.log` |
| `cp assets/model/usagi.vrm assets/models/usagi.vrm` | 0 | 逐字节相同 |
| `B -b --factory-startup --python-exit-code 1 --python pipeline/tests/test_shape_consistency.py` | 0；最终 3 项通过 | `assets/model/test-shape-022.log` |
| `B -b --factory-startup --python-exit-code 1 --python docs/specs/checks/009-check-blend.py -- assets/model/usagi_base.glb assets/model/usagi_landmarks.json` | 0 | `assets/model/check-009-022.log` |
| `B -b --factory-startup --python-exit-code 1 --python pipeline/tests/test_prep_usagi.py` | 1；8 通过 / 1 失败，保留现场未反复运行 | `assets/model/test-prep-022.log`；临时现场 `usagi-prep-rhhb_07r` |
| `npm --prefix app ci` | 0 | `assets/model/npm-ci-022.log` |
| `npm --prefix app test -- --run tests/behavior-motion.test.ts` | 首次 1；夹具改为实际中性角后 0，31 项通过 | `assets/model/test-motion-022.log`（最终） |
| `npm --prefix app test -- --run tests/usagi-model.test.ts` | 1；2 通过 / 3 失败，其中新增 -0 比较问题已修复，旧动作 2 项失败保留 | `assets/model/test-usagi-model-022.log` |
| `npm --prefix app test -- --run tests/usagi-model.test.ts --testNamePattern '静止上臂'` | 0；1 通过 / 4 未选取，不代表全文件通过 | `assets/model/test-rest-022.log` |
| `git diff --check` | 0 | 收尾检查 |
| `cmp assets/model/usagi.vrm assets/models/usagi.vrm` | 0 | SHA-256 `dc6a8200f7342820c31b641a961ed649e7e10048b0a14b7002d53dd07d232e2f` |

## 开工检索与逐项处置

第一组完整输出（`rg -n 'ARM_REST|deepen_side_waist|smooth_face' app/tests pipeline/tests app/scripts docs/specs/checks`）：

```text
app/tests/behavior-motion.test.ts:4:import { ARM_REST, MOTION_SECONDS, MotionRig, jumps, neutralPose, sampleMotion } from '../src/renderer/motion';
app/tests/behavior-motion.test.ts:263:  expect(stretch.bones.leftUpperArm![2] - ARM_REST).toBeCloseTo(0.4);
app/tests/renderer-cursor.test.ts:34:vi.mock('../src/renderer/motion', () => ({ ARM_REST: 1, MotionRig: class { reset() {} apply() {} }, sampleMotion: () => ({}) }));
app/tests/usagi-model.test.ts:7:import { ARM_REST, MotionRig, sampleMotion } from '../src/renderer/motion';
app/tests/usagi-model.test.ts:35:  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -ARM_REST;
app/tests/usagi-model.test.ts:36:  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:87:    arms[0]!.rotation.z = -ARM_REST; arms[1]!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:95:      expect(hand.y - resting[i]!.y).toBeGreaterThan(height * 0.05); // rest is now at the notch (ARM_REST), so the lift is shorter
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions, deepen_side_waist)
pipeline/tests/test_prep_usagi.py:206:            report = deepen_side_waist(bm.verts, profile)
pipeline/tests/test_prep_usagi.py:302:            report = smooth_face(bm)
```

第二组完整输出（`rg -n 'waist|smooth' docs/specs/checks pipeline/tests`）：

```text
docs/specs/checks/009-check.sh:8:         assets/model/preview_nosmooth/preview_sheet.png; do
docs/specs/checks/009-check.sh:14:  mkdir -p "$AR_GATE_ARTIFACT_DIR/preview" "$AR_GATE_ARTIFACT_DIR/preview_nosmooth"
docs/specs/checks/009-check.sh:16:  cp assets/model/preview_nosmooth/*.png "$AR_GATE_ARTIFACT_DIR/preview_nosmooth/"
pipeline/tests/test_prep_usagi.py:21:from prep_usagi import (ear_inner_region, tail_region, smooth_waist, waist_depth,
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions, deepen_side_waist)
pipeline/tests/test_prep_usagi.py:88:                       report=str(cls.report_file), smooth_waist="on", waist_iterations=100))
pipeline/tests/test_prep_usagi.py:149:    def test_04_waist_depth_volume_and_pinned_vertices(self):
pipeline/tests/test_prep_usagi.py:153:            report = smooth_waist(bm, .5, half_width=.30, iterations=100)
pipeline/tests/test_prep_usagi.py:165:    def test_05_waist_off_and_excluded_arms_unchanged(self):
pipeline/tests/test_prep_usagi.py:169:            report = smooth_waist(bm, .5, half_width=.30, enabled=False)
pipeline/tests/test_prep_usagi.py:172:            smooth_waist(bm, .5, half_width=.30, trunk_limit=.15, iterations=10)
pipeline/tests/test_prep_usagi.py:201:        self.assertGreater(self.report["side_waist"]["vertices_processed"], 0)
pipeline/tests/test_prep_usagi.py:206:            report = deepen_side_waist(bm.verts, profile)
pipeline/tests/test_prep_usagi.py:228:    def assert_smooth_boundaries(self, obj, expected):
pipeline/tests/test_prep_usagi.py:238:    def test_08_synthetic_cut_ellipse_closed_and_smooth(self):
pipeline/tests/test_prep_usagi.py:255:        self.assert_smooth_boundaries(obj, {"ear_l"})
pipeline/tests/test_prep_usagi.py:263:        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r", "tail"})
pipeline/tests/test_prep_usagi.py:278:                       smooth_waist="off", waist_iterations=100))
pipeline/tests/test_prep_usagi.py:281:        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r", "tail"})
pipeline/tests/test_prep_usagi.py:302:            report = smooth_face(bm)
```

| 命中位置（开工行号） | 是否改动及原因 |
| --- | --- |
| `app/tests/renderer-cursor.test.ts:34` | 不改，光标测试的隔离 mock 与真实骨骼姿态无关，且不在允许清单。 |
| `app/tests/usagi-model.test.ts:7,35,36,87` | ARM_REST 的导入与使用保持；新增零角及真实静止表面验证。 |
| `app/tests/usagi-model.test.ts:95` | 删除已经不成立的 notch 注释，保留高度断言；该文件两项旧动作断言的失败如实汇报。 |
| `app/tests/behavior-motion.test.ts:4,263` | 导入及 stretch−ARM_REST=0.4 断言保持；另将旧包围盒测试夹具 -1.1 改为 -ARM_REST。 |
| `pipeline/tests/test_prep_usagi.py:21` | 保留 smooth_waist / waist_depth 的合成算法测试。 |
| `pipeline/tests/test_prep_usagi.py:22,206` | 删除 deepen_side_waist 导入及用户明确否定的 015 专用测试。 |
| `pipeline/tests/test_prep_usagi.py:88` | 合成 fixture 的 smooth_waist=on 保留，仅验证已有算法，不影响正式 off 底模。 |
| `pipeline/tests/test_prep_usagi.py:149,153,165,169,172` | 全部保持，原腰线算法/禁用/固定手臂与边界测试未放宽。 |
| `pipeline/tests/test_prep_usagi.py:201` | 属于整条 015 侧腰测试，按任务删除。 |
| `pipeline/tests/test_prep_usagi.py:228,238,255,263,281` | 原闭环数、闭合及 <35° 断言保持；真实模型检查因此保留失败。 |
| `pipeline/tests/test_prep_usagi.py:278` | 重建仍为 smooth_waist=off；只更新输入为新 GLB。 |
| `pipeline/tests/test_prep_usagi.py:302` | 改为显式凸起区域参数，添加区域外逐点不变断言。 |
| `docs/specs/checks/009-check.sh:8,14,16` | 全部不改；历史 preview_nosmooth 名称及门禁复制继续使用。 |
