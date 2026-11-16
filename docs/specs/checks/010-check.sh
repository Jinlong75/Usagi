#!/bin/sh
# 010 验收检查（主导维护）：跑 rig 阶段，用 VRM 插件重新导入校验，复制预览到门禁产物目录
set -e
sh pipeline/build_usagi.sh rig
for p in assets/model/usagi_body.vrm assets/model/usagi_rig.report.json assets/model/preview_rig/pose_sheet.png; do
  test -f "$p" || { echo "缺少 $p"; exit 1; }
done
B="${BLENDER:-/Users/mac/Applications/Blender.app/Contents/MacOS/Blender}"
"$B" -b --python docs/specs/checks/010-check-blend.py -- assets/model/usagi_body.vrm
if [ -n "$AR_GATE_ARTIFACT_DIR" ]; then
  mkdir -p "$AR_GATE_ARTIFACT_DIR/preview_rig"
  cp assets/model/preview_rig/*.png "$AR_GATE_ARTIFACT_DIR/preview_rig/"
  cp assets/model/usagi_rig.report.json "$AR_GATE_ARTIFACT_DIR/"
fi
echo "010 检查通过"
