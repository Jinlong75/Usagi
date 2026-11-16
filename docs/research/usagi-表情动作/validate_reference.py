"""Check the research inventory against real source files, not motion behavior."""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from collections import Counter
import ast, hashlib, json, re, subprocess
from PIL import Image

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
def read(name): return json.loads((OUT/name).read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def check(condition, message):
    if not condition: raise AssertionError(message)

gifs=read('gif-index.json');video=read('video-index.json');voices=read('voice-index.json');faces=read('face-index.json')
manifest=json.loads((ROOT/'assets/sounds/usagi/manifest.json').read_text())['clips']
sources=sorted((ROOT/'Material').glob('*.gif'))
check(len(gifs)==len(sources)==23,'GIF count')
check({e['source'] for e in gifs}=={str(p.relative_to(ROOT)) for p in sources},'GIF bijection')
check(len({p.stem[:8] for p in sources})==23,'GIF prefix collision')
expected=set();gif_frames=0;gif_times={}
for e in gifs:
    im=Image.open(ROOT/e['source']);gif_frames+=im.n_frames
    check(im.n_frames==e['frames'],'GIF original frame count')
    times=[];elapsed=0
    for i in range(im.n_frames):
        im.seek(i);times.append(elapsed);elapsed+=im.info.get('duration',100)/1000
    gif_times[e['source']]=times
    check(abs(elapsed-e['duration'])<1e-6,'GIF loop duration')
    check(4<=len(e['selected'])<=12,'GIF selected count')
    check(e['selected'][0]['frame']==0 and e['selected'][-1]['frame']==im.n_frames-1,'GIF endpoints')
    check(len({x['frame'] for x in e['selected']})==len(e['selected']),'GIF duplicate frame')
    for x in e['selected']:check(abs(x['time']-times[x['frame']])<1e-6,'GIF frame timestamp')
    with Image.open(OUT/e['path']) as contact:check(contact.width<=1600,'GIF exceeds max width')
    expected.add(e['path'])
check(len(video)==55,'Video segment count')
for e in video:
    check(e['start']<e['end'],'Invalid scene span')
    check(e['selected'],'Scene without evidence')
    check(len({x['frame'] for x in e['selected']})==len(e['selected']),'Scene duplicate frame')
    for x in e['selected']:
        check(e['start']-1e-6<=x['time']<e['end'],'Scene sample outside span')
        check(abs(x['frame']/30-x['time'])<=1e-6,'Video frame timestamp')
        check(0<=x['frame']<5542,'Video frame outside source')
    expected.add(e['path'])
check([e['id'] for e in voices]==[e['id'] for e in manifest],'Manifest IDs/order')
for e,c in zip(voices,manifest):
    check(all(e[k]==value for k,value in c.items()),'Manifest values changed: '+c['id'])
    check(2<=len(e['selected'])<=4,'Voice evidence count')
    check(len({x['frame'] for x in e['selected']})==len(e['selected']),'Voice duplicate frame')
    for x in e['selected']:
        check(c['start']<=x['time']<c['end'],'Voice sample outside original interval: '+c['id'])
        check(abs(x['frame']/30-x['time'])<=1e-6,'Voice frame timestamp')
        check(x['frame']<5542,'Voice sample beyond video')
    expected.add(e['path'])
check(len(faces)==22,'Face count')
for e in faces:
    if e['source'].endswith('.gif'):
        check(0<=e['frame']<len(gif_times[e['source']]),'Face GIF index')
        check(abs(gif_times[e['source']][e['frame']]-e['time'])<1e-6,'Face GIF time')
        with Image.open(ROOT/e['source']) as original:width,height=original.size
    else:
        width,height=1280,720
        check(0<=e['frame']<5542 and abs(e['frame']/30-e['time'])<=1e-6,'Face video frame')
    x0,y0,x1,y1=e['box'];check(0<=x0<x1<=width and 0<=y0<y1<=height,'Face box outside source')
    with Image.open(OUT/e['path']) as crop:
        check(crop.width==400,'Face width')
        check(abs(crop.height-round((y1-y0)*400/(x1-x0)))==0,'Face aspect changed')
    expected.add(e['path'])
expected.update(['face/overview.png','face/atlas_preview.png'])
actual={str(p.relative_to(OUT)) for p in OUT.rglob('*.png') if '_work' not in p.relative_to(OUT).parts}
check(actual==expected,f'PNG inventory mismatch: missing={expected-actual}; extra={actual-expected}')
for rel in sorted(expected):
    with Image.open(OUT/rel) as im:im.verify()
check(sha(OUT/'face/atlas_preview.png')==sha(ROOT/'assets/model/face/atlas_preview.png'),'Atlas copy differs')
readme=(OUT/'README.md').read_text();links=re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',readme)
for link in links:
    if link.startswith(('https:','http:','#')): continue
    target=(OUT/link.split('#')[0]).resolve()
    check(target.is_file(),'Broken README link: '+link)
for e in gifs+video+voices+faces:check(']('+e['path']+')' in readme,'Unlinked evidence: '+e['path'])
from observations import GIFS, VOICES, SCENES, FACES
check(set(VOICES)=={c['id'] for c in manifest},'Missing manual voice observation')
check(set(GIFS)=={Path(e['source']).stem[:8] for e in gifs},'Missing manual GIF observation')
check(len(SCENES)==len(video) and len(FACES)==len(faces),'Observations/evidence mismatch')
inputs=sources+[ROOT/'Material/Usagi_Voice.mp4',ROOT/'assets/sounds/usagi/manifest.json',ROOT/'assets/model/face/atlas_preview.png',ROOT/'app/src/renderer/motion/index.ts',ROOT/'app/src/renderer/behavior/machine.ts',ROOT/'pipeline/face/layout.py',ROOT/'pipeline/face/draw_atlas.py']
counts=dict(gif_sources=len(gifs),gif_original_frames=gif_frames,gif_sheets=len(gifs),gif_frame_slots=sum(len(e['selected']) for e in gifs),video_sheets=len(video),video_frame_slots=sum(len(e['selected']) for e in video),voice_sheets=len(voices),voice_frame_slots=sum(len(e['selected']) for e in voices),voice_in_use=sum(bool(e['file']) for e in voices),voice_null=sum(e['file'] is None for e in voices),face_crops=len(faces),png_files=len(expected))
counts['sheet_frame_slots']=counts['gif_frame_slots']+counts['video_frame_slots']+counts['voice_frame_slots']
counts['with_face_frame_slots']=counts['sheet_frame_slots']+counts['face_crops']
# This is a separate, explicitly deduplicated statistic; not the sheet-frame sum.
seen_gif={(e['source'],x['frame']) for e in gifs for x in e['selected']}
seen_video={x['frame'] for e in video+voices for x in e['selected']}
for e in faces:
    (seen_gif if e['source'].endswith('.gif') else seen_video).add((e['source'],e['frame']) if e['source'].endswith('.gif') else e['frame'])
counts['unique_gif_frames_in_outputs']=len(seen_gif);counts['unique_video_frames_in_outputs']=len(seen_video)
for script in OUT.glob('*.py'): ast.parse(script.read_text(),filename=str(script))
status=subprocess.check_output(['git','-c','core.quotepath=false','status','--porcelain','-z','--untracked-files=all'],cwd=ROOT,text=True)
changed=[entry[3:] for entry in status.split('\0') if entry]
check(all(path.startswith('docs/research/usagi-表情动作/') for path in changed),'Change outside allowed_paths')
check(not (OUT/'_work').exists(),'Temporary inspection files remain: run --clean-work first')
result=dict(status='PASS',counts=counts,labels=dict(Counter(c['label'] for c in manifest)),readme_local_links_checked=len(links),source_sha256={str(p.relative_to(ROOT)):sha(p) for p in inputs},artifacts={rel:{'bytes':(OUT/rel).stat().st_size,'sha256':sha(OUT/rel)} for rel in sorted(expected)},checks=['source inventory','original GIF timings','frame counts and ranges','manifest ID/value parity including null','face bounds/aspect','all PNG decode','no stale PNG artifacts','README local links and complete evidence links','byte-identical atlas copy','manual observation coverage','Python syntax','git allowed_paths scope','temporary artifacts removed'],changed_paths=changed)
(OUT/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'PASS','counts':counts,'labels':result['labels'],'readme_links_checked':len(links)},ensure_ascii=False,indent=2))
