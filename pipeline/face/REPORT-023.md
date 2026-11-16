# 023 执行汇报

## 完成了什么

- 按定稿重画全部 9 格眼图、10 格嘴图；表情名称、顺序、CELL=512、MARGIN=41 和 VRM 绑定结构均保留。
- 新增纯 Python 源网格量取：读取 `usagi3d2.glb` 的真实顶点和连通块，复用 prep 的一米归一化与 -90° 朝向；量取结果写入 layout，测试逐项按 2 mm 容差核对。原始实测见 `assets/model/023-measurements.json`。
- 只重出 face 阶段，同步 `assets/model/usagi.vrm` 到 `assets/models/usagi.vrm`；prep、rig 产物未改。
- 生成 `assets/model/preview_face/compare_reference.png`，五行依次是 F01/neutral、F05/aa、F09/blink、F19/happy、F12/sad；两列均按完整头宽 320 px 缩放。缩放与推断记录在同名 JSON。
- 不需要越界。提交按本次指令由 AgentRouter 在门禁前代办。

## 改动了哪些文件

- `pipeline/face/layout.py`：新模型雕刻包围盒、面法线、眼/眉/嘴/腮锚点与贴片范围。
- `pipeline/face/draw_atlas.py`：统一眉、圆眼单高光、短横眨眼、闭眼上弧、ω 嘴各格和参考比较入口。
- `pipeline/face/measure_layout.py`：可重复的源 GLB 量取与贴片设计边界计算。
- `pipeline/face/compare_reference.py`：五组参考/模型比较图及缩放记录。
- `pipeline/blender/face_usagi.py`：报告使用已经朝向修正的新包围盒，不再重复旋转。
- `pipeline/tests/test_face_atlas.py`：保留既有尺寸/覆盖/guard band/物理尺寸检查；按定稿更新共用图形断言，增加量取、图形和参考比较检查。
- `assets/model/face/{eyes_atlas,mouth_atlas,atlas_preview}.png`。
- `assets/model/preview_face/{neutral,blink,blinkLeft,blinkRight,happy,angry,sad,relaxed,surprised,aa,ih,ou,ee,oh,expression_sheet,compare_reference}.png` 及 `compare_reference.json`。
- `assets/model/usagi.vrm`、`assets/model/usagi_face.report.json`、`assets/models/usagi.vrm`。
- `assets/model/023-{measurements,render-evidence}.json`，`023-{atlas-test,atlas-test-final,build-face,face-test,production-check,runtime-test}.log`。
- 本汇报 `pipeline/face/REPORT-023.md`。

## TODO(lead) 清单

- `layout.py` 已标记：源模型没有独立腮块、腮红材质或颜色；请结合对照图确认按 F01 推导的腮锚点（横向 ±0.27 头宽、低于眼中心 0.10 头宽）。这不是可从源模型提取的雕刻尺寸。
- `face_usagi.py` 原有的应用表情并发策略 TODO 保留；本任务未新增或修改应用逻辑。

## 推断清单

- 源 GLB 的 10 个正面独立连通块按位置/尺寸识别为两眼、两眉、嘴的多块及眼内高光；多个嘴块合并量取。背后尾巴排除，身体不修改。
- 无腮雕刻可量：以 F01 推导投影锚点，另从新模型真实头部顶点量取最近表面点。两侧最近点为 `(±178.07, -243.53, 405.96)` mm；腮红尺寸取 0.20 头宽、宽高比 1.5。
- F01 手工像素读数：可见头宽 347 px；双眼中心约 `(155,124)/(247,122)`；眼宽约 34 px；眉宽/高约 58/41 px；嘴约 52×45 px。其倾斜和裁切使读数仅供比例比较，不作为精确标定。
- F05/F09/F12 没有完整头部两侧，以各自眼中心距离乘 F01 的“头宽/眼距”估算完整头宽；缺图部分保持空白，并在比较图标注 inferred。F01/F19 使用可见头宽。
- 定稿要求约 1.3 倍于旧眼宽，因此圆眼直径定为 91.70 mm；与源雕刻眼的 78 mm 宽分开记录。
- relaxed 的嘴沿用 neutral 的 UV 绑定，符合既有表情结构；没有增加 atlas 格或表情。

## 偏离说明

- 源模型无腮雕刻，无法声称腮中心/尺寸为雕刻实测；采用上述 F01 锚定和真实表面量取，已留 TODO(lead)。
- 说明提到的参考目录 `README.md`、`REPORT.md` 实际不存在，使用现有 overview 与 22 张单张参考完成描线和对照。
- GUI 自查仅无头 face 渲染及指定绑定检查；完整 app smoke 和完整验收交给门禁，遵守执行者规则。

## 已知问题

- 参考角色的倾斜、透视、动态挤压未投射为对模型头部的形变；并排图保持参考原有角度，模型保持正脸。
- 新眼按定稿放大后，相对 F01 的头宽占比更高；新模型源眉、嘴本身也较 F01 偏大，数字如下。未自行改变主导指定的放大倍数或源模型轮廓。
- Blender 日志有既有 VRM0 duplicated bone 警告和 Blender 6.0 `World.use_nodes` 弃用提示；当前 VRM 1 绑定、静止姿态与骨骼矩阵检查全部通过。
- app 中实际 `happyFaceDifferenceRatio` 仍待门禁 smoke 测量；本次无头渲染 neutral/happy 全图像素差异为 `0.007290310329861111 > 0`，此数不是 app smoke 的测量值。

## 新模型实测与 F01 比例

坐标为新模型归一化为一米后，投影到实际 landmark 面平面的 `(right, up)`；单位 mm。头宽 656.082 mm。下表眼、眉、嘴是源雕刻顶点实测包围盒；腮为明确标记的推导图形。

| 部位 | 中心 (right, up) mm | 宽 × 高 mm |
| --- | --- | --- |
| 画面左眼/角色右眼 | (-103.558, 444.379) | 78.652 × 77.368 |
| 画面右眼/角色左眼 | (103.819, 444.379) | 78.163 × 77.368 |
| 画面左眉/角色右眉 | (-142.641, 563.978) | 138.251 × 127.304 |
| 画面右眉/角色左眉 | (147.051, 563.978) | 138.252 × 127.304 |
| 嘴（多个雕刻块合并） | (1.230, 334.287) | 108.452 × 103.183 |
| 腮（F01 推导图形） | (±177.142, 378.770) | 131.216 × 87.478 |
| 最终圆眼图形 | 同上述眼中心 | 91.700 × 91.700 |

面法线由旧 `(0,-0.985376,0.170393)` 更新为新 landmark 的 `(-0.00002747,-0.99676180,0.08041115)`。眼贴片范围 `(-.310,.310,.300,.660)`；嘴贴片范围 `(-.100,.100,.130,.420)`，均为米。线宽从 14.20 mm 减为 10.65 mm（-25%），占头宽 1.623%。

以下都按各自头宽归一化；“差”为百分点，F01 为手工近似值：

| 比例 | F01 | 新模型/最终图形 | 差 |
| --- | --- | --- | --- |
| 双眼中心间距/头宽 | 26.52% | 31.61% | +5.09 |
| 源眼宽/头宽（两眼均值） | 9.80% | 11.95% | +2.15 |
| 最终圆眼直径/头宽 | 9.80% | 13.98% | +4.18 |
| 眉宽/头宽 | 16.71% | 21.07% | +4.36 |
| 眉高/头宽 | 11.82% | 19.40% | +7.58 |
| 眉中心高于眼中心/头宽 | 14.70% | 18.23% | +3.53 |
| 嘴宽/头宽 | 14.99% | 16.53% | +1.54 |
| 嘴高/头宽 | 12.97% | 15.73% | +2.76 |
| 嘴中心低于眼中心/头宽 | 13.11% | 16.78% | +3.67 |
| 腮横向离头中心/头宽（两侧均值） | 26.66% | 27.00% | +0.34 |
| 腮中心低于眼中心/头宽 | 10.37% | 10.00% | -0.37 |
| 腮宽/头宽（两侧均值） | 17.87% | 20.00% | +2.13 |

## 各格落实

- 所有眼格：完全相同的两道高弧眉、粉色椭圆腮红和三条更深粉色细斜线；描线 `#2b1a14`。
- neutral/happy/surprised/angry/sad：相同实心圆眼，左上一个约 40% 眼径的椭圆白高光，无眼下小笑弧、怒眉、八字眉或泪滴。
- blink：眼中心两条短横；blinkLeft/blinkRight：按角色左右闭单眼，其余为同一圆眼；relaxed：两道宽 1.3 眼径的 ∩ 弧。
- neutral/relaxed 嘴：闭 ω、中间向上尖点，左侧下垂小尾钩（relaxed 绑定 neutral 格）。
- ih/ee/ou/happy/surprised 嘴：同一小开 ω、深棕口腔、底部 `#f08aa0` 粉舌、独立短下唇弧；开口高约 0.6 ω 宽。
- aa/oh/angry 嘴：同一竖长大开 ω，开口高约 1.4 ω 宽；底部粉舌和短下唇弧，完整保留 ω 上沿。
- sad 嘴：0.70 倍宽紧缩 ω，两侧各一道鼓腮短弧。
- 与参考仍有差距：F01 新眼更大、眉更高更宽、闭嘴尾钩较长；F05 参考有倾斜且舌部线形不同；F09 保持原角度而模型为水平短横；F19 没有参考中的口水点及动态口角变形；F12 没有参考动态挤压整个头部。均未增添任务表以外的图形或头部形变。

## 自测与证据

所有 Blender 启动前均运行安装包 CLI 的 `gui check Blender --headless`，退出 0（PATH 中 `ar` 是系统归档程序，第一次该命令退出 1 后改用已安装 AgentRouter CLI，未改 PATH 或守卫变量）。Pillow 11.3.0 安装在一次性 `/tmp/usagi-023-python` 环境，没有新增项目依赖。

| 实际命令/参数 | 退出 | 证据 |
| --- | --- | --- |
| `python3 pipeline/face/measure_layout.py --out assets/model/023-measurements.json` | 0 | `023-measurements.json` |
| `/tmp/usagi-023-python/bin/python pipeline/tests/test_face_atlas.py` | 初次 1；修正后 0，6 项通过 | `023-atlas-test.log` / `023-atlas-test-final.log` |
| `FACE_PYTHON=/tmp/usagi-023-python/bin/python sh pipeline/build_usagi.sh face` | 0 | `023-build-face.log`、14 张正脸与总览 |
| `cp assets/model/usagi.vrm assets/models/usagi.vrm` | 0 | `023-render-evidence.json`：两份字节一致，SHA-256 `9075d589bdebcfc83ded8e458c926892771385068eadaa8f8a29b6a0864a6d25` |
| Blender `-b --python-exit-code 1 --python pipeline/tests/test_face_usagi.py`，设置 `FACE_PYTHON` 和 `FACE_RUNTIME_VRM` | 0，6 项通过 | `023-face-test.log`：含生产 VRM 静止骨骼与逆绑定矩阵检查 |
| `npm --prefix /tmp/usagi-023-runtime install --no-save --ignore-scripts --no-audit --no-fund --silent @pixiv/three-vrm@3.5.5 three@0.187.0` | 0 | 仅一次性测试依赖，无仓库依赖改动 |
| `node pipeline/tests/test_face_runtime.mjs /tmp/usagi-023-runtime` | 0 | `023-runtime-test.log`：happy 阻止 blink/aa、二值阈值、base/emissive UV、reset |
| Blender `-b --python-exit-code 1 --python docs/specs/checks/011-check-blend.py -- assets/model/usagi.vrm` | 0 | `023-production-check.log`：正式模型重导入绑定通过 |
| `/tmp/usagi-023-python/bin/python pipeline/face/compare_reference.py` | 0 | `preview_face/compare_reference.png` 与 JSON |
| `git diff --check`、允许路径核对 | 0 | 仅本任务允许路径有变化 |

初次口深测试实测 1.4989 ω 宽，超过新增断言 1.4±0.08；修正了 cubic U 控制点和 ω 尖点到接缝的深度计算，断言未放宽，失败日志保留。完整 `sh pipeline/run_tests.sh`、`sh docs/specs/checks/011-check.sh`、`npm --prefix app ci/test/run smoke` 由门禁执行；没有运行完整 GUI 检查。app smoke 截图由门禁生成。

## 开工受影响测试检索全文

按任务指定命令执行，退出 0，以下为开工时的完整标准输出，未截断：

```text
pipeline/tests/test_face_usagi.py:93:        draw = Path(__file__).resolve().parents[1]/'face'/'draw_atlas.py'
pipeline/tests/test_face_usagi.py:94:        result = subprocess.run([os.environ['FACE_PYTHON'], str(draw), '--out', str(cls.root/'atlas')],
pipeline/tests/test_face_usagi.py:96:        (cls.root/'atlas.log').write_text(result.stdout+result.stderr)
pipeline/tests/test_face_usagi.py:98:            raise RuntimeError('Atlas generation failed: '+str(cls.root/'atlas.log'))
pipeline/tests/test_face_usagi.py:100:                                              cls.root/'atlas', cls.root/'face.vrm', cls.root/'report.json')
pipeline/tests/test_face_atlas.py:10:from draw_atlas import generate
pipeline/tests/test_face_atlas.py:11:from layout import CELL, MARGIN, EYES, MOUTHS, FRAMES
pipeline/tests/test_face_atlas.py:17:        cls.root = Path(tempfile.mkdtemp(prefix='usagi-atlas-'))
pipeline/tests/test_face_atlas.py:21:        for filename, names in (('eyes_atlas.png', EYES), ('mouth_atlas.png', MOUTHS)):
pipeline/tests/test_face_atlas.py:22:            atlas = Image.open(self.root/filename)
pipeline/tests/test_face_atlas.py:23:            self.assertEqual(atlas.mode, 'RGBA')
pipeline/tests/test_face_atlas.py:24:            self.assertEqual(atlas.size, (2048, 2048))
pipeline/tests/test_face_atlas.py:27:                with self.subTest(atlas=filename, index=index):
pipeline/tests/test_face_atlas.py:29:                    alpha = atlas.getchannel('A').crop((x, y, x+CELL, y+CELL))
pipeline/tests/test_face_atlas.py:43:            tiles = [atlas.crop((i%4*CELL, i//4*CELL, i%4*CELL+CELL, i//4*CELL+CELL)).tobytes()
pipeline/tests/test_face_atlas.py:46:        self.assertEqual(Image.open(self.root/'atlas_preview.png').size, (2048, 1152))
pipeline/tests/test_face_atlas.py:49:        mouth = Image.open(self.root/'mouth_atlas.png').crop((0, 0, CELL, CELL))
pipeline/tests/test_face_atlas.py:51:        xmin, xmax, vmin, vmax = FRAMES['FaceMouth']
pipeline/tests/test_face_atlas.py:56:        eyes = Image.open(self.root/'eyes_atlas.png').crop((0, 0, CELL, CELL))
pipeline/tests/test_face_atlas.py:57:        xmin, xmax, vmin, vmax = FRAMES['FaceEyes']
pipeline/tests/test_reproducibility.py:49:                '--atlas-dir', str(self.root / 'atlas'), '--out', str(directory / ARTIFACTS[2]),
pipeline/tests/test_reproducibility.py:59:        self.command('atlas', [sys.executable, str(PIPELINE / 'face/draw_atlas.py'),
pipeline/tests/test_reproducibility.py:60:                               '--out', str(self.root / 'atlas')])
docs/specs/checks/011-check.sh:5:for p in assets/model/usagi.vrm assets/model/face/eyes_atlas.png assets/model/face/mouth_atlas.png \
docs/specs/checks/011-check.sh:6:         assets/model/face/atlas_preview.png assets/model/usagi_face.report.json \
docs/specs/checks/011-check.sh:15:  cp assets/model/face/atlas_preview.png assets/model/usagi_face.report.json "$AR_GATE_ARTIFACT_DIR/"
```

逐文件处理：

- `pipeline/tests/test_face_usagi.py`：不改；覆盖导出、材质、绑定、Head 权重、原始身体三角形、静止骨骼及往返导入，聚焦运行全部 6 项通过。
- `pipeline/tests/test_face_atlas.py`：改；具体断言逐项列于下一节。尺寸/名称/覆盖/透明格/guard band 及腮宽高比断言保留，新增四项测试。
- `pipeline/tests/test_reproducibility.py`：不改；Atlas 路径、调用接口与确定性生成方式保留。全阶段双次导出交门禁执行。
- `docs/specs/checks/011-check.sh`：不改；产物路径全部保持，额外新增的比较图自动落在它已有的 `preview_face/*.png` 复制范围。
- `app/tests`、`app/scripts`：本次指定检索没有命中；不改。smoke 的 happy 差异断言保持，完整执行交给门禁。

## 断言改写

仅 `pipeline/tests/test_face_atlas.py`：

1. 每个命名格像素必须唯一 → 明确的 5 组眼图、4 组嘴图内部完全相同、组间不同，并逐个检查实际 atlas 格像素 → 定稿明确要求 neutral/happy/angry/sad/surprised 眼图相同，小开/大开嘴各自共用，原断言与新要求冲突。
2. neutral 嘴硬编码旧范围 `(-.055,.050,.24984,.35532)` → 校验新 `MOUTH_BOUNDS=(-.052996,.055455,.282696,.385879)`，同时新增直接从源顶点量取并核对常量的测试 → 更换新模型；原像素物理范围容差 1 mm 保留，新增源量取容差 2 mm。
3. 腮横中心固定 `±.194`、纵中心 `.347`、宽 `.116` → 新中心 `±.177142/.378770`、宽 `.1312164`，并在源量取/F01 派生测试核对 → 新模型没有独立腮雕刻，按明确记录的 F01 头宽比例锚定。宽容差 2 mm、中心容差 1 mm、宽高比 1.5±.06 保留。

没有删除测试、增加超时或放宽既有容差；测试从 2 项增至 6 项。

## 反向实验

仅列纯文字，不提供可执行 JSON：将新眼格的 happy 改为闭眼弧，会触发共用组及固定圆眼检查；删除 ω 中心尖点，会触发 cusp 检查；将 SCULPTURE 或眼/眉/嘴锚点平移超过 2 mm，会触发源顶点实测核对；将 blink 改为下弧，会触发横线中心及上下透明检查。未执行改坏实验。
