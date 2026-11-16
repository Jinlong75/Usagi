#!/bin/sh
# 004 验收检查（主导维护）：四视图与说明文件齐全，四张图都是 1024x1024
set -e
for f in front back left right; do
  p="Material/tripo/views/$f.png"
  test -f "$p" || { echo "缺少 $p"; exit 1; }
  sips -g pixelWidth "$p" | grep -q "pixelWidth: 1024" || { echo "$p 宽度不是 1024"; exit 1; }
  sips -g pixelHeight "$p" | grep -q "pixelHeight: 1024" || { echo "$p 高度不是 1024"; exit 1; }
done
for p in Material/tripo/views/sheet.png Material/tripo/refs/README.md Material/tripo/views/README.md; do
  test -f "$p" || { echo "缺少 $p"; exit 1; }
done
echo "004 检查通过"
