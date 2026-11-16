---
id: 009
title: Usagi 模型整备：转正、删雕刻五官、平滑腰线、分区上色、量关键点
type: code
worker: auto
effort: high
allowed_paths:
  - pipeline/**
  - assets/model/**
verify:
  - sh pipeline/run_tests.sh
  - sh docs/specs/checks/009-check.sh
gate_artifacts:
  - sh docs/specs/checks/009-check.sh
expect_commit: true
verify_timeout_min: 15
review: true
---

## 目标

把用户在 Tripo 生成的 `Material/tripo/usagi_3d.glb` 整理成后续绑骨可直接用的底模 `assets/model/usagi_base.glb`：正面朝 Blender -Y、删掉雕刻在脸上的五官、（可选）平滑腰部折痕、按部位分材质上平涂色、并量出绑骨要用的关键点写进 `assets/model/usagi_landmarks.json`。全部用命令行脚本完成，可重复跑。

## 范围 / 不做什么

- 做：新脚本 `pipeline/blender/prep_usagi.py`、一键脚本 `pipeline/build_usagi.sh`（本任务只实现 `prep` 阶段，留好后续阶段的入口）、测试、README 更新、产出 `assets/model/` 下的文件。
- 不做：骨骼、权重、VRM、五官贴片、表情（后续 010、011）；不改 `Material/` 下任何文件；不用 Tripo 贴图（模型本来就没有）。

## 参照

- 原始模型：`Material/tripo/usagi_3d.glb`（约 5276 顶点、10278 面；**无 UV、无贴图、无顶点色**，一个灰色 Principled 材质；**正面朝 +X**）。
- 用户生成时用的参考四视图：`Material/tripo/usagi_3d_ref.png`（正面、左侧、背面、右侧，有五官）。原作参考：`Material/tripo/refs/`。
- 主导用 `pipeline/blender/cleanup_mesh.py` 试跑得到的连通块（缩放到高 1.0、原点在脚底后，坐标为 Blender 坐标，正面 +X）：
  ```
  身体主块 faces=7982 x=-0.290..0.284 y=-0.345..0.345 z=0.000..1.000（含耳朵、手、脚、尾巴）
  faces=482 x=0.266..0.286 y=-0.055..0.050 z=0.366..0.404   ← 嘴
  faces=464 x=0.169..0.212 y=-0.213..-0.074 z=0.513..0.640  ← 眉
  faces=462 x=0.169..0.212 y=0.074..0.216  z=0.513..0.640   ← 眉
  faces=360 x=0.251..0.276 y=-0.035..0.034 z=0.303..0.373   ← 嘴下部
  faces=216 x=0.241..0.290 y=0.064..0.145  z=0.419..0.497   ← 眼
  faces=216 x=0.241..0.290 y=-0.145..-0.064 z=0.419..0.497  ← 眼
  faces=96  x=0.262..0.281 y=-0.023..0.017 z=0.349..0.383   ← 嘴部件
  ```
  预览（主导看过）：手臂高度处有一圈横向折痕（"腰线"），用户参考图里没有。
- 现有脚本：`pipeline/blender/cleanup_mesh.py`、`common.py`、`render_preview.py`，复用其中函数，不复制粘贴。
- 已定方案：`.agent-router/target.md` D3（五官用贴片做表情，所以底模脸上要干净）、D5（耳朵弹簧骨骼）。

## 要求

### 1. `prep_usagi.py`（参数：`--in`、`--out`、`--landmarks`、`--report`、`--smooth-waist on|off`，默认 on）
按顺序：
1. 复用 cleanup 的流程（合并、去碎片、法线、高 1.0、原点脚底中心）。
2. **转正**：自动判断正面方向——脸上的小块（面数 < 主块 5% 的连通块）中心所在的水平方向就是正面；把模型绕 Z 旋转到正面朝 **-Y**，应用变换。报告里写旋转角度。
3. **删雕刻五官**：删除除主块外的所有连通块（就是上面 7 块）；删除后检查脸部区域（正面、高度 0.28～0.68）的主块表面是否平滑：如果五官块下方的主块有凹陷或凸起（顶点到局部拟合球面的偏差 > 0.004），对该区域做局部平滑直到偏差 ≤ 0.004，并在报告里写处理了多少顶点。
4. **平滑腰线**（`--smooth-waist on` 时）：在手臂根部高度 ±0.06 的水平带里，只对身体躯干的顶点（排除手臂）做 Laplacian 平滑（保持体积，迭代次数做成参数），使剖面轮廓从头到身体连续、没有向内的折痕；手臂形状不变。报告里写平滑前后该带内"最大向内凹陷深度"。
5. **分区与材质**（平涂色，不需要 UV）：
   - `Body`：奶黄 `#FFF1C1`（默认，所有未分到其他区的面）
   - `EarInner`：粉 `#F7B8C4`——两只耳朵（头顶以上部分）朝**正面**一侧的中间区域（离耳朵边缘留出约 20% 宽度，做成一条长椭圆，不覆盖整个耳朵正面）
   - `Tail`：白 `#FFFFFF`——背后尾巴凸起的部分
   - 区域选择逻辑写成函数并单测（合成模型上能选对）。
   - 同时为每个区建同名顶点组（后续权重修复会用）。
6. **关键点**（`--landmarks` JSON，单位米，Blender 坐标，正面 -Y）：`height`、`feet_bottom`、`hips`（骨盆中心）、`chest`、`neck`（头身分界，取躯干剖面最窄处或手臂根部上方，写明算法）、`head_center`、`head_top`、`arm_root_l/r`、`arm_tip_l/r`、`leg_root_l/r`、`foot_l/r`（脚的底部前端）、`ear_base_l/r`、`ear_tip_l/r`（耳朵骨链的起点终点，沿耳朵中轴）、`ear_axis_l/r`（中轴上均匀 5 个点）、`tail`、`face_center`（正面脸部中心，在表面上）、`face_normal`、`face_radius`（脸部近似球面半径）。注意 VRM 左右以**角色自己**的左右为准（角色左手在 +X）。
7. 导出 `assets/model/usagi_base.glb`（保留材质与顶点组；glTF 的 Y 向上）。

### 2. `pipeline/build_usagi.sh`
- `sh pipeline/build_usagi.sh prep`：用 `Material/tripo/usagi_3d.glb` 跑 `prep_usagi.py`，产出 `assets/model/usagi_base.glb`、`usagi_landmarks.json`、`usagi_prep.report.json`、`assets/model/preview/`（`render_preview.py` 出的 6 张图，着色要显示材质颜色）；另外用 `--smooth-waist off` 再跑一份 `assets/model/preview_nosmooth/` 只出预览（不覆盖底模），方便主导对比。
- Blender 路径逻辑与 `run_tests.sh` 一致（`BLENDER` 环境变量优先）。
- 其他阶段名（`rig`、`face`、`vrm`）先打印"尚未实现"并退出 0。

### 3. 预览增强
`render_preview.py` 加一个可选参数 `--landmarks <json>`：在预览图上用小红点画出关键点（正面和侧面图），输出额外的 `<prefix>_landmarks_front.png`、`<prefix>_landmarks_left.png`。`build_usagi.sh prep` 要出这两张。

### 4. 测试（加进 `pipeline/run_tests.sh`）
- 合成模型：一个朝 +X 的"头身球 + 两根耳朵柱 + 正面三个小凸块（模拟五官）+ 背后一个小球（尾巴）"，跑 prep：断言正面转到 -Y（旋转 -90°）、小凸块被删、耳朵正面中部分到 EarInner、尾巴分到 Tail、关键点里 `ear_tip` 高于 `head_top`、`arm_root_l.x > 0`。
- 腰线平滑：合成一个有环形内凹的柱体，平滑后最大内凹深度减少到原来的 30% 以下，柱体两端顶点位置不变。

## 验收标准

- verify 两条通过（`009-check.sh` 由主导维护：跑 `build_usagi.sh prep`，校验产物和关键点字段齐全、正面朝 -Y、只剩一个连通块、三种材质都有面，并把预览图复制到门禁产物目录）。
- 主导看预览：转正、脸部干净、腰线（平滑 vs 不平滑）、耳朵内侧粉色位置、尾巴白色、关键点位置合理。

## 自测

`sh pipeline/run_tests.sh`、`sh pipeline/build_usagi.sh prep`，自己看一遍预览图。

## 受影响的已有测试

`pipeline/tests/` 下现有 7 项测试（cleanup、preview）不应改变；`render_preview.py` 新参数是可选的，原行为保持。搜过的关键词：render_preview、cleanup_mesh、run_tests。

## 换环境

无（只在本机 Blender 5.2 下运行）。

## 汇报要回答的问题

1. 删五官后脸部是否需要局部平滑，处理了多少顶点。
2. 腰线平滑前后的最大内凹深度，你更推荐哪个版本，为什么（主导最终看图决定）。
3. `neck` 的算法，以及各关键点是否有你觉得不可靠的（写出来）。
