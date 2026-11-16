"""Extract evidence only; run with an external Pillow environment. No model edits.

The _work directory is temporary, private to this task; --clean-work removes it.
Frame indices are zero based. Video frames use original 30 fps timestamps.
"""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import argparse, hashlib, json, math, shutil, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
WORK = OUT / '_work'
FFMPEG = '/private/tmp/usagi-audio-venv/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v9.0'
FONT = ImageFont.load_default(size=18)
SMALL = ImageFont.load_default(size=15)

def sheet(items, title, path, cols=4, cell=(320, 260)):
    w,h = cell
    canvas = Image.new('RGB', (w*cols, 45+math.ceil(len(items)/cols)*h), '#ece9e1')
    d=ImageDraw.Draw(canvas); d.text((10,10), title, font=FONT, fill='#201a18')
    for i,(im,label) in enumerate(items):
        x,y=i%cols*w,45+i//cols*h
        im=im.copy(); im.thumbnail((w-12,h-34),Image.Resampling.LANCZOS)
        canvas.paste(im,(x+(w-im.width)//2,y+(h-34-im.height)//2))
        d.text((x+7,y+h-28),label,font=SMALL,fill='#201a18')
    path.parent.mkdir(parents=True,exist_ok=True); canvas.save(path)

def gif_frames(path):
    im=Image.open(path); frames=[]; times=[]; durations=[]; elapsed=0
    for n in range(im.n_frames):
        im.seek(n); rgba=im.convert('RGBA'); bg=Image.new('RGBA',im.size,'white'); bg.alpha_composite(rgba)
        frames.append(bg.convert('RGB')); times.append(elapsed)
        dt=im.info.get('duration',100)/1000;durations.append(dt);elapsed+=dt
    return frames,times,durations

def gif_extract():
    inventory=[]
    for p in sorted((ROOT/'Material').glob('*.gif')):
        frames,times,durations=gif_frames(p)
        thumbs=[im.resize((96,96)).convert('RGB') for im in frames]
        diffs=[0]+[sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3 for a,b in zip(thumbs,thumbs[1:])]
        count=min(12,len(frames)); selected={0,len(frames)-1}
        # Divide temporal span, keep maximal local difference in each bin.
        for k in range(count-2):
            a=1+int(k*(len(frames)-2)/(count-2));b=1+int((k+1)*(len(frames)-2)/(count-2))
            selected.add(max(range(a,max(a+1,b)),key=lambda i:diffs[i]))
        selected=sorted(selected); name=p.stem[:8]
        sheet([(frames[n],f'f{n:03d} | {times[n]:.3f}s') for n in selected],f'{name} | {len(frames)} frames | {sum(durations):.3f}s',OUT/'gif'/f'{name}.png')
        # Survey retains every frame for analyst inspection (not final evidence).
        sheet([(im,f'f{n:03d} | {times[n]:.3f}s') for n,im in enumerate(frames)],name+' ALL FRAMES',WORK/'gif'/f'{name}.png',cols=6,cell=(220,220))
        inventory.append(dict(source=str(p.relative_to(ROOT)),path=f'gif/{name}.png',frames=len(frames),duration=round(sum(durations),3),selected=[dict(frame=n,time=round(times[n],3),difference=round(diffs[n],3)) for n in selected]))
    (OUT/'gif-index.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n')

def video_extract():
    folder=WORK/'frames';folder.mkdir(parents=True,exist_ok=True)
    if not list(folder.glob('*.jpg')):
        subprocess.run([FFMPEG,'-hide_banner','-loglevel','error','-i',str(ROOT/'Material/Usagi_Voice.mp4'),'-vf',"select=not(mod(n\\,8))",'-fps_mode','vfr','-q:v','2',str(folder/'v-%04d.jpg')],check=True)
    files=sorted(folder.glob('*.jpg'))
    # Every sampled frame also enters a small comparison, detecting shot changes.
    diffs=[];prev=None
    for i,p in enumerate(files):
        with Image.open(p) as im: thumb=im.resize((96,54)).convert('RGB')
        diff=0 if prev is None else sum(ImageStat.Stat(ImageChops.difference(thumb,prev)).mean)/3
        diffs.append(round(diff,3));prev=thumb
    (WORK/'video-diffs.json').write_text(json.dumps(diffs))
    survey=list(range(0,len(files),3))
    for page in range(math.ceil(len(survey)/24)):
        ids=survey[page*24:(page+1)*24]
        sheet([(Image.open(files[n]),f'{n*8/30:.3f}s | f{n*8}') for n in ids],f'VIDEO SURVEY {page+1}',WORK/f'video-survey-{page+1:02d}.png',cell=(320,205))
    clips=json.loads((ROOT/'assets/sounds/usagi/manifest.json').read_text())['clips']; index=[]
    for c in clips:
        ids=[i for i in range(len(files)) if c['start']<=i*8/30<c['end']]
        # Tiny clips still require 2-4 actual source frames within the interval.
        if len(ids)>=4:
            ids=[ids[round(k*(len(ids)-1)/3)] for k in range(4)]
            times=[i*8/30 for i in ids]; ims=[Image.open(files[i]).copy() for i in ids]
        else:
            nums=sorted(set(round((c['start']+(c['end']-c['start'])*k/5)*30) for k in range(1,5)))
            times=[n/30 for n in nums];ims=[exact_video(t) for t in times]
        sheet([(im,f'{t:.3f}s | f{round(t*30)}') for im,t in zip(ims,times)],f"{c['id']} | {c['start']:.3f}-{c['end']:.3f}s | {c['label']} | {'IN USE' if c['file'] else 'NULL FILE'}",OUT/'voice'/f"{c['id']}.png",cell=(320,205))
        index.append({**c,'path':f"voice/{c['id']}.png",'selected':[{'time':round(t,6),'frame':round(t*30)} for t in times]})
    (OUT/'voice-index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n')
    # Dense voice survey, each clip's own full four-frame contact sheet.
    for page in range(math.ceil(len(index)/6)):
        entries=index[page*6:(page+1)*6]
        ims=[Image.open(OUT/e['path']) for e in entries]
        sheet([(im,e['id']) for im,e in zip(ims,entries)],f'VOICE REVIEW {page+1}',WORK/f'voice-survey-{page+1:02d}.png',cols=1,cell=(1280,285))

def exact_video(time):
    raw=subprocess.check_output([FFMPEG,'-hide_banner','-loglevel','error','-ss',f'{max(0, round(time*30)/30 - 0.000001):.9f}','-i',str(ROOT/'Material/Usagi_Voice.mp4'),'-frames:v','1','-f','image2pipe','-vcodec','png','-'])
    import io
    return Image.open(io.BytesIO(raw)).convert('RGB')

def evidence():
    from observations import SCENES, FACES
    old_paths=[]
    for name in ("video-index.json", "face-index.json"):
        if (OUT/name).exists(): old_paths.extend(e["path"] for e in json.loads((OUT/name).read_text()))
    diffs=json.loads((WORK/'video-diffs.json').read_text())
    paths=sorted((WORK/'frames').glob('*.jpg'))
    scenes=[]
    for seq,(start,end,action,face,body,sound) in enumerate(SCENES,1):
        ids=[i for i in range(len(paths)) if start-1e-6<=i*8/30<end-1e-6]
        count=min(12,len(ids)); selected={ids[0],ids[-1]}
        if count>2:
            for k in range(count-2):
                group=ids[1+int(k*(len(ids)-2)/(count-2)):1+int((k+1)*(len(ids)-2)/(count-2))]
                selected.add(max(group,key=lambda i:diffs[i]))
        selected=sorted(selected)
        filename=f'video/{start:07.3f}-{end:07.3f}s.png'
        sheet([(Image.open(paths[i]),f'{i*8/30:.3f}s | f{i*8}') for i in selected],f'V{seq:02d} | {start:.3f}-{end:.3f}s',OUT/filename,cell=(320,205))
        scenes.append(dict(id=f'V{seq:02d}',start=start,end=end,path=filename,action=action,face=face,body=body,sound=sound,selected=[dict(frame=i*8,time=round(i*8/30,6)) for i in selected]))
    (OUT/'video-index.json').write_text(json.dumps(scenes,ensure_ascii=False,indent=2)+'\n')
    faces=[]; overview=[]
    gifs={p.stem[:8]:p for p in (ROOT/'Material').glob('*.gif')}
    for seq,(name,kind,source,frame,box,note) in enumerate(FACES,1):
        if kind=='gif':
            ims,times,_=gif_frames(gifs[source]); im=ims[frame]; stamp=f'{source}-f{frame:03d}';time=times[frame]
            original=str(gifs[source].relative_to(ROOT))
        else:
            time=round(source*30)/30;frame=round(source*30);im=exact_video(time);stamp=f'video-{time:07.3f}s';original='Material/Usagi_Voice.mp4'
        crop=im.crop(box);crop=crop.resize((400,round(crop.height*400/crop.width)),Image.Resampling.LANCZOS)
        filename=f'face/{name}-{stamp}.png';(OUT/'face').mkdir(exist_ok=True);crop.save(OUT/filename)
        overview.append((crop,f'F{seq:02d} | {stamp}'))
        faces.append(dict(id=f'F{seq:02d}',name=name,source=original,frame=frame,time=round(time,6),box=box,path=filename,note=note))
    sheet(overview,'USAGI FACE EVIDENCE | IDs and notes: README',OUT/'face/overview.png',cols=3,cell=(420,330))
    shutil.copyfile(ROOT/'assets/model/face/atlas_preview.png',OUT/'face/atlas_preview.png')
    (OUT/'face-index.json').write_text(json.dumps(faces,ensure_ascii=False,indent=2)+'\n')
    keep={e['path'] for e in scenes+faces}
    for old in set(old_paths)-keep:
        path=OUT/old
        if path.parent in (OUT/'video',OUT/'face') and path.suffix=='.png': path.unlink(missing_ok=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--initial',action='store_true');parser.add_argument('--evidence',action='store_true');parser.add_argument('--clean-work',action='store_true');args=parser.parse_args()
    if args.initial:
        WORK.mkdir(parents=True,exist_ok=True);gif_extract();video_extract()
    if args.evidence: evidence()
    if args.clean_work and WORK.exists(): shutil.rmtree(WORK)
