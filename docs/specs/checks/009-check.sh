#!/bin/sh
# 009 验收检查（主导维护）：跑 prep 阶段，校验底模、关键点、报告，复制预览到门禁产物目录
set -e
sh pipeline/build_usagi.sh prep
for p in assets/model/usagi_base.glb assets/model/usagi_landmarks.json assets/model/usagi_prep.report.json \
         assets/model/preview/preview_front.png assets/model/preview/preview_sheet.png \
         assets/model/preview/preview_landmarks_front.png assets/model/preview/preview_landmarks_left.png \
         assets/model/preview_nosmooth/preview_sheet.png; do
  test -f "$p" || { echo "缺少 $p"; exit 1; }
done
B="${BLENDER:-/Users/mac/Applications/Blender.app/Contents/MacOS/Blender}"
"$B" -b --factory-startup --python docs/specs/checks/009-check-blend.py -- assets/model/usagi_base.glb assets/model/usagi_landmarks.json
if [ -n "$AR_GATE_ARTIFACT_DIR" ]; then
  mkdir -p "$AR_GATE_ARTIFACT_DIR/preview" "$AR_GATE_ARTIFACT_DIR/preview_nosmooth"
  cp assets/model/preview/*.png "$AR_GATE_ARTIFACT_DIR/preview/"
  cp assets/model/preview_nosmooth/*.png "$AR_GATE_ARTIFACT_DIR/preview_nosmooth/"
  cp assets/model/usagi_landmarks.json assets/model/usagi_prep.report.json "$AR_GATE_ARTIFACT_DIR/"
fi
echo "009 检查通过"
