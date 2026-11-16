#!/bin/sh
# 只实现 prep；后续骨架/五官/VRM 阶段共用此入口。
set -eu
PIPELINE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname -- "$PIPELINE_DIR")
case "${1:-}" in
    rig|face|vrm) printf '%s：尚未实现\n' "$1"; exit 0 ;;
    prep) ;;
    *) printf '用法：sh pipeline/build_usagi.sh prep|rig|face|vrm\n' >&2; exit 2 ;;
esac
BLENDER=${BLENDER:-/Users/mac/Applications/Blender.app/Contents/MacOS/Blender}
if [ ! -x "$BLENDER" ]; then
    printf '找不到 Blender：%s\n' "$BLENDER" >&2
    exit 2
fi
cd "$PROJECT_DIR"
MODEL_DIR=assets/model
mkdir -p "$MODEL_DIR"
# 平滑对照仅使用临时底模，不覆盖正式产物；退出时清理本次目录。
PREP_TEMP=$(mktemp -d "$MODEL_DIR/.prep-XXXXXX")
trap 'rm -rf "$PREP_TEMP"' EXIT HUP INT TERM
"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$PIPELINE_DIR/blender/prep_usagi.py" -- \
    --in Material/tripo/usagi_3d.glb --out "$MODEL_DIR/usagi_base.glb" \
    --landmarks "$MODEL_DIR/usagi_landmarks.json" --report "$MODEL_DIR/usagi_prep.report.json"
"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$PIPELINE_DIR/blender/render_preview.py" -- \
    --in "$MODEL_DIR/usagi_base.glb" --out-dir "$MODEL_DIR/preview" --landmarks "$MODEL_DIR/usagi_landmarks.json"
"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$PIPELINE_DIR/blender/prep_usagi.py" -- \
    --in Material/tripo/usagi_3d.glb --out "$PREP_TEMP/smoothed.glb" --smooth-waist on \
    --landmarks "$PREP_TEMP/landmarks.json" --report "$PREP_TEMP/report.json"
"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$PIPELINE_DIR/blender/render_preview.py" -- \
    --in "$PREP_TEMP/smoothed.glb" --out-dir "$MODEL_DIR/preview_nosmooth"
