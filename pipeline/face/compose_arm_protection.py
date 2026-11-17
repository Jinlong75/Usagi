"""031 label focused Blender renders; run with the pipeline's disposable Pillow."""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument('--frames', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
font = ImageFont.load_default(size=20)
small = ImageFont.load_default(size=16)
columns = [('before','yaw','Original | yaw +0.40'),('after','yaw','Fixed | yaw +0.40'),
           ('before','arms','Original | maximum arms'),('after','arms','Fixed | maximum arms')]
canvas = Image.new('RGB',(1600,1680),'white')
draw = ImageDraw.Draw(canvas)
for row, view in enumerate(('front','45')):
    for col, (version, pose, label) in enumerate(columns):
        picture = Image.open(args.frames/f'{version}-{pose}-{view}.png').convert('RGB')
        x, y = col*400, row*440
        draw.text((x+8,y+5),f'{label} / {view}',font=font,fill='black')
        canvas.paste(picture.resize((400,400),Image.Resampling.LANCZOS),(x,y+35))
# Same camera and fixed source crop in every before/after cell. The 45-degree
# crop covers the near arm, corresponding to the 030 joint-closeup camera.
for row, view in enumerate(('front','45')):
    box = (115,365,242,500) if view == 'front' else (390,380,530,520)
    for col, (version,pose,label) in enumerate(columns):
        picture = Image.open(args.frames/f'{version}-{pose}-{view}.png').convert('RGB')
        x,y=col*400,880+row*400
        draw.text((x+8,y+5),f'Arm root closeup / {view}',font=font,fill='black')
        canvas.paste(picture.crop(box).resize((360,360),Image.Resampling.LANCZOS),(x+20,y+35))
canvas.save(args.out/'031-before-after.png')
canvas=Image.new('RGB',(1280,700),'white');draw=ImageDraw.Draw(canvas)
for col,view in enumerate(('front','45')):
    picture=Image.open(args.frames/f'after-neutral-{view}.png').convert('RGB')
    canvas.paste(picture,(col*640,55))
    draw.text((col*640+12,8),f'{view} | blue: head side (2880) | red: hands (327)',font=font,fill='black')
draw.text((12,680),'Frozen final-export samples; waist Z=0.2617585, ear root Z=0.7155062, arm radius=0.032H',font=small,fill='black')
canvas.save(args.out/'031-protect-samples.png')
