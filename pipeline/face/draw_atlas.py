"""Reference-driven Usagi line art, Pillow in an external temporary venv."""
import argparse
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont
from layout import EYES, MOUTHS, CELL, MARGIN, FRAMES

INK = '#2B1A12'
PINK = '#F5AEBB'
SCALE = 2
# The same projected frame is used by face_usagi.py. Positions are expressed in
# the source sculpture's rotated Blender X/Z coordinates, with depth for projection.
EYE_FRAME = FRAMES['FaceEyes']
NORMAL = (0, -.9853762388, .1703930497)


def projected(x, z, depth=-.265):
    return x, z * -NORMAL[1] + depth * NORMAL[2]


class Pen:
    def __init__(self, image):
        self.d = ImageDraw.Draw(image)

    def ellipse(self, box, fill, outline=None, width=5):
        self.d.ellipse(tuple(round(x*SCALE) for x in box), fill=fill, outline=outline,
                       width=round(width*SCALE))

    def line(self, points, width=5, color=INK):
        points = [(x*SCALE, y*SCALE) for x, y in points]
        self.d.line(points, fill=color, width=round(width*SCALE), joint='curve')
        r = width*SCALE/2
        for x, y in (points[0], points[-1]):
            self.d.ellipse((x-r, y-r, x+r, y+r), fill=color)

    def curve(self, points, width=5, color=INK):
        # Cubic Bezier; explicit sampling gives consistent round strokes.
        a, b, c, d = points
        self.line([tuple((1-t)**3*a[k]+3*(1-t)**2*t*b[k]+3*(1-t)*t*t*c[k]+t**3*d[k]
                         for k in (0, 1)) for t in [i/60 for i in range(61)]], width, color)


def eyes(name):
    canvas = Image.new('RGBA', (CELL*SCALE, CELL*SCALE))
    p = Pen(canvas)
    xmin, xmax, vmin, vmax = EYE_FRAME
    def pos(x, z, depth=-.265):
        u, v = projected(x, z, depth)
        return ((u-xmin)/(xmax-xmin)*CELL, (vmax-v)/(vmax-vmin)*CELL)
    # Reference has paired forehead arches, small oval eyes, and three cheek marks.
    for sign, side in ((-1, 'Right'), (1, 'Left')):
        cx, cy = pos(sign*.1045, .458)
        brow_outer = pos(sign*.210, .520, -.19)
        brow_inner = pos(sign*.078, .632, -.19)
        if name == 'angry':
            p.curve([pos(sign*.207, .559), pos(sign*.16, .555),
                     pos(sign*.11, .520), pos(sign*.069, .505)], 5.5)
        elif name == 'sad':
            p.curve([pos(sign*.211, .532), pos(sign*.17, .531),
                     pos(sign*.11, .596), pos(sign*.076, .608)], 5)
        else:
            lift = .012 if name == 'surprised' else 0
            p.curve([(brow_outer[0], brow_outer[1]-lift*CELL/(vmax-vmin)),
                     pos(sign*.195, .600+lift, -.19), pos(sign*.129, .649+lift, -.19),
                     (brow_inner[0], brow_inner[1]-lift*CELL/(vmax-vmin))], 5)
        closed = name == 'blink' or name == 'blink'+side
        if closed:
            p.curve([(cx-22, cy-3), (cx-10, cy+12), (cx+10, cy+12), (cx+22, cy-3)], 5)
        elif name == 'happy':
            p.curve([(cx-23, cy+10), (cx-10, cy-19), (cx+10, cy-19), (cx+23, cy+10)], 5)
        elif name == 'relaxed':
            p.ellipse((cx-21, cy-3, cx+21, cy+21), INK)
            p.line([(cx-24, cy-3), (cx+24, cy-3)], 5)
            p.ellipse((cx-6, cy+2, cx+1, cy+8), '#FFFFFF')
        else:
            rx, ry = (28, 51)
            if name == 'surprised':
                rx, ry = 34, 60
            elif name == 'angry':
                rx, ry = 21, 36
            p.ellipse((cx-rx, cy-ry, cx+rx, cy+ry), INK)
            p.ellipse((cx-rx*.45, cy-ry*.67, cx+rx*.22, cy-ry*.12), '#FFFFFF')
            p.curve([(cx-8, cy+ry*.57), (cx-3, cy+ry*.75),
                     (cx+5, cy+ry*.75), (cx+10, cy+ry*.48)], 2.5, '#FFFFFF')
            if name == 'sad':
                p.ellipse((cx+sign*20-7, cy+24, cx+sign*20+7, cy+42), '#A8DDEB')
        bx, by = pos(sign*.194, .398)
        p.ellipse((bx-34, by-23, bx+34, by+23), PINK)
        for shift in (-15, 0, 15):
            p.line([(bx+shift+4, by-10), (bx+shift-4, by+10)], 4)
    return canvas.resize((CELL, CELL), Image.Resampling.LANCZOS)


def mouth(name):
    canvas = Image.new('RGBA', (CELL*SCALE, CELL*SCALE))
    p = Pen(canvas)
    if name == 'neutral':
        p.curve([(104, 220), (103, 312), (231, 304), (252, 214)], 16)
        p.curve([(252, 214), (247, 301), (385, 312), (405, 220)], 16)
        p.curve([(252, 273), (292, 314), (290, 354), (241, 360)], 13)
        p.ellipse((239, 199, 265, 228), INK)
    elif name == 'sad':
        p.curve([(122, 300), (197, 227), (307, 227), (388, 300)], 16)
    elif name == 'ee':
        p.curve([(100, 223), (173, 300), (339, 300), (412, 223)], 17)
    else:
        boxes = {'aa': (137, 100, 375, 422), 'angry': (112, 67, 400, 445),
                 'happy': (104, 136, 408, 414), 'ih': (98, 207, 414, 323),
                 'ou': (202, 156, 310, 362), 'oh': (161, 125, 351, 399),
                 'surprised': (200, 194, 312, 322)}
        box = boxes[name]
        p.ellipse(box, '#642A32', INK, 14)
        if name in ('aa', 'angry', 'happy'):
            x0, y0, x1, y1 = box
            # A tongue wholly inside the outlined cavity.
            tongue = Image.new('RGBA', canvas.size)
            Pen(tongue).ellipse((x0+34, y1-97, x1-34, y1-19), '#F58B9B')
            interior = Image.new('RGBA', canvas.size)
            Pen(interior).ellipse((x0+14, y0+14, x1-14, y1-14), '#FFFFFF')
            tongue.putalpha(ImageChops.multiply(tongue.getchannel('A'), interior.getchannel('A')))
            canvas.alpha_composite(tongue)
        if name == 'ih':
            p.line([(142, 229), (370, 229)], 13, '#FFF9ED')
    return canvas.resize((CELL, CELL), Image.Resampling.LANCZOS)


def generate(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=19)
    preview = Image.new('RGB', (8*256, 4*288), '#E9E5DE')
    pd = ImageDraw.Draw(preview)
    for atlas_index, (names, painter, filename) in enumerate(
            ((EYES, eyes, 'eyes_atlas.png'), (MOUTHS, mouth, 'mouth_atlas.png'))):
        atlas = Image.new('RGBA', (CELL*4, CELL*4))
        for index in range(16):
            col, row = index % 4, index // 4
            name = names[index] if index < len(names) else 'unused'
            tile = painter(name) if index < len(names) else Image.new('RGBA', (CELL, CELL))
            atlas.paste(tile, (col*CELL, row*CELL))
            x, y = (atlas_index*4+col)*256, row*288
            pd.rectangle((x+3, y+3, x+252, y+253), fill='#FFF1C1')
            preview.paste(tile.resize((256, 256), Image.Resampling.LANCZOS), (x, y),
                          tile.resize((256, 256), Image.Resampling.LANCZOS))
            pd.text((x+12, y+261), name, font=font, fill=INK)
        atlas.save(output/filename)
    preview.save(output/'atlas_preview.png')


def sheet(source, output):
    from layout import EXPRESSIONS
    font = ImageFont.load_default(size=22)
    result = Image.new('RGB', (384*4, 420*4), '#E9E5DE')
    pen = ImageDraw.Draw(result)
    for i, name in enumerate(EXPRESSIONS):
        tile = Image.open(Path(source)/(name+'.png')).convert('RGB')
        x, y = i%4*384, i//4*420
        result.paste(tile, (x, y))
        pen.text((x+12, y+389), name, font=font, fill=INK)
    result.save(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--sheet-source')
    args = parser.parse_args()
    sheet(args.sheet_source, args.out) if args.sheet_source else generate(args.out)
