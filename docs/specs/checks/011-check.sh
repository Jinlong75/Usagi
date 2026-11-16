#!/bin/sh
# 011 验收检查（主导维护）：跑 face 阶段，重新导入 usagi.vrm 检查表情与贴片绑定，复制预览到门禁产物目录
set -e
sh pipeline/build_usagi.sh face
for p in assets/model/usagi.vrm assets/model/face/eyes_atlas.png assets/model/face/mouth_atlas.png \
         assets/model/face/atlas_preview.png assets/model/usagi_face.report.json \
         assets/model/preview_face/expression_sheet.png; do
  test -f "$p" || { echo "缺少 $p"; exit 1; }
done
B="${BLENDER:-/Users/mac/Applications/Blender.app/Contents/MacOS/Blender}"
"$B" -b --python docs/specs/checks/011-check-blend.py -- assets/model/usagi.vrm
if [ -n "$AR_GATE_ARTIFACT_DIR" ]; then
  mkdir -p "$AR_GATE_ARTIFACT_DIR/preview_face"
  cp assets/model/preview_face/*.png "$AR_GATE_ARTIFACT_DIR/preview_face/"
  cp assets/model/face/atlas_preview.png assets/model/usagi_face.report.json "$AR_GATE_ARTIFACT_DIR/"
fi
echo "011 检查通过"
