# Usagi 无五官 T-pose 四视图

供主导对照原作验收，随后由用户上传 Tripo 多视图图生 3D。未调用 Tripo、未生成 3D。优先打开 `sheet.png`：上排依次为正、背、左、右成图，下排为对应完整原作帧；灰色细线只在对照图中标脚底，四张单图没有辅助线、文字或阴影。

## 文件与方向

| 最终图 | 原始候选 | 实际附入的参考图（相对 `Material/tripo/`） | 选择原因 |
|---|---|---|---|
| `front.png` | `candidates/front_3.png` | `refs/front_full.png`、`refs/face.png`、`refs/ears.png` | 三张中描边较细、腹部更圆；保留细长粉色内耳、小脚和短水平手臂，无五官。 |
| `back.png` | `candidates/back_2.png` | `views/candidates/front_3.png`、`refs/back_full.png` | 比背面 1 的尾巴稍大、稍高，更接近原作下背中央位置；身形与正面基本重合。 |
| `left.png` | `candidates/left_2.png` | `views/candidates/front_3.png`、`refs/side.png`、`refs/back_full.png` | 相比左侧 1，重叠双耳边缘更清楚，尾巴更小且轮廓闭合。 |
| `right.png` | `candidates/right_2.png` | `views/candidates/front_3.png`、`refs/side_opposite.png`、`views/candidates/left_2.png`、`refs/back_full.png` | 修正右侧 1 内耳仍朝右的错误；粉色内耳在画面左、尾巴在右，与左侧构成相反方向。 |

方向约定：`left.png` 为相机在角色**左手边**拍摄，角色面朝画面**右侧**、尾巴在左；`right.png` 为相机在角色**右手边**拍摄，角色面朝画面**左侧**、尾巴在右。

**TODO(lead): 核对 Tripo 的左右约定。**

正背面双臂短且水平伸出，脚略分开；严格侧视时，T-pose 手臂沿相机视线方向伸出，表现为身体侧面的小椭圆端面，远侧手臂被遮挡，双脚也大致重叠。该椭圆是手臂端面，不是脸部五官。耳朵在侧面近乎重叠，仅露第二只耳边缘，以表示扁平薄耳厚度；背面为奶黄耳背，不展示朝前的粉色内耳。

## 实际生图方式与保存

使用内置 **`image_gen.imagegen`**（imagegen 技能的默认内置模式），每张候选独立调用一次，共 **9 次**：正面 3 张，背面 2 张，左侧 2 张，右侧 2 张。每次都显式传入 `referenced_image_paths`，成功附入上述原作 PNG 或已选正面 PNG；不是只用文字生成，也未使用 CLI/API 回退。所有参考图先经 `view_image` 查看。

工具原始输出默认保存在 `$CODEX_HOME/generated_images/<会话目录>/`。按照工具返回的 `output_hint` 路径，用 `cp` 将每次输出逐张复制进 `candidates/`，原件保留。原始输出实际为 **1254×1254**，没有伪称工具直接输出了 1024。原始候选完整保留，最终 1024 图由脚本等比例对齐生成。`generation.json` 保存每次的参考图列表、完整实际提示词、工具名、`transparent_background: false` 和原始输出文件名，不包含本机绝对路径。

生成不是确定性的；保留候选 PNG 才能复现本次交付。截帧、清白底、缩放对齐和对照拼图可确定性重跑。

## 角色特征逐项评分

人工将候选与原作并排检查，**每项 0–2 分**：0=不符，1=部分符合/仍有明显偏差，2=符合本项。评分不是模型测量或“完全还原”保证。尾巴在正面不可见算符合遮挡关系；侧视手臂按上面的 T-pose 投影检查。统一对齐后的尺寸和背景另列，不用加分掩盖造型偏差。

| 候选 | 奶黄/棕线 | 连续圆团/腹部 | 细长耳/内粉 | 短手小脚 | 白尾位置/遮挡 | 无五官 | T-pose/正交 | 与选中正面一致 | 合计 /16 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| front_1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 14 |
| front_2 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 14 |
| **front_3** | **2** | **1** | **2** | **2** | **2** | **2** | **2** | **2** | **15** |
| back_1 | 2 | 1 | 2 | 2 | 1 | 2 | 2 | 2 | 14 |
| **back_2** | **2** | **1** | **2** | **2** | **2** | **2** | **2** | **2** | **15** |
| left_1 | 2 | 1 | 1 | 2 | 1 | 2 | 2 | 1 | 12 |
| **left_2** | **2** | **1** | **2** | **2** | **1** | **2** | **2** | **1** | **13** |
| right_1 | 2 | 1 | 0 | 2 | 1 | 2 | 2 | 1 | 11 |
| **right_2** | **2** | **1** | **2** | **2** | **1** | **2** | **2** | **1** | **13** |

`front_1`、`front_2` 轮廓偏厚，第二张腹部更窄；`front_3` 线更细、腹部更圆，因此胜出。背面 2 改善尾巴位置与大小，但毛线仍太规整。左侧 2 改善双耳可读性和尾巴大小；右侧 2 改善内耳朝向。`candidates_sheet.png` 可一次查看全部九张，候选原图不做缩放覆盖。

## 统一尺寸与数值

运行 `tools/views/align_views.py`，读取 `selection.json`：

- 透明层先合成白底；将 `min(R,G,B) >= 240` 且 `max-min <= 12` 的近白中性像素置为 RGB `(255,255,255)`，不把奶黄和粉色归白。
- 按非白包围盒裁切，使用 LANCZOS **等比例**缩放；滤波后再次归白、去掉可能残留的纯白侧边，再按实际包围盒水平居中。不重画身体，不水平拉伸，也不移动耳朵、脚或尾巴等局部。
- 四张输出均为 **1024×1024、RGB PNG**；角色耳尖到脚底高 **870 px = 84.9609375%**（1024 的 85% 取整）；顶端 y=77、脚底 y=946，脚底下方留白 77 px。
- 正背面包围盒宽 522 px，左右侧宽 411 px；水平中心与画布中心的偏差不超过 0.5 px。详情见 `alignment.json`（包围盒右、下边界为不包含端点）。

重建环境与原作截帧见 `../refs/README.md`。依赖仅仓库外的 Pillow 13.0.0：

```sh
/tmp/usagi-004-views-venv/bin/python tools/views/extract_refs.py
/tmp/usagi-004-views-venv/bin/python tools/views/align_views.py
```

## 已知偏差与主导待判断

1. **最大偏差是身体轮廓。** 生图把头和腹部之间的收窄画得比原作更规整，侧面尤其接近上下两个圆团；原作侧面更连贯、更像圆润梨形。下半身仍比头窄，未达到任务特征文字中的“下半身略宽”。保留原作与候选并排证据，不能称为已完全还原。
2. 四视图比例大致一致，耳尖、脚底严格对齐，但不是同一真实 3D 模型的渲染：侧面手臂端面与正面手臂中心高度有数像素差，侧耳根略低；左右耳形、脚形、身体深度也有少量生成差异。仅缩放整张角色没有人为扭曲局部来掩盖差异。
3. 正面耳朵比原作规整对称、直立，原作耳朵常略向同侧倾斜；背面按转身后的耳背处理为无粉色，而原 GIF 为动画视角仍露部分粉色。侧面第二只耳边缘留有少量分离，不是严格零厚度平片。
4. 尾巴正背面位置接近原作，侧面为小凸起；背面棕色毛线偏规则，侧面白尾轮廓偏连贯的小云朵，原作是更松散的白毛团，细节未完全一致。
5. 主体色接近目标奶黄，中心像素约 `#FEF1C3`，不是所有像素都精确 `#FFF1C1`。原始生成有轻微色值变化，保留了这些变化；外部背景已清成纯白，没有投影。
6. 为去除五官，侧面原作鼻嘴带来的前凸轮廓一并平滑处理，失去了一部分原作脸型辨识度；这与“无五官身体”路线有关，应由主导结合后续贴片判断。

**TODO(lead): 对照 `sheet.png` 审定身体收窄、侧面耳/臂投影、尾巴毛线是否达到还原要求；若不接受上述偏差，针对这些部位重生成，不直接进入 Tripo。**

## 自查

执行者使用 `view_image` 检查四张最终单图、`sheet.png` 及 `candidates_sheet.png`，逐项确认：无脸部五官；正背面短臂水平、侧面短臂为端面；耳尖/脚完整；正面内耳粉色，背部白尾、侧面尾巴朝后；纯白底无投影。原作还原度和细节偏差见上节，最终视觉验收仍由主导完成。数值自查结果见 `selfcheck.json`。

## 实际提示词全文

下文逐字来自 `generation.json`，每节附本次真实输入图；未用省略号替代，也未用最终总结提示词冒充实际调用提示词。

### front_1

输入图（顺序与调用一致）：`refs/front_full.png`、`refs/face.png`、`refs/ears.png`。

```text
Use case: identity-preserve.
Asset type: Usagi orthographic reference for multiview image-to-3D.
Edit the exact Usagi character in the attached original animation frames. Image 1 front_full is the primary identity, silhouette and full-body reference; image 2 face is the head/body and ear spacing reference, NOT a request to keep facial markings; image 3 ears is the ear shape and short-limb reference. These are source images to edit, not loose inspiration. Preserve this exact character, do not redesign into a generic rabbit.
Produce ONE FRONT orthographic full-body T-pose image on a pure RGB white background, 1024 square composition. Face straight toward camera, perfectly upright, no perspective. Stretch both SHORT stubby arms straight horizontally sideways, just far enough to separate them from the body for rigging; do not make long human arms or hands/fingers. Two tiny round-ended feet slightly apart with soles on the same horizontal line. Head and body one continuous rounded cream silhouette with no neck, no separate head seam, no torso seam; keep the original big round head flowing into the compact rounded lower body, not a humanoid bunny torso. Both very slender elongated upright ears slightly separated, pink inner ears retained; ear length and narrowness from the source, not wide plush bunny ears. Thin dark chocolate brown outline. Flat cream fill close to #FFF1C1, soft original pink inner ears. Remove ALL eyes, eyebrows, mouth, nose, cheek blush, highlights and facial dots; the entire face is plain cream. Tail is behind body and invisible from straight front. Keep full ear tips and feet visible, character about 85% canvas height. Pure flat 2D original anime cel style, no 3D rendering, gradients, shadows, ground, props, other characters, text, watermark, panels or labels. Preserve exact original body proportions and palette as faithfully as possible.
```

### front_2

输入图（顺序与调用一致）：`refs/front_full.png`、`refs/face.png`、`refs/ears.png`。

```text
Use case: identity-preserve.
Asset type: Usagi orthographic reference for multiview image-to-3D.
Edit the exact Usagi character in the attached original animation frames. Image 1 front_full is the primary identity, silhouette and full-body reference; image 2 face is the head/body and ear spacing reference, NOT a request to keep facial markings; image 3 ears is the ear shape and short-limb reference. These are source images to edit, not loose inspiration. Preserve this exact character, do not redesign into a generic rabbit.
Produce ONE FRONT orthographic full-body T-pose image on a pure RGB white background, 1024 square composition. Face straight toward camera, perfectly upright, no perspective. Stretch both SHORT stubby arms straight horizontally sideways, just far enough to separate them from the body for rigging; do not make long human arms or hands/fingers. Two tiny round-ended feet slightly apart with soles on the same horizontal line. Head and body one continuous rounded cream silhouette with no neck, no separate head seam, no torso seam; keep the original big round head flowing into the compact rounded lower body, not a humanoid bunny torso. Both very slender elongated upright ears slightly separated, pink inner ears retained; ear length and narrowness from the source, not wide plush bunny ears. Thin dark chocolate brown outline. Flat cream fill close to #FFF1C1, soft original pink inner ears. Remove ALL eyes, eyebrows, mouth, nose, cheek blush, highlights and facial dots; the entire face is plain cream. Tail is behind body and invisible from straight front. Keep full ear tips and feet visible, character about 85% canvas height. Pure flat 2D original anime cel style, no 3D rendering, gradients, shadows, ground, props, other characters, text, watermark, panels or labels. Preserve exact original body proportions and palette as faithfully as possible.
Candidate 2, stronger fidelity correction: match the small original stubby proportions. Use the primary source image's gently curved contour and tiny feet. Ear length should remain about 0.5 of the merged head/body height (about 29% of total silhouette height), narrow ears with a little outward splay; do not make oversized wide ears. Keep a softly rounded compact lower body, avoiding a pinched waist or prominent neck. Uniform solid fill, no paper texture or shading. Keep the brown stroke moderate and comparable in relative thickness to the source, not heavy black. Make the arms short rounded horizontal tabs, visibly projecting from each side at the original arm-root level. Maintain generous clean white margins.
```

### front_3

输入图（顺序与调用一致）：`refs/front_full.png`、`refs/face.png`、`refs/ears.png`。

```text
Use case: identity-preserve. Edit the three supplied original Usagi frames into ONE clean FRONT T-pose turnaround frame, white background. Primary source is front_full; face and ears are supporting originals. Copy this exact original character's organic hand-drawn silhouette, not the shape of any previous generated example. Preserve the uninterrupted round head merging with the small plump lower body, no neck/seam. Keep source slender ears and their modest outward slant and small spacing; two tiny round feet. Only change the pose: upright orthographic front, both very short little arms held straight out horizontally to either side, feet slightly apart. Completely remove eyes, eyebrows, nose, mouth, blush and all facial dots. Keep inner-ear pink, cream body (#FFF1C1), original thin deep brown contour. Fill must be solid flat cream with no gradient, gloss, texture or shadow. In this candidate use a finer contour closer to the original line weight (about 1% of full character height), slender ears only about 1/3 of total height, and slightly wider rounded lower belly without an hourglass indentation. Original character identity/proportions matter most: no human torso, no long arms, no fingered hands, no rabbit snout. Tail hidden behind body from front. Single full-body character centered on a pure white square canvas with 8% clearance around ear tips and feet, no labels, no props, no ground/shadow, no other objects. 1024x1024.
```

### back_1

输入图（顺序与调用一致）：`views/candidates/front_3.png`、`refs/back_full.png`。

```text
Use case: identity-preserve. Make ONE orthographic BACK view of the exact character in image 1 (the selected faceless FRONT T-pose), using image 2 (original back_full animation frame) for actual rear anatomy and white tail location. Image 1 is the exact identity/geometry/palette/line-weight lock; image 2 is source evidence for the tail only and rear shape, do not copy the background or other characters.
Turn this same character exactly 180 degrees while keeping its pose, front silhouette height, head/belly width and outline, ear length/spacing and arm-root height unchanged. Upright narrow ears seen from behind, cream ear backs with no pink front surfaces visible, keep the ear shapes consistent with image 1. Two SHORT rounded arms stretched straight sideways horizontally, two tiny round-ended feet slightly apart. Continuous cream head-body, no neck or seams. Center a small white fluffy round tail on the lower back, at the same low-back location as the original image 2, tail about one fifth of belly width, small irregular furry contour with thin brown strokes (not a big flower or large pompom). Tail is the only added rear feature. No facial features anywhere, no eyes, no nose, no mouth, no blush. Flat cream close to #FFF1C1 and same thin dark chocolate outline as image 1. Solid unshaded fills, no texture, no ground or cast shadow. Pure RGB white background, full body and ear tips in frame with margin, one character only, square 1024x1024, no words, no panels, no labels, no props. Preserve original Usagi identity.
```

### back_2

输入图（顺序与调用一致）：`views/candidates/front_3.png`、`refs/back_full.png`。

```text
Use case: identity-preserve. Make ONE orthographic BACK view of the exact character in image 1 (the selected faceless FRONT T-pose), using image 2 (original back_full animation frame) for actual rear anatomy and white tail location. Image 1 is the exact identity/geometry/palette/line-weight lock; image 2 is source evidence for the tail only and rear shape, do not copy the background or other characters.
Turn this same character exactly 180 degrees while keeping its pose, front silhouette height, head/belly width and outline, ear length/spacing and arm-root height unchanged. Upright narrow ears seen from behind, cream ear backs with no pink front surfaces visible, keep the ear shapes consistent with image 1. Two SHORT rounded arms stretched straight sideways horizontally, two tiny round-ended feet slightly apart. Continuous cream head-body, no neck or seams. Center a small white fluffy round tail on the lower back, at the same low-back location as the original image 2, tail about one fifth of belly width, small irregular furry contour with thin brown strokes (not a big flower or large pompom). Tail is the only added rear feature. No facial features anywhere, no eyes, no nose, no mouth, no blush. Flat cream close to #FFF1C1 and same thin dark chocolate outline as image 1. Solid unshaded fills, no texture, no ground or cast shadow. Pure RGB white background, full body and ear tips in frame with margin, one character only, square 1024x1024, no words, no panels, no labels, no props. Preserve original Usagi identity.
Candidate 2 refinement: Tail size and placement must copy the source back frame faithfully: a fluffy white circular patch centered at about 78% of full character height down from ear tips, about one quarter of lower-body width, with a few loose short brown fur strokes interrupting its perimeter, not a regular radial sun pattern. Match the FRONT reference's moderately thin contour, same rounded belly, same feet separation and exact ear length. The resulting silhouette should align with image 1 as a real 180-degree turnaround. Flat unshaded cream, no texture.
```

### left_1

输入图（顺序与调用一致）：`views/candidates/front_3.png`、`refs/side.png`、`refs/back_full.png`。

```text
Use case: identity-preserve. Produce ONE exact LEFT SIDE orthographic turnaround view of the same original Usagi character. Image 1 selected FRONT T-pose is the strict geometry, ear length and palette lock. Image 2 original side.png shows source side anatomy and the tail behind the lower body. Image 3 back_full is source tail identity evidence.
Camera is at the character's LEFT hand looking along the outstretched arm. The character faces SCREEN RIGHT; back is SCREEN LEFT. Rotate the image-1 character by exactly 90 degrees; no three-quarter face, no oblique body. Preserve head-to-body and ear-to-body height, compact round merged head/body without neck, tiny round feet and SHORT T-pose arms. Arms remain straight horizontally to character left/right in 3D; from a true side view the near short arm is foreshortened/end-on, a little rounded oval on the side of the body at exactly the front image's arm height. Do not draw a long arm pointing forward or down. The far arm is occluded. Feet overlap in true side projection. Keep both tall slender ears upright; the two ears overlap nearly exactly from side, with a small second edge only if anatomically necessary. Show the ears as THIN FLAT ear blades edge-on, narrow cream slivers with a very narrow pink inner rim, not two broad front-facing pink ovals. Tiny white furry round tail protrudes modestly behind lower back at SCREEN LEFT, like the original, not a large balloon. Remove ALL facial features including eye, eyebrow, mouth, nose, cheek blush; no muzzle projections or mouth contour, face just a smooth cream surface. Original thin dark chocolate brown outlines, flat solid cream #FFF1C1 and pale inner-ear pink. No gradients, no shading, no texture, no cast shadows, pure RGB white background. Full body including ears and soles inside canvas with margin, upright stance and level sole, single character, square 1024x1024, no props, text, panels or other characters. Exact original identity matters most.
```

### left_2

输入图（顺序与调用一致）：`views/candidates/front_3.png`、`refs/side.png`、`refs/back_full.png`。

```text
Use case: identity-preserve. Produce ONE exact LEFT SIDE orthographic turnaround view of the same original Usagi character. Image 1 selected FRONT T-pose is the strict geometry, ear length and palette lock. Image 2 original side.png shows source side anatomy and the tail behind the lower body. Image 3 back_full is source tail identity evidence.
Camera is at the character's LEFT hand looking along the outstretched arm. The character faces SCREEN RIGHT; back is SCREEN LEFT. Rotate the image-1 character by exactly 90 degrees; no three-quarter face, no oblique body. Preserve head-to-body and ear-to-body height, compact round merged head/body without neck, tiny round feet and SHORT T-pose arms. Arms remain straight horizontally to character left/right in 3D; from a true side view the near short arm is foreshortened/end-on, a little rounded oval on the side of the body at exactly the front image's arm height. Do not draw a long arm pointing forward or down. The far arm is occluded. Feet overlap in true side projection. Keep both tall slender ears upright; the two ears overlap nearly exactly from side, with a small second edge only if anatomically necessary. Show the ears as THIN FLAT ear blades edge-on, narrow cream slivers with a very narrow pink inner rim, not two broad front-facing pink ovals. Tiny white furry round tail protrudes modestly behind lower back at SCREEN LEFT, like the original, not a large balloon. Remove ALL facial features including eye, eyebrow, mouth, nose, cheek blush; no muzzle projections or mouth contour, face just a smooth cream surface. Original thin dark chocolate brown outlines, flat solid cream #FFF1C1 and pale inner-ear pink. No gradients, no shading, no texture, no cast shadows, pure RGB white background. Full body including ears and soles inside canvas with margin, upright stance and level sole, single character, square 1024x1024, no props, text, panels or other characters. Exact original identity matters most.
Candidate 2 correction: prioritize the original side frame's SINGLE CONTINUOUS round/pear-shaped profile, a smooth back flowing into rounded lower belly, with at most a very shallow indentation. Avoid a stacked two-ball snowman silhouette. Side body depth should be about 75-80% of the front head's width. Arms stay end-on as small horizontal oval at the same y height as image 1 arms. Ears remain narrow edge-on, overlapping pair; a tiny sliver of a second ear edge may show, but not two broad oval ears. Make the tail small and lightly irregular, avoiding a circular cogwheel. Keep the same total ear-tip-to-foot height and same ear root height as image 1. This is a pure left SIDE view, face right, no facial features and no protruding nose/snout.
```

### right_1

输入图（顺序与调用一致）：`views/candidates/front_3.png`、`refs/side_opposite.png`、`views/candidates/left_2.png`、`refs/back_full.png`。

```text
Use case: identity-preserve. Create ONE orthographic RIGHT SIDE T-pose turnaround frame for the exact same Usagi character, with reference images attached. Image 1 is the selected faceless FRONT: lock proportions, ear length, arm-root height, palette and outline. Image 2 is original side_opposite.png, evidence for the actual source's screen-left-facing side anatomy and white tail position. Image 3 is the selected LEFT SIDE: lock body depth, narrow flat ear thickness, end-on arm and small tail size so both side images are one same character. Image 4 is original back_full tail evidence.
The camera is at the character's RIGHT hand, looking along the short outstretched arm. The character faces SCREEN LEFT, back is SCREEN RIGHT. Exactly 90-degree side orthographic, no perspective or three-quarter view. Mirror-consistent geometry to the left side reference, same total height, ear root height, belly width, tiny overlapping feet. Keep one continuous rounded cream head/body with no separate head, no neck or seams. Both tiny arms stay straight horizontally to body left/right in 3D, so the near one appears as a small end-on horizontal oval at the same y as front arm roots, far arm occluded; no forward-pointing or downward dangling arm. The ears are thin flat blades seen edge-on, near-overlapping slender upright cream slivers with a narrow pink inner rim and a tiny second ear edge (match image 3), not two broad pink ovals. Tiny fluffy white tail protrudes modestly at SCREEN RIGHT behind the lower back, matching original low tail position and image 3 size, small irregular fur contour, not a large pompom. Completely blank smooth cream face: no eyes/eyebrows/nose/mouth/blush/facial dots, no muzzle projection. Thin deep chocolate brown contour, flat cream close to #FFF1C1 and pale pink, pure RGB white background. No gradients, shading, texture, ground, shadows, text, props, panels or other characters. Full body and ear tips uncut, centered within a 1024 square image. Exact original character fidelity first.
```

### right_2

输入图（顺序与调用一致）：`views/candidates/front_3.png`、`refs/side_opposite.png`、`views/candidates/left_2.png`、`refs/back_full.png`。

```text
Use case: identity-preserve. Create ONE orthographic RIGHT SIDE T-pose turnaround frame for the exact same Usagi character, with reference images attached. Image 1 is the selected faceless FRONT: lock proportions, ear length, arm-root height, palette and outline. Image 2 is original side_opposite.png, evidence for the actual source's screen-left-facing side anatomy and white tail position. Image 3 is the selected LEFT SIDE: lock body depth, narrow flat ear thickness, end-on arm and small tail size so both side images are one same character. Image 4 is original back_full tail evidence.
The camera is at the character's RIGHT hand, looking along the short outstretched arm. The character faces SCREEN LEFT, back is SCREEN RIGHT. Exactly 90-degree side orthographic, no perspective or three-quarter view. Mirror-consistent geometry to the left side reference, same total height, ear root height, belly width, tiny overlapping feet. Keep one continuous rounded cream head/body with no separate head, no neck or seams. Both tiny arms stay straight horizontally to body left/right in 3D, so the near one appears as a small end-on horizontal oval at the same y as front arm roots, far arm occluded; no forward-pointing or downward dangling arm. The ears are thin flat blades seen edge-on, near-overlapping slender upright cream slivers with a narrow pink inner rim and a tiny second ear edge (match image 3), not two broad pink ovals. Tiny fluffy white tail protrudes modestly at SCREEN RIGHT behind the lower back, matching original low tail position and image 3 size, small irregular fur contour, not a large pompom. Completely blank smooth cream face: no eyes/eyebrows/nose/mouth/blush/facial dots, no muzzle projection. Thin deep chocolate brown contour, flat cream close to #FFF1C1 and pale pink, pure RGB white background. No gradients, shading, texture, ground, shadows, text, props, panels or other characters. Full body and ear tips uncut, centered within a 1024 square image. Exact original character fidelity first.
Candidate 2, essential geometric correction: the entire side profile must be the reverse viewing direction of image 3, including the EARS. Because the face points SCREEN LEFT, the thin pink INNER-EAR RIM must be on the SCREEN LEFT/front side of the ear blade, not on screen right/back. The small far-ear edge likewise sits on the LEFT side of the main blade, exactly the horizontal-reflection geometry of the left view. Tail stays on SCREEN RIGHT/back. Keep every other silhouette proportion, front-lock height and arm-root level matching image 3. Do not merely move the tail while leaving ear orientation unchanged. Preserve left/right consistent anatomy and no facial features.
```
