#!/usr/bin/env python3
"""统一四视图白底、尺寸、角色高度和脚底线，并生成原作对照图。

运行方法（仓库根目录，先按 extract_refs.py 建仓库外 Pillow 环境）：
  /tmp/usagi-004-views-venv/bin/python tools/views/align_views.py
输入 views/selection.json、landmarks.json、reference_lines.json 与 candidates/ 原始生图；
不重画或修造型。reference_lines.json 固定第二轮参考线，不随第三轮候选移动。
输出 1024×1024 RGB PNG；角色高 870 px（85% 四舍五入），脚底 y=946。
近白且近中性的像素归白，透明像素先合成白底；保留奶黄与粉色。
"""

import json
from math import ceil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
VIEWS = ROOT / "Material/tripo/views"
SIZE = 1024
HEIGHT = round(SIZE * 0.85)
TOP = (SIZE - HEIGHT) // 2
ORDER = ("front", "back", "left", "right")


def white_background(image):
    rgba = image.convert("RGBA")
    canvas = Image.new("RGBA", rgba.size, "white")
    canvas.alpha_composite(rgba)
    rgb = canvas.convert("RGB")
    rgb.putdata([
        (255, 255, 255) if min(p) >= 240 and max(p) - min(p) <= 12 else p
        for p in rgb.get_flattened_data()
    ])
    return rgb


def bbox(image):
    return ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox()


def align(source):
    image = white_background(source)
    bounds = bbox(image)
    if bounds is None:
        raise ValueError("候选图没有可识别角色")
    cropped = image.crop(bounds)
    width = round(cropped.width * HEIGHT / cropped.height)
    if width > SIZE - 2 * TOP:
        raise ValueError("等比例缩放后过宽，不能同时满足角色高度与留白；交主导判断")
    resized = white_background(cropped.resize((width, HEIGHT), Image.Resampling.LANCZOS))
    # 细耳尖经 LANCZOS 与近白清理后可能损失一行；只增加一次等比例采样，
    # 再取实际包围盒，仍要求非白角色恰好 870 px，不放宽原有尺寸断言。
    actual_bounds = bbox(resized)
    if actual_bounds is not None and actual_bounds[3] - actual_bounds[1] == HEIGHT - 1:
        resized = white_background(cropped.resize(
            (round(cropped.width * (HEIGHT + 1) / cropped.height), HEIGHT + 1),
            Image.Resampling.LANCZOS))
    # 裁去滤波后可能形成的纯白边，不拉伸横纵比例、不移动局部肢体。
    actual_bounds = bbox(resized)
    if actual_bounds is None or actual_bounds[3] - actual_bounds[1] != HEIGHT:
        raise ValueError(f"缩放后角色高度改变：{actual_bounds}，请检查候选边缘")
    resized = resized.crop(actual_bounds)
    output = Image.new("RGB", (SIZE, SIZE), "white")
    output.paste(resized, ((SIZE - resized.width) // 2, TOP))
    return output, bounds


def build_sheet(reference_lines):
    sheet = Image.new("RGB", (4 * SIZE, 1664), "white")
    draw = ImageDraw.Draw(sheet)
    refs = ("front_full", "back_full", "side", "side_opposite")
    for col, (view, ref) in enumerate(zip(ORDER, refs)):
        x = col * SIZE
        with Image.open(VIEWS / f"{view}.png") as image:
            sheet.paste(image, (x, 32))
        draw.text((x + 24, 10), view.upper(), fill="black")
        draw.text((x + 24, 1080), f"ORIGINAL: {ref}.png (uncropped)", fill="black")
        with Image.open(ROOT / "Material/tripo/refs" / f"{ref}.png") as image:
            # 原作对照只缩小显示并合成透明层，不清色、不改原作像素。
            rgba = image.convert("RGBA")
            image = Image.new("RGB", rgba.size, "white")
            image.paste(rgba, mask=rgba.getchannel("A"))
            image.thumbnail((SIZE - 80, 520))
            sheet.paste(image, (x + (SIZE - image.width) // 2, 1120))
    # 只在对照图标注正面基准线；不移动局部部件来掩盖视图之间的偏差。
    for name, level in reference_lines.items():
        y = 32 + level
        for start in range(0, sheet.width, 18):
            draw.line((start, y, start + 10, y), fill="#d5d5d5", width=1)
        draw.text((8, y - 13), f"{name}: {level}", fill="#888888")
    sheet.save(VIEWS / "sheet.png")


def candidate_sheet(selections):
    names = []
    # 只展示当前选择所属轮次，历史候选及联系表另行保留。
    folders = {Path(relative).parent for relative in selections.values()}
    for view in ORDER:
        for folder in sorted(folders):
            names.extend(sorted((VIEWS / folder).glob(f"{view}_*.png")))
    sheet = Image.new("RGB", (2048, ceil(len(names) / 4) * 544), "white")
    draw = ImageDraw.Draw(sheet)
    for pos, path in enumerate(names):
        x, y = (pos % 4) * 512, (pos // 4) * 544
        with Image.open(path) as image:
            thumb = white_background(image)
            thumb.thumbnail((500, 500))
            sheet.paste(thumb, (x + (512 - thumb.width) // 2, y + 30))
        draw.text((x + 12, y + 8), f"{path.parent.name}/{path.stem}", fill="black")
    sheet.save(VIEWS / "candidates_sheet.png")


def main():
    selections = json.loads((VIEWS / "selection.json").read_text())
    measurements = {}
    landmarks = json.loads((VIEWS / "landmarks.json").read_text())
    for view in ORDER:
        relative = selections[view]
        with Image.open(VIEWS / relative) as source:
            output, original_bounds = align(source)
        output.save(VIEWS / f"{view}.png")
        bounds = bbox(output)
        assert output.mode == "RGB" and output.size == (SIZE, SIZE)
        assert bounds[3] - bounds[1] == HEIGHT and bounds[3] - 1 == TOP + HEIGHT - 1
        measurements[view] = {
            "candidate": relative, "size": list(output.size), "mode": output.mode,
            "source_bbox_exclusive": list(original_bounds), "final_bbox_exclusive": list(bounds),
            "height_px": HEIGHT, "height_fraction": HEIGHT / SIZE,
            "sole_y_inclusive": bounds[3] - 1,
            "background_rgb": [255, 255, 255],
            "visual_landmarks_y": {
                key: TOP + round((y - original_bounds[1]) * HEIGHT /
                                 (original_bounds[3] - original_bounds[1]))
                for key, y in landmarks[view].items()
            },
        }
    lines = json.loads((VIEWS / "reference_lines.json").read_text())
    build_sheet(lines)
    candidate_sheet(selections)
    (VIEWS / "alignment.json").write_text(json.dumps(measurements, indent=2) + "\n")
    print(json.dumps(measurements, indent=2))


if __name__ == "__main__":
    main()
