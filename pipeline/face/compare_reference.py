"""Pair original crops with face renders at the same measured head width.

Some supplied references clip the head sides. For those, infer its complete width
from the eye-centre distance using F01; keep missing image areas visibly blank.
No face feature is stretched separately, and the original drawing is not redrawn.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from layout import HEAD_WIDTH

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT/'docs/research/usagi-表情动作/face'
# Manual source pixel anchors: eye centres, visible head width where complete.
REFERENCES = (
    ('F01', 'neutral', '常态圆眼闭ω-2ca57d0d-f000.png', ((155, 124), (247, 122)), 347),
    ('F05', 'aa', '竖开ω舌口-video-002.133s.png', ((77, 130), (250, 94)), None),
    ('F09', 'blink', '短横闭眼-f3581eb5-f009.png', ((119, 65), (265, 106)), None),
    ('F19', 'happy', '哈圆眼开ω-video-157.267s.png', ((84, 110), (193, 114)), 376),
    ('F12', 'sad', '鼓颊紧缩ω-d1107d90-f000.png', ((159, 160), (310, 174)), None),
)


def compare(source, output):
    width = 320
    column, row = 420, 360
    result = Image.new('RGB', (column*2, row*5+70), '#e9e5de')
    draw = ImageDraw.Draw(result)
    font = ImageFont.load_default(size=19)
    draw.text((18, 10), 'Original reference', font=font, fill='#2b1a14')
    draw.text((438, 10), 'Our model / frontal render', font=font, fill='#2b1a14')
    draw.text((18, 38), 'Same head width: 320 px; pale gutters = unavailable source',
              font=ImageFont.load_default(size=15), fill='#2b1a14')
    f01_distance = math.dist(*REFERENCES[0][3])
    evidence = []
    for i, (ref, expression, filename, eyes, head_width) in enumerate(REFERENCES):
        inferred = head_width is None
        if inferred:
            head_width = math.dist(*eyes)*347/f01_distance
        original = Image.open(REFERENCE/filename).convert('RGB')
        rendered = Image.open(Path(source)/(expression+'.png')).convert('RGB')
        # Camera contract: 384 px, orthographic .77m, horizontal view at z=.475.
        # Eye surface z ~= .468, from the measured plane and front body depth.
        model_width = HEAD_WIDTH/.77*rendered.width
        row_top = 70+i*row
        for col, picture, scale, anchor in (
                (0, original, width/head_width,
                 tuple(sum(p[k] for p in eyes)/2 for k in (0, 1))),
                (1, rendered, width/model_width, (192, 195.5))):
            panel = Image.new('RGB', (column, row-34), '#fff1c1')
            tile = picture.resize((round(picture.width*scale), round(picture.height*scale)),
                                  Image.Resampling.LANCZOS)
            panel.paste(tile, (round(column/2-anchor[0]*scale), round(140-anchor[1]*scale)))
            result.paste(panel, (col*column, row_top))
        label = f'{ref}   {expression}'+(' (head width inferred)' if inferred else '')
        draw.text((18, row_top+row-27), label, font=font, fill='#2b1a14')
        draw.text((438, row_top+row-27), expression, font=font, fill='#2b1a14')
        evidence.append(dict(reference=ref, expression=expression, source=filename,
            source_head_width_px=head_width, width_inferred_from_F01_eyes=inferred,
            source_scale=width/head_width, render_head_width_px=model_width,
            render_scale=width/model_width, aligned_head_width_px=width))
    output = Path(output)
    result.save(output)
    output.with_suffix('.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default=str(ROOT/'assets/model/preview_face'))
    parser.add_argument('--out', default=str(ROOT/'assets/model/preview_face/compare_reference.png'))
    args = parser.parse_args()
    compare(args.source, args.out)
