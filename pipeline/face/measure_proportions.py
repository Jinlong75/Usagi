"""Measure visible ink in the 320px head-width comparison, including strokes.

Fixed regions select features in the established comparison layout. Dark-ink
components avoid highlights, pink cheeks and cream surfaces; antialiased pixels
are included only below RGB (110,90,90). Never rescale a feature independently.
"""
import argparse
import json
import math
from pathlib import Path
from PIL import Image


def ink_components(image, region):
    x0, y0, x1, y1 = region
    points = {(x, y) for y in range(y0, y1) for x in range(x0, x1)
              if all(a < b for a, b in zip(image.getpixel((x, y)), (110, 90, 90)))}
    groups = []
    while points:
        seed = points.pop()
        stack, group = [seed], [seed]
        while stack:
            x, y = stack.pop()
            for p in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if p in points:
                    points.remove(p)
                    stack.append(p)
                    group.append(p)
        if len(group) >= 10:
            xs, ys = zip(*group)
            groups.append((len(group), (min(xs), min(ys), max(xs)+1, max(ys)+1)))
    return [box for count, box in sorted(groups, reverse=True)]


def feature(image, region):
    return ink_components(image, region)[0]


def neutral_metrics(image, regions):
    eyes = [feature(image, r) for r in regions[:2]]
    brows = [feature(image, r) for r in regions[2:4]]
    mouth = feature(image, regions[4])
    centres = [((b[0]+b[2])/2, (b[1]+b[3])/2) for b in eyes]
    return dict(eye_diameter_over_head=sum(math.sqrt((b[2]-b[0])*(b[3]-b[1])) for b in eyes)/2/320,
                eye_distance_over_head=math.dist(*centres)/320,
                brow_width_over_head=sum(b[2]-b[0] for b in brows)/2/320,
                brow_peak_above_eye_over_head=sum(c[1]-b[1] for c, b in zip(centres, brows))/2/320,
                mouth_height_over_width=(mouth[3]-mouth[1])/(mouth[2]-mouth[0]),
                boxes=dict(eyes=eyes, brows=brows, mouth=mouth))


def measure(path):
    image = Image.open(path).convert('RGB')
    reference = neutral_metrics(image, ((145, 185, 190, 231), (230, 185, 275, 231),
        (115, 140, 180, 188), (230, 140, 290, 188), (185, 230, 250, 280)))
    model = neutral_metrics(image, ((540, 180, 620, 235), (640, 180, 720, 235),
        (510, 100, 625, 193), (640, 100, 750, 193), (595, 235, 670, 305)))
    for name, region in (('aa', (595, 595, 670, 725)), ('happy', (595, 1315, 670, 1390))):
        boxes = ink_components(image, region)
        main = boxes[0]
        model[name+'_mouth_height_over_width'] = (main[3]-main[1])/(main[2]-main[0])
        model[name+'_mouth_including_detached_ink_height_over_width'] = (
            max(b[3] for b in boxes)-min(b[1] for b in boxes))/(main[2]-main[0])
        model['boxes'][name+'_mouth_components'] = boxes
    return dict(head_width_px=320, diameter_method='mean geometric diameter sqrt(ink width * ink height)',
                reference_F01=reference, model=model)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compare', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    Path(args.out).write_text(json.dumps(measure(args.compare), indent=2)+'\n')
