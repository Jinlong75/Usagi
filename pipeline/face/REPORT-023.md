# 023 执行汇报（主导补充修订）

## 完成了什么

- 按补充 1～7 修订全部共用眼/嘴图形，保持表情名、数量、顺序、CELL=512、MARGIN=41、贴片范围和绑定结构。
- 眼径乘 0.70、眼距乘 0.82；眉宽乘 0.75、眉峰到眼中心高度乘 0.70，线宽不变。雕刻数据独立保留为 `SCULPTURE_*`，不再把雕刻包围盒直接当作最终绘图比例。
- neutral 的 ω 上沿不动，下钩竖直延伸减半；所有大/小张口移除独立下巴弧线，改为宽侧壁和圆 U 底，舌头位于 U 底。
- 腮大小、中心保持，斜线从 3 道改为 4 道，线宽从 0.42 倍描线改为 0.84 倍，深粉 `#e0607e`，底色 `#f6a3b5`。按主导答复移除腮锚点待确认 TODO。
- F19 与 F05/F09/F12 一样由 F01 眼距比例推导完整头宽，并标注 `head width inferred`；新增真实左侧裁切合成图测试。
- 完成 `sh pipeline/build_usagi.sh face`、复制两份 VRM、更新图集及五组比较图。prep/rig 四项输入哈希全部不变。
- 本次按指令由 AgentRouter 在门禁前代为提交，执行者未自行提交。

## 改动了哪些文件

- `pipeline/face/layout.py`：分离源雕刻与最终图形尺寸，按指定倍数调整眼、眉、嘴。
- `pipeline/face/draw_atlas.py`：四道深粉腮线、宽圆 U 底、去除所有张口下巴弧线。
- `pipeline/face/measure_layout.py`：实测输出对照 `SCULPTURE_*`，2 mm 校验不变。
- `pipeline/face/compare_reference.py`：F19 头宽推导及裁切检测、证据字段。
- `pipeline/face/measure_proportions.py`：可重复量取 320 px 对照图中的眼、眉、嘴墨迹比例。
- `pipeline/tests/test_face_atlas.py`：比例、四道腮线、圆 U 底/无独立下巴线、左裁切合成图测试。
- `assets/model/face/{eyes_atlas,mouth_atlas,atlas_preview}.png`。
- `assets/model/preview_face/{neutral,blink,blinkLeft,blinkRight,happy,angry,sad,relaxed,surprised,aa,ih,ou,ee,oh,expression_sheet,compare_reference}.png` 和 `compare_reference.json`。
- `assets/model/usagi.vrm`、`assets/models/usagi.vrm`、`assets/model/usagi_face.report.json`。
- `assets/model/023-r2-{proportions-before,proportions-after,render-evidence}.json`、`023-revision-baseline.json`；本次 `023-r2-*.log` 验证日志。
- 本汇报 `pipeline/face/REPORT-023.md`。

## TODO(lead) 清单

无新增。腮锚点 TODO 已按主导明确答复解决；原有 `face_usagi.py` 应用表情并发策略 TODO 保留，不属于本任务改动。

## 推断清单

- 眉横向随对应眼睛平移同一距离，保持原有眉眼的横向关系，再缩短眉宽；纵向围绕眼中心缩放，使眉峰高度按 0.70 缩小。
- F19 的左侧眼中心高度处直接接触奶黄色头部内部，证实轮廓裁切。裁切检测仅适用于这些奶黄色参考画面；完整参考的头宽仍来自人工锚点。
- 320 px 图中，深色阈值为 RGB 各通道分别小于 (110,90,90)，眼径按两眼墨迹包围盒的几何直径 `sqrt(width*height)` 取均值；眉高指眉弧最高点到对应眼中心的距离。所有数据包含描线，不把参考图的边缘模糊伪称为精确几何。
- 大/小张口的绘图总墨迹高宽比设为 1.30/0.85，留出投影与栅格误差空间；圆 U 底采用两段四分之一椭圆曲线。
- 无源腮雕刻可量，继续使用已被主导接受的 F01 推导锚点与源表面最近点，明确区别于雕刻实测。

## 偏离说明

无未授权偏离。补充要求覆盖原任务中的放大眼睛、直接采用雕刻眉界、张口下唇弧及三道细腮线要求。完整 pipeline/app 验收和 smoke 由门禁运行，执行者只做相关聚焦检查；未在根目录运行 vitest，未修改 app 或门禁脚本。

## 已知问题

- 参考有倾斜、透视、动态挤压，模型保持正脸且不修改头部形状。F19 头宽依赖 F01 眼距比例，已明确标注推导。
- F01 重新量得眼径约 9.53%（含描线与模糊边缘），略高于补充中的约 8～9%；本次严格执行 0.70 倍后为 9.61%，没有再次自行缩眼。F01 闭嘴含原作小钩的高宽比约 0.809，本次仍按明确上限做到 0.712。
- Blender 有既有 VRM0 duplicated bone、`World.use_nodes` 弃用提示；合成 rig 测试也会输出 Bone Heat Weighting 警告，最终测试结果见下节。
- app 的 `happyFaceDifferenceRatio` 待门禁 smoke 测量；无头渲染 neutral/happy 像素差异为 0.006808810763888889 > 0，不能冒充 app smoke 值。

## 新模型实测与绘图位置

源数据继续保留在 `assets/model/023-measurements.json`；可重复命令为 `python3 pipeline/face/measure_layout.py --out assets/model/023-measurements.json`。单位 mm，投影坐标 `(right,up)`，归一化头宽 656.082 mm。源模型雕刻未改，源顶点逐项 2 mm 容差检查通过。

| 源雕刻 | 中心 (right,up) mm | 宽×高 mm |
| --- | --- | --- |
| 画面左眼 | (-103.558,444.379) | 78.652×77.368 |
| 画面右眼 | (103.819,444.379) | 78.163×77.368 |
| 画面左眉 | (-142.641,563.978) | 138.251×127.304 |
| 画面右眉 | (147.051,563.978) | 138.252×127.304 |
| 源嘴（连通块合并） | (1.230,334.287) | 108.452×103.183 |
| 腮（F01 推导，非雕刻） | (±177.142,378.770) | 131.216×87.478 |

腮的最近真实表面点为 `(±178.065,-243.527,405.960)` mm。雕刻眼宽/头宽约 11.95%、眼距 31.61%、眉宽 21.07%，分别比本次 F01 墨迹读数高 2.42、5.19、5.60 个百分点；这些源雕刻数据保留，并不强制成最终艺术比例。

补充源雕刻/位置对照（各自头宽归一化，F01 为像素近似）：源嘴宽/头宽 16.53%，F01 14.69%，差 +1.84 个百分点；源嘴中心低于眼中心 16.78%，F01 13.05%，差 +3.73 个百分点。眉峰高于眼中心源雕刻为 27.93%，F01 20.08%，差 +7.85 个百分点。腮横向中心为 ±27.00%，F01 约 ±26.66%，差 +0.34；腮中心低于眼中心为 10.00%，F01 约 10.37%，差 -0.37；腮宽为 20.00%，F01 约 17.87%，差 +2.13 个百分点。腮数值按已接受锚点保持，源模型没有雕刻腮可对照。

最终绘图：眼中心 `(-84.894,444.379)/(85.155,444.379)` mm，眼径 64.190 mm；眉左右界 `[-175.821,-72.132]/[76.543,180.232]` mm，上下界 `[483.543,572.655]` mm；眉宽 103.688 mm，眉峰比眼中心高 128.276 mm。neutral 嘴外界 `[-52.996,55.455]×[310.380,385.879]` mm，即 108.451×75.499 mm。线宽保持 10.650 mm，腮线宽 8.946 mm。

贴片范围不变：眼 `(-.310,.310,.300,.660)`，嘴 `(-.100,.100,.130,.420)` 米。源法线 `(-0.00002747,-0.99676180,0.08041115)` 不变。

## 修改前后比例对照

实际比较图：`assets/model/preview_face/compare_reference.png`。下表均在同头宽 320 px 的图中量取；比例脚本、原始包围盒与前后 JSON 一并提供。眼高光仍为直径的 40%×34%。

| 项目 | F01 | 修改前 | 修改后 |
| --- | ---: | ---: | ---: |
| 眼径/头宽 | 9.53% | 13.75% | 9.61% |
| 眼中心距/头宽 | 26.42% | 31.88% | 26.09% |
| 眉宽/头宽 | 15.47% | 20.78% | 15.63% |
| 眉峰高于眼中心/头宽 | 20.08% | 27.19% | 19.22% |
| neutral 嘴高/嘴宽 | 0.809 | 0.981 | 0.712 |
| aa 大开嘴高/嘴宽 | —（F01 闭口） | 1.846 | 1.365 |
| happy 小开嘴高/嘴宽 | —（F01 闭口） | 1.000 | 0.885 |

旧大/小开口若把独立下巴弧线也计入，总高度比为 2.115/1.269；新图对应为 1.365/0.885，没有分离墨迹。绘图平面的几何比为闭嘴 0.696、大开口 1.30、小开口 0.85；模型投影到曲面及图片栅格后略有差异，渲染值同样满足 0.75/1.4/0.9 上限。

F01 原图人工锚点头宽 347 px、眼中心约 `(155,124)/(247,122)`，与墨迹阈值测量可有亚像素差异。F05/F09/F19/F12 均按各自眼距乘 `347 / hypot(92,2)` 推导完整头宽；F19 不再使用被裁的 376 px。

## 各格落实及参考差距

- 9 个眼格共用同一眉和腮；neutral/happy/surprised/angry/sad 为同一圆眼高光，无眼下笑弧、怒眉或八字眉。
- blink 为眼中心短横，blinkLeft/blinkRight 保持角色侧别；relaxed 为宽 1.3 眼径的 ∩ 弧。
- neutral 为 ω 加短钩，relaxed 继续绑定 neutral；ω 上沿完全保留。
- ih/ou/ee/happy/surprised 共用小开口，aa/oh/angry 共用大开口；均为 ω 上沿、深棕口腔、圆 U 底、粉舌，无独立下巴弧线。
- sad 保留 70% 宽紧缩 ω 和两侧鼓腮短弧。
- 仍有差距：模型头型与平面原作不同；F05/F09 保留参考原倾角；F19 不增加原作口水点和动态口角；F12 不挤压整个头部。没有扩大到身体、骨骼或应用逻辑。

## 自测与证据

所有 Blender 启动前均以已安装 AgentRouter CLI 执行 `gui check Blender --headless`，退出 0；没有修改 GUI 策略、任务环境或用户配置。`/usr/bin/ar` 是系统归档器，因此通过已安装 AgentRouter 的 `installer/cli.mjs` 调用检查。复用任务的一次性 Pillow/runtime 环境，无新增仓库依赖。

- `/tmp/usagi-023-python/bin/python pipeline/tests/test_face_atlas.py`：初次退出 1（新腮线边缘受 LANCZOS 影响；新 U 底口腔净填色深度计算需匹配新总高度），日志 `023-r2-atlas-test.log` 保留。最终退出 0，8 项通过，见 `023-r2-atlas-test-final.log`。未放宽已有容差。
- `FACE_PYTHON=/tmp/usagi-023-python/bin/python sh pipeline/build_usagi.sh face`：退出 0，见 `023-r2-build-face.log`，14 张正脸、图集、总览与比较图已重出。
- `cp assets/model/usagi.vrm assets/models/usagi.vrm`：退出 0，逐字节一致，SHA-256 `58b0aa074e02877856ea7b6bcc5ed0b706c0af4ff86b35c19224c9ac0b8b8b4d`。
- `measure_proportions.py --compare assets/model/preview_face/compare_reference.png --out assets/model/023-r2-proportions-after.json`：退出 0；同样入口在重建前生成 `023-r2-proportions-before.json`。
- 哈希/像素差异/三类嘴高宽上限检查：退出 0，见 `023-r2-render-evidence.json`，prep/rig 输入完全不变。

- `FACE_PYTHON=/tmp/usagi-023-python/bin/python FACE_RUNTIME_VRM=/tmp/usagi-023-runtime/synthetic-face.vrm Blender -b --python-exit-code 1 --python pipeline/tests/test_face_usagi.py`：退出 0，6 项全部通过，见 `023-r2-face-test.log`，包括正式 VRM 身体三角形、静止骨骼和逆绑定矩阵检查。
- `node pipeline/tests/test_face_runtime.mjs /tmp/usagi-023-runtime`：退出 0，见 `023-r2-runtime-test.log`；happy 阻止 blink/aa、二值阈值、base/emissive UV 与 reset 均通过。
- `Blender -b --python-exit-code 1 --python docs/specs/checks/011-check-blend.py -- assets/model/usagi.vrm`：退出 0，正式 VRM 重导入与绑定检查通过，见 `023-r2-production-check.log`。
- `git diff --check`、逐文件 allowed_paths 校验：退出 0，40 个改动/新增文件均在本任务范围。

完整 `sh pipeline/run_tests.sh`、`sh docs/specs/checks/011-check.sh`、`npm --prefix app ci`、`npm --prefix app test`、`npm --prefix app run smoke` 交门禁运行，app 截图由门禁生成。

## 开工受影响测试检索全文

按任务点名命令执行，退出 0。以下为本次修改前完整输出，未截断：

```text
pipeline/tests/test_face_usagi.py:93:        draw = Path(__file__).resolve().parents[1]/'face'/'draw_atlas.py'
pipeline/tests/test_face_usagi.py:94:        result = subprocess.run([os.environ['FACE_PYTHON'], str(draw), '--out', str(cls.root/'atlas')],
pipeline/tests/test_face_usagi.py:96:        (cls.root/'atlas.log').write_text(result.stdout+result.stderr)
pipeline/tests/test_face_usagi.py:98:            raise RuntimeError('Atlas generation failed: '+str(cls.root/'atlas.log'))
pipeline/tests/test_face_usagi.py:100:                                              cls.root/'atlas', cls.root/'face.vrm', cls.root/'report.json')
pipeline/tests/test_face_atlas.py:11:from draw_atlas import generate, eyes, mouth
pipeline/tests/test_face_atlas.py:12:from layout import (CELL, MARGIN, EYES, MOUTHS, FRAMES, MOUTH_BOUNDS,
pipeline/tests/test_face_atlas.py:13:                    CHEEK_CENTERS, CHEEK_SIZE, LINE_M, EYE_CENTERS, EYE_DIAMETER)
pipeline/tests/test_face_atlas.py:22:        cls.root = Path(tempfile.mkdtemp(prefix='usagi-atlas-'))
pipeline/tests/test_face_atlas.py:26:        for filename, names in (('eyes_atlas.png', EYES), ('mouth_atlas.png', MOUTHS)):
pipeline/tests/test_face_atlas.py:27:            atlas = Image.open(self.root/filename)
pipeline/tests/test_face_atlas.py:28:            self.assertEqual(atlas.mode, 'RGBA')
pipeline/tests/test_face_atlas.py:29:            self.assertEqual(atlas.size, (2048, 2048))
pipeline/tests/test_face_atlas.py:32:                with self.subTest(atlas=filename, index=index):
pipeline/tests/test_face_atlas.py:34:                    alpha = atlas.getchannel('A').crop((x, y, x+CELL, y+CELL))
pipeline/tests/test_face_atlas.py:60:                    self.assertEqual(atlas.crop((x, y, x+CELL, y+CELL)).tobytes(), first, name)
pipeline/tests/test_face_atlas.py:63:        self.assertEqual(Image.open(self.root/'atlas_preview.png').size, (2048, 1152))
pipeline/tests/test_face_atlas.py:66:        mouth = Image.open(self.root/'mouth_atlas.png').crop((0, 0, CELL, CELL))
pipeline/tests/test_face_atlas.py:68:        xmin, xmax, vmin, vmax = FRAMES['FaceMouth']
pipeline/tests/test_face_atlas.py:71:        for actual, expected in zip(bounds, MOUTH_BOUNDS):
pipeline/tests/test_face_atlas.py:73:        eyes = Image.open(self.root/'eyes_atlas.png').crop((0, 0, CELL, CELL))
pipeline/tests/test_face_atlas.py:74:        xmin, xmax, vmin, vmax = FRAMES['FaceEyes']
pipeline/tests/test_face_atlas.py:77:            centre, height_centre = CHEEK_CENTERS[i]
pipeline/tests/test_face_atlas.py:83:            self.assertAlmostEqual(width, CHEEK_SIZE[0], delta=.002)
pipeline/tests/test_face_atlas.py:93:            for actual_row, expected_row in zip(layout.SCULPTURE[name], expected):
pipeline/tests/test_face_atlas.py:114:        x0, x1, v0, v1 = FRAMES[frame]
pipeline/tests/test_face_atlas.py:134:        frame = FRAMES['FaceEyes']
pipeline/tests/test_face_atlas.py:142:        x0, x1, bottom, top = MOUTH_BOUNDS
pipeline/tests/test_face_atlas.py:160:            frame = FRAMES['FaceMouth']
pipeline/tests/test_reproducibility.py:49:                '--atlas-dir', str(self.root / 'atlas'), '--out', str(directory / ARTIFACTS[2]),
pipeline/tests/test_reproducibility.py:59:        self.command('atlas', [sys.executable, str(PIPELINE / 'face/draw_atlas.py'),
pipeline/tests/test_reproducibility.py:60:                               '--out', str(self.root / 'atlas')])
docs/specs/checks/011-check.sh:5:for p in assets/model/usagi.vrm assets/model/face/eyes_atlas.png assets/model/face/mouth_atlas.png \
docs/specs/checks/011-check.sh:6:         assets/model/face/atlas_preview.png assets/model/usagi_face.report.json \
docs/specs/checks/011-check.sh:15:  cp assets/model/face/atlas_preview.png assets/model/usagi_face.report.json "$AR_GATE_ARTIFACT_DIR/"
```

逐文件处理：`pipeline/tests/test_face_usagi.py` 不改，聚焦复验导出/绑定；`pipeline/tests/test_face_atlas.py` 改，见下一节；`pipeline/tests/test_reproducibility.py` 不改，接口和确定性不变，完整复现交门禁；`docs/specs/checks/011-check.sh` 不改，路径和截图复制范围保持。app/tests、app/scripts 检索无命中，不修改，app smoke 由门禁执行。

## 断言改写

仅 `pipeline/tests/test_face_atlas.py`：

1. 原量取测试将实测眉/眼/嘴直接对照绘图常量 → 对照独立 `SCULPTURE_BROW_BOUNDS/SCULPTURE_EYE_CENTERS/SCULPTURE_MOUTH_BOUNDS`，新增最终图形比例断言 → R1-1 要求艺术比例区别于雕刻，所有原源顶点、FRAMES、腮、法线与 2 mm 容差校验保留。
2. 原口腔净填色深度/ω 宽为大 1.4、小 0.6（±0.08） → 新口腔净填色深度约大 0.925、小 0.475（仍 ±0.08），额外强制总墨迹高宽比大≤1.4、小≤0.9、闭嘴≤0.75，连续占用行及 U 底宽度断言 → 新要求约束整嘴总高度和圆 U 底，原值会要求过长的总嘴形；不再只检查口腔填色而漏过独立下巴线。
3. 原 F19 的 `width_inferred_from_F01_eyes=False` → `True`，其余四张顺序不变；增加实际边缘奶黄色检测，以及有完整轮廓/左侧被裁的合成图两分支检查 → R1-2 指出 376 px 是裁切后的可见宽度。
4. 新增四道腮线中心颜色、双倍宽度和间隙底色检查；新宽度探针的抗锯齿边缘使用每通道≤5误差，中心颜色仍严格相等。没有修改原颜色容差，因为原测试没有此项。

测试从 6 项增为 8 项，没有删除文件、放宽既有容差或增加超时。

## 反向实验

仅纯文字，未执行改坏：恢复大开口下巴弧线应被行连续性和总高宽比拦住；改回尖长单 cubic U 应被底部宽度检查拦住；F19 改回裁切宽度应被推导标志与合成裁切测试拦住；眉改回雕刻尺寸应被 F01 艺术比例检查拦住；任意源雕刻坐标偏移超过 2 mm 应被源顶点实测检查拦住。
