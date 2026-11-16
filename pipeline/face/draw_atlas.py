"""Reference-driven Usagi line art, Pillow in an external temporary venv."""
import argparse
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont
from layout import (EYES, MOUTHS, CELL, MARGIN, FRAMES, LINE_M,
                    MOUTH_BOUNDS, CHEEK_CENTERS, CHEEK_SIZE, EYE_CENTERS,
                    EYE_DIAMETER, BROW_BOUNDS)

INK = '#2b1a14'
PINK = '#f6a3b5'
CHEEK_INK = '#e0607e'
TONGUE = '#f08aa0'
SCALE = 3


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


def bezier(points):
    a, b, c, d = points
    return [tuple((1-t)**3*a[k]+3*(1-t)**2*t*b[k]+3*(1-t)*t*t*c[k]+t**3*d[k]
                  for k in (0, 1)) for t in [i/80 for i in range(81)]]


class FacePen:
    """All artwork is authored in metres on the actual new landmark plane."""
    def __init__(self, canvas, frame):
        self.canvas, self.pen, self.frame = canvas, Pen(canvas), frame
        x0, x1, v0, v1 = frame
        self.stroke = (LINE_M/(x1-x0)*CELL, LINE_M/(v1-v0)*CELL)

    def pos(self, point):
        x, v = point
        x0, x1, v0, v1 = self.frame
        return ((x-x0)/(x1-x0)*CELL, (v1-v)/(v1-v0)*CELL)

    def curve(self, points, width=1, color=INK):
        self.pen.curve([self.pos(p) for p in points], tuple(c*width for c in self.stroke), color)

    def line(self, points, width=1, color=INK):
        self.pen.line([self.pos(p) for p in points], tuple(c*width for c in self.stroke), color)

    def ellipse(self, center, width, height, color):
        x, v = center
        self.pen.ellipse((*self.pos((x-width/2, v+height/2)),
                          *self.pos((x+width/2, v-height/2))), color)

    def fill(self, points, color):
        self.pen.d.polygon([tuple(c*SCALE for c in self.pos(p)) for p in points], fill=color)


def eyes(name):
    canvas = Image.new('RGBA', (CELL*SCALE, CELL*SCALE))
    p = FacePen(canvas, FRAMES['FaceEyes'])
    for i, (side, (cx, cv)) in enumerate(zip(('Right', 'Left'), EYE_CENTERS)):
        left, right, bottom, top = BROW_BOUNDS[i]
        # Same tall forehead arches in every cell, including angry and sad.
        r = LINE_M/2
        outer, inner = (left+r, right-r) if i == 0 else (right-r, left+r)
        p.curve([(outer, bottom+r), (outer+(inner-outer)*.16, top-r),
                 (outer+(inner-outer)*.70, top-r), (inner, top-r)])
        d = EYE_DIAMETER
        if name == 'blink' or name == 'blink'+side:
            p.line([(cx-(d-LINE_M)/2, cv), (cx+(d-LINE_M)/2, cv)])
        elif name == 'relaxed':
            w = d*1.3-LINE_M
            p.curve([(cx-w/2, cv-d*.12), (cx-w*.26, cv+d*.34),
                     (cx+w*.26, cv+d*.34), (cx+w/2, cv-d*.12)])
        else:
            p.ellipse((cx, cv), d, d, INK)
            # A single upper-left oval highlight; no lower smile/highlight arc.
            p.ellipse((cx-d*.14, cv+d*.17), d*.40, d*.34, '#ffffff')
        bx, bv = CHEEK_CENTERS[i]
        w, h = CHEEK_SIZE
        p.ellipse((bx, bv), w, h, PINK)
        for shift in (-.039, -.013, .013, .039):
            p.line([(bx+shift+.005, bv+.016), (bx+shift-.005, bv-.016)],
                   .84, CHEEK_INK)
    return canvas.resize((CELL, CELL), Image.Resampling.LANCZOS)


def mouth(name):
    canvas = Image.new('RGBA', (CELL*SCALE, CELL*SCALE))
    p = FacePen(canvas, FRAMES['FaceMouth'])
    left, right, bottom, top = MOUTH_BOUNDS
    r = LINE_M/2
    width, cx = right-left-LINE_M, (left+right)/2
    if name == 'sad':
        width *= .70
    x0, x1, peak = cx-width/2, cx+width/2, top-r
    # Two lobes meet in an upward central cusp: the shared omega upper edge.
    omega = [[(x0, peak-width*.18), (x0, peak-width*.52),
              (cx, peak-width*.52), (cx, peak)],
             [(cx, peak), (cx, peak-width*.52),
              (x1, peak-width*.52), (x1, peak-width*.18)]]
    small = name in ('ih', 'ee', 'ou', 'happy', 'surprised')
    large = name in ('aa', 'oh', 'angry')
    if small or large:
        # The opening grows DOWN from the omega, not from an ellipse's top.
        # Broad sides and two quarter-ellipse curves form a rounded U base.
        # Total ink height / full omega width is .85 (small) or 1.30 (large).
        depth = (right-left)*(.85 if small else 1.30)
        left_join = bezier(omega[0])[24]
        right_join = bezier(omega[1])[56]
        lowest = top-depth+r
        half = (right_join[0]-left_join[0])/2
        ry = min(half, (left_join[1]-lowest)*.80)
        lx, rx = left_join[0], right_join[0]
        u = [left_join]+bezier([(lx, lowest+ry), (lx, lowest+ry*.4477),
              (cx-half*.5523, lowest), (cx, lowest)])
        u += bezier([(cx, lowest), (cx+half*.5523, lowest),
              (rx, lowest+ry*.4477), (rx, lowest+ry)])+[right_join]
        top_edge = bezier(omega[0])[24:]+bezier(omega[1])[:57]
        p.fill(top_edge+list(reversed(u)), '#54232b')
        p.line(u)
        # Tongue clipped to the same U cavity, occupying its lower third.
        tongue = Image.new('RGBA', canvas.size)
        tp = FacePen(tongue, p.frame)
        cavity_height = min(left_join[1], right_join[1])-lowest
        tp.ellipse((cx, lowest+cavity_height*.10), half*1.7,
                   cavity_height*.48, TONGUE)
        mask = Image.new('RGBA', canvas.size)
        FacePen(mask, p.frame).fill(top_edge+list(reversed(u)), '#ffffff')
        tongue.putalpha(ImageChops.multiply(tongue.getchannel('A'), mask.getchannel('A')))
        canvas.alpha_composite(tongue)
    for curve in omega:
        p.curve(curve)
    if name == 'neutral':
        # Left downward tail, rounded into a small rightward hook (F01/F02).
        p.curve([(cx-width*.23, peak-width*.38), (cx-width*.35, bottom+r),
                 (cx-width*.21, bottom+r), (cx+width*.03, bottom+r)])
    elif name == 'sad':
        for sign in (-1, 1):
            x = cx+sign*(right-left)*.46
            p.curve([(x, peak-width*.12), (x-sign*.012, peak-width*.32),
                     (x-sign*.012, peak-width*.55), (x, peak-width*.75)], .70)
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
    from compare_reference import compare
    compare(source, Path(output).with_name('compare_reference.png'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--sheet-source')
    args = parser.parse_args()
    sheet(args.sheet_source, args.out) if args.sheet_source else generate(args.out)
