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
