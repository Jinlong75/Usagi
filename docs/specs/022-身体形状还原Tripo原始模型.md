---
id: 022
title: 换用更细致的 Tripo 模型 usagi3d2.glb 并严格保持其形状：撤掉侧腰凹口、脸部平滑不许碰腰线，手臂静止保持原始姿态
type: fix
worker: auto
effort: high
allowed_paths:
  - pipeline/**
  - assets/model/**
  - assets/models/usagi.vrm
  - app/src/renderer/motion/index.ts
  - app/tests/usagi-model.test.ts
  - app/tests/behavior-motion.test.ts
verify:
  - sh pipeline/run_tests.sh
  - sh docs/specs/checks/009-check.sh
  - sh docs/specs/checks/010-check.sh
  - sh docs/specs/checks/011-check.sh
  - npm --prefix app ci
  - npm --prefix app test
  - npm --prefix app run smoke
gate_artifacts:
  - npm --prefix app run smoke
expect_commit: true
verify_timeout_min: 45
review: true
---

## 目标

用户 2026-11-16 看了 015 的结果："还是不对，身子旁边有凸起，你直接看 material 下的 tripo 生成的原始 3d 模型，那个形状就是最标准的形状"。

同一天用户又放了一个更细致的模型："我在 material/tripo 下放了一个更加细致的乌撒气3d模型usagi3d2"——**`Material/tripo/usagi3d2.glb` 取代 `usagi_3d.glb` 成为流水线输入和形状标准**（主导已渲染核对：形状、朝向 +X 与旧模型一致，网格更密、雕刻五官更清楚；旧文件保留不删）。

**`Material/tripo/usagi3d2.glb` 的形状就是标准。** 除了去掉脸上雕刻出来的五官（眼、眉、嘴的小凸块，D3/D8：五官改用贴片），身体、头、腰线、小手、脚、耳朵、尾巴的形状都必须和原始模型一致。

主导已核对（Blender 渲染原始模型与 `assets/model/preview/preview_front.png` 对比）：

- 原始模型：头像帽子扣在身体上，头下沿一圈是**干净光滑的凹槽**（D8 要保留的腰线），小手是光滑的小圆柱。
- 015 之前：腰线正面一圈被抹得坑坑洼洼——推断是 `prep_usagi.py` 的 `smooth_face` 候选范围 `.28 <= z <= .68` 往下伸到了腰线（腰线约在 z≈0.29），把腰线正面也按"脸部球面"平滑了。请先核实这个推断，写进汇报。
- 015 之后：`deepen_side_waist` 在两侧又压了 38 mm 凹口，两侧出现鼓起（用户说的"身子旁边有凸起"）。

## 要求

0. **换输入**：`pipeline/build_usagi.sh`（两处）、`pipeline/tests/test_prep_usagi.py:273`、`pipeline/README.md:88` 里的 `Material/tripo/usagi_3d.glb` 改为 `Material/tripo/usagi3d2.glb`；prep 里依赖网格密度的参数（合并距离、五官碎块识别、耳朵细分次数等）按新网格核实，汇报写新旧网格顶点/面数。若新网格太密导致桌宠运行或门禁明显变慢（VRM 超过约 5 MB、冒烟超时），先汇报再决定是否减面，**不要擅自减面**。
1. **撤掉 015 的侧腰凹口**：`prep` 不再调用 `deepen_side_waist`；函数和它的测试一起删除（汇报的 `## 断言改写` 写明删了哪条测试、为什么——用户否定了这个做法）。
2. **脸部平滑只碰雕刻五官**：`smooth_face`（或替代做法）只能改动雕刻五官所在的小区域（眼、眉、嘴的凸起及周围一圈过渡，范围由五官凸起的实际包围盒外扩一个小边距得出，不用固定的 z 区间），**腰线凹槽及以下、头部其余部分一个顶点都不许动**。
3. **形状一致性检查（新增，写进 `pipeline/tests/`，由 `run_tests.sh` 跑）**：把 prep 输出的底模（`usagi_base.glb`，按 prep 自己的朝向/缩放变换逆回到原始坐标，或把原始模型变换到底模坐标）与 `Material/tripo/usagi3d2.glb` 比较：
   - 底模每个顶点到原始模型表面的最近距离（BVHTree），**五官区域以外最大 ≤ 0.5 mm**（按原始模型尺度换算；若原始模型单位不是米，按 prep 缩放后高度 1 的尺度写成相对值 0.0005）；
   - 反方向：原始模型五官区域以外的顶点到底模表面的最近距离同样 ≤ 0.5 mm；
   - 五官区域的定义与 prep 用的是同一个函数，报告里输出区域顶点数、两个方向的最大距离和最大距离所在位置；
   - 反向实验（汇报里只写纯文字，**不要写 ```json exec 代码块**，AgentRouter 缺陷 226）：临时恢复旧的 `smooth_face` z 区间或旧的 `deepen_side_waist` 调用，确认检查失败。
4. 耳朵内侧/尾巴分区的切线（`split_region_boundaries` 的线性细分与等值线切割）不应改变形状；若检查发现它们让顶点偏离原始表面超过阈值，修到不偏离（细分新增的点要落在原表面上）。
5. **手臂静止姿态 = 原始模型姿态**：`app/src/renderer/motion/index.ts` 的 `ARM_REST` 改为 `0`（桌宠静止时不旋转上臂，小手保持原始模型的位置，蒙皮不产生变形），注释写用户原话与日期。伸懒腰/喊叫的绝对抬角保持现值（它们是 `ARM_REST + 0.4/0.3`，改 0 后就是 0.4/0.3）。若 rig 阶段把手臂摆成了与原始模型不同的静止姿态（例如为 VRM 摆成 T-pose），汇报里写清楚，并让桌宠静止时的小手位置与原始模型一致（可改 rig，不许改原始网格形状）。
6. 整条流水线重出：`sh pipeline/build_usagi.sh prep`、`rig`、`face`，然后 `cp assets/model/usagi.vrm assets/models/usagi.vrm`（app 测试要求两者逐字节一致）。五官贴片位置随新表面重新贴合，别让贴片悬空或陷进去。
7. 不做：改颜色、五官图集（另有任务重画）、耳朵/尾巴分区规则、骨骼数量与弹簧参数；不改 `docs/specs/checks/**`；做不通就停下汇报，不改清单以外的文件。

## 验收产物

- `assets/model/preview/` 重出的五视图；另把**原始模型 usagi3d2.glb** 用同一个 `render_preview.py`、同一机位渲染一份放 `assets/model/preview_original/`（原始模型朝 +X，正面朝向用 prep 的同一变换摆正后再渲染，保证两套图正面对正面），供主导并排对比。
- 门禁冒烟截图 smoke-idle / walk / happy：两侧不能有鼓起，腰线像原始模型那样是一圈光滑凹槽，小手是光滑小圆柱。

## 受影响的已有测试

主导 2026-11-16 跑 `grep -rn "ARM_REST\|deepen_side_waist\|smooth_face" app/tests pipeline/tests app/scripts docs/specs/checks` 的完整结果：

```
app/tests/usagi-model.test.ts:7:import { ARM_REST, MotionRig, sampleMotion } from '../src/renderer/motion';
app/tests/usagi-model.test.ts:35:  vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = -ARM_REST;
app/tests/usagi-model.test.ts:36:  vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:87:    arms[0]!.rotation.z = -ARM_REST; arms[1]!.rotation.z = ARM_REST;
app/tests/usagi-model.test.ts:95:      expect(hand.y - resting[i]!.y).toBeGreaterThan(height * 0.05); // rest is now at the notch (ARM_REST), so the lift is sho…
app/tests/behavior-motion.test.ts:4:import { ARM_REST, MOTION_SECONDS, MotionRig, jumps, neutralPose, sampleMotion } from '../src/renderer/motion';
app/tests/behavior-motion.test.ts:263:  expect(stretch.bones.leftUpperArm![2] - ARM_REST).toBeCloseTo(0.4);
pipeline/tests/test_prep_usagi.py:22:                        prep, smooth_face, linear_color, assign_regions, deepen_side_waist)
pipeline/tests/test_prep_usagi.py:206:            report = deepen_side_waist(bm.verts, profile)
pipeline/tests/test_prep_usagi.py:302:            report = smooth_face(bm)
```

`docs/specs/checks/009/010/011-check.sh` 也会读底模与 VRM（主导维护，不在允许范围）；若新形状让其中某条检查失败，写"需要越界"停下，附失败输出，不要自己改检查。开工先重新跑上面这条 grep 并加跑 `grep -rn "waist\|smooth" docs/specs/checks pipeline/tests`（**不要截断**），完整贴进汇报，逐个说明改不改；改写断言在 `## 断言改写` 逐条写"原 → 新 → 原因"。

## 汇报要回答的问题

1. 腰线被抹坏的真正原因（核实主导的推断）。
2. 五官区域怎么界定、多少顶点；形状一致性检查两个方向的最大距离。
3. rig 的静止手臂姿态与原始模型是否一致；`ARM_REST=0` 后冒烟里的小手位置。
4. 是否需要越界。
