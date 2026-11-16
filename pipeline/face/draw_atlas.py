"""Reference-driven Usagi line art, Pillow in an external temporary venv."""
import argparse
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont
from layout import (EYES, MOUTHS, CELL, MARGIN, FRAMES, LINE_M,
                    MOUTH_BOUNDS, CHEEK_CENTERS, CHEEK_SIZE)

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
        if isinstance(width, tuple):
            # An elliptical pixel brush is circular in the projected metre
            # plane, despite different horizontal/vertical atlas scales.
            rx, ry = (w*SCALE/2 for w in width)
            for a, b in zip(points, points[1:]):
                steps = max(1, round(max(abs(b[k]-a[k]) for k in (0, 1))))
                for i in range(steps+1):
                    x, y = (a[k]+(b[k]-a[k])*i/steps for k in (0, 1))
                    self.d.ellipse((x-rx, y-ry, x+rx, y+ry), fill=color)
            return
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
    stroke = (LINE_M/(xmax-xmin)*CELL, LINE_M/(vmax-vmin)*CELL)
    eye_y = .375/(vmax-vmin)  # Preserve approved eyes when expanding the guard band.
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
                     pos(sign*.11, .520), pos(sign*.069, .505)], stroke)
        elif name == 'sad':
            p.curve([pos(sign*.211, .532), pos(sign*.17, .531),
                     pos(sign*.11, .596), pos(sign*.076, .608)], stroke)
        else:
            lift = .012 if name == 'surprised' else 0
            p.curve([(brow_outer[0], brow_outer[1]-lift*CELL/(vmax-vmin)),
                     pos(sign*.195, .600+lift, -.19), pos(sign*.129, .649+lift, -.19),
                     (brow_inner[0], brow_inner[1]-lift*CELL/(vmax-vmin))], stroke)
        closed = name == 'blink' or name == 'blink'+side
        if closed:
            p.curve([(cx-22, cy-3*eye_y), (cx-10, cy+12*eye_y),
                     (cx+10, cy+12*eye_y), (cx+22, cy-3*eye_y)], stroke)
        elif name == 'happy':
            p.curve([(cx-23, cy+10*eye_y), (cx-10, cy-19*eye_y),
                     (cx+10, cy-19*eye_y), (cx+23, cy+10*eye_y)], stroke)
        elif name == 'relaxed':
            p.ellipse((cx-21, cy-3*eye_y, cx+21, cy+21*eye_y), INK)
            p.line([(cx-24, cy-3*eye_y), (cx+24, cy-3*eye_y)], stroke)
            p.ellipse((cx-6, cy+2*eye_y, cx+1, cy+8*eye_y), '#FFFFFF')
        else:
            rx, ry = (28, 51)
            if name == 'surprised':
                rx, ry = 34, 60
            elif name == 'angry':
                rx, ry = 21, 36
            ry *= eye_y
            p.ellipse((cx-rx, cy-ry, cx+rx, cy+ry), INK)
            p.ellipse((cx-rx*.45, cy-ry*.67, cx+rx*.22, cy-ry*.12), '#FFFFFF')
            p.curve([(cx-8, cy+ry*.57), (cx-3, cy+ry*.75),
                     (cx+5, cy+ry*.75), (cx+10, cy+ry*.48)], (2.5, 2.5*eye_y), '#FFFFFF')
            if name == 'sad':
                p.ellipse((cx+sign*20-7, cy+24*eye_y, cx+sign*20+7, cy+42*eye_y), '#A8DDEB')
        bx, bv = CHEEK_CENTERS[0 if sign < 0 else 1]
        def cheek_pos(x, v):
            return ((x-xmin)/(xmax-xmin)*CELL, (vmax-v)/(vmax-vmin)*CELL)
        w, h = CHEEK_SIZE
        p.ellipse((*cheek_pos(bx-w/2, bv+h/2), *cheek_pos(bx+w/2, bv-h/2)), PINK)
        for shift in (-.030, 0, .030):
            p.line([cheek_pos(bx+shift+.007, bv+.012),
                    cheek_pos(bx+shift-.007, bv-.012)], stroke, '#000000')
    return canvas.resize((CELL, CELL), Image.Resampling.LANCZOS)


def mouth(name):
    canvas = Image.new('RGBA', (CELL*SCALE, CELL*SCALE))
    p = Pen(canvas)
    xmin, xmax, vmin, vmax = FRAMES['FaceMouth']
    stroke = (LINE_M/(xmax-xmin)*CELL, LINE_M/(vmax-vmin)*CELL)
    if name == 'neutral':
        left, right, bottom, top = MOUTH_BOUNDS
        r = LINE_M/2
        # Curve endpoints and round caps exactly span the source sculpture's
        # projected bounds; centre = (-.0025, .30258), not the tile centre.
        def pos(u, v):
            x = left+r+u*(right-left-2*r)
            z = top-r-v*(top-bottom-2*r)
            return ((x-xmin)/(xmax-xmin)*CELL, (vmax-z)/(vmax-vmin)*CELL)
        p.curve([pos(0, .22), pos(0, .66), pos(.46, .66), pos(.5, 0)], stroke)
        p.curve([pos(.5, 0), pos(.54, .66), pos(1, .66), pos(1, .22)], stroke)
        # 参考图正面：尾巴从左侧弯的底部垂下，末端向右勾（主导 2026-11-16 定）。
        p.curve([pos(.25, .5), pos(.17, .88), pos(.27, 1), pos(.47, 1)], stroke)
    elif name == 'sad':
        p.curve([(122, 300), (197, 227), (307, 227), (388, 300)], stroke)
    elif name == 'ee':
        p.curve([(100, 223), (173, 300), (339, 300), (412, 223)], stroke)
    else:
        boxes = {'aa': (137, 100, 375, 422), 'angry': (112, 67, 400, 445),
                 'happy': (104, 136, 408, 414), 'ih': (98, 207, 414, 323),
                 'ou': (202, 156, 310, 362), 'oh': (161, 125, 351, 399),
                 'surprised': (200, 194, 312, 322)}
        box = boxes[name]
        # Ellipses use a filled outer/inner pair for the same metre thickness
        # as line art (Pillow's outline width is isotropic only in pixels).
        p.ellipse(box, INK)
        x0, y0, x1, y1 = box
        sx, sy = stroke
        p.ellipse((x0+sx, y0+sy, x1-sx, y1-sy), '#642A32')
        if name in ('aa', 'angry', 'happy'):
            x0, y0, x1, y1 = box
            # A tongue wholly inside the outlined cavity.
            tongue = Image.new('RGBA', canvas.size)
            Pen(tongue).ellipse((x0+34, y1-97, x1-34, y1-19), '#F58B9B')
            interior = Image.new('RGBA', canvas.size)
            Pen(interior).ellipse((x0+sx, y0+sy, x1-sx, y1-sy), '#FFFFFF')
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
            # Show physical proportions: the eyes' broad projection frame is
            # squeezed into a square UV cell, but the face unsqueezes it.
            frame = FRAMES['FaceEyes' if atlas_index == 0 else 'FaceMouth']
            width, height = frame[1]-frame[0], frame[3]-frame[2]
            factor = 250/max(width, height)
            thumbnail = tile.resize((round(width*factor), round(height*factor)), Image.Resampling.LANCZOS)
            preview.paste(thumbnail, (x+(256-thumbnail.width)//2, y+(256-thumbnail.height)//2), thumbnail)
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
