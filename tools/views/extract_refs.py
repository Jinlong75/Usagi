#!/usr/bin/env python3
"""截取 Usagi 原作 GIF 参考帧，保留原分辨率，或生成选帧联系表。

运行方法（仓库根目录）：
  python3 -m venv /tmp/usagi-004-views-venv
  /tmp/usagi-004-views-venv/bin/pip install Pillow==13.0.0
  /tmp/usagi-004-views-venv/bin/python tools/views/extract_refs.py --scan
  /tmp/usagi-004-views-venv/bin/python tools/views/extract_refs.py
帧号从 0 开始；Pillow seek 会合成 GIF 的增量帧，不改动原 GIF。
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
REFS = ROOT / "Material/tripo/refs"


def scan():
    out = REFS / "contact_sheets"
    out.mkdir(parents=True, exist_ok=True)
    catalog = []
    for source in sorted((ROOT / "Material").glob("*.gif")):
        with Image.open(source) as gif:
            indices = sorted({round(i * (gif.n_frames - 1) / 7) for i in range(8)})
            sheet = Image.new("RGB", (1000, 2 * 320), "white")
            draw = ImageDraw.Draw(sheet)
            for pos, frame in enumerate(indices):
                gif.seek(frame)
                thumb = gif.convert("RGBA")
                thumb.thumbnail((240, 285))
                x, y = (pos % 4) * 250, (pos // 4) * 320
                sheet.paste(thumb, (x + (250 - thumb.width) // 2, y + 25), thumb)
                draw.text((x + 5, y + 5), f"frame {frame} / {gif.n_frames}", fill="black")
            sheet.save(out / f"{source.stem}.png")
            catalog.append({"gif": source.name, "size": list(gif.size), "frames": gif.n_frames})
    (out / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")


def extract():
    manifest = json.loads((REFS / "selection.json").read_text())
    for output, selection in manifest.items():
        with Image.open(ROOT / "Material" / selection["gif"]) as gif:
            gif.seek(selection["frame_zero_based"])
            gif.convert("RGBA").save(REFS / output)
            print(f"{output}: {gif.size}, frame {selection['frame_zero_based']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scan", action="store_true")
    args = parser.parse_args()
    scan() if args.scan else extract()
