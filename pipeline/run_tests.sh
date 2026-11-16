#!/bin/sh
# 执行聚焦的 Blender 无头测试；临时模型不写入仓库。
set -eu
BLENDER=${BLENDER:-/Users/mac/Applications/Blender.app/Contents/MacOS/Blender}
if [ ! -x "$BLENDER" ]; then
    printf '找不到 Blender：%s\n' "$BLENDER" >&2
    exit 2
fi
PIPELINE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export BLENDER
# --python-exit-code 覆盖测试入口本身的导入/语法错误；业务脚本另有进程失败保护。
"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$PIPELINE_DIR/tests/test_pipeline.py"
"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$PIPELINE_DIR/tests/test_prep_usagi.py"
"$BLENDER" -b --factory-startup --python-exit-code 1 --python "$PIPELINE_DIR/tests/test_shape_consistency.py"
# VRM 扩展依赖用户启动配置，rig 测试不使用 --factory-startup。
"$BLENDER" -b --python-exit-code 1 --python "$PIPELINE_DIR/tests/test_rig_usagi.py"
# 011: external temporary Pillow, then synthetic face and real three-vrm mixing.
. "$PIPELINE_DIR/face/python_env.sh"
"$FACE_PYTHON" "$PIPELINE_DIR/tests/test_face_atlas.py"
FACE_RUNTIME_TEMP=$(mktemp -d "${TMPDIR:-/tmp/}usagi-face-runtime-XXXXXX")
# Keep failed runtime evidence; always remove the disposable Python dependency env.
cleanup_face_tests() {
    FACE_TEST_STATUS=$?
    if [ "$FACE_TEST_STATUS" -eq 0 ]; then
        rm -rf "$FACE_RUNTIME_TEMP"
    else
        printf '011 运行时失败现场：%s\n' "$FACE_RUNTIME_TEMP" >&2
    fi
    if [ -n "${FACE_TEMP:-}" ]; then rm -rf "$FACE_TEMP"; fi
}
trap cleanup_face_tests EXIT
trap 'exit 1' HUP INT TERM
FACE_RUNTIME_VRM="$FACE_RUNTIME_TEMP/synthetic-face.vrm"
export FACE_RUNTIME_VRM
"$BLENDER" -b --python-exit-code 1 --python "$PIPELINE_DIR/tests/test_face_usagi.py"
npm --prefix "$FACE_RUNTIME_TEMP" install --no-save --ignore-scripts --no-audit --no-fund --silent \
    '@pixiv/three-vrm@3.5.5' 'three@0.187.0'
node "$PIPELINE_DIR/tests/test_face_runtime.mjs" "$FACE_RUNTIME_TEMP"
# 022: fresh processes must reproduce all three real-model artifacts byte for byte.
"$FACE_PYTHON" "$PIPELINE_DIR/tests/test_reproducibility.py"
