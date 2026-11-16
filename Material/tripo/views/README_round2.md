# Usagi 无五官 T-pose 四视图（第二轮）

供 Tripo 多视图图生 3D 的文件是本目录的 `front.png`、`back.png`、`left.png`、`right.png`。`sheet.png` 上排为四视图及六条浅灰参考线，下排为未裁切的原作参考帧。候选联系表为 `candidates_sheet.png`。

## 本次修复及首轮保留

从任务指定提交 `bad2c1e` 取回全部参考帧、9 张首轮候选与脚本，未重新截帧。首轮候选原像素保存在 `candidates/round1/`，历史说明及生成记录为 `README_round1.md`、`generation_round1.json`；历史文档中的候选相对路径指移动前的位置。第二轮单独保存于 `candidates/round2/`。

上一次未通过的直接原因是工作区缺少 `front.png` 等 004 产物、存在未提交文件，并被报告改到了 003/005 说明。本次恢复 004 基线后重生成；没有修改 003/005、任务配置或检查脚本。开工时 003/005 对 HEAD 无差异；范围外的 `handoff.md` 已有改动未纳入本任务，遵守重试指令最后一段不自行恢复它。

第二轮针对整团无腰、下腹较宽、低位水平短臂、侧面前后不对称、背面居中白尾巴、薄耳片分别迭代。共 **19 张独立工具调用生成的候选**：正面 4、背面 4、左侧 6、右侧 5；没有复制同一张图充数，也没有用翻转脚本冒充右视图生成。

## 最终选择及参考图

| 最终文件 | 第二轮候选 | 该次工具调用实际附图 | 选择原因 |
|---|---|---|---|
| front.png | candidates/round2/front_4.png | front_2 候选、原作 front_full、ears | front_1/3 仍有腰，front_2 偏长；4 保留单一凸轮廓并拓宽成紧凑圆梨形，下腹不再是小球。 |
| back.png | candidates/round2/back_4.png | back_2、选定 front_4、原作 back_full | 1/2/3 尾巴偏低；4 将尾巴上移，保持前后外轮廓、短臂及耳距，白尾巴居中。 |
| left.png | candidates/round2/left_6.png | left_5、选定 front_4、原作 side | 1～4 身体偏薄，5 增加厚度，6 在保留较厚圆腹的基础上缩窄耳片。背直、腹凸、脚尖朝右，尾巴在左下背。 |
| right.png | candidates/round2/right_5.png | right_4、选定 front_4、原作 side_opposite | 1～3 与较薄旧左侧匹配，4 跟随加厚左侧，5 再缩窄侧耳。朝向、内耳边与尾巴均反向，和最终左侧更接近。 |

表内省略前缀：原作位于 `../refs/`，候选位于 `candidates/round2/`。各个中间候选的完整附图列表见文末逐项记录与 `generation.json`。

方向约定：`left.png` 是相机在角色左手边，角色朝画面右；`right.png` 是相机在角色右手边，角色朝画面左。

TODO(lead): 核对 Tripo 的左右约定。

## 生图工具实际使用方式

使用内置 `image_gen.imagegen`（imagegen 技能的 built-in 模式），每张候选独立调用一次；传入 `referenced_image_paths` 的实际本地 PNG 路径，`transparent_background=false`。所有附图均先用 `view_image` 阅读，后续图以选定正面为几何参考，并附原作对应角度；没有纯文字调用，没有转用 CLI/API。

工具输出默认保存在 `$CODEX_HOME/generated_images/<会话目录>/exec-*.png`；调用结束后从工具返回的默认位置复制到仓库 `candidates/round2/`，默认源文件保留。项目记录只保存生成文件 basename，不写用户主目录等本机隐私路径。原始候选未经裁剪、缩放或改色。参考图是模型输入依据，不代表模型逐像素复用了原图。

## 核对表评分

每项 0～2 分：0 明显不符，1 有可见偏差，2 在本轮候选中较好符合。分数是人工对照，不是客观相似度或主导验收结论。C=奶黄/棕线与平涂；S=整团无腰、下部较宽；E=原作细长耳形/侧面薄耳；L=低位水平短臂及小圆脚；T=尾巴（正面隐藏、后背居中/侧面后下部）；V=无五官、正交方向、白底；U=与选定正面的几何一致性。C 均扣 1 分，因生图仍有细微填色波动；T 后/侧视扣 1 分，因毛线及尾巴高度仍有偏差。

| 候选 | C | S | E | L | T | V | U | /14 | 观察 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| front_1 | 1 | 0 | 1 | 1 | 2 | 2 | 0 | 7 | 手臂处仍收腰，头部最宽，弃用。 |
| front_2 | 1 | 1 | 1 | 1 | 2 | 2 | 1 | 9 | 无腰但梨形偏长；作为后续纠正的图像底图。 |
| front_3 | 1 | 0 | 1 | 1 | 2 | 2 | 0 | 7 | 虽更宽，仍回到双球轮廓，弃用。 |
| front_4 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 13 | 选用；连续紧凑轮廓，短臂不再制造收腰。 |
| back_1 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 12 | 前后轮廓接近，尾巴低于期望。 |
| back_2 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 12 | 轮廓匹配较好，作为上移尾巴的底图。 |
| back_3 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 12 | 毛线略不同，尾巴高度未改善。 |
| back_4 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 12 | 选用；尾巴上移且居中，但与侧面还有高度差。 |
| left_1 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 10 | 方向清楚，无腰；厚度不足，耳片偏宽。 |
| left_2 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 10 | 背更直，尾巴完整；仍薄。 |
| left_3 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 10 | 单团体形和小端面手更清楚，用作厚度迭代底图。 |
| left_4 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 10 | 第一次加厚变化有限，耳片仍宽。 |
| left_5 | 1 | 2 | 1 | 2 | 1 | 2 | 2 | 11 | 身体加厚到接近正面宽 85%，耳片需再窄。 |
| left_6 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 12 | 选用；保留加厚单团身体，耳片明显缩窄。 |
| right_1 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 10 | 朝左、尾巴朝右，跟随旧的较薄左侧。 |
| right_2 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 10 | 耳朵反向正确，深度仍不足。 |
| right_3 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 10 | 单团形较好，但与加厚左侧不匹配。 |
| right_4 | 1 | 2 | 1 | 2 | 1 | 2 | 2 | 11 | 跟随 left_5 加厚；耳片偏宽。 |
| right_5 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 12 | 选用；加厚轮廓与窄耳片同最终左侧对应。 |

## 对齐与参考线

`tools/views/align_views.py` 仅合成白底、清除近白中性背景、按整体包围盒等比例缩放居中；没有画身体、挪动尾巴或拉伸局部。原始候选保留。RGB 1024×1024，非白角色包围盒统一高 **870 px**（84.9609375%，85% 四舍五入），顶端 y=77，脚底 y=946。水平包围盒居中允许奇数宽导致的半像素取整。近白清理阈值为各通道至少 240 且通道差不大于 12，保留奶黄、粉色及棕线。

一张细耳尖缩放后原本会在清白时丢失一行：脚本在实际高度为 869 时改用 871 px 的整体等比例采样再裁纯白边，仍断言角色实际高度必须恰好 870；没有放宽原有尺寸断言。没有为对齐改局部姿态。

`landmarks.json` 是在原始候选上用目视估计的源 y 坐标（约 ±10～25 px），不是自动几何测量；`alignment.json` 保存换算到最终画布的 y。HEAD_TOP 指双耳根之间的头顶，WIDEST_BODY 是排除手臂的下腹最宽区域的近似位置，不是把含手臂的整张图宽度当作腹宽。TAIL_TARGET 是无尾正面上的目标位置。

对照图的六条跨列参考线取自正面基准：耳尖、头顶、手臂、下腹最宽区域、尾巴目标高度、脚底。参考线仅存在 `sheet.png`，上传 Tripo 的四张图没有线。它们故意不分别追随每列的偏差；不同视角的实际目视标记保留在 JSON，让偏差可见。

## 已知偏差与 TODO

- 最大差距仍是**原作的自然不规则剪影和线条手感**。本轮已去掉双球收腰，但轮廓更规则、更像标准圆梨形，缺少动画的局部起伏；不能宣称“完全还原”。
- 下腹最宽区域较宽，位置约在身体中下段（目视约 60% 左右），未精确锁定 65%；最宽处附近与短手根较近。手臂约在身体 55%～60%，改善了首轮偏高问题。
- 四图填色仍有极细微亮度/色温波动（尤其背面略浅），不像理想的逐像素单一色值。背景清理为纯白；脚本没有擅自重绘角色填色。
- 正背轮廓非常接近；侧面耳根与正面相差约数像素，左右耳的前倾角略不同。侧面耳片已缩窄，仍不是几何上无限薄的线。
- 背面尾巴目视中心约 y=706，侧面约 y=728～731，存在约 22～25 px 高度差；白尾巴外圈毛线仍比原作粗且规则，侧面尾巴略呈半圆。背面居中有数像素的手绘误差。这些差异不通过脚本挪局部来掩盖。
- 两个侧面深度已接近正面身体宽度的约 80%～85%（不计正背伸出的短手及尾巴），但各视图独立生成，不是严格的 3D 投影，不能保证隐藏面的几何完全对应。
- TODO(lead): 对照 `sheet.png` 逐张确认轮廓、耳片、尾巴高度残差和配色是否足够还原，再交用户上传 Tripo；最终审美验收由主导决定。

## 重建与自查记录

Pillow 安装在仓库外临时环境，不新增项目依赖。仓库根目录：

```sh
python3 -m venv /tmp/usagi-004-views-venv
/tmp/usagi-004-views-venv/bin/pip install Pillow==13.0.0
/tmp/usagi-004-views-venv/bin/python tools/views/align_views.py
```

该命令成功退出 0，生成对齐结果与联系表，内置断言仍核对 RGB、1024×1024、870 px 高度及同一脚底线。第一次执行在细耳尖清白后高度变为 869 时退出 1，现场输出为 `缩放后角色高度改变：(1, 1, 514, 870)`；已按上述等比例重采样修复，随后成功。后续因薄耳候选改选再运行一次，退出 0。

执行者的聚焦自查按任务“自测”用 `view_image` 阅读最终 front/back/left/right、sheet，并查看候选联系表，对照上述核对表。当前记录见 `selfcheck.json`。没有运行 `sh docs/specs/checks/004-check.sh`、完整验收、GUI 程序或门禁专用命令；检查脚本由提交后的门禁执行。

## 第二轮全部实际提示词

以下每节为一张候选的完整 prompt 字符串，不是摘要。图片来源及生成 basename 与 `generation.json` 一致；附图参数均为 `referenced_image_paths`，背景参数均为 false。原作截图中的五官仅为身份参考，所有候选均要求无五官。

### front_1

附图：`refs/front_full.png`、`refs/face.png`、`refs/ears.png`。

生成 basename：`exec-ca422529-04b5-4dd5-9774-9cefa4f117be.png`。

```text
Use case: identity-preserve. Edit the attached original Usagi animation frames into ONE orthographic FRONT T-pose reference, 1024 square pure white background. Image 1 front_full is the primary source; image 2 face locks original ears and colors; image 3 ears locks slender ears and line style. Preserve original cream #FFF1C1, thin chocolate-brown outline, soft pink inner ears, tiny round-ended feet. Remove all facial features: no eyes, brows, nose, mouth, blush or dots. Upright, full body, ear tips and feet uncut, centered with margins, flat cel fills, no shading, texture, ground, text or objects. CRITICAL ROUND 2 SHAPE: the head and torso are ONE SINGLE rounded pear/egg-shaped mass with NO neck, NO waist, NO stacked balls. From ear roots the outer contour expands continuously downward to its widest point at about 65% of the ear-root-to-sole body height, then rounds inward only at bottom. Lower belly slightly WIDER than upper head. Do not draw an indentation at the arm roots. Body below ears is a single softly rounded oval, not a snowman. Two very SHORT round-ended arms extend horizontally from 57% down the ear-root-to-sole height, well below upper head; no shoulders or fingers. Two tiny feet peek out below. Ears keep source slender upright slightly splayed shape, about one third full silhouette height, not thick bunny ears. No tail visible from front. This is a precise source-image pose edit, not a generic rabbit redesign.
Candidate 1: emphasize the source's broad softly rounded lower belly. Maintain a smooth convex contour at both arm roots.
```

### front_2

附图：`refs/front_full.png`、`refs/face.png`、`refs/ears.png`。

生成 basename：`exec-75c8f330-f8d9-4d43-a529-87344520c9e3.png`。

```text
Use case: identity-preserve. Edit the attached original Usagi animation frames into ONE orthographic FRONT T-pose reference, 1024 square pure white background. Image 1 front_full is the primary source; image 2 face locks original ears and colors; image 3 ears locks slender ears and line style. Preserve original cream #FFF1C1, thin chocolate-brown outline, soft pink inner ears, tiny round-ended feet. Remove all facial features: no eyes, brows, nose, mouth, blush or dots. Upright, full body, ear tips and feet uncut, centered with margins, flat cel fills, no shading, texture, ground, text or objects. CRITICAL ROUND 2 SHAPE: the head and torso are ONE SINGLE rounded pear/egg-shaped mass with NO neck, NO waist, NO stacked balls. From ear roots the outer contour expands continuously downward to its widest point at about 65% of the ear-root-to-sole body height, then rounds inward only at bottom. Lower belly slightly WIDER than upper head. Do not draw an indentation at the arm roots. Body below ears is a single softly rounded oval, not a snowman. Two very SHORT round-ended arms extend horizontally from 57% down the ear-root-to-sole height, well below upper head; no shoulders or fingers. Two tiny feet peek out below. Ears keep source slender upright slightly splayed shape, about one third full silhouette height, not thick bunny ears. No tail visible from front. This is a precise source-image pose edit, not a generic rabbit redesign.
Candidate 2 essential correction: DRAW ONLY ONE PEAR SHAPED OVAL from ear roots to soles. The left body boundary at 25%,45%,60%,65%,75% down the BODY should be respectively x=36%,29%,27%,26%,28% of canvas, mirrored right boundary. Thus upper head is narrower than lower belly. The arms are tiny tabs ADDED to this continuous oval at 57% body height; the outline returns directly to the SAME convex oval below each tab, never moving inward into a waist. Body widest BELOW arms. No upper circular head bulge. Use a narrower upper third and broad plump lower two-thirds. Small thin source ears, about 29% total height. Fine dark brown 5px equivalent line at 1024. Pure FLAT solid fills, zero gradient or paper grain.
```

### front_3

附图：`refs/front_full.png`、`refs/face.png`、`refs/ears.png`。

生成 basename：`exec-7f1ac662-12b9-4ddb-9243-98aff4fcf43a.png`。

```text
Use case: identity-preserve. Edit the attached original Usagi animation frames into ONE orthographic FRONT T-pose reference, 1024 square pure white background. Image 1 front_full is the primary source; image 2 face locks original ears and colors; image 3 ears locks slender ears and line style. Preserve original cream #FFF1C1, thin chocolate-brown outline, soft pink inner ears, tiny round-ended feet. Remove all facial features: no eyes, brows, nose, mouth, blush or dots. Upright, full body, ear tips and feet uncut, centered with margins, flat cel fills, no shading, texture, ground, text or objects. CRITICAL ROUND 2 SHAPE: the head and torso are ONE SINGLE rounded pear/egg-shaped mass with NO neck, NO waist, NO stacked balls. From ear roots the outer contour expands continuously downward to its widest point at about 65% of the ear-root-to-sole body height, then rounds inward only at bottom. Lower belly slightly WIDER than upper head. Do not draw an indentation at the arm roots. Body below ears is a single softly rounded oval, not a snowman. Two very SHORT round-ended arms extend horizontally from 57% down the ear-root-to-sole height, well below upper head; no shoulders or fingers. Two tiny feet peek out below. Ears keep source slender upright slightly splayed shape, about one third full silhouette height, not thick bunny ears. No tail visible from front. This is a precise source-image pose edit, not a generic rabbit redesign.
Candidate 3: compact BROAD single pear-shaped ROUND BALL, not a tall egg. Ear-root-to-sole body height only 1.15 times its widest body width. Body widest at 65% down from ear roots (below the arm attachments). Broad lower belly only 8% wider than upper head, continuous smooth convex sides, no indent anywhere at hand level. Upper portion is NOT a separate sphere. The two arms emerge at 57% down this SINGLE body and are tiny horizontal rounded tabs. Slender ears about 30% total height, preserve original ear spacing and pink interiors. All fills absolutely uniform solid RGB colors, cream #FFF1C1, pale pink, outline deep brown rather than black, approximately 5 pixels at 1024 resolution. Entire character takes about 85% canvas height. No gradients or noise, sharp 2D cel reference.
```

### front_4

附图：`views/candidates/round2/front_2.png`、`refs/front_full.png`、`refs/ears.png`。

生成 basename：`exec-837c4ec5-e6c4-430e-a129-bccd7a589c0b.png`。

```text
Use case: identity-preserve. Image 1 is a selected T-pose silhouette. Images 2 and 3 are the original Usagi animation design references. Produce ONE FRONT orthographic faceless T-pose, precise correction of IMAGE 1: keep its SINGLE smooth pear-shaped body contour with NO WAIST, the lower belly widest at 65% body height, its tiny horizontal short arms at 57%, its feet, ear length, spacing and pink inner ears. Make the body less tall and MORE ROUND by widening its merged head-body horizontally by about 15%, while preserving the narrow upper-to-broad-lower silhouette; do not create an upper head bulb or indent at the arms. Keep the original references' compact ROUND BALL feel. The body below ears should be only 1.10 times taller than wide. Ears remain the SAME slender original width, do not widen ears when broadening body. Thin dark chocolate outline 5px at 1024, absolutely flat solid cream RGB(255,241,193), soft pink ears, absolutely pure white background, no texture or gradients. Total silhouette height 85% square canvas. Both ear tips and feet fully visible. Zero eyes/mouth/nose/brows/blush, no tail visible from front, no other marks, no objects or shadows. Most important: preserve Image 1's continuous convex lower-wider outline while making it more compact.
```

### back_1

附图：`views/candidates/round2/front_4.png`、`refs/back_full.png`。

生成 basename：`exec-fa21bc44-6189-47ad-8406-2ca289ce7ab3.png`。

```text
Use case: identity-preserve. Image 1 selected ROUND TWO FRONT T-pose is the EXACT geometry lock. Image 2 original Usagi back animation is tail texture and placement evidence. Produce ONE BACK orthographic T-pose of image 1, as a true 180-degree turn. Copy image 1 outer contour precisely: ONE continuous round pear body, no separate head, NO WAIST, lower belly widest below arm roots, tiny rounded feet, same slender ears and same ear length/spacing, short horizontal arms at about 57% down body below ear roots. Keep all image-1 proportions and its compact broad body. Back of ears cream, NO pink visible from rear. Add ONE small white fluffy circular tail CENTERED EXACTLY on the symmetry axis of lower back at 65% down from ear roots to soles; use a few short irregular deep brown fur strokes along its perimeter like original image 2, no flower, cog or spiky sun. Tail diameter about 20% body width. No face anywhere, no seams. Colors flat cream #FFF1C1 and thin deep brown outline matching image 1, absolute white background, no shading, gradients, texture, ground, shadow, props or text. One character fully visible with unclipped ears and soles, square 1024 composition, 85% character height. The source back frame must not cause a head bulge or waist: image 1 is the silhouette authority.
Candidate 1: exact front silhouette lock; tail centered at lower back.
```

### back_2

附图：`views/candidates/round2/front_4.png`、`refs/back_full.png`。

生成 basename：`exec-b8d2b0fa-57eb-498f-8792-c586852e8daf.png`。

```text
Use case: identity-preserve. Image 1 selected ROUND TWO FRONT T-pose is the EXACT geometry lock. Image 2 original Usagi back animation is tail texture and placement evidence. Produce ONE BACK orthographic T-pose of image 1, as a true 180-degree turn. Copy image 1 outer contour precisely: ONE continuous round pear body, no separate head, NO WAIST, lower belly widest below arm roots, tiny rounded feet, same slender ears and same ear length/spacing, short horizontal arms at about 57% down body below ear roots. Keep all image-1 proportions and its compact broad body. Back of ears cream, NO pink visible from rear. Add ONE small white fluffy circular tail CENTERED EXACTLY on the symmetry axis of lower back at 65% down from ear roots to soles; use a few short irregular deep brown fur strokes along its perimeter like original image 2, no flower, cog or spiky sun. Tail diameter about 20% body width. No face anywhere, no seams. Colors flat cream #FFF1C1 and thin deep brown outline matching image 1, absolute white background, no shading, gradients, texture, ground, shadow, props or text. One character fully visible with unclipped ears and soles, square 1024 composition, 85% character height. The source back frame must not cause a head bulge or waist: image 1 is the silhouette authority.
Candidate 2: prioritize matching ear roots, arm height and widest belly to image 1 exactly. Tail has sparse hand-drawn fur dashes.
```

### back_3

附图：`views/candidates/round2/front_4.png`、`refs/back_full.png`。

生成 basename：`exec-f847ea0c-12cc-4432-856b-5d3ca700a42a.png`。

```text
Use case: identity-preserve. Image 1 selected ROUND TWO FRONT T-pose is the EXACT geometry lock. Image 2 original Usagi back animation is tail texture and placement evidence. Produce ONE BACK orthographic T-pose of image 1, as a true 180-degree turn. Copy image 1 outer contour precisely: ONE continuous round pear body, no separate head, NO WAIST, lower belly widest below arm roots, tiny rounded feet, same slender ears and same ear length/spacing, short horizontal arms at about 57% down body below ear roots. Keep all image-1 proportions and its compact broad body. Back of ears cream, NO pink visible from rear. Add ONE small white fluffy circular tail CENTERED EXACTLY on the symmetry axis of lower back at 65% down from ear roots to soles; use a few short irregular deep brown fur strokes along its perimeter like original image 2, no flower, cog or spiky sun. Tail diameter about 20% body width. No face anywhere, no seams. Colors flat cream #FFF1C1 and thin deep brown outline matching image 1, absolute white background, no shading, gradients, texture, ground, shadow, props or text. One character fully visible with unclipped ears and soles, square 1024 composition, 85% character height. The source back frame must not cause a head bulge or waist: image 1 is the silhouette authority.
Candidate 3: prioritize precise front-back contour consistency and small centered white tail; smooth continuous outward curve below ear roots.
```

### left_1

附图：`views/candidates/round2/front_4.png`、`refs/side.png`、`refs/back_full.png`。

生成 basename：`exec-e30d7976-b43f-41dd-bb6a-8da8abf8bed1.png`。

```text
Use case: identity-preserve. Image 1 is selected ROUND TWO FRONT T-pose and EXACT vertical proportion, cream color and thin brown line lock. Image 2 is the ORIGINAL Usagi side animation, image 3 original back for white fur tail. Produce ONE TRUE ORTHOGRAPHIC SIDE image, rotate front character 90 degrees. CRITICAL: ONE continuous compact pear/egg mass, absolutely NO neck or waist or two stacked spheres. Body front-back depth 85% of FRONT body width, lower half fullest, body height same as image 1. Back contour almost straight from upper back into lower back; FRONT BELLY substantially more convex and fuller, so direction is immediately clear even without facial features. Narrow flat ear blades seen edge-on, overlapping ears with only a fine second edge, same full ear height as image 1, lean slightly TOWARD facing direction, a very thin pink inner rim on FRONT edge. Tiny round foot peeks out toward FRONT at base. T-pose arms remain horizontally out toward camera; seen end-on as ONE SMALL oval centered at 57% down body from ear roots to soles, NOT a forearm pointing in screen direction. Add a small WHITE furry round tail protruding modestly from BACK at 65% down BODY (ear roots to soles), well above feet, diameter 20% front body width, sparse irregular brown fur dashes. Do not put tail at ankle or foot. Completely remove ALL eyes, nose, mouth, blush, brows, dots, protruding muzzle; smooth blank cream face. Thin chocolate brown outline matches image 1, flat solid #FFF1C1 and pale pink, pure white background, no lighting, shadow, shading, grain, gradient, objects, text. Full body and ear tips uncut, 85% square 1024 canvas height.
LEFT view: camera at character LEFT hand, FACE SCREEN RIGHT, back and tail SCREEN LEFT. Belly bulges to RIGHT, back LEFT flatter, ear leans RIGHT, tiny foot extends RIGHT.
Candidate 1: preserve compact silhouette, single pear side profile.
```

### left_2

附图：`views/candidates/round2/front_4.png`、`refs/side.png`、`refs/back_full.png`。

生成 basename：`exec-d513c0aa-a44c-4492-b0d9-9cd0e3e92291.png`。

```text
Use case: identity-preserve. Image 1 is selected ROUND TWO FRONT T-pose and EXACT vertical proportion, cream color and thin brown line lock. Image 2 is the ORIGINAL Usagi side animation, image 3 original back for white fur tail. Produce ONE TRUE ORTHOGRAPHIC SIDE image, rotate front character 90 degrees. CRITICAL: ONE continuous compact pear/egg mass, absolutely NO neck or waist or two stacked spheres. Body front-back depth 85% of FRONT body width, lower half fullest, body height same as image 1. Back contour almost straight from upper back into lower back; FRONT BELLY substantially more convex and fuller, so direction is immediately clear even without facial features. Narrow flat ear blades seen edge-on, overlapping ears with only a fine second edge, same full ear height as image 1, lean slightly TOWARD facing direction, a very thin pink inner rim on FRONT edge. Tiny round foot peeks out toward FRONT at base. T-pose arms remain horizontally out toward camera; seen end-on as ONE SMALL oval centered at 57% down body from ear roots to soles, NOT a forearm pointing in screen direction. Add a small WHITE furry round tail protruding modestly from BACK at 65% down BODY (ear roots to soles), well above feet, diameter 20% front body width, sparse irregular brown fur dashes. Do not put tail at ankle or foot. Completely remove ALL eyes, nose, mouth, blush, brows, dots, protruding muzzle; smooth blank cream face. Thin chocolate brown outline matches image 1, flat solid #FFF1C1 and pale pink, pure white background, no lighting, shadow, shading, grain, gradient, objects, text. Full body and ear tips uncut, 85% square 1024 canvas height.
LEFT view: camera at character LEFT hand, FACE SCREEN RIGHT, back and tail SCREEN LEFT. Belly bulges to RIGHT, back LEFT flatter, ear leans RIGHT, tiny foot extends RIGHT.
Candidate 2: tail center exactly 65% down BODY below ear roots, not 65% down entire including ears; vertical back on LEFT and fuller belly on RIGHT. Ear blade very thin.
```

### left_3

附图：`views/candidates/round2/front_4.png`、`refs/side.png`、`refs/back_full.png`。

生成 basename：`exec-502786a9-6681-4eeb-8d9e-2535a1c0d318.png`。

```text
Use case: identity-preserve. Image 1 is selected ROUND TWO FRONT T-pose and EXACT vertical proportion, cream color and thin brown line lock. Image 2 is the ORIGINAL Usagi side animation, image 3 original back for white fur tail. Produce ONE TRUE ORTHOGRAPHIC SIDE image, rotate front character 90 degrees. CRITICAL: ONE continuous compact pear/egg mass, absolutely NO neck or waist or two stacked spheres. Body front-back depth 85% of FRONT body width, lower half fullest, body height same as image 1. Back contour almost straight from upper back into lower back; FRONT BELLY substantially more convex and fuller, so direction is immediately clear even without facial features. Narrow flat ear blades seen edge-on, overlapping ears with only a fine second edge, same full ear height as image 1, lean slightly TOWARD facing direction, a very thin pink inner rim on FRONT edge. Tiny round foot peeks out toward FRONT at base. T-pose arms remain horizontally out toward camera; seen end-on as ONE SMALL oval centered at 57% down body from ear roots to soles, NOT a forearm pointing in screen direction. Add a small WHITE furry round tail protruding modestly from BACK at 65% down BODY (ear roots to soles), well above feet, diameter 20% front body width, sparse irregular brown fur dashes. Do not put tail at ankle or foot. Completely remove ALL eyes, nose, mouth, blush, brows, dots, protruding muzzle; smooth blank cream face. Thin chocolate brown outline matches image 1, flat solid #FFF1C1 and pale pink, pure white background, no lighting, shadow, shading, grain, gradient, objects, text. Full body and ear tips uncut, 85% square 1024 canvas height.
LEFT view: camera at character LEFT hand, FACE SCREEN RIGHT, back and tail SCREEN LEFT. Belly bulges to RIGHT, back LEFT flatter, ear leans RIGHT, tiny foot extends RIGHT.
Candidate 3: emphasize visibly asymmetric belly-forward profile, no snowman indentation. Match image 1's arm-root and ear-root levels precisely.
```

### back_4

附图：`views/candidates/round2/back_2.png`、`views/candidates/round2/front_4.png`、`refs/back_full.png`。

生成 basename：`exec-fe5c0da3-30e6-4aa3-9500-001d8e75c974.png`。

```text
Use case: precise-object-edit. Edit image 1, the faceless BACK T-pose, using image 2 front as geometry lock and image 3 original animation tail reference. Change ONLY tail position: move the exact same centered white furry circular tail UP so tail center is at 65% down from EAR ROOTS to SOLES, about 8% of body height higher than image 1. Keep tail centered on body symmetry axis, same small size, sparse original brown fur dashes. Keep every other silhouette, ear, arm, foot, cream color and contour pixel geometry consistent with image 1. No face, no pink on rear ears, no other edits. Pure white background, flat unshaded 2D, square composition.
```

### left_4

附图：`views/candidates/round2/left_3.png`、`views/candidates/round2/front_4.png`、`refs/side.png`。

生成 basename：`exec-935c9985-9dd0-4790-a8ff-3f74dbcf8aee.png`。

```text
Use case: identity-preserve. Edit IMAGE 1 LEFT SIDE T-pose, supported by image 2 selected FRONT proportions and image 3 original Usagi side. Keep exact image 1 asymmetry: flatter back SCREEN LEFT, rounded belly SCREEN RIGHT, tiny foot toward RIGHT, skinny ear blade leaning RIGHT with pink rim on RIGHT edge, small end-on oval arm, white tail SCREEN LEFT at lower back. Change ONLY: broaden front-back body thickness about 15% to reach 85% of image 2 frontal BODY width, while keeping ear-root-to-sole height unchanged. Preserve one smooth continuous compact pear shape, no neck or waist. Tail center 65% down body from ear roots to soles, arm center 57% down. Keep ear height and narrow edge-on width, same tiny foot, same small tail size and sparse fur dashes. Flat cream #FFF1C1 and thin dark brown stroke, plain cream face no features. Pure white background, no shadows, gradients, textures or objects, full body uncut, 1024 square.
```

### right_1

附图：`views/candidates/round2/front_4.png`、`refs/side_opposite.png`、`refs/back_full.png`、`views/candidates/round2/left_4.png`。

生成 basename：`exec-f983f0cd-d81a-4a87-a5db-70389e8b8bd3.png`。

```text
Use case: identity-preserve. Image 1 is selected ROUND TWO FRONT T-pose and EXACT vertical proportion, cream color and thin brown line lock. Image 2 is the ORIGINAL Usagi side animation, image 3 original back for white fur tail. Produce ONE TRUE ORTHOGRAPHIC SIDE image, rotate front character 90 degrees. CRITICAL: ONE continuous compact pear/egg mass, absolutely NO neck or waist or two stacked spheres. Body front-back depth 85% of FRONT body width, lower half fullest, body height same as image 1. Back contour almost straight from upper back into lower back; FRONT BELLY substantially more convex and fuller, so direction is immediately clear even without facial features. Narrow flat ear blades seen edge-on, overlapping ears with only a fine second edge, same full ear height as image 1, lean slightly TOWARD facing direction, a very thin pink inner rim on FRONT edge. Tiny round foot peeks out toward FRONT at base. T-pose arms remain horizontally out toward camera; seen end-on as ONE SMALL oval centered at 57% down body from ear roots to soles, NOT a forearm pointing in screen direction. Add a small WHITE furry round tail protruding modestly from BACK at 65% down BODY (ear roots to soles), well above feet, diameter 20% front body width, sparse irregular brown fur dashes. Do not put tail at ankle or foot. Completely remove ALL eyes, nose, mouth, blush, brows, dots, protruding muzzle; smooth blank cream face. Thin chocolate brown outline matches image 1, flat solid #FFF1C1 and pale pink, pure white background, no lighting, shadow, shading, grain, gradient, objects, text. Full body and ear tips uncut, 85% square 1024 canvas height.
RIGHT view: camera at character RIGHT hand, FACE SCREEN LEFT, back and tail SCREEN RIGHT. Belly bulges LEFT, back RIGHT flatter, ear leans LEFT with pink rim LEFT, tiny foot extends LEFT. Image 4 selected LEFT view locks depth, ear blade thickness, arm and tail heights: RIGHT must be its mirror-consistent opposite side. Do not leave ear leaning the old direction when reversing view.
Candidate 1: prioritize mirror-consistent geometry to selected left view, same single pear shape.
```

### right_2

附图：`views/candidates/round2/front_4.png`、`refs/side_opposite.png`、`refs/back_full.png`、`views/candidates/round2/left_4.png`。

生成 basename：`exec-18af2a1f-6268-4299-86b4-7df4228b2bf1.png`。

```text
Use case: identity-preserve. Image 1 is selected ROUND TWO FRONT T-pose and EXACT vertical proportion, cream color and thin brown line lock. Image 2 is the ORIGINAL Usagi side animation, image 3 original back for white fur tail. Produce ONE TRUE ORTHOGRAPHIC SIDE image, rotate front character 90 degrees. CRITICAL: ONE continuous compact pear/egg mass, absolutely NO neck or waist or two stacked spheres. Body front-back depth 85% of FRONT body width, lower half fullest, body height same as image 1. Back contour almost straight from upper back into lower back; FRONT BELLY substantially more convex and fuller, so direction is immediately clear even without facial features. Narrow flat ear blades seen edge-on, overlapping ears with only a fine second edge, same full ear height as image 1, lean slightly TOWARD facing direction, a very thin pink inner rim on FRONT edge. Tiny round foot peeks out toward FRONT at base. T-pose arms remain horizontally out toward camera; seen end-on as ONE SMALL oval centered at 57% down body from ear roots to soles, NOT a forearm pointing in screen direction. Add a small WHITE furry round tail protruding modestly from BACK at 65% down BODY (ear roots to soles), well above feet, diameter 20% front body width, sparse irregular brown fur dashes. Do not put tail at ankle or foot. Completely remove ALL eyes, nose, mouth, blush, brows, dots, protruding muzzle; smooth blank cream face. Thin chocolate brown outline matches image 1, flat solid #FFF1C1 and pale pink, pure white background, no lighting, shadow, shading, grain, gradient, objects, text. Full body and ear tips uncut, 85% square 1024 canvas height.
RIGHT view: camera at character RIGHT hand, FACE SCREEN LEFT, back and tail SCREEN RIGHT. Belly bulges LEFT, back RIGHT flatter, ear leans LEFT with pink rim LEFT, tiny foot extends LEFT. Image 4 selected LEFT view locks depth, ear blade thickness, arm and tail heights: RIGHT must be its mirror-consistent opposite side. Do not leave ear leaning the old direction when reversing view.
Candidate 2: keep small white tail at 65% body height on RIGHT, with sparse fur strokes. Compact round body, no waist.
```

### right_3

附图：`views/candidates/round2/front_4.png`、`refs/side_opposite.png`、`refs/back_full.png`、`views/candidates/round2/left_4.png`。

生成 basename：`exec-aacbb239-280d-4cf4-ba66-0a4b187ab02f.png`。

```text
Use case: identity-preserve. Image 1 is selected ROUND TWO FRONT T-pose and EXACT vertical proportion, cream color and thin brown line lock. Image 2 is the ORIGINAL Usagi side animation, image 3 original back for white fur tail. Produce ONE TRUE ORTHOGRAPHIC SIDE image, rotate front character 90 degrees. CRITICAL: ONE continuous compact pear/egg mass, absolutely NO neck or waist or two stacked spheres. Body front-back depth 85% of FRONT body width, lower half fullest, body height same as image 1. Back contour almost straight from upper back into lower back; FRONT BELLY substantially more convex and fuller, so direction is immediately clear even without facial features. Narrow flat ear blades seen edge-on, overlapping ears with only a fine second edge, same full ear height as image 1, lean slightly TOWARD facing direction, a very thin pink inner rim on FRONT edge. Tiny round foot peeks out toward FRONT at base. T-pose arms remain horizontally out toward camera; seen end-on as ONE SMALL oval centered at 57% down body from ear roots to soles, NOT a forearm pointing in screen direction. Add a small WHITE furry round tail protruding modestly from BACK at 65% down BODY (ear roots to soles), well above feet, diameter 20% front body width, sparse irregular brown fur dashes. Do not put tail at ankle or foot. Completely remove ALL eyes, nose, mouth, blush, brows, dots, protruding muzzle; smooth blank cream face. Thin chocolate brown outline matches image 1, flat solid #FFF1C1 and pale pink, pure white background, no lighting, shadow, shading, grain, gradient, objects, text. Full body and ear tips uncut, 85% square 1024 canvas height.
RIGHT view: camera at character RIGHT hand, FACE SCREEN LEFT, back and tail SCREEN RIGHT. Belly bulges LEFT, back RIGHT flatter, ear leans LEFT with pink rim LEFT, tiny foot extends LEFT. Image 4 selected LEFT view locks depth, ear blade thickness, arm and tail heights: RIGHT must be its mirror-consistent opposite side. Do not leave ear leaning the old direction when reversing view.
Candidate 3: match image 4 lower-belly width, head-top height, arm-center y and foot size exactly; reverse ear lean and rim as well as tail.
```

### left_5

附图：`views/candidates/round2/left_4.png`、`views/candidates/round2/front_4.png`、`refs/side.png`。

生成 basename：`exec-0033ae90-d462-43a4-98af-a6f35a5d8044.png`。

```text
Use case: precise-object-edit. Image 1 is LEFT SIDE T-pose facing RIGHT. Image 2 is FRONT proportion lock, image 3 original source. Make ONE revised LEFT SIDE image. The current side body is TOO THIN. Broaden the whole cream body front-to-back from about 510px to about 610px in the same 1254px square composition: back edge near x=320 and fullest front belly near x=930. Keep ear-tip y=65, ear-root y=410, foot-bottom y=1170, arm-center y=810. Thus width increases by 20% while vertical coordinates stay fixed. Keep back almost vertical at screen LEFT, round front belly bulging screen RIGHT, single continuous egg-shaped body without any waist, NOT two balls. Body widest about y=875. Tail is a small white fur bump on LEFT back center y=900 with a few short brown dashes; foot at bottom front RIGHT. Narrow overlapping edge-on ear blades lean RIGHT with pink thin rim on RIGHT; preserve their height and width (do NOT widen ears), same small oval arm seen end-on. Match exact cream #FFF1C1 and original thin deep brown outline, no eyes nose mouth blush or other face marks. Flat color no texture or lighting, pure white background, no ground, text, objects or shadow. Full character uncut. Main change is visibly wider deeper side body, not bigger overall character.
```

### right_4

附图：`views/candidates/round2/front_4.png`、`views/candidates/round2/left_5.png`、`refs/side_opposite.png`。

生成 basename：`exec-47dd1c5b-8066-4298-825b-a991f9d53c3f.png`。

```text
Use case: identity-preserve. Generate ONE RIGHT SIDE orthographic T-pose of exact faceless Usagi in the attached references. Image 1 is selected FRONT lock, image 2 is selected LEFT SIDE geometry authority, image 3 original opposite-side animation identity evidence. The result must have the SAME DEPTH, vertical proportions, body width, ear height, arm height, tail height and foot size as image 2, viewed from opposite hand. It is the mirror-consistent turnaround of image 2: face SCREEN LEFT, belly bulges LEFT, back is almost straight SCREEN RIGHT, tiny foot at front LEFT, small white furry tail on RIGHT back at 65% below ear roots. Body is one single compact pear/egg with no neck or waist. Mirror both narrow edge-on ear blades: ear leans LEFT, thin pink rim on LEFT edge, small second edge on RIGHT, not broad frontal ears. Near arm stays a small end-on oval at same y as image 2. Keep body depth about 85% frontal body width; match image 2 broadened depth, do not revert to older narrow side. Exact flat cream #FFF1C1, original thin deep chocolate contour and pale pink, no eye/nose/mouth/brow/blush, no muzzle. Pure white background, no shadows, gradient, texture, props or text, full ear tips and feet visible, centered square image, character about 85% high.
```

### left_6

附图：`views/candidates/round2/left_5.png`、`views/candidates/round2/front_4.png`、`refs/side.png`。

生成 basename：`exec-88749258-bddc-4910-bc48-a817b5258085.png`。

```text
Use case: precise-object-edit. Image 1 is the selected LEFT SIDE faceless Usagi T-pose, facing SCREEN RIGHT, with back and tail SCREEN LEFT. Image 2 front and image 3 original source support identity. Make ONE precise correction to image 1: the SIDE EARS are currently TOO THICK. Reduce the combined overlapping ear-blade WIDTH to only about 35 pixels in a 1254-square composition, with the SAME ear-tip height y=65 and ear-root height y=410. Front view has broad pink surfaces, but a true SIDE view shows only very thin upright blades like narrow ribbons, about one third the current image-1 ear thickness. Ear gently leans toward RIGHT, with only a hairline pink rim at RIGHT edge and one fine second rear edge. Keep the ear positions near image 1 center; do not enlarge head or shorten ear. Preserve image 1's ENTIRE BODY CONTOUR, depth, single pear shape without waist, flat back, forward belly, short foot, small end-on arm oval at y=800, and small WHITE fur tail at y=900 with brown fur dashes. This is an ear-thickness-only correction; retain all other identity geometry and colors. No face features of any kind, no eyes nose mouth blush. Match original thin deep brown outline, cream #FFF1C1, very thin pink inner rim, pure white background, no shadows, gradients, texture, text or props, full body uncut.
```

### right_5

附图：`views/candidates/round2/right_4.png`、`views/candidates/round2/front_4.png`、`refs/side_opposite.png`。

生成 basename：`exec-8824fb86-2739-4a97-bcc7-a94bcd193279.png`。

```text
Use case: precise-object-edit. Image 1 is the selected RIGHT SIDE faceless Usagi T-pose, facing SCREEN LEFT, with back and tail SCREEN RIGHT. Image 2 front and image 3 original source support identity. Make ONE precise correction to image 1: the SIDE EARS are currently TOO THICK. Reduce the combined overlapping ear-blade WIDTH to only about 35 pixels in a 1254-square composition, with the SAME ear-tip height y=65 and ear-root height y=410. Front view has broad pink surfaces, but a true SIDE view shows only very thin upright blades like narrow ribbons, about one third the current image-1 ear thickness. Ear gently leans toward LEFT, with only a hairline pink rim at LEFT edge and one fine second rear edge. Keep the ear positions near image 1 center; do not enlarge head or shorten ear. Preserve image 1's ENTIRE BODY CONTOUR, depth, single pear shape without waist, flat back, forward belly, short foot, small end-on arm oval at y=800, and small WHITE fur tail at y=900 with brown fur dashes. This is an ear-thickness-only correction; retain all other identity geometry and colors. No face features of any kind, no eyes nose mouth blush. Match original thin deep brown outline, cream #FFF1C1, very thin pink inner rim, pure white background, no shadows, gradients, texture, text or props, full body uncut.
```
