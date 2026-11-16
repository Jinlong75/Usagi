---
id: 002
title: Blender 网格清理脚本与预览渲染脚本
type: code
worker: auto
allowed_paths:
  - pipeline/**
verify:
  - sh pipeline/run_tests.sh
gate_artifacts:
  - sh pipeline/run_tests.sh
expect_commit: true
verify_timeout_min: 15
review: true
---

## 目标

做两个可在命令行无界面运行的 Blender 脚本：
1. `pipeline/blender/cleanup_mesh.py`：把 Tripo 导出的 .glb 清理成干净的单个网格（合并重合点、删碎片、修法线、统一朝向/尺寸/原点），导出新的 .glb 和一份 JSON 报告。
2. `pipeline/blender/render_preview.py`：把任意 .glb / .vrm 渲染成正面、左侧、背面、右侧、斜 45° 五张 PNG 预览图，供主导验收每一步的模型。

再配一套用合成测试模型跑的自动测试，因为真正的 Tripo 模型还没到。

## 范围 / 不做什么

- 做：上面两个脚本、公共工具模块、测试、测试入口 `pipeline/run_tests.sh`、`pipeline/README.md`（用法说明，中文）。
- 不做：骨骼、权重、VRM 导出、表情、减面（decimate）、重新拓扑、贴图修改。
- 不改 `pipeline/` 以外任何文件；不往仓库提交测试生成的临时模型（测试产物写到临时目录或 `AR_GATE_ARTIFACT_DIR`）。

## 参照

- 目标与已定方案：`.agent-router/target.md`（D4：Blender 步骤全部写成命令行脚本）。
- Blender：`/Users/mac/Applications/Blender.app/Contents/MacOS/Blender`，版本 5.2.3 LTS；已安装 VRM 插件（本任务用不到）。
- 脚本运行方式：`blender -b --factory-startup --python <脚本> -- <参数>`。注意 `--factory-startup` 会禁用用户扩展；本任务不需要扩展，用它保证环境干净。
- Tripo 导出的 glb 通常是：一个或多个网格对象、带一张基础色贴图、有大量 UV 接缝处的重合点、偶尔有漂浮的小碎片、Y 轴向上（Blender 导入后自动转成 Z 向上）。

## 要求

### 公共

- Blender 可执行文件路径：环境变量 `BLENDER` 优先，否则用上面的默认路径；`run_tests.sh` 里实现这个逻辑，找不到时打印"找不到 Blender：<路径>"并以退出码 2 结束。
- 脚本参数用 `argparse` 解析 `--` 之后的部分；参数错误时打印用法并以非零退出（Blender 本身对 `--python` 里的异常不会改退出码，所以脚本要自己 `sys.exit(1)`，或在 `run_tests.sh` 里检查输出；保证失败时整个命令非零退出）。
- 只用 Blender 自带的 Python 和 bpy / bmesh / mathutils，不装第三方包。

### cleanup_mesh.py

参数：`--in <glb>` `--out <glb>` `--report <json>` `--merge-dist <米，默认 0.0001>` `--min-island-ratio <默认 0.005>` `--target-height <米，默认 1.0>`。

按顺序：
1. 清空场景，导入 glb。
2. 把所有网格对象合并成一个对象，名字 `Usagi_Body`；保留所有材质和 UV；删除空对象、相机、灯光等非网格对象。
3. 应用变换（位置、旋转、缩放）。
4. 按距离合并重合点（`--merge-dist`）；注意按距离合并会让 UV 接缝处的点合并后 UV 仍保持（Blender 合并顶点时面角 UV 保留），在报告里记录合并掉的点数。
5. 删除松散的点和边（不属于任何面的）、退化面（面积接近 0）。
6. 按连通块（island）统计面数，删除面数少于 `总面数 × --min-island-ratio` 的碎片块；报告里列出删掉的块数和面数。**不要**删大块（耳朵、尾巴可能是独立块）。
7. 重新计算法线朝外；报告里记录翻转前后"法线朝内的面"数量（可用和中心点方向比较的近似方法，写明是近似）。
8. 统一尺寸：按包围盒高度（Z）缩放到 `--target-height`；原点放在包围盒底面中心（脚底中心），对象位置归零；应用缩放。
9. 导出 glb（带材质贴图，`export_apply=True`，Y 向上），写报告。

报告 JSON 字段（全部必须有）：`input`、`output`、`objects_joined`、`verts_before`、`verts_after`、`faces_before`、`faces_after`、`merged_verts`、`removed_loose`、`removed_degenerate`、`islands_total`、`islands_removed`、`island_faces_removed`、`normals_flipped_estimate`、`non_manifold_edges`、`bbox_min`、`bbox_max`、`height`、`materials`（名字列表）、`textures`（贴图名字和尺寸列表）。

### render_preview.py

参数：`--in <glb|vrm>` `--out-dir <目录>` `--size <像素，默认 768>` `--prefix <文件名前缀，默认 preview>`。

- 导入 glb；`.vrm` 用 VRM 插件导入：脚本检测扩展名为 .vrm 时需要插件，所以 .vrm 模式**不能**带 `--factory-startup`；在 `pipeline/README.md` 写清楚。本任务测试只测 glb。
- 渲染引擎用 Workbench（快、无需 GPU 设置），着色用材质/贴图颜色，开轮廓线；正交相机自动对准模型包围盒，留 10% 边距；背景浅灰纯色。
- 输出 5 张：`<prefix>_front.png`、`<prefix>_left.png`、`<prefix>_back.png`、`<prefix>_right.png`、`<prefix>_34.png`（右前上方 45°），再拼一张 `<prefix>_sheet.png`（5 张横排，可用 Blender 合成或 bpy 图像像素拼接，不装 PIL）。
- 约定：模型正面朝 -Y（Blender 坐标，等同 glTF 的 +Z 朝前）。

### 测试

`pipeline/tests/` 下，用 Blender 跑的测试脚本（不依赖 pytest）；`pipeline/run_tests.sh` 依次运行全部测试，任一失败则整体非零退出，最后打印"全部通过 n 项"。

测试用脚本自己生成的合成模型（存临时目录），至少覆盖：
1. **重合点**：两个立方体，面全部拆开（每个面独立的 4 个点，模拟 UV 接缝），中间一个立方体法线翻转；再加 3 个很小的漂浮四面体碎片；导出 glb → 跑清理 → 断言：碎片被删、立方体保留、点数等于合并后的理论值（2 × 8）、没有法线朝内的面、高度等于 1.0（误差 1e-4）、包围盒底面中心在原点。
2. **大块不误删**：一个大球 + 一个面数约为球 3% 的独立小块（模拟耳朵）→ 默认参数下小块保留。
3. **报告字段**：报告包含上面列出的全部字段。
4. **导出可读回**：清理后的 glb 再导入一次，对象数为 1、材质数和输入一致。
5. **预览**：对清理后的合成模型跑 render_preview，断言 6 个 PNG 都存在、尺寸正确、不是全背景色（非背景像素比例 > 1%）。预览图输出到 `AR_GATE_ARTIFACT_DIR`（该环境变量存在时），否则输出到临时目录。
6. **参数错误**：缺 `--in` 时脚本以非零退出。

## 验收标准

- `sh pipeline/run_tests.sh` 退出 0，打印全部通过；门禁会保存预览图。
- 两个脚本都有中文的文件头注释说明用法；`pipeline/README.md` 写清楚命令示例（包括清理真实 Tripo 模型的命令：输入 `Material/tripo/usagi_tripo.glb`，输出 `assets/cleaned/usagi_clean.glb`、报告 `assets/cleaned/usagi_clean.report.json`、预览 `assets/cleaned/preview/`）。
- 全部测试在 3 分钟内跑完。

## 自测

自己跑 `sh pipeline/run_tests.sh`；中间可以单独跑某个测试脚本。

## 受影响的已有测试

无（仓库里还没有任何代码和测试）。搜过的关键词：test、pipeline、blender、.py。

## 换环境

Blender 路径用环境变量 `BLENDER` 覆盖；Windows 上不保证 `run_tests.sh` 可用（不要求）。

## 汇报要回答的问题

1. 合成模型 1 的合并点数、碎片删除数、法线翻转估计是否都和预期一致；如果某一步的 Blender 5.2 API 和旧版不同，写出用了哪个算子或 bmesh 函数。
2. `render_preview.py` 用 .vrm 输入时需要的条件（插件名、启动方式），你是否实际试过（可以用 `assets/placeholder/Seed-san.vrm` 试一次，不放进测试；试的结果写进汇报）。
3. 遇到 Blender 对 `--python` 异常返回 0 的问题时，你是怎样保证失败会让命令非零退出的。
