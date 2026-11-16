# Blender 网格清理与预览

清理、整备和绑骨仅使用 Blender 自带的 Python、bpy、bmesh、mathutils 和 Python 标准库。011 五官图集使用仓库外临时 Pillow 环境，运行时测试使用临时 npm 环境（见末节）。已在 Blender 5.2.3 LTS 验证。

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

入口使用 `Material/tripo/usagi3d2.glb`，复用清理流程，自动转正到 Blender -Y、仅删除正面雕刻五官、保留独立尾巴、局部修整脸部、分配 Body／EarInner／Tail 材质和同名顶点组，并测量绑骨关键点。原始模型不改写，Blender 路径规则与测试入口一致。`rig` 阶段见下节；`face` 阶段见 011 小节；`vrm` 保留入口仍只打印“尚未实现”。

`prep_usagi.py` 接受 `--in`、`--out`、`--landmarks`、`--report`，以及 `--smooth-waist on|off`（默认 **off**）和 `--waist-iterations`（默认 100）。用户已决定保留腰线，正式底模不做腰线平滑。

脸部平滑与形状回归检查共用 `feature_regions` / `in_feature_region`：朝向转正后，逐个测量独立正面雕刻块的三维包围盒，各轴外扩 0.006 m。只有盒内底模顶点可参与脸部平滑；固定高度带与侧腰凹口已移除。新模型上的区域共包含 115 个底模顶点，现有表面已满足 4 mm 拟合容差，因此不移动这些顶点。

`test_shape_consistency.py` 随 `run_tests.sh` 检查已生成与临时重建的底模。`check_shape.py` 直接导入未经清理的原始模型，使用 prep 的归一化与转向，以 BVHTree 双向比较区域外表面，最大距离必须 ≤0.0005（高度归一为 1）。`usagi_shape.report.json` 记录两个方向的区域顶点数、最大距离与位置。`preview_original/` 使用同一预览器、同一机位，保留原始雕刻五官，仅变换到 prep 坐标。

`prep` 产物：

- `assets/model/usagi_base.glb`：保留腰线的正式底模，含三种材质与顶点组数据。
- `assets/model/usagi_landmarks.json`、`usagi_prep.report.json`：正式底模的关键点与处理报告。
- `assets/model/preview_original/`：归一化并转正的原始模型五视图，保留全部雕刻与原始形状。
- `assets/model/usagi_shape.report.json`：相对原始表面的双向距离。
- `assets/model/preview/`：正式底模的六张预览、正面/左侧关键点叠图，以及 `ears_closeup_front.png`、`tail_closeup_back.png` 两张聚焦特写。
- `assets/model/preview_nosmooth/`：沿用历史目录名，内容为 `--smooth-waist on` 的**平滑版对照**六张预览。对照模型、关键点和报告只写临时目录，生成预览后清理，不覆盖正式产物。

分区沿连续标量的零等值线切网格：耳朵保持原长椭圆的 60% 横向宽度、0.43 半长、0.51 中心和 0.08～0.94 高度参数，前侧位置条件进入连续标量，切割后按连通分量的面积加权平均法线 Y<−0.25 筛选，避免原始折面的逐点法线跳变切碎耳内区域。沿共享边二分求交点，再拆三角面；按原面上线性标量的中心值确定碎片归属，避免瘦长外侧碎片因非线性曲率被重新染色。交点共享，最后清理退化边并三角化；三种材质、顶点组和 `_USAGI_REGION` 位掩码不变。

新模型自带更密的网格：耳朵局部二等分（`cuts=1`），原始独立尾巴整块保留，不细分也不切线；仅相连尾巴的历史合成夹具继续使用原尾巴场。细分为线性细分；耳内边界若在正面投影转角 ≥35°，仅对异常点及相邻边界点作 0.25 权重的 Laplacian 平滑，每步用 BVHTree 投回原始表面，最多 12 次。本模型实际仅需 4 次，其他边界顶点不动。尾巴的球面与背面半空间原本直接取 max，会在交界处形成几何尖角；改为宽 0.002 m 的紧支撑 smooth-max，在交界最多向内收 0.0005 m，且始终同时满足球内与背面限制。球心、半径及颜色值保持原定义。处理报告 `region_boundary` 记录细分/切分面数、连通块、零面积面、两耳闭环段数、正面投影/三维最大转角（历史相连尾巴仍记录其闭环）及粉色面法线 Y 最大值。

022 真实底模每只耳恰好一条闭环。主导决定：ear 转角 3D → 正面投影 2D，原因：原表面折面。耳内转角使用与椭圆场相同的正面 X/Z 坐标，先合并投影重合点再计算，仍要求 <35°；三维最大转角仍在测试输出和 prep 报告中打印，不作断言。尾巴是原始独立块，353 顶点 / 702 面全部使用 Tail，没有主体上的白色月牙或尾巴材质边界环。

`test_prep_usagi.py` 同时检查合成椭圆和已提交/临时重建底模的闭环、转角、两块拓扑及整块尾巴；`test_shape_consistency.py` 保留双向 0.0005 表面距离限值。最终结果以 `usagi_prep.report.json`、`usagi_shape.report.json` 为准；`usagi_boundary.report.json` 是 014 历史证据。

动作组合扫描可用 `USAGI_SCAN_ARMS=1 npm --prefix app test -- tests/usagi-model.test.ts -t '小手向' --testTimeout=120000` 无界面复现，输出 `assets/model/usagi_arm_scan.report.json`。原 neck−0.02H 要求无解后，按主导授权保留抬高 >0.05H、突出轮廓 >0.025H，并将手高要求改为 neck−0.04H。最终伸展与喊叫上臂 Z 为 ±0.43 rad、前臂 Z 为 ∓0.10 rad，其他臂轴与手骨角度为 0，静止仍为 0。此姿态是在记录的扫描网格内按各关节角平方距离选出的最近 0.75 rad 纯抬臂组合，完整 GUI 冒烟交门禁。

014 的边界转角测试（`test_08_synthetic_cut_ellipse_closed_and_smooth`、`test_09_real_product_boundaries`）在 `test_prep_usagi.py` 中，随 `sh pipeline/run_tests.sh` 运行，重建文件写入临时目录。执行者启动 Blender 前先运行 `ar gui check Blender --headless`；`BLENDER` 可指定 Blender 可执行文件。

`render_preview.py --landmarks <json>` 可额外输出 `<prefix>_landmarks_front.png` 和 `<prefix>_landmarks_left.png`。关键点使用米、Blender Z 向上、正面 -Y、角色左侧 +X；`neck` 取手臂根部上方 0.01～0.07 米的中央躯干最窄 X 截面。卡通模型没有清晰解剖颈部，`hips`、`chest`、`neck` 与四肢根部为绑骨参考值，绑定前需结合预览确认。

glTF 导入会在材质边界拆点；新模型的连通性测试在临时 BMesh 中焊接后，要求主体与原始独立尾巴两块；尾巴占总面数 <5%、中心位于背面且 Tail 材质占比 ≥50%。顶点组、材质和颜色的回读检查使用原导入网格。

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

骨架包含 Hips→Spine→Chest→Neck→Head、左右肩与三段短臂、三段短腿、两耳各四节、Tail。骨骼局部 +Y 沿头尾方向，统一 `align_roll((0,-1,0))`，使局部 +Z 尽量朝前；与前向近乎平行的尾巴和脚骨使用世界 +Z 作为滚转参考，避免退化。耳尖和尾尖另加 `EarL_Tip`、`EarR_Tip`、`TailTip`，长度 0.012 米，不参与人形映射和权重，分别作为对应 spring joints 的最后一项。VRM 1.0 最后一项只定义末端、不参与模拟，因此 joints 长度为 5、5、2，实际受模拟骨骼为两耳各四节和 Tail，共九个。

先实际运行 `bpy.ops.object.parent_set(type="ARMATURE_AUTO")`，检查热量权重的归一化、影响数和全部区域硬约束；算子即使返回 FINISHED 也可能不合格。`automatic_weights.operator_finished` 与 `accepted` 分开记录，失败原因和尝试的统计一起保留。合格才采用热量权重，否则清除并重新生成几何权重：

- 用骨骼线段距离选择邻近关节，并在相邻骨骼中心之间按投影参数做 smoothstep 过渡。每条链最多两个骨骼；耳根、臂根、腿根再混入一个躯干骨骼，最终最多三个影响，逐点归一化。
- 耳朵按 `head_top` 以上和左右侧分区，仅用本侧四节与 Head。耳根在第一节前半段平滑脱离 Head；中心间过渡宽度约一节耳长，末端 8% 顶点要求第四节 ≥0.8。
- 手臂根部混合宽 0.048 米，腿根 0.050 米。臂区限定根部附近的高度和深度；腿区限定低高度；左右分别处理。躯干只用 Hips、Spine、Chest 或 Head，避免远端四肢拉动身体。
- 颈部高度混合宽 0.120 米，将转头扭转分摊到更大的高度范围。`face_radius*0.6` 球内严格 100% Head，球外再用 0.120 米径向过渡退回躯干权重，避免下脸保护区边缘仍然过窄、在腹部腰线附近产生折线；高度权重 h 与脸部保护权重 p 连续合成为 `h+(1-h)*p`，避免 max 拼接的斜率突变。该保护过渡低于颈部高度带时也连续混入正常躯干链。耳弯不影响头，脸部给 011 贴片保留刚性附着面。
- Tail 仅使用 009 保留的同名区域组，先缓存区域再执行自动权重，避免自动权重覆盖区域标签。Body/EarInner 分界不改变耳朵几何权重。

弹簧参数位于脚本顶部 `EAR_SPRING`、`TAIL_SPRING`，均使用基础 VRMC_springBone 1.0，无扩展碰撞形状。重力在 Blender 中为 `(0,0,-1)`，插件导出成 VRM `(0,-1,0)`。Head 球中心为 head_center、半径 `face_radius*0.95`；Chest 球中心为 hips/chest 中点、半径 `min(face_radius*0.70, 0.17)`。碰撞球偏移由世界关键点乘骨骼矩阵逆变换到骨骼局部坐标；两耳使用头与身体组，尾巴只使用身体组。三种 MToon 材质均使用任务指定底色/阴影色、`shadingShift=-0.05`、`shadingToony=0.95`、世界宽度 0.006 的深棕描边；十六进制 sRGB 颜色先转线性 RGB 后写入插件属性。

产物：

- `usagi_body.vrm`：VRM 1.0，供 three-vrm / UniVRM 后续导入。
- `usagi_rig.blend`：中性姿态，保留插件材质、骨架与权重，当前小于 20 MB。
- `usagi_rig.report.json`：逐骨长度/头尾/父级、人形映射、热量权重尝试与最终权重统计、各区域采样数及违规数、碰撞体/弹簧与校验消息。
- `preview_rig/`：`neutral_t`、`arms_up`（70°）、`arms_down_70`、`head_left_30`、`ears_back_25`（每节25°）、`one_leg_up`（大腿55°/小腿35°）各 `front` 和 `45` 两张图；`pose_sheet.png` 为六列两行，第一行正面、第二行斜45°，顺序同上。另输出 `head_left_20_front.png` 检查较小转头角度的过渡，不加入六姿态拼图。用 Cycles CPU、16 samples、插件实际 MToon 节点和描边渲染，固定相机画幅，便于比较变形；不依赖 Workbench 的替代轮廓线。

`pipeline/run_tests.sh` 最后运行 `test_rig_usagi.py`：合成球身/头、耳柱、短臂柱、短腿柱和尾球，附独立关键点与区域数据；实际尝试热量权重并验证最终结果。覆盖骨长与映射、独立坐标掩码的权重约束、故意写坏脸部权重后检查能否检出、耳弯变形局部性、GLB JSON 内元信息/材质/弹簧参数、碰撞体世界位置，以及 VRM 插件重新导入后的人形映射与 spring/collider 数量。另验证 spring 显式末端和父子链、九个实际模拟关节（包含 Tail）、旧颈部带之外仍有平滑权重混合、高度带下边界连续性，以及颈部/脸部渐变交界处的斜率连续性。原 cleanup/preview/prep 测试不变。测试成功清理临时产物，失败保留现场并返回非零；姿态截图由 rig 自测与 010 门禁生成。

UniVRM / Mate Engine 尚未实测。导出只使用 VRM 1.0、MToon 1.0、标准球碰撞体与最多四个权重通道，减少格式差异；Q 版极短四肢的通用人形动画重定向、单关节尾巴弹簧及 MToon 世界坐标描边在具体运行时中的表现，需要合流后确认。短臂上举会进入大头轮廓，几何比例没有在本阶段更改。

## 五官贴片与 VRM 表情（011）

```sh
ar gui check Blender --headless
sh pipeline/build_usagi.sh face
```

仅读取 rig 的 `assets/model/usagi_body.vrm` 与 `usagi_landmarks.json`，缺少身体模型直接失败。不会重新整备身体、改变骨骼/权重/弹簧或替换桌宠程序模型。最终文件是 `assets/model/usagi.vrm`，另输出 `face/eyes_atlas.png`、`face/mouth_atlas.png`、`face/atlas_preview.png`、`usagi_face.report.json` 和 `preview_face/`。预览用 Eevee、实际 MToon 贴图/透明截断与固定正面相机，14 张 384×384 脸部近景及带名字的四列表情拼图 `expression_sheet.png`；导出发生在预览改动材质 offset 之前，模型默认保持 neutral。

图集采用 **Pillow 11.3.0**。入口通过 `pipeline/face/python_env.sh` 在系统临时目录创建虚拟环境，退出清理；只在该环境安装 Pillow，不改用户 Python、Blender 或项目依赖。可用 `FACE_PYTHON=/absolute/venv/bin/python` 指定已安装这个版本 Pillow 的外部环境。首次生成需要 pip 网络访问。绘制脚本独立可运行：

```sh
"$FACE_PYTHON" pipeline/face/draw_atlas.py --out assets/model/face
```

两张 RGBA 图都是 2048×2048、4×4 格、每格 512×512。绘制时做 2 倍超采样再缩小；边缘至少 41 像素（8%）全透明。未命名格完全透明。按左到右、上到下排列：

| 图集 | 格子顺序 |
| --- | --- |
| eyes | neutral, blink, blinkLeft, blinkRight, happy, angry, sad, relaxed, surprised |
| mouth | neutral, aa, ih, ou, ee, oh, happy, angry, sad, surprised |

`relaxed` 的嘴明确沿用 neutral；它仍显式绑定两张贴片。blinkLeft 指角色左眼（Blender +X / 正面图片右侧）。眼睛高光、两侧长眉弧、ω 嘴、粉色椭圆与三条斜短线依据 `Material/tripo/usagi_3d_ref.png` 和 `Material/tripo/refs/face.png` 的正脸手工用椭圆和 Bezier 曲线画出，线色 `#2B1A12`。表情沿用这些特征，使用独立格子，不混合格内图案。

定位直接使用任务给出的原雕刻块范围，按 009 的 `(x,y,z) → (y,-x,z)`（绕 Z -90°）转换。眼睛中心为 X ±0.1045、Z 0.458；眉线为左右 X ±(0.074…0.216)、Z 0.513…0.640；嘴 X -0.055…0.050、Z 0.303…0.404（米）。用 landmark `face_normal` 的正交平面投影，横向为世界 +X 在该平面的投影，向上为 normal×right；腮红沿用原贴片中心的脸平面 X ±0.194、向上投影 0.347 米。两张贴片从身体前向表面复制原多边形，保留曲面与三角划分；只取完全落在投影框内的面，五官外至少 15% 的透明保护区吸收边界三角面差异。眼贴片额外覆盖参考图的双颊。所有点沿原顶点世界法线外移 0.0015 米，刚性 100% Head。原网格 UV 在 [0,1]，材质 `KHR_texture_transform.scale=[.25,.25]`、默认 offset=[0,0]，所以只显示 neutral。报告记录原雕刻/旋转/投影边界、平面轴、贴片来源顶点、顶点数、UV 范围和全部绑定，方便核对。

修订后的线宽以脸平面米制计算：眉线、闭眼弧线、ω 嘴、sad/ee 嘴及开口轮廓统一为 **0.0142 米**，约头宽 0.66 米的 2.15%。非正方形投影框用椭圆像素笔刷抵消 UV 拉伸，保证模型上线宽均匀；眉线中心曲线与长度、睁眼椭圆与白色高光维持原值。neutral 嘴的含线宽外框为 X `[-0.055, 0.050]`、向上投影 `[0.24984, 0.35532]`，中心 `[-0.0025, 0.30258]` 米，对齐原雕刻投影范围。为放大的腮红保留 8% 透明边距，眼贴片向下扩至投影 0.266 米，并补偿眼睛像素高度以保持原米制尺寸。嘴贴片的透明投影框扩为 X `[-0.0925, 0.0875]`、向上 `[0.209, 0.396]`，容纳同步放大的口型。腮红宽 0.116 米（头宽约 17.6%）、高 0.07733 米，比例 1.5:1；左右含色外框分别为 X `[-0.252,-0.136]` / `[0.136,0.252]`、向上 `[0.30833,0.38567]` 米；三道斜线为黑色并同步加粗。atlas_preview 按投影框实际宽高展示，避免将宽眼贴图的正方形 UV 格误看成实际形状。

VRM 插件的 `Vrm1Importer.setup_vrm1_humanoid_bones()` 会给无子骨 Foot 选择世界 `(0,-1,0)` 的目标轴，改变 Blender rest bone 的轴向；导出会将这次轴转换写成约 90° 的局部旋转与新的逆绑定矩阵。face 在导入后读取输入 GLB 节点层级/TRS，转换到 Blender Z-up，恢复所有输入骨骼的世界 rest frame，保留骨子对象（碰撞球）的世界矩阵，并显式选择 `restPositionPose` 导出。修复发生在 Blender 场景，**不改输入 VRM，也不事后修改导出的 GLB**。测试独立解析输入/输出 JSON 与二进制 MAT4，按节点名检查所有原节点的 translation/rotation/scale、所有 skin 的每个关节逆绑定矩阵，容差均为 `1e-4`；同时覆盖合成模型和正式产物。

材质选择 **MASK、cutoff=0.5**，不描边，renderQueueOffsetNumber=0（MToon 1.0 的 OPAQUE/MASK 要求为零，导出器也可省略这个默认字段）。MASK 保持细线清楚并减少眼/嘴两个面层的透明排序问题；外移负责深度分离。baseColorFactor RGB 与 shadeColorFactor 都为零，颜色由同一图集的 emissiveTexture、emissiveFactor=[1,1,1]、emissiveStrength=1 给出，避免明暗改变五官颜色。baseColorTexture 仍提供 alpha，并与 emissiveTexture 使用相同的 UV 变换。

所有 14 个 VRM 1.0 preset 表情为 `isBinary=true`，只用 textureTransformBinds，scale 始终 [.25,.25]，offset 指定目标格。五个情绪同时绑定眼/嘴，并配置 overrideBlink=block、overrideMouth=block、overrideLookAt=none；三个 blink 只绑定眼，五个口型只绑定嘴，neutral 显式绑定两张材质的默认格。

three-vrm **3.5.5** 源码确认支持 VRM 1.0 textureTransformBinds，MToon 的 map/emissiveMap 等纹理一起变换。绑定值是绝对目标，但运行时将每个目标减去初始变换，再按权重**相加**；二值权重仅在 >0.5 时启用。happy=1 会完全阻止 blink/aa 等类别，关闭后恢复仍在请求的眨眼/口型。**override 不负责情绪之间的互斥，也不阻止 blink 与 blinkLeft 同时激活。调用方必须每次只选一个情绪、一个 blink 和一个口型，切换时清零同类旧值。** 这不是靠 isBinary 能解决的问题；多个情绪同时为 1 会将 offset 相加而串格。本阶段不修改 app，此调用约束留给模型合流。

依据（固定 v3.5.5 源码）：[导入绑定](https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm-core/src/expressions/VRMExpressionLoaderPlugin.ts)、[UV 增量叠加与支持材质](https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm-core/src/expressions/VRMExpressionTextureTransformBind.ts)、[override 类别与应用](https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm-core/src/expressions/VRMExpressionManager.ts)、[二值阈值](https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm-core/src/expressions/VRMExpression.ts)。未进行 UniVRM / Mate Engine 实机检查。

`sh pipeline/run_tests.sh` 保留全部原测试，并追加：

- Pillow 像素测试：尺寸、命名格/空格、每格 >0.5% 且 <50% 非透明覆盖、8% 全透明边距、各命名格内容不同，以及 neutral 嘴米制外框、腮红尺寸/比例/中心。
- 在 010 同一合成角色上实际运行 rig→face，检查曲面复制/外移、全 Head、UV、材质/14 个表达式/格坐标，身体每个三角面的位置与逐点蒙皮、元信息、人形与弹簧保留，以及 VRM 插件重新导入后的绑定与权重。身体比较允许导出器在接缝拆点，位置/权重/碰撞体使用 1e-6 数值容差；插件附加的四个空 look preset 只允许没有任何绑定。
- 临时 npm 目录仅安装 `@pixiv/three-vrm@3.5.5` 与 app 同版 `three@0.187.0`（不改 app/package 或锁文件），读取合成 VRM 的真实 JSON 绑定，调用实际 MToonMaterial、VRMExpressionManager 和纹理绑定类，验证 happy 阻止 blink/aa、二值阈值、base/emissive 同步、关闭表情重置。这些测试依赖用于覆盖目标运行时的叠加行为，不加入桌宠产品依赖。npm 首次需要网络，退出清理临时目录。

失败保留合成模型与日志现场；全量验收和门禁截图由 AgentRouter 执行，执行者只跑任务点名的测试和 face 预览。
