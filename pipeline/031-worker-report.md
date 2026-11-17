## 完成了什么

完成连续臂根权重、独立保护检查、rig→face 重建及部署。源/部署 VRM 逐字节一致；没有移动骨骼、修改身体网格或动作程序。详细测量见 `assets/model/031-weight-measurements.json`。

影响系数（S 为 clamp 后的三次 smoothstep；r/t 为本侧臂根/臂尖；d 为到线段 r→t 的距离，单位 H=1m）：

```text
A = S(|r.x|−0.024, |r.x|, |x|)
  × (1−S(0.032, 0.052, d))
  × (1−S(r.z+0.027, r.z+0.052, z))
W = (1−A) × trunk_weights(point) + A × arm_chain(point)
```

旧候选框保留，仅作计算范围；其横向内边界、上下边界和前后边界上 A 均为 0。Face/Ear/Tail 优先级不变。躯干分配完整抽到 `trunk_weights()`，Head 刚性核心、径向过渡、颈部联合公式不变。

prep 实测腰线/头下沿基准 Z=0.2617585063，耳根 Z=0.7155061960。外侧 30% 短臂（排除最末端 5mm）实测最大截面距离 0.0306172123；向上取整采用臂半径 0.032。头侧距离阈值为 0.052，手核心半径为 0.0256。冻结 2,880 个头侧点、327 个手点；包含 6211 原位置，其对称附近实际点距离理想镜像 0.000488168H。

| 检查 | 改前 → 改后 | 阈值 |
| --- | --- | --- |
| 头侧最大双侧臂链总权重 | 1.000000030 → 0 | ≤0.05 |
| 手核心最小本侧臂链总权重 | 0.650554001 → 0.999999970 | ≥0.9 |
| 候选框相关拓扑边最大 Head 差 | 0.652662039 → 0.217470407 | ≤0.25 |
| Head 边差 >0.5 的边数 | 19 → 0 | 0 |
| yaw ±0.4、pitch ±0.25 手样本最大位移 | 0 → 0H | ≤0.0001H |
| 最大抬臂头侧最大位移 | 0.026327760 → 0H | ≤0.003H |
| 全部身体中性顶点位置误差（相对原产物） | 0 → 0.000000094317H | ≤0.000001H |
| 耳各节逐点权重误差 | 0 → 0 | ≤0.000001 |

最终身体 19,697 顶点，顶点对应及拓扑边与原产物一致。rig→face 的身体三角面、逐角点权重、骨骼 rest TRS、inverse bind 全部通过回读比较；face 导出会多拆一个材质接缝顶点，因此两阶段按实际三角面匹配。生产绑定前的耳权重另与原始 `.blend` 的逐点原权重比较，误差 0；自动热量权重也必须通过这些新约束，本次 `accepted=false`，采用 geometry 回退。

最多 4 个影响且归一化。181 点出现第 5 个影响，保留最大的 4 个并归一化；最大丢弃原始份额 0.0377041689（3.7704%）。原因是原躯干的 Spine/Chest/Head 三影响与臂链二影响重叠；保留既有躯干公式优先。截断后的最终产物仍通过上述全部边差、局部位移、耳权重与中性形状检查。

对比图：`assets/model/preview/031-before-after.png`；正面与 45°，yaw +0.4、程序最大抬臂，原权重/新权重均有真实 MToon 描边；下两行为固定裁剪的臂根特写。样本图：`assets/model/preview/031-protect-samples.png`（蓝头侧、红小手）。转头原尖刺消失，抬臂原凹折减轻；放大仍有细描边接线，不能宣称完全无接缝。渲染采用实际 three-vrm raw 骨矩阵；与 Blender 线性蒙皮的最大误差 2.9848852e−7H，证据 `assets/model/031-render-evidence.json`。

新 VRM：1,409,660 bytes；SHA-256：`3882eee01177a3e3f6fa4aee05cb2386cf7748c8478e0743551fdebddbca33f9`。

## 改动了哪些文件

- 权重与检查：`pipeline/blender/rig_usagi.py`、`pipeline/blender/arm_protection.py`。
- 测试与固定数据：`pipeline/run_tests.sh`、`pipeline/tests/test_rig_usagi.py`、`pipeline/tests/test_arm_protection.py`、`pipeline/tests/data/031-protect.json`、`pipeline/tests/data/031-baseline.json.gz`、`app/tests/usagi-model.test.ts`。
- 可复现图像工具：`pipeline/tests/capture_arm_poses.mjs`、`pipeline/blender/render_arm_protection.py`、`pipeline/face/compose_arm_protection.py`。
- 模型：`assets/model/usagi_body.vrm`、`assets/model/usagi.vrm`、`assets/model/usagi_rig.blend`、`assets/model/usagi_rig.report.json`、`assets/models/usagi.vrm`；按既有 build 流程更新 `assets/model/preview_rig/` 与 `assets/model/preview_face/` 的生成图。
- 两张 031 图、测量、渲染证据、自测和失败现场日志均在 `assets/model/`，完整具体文件清单见本节末尾。
- 汇报：`pipeline/031-worker-report.md`。按本次派发末尾要求，由 AgentRouter 在门禁前代为提交，本轮未自行执行 git add/commit。

```text
 M app/tests/usagi-model.test.ts
 M assets/model/preview_face/aa.png
 M assets/model/preview_face/angry.png
 M assets/model/preview_face/blink.png
 M assets/model/preview_face/blinkLeft.png
 M assets/model/preview_face/blinkRight.png
 M assets/model/preview_face/compare_reference.png
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
 M assets/model/usagi.vrm
 M assets/model/usagi_body.vrm
 M assets/model/usagi_rig.blend
 M assets/model/usagi_rig.report.json
 M assets/models/usagi.vrm
 M pipeline/blender/rig_usagi.py
 M pipeline/run_tests.sh
 M pipeline/tests/test_rig_usagi.py
?? assets/model/031-build-face-final.log
?? assets/model/031-build-face.log
?? assets/model/031-build-rig-baseline.log
?? assets/model/031-build-rig-final.log
?? assets/model/031-build-rig-preserved.log
?? assets/model/031-build-rig.log
?? assets/model/031-npm-ci.log
?? assets/model/031-render-evidence.json
?? assets/model/031-render-parent-updated.log
?? assets/model/031-render.log
?? assets/model/031-reverse-hardbox.log
?? assets/model/031-test-face-preservation.log
?? assets/model/031-test-protection-complete.log
?? assets/model/031-test-protection-final.log
?? assets/model/031-test-protection-fixed.log
?? assets/model/031-test-protection-passed.log
?? assets/model/031-test-protection-triangles.log
?? assets/model/031-test-protection.log
?? assets/model/031-test-rig-final.log
?? assets/model/031-test-rig-refined.log
?? assets/model/031-test-rig.log
?? assets/model/031-test-usagi-model-deployed.log
?? assets/model/031-test-usagi-model-final.log
?? assets/model/031-test-usagi-model.log
?? assets/model/031-weight-measurements.json
?? assets/model/preview/031-before-after.png
?? assets/model/preview/031-protect-samples.png
?? pipeline/031-worker-report.md
?? pipeline/blender/arm_protection.py
?? pipeline/blender/render_arm_protection.py
?? pipeline/face/compose_arm_protection.py
?? pipeline/tests/capture_arm_poses.mjs
?? pipeline/tests/data/
?? pipeline/tests/test_arm_protection.py
```

## TODO(lead) 清单

无新增代码 TODO。门禁按说明运行 009/010/011、完整流水线和应用冒烟；Windows 安装版实测及剩余细描边的产品判断由主导验收。

## 推断清单

- 臂半径采用实测外侧截面最大值上取整至 32mm，而不是任意缩小样本区域；实测方式与数值冻结在样本 JSON。
- 原模型不完全镜像，对 6211 的正侧使用 0.488mm 内的实际顶点；负侧原点距报告的六位坐标约 4e−7H。
- 导入/导出的 Float32 与接缝拆点属于表示差异：采样对应使用 ≤1e−6H 实际距离，rig→face 对实际三角面及权重逐点检查，不要求两阶段 accessor 顶点数量相等。

## 偏离说明

- 原任务「反向实验」要求只写文字；本次用户追加要求写 `json exec` 并运行预检，按较新的明确指令提供可执行实验。
- 初始系统 `ar` 是归档程序，`ar gui check blender --headless` 退出 1；随后均使用用户给定的 AgentRouter `core/ar.mjs gui check Blender --headless`，退出 0，未绕过守卫。
- 未运行完整 `pipeline/run_tests.sh`、009/010/011 或 GUI 冒烟；按「自测」仅运行相关脚本和模型测试，完整验收交给门禁。

## 已知问题

- 放大仍可见臂根细描边，图像已如实保留。所有指定数值阈值均满足。
- 原始合成体在新增检查下失败：圆柱表面半径 .027 大于手核心 .0256，手样本为空；低分辨率球面的长边自身跨越原颈部过渡。通过细化夹具解决，没有放宽任何阈值或删除已有断言。
- 开发中新的检查先出现参数解析、坐标舍入、镜像假设、接缝拆点及三角面排序问题；均定位后修正。导出前/后耳权重必须分别与对应基线比较，原始绑定权重与导出器微小权重裁减结果不能直接混比。失败日志保留，已完成检查的最终日志见下节。

## 断言改写

- `pipeline/tests/test_rig_usagi.py`：所有原有断言保持原样；夹具球面 `24×12 → 64×64`、手圆柱半径 `.027 → .024`，使新几何采样非空并让离散边分辨率足以检验 .25 连续性；新增候选边界为零及错误 Head 手权重必拒绝的断言。
- `pipeline/run_tests.sh`：原测试入口全部保留 → 新增 `test_arm_protection.py` → 将真实最终产物保护纳入门禁。
- `app/tests/usagi-model.test.ts`：原有全部模型、道具、动作及弹簧断言保持 → 新增五项真实 three-vrm 臂根保护测试 → 检查独立样本权重、四个头姿势和最大抬臂。
- `pipeline/blender/rig_usagi.py` 内旧生产检查：臂候选允许骨集合「本侧臂链+Chest」→「本侧臂链+Hips/Spine/Chest/Head」，腿集合不变 → 这是允许正常躯干混合的必要变更；同时加上独立几何保护、姿势、边差与原形状/耳权重约束，合成旧算法反向试验确实失败。
- 新增的保护测试开发中：样本浮点逐字相等 → 每点距离 ≤1e−6H；理想镜像必须完全同坐标 → 原点 ≤1e−6H、镜像附近 ≤.001H；rig/face accessor 数量与排序相等 → 实际全部三角面/权重匹配且保留面数；这些原本是新测试中的错误假设，均按任务本身的公差与允许的导出表示修正，五项任务阈值未改。

## 自测与证据

Blender 命令下文用 `$BLENDER` 表示 `pipeline/build_usagi.sh` 的默认绝对路径；所有 Blender 启动前均通过上文 AgentRouter 无头检查。生成和测试进程在当前回合内等到结束。日志提交前仅将本机绝对路径脱敏为 `<PROJECT>` / `<USER_HOME>` / `<TEMP>`，结果和异常文字保留。

| 实际执行入口 | 结果 | 证据 |
| --- | --- | --- |
| `sh pipeline/build_usagi.sh rig` | 最终退出 0 | `assets/model/031-build-rig-baseline.log` |
| `sh pipeline/build_usagi.sh face` | 退出 0 | `assets/model/031-build-face-final.log` |
| `npm --prefix app ci` | 退出 0 | `assets/model/031-npm-ci.log` |
| `$BLENDER -b --python-exit-code 1 --python pipeline/tests/test_rig_usagi.py` | 退出 0，10 项 | `assets/model/031-test-rig-final.log` |
| `$BLENDER -b --python-exit-code 1 --python pipeline/tests/test_arm_protection.py` | 退出 0，8 项 | `assets/model/031-test-protection-triangles.log` |
| `FACE_PYTHON=<临时 Pillow Python> $BLENDER -b --python-exit-code 1 --python pipeline/tests/test_face_usagi.py` | 退出 0，6 项 | `assets/model/031-test-face-preservation.log` |
| `npm --prefix app test -- usagi-model` | 退出 0，63 项 | `assets/model/031-test-usagi-model-deployed.log` |
| `node pipeline/tests/capture_arm_poses.mjs MODEL TMP_JSON`（原/新各一次）及 `$BLENDER -b --python-exit-code 1 --python pipeline/blender/render_arm_protection.py -- ...` | 退出 0，8 张对照帧+2 张样本帧 | `assets/model/031-render-parent-updated.log`、`assets/model/031-render-evidence.json` |
| 临时 Pillow 执行 `pipeline/face/compose_arm_protection.py --frames TMP --out assets/model/preview` | 退出 0 | 两张 031 PNG |
| 恢复旧硬盒子后仅运行上述 rig 聚焦入口 | 预期退出 1，源码 finally 恢复 | `assets/model/031-reverse-hardbox.log` |
| `git diff --check`、范围核对、VRM 字节比较和 SHA-256 | 退出 0 | 本汇报及测量 JSON |

未新增仓库依赖；图片排版使用项目既有版本 Pillow 11.3.0 的仓库外临时 venv。完整 GUI 截图/冒烟由门禁生成。

## 受影响的已有测试

开工已执行任务指定 `grep -rn "regions\|geometry_weights\|weight_report\|limb_isolation\|accepted\|test_02_weights_independent_masks\|test_05_pose_deformation_locality" pipeline docs/specs/checks app/tests`，退出 0。以下完整输出与开工基线一致，未截断：

```text
pipeline/face/measure_proportions.py:3:Fixed regions select features in the established comparison layout. Dark-ink
pipeline/face/measure_proportions.py:39:def neutral_metrics(image, regions):
pipeline/face/measure_proportions.py:40:    eyes = [feature(image, r) for r in regions[:2]]
pipeline/face/measure_proportions.py:41:    brows = [feature(image, r) for r in regions[2:4]]
pipeline/face/measure_proportions.py:42:    mouth = feature(image, regions[4])
pipeline/face/layout.py:34:# No cheek sculpture in source. Lead accepted these F01-derived anchors.
pipeline/report.md:17:2. 五官区域仍是 10 个真实独立雕刻块的三维包围盒，各轴外扩 6 mm；prep 与 BVH 检查共用 feature_regions / in_feature_region。原始区域内 5,353 顶点，底模区域内 115 顶点，底模本轮没有平滑移动顶点。最终双向最大距离及位置如下（高度归一为 1）：
pipeline/report.md:127:pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/report.md:128:pipeline/tests/test_prep_usagi.py:286:            report = smooth_face(bm, regions)
pipeline/report.md:138:pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/report.md:151:pipeline/tests/test_prep_usagi.py:286:            report = smooth_face(bm, regions)
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/tests/test_prep_usagi.py:228:        assign_regions(obj, {"height": 1}, {"l": sections})
pipeline/tests/test_prep_usagi.py:237:        self.assert_real_regions(obj)
pipeline/tests/test_prep_usagi.py:252:        self.assert_real_regions(obj)
pipeline/tests/test_prep_usagi.py:254:    def assert_real_regions(self, obj):
pipeline/tests/test_prep_usagi.py:283:            regions = [{"min": [-.031, -.31, .429], "max": [.031, -.20, .491]}]
pipeline/tests/test_prep_usagi.py:285:            report = smooth_face(bm, regions)
pipeline/tests/test_prep_usagi.py:287:                if not all(regions[0]["min"][i] <= before[i] <= regions[0]["max"][i] for i in range(3)):
pipeline/tests/test_rig_usagi.py:17:from rig_usagi import rig, HUMANOID, weight_report, vertex_weights, enable_vrm, geometry_weights
pipeline/tests/test_rig_usagi.py:109:    def test_02_weights_independent_masks(self):
pipeline/tests/test_rig_usagi.py:147:            report = weight_report(self.obj, self.arm, self.lm, self.kinds)
pipeline/tests/test_rig_usagi.py:194:    def test_05_pose_deformation_locality(self):
pipeline/tests/test_rig_usagi.py:232:        lower = geometry_weights(Vector((0, .05, neck-.04)), "trunk", self.arm, self.lm)
pipeline/tests/test_rig_usagi.py:233:        upper = geometry_weights(Vector((0, .05, neck+.04)), "trunk", self.arm, self.lm)
pipeline/tests/test_rig_usagi.py:243:        below = geometry_weights(Vector((0, -.22, neck-.06001)), "trunk", self.arm, self.lm)
pipeline/tests/test_rig_usagi.py:244:        above = geometry_weights(Vector((0, -.22, neck-.05999)), "trunk", self.arm, self.lm)
pipeline/tests/test_rig_usagi.py:253:        weights = [geometry_weights(Vector((0, y, .33+offset)), "trunk", self.arm, self.lm)["Head"]
pipeline/tests/test_pipeline.py:356:            regions = ((0, width // 2, 1), (width // 2, width, 0)) if textured else ((0, width, 0),)
pipeline/tests/test_pipeline.py:357:            for start_x, end_x, dominant in regions:
pipeline/tests/test_shape_consistency.py:40:        from rig_usagi import independent_tail_vertices, regions, geometry_weights
pipeline/tests/test_shape_consistency.py:46:        labels = regions(obj, lm)
pipeline/tests/test_shape_consistency.py:49:            self.assertEqual(geometry_weights(obj.data.vertices[index].co, labels[index], None, lm),
pipeline/README.md:92:脸部平滑与形状回归检查共用 `feature_regions` / `in_feature_region`：朝向转正后，逐个测量独立正面雕刻块的三维包围盒，各轴外扩 0.006 m。只有盒内底模顶点可参与脸部平滑；固定高度带与侧腰凹口已移除。新模型上的区域共包含 115 个底模顶点，现有表面已满足 4 mm 拟合容差，因此不移动这些顶点。
pipeline/README.md:160:先实际运行 `bpy.ops.object.parent_set(type="ARMATURE_AUTO")`，检查热量权重的归一化、影响数和全部区域硬约束；算子即使返回 FINISHED 也可能不合格。`automatic_weights.operator_finished` 与 `accepted` 分开记录，失败原因和尝试的统计一起保留。合格才采用热量权重，否则清除并重新生成几何权重：
pipeline/022-worker-report.md:101:pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/022-worker-report.md:102:pipeline/tests/test_prep_usagi.py:285:            report = smooth_face(bm, regions)
pipeline/022-worker-report.md:124:pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions)
pipeline/022-worker-report.md:136:pipeline/tests/test_prep_usagi.py:285:            report = smooth_face(bm, regions)
pipeline/blender/check_shape.py:60:def directed_distance(source, target_tree, regions):
pipeline/blender/check_shape.py:63:        if in_feature_region(v.co, regions):
pipeline/blender/check_shape.py:76:    regions = orientation['feature_regions']
pipeline/blender/check_shape.py:85:            forward = directed_distance(base, BVHTree.FromBMesh(raw), regions)
pipeline/blender/check_shape.py:86:            reverse = directed_distance(raw, BVHTree.FromBMesh(base), regions)
pipeline/blender/check_shape.py:92:            'normalized_height': 1, 'limit': limit, 'feature_regions': regions,
pipeline/blender/rig_usagi.py:149:def regions(obj, lm):
pipeline/blender/rig_usagi.py:193:def geometry_weights(point, kind, arm, lm):
pipeline/blender/rig_usagi.py:241:def weight_report(obj, arm, lm, kinds):
pipeline/blender/rig_usagi.py:243:    checks = {k: [] for k in ("ear_region", "ear_tip", "tail_region", "limb_isolation", "face_region")}
pipeline/blender/rig_usagi.py:271:            samples["limb_isolation"] += 1
pipeline/blender/rig_usagi.py:276:                checks["limb_isolation"].append(v.index)
pipeline/blender/rig_usagi.py:289:    kinds = regions(obj, lm)
pipeline/blender/rig_usagi.py:296:    auto = {"attempted": True, "operator_finished": False, "accepted": False}
pipeline/blender/rig_usagi.py:300:        auto["quality"] = weight_report(obj, arm, lm, kinds)
pipeline/blender/rig_usagi.py:301:        auto["accepted"] = auto["operator_finished"] and auto["quality"]["valid"]
pipeline/blender/rig_usagi.py:304:    if not auto["accepted"]:
pipeline/blender/rig_usagi.py:308:            weights = {n: w for n, w in geometry_weights(v.co, kind, arm, lm).items() if w > 1e-7}
pipeline/blender/rig_usagi.py:319:    report = weight_report(obj, arm, lm, kinds)
pipeline/blender/rig_usagi.py:539:                  weight_method="bone_heat" if auto["accepted"] else "geometry",
pipeline/blender/prep_usagi.py:85:def feature_regions(bm, margin=.006):
pipeline/blender/prep_usagi.py:93:    regions = []
pipeline/blender/prep_usagi.py:98:        regions.append({"min": [min(p[i] for p in points) - margin for i in range(3)],
pipeline/blender/prep_usagi.py:101:    return regions
pipeline/blender/prep_usagi.py:104:def in_feature_region(point, regions):
pipeline/blender/prep_usagi.py:106:               for box in regions)
pipeline/blender/prep_usagi.py:130:    regions = feature_regions(bm)
pipeline/blender/prep_usagi.py:143:            "feature_regions": regions, "feature_margin_m": .006,
pipeline/blender/prep_usagi.py:147:def smooth_face(bm, regions, tolerance=.004, iterations=30):
pipeline/blender/prep_usagi.py:150:    candidates = [v for v in bm.verts if in_feature_region(v.co, regions)]
pipeline/blender/prep_usagi.py:567:def assign_regions(obj, profile, ears):
pipeline/blender/prep_usagi.py:669:        face_report = smooth_face(bm, orientation["feature_regions"])
pipeline/blender/prep_usagi.py:690:    counts = assign_regions(obj, profile, ears)
```

逐项处理：

- `pipeline/tests/test_rig_usagi.py` 的 `test_02_weights_independent_masks`、`test_03_checker_detects_wrong_weights`、`test_05_pose_deformation_locality`、`test_07_neck_transition_spreads_head_turn`、`test_08_neck_face_blend_has_no_slope_kink`：原断言均不改；同文件只细化公共夹具并新增 test_09，全部通过。
- `pipeline/tests/test_shape_consistency.py` 的独立尾巴区域/权重断言：不改；本任务不改 Tail 分支、网格或 prep。
- `pipeline/tests/test_prep_usagi.py` 所有区域、脸部平滑断言：不改；未修改 prep、五官雕刻或腰线。
- `pipeline/tests/test_pipeline.py` 贴图区域检查：不改；与蒙皮无关。
- `pipeline/blender/rig_usagi.py` 的 regions/geometry_weights/weight_report、limb_isolation 和 automatic accepted：按本任务改，详见公式、独立约束及断言改写。
- `pipeline/blender/prep_usagi.py`、`pipeline/blender/check_shape.py` 的几何区域逻辑：不改。
- `pipeline/face/measure_proportions.py`、`pipeline/face/layout.py` 的命名命中：不改，与蒙皮分区无关。
- `pipeline/report.md`、`pipeline/022-worker-report.md`、`pipeline/README.md`：旧报告与说明中的命中全部保留，不重写历史记录。
- `docs/specs/checks`、`app/tests` 在开工查询中无命中；009/010/011 检查不改，`app/tests/usagi-model.test.ts` 仅增真实模型保护测试，其原断言不改。

## TODO(lead)

无新增代码 TODO；门禁与 Windows 复测见前文。

## 反向实验

把臂候选分支恢复为旧横向 smoothstep + Chest/臂链的硬盒子，生产 `weight_report` 应拒绝；真实旧产物会让新检查 1（头侧臂链）、2（手核心）、3（Head 拓扑边差）、4 的抬臂头侧位移失败。四个转头的小手位移检查原本就通过，它用于防止新权重反向串扰。已在当前代码上临时恢复旧分支、运行聚焦 rig 测试，退出 1 并出现 `Weight constraints failed`，之后恢复源码。下面供门禁按白名单完整命令复现。

```json exec
[
  {
    "file": "pipeline/blender/rig_usagi.py",
    "find": "        blend = arm_influence(point, side, lm)\n        trunk = trunk_weights(point, arm, lm)\n        return {**{name: w*blend for name, w in weights.items()},\n                **{name: w*(1-blend) for name, w in trunk.items()}}",
    "replace": "        root_x = abs(lm[f\"arm_root_{side}\"][0])\n        blend = smoothstep(root_x-ARM_ROOT_BLEND, root_x+ARM_ROOT_BLEND, abs(point.x))\n        return {**{name: w*blend for name, w in weights.items()}, \"Chest\": 1-blend}",
    "command": "sh pipeline/run_tests.sh",
    "expect": "Weight constraints failed"
  }
]
```
