"""从参考图正面裁头像；依赖 Pillow（装在仓库外的临时 venv），无需 GUI。

python3 -m venv /tmp/usagi-icons-venv
/tmp/usagi-icons-venv/bin/pip install Pillow==11.3.0
/tmp/usagi-icons-venv/bin/python app/scripts/icons.py
"""
from pathlib import Path
from collections import deque
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "app/build"
OUT.mkdir(parents=True, exist_ok=True)
source = Image.open(ROOT / "Material/tripo/usagi_3d_ref.png").convert("RGBA")
# 所有坐标相对原图 1774×887；只取第一列正面，保留完整耳朵。
source = source.resize((1774, 887), Image.Resampling.LANCZOS)
head = source.crop((88, 122, 442, 535))
pixels = head.load()
outside = set()
queue = deque([(0, 0)])
while queue:
    x, y = queue.popleft()
    if (x, y) in outside or not (0 <= x < head.width and 0 <= y < head.height):
        continue
    r, g, b, _ = pixels[x, y]
    if min(r, g, b) < 225 or max(r, g, b) - min(r, g, b) > 22:
        continue
    outside.add((x, y))
    queue.extend(((x-1, y), (x+1, y), (x, y-1), (x, y+1)))
for x, y in outside:
    pixels[x, y] = (0, 0, 0, 0)

# 正面图头和身体连在一起，用椭圆下缘裁去身体/手，仅保留头像。
mask = Image.new("L", head.size)
draw = ImageDraw.Draw(mask)
draw.rectangle((0, 0, head.width, 330), fill=255)
draw.ellipse((20, 245, 335, 412), fill=255)
alpha = head.getchannel("A")
from PIL import ImageChops
head.putalpha(ImageChops.multiply(alpha, mask))
head = head.crop(head.getbbox())
scale = 880 / max(head.size)
head = head.resize((round(head.width * scale), round(head.height * scale)), Image.Resampling.LANCZOS)
icon = Image.new("RGBA", (1024, 1024))
icon.alpha_composite(head, ((1024-head.width)//2, (1024-head.height)//2))
icon.save(OUT / "icon.png")
icon.save(OUT / "icon.icns", format="ICNS")
icon.save(OUT / "icon.ico", format="ICO", sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
for size, suffix in ((16, ""), (32, "@2x")):
    tray = icon.resize((size, size), Image.Resampling.LANCZOS)
    tray.save(OUT / f"tray{suffix}.png")
    black = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    black.putalpha(tray.getchannel("A"))
    black.save(OUT / f"trayTemplate{suffix}.png")
print("生成 1024px 透明头像、ICNS、16–256px ICO 和 16/32px 托盘图标。")
