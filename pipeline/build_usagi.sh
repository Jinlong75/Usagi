#!/bin/sh
# 底模整备与 VRM 1.0 绑骨共用入口。
set -eu
PIPELINE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(dirname -- "$PIPELINE_DIR")
case "${1:-}" in
    vrm) printf '%s：尚未实现\n' "$1"; exit 0 ;;
    prep|rig|face) ;;
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
if [ "$1" = face ]; then
    test -f "$MODEL_DIR/usagi_body.vrm" || { printf '请先运行 rig 阶段\n' >&2; exit 2; }
    . "$PIPELINE_DIR/face/python_env.sh"
    "$FACE_PYTHON" "$PIPELINE_DIR/face/draw_atlas.py" --out "$MODEL_DIR/face"
    "$BLENDER" -b --python-exit-code 1 --python "$PIPELINE_DIR/blender/face_usagi.py" -- \
        --in "$MODEL_DIR/usagi_body.vrm" --landmarks "$MODEL_DIR/usagi_landmarks.json" \
        --atlas-dir "$MODEL_DIR/face" --out "$MODEL_DIR/usagi.vrm" \
        --report "$MODEL_DIR/usagi_face.report.json" --preview-dir "$MODEL_DIR/preview_face"
    "$FACE_PYTHON" "$PIPELINE_DIR/face/draw_atlas.py" \
        --sheet-source "$MODEL_DIR/preview_face" --out "$MODEL_DIR/preview_face/expression_sheet.png"
    exit 0
fi
if [ "$1" = rig ]; then
    # VRM 扩展需要用户启动配置，不能使用 --factory-startup。
    "$BLENDER" -b --python-exit-code 1 --python "$PIPELINE_DIR/blender/rig_usagi.py" -- \
        --in "$MODEL_DIR/usagi_base.glb" --landmarks "$MODEL_DIR/usagi_landmarks.json" \
        --out "$MODEL_DIR/usagi_body.vrm" --report "$MODEL_DIR/usagi_rig.report.json" \
        --blend "$MODEL_DIR/usagi_rig.blend" --preview-dir "$MODEL_DIR/preview_rig"
    exit 0
fi
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
