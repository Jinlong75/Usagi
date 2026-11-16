# Usagi 无五官 T-pose 四视图（第三轮）

当前供 Tripo 上传的是本目录的 `front.png`、`back.png`、`left.png`、`right.png`。`sheet.png` 上排为最终四图和固定的第二轮浅灰参考线，下排为原作参考帧。`candidates_sheet.png` 是第三轮候选联系表，不用于上传。

## 第三轮范围与历史保留

在主分支第二轮成果 `0a4edf0` 上只修正宽圆穹顶和侧面圆背，没有重新截帧。第二轮四张最终图按原像素保存在 `candidates/round2_final/{front,back,left,right}.png`；该目录还保留第二轮对照图、候选联系表及 selection/alignment/landmarks/selfcheck。第二轮说明全文归档为 `README_round2.md`，实际提示词和调用记录为 `generation_round2.json`。本文件追加记录第三轮实际交付；第一、二轮候选保持原样。

第三轮共 **14 次独立附图调用**：正面 4、背面 3、左侧 4、右侧 3，原始输出在 `candidates/round3/`。每次均把现有 T-pose 或原作 PNG 作为图像输入，没有纯文字生成，没有脚本画轮廓或翻转图片冒充另一侧。

## 最终选择

| 最终图 | 第三轮候选 | 实际附图（相对于 Material/tripo） | 选择原因 |
|---|---|---|---|
| front.png | front_4 | views/candidates/round2_final/front.png；refs/front_full.png | 前三张在拓宽头顶时引入上部鼓包；4 的穹顶较宽而侧线不再明显内收，下半部最接近二轮。 |
| back.png | back_1 | views/candidates/round2_final/back.png；views/candidates/round3/front_4.png；refs/back_full.png | 保留居中白尾巴和低位短臂，上部轮廓与选中正面接近；2 略鼓，3 稍窄。 |
| left.png | left_2 | views/candidates/round3/left_1.png；views/candidates/round2_final/left.png；views/candidates/round3/front_4.png；refs/side.png | 保留连续圆背和宽冠顶，厚度比 1 稍收；3 有局部转折，4 收背效果有限。 |
| right.png | right_2 | views/candidates/round2_final/right.png；views/candidates/round3/left_2.png；views/candidates/round3/front_4.png；refs/side_opposite.png | 圆背、圆臀过渡清楚，厚度和全高更接近 left_2，1/3 的冠顶或手臂偏移稍大。 |

方向保持：`left.png` 是相机在角色左手边，角色朝画面右；`right.png` 是相机在角色右手边，角色朝画面左。

TODO(lead): 核对 Tripo 的左右约定。

## 生图功能的实际用法

使用 imagegen 技能的内置 `image_gen.imagegen`，每张候选一次调用；`transparent_background=false`。原作参考、第二轮图均先用 `view_image` 检查，后续候选在工具返回时直接查看。每次调用显式传入 `referenced_image_paths`，完整附图清单和实际 prompt 见文末以及 `generation_round3.json`；`generation.json` 同步为当前轮记录。

工具默认将图片保存至 `$CODEX_HOME/generated_images/<会话目录>/exec-*.png`。本轮实际输出均为 1254×1254；按工具返回的实际路径复制进仓库 `candidates/round3/`，保留默认源文件。仓库记录只保存输出 basename，不保存本机用户路径。候选 PNG 没有裁剪、改色或缩放；最终四图由对齐脚本产生。附图确实传给了工具，但生成结果并非逐像素的局部修改。

## 第三轮核对表打分

人工对照原作及本轮候选，每项 0～2 分：0 明显不符，1 有可见偏差，2 本组中较好符合；不是客观相似度或主导验收结论。

C=奶黄/棕线平涂；S=单团无腰、下部较宽；E=耳形/薄耳；L=水平短臂与小脚；T=尾巴（正面隐藏、背面居中、侧面后下部）；V=无五官/正交方向/白底；U=四视图一致性；D=宽圆穹顶；B=连续圆背（正背视图无此投影要求，记 2）。满分 18。C 扣 1 是细微填色不均，T 后侧视扣 1 是毛线与高度残差。

| 候选 | C | S | E | L | T | V | U | D | B | /18 | 观察 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| front_1 | 1 | 1 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 15 | 头顶变宽，但上部略鼓、手臂前略内收，弃用。 |
| front_2 | 1 | 0 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 14 | 头部加宽过度，上部宽于下腹，弃用。 |
| front_3 | 1 | 1 | 2 | 2 | 2 | 2 | 1 | 2 | 2 | 15 | 比 2 克制，仍有轻微上部鼓起，弃用。 |
| front_4 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 17 | 选用；穹顶宽圆，侧线向下连续，低位短臂和下腹基本保留。 |
| back_1 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 16 | 选用；上部与 front_4 接近，尾巴居中，下半部保留较好。 |
| back_2 | 1 | 1 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 15 | 上部略鼓，尾巴与 1 接近，保留备选。 |
| back_3 | 1 | 2 | 2 | 2 | 1 | 2 | 1 | 1 | 2 | 14 | 保留无腰轮廓，但穹顶比选中正面略窄，弃用。 |
| left_1 | 1 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 2 | 15 | 圆背清楚，但加弧后身体较厚，继续微调。 |
| left_2 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 16 | 选用；弧线连续、比 1 稍收，薄耳与原低位短手保留。 |
| left_3 | 1 | 1 | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 13 | 尾巴根附近有轻微转折，背部上段偏鼓，弃用。 |
| left_4 | 1 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 2 | 15 | 与 2 接近，局部稍厚，30px 收背请求只实现少量，保留备选。 |
| right_1 | 1 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 2 | 15 | 圆背明确，但身体高度/冠顶和左侧有小幅差异。 |
| right_2 | 1 | 2 | 2 | 2 | 1 | 2 | 2 | 2 | 2 | 16 | 选用；与 left_2 的全高、轮廓厚度最接近，脚底统一，尾在右。 |
| right_3 | 1 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 2 | 15 | 与 2 接近，但耳根与手臂略上移，保留备选。 |

## 对齐、参考线与自查

`tools/views/align_views.py` 保持白底合成、近白清理和整体等比缩放，不修改局部造型。输出统一 RGB 1024×1024；非白包围盒高 **870 px**（85% 四舍五入），耳尖 y=77、脚底 y=946，横向按包围盒居中。近白清理阈值仍为各通道 >=240 且通道差 <=12，奶黄、粉色与棕线保留。工具若输出透明图，也先合成白底。

`reference_lines.json` 直接取自二轮正面 `alignment.json`，固定为 EAR_TIP=77、HEAD_TOP=344、ARM=655、WIDEST_BODY=706、TAIL_TARGET=726、SOLE=946。六条线仅叠加到 `sheet.png`，不随本轮候选重新计算；最终上传图没有线。原脚本的尺寸/高度/脚底断言未改。`landmarks.json` 仍为在原候选上估计的视觉区域位置（约 ±10～25px），`alignment.json` 是其坐标换算；这些近似标记不是像素精确的最宽行测量。

在仓库根目录运行（Pillow 环境在仓库外）：

```sh
python3 -m venv /tmp/usagi-004-views-venv
/tmp/usagi-004-views-venv/bin/pip install Pillow==13.0.0
/tmp/usagi-004-views-venv/bin/python tools/views/align_views.py
```

本轮沿用已存在的 Pillow 13.0.0 环境。对齐命令退出 0；内置 RGB/尺寸/870px/脚底断言通过。使用 `view_image` 阅读最终 front/back/left/right、sheet、候选联系表，按上表逐项检查。聚焦像素及归档检查记录于 `selfcheck.json`：尺寸/高度/脚底、纯白边缘、二轮原像素归档、候选哈希与附图清单。没有启动 GUI 程序，也没有自行运行完整验收 `sh docs/specs/checks/004-check.sh`；该命令交提交后的门禁运行。

## 已知偏差与待主导核对

- 最大差距仍是**原作自然不规则的轮廓和线条手感**：本轮圆团轮廓更规则，填色有很轻的波动，不能宣称完全还原。仅按包围盒对齐，不伪造严格 3D 投影一致性。
- 正背穹顶已放宽、两侧后背已从直线变为凸弧；侧面腹部仍饱满，背部稍平而有弧，尾巴从后下部凸出。穹顶上 1/3 的宽度关系是提示词约束及人工判断，没有声称精确量到 80%。
- 修改提示词锁定了二轮其余部分，但模型没有逐像素保留它们：耳根/头顶、手臂、尾巴仍有数像素变化。当前视觉标记：正背头顶约 y341、左 y345、右 y339；手臂约 y655/655/649/644。二轮对应约 y344/343/347/342 与 y655/655/652/649。固定参考线不移动来遮掩这些差异。
- 背面尾巴仍居中，目视中心约 y702；侧面约 y734/y726，背侧高度残差约 24～32px（继承二轮已有高度差并有少量漂移）。尾巴毛线依然偏规则，白尾轮廓比原作简化。
- 正背最宽处不是一个尖锐的单行，拓宽后的上部到下腹形成宽区；侧面厚度目视约为正面身体宽度的 85% 左右，最大截面可能略厚。脚本只等比缩放，未挪动局部或横向拉伸。
- TODO(lead): 对照 `sheet.png` 与 `candidates/round2_final/sheet.png` 验收穹顶、背弧及保留部件的高度残差，确认足够还原后再交用户上传 Tripo。

## 第三轮实际提示词全文

下列每节是实际发送的完整 prompt 字符串；附图顺序与 `referenced_image_paths` 一致。参考路径相对 `Material/tripo/`，basename 是工具默认保存文件名。

### front_1

附图：`views/candidates/round2_final/front.png`、`refs/front_full.png`、`refs/ears.png`。

生成 basename：`exec-742a0069-dceb-4da6-8770-260d826d5840.png`。

```text
Use case: precise-object-edit / identity-preserve. Image 1 is the EDIT TARGET: approved round-2 Usagi faceless FRONT orthographic T-pose on white, 1024 square. Images 2-3 are original animation shape references only. Make ONE narrowly scoped correction to image 1: broaden and round the upper head dome. Current upper contour narrows too much into an egg under the ears; make a broad rounded crown with a shallow almost-flat arc between the unchanged ear roots and fuller upper shoulders. At one third of the ear-root-to-sole body height, head width should be about 80% of maximum lower-body width. Keep one single seamless plump head/body mass with no neck or waist, lower body widest. CHANGE ONLY upper body contour above the arms; preserve the exact lower half silhouette, maximum body width, widest-level height, two horizontal stubby arms at y~655, tiny feet and soles y~946, all ears including their tips y~77, ear spacing, pink inner ears, thin brown outline and cream fill of image 1. Head crown y~344 unchanged. Do not shorten ears or move features. Original images are ONLY guidance for broad dome curvature, do not copy their facial features, action pose or background. Keep entire face perfectly plain cream: no eyes, nose, mouth, brows or blush. Same pure white background, no shadows, no text, no guide lines, same view, same framing. Output ONE edited full-body square image, not a sheet.
```

### front_2

附图：`views/candidates/round2_final/front.png`、`views/candidates/round3/front_1.png`、`refs/front_full.png`。

生成 basename：`exec-21a0c2f0-15ef-4ba3-8b78-df6e6e007815.png`。

```text
Use case: precise-object-edit / identity-preserve. Image 1 approved round2 front is the primary EDIT TARGET; image 2 shows the desired BROADER crown only but has a faulty waist; image 3 original Usagi is shape reference. Output one faceless FRONT orthographic T-pose on white. Change ONLY upper head contour of IMAGE 1 to a broader flatter dome, preserving every other part of IMAGE 1. Between original ear roots, crown stays at same height y344/1024; upper shoulders expand outward earlier, so head at 1/3 body height is ~80% of max body width. CRITICAL: no upper-head ball, no inward tuck before the arms, no waist. The contour must gently WIDEN continuously from crown to arms and to widest LOWER BELLY below arms. Do not copy image2's inward narrowing just ABOVE its arms; image1 lower body and arm junction shape are approved. At the original 1024 target scale, outer body left x~295 at y450, x~256 at y550, x~242 at y625, x~238 at y705; right side symmetrical. This gives broad upper third without head bulge or waist. Keep the original arm geometry and level y655, belly width and level y706, feet and sole y946; ears and pink interiors unchanged with tips y77; keep all lower pixels conceptually locked. Same cream, fine dark-brown outline, no neck, plain blank face with NO facial marks. White background, no shadow, text, guide lines or extras. Full body, same proportions and framing as image1. One square image.
```

### front_3

附图：`views/candidates/round2_final/front.png`、`refs/front_full.png`。

生成 basename：`exec-3afca876-aecd-4f4f-b918-18317eb55609.png`。

```text
Edit image 1, the approved faceless Usagi FRONT T-pose, using image 2 original Usagi as reference ONLY for the broad round crown. Make the head dome wider and less egg-like. THIS IS A TINY LOCAL EDIT TO THE TOP CAP ONLY. Do not redesign the whole silhouette. Keep the entire lower 45% of image 1 unchanged including arms, lower belly and feet. Keep both ears identical. Change only the cap of the head between y345 and y530 in the 1024 target: a broad, shallow rounded dome with full upper corners like the original, almost flat between ears, instead of a narrow tapering egg. The cap should expand outwards much earlier near the ear bases then blend back smoothly into the existing side contour by y550. Body outline must continue widening gently downward to the original largest lower-belly width at y706. Do NOT bulge a separate round head, do NOT narrow above or below arms, NO neck, NO waist, NO snowman. Conceptual contour guidance for 1024: head dome crown y344; outer upper corners x350 and x674 near y385, x300 and x724 near y450, returning to original x265 and x759 near y550. Nothing above the arms may become wider than the original belly at x238 to786. All arm, widest-body, feet, ear-tip heights and body width exactly as image1. Preserve cream, pink, fine brown outline, white background, no shadows. Same full-body front orthographic framing; no facial features or marks, no labels. Output one square image.
```

### front_4

附图：`views/candidates/round2_final/front.png`、`refs/front_full.png`。

生成 basename：`exec-c0a46958-3d11-4de9-861e-c1b9fef39d81.png`。

```text
Precise local image edit. Image1 is the edit target, a plain-faced front Usagi T-pose; image2 is original cartoon crown-shape reference only. Keep image1 almost exactly unchanged. Widen ONLY the very top of the head below ear roots: make the crown shallow and broad rather than pointed, by pushing its upper outer shoulders outward by about TWENTY pixels on each side near y390 (on 1024 image1), then smoothly tapering that offset back to ZERO by y480. Head top and ear-root y344 remain unchanged. The key is a slightly flatter and wider TOP CAP, not a bigger circular head. All pixels and contours at y500 and below must retain image1 shape and width. Original body width at y550=513px and y600=540px must remain; lower belly at y705=550px must remain the maximum body width, so there is no waist or upper-head bulge. Keep the whole ONE-piece head-body silhouette, same low horizontal short arms y655, tiny feet, ear tips y77, soles y946, ears, pink inner ears, cream color and fine brown outline. Do not inflate middle head or change lower body. No facial features, blush, shading or shadow, pure white background, full-body FRONT orthographic view. Output one square edited image only.
```

### back_1

附图：`views/candidates/round2_final/back.png`、`views/candidates/round3/front_4.png`、`refs/back_full.png`。

生成 basename：`exec-98aa154b-2974-427b-a458-8c272bb9da13.png`。

```text
Use case: precise-object-edit / identity-preserve. Image 1 is EDIT TARGET: approved round2 Usagi BACK orthographic faceless T-pose. Image 2 is revised front and is the exact guide for new broader dome. Image3 original animation is supporting identity reference only. Change ONLY image1's top cap to match image2 broad shallow rounded head crown, fuller upper corners, almost flat gently arced crown between ear roots, not narrow egg. Preserve the seamless single mass with no waist, lower belly remains widest. Keep ALL lower-body shape and levels unchanged from image1: horizontal short arms at y655, maximum lower belly y706, center white tail at x512 y706, same little feet and soles y946 at 1024 scale. Ear tips y77 and crown y344 unchanged. Back ears remain cream with NO pink interior. Same ear shape and spacing as image1, don't copy front pink ears. Keep tail round white with sparse dark-brown broken fur strokes, don't lower, enlarge or move tail. Keep original cream, brown outline thickness, no facial features, plain white background, no shading, text or guides. Output one full-body square BACK image, same framing. Only crown contour changes, not torso, ears or limbs.
```

### left_1

附图：`views/candidates/round2_final/left.png`、`views/candidates/round3/front_4.png`、`refs/side.png`。

生成 basename：`exec-12c12420-07c2-447c-80e6-bc7c6bdf1a39.png`。

```text
Use case: precise-object-edit / identity-preserve. Image1 is the EDIT TARGET: approved round2 LEFT orthographic Usagi profile FACING RIGHT. Image2 revised front guides broad head dome, image3 original animation guides naturally rounded back. Make ONLY TWO contour corrections to image1: (1) replace its cut-flat VERTICAL LEFT BACK EDGE with one smooth outward-convex rounded arc flowing from crown through back into rump; back a little flatter than full right belly but visibly curved, absolutely no long ruler-straight segment. Keep maximum side body thickness about 80-85% of front body width, so don't make a big new bulge. Curve back mostly by bringing upper/lower back slightly INWARD while the middle stays near its original x position. Guide at 1024: back near x350 at y450, x322 at y550, x310 at y665, x322 at y780, rounding to x375 y860. (2) slightly broaden the very top cap below the unchanged ears into a full shallow round dome matching image2, not pointed egg. Keep one seamless head/body mass without neck or waist. LOCK everything else from image1: facing right; thin narrow slightly forward-leaning ears with pink sliver; ear tips y77, crown y347; horizontal arm seen as same small oval at y652; widest-body region ~y711; white fuzzy tail on LEFT BACK at y731, not near foot; tiny front-facing foot and sole y946; original right belly curve, original body height, cream fill and fine brown outline, plain faceless surface. Tail stays attached to curved back, same size and height. White background, no shadow, text or guides, no eyes/nose/mouth/blush. One square full-body LEFT view, no sheet.
```

### right_1

附图：`views/candidates/round2_final/right.png`、`views/candidates/round3/left_1.png`、`views/candidates/round3/front_4.png`、`refs/side_opposite.png`。

生成 basename：`exec-3b98baf2-bcb2-4b78-b40d-04f5f3fa5c16.png`。

```text
Use case: precise-object-edit / identity-preserve. Image1 is EDIT TARGET: round2 RIGHT profile Usagi FACING LEFT. Image2 is corrected opposite-side LEFT profile, supporting rounded-back curvature only; image3 corrected front is broad dome reference, image4 original animation confirms rounded back. Make only TWO corrections to image1: replace its cut-flat vertical RIGHT back with a softly outward-curved back and rump, and broaden very top crown into shallow rounded dome. The right back must follow a continuous convex ARC from upper head to rounded lower rump, visibly curved at all levels, slightly flatter than left-side belly. Preserve side thickness about 80-85% of front body width. Don't inflate whole body, don't introduce a waist, stacked balls or separate head. Keep everything else from image1 unchanged: very thin flat forward-leaning ears with pink edge; ear tips y77 and crown y342 at 1024; left-facing round belly and tiny front foot; small oval arm endpoint at y649; largest lower-body level y708; same white fuzzy tail at RIGHT BACK centered y728, same size and sparse brown fur strokes, attached to back not foot; sole y946. Preserve original ear lengths, body height, low short arm position, foot size, cream color, thin dark brown outline, plain faceless surface, pure white background, no shadow, no text or guides. Image2 is NOT the output angle: output must be facing LEFT with tail on RIGHT and ears leaning LEFT, matching image1. One square full-body RIGHT orthographic view.
```

### left_2

附图：`views/candidates/round3/left_1.png`、`views/candidates/round2_final/left.png`、`views/candidates/round3/front_4.png`、`refs/side.png`。

生成 basename：`exec-0eb4506a-6e90-4785-ad4f-9bb41e14632e.png`。

```text
Precise-object-edit. Image1 corrected LEFT profile is target. Keep its rounded back and broad shallow crown; make one tiny correction to bring its side depth closer to original image2: reduce body thickness by ONLY 4 percent, by moving curved LEFT back inward a little. Image3 selected front provides same-character width reference, image4 original provides contour reference. Output still FACING RIGHT, tail LEFT. Maintain a continuous outward-convex arc along entire back; never restore image2's cut-flat vertical back. Keep rounded rump. At the middle body, ear-root-to-sole 50-65%, side depth should be about 0.83 times the FRONT body width, excluding arms and tail. Back maximum outward curve should occur low, near widest-belly level, not at upper head. Preserve image1's exact front belly contour, single no-waist body, crown height, ear shape, thinness and pink sliver, arm oval size and vertical level, tail size and vertical level, forward tiny foot, feet and total height. Same cream, fine brown contour, white background, no shading or shadows, no facial features or text. Don't change angle or framing, only the small back-curve adjustment. One square image.
```

### left_3

附图：`views/candidates/round2_final/left.png`、`views/candidates/round3/right_1.png`、`views/candidates/round3/front_4.png`、`refs/side.png`。

生成 basename：`exec-ee2ab773-6217-4999-8297-b7add872ecbb.png`。

```text
Edit image1 (round2 LEFT profile, facing RIGHT) to correct ONLY its back and crown. Original cartoon reference is image4; revised opposite-side profile image2 is for matching body THICKNESS and curved-back shape; selected front image3 is for matching broad crown. Keep original image1 maximum side thickness unchanged, about 82% of front body width; do not add volume outside the original straight-back x position. Instead sculpt a gently rounded convex LEFT back by moving the upper back and lower rump slightly inward while preserving the middle-back position. It must be visibly CURVED from crown to rump, no long vertical flat edge. Keep generous lower belly toward RIGHT and a slightly flatter but round back toward LEFT, one seamless plump mass without waist. Top head should be a BROAD shallow round dome, not a tapered egg. Preserve image1 ears exactly: thin overlapping forward-leaning strips, pink inner-edge sliver, same tip and root heights. Keep arm oval level, white tail size and level, lower belly widest level and forward tiny foot and sole level unchanged. Tail stays at LEFT back, original height, sparse brown fur marks. Match cream and fine dark-brown outline of image1, same faceless surface, pure white, no shadow. Same pose/view/framing. ONE square LEFT orthographic view facing RIGHT, not the direction of image2. No labels, guides, eyes, mouth, nose or blush.
```

### left_4

附图：`views/candidates/round3/left_1.png`、`views/candidates/round3/front_4.png`、`refs/side.png`。

生成 basename：`exec-3db424b8-703e-4ba5-8f6c-dce9ff893037.png`。

```text
Edit image1 only: make its LEFT back curve less bulging. Move the whole LEFT back contour 30 pixels RIGHT at the body's middle, smoothly blending to the same crown at top and same bottom at feet. This removes a thin crescent of yellow from the back, REPLACING it with white background, and translates attached white tail slightly RIGHT to stay attached at exactly the same height. Do not move or change the RIGHT belly contour, foot, ear, arm oval, crown height, tail height, or any other part. The back must remain visibly rounded, with a long gentle OUTWARD-CONVEX ARC, no straight vertical segment and no notch at tail. Side thickness after edit should be about 82-85% of image2 front body's width, exclude arms and tail. Image3 original is rounded-back reference. Preserve broad shallow dome, one continuous faceless body with NO waist, thin ear strip with pink interior sliver, same brown line and cream fill, pure white background, no shadow. One full-body square LEFT profile facing RIGHT, tail on LEFT. Absolutely no facial features, labels or guides.
```

### right_2

附图：`views/candidates/round2_final/right.png`、`views/candidates/round3/left_2.png`、`views/candidates/round3/front_4.png`、`refs/side_opposite.png`。

生成 basename：`exec-e46079a1-d937-43f7-a07c-8e8d2a8a424d.png`。

```text
Precise-object-edit, same Usagi model sheet. Image1 round2 RIGHT profile FACING LEFT is edit target. Image2 revised LEFT is the exact opposite-side shape reference, image3 front is the crown guide, image4 original is style/back-curve reference. Correct ONLY the straight right BACK edge into a rounded continuous convex arc similar to image2, and broaden the crown into a low shallow dome. Preserve original image1 widths and vertical landmark levels as closely as possible. Side body thickness excluding tail around 82-85% of front belly width, no extra bulge, keep a slightly flatter but curved BACK and fuller BELLY. Lower rump rounds smoothly to sole, no angular cut, no straight back segment. ONE continuous head-body with no waist. Keep the ear-tip to foot height, thin forward-slanted ear blade with pink edge, short arm viewed as a small oval at original mid-body height, lower-body widest level, white tail on RIGHT at same lower-back height, tiny forward foot at lower LEFT, original cream and dark-brown line. Keep all facial features absent, pure white, no shadows, text or guides. Full body RIGHT orthographic square, facing LEFT with tail RIGHT. No other changes.
```

### back_2

附图：`views/candidates/round2_final/back.png`、`views/candidates/round3/front_4.png`、`refs/back_full.png`。

生成 basename：`exec-fb8e5b24-5d06-46df-942f-5d6a684dddda.png`。

```text
Precise-object-edit: image1 is approved BACK Usagi T-pose and primary target; image2 is revised FRONT and its broad top cap is the shape reference; image3 original confirms identity. Produce an independent candidate that changes ONLY the UPPER CROWN of image1 into the broader shallow dome of image2, nearly flat gently arced between ears, with full upper corners instead of narrow egg. Seamless one-piece head/body; outline below crown keeps widening continuously to original widest lower belly, no bulging separate head or waist. Preserve all of image1 BELOW ARMS exactly: arm height, short round hand ends, maximum width, widest level, centered white fur tail same diameter and center, tiny feet, ear-tip to sole span. Keep ears as BACK surfaces, cream only, no pink. Maintain same fine brown outlines, cream fill, plain white background, no texture/shading/shadow, no facial marks, no labels or guides. One full-body square orthographic BACK view, same framing. Do not alter tail or limbs.
```

### back_3

附图：`views/candidates/round2_final/back.png`、`views/candidates/round3/front_4.png`、`refs/back_full.png`。

生成 basename：`exec-006d6d46-f1b6-48a9-8734-72a23b5f88a1.png`。

```text
Make a conservative alternate BACK candidate by editing image1. Image2 selected FRONT locks the revised broader dome; image3 original locks character identity. Only broaden the TOP cap below ear roots by making the upper shoulders fuller and crown shallow and round. Keep the rest of image1, especially body from mid-head downward, completely unchanged. Avoid any upper-head bulge larger than lower belly: outer contour gently widens continuously down to original low widest point; no waist or stacked spheres. Preserve every vertical landmark: ear tips, crown, low horizontal short arms, lower-belly widest level, centered white fluffy tail height, tiny feet and sole line. Back ear surfaces are cream, no pink. Do not change line thickness, tail fur marks, ear lengths/spacing, fill colors, white background, scale or framing. No facial features, shading, shadows, labels or guides. Full body in frame, one square orthographic BACK view.
```

### right_3

附图：`views/candidates/round2_final/right.png`、`views/candidates/round3/left_2.png`、`views/candidates/round3/front_4.png`、`refs/side_opposite.png`。

生成 basename：`exec-978f809e-921b-4a29-9cde-2a845f5a7745.png`。

```text
Conservative local edit of image1 RIGHT Usagi profile, FACING LEFT. References: image2 approved corrected opposite-side LEFT for rounded-back curvature, image3 selected front for broad shallow head dome, image4 original animation for identity. Change only two contours: round the right BACK smoothly outward from upper head through middle back and rump with NO long straight vertical part; broaden the crown very slightly into a low round dome. Keep side depth and every vertical landmark of image1: ear tips, crown, arm oval, widest lower-belly level, white tail center on right lower back, sole. Limit side depth to approx 82-85% of selected front body width; back arc slightly flatter than full left belly, no extra upper-body bulge, no neck or waist. Preserve thin forward-leaning ear strips and pink edge, tiny forward foot, tail size and sparse brown fur strokes, flat cream fill and fine dark-brown outline. Blank face, white background, no shadows, text, guides or new objects. Keep full-body framing. One square RIGHT orthographic image with tail RIGHT and face direction LEFT.
```
