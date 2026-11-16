# Blender 网格清理与预览

仅使用 Blender 自带的 Python、bpy、bmesh、mathutils 和 Python 标准库，无需安装其他 Python 包。已在 Blender 5.2.3 LTS 验证。

## 运行真实 Tripo 模型

在仓库根目录执行。可先设置 `BLENDER` 覆盖本机默认路径：

```sh
BLENDER=${BLENDER:-/Users/mac/Applications/Blender.app/Contents/MacOS/Blender}

"$BLENDER" -b --factory-startup --python pipeline/blender/cleanup_mesh.py -- \
  --in Material/tripo/usagi_tripo.glb \
  --out assets/cleaned/usagi_clean.glb \
  --report assets/cleaned/usagi_clean.report.json

"$BLENDER" -b --factory-startup --python pipeline/blender/render_preview.py -- \
  --in assets/cleaned/usagi_clean.glb \
  --out-dir assets/cleaned/preview/
```

目录自动创建。输入与输出必须分开，避免覆盖原始模型。在 AgentRouter 环境里，启动 Blender 前按项目策略执行 `ar gui check Blender --headless`，通过后用 Blender 绝对路径启动。

## 清理参数与报告

`cleanup_mesh.py` 的参数全部位于 Blender 的 `--` 后：

| 参数 | 含义 | 默认值 |
| --- | --- | --- |
| `--in` | 必填，输入 GLB | — |
| `--out` | 必填，输出 GLB | — |
| `--report` | 必填，JSON 报告路径 | — |
| `--merge-dist` | 合并距离，米，有限非负数 | `0.0001` |
| `--min-island-ratio` | 删除面数严格小于总面数乘此比例的连通块，范围 0～1 | `0.005` |
| `--target-height` | 最终包围盒高度，米，有限正数 | `1.0` |

处理顺序：导入、合并为 `Usagi_Body`、删除非网格对象、应用世界变换、合并近点、删除退化面和松散点边、删除小连通块、重算法线、统一高度与脚底中心、导出。连通块按共享顶点判定；阈值按清理松散和退化几何后的**总面数**一次计算。大块不会按物理尺寸删除。退化面容差为 `max(1e-12 平方米, 最长边平方 × 1e-6)`，用于吸收单精度坐标的共线误差。

材质和面角 UV 保留，包括焊接位置上的 UV 接缝；材质内图像随 GLB 导出。不做减面、重拓扑、纹理修改或骨骼/权重处理。GLB 导出应用变换且 Y 向上。Blender 导入 GLB 时自动将 Y 向上转换为 Z 向上；约定正面沿 Blender **-Y**（glTF +Z），不根据几何猜测角色正面。最终网格顶点相对脚底包围盒中心，位置和旋转为零、缩放为一。

JSON 字段：

- `input`、`output`：解析后的模型路径；`objects_joined`：输入网格对象数。
- `verts_before`、`faces_before`：GLB 导入后的原始计数；`verts_after`、`faces_after`：清理完成、再次导出前的计数。
- `merged_verts`：距离合并删除的顶点数；`removed_loose`：`{"verts": 数量, "edges": 数量}`，不含随后碎片删除的几何；`removed_degenerate`：退化面数。
- `islands_total`、`islands_removed`、`island_faces_removed`：碎片过滤前的块数、删除块数及其面数。
- `normals_flipped_estimate`：`before` / `after` 为重算法线前后的朝内面数，`method` 写明近似方法。对每块，以面法线与“面中心减块顶点中心”的点积小于 `-1e-9` 判断朝内。**凹面、开放面可能误判**；此值是观察指标，实际修复使用 `bmesh.ops.recalc_face_normals`。
- `non_manifold_edges`：最终非流形边数（包括开放边），只报告，不补洞或改拓扑。
- `bbox_min`、`bbox_max`、`height`：Blender 坐标包围盒与高度，单位米。
- `materials`：保留的材质槽名字；`textures`：材质图像节点引用的图像列表，每项 `{"name": 名字, "size": [宽, 高]}`。

glTF 使用三角面，并会在 UV/法线接缝拆点；因此再次导入 GLB 的顶点数可能高于报告中的清理后顶点数，这不代表焊接失效。只被已删碎片使用的材质槽可能不再被 glTF 导出器写入。

## 五视图预览

`render_preview.py` 必填 `--in`、`--out-dir`；可选 `--size 768`（正整数）、`--prefix preview`（不含目录的文件名前缀）。

使用 Workbench、材质/贴图颜色、轮廓线、纯浅灰背景与正交相机。相机按各方向的包围盒投影自动取景，最长轴两侧各保留 10% 画幅边距。输出：

- `preview_front.png`：从 -Y 看。
- `preview_left.png`：从 -X 看。
- `preview_back.png`：从 +Y 看。
- `preview_right.png`：从 +X 看。
- `preview_34.png`：从右前上方看，方位角与仰角均为 45°。
- `preview_sheet.png`：按上述顺序横排，尺寸为 `5 × size` 乘 `size`。

Workbench 提供快速几何与基础颜色预览，不呈现完整 PBR/VRM 材质效果。

## VRM 输入

仅预览脚本支持 VRM；需要安装并在用户设置中启用 **VRM Add-on for Blender**（本机扩展名 `vrm`，算子 `bpy.ops.import_scene.vrm`）。**不要使用 `--factory-startup`**，它会禁用用户扩展。无插件时脚本以非零退出，并给出说明。

```sh
"$BLENDER" -b --python pipeline/blender/render_preview.py -- \
  --in assets/placeholder/Seed-san.vrm \
  --out-dir /tmp/usagi-vrm-preview --size 384 --prefix seed
```

VRM 的骨架依赖保留用于显示，脚本不编辑或导出骨架。自动测试只覆盖 GLB。

## 自动测试

```sh
sh pipeline/run_tests.sh
# 或指定其他安装位置
BLENDER=/absolute/path/to/Blender sh pipeline/run_tests.sh
```

入口优先使用环境变量 `BLENDER`，否则使用上述 macOS 默认路径。找不到可执行文件时打印 `找不到 Blender：<路径>`，退出码为 2。Windows 不保证 shell 入口可用。

测试在 Blender 内通过 unittest 运行，不依赖 pytest。合成带 UV 接缝的两个立方体（其中一个反向）、三个四面体碎片和嵌入贴图，再验证焊接、碎片过滤、法线、高度/原点、报告、材质/UV 回读、五视图与拼图、参数和运行异常，以及松散点边/退化面/非单位变换。另以大球和约 3.3% 面数的独立块验证默认阈值保留耳朵。

立方体加碎片仅 36 个三角面，默认 0.5% 阈值不足以删除每个 4 面的四面体，所以该测试显式传 `--min-island-ratio 0.12`；生产默认值仍为 0.005。预期：输入 84 点，焊接删除 56 点，删 3 块/12 面，最终 16 点/24 面，朝内面估计 12→0。

模型和中间数据写入系统临时目录，成功后清理；失败时保留临时目录及每次子命令日志，并打印现场路径。`AR_GATE_ARTIFACT_DIR` 存在时，六张预览 PNG 和 `synthetic-clean.report.json` 写入该目录供门禁保存；否则预览也写入临时目录。成功打印 `全部通过 n 项`，任意失败整体非零退出。

业务脚本捕获入口异常及 argparse 的 SystemExit，在失败时刷新标准输出/错误并调用 `os._exit(非零码)`，避免 Blender 吞掉 `--python` 异常后返回 0。测试对子脚本**不加** `--python-exit-code`，直接验证失败传播；测试外层使用 Blender 的 `--python-exit-code 1` 兜底入口导入或语法异常。
