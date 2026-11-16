#!/bin/sh
# 012 验收检查（主导维护）：出 mac dmg，挂载检查资源，打包后冒烟，复制证据到门禁产物目录
set -e
npm --prefix app run dist:mac
DMG=$(ls -t app/release/*.dmg 2>/dev/null | head -1)
test -n "$DMG" || { echo "app/release/ 下没有 dmg"; exit 1; }
echo "dmg：$DMG"
MNT=$(mktemp -d /tmp/usagi-dmg.XXXXXX)
hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$DMG" >/dev/null
cleanup() { hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || true; }
trap cleanup EXIT
APP="$MNT/Usagi.app"
test -d "$APP" || { echo "dmg 里没有 Usagi.app"; exit 1; }
test -f "$APP/Contents/Resources/models/usagi.vrm" || { echo "包里缺少 models/usagi.vrm"; exit 1; }
test -f "$APP/Contents/Resources/sounds/usagi/manifest.json" || { echo "包里缺少 sounds/usagi/manifest.json"; exit 1; }
WORK=$(mktemp -d /tmp/usagi-app.XXXXXX)
cp -R "$APP" "$WORK/"
OUT="$WORK/smoke.out"
"$WORK/Usagi.app/Contents/MacOS/Usagi" --smoke > "$OUT" 2>&1 || true
grep -q '"ok":true' "$OUT" || { echo "打包后冒烟失败："; tail -20 "$OUT"; exit 1; }
if [ -n "$AR_GATE_ARTIFACT_DIR" ]; then
  cp "$OUT" "$AR_GATE_ARTIFACT_DIR/packaged-smoke.out"
  ls -la app/release/ > "$AR_GATE_ARTIFACT_DIR/release-files.txt"
  cp "$WORK"/*.png "$AR_GATE_ARTIFACT_DIR/" 2>/dev/null || true
fi
rm -rf "$WORK"
echo "012 检查通过"
