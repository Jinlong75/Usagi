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
渲染前沿 Principled BSDF 的 Base Color（或 VRM/MToon 主贴图）选择基础色图像，并设为活动节点；不使用法线、粗糙度、金属度、ORM 或自发光分支的图像。无基础色贴图时使用材质基础色：全场景无基础色贴图则使用 Workbench `MATERIAL`；混合场景的 `TEXTURE` 模式下，无贴图材质也回退到材质颜色。Blender 5.2 不再支持关闭材质节点，因此仅在预览内存中清空这些无基础色贴图材质的节点树，防止自动选到数据图；不改写输入文件。

## VRM 输入

仅预览脚本支持 VRM；需要安装并在用户设置中启用 **VRM Add-on for Blender**（本机扩展名 `vrm`，算子 `bpy.ops.import_scene.vrm`）。**不要使用 `--factory-startup`**，它会禁用用户扩展。无插件时脚本以非零退出，并给出说明。

```sh
"$BLENDER" -b --python pipeline/blender/render_preview.py -- \
  --in assets/placeholder/Seed-san.vrm \
  --out-dir /tmp/usagi-vrm-preview --size 384 --prefix seed
```

VRM 的骨架依赖保留用于显示，脚本不编辑或导出骨架。自动测试覆盖 GLB 清理、预览和 VRM 1.0 绑骨回读。

## Usagi 底模整备（009）

```sh
sh pipeline/build_usagi.sh prep
```

入口使用 `Material/tripo/usagi_3d.glb`，复用清理流程，自动转正到 Blender -Y、删除雕刻五官、修整脸部、分配 Body／EarInner／Tail 材质和同名顶点组，并测量绑骨关键点。原始模型不改写，Blender 路径规则与测试入口一致。`rig` 阶段见下节；`face`、`vrm` 阶段仍只打印“尚未实现”。

`prep_usagi.py` 接受 `--in`、`--out`、`--landmarks`、`--report`，以及 `--smooth-waist on|off`（默认 **off**）和 `--waist-iterations`（默认 100）。用户已决定保留腰线，正式底模不做腰线平滑。

`prep` 产物：

- `assets/model/usagi_base.glb`：保留腰线的正式底模，含三种材质与顶点组数据。
- `assets/model/usagi_landmarks.json`、`usagi_prep.report.json`：正式底模的关键点与处理报告。
- `assets/model/preview/`：正式底模的六张预览，以及正面、左侧两张关键点叠图。
- `assets/model/preview_nosmooth/`：沿用历史目录名，内容为 `--smooth-waist on` 的**平滑版对照**六张预览。对照模型、关键点和报告只写临时目录，生成预览后清理，不覆盖正式产物。

`render_preview.py --landmarks <json>` 可额外输出 `<prefix>_landmarks_front.png` 和 `<prefix>_landmarks_left.png`。关键点使用米、Blender Z 向上、正面 -Y、角色左侧 +X；`neck` 取手臂根部上方 0.01～0.07 米的中央躯干最窄 X 截面。卡通模型没有清晰解剖颈部，`hips`、`chest`、`neck` 与四肢根部为绑骨参考值，绑定前需结合预览确认。

glTF 导入会在材质边界拆点；连通性测试在临时 BMesh 中以 `1e-6` 米距离焊接后，仍严格要求一个连通块。顶点组、材质和颜色的回读检查使用原导入网格。

## 自动测试

```sh
sh pipeline/run_tests.sh
# 或指定其他安装位置
BLENDER=/absolute/path/to/Blender sh pipeline/run_tests.sh
```

入口优先使用环境变量 `BLENDER`，否则使用上述 macOS 默认路径。找不到可执行文件时打印 `找不到 Blender：<路径>`，退出码为 2。Windows 不保证 shell 入口可用。

测试在 Blender 内通过 unittest 运行，不依赖 pytest。合成带 UV 接缝的两个立方体（其中一个反向）、三个四面体碎片和嵌入贴图，再验证焊接、碎片过滤、法线、高度/原点、报告、材质/UV 回读、五视图与拼图、参数和运行异常，以及松散点边/退化面/非单位变换。另以大球和约 3.3% 面数的独立块验证默认阈值保留耳朵。
颜色回归另导出两组合成 GLB：纯红基础色加蓝紫法线图，以及绿色基础色图加蓝紫法线图（同场景保留红色无基础色贴图材质）。渲染后检查 front 模型区域 RGB 均值，目标通道须比另外两通道分别高出 0.25，防止数据贴图被当作基础色；对应预览证据保存在 `normal-only/` 和 `base-and-normal/` 子目录。

立方体加碎片仅 36 个三角面，默认 0.5% 阈值不足以删除每个 4 面的四面体，所以该测试显式传 `--min-island-ratio 0.12`；生产默认值仍为 0.005。预期：输入 84 点，焊接删除 56 点，删 3 块/12 面，最终 16 点/24 面，朝内面估计 12→0。

模型和中间数据写入系统临时目录，成功后清理；失败时保留临时目录及每次子命令日志，并打印现场路径。`AR_GATE_ARTIFACT_DIR` 存在时，六张预览 PNG 和 `synthetic-clean.report.json` 写入该目录供门禁保存；否则预览也写入临时目录。成功打印 `全部通过 n 项`，任意失败整体非零退出。

业务脚本捕获入口异常及 argparse 的 SystemExit，在失败时刷新标准输出/错误并调用 `os._exit(非零码)`，避免 Blender 吞掉 `--python` 异常后返回 0。测试对子脚本**不加** `--python-exit-code`，直接验证失败传播；测试外层使用 Blender 的 `--python-exit-code 1` 兜底入口导入或语法异常。

## Usagi 绑骨与 VRM 1.0（010）

```sh
# AgentRouter 会话先检查；本机 ar 指向系统归档工具时使用 AgentRouter 的 ar.mjs 入口。
ar gui check Blender --headless
sh pipeline/build_usagi.sh rig
```

仅读取 `assets/model/usagi_base.glb` 和 `usagi_landmarks.json`，不重新运行 prep，不改底模、腰线或五官。使用 `rig_usagi.py` 的 `--in`、`--landmarks`、`--out`、`--report`，可选 `--blend`、`--preview-dir`；无预览参数时只绑定并导出，方便合成测试。所有输入坐标使用米、Blender Z 向上、正面 -Y、角色左手 +X。

本机插件模块为 **`bl_ext.blender_org.vrm`**。脚本通过 `addon_utils.modules()` 发现 `.vrm` 扩展，再调用 `addon_utils.enable(module, default_set=False)`，不写用户插件设置。rig 和 rig 测试启动 Blender **不带 `--factory-startup`**。调用 `bpy.ops.export_scene.vrm(filepath=..., armature_object_name="Armature", export_only_selections=False, use_addon_preferences=False, ignore_warning=True)` 导出；导出前先执行插件 `WM_OT_vrm_validator.detect_errors`，任何错误直接终止，提示和警告原文保存在报告的 `plugin_validation`。`ignore_warning` 只允许已记录的非错误信息继续导出。人形姿态设为 `restPositionPose`，保留关键点定义的 T 姿，不自动改变休息姿态。VRM 的固定 `licenseUrl` 由插件写入 `https://vrm.dev/licenses/1.0/`，其他元信息通过插件属性设置。

骨架包含 Hips→Spine→Chest→Neck→Head、左右肩与三段短臂、三段短腿、两耳各四节、Tail。骨骼局部 +Y 沿头尾方向，统一 `align_roll((0,-1,0))`，使局部 +Z 尽量朝前；与前向近乎平行的尾巴和脚骨使用世界 +Z 作为滚转参考，避免退化。耳尖和尾尖另加 `EarL_Tip`、`EarR_Tip`、`TailTip`，长度 0.012 米，作为运行时求末关节方向的显式子节点；不参与人形映射和权重，也不增加 spring joints（仍为 4、4、1）。

先实际运行 `bpy.ops.object.parent_set(type="ARMATURE_AUTO")`，检查热量权重的归一化、影响数和全部区域硬约束；算子即使返回 FINISHED 也可能不合格。`automatic_weights.operator_finished` 与 `accepted` 分开记录，失败原因和尝试的统计一起保留。合格才采用热量权重，否则清除并重新生成几何权重：

- 用骨骼线段距离选择邻近关节，并在相邻骨骼中心之间按投影参数做 smoothstep 过渡。每条链最多两个骨骼；耳根、臂根、腿根再混入一个躯干骨骼，最终最多三个影响，逐点归一化。
- 耳朵按 `head_top` 以上和左右侧分区，仅用本侧四节与 Head。耳根在第一节前半段平滑脱离 Head；中心间过渡宽度约一节耳长，末端 8% 顶点要求第四节 ≥0.8。
- 手臂根部混合宽 0.048 米，腿根 0.050 米。臂区限定根部附近的高度和深度；腿区限定低高度；左右分别处理。躯干只用 Hips、Spine、Chest 或 Head，避免远端四肢拉动身体。
- 颈部高度混合宽 0.050 米。`face_radius*0.6` 球内严格 100% Head，球外到 `face_radius*0.8` 连续退回颈部权重，避免保护区边缘突变；耳弯不影响头，脸部给 011 贴片保留刚性附着面。
- Tail 仅使用 009 保留的同名区域组，先缓存区域再执行自动权重，避免自动权重覆盖区域标签。Body/EarInner 分界不改变耳朵几何权重。

弹簧参数位于脚本顶部 `EAR_SPRING`、`TAIL_SPRING`，均使用基础 VRMC_springBone 1.0，无扩展碰撞形状。重力在 Blender 中为 `(0,0,-1)`，插件导出成 VRM `(0,-1,0)`。Head 球中心为 head_center、半径 `face_radius*0.95`；Chest 球中心为 hips/chest 中点、半径 `min(face_radius*0.70, 0.17)`。碰撞球偏移由世界关键点乘骨骼矩阵逆变换到骨骼局部坐标；两耳使用头与身体组，尾巴只使用身体组。三种 MToon 材质均使用任务指定底色/阴影色、`shadingShift=-0.05`、`shadingToony=0.95`、世界宽度 0.006 的深棕描边；十六进制 sRGB 颜色先转线性 RGB 后写入插件属性。

产物：

- `usagi_body.vrm`：VRM 1.0，供 three-vrm / UniVRM 后续导入。
- `usagi_rig.blend`：中性姿态，保留插件材质、骨架与权重，当前小于 20 MB。
- `usagi_rig.report.json`：逐骨长度/头尾/父级、人形映射、热量权重尝试与最终权重统计、各区域采样数及违规数、碰撞体/弹簧与校验消息。
- `preview_rig/`：`neutral_t`、`arms_up`（70°）、`arms_down_70`、`head_left_30`、`ears_back_25`（每节25°）、`one_leg_up`（大腿55°/小腿35°）各 `front` 和 `45` 两张图；`pose_sheet.png` 为六列两行，第一行正面、第二行斜45°，顺序同上。用 Cycles CPU、16 samples、插件实际 MToon 节点和描边渲染，固定相机画幅，便于比较变形；不依赖 Workbench 的替代轮廓线。

`pipeline/run_tests.sh` 最后运行 `test_rig_usagi.py`：合成球身/头、耳柱、短臂柱、短腿柱和尾球，附独立关键点与区域数据；实际尝试热量权重并验证最终结果。覆盖骨长与映射、独立坐标掩码的权重约束、故意写坏脸部权重后检查能否检出、耳弯变形局部性、GLB JSON 内元信息/材质/弹簧参数、碰撞体世界位置，以及 VRM 插件重新导入后的人形映射与 spring/collider 数量。原 cleanup/preview/prep 测试不变。测试成功清理临时产物，失败保留现场并返回非零；姿态截图由 rig 自测与 010 门禁生成。

UniVRM / Mate Engine 尚未实测。导出只使用 VRM 1.0、MToon 1.0、标准球碰撞体与最多四个权重通道，减少格式差异；Q 版极短四肢的通用人形动画重定向、单关节尾巴弹簧及 MToon 世界坐标描边在具体运行时中的表现，需要合流后确认。短臂上举会进入大头轮廓，几何比例没有在本阶段更改。
