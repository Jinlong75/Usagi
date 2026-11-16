#!/usr/bin/env python3
"""Usagi 叫声切片：分析停顿、生成中点截图，再按人工标注导出。

用法（在仓库根目录，依赖 numpy、Pillow、imageio-ffmpeg）：
  python tools/audio/split_voice.py analyze --work-dir /tmp/usagi-audio-review
  python tools/audio/split_voice.py export --work-dir /tmp/usagi-audio-review

analyze 只把候选表、单声道 WAV 和截图写进仓库外的 work-dir。
人工逐段复核后把边界、字幕、标签和排除原因保存在 annotations.json；
export 使用该标注重建音频及 manifest，不把自动候选误当成已识别语音。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'Material/Usagi_Voice.mp4'
SAMPLE_RATE = 44100
DEFAULTS = dict(threshold_db=-25.0, min_silence=0.16, min_duration=0.2,
                max_duration=3.0, padding=0.05)


def run(ffmpeg, *args):
    return subprocess.run([ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error',
                           *map(str, args)], check=True, capture_output=True, text=True)


def decode(ffmpeg, source, work):
    target = work / 'source.wav'
    run(ffmpeg, '-y', '-i', source, '-vn', '-ac', 1, '-ar', SAMPLE_RATE,
        '-c:a', 'pcm_s16le', target)
    with wave.open(str(target)) as reader:
        return np.frombuffer(reader.readframes(reader.getnframes()), dtype='<i2').astype(np.float64) / 32768


def detect(samples, *, threshold_db, min_silence, min_duration, max_duration, padding):
    """10ms RMS 包络，合并短停顿，过长区间在尾部的局部能量谷分开。"""
    hop = SAMPLE_RATE // 100
    padded = np.pad(samples, (0, (-len(samples)) % hop))
    envelope = np.sqrt(np.mean(padded.reshape(-1, hop) ** 2, axis=1))
    active = np.flatnonzero(envelope >= 10 ** (threshold_db / 20))
    if not len(active):
        return []
    groups = np.split(active, np.flatnonzero(np.diff(active) * 0.01 >= min_silence) + 1)
    intervals = []
    for group in groups:
        start, end = int(group[0]), int(group[-1]) + 1
        # 背景音乐可能跨过几次叫声；候选拆分须人工复核，不能直接导出。
        while (end - start) * 0.01 + 2 * padding > max_duration:
            limit = start + int((max_duration - 2 * padding) / 0.01)
            search_start = max(start + int(min_duration / 0.01), limit - 100)
            cut = search_start + int(np.argmin(envelope[search_start:limit + 1]))
            intervals.append((start, cut))
            start = cut
        intervals.append((start, end))
    result = []
    for start, end in intervals:
        a, b = max(0, start * 0.01 - padding), min(len(samples) / SAMPLE_RATE, end * 0.01 + padding)
        if b - a >= min_duration:
            result.append(dict(candidate=f'c{len(result)+1:03d}', start=round(a, 3), end=round(b, 3)))
    return result


def frames(ffmpeg, source, clips, work):
    """每个最终区间或候选的中点截帧，另建联络表便于逐段人工看字幕。"""
    from PIL import Image, ImageDraw
    destination = work / 'frames'
    destination.mkdir(exist_ok=True)
    for clip in clips:
        key = clip.get('id', clip.get('candidate'))
        midpoint = (clip['start'] + clip['end']) / 2
        run(ffmpeg, '-y', '-ss', f'{midpoint:.6f}', '-i', source, '-frames:v', 1,
            '-vf', 'scale=640:-1', destination / f'{key}.jpg')
    for offset in range(0, len(clips), 12):
        sheet = Image.new('RGB', (1280, 6 * 390), 'white')
        draw = ImageDraw.Draw(sheet)
        for index, clip in enumerate(clips[offset:offset+12]):
            key = clip.get('id', clip.get('candidate'))
            x, y = (index % 2) * 640, (index // 2) * 390
            with Image.open(destination / f'{key}.jpg') as frame:
                sheet.paste(frame, (x, y))
            draw.text((x+5, y+365), f'{key}: {clip["start"]:.2f}-{clip["end"]:.2f}s', fill='black')
        sheet.save(work / f'sheet_{offset//12:02d}.jpg', quality=92)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def write_readme(output, manifest, annotations):
    from collections import Counter
    clips = manifest['clips']
    counts = Counter(c['label'] for c in clips)
    qualities = Counter(c['quality'] for c in clips)
    usable = [c for c in clips if c['file']]
    size = sum((output / c['file']).stat().st_size for c in usable)
    lines = [
        '# Usagi 叫声音效', '',
        '素材来自《Chiikawa》，仅供个人使用；角色、画面、配音与音乐的权利归原权利人。不得将本目录用于公开发布或商业发行。', '',
        f'源文件：`{SOURCE}`（184.81 秒）。共 {len(clips)} 个已复核区间，导出 {len(usable)} 段，'
        f'排除 {qualities["mixed"]} 段；OGG 合计 {size:,} 字节（上限 3,000,000 字节）。', '',
        '标签计数：' + '、'.join(f'{label} {counts[label]}' for label in ('yaha','ura','ha','pururu','other')) + '。',
        '其中可用音频：' + '、'.join(f'{label} {sum(c["label"] == label for c in usable)}' for label in ('yaha','ura','ha','pururu','other')) + '。',
        '质量计数：' + '、'.join(f'{q} {qualities[q]}' for q in ('clean','bgm','mixed')) + '。', '',
        '## 切段与标注', '',
        '音轨先解码成单声道 44.1 kHz PCM WAV，使用 10ms RMS 能量包络。默认参数：', '',
        '| 参数 | 默认值 |', '| --- | --- |',
        *[f'| `--{key.replace("_","-")}` | {value} |' for key,value in annotations['parameters'].items()], '',
        '阈值单位 dBFS，其余单位秒。短停顿合并；超过最长时长的自动候选在能量低谷拆分。'
        '背景音乐会跨越停顿，因此候选只是起点，最终边界以 `tools/audio/annotations.json` 的人工复核记录为准。'
        '一般在语音前后保留 50ms；紧邻其他角色或剪辑点时按记录收紧，防止串入下一声。', '',
        '每段在最终区间中点截帧；有中日字幕时按字幕标注，无明确叫声字幕时置信度为 `low`。'
        '画面动作、角色口型和能量包络只作辅助。未进行自动语音识别或声源分离；'
        '无法单独确认的对白、音乐转场、拟音或其他角色重叠统一记为 `mixed`，`file: null`，不导出。'
        '本次无法直接进行听感复核，低置信度和背景音乐条目仍需主导抽听；具体不确定性写在每条 note 中。', '',
        '## 导出规格', '',
        'Vorbis / OGG，单声道 44.1 kHz，质量参数 4，Chromium 支持。'
        '先施加 10ms 淡入和 30ms 淡出，再用 FFmpeg loudnorm 两遍测量/归一化到 -16 LUFS、LRA 11。'
        '少数短片段的瞬态会阻止 loudnorm 达到目标；此时先用 1ms 前视、30ms 释放的限幅器'
        '把峰值控制在原始积分响度以上 12dB，再重新测量并归一化（保留淡入淡出）。'
        '为编码留余量，loudnorm 真峰值目标为 -2 dBTP；解码 OGG 后检查采样峰值，'
        '如超过 -1 dBFS 则降低增益重编码，直到峰值满足要求。短叫声的主观响度仍可能略有差异。', '',
        '## 重建', '',
        '在仓库根目录运行；依赖和 WAV、帧图、响度测量均放在仓库外。Python 3.12+：', '',
        '```sh',
        'python3 -m venv /tmp/usagi-audio-venv',
        '/tmp/usagi-audio-venv/bin/pip install -r tools/audio/requirements.txt',
        '/tmp/usagi-audio-venv/bin/python tools/audio/split_voice.py analyze --work-dir /tmp/usagi-audio-review',
        '# 查看 /tmp/usagi-audio-review/frames/ 与 sheet_*.jpg；最终复核记录已随库保存。',
        '/tmp/usagi-audio-venv/bin/python tools/audio/split_voice.py export --work-dir /tmp/usagi-audio-export',
        'python3 tools/audio/check_manifest.py assets/sounds/usagi/manifest.json', '```', '',
        '可通过 `--source`、`--annotations`、`--output` 指定路径，或用 `--ffmpeg` 指定外部 FFmpeg；'
        '默认采用 imageio-ffmpeg 的二进制。源文件 SHA-256 必须匹配标注，防止时间戳错用到另一版素材。'
        '重新导出前若存在本次清单以外的 OGG 会停止，不会静默删除其他素材。'
        '中点截图由 export 同样生成，所有证据留在 work-dir；不提交中间 WAV 或截图。', '',
        '## 使用约定与待核对项', '',
        '三种 `click_*` 只分配给对应标签的可用片段；`idle_talk` / `chat_reply` 用于已导出的口癖。'
        '`uses` 是素材适用性，不是播放开关；首版只在确认点击后播放，音量 0.7，拖动不播（D7）。', '',
        *annotations['review_notes'], '',
        '## 全部片段', '',
        '| id | 标签 | 文字 | 时长(秒) | 质量 | 置信度 | 用途 | 备注 |',
        '| --- | --- | --- | ---: | --- | --- | --- | --- |',
    ]
    for clip in clips:
        fields = [clip['id'], clip['label'], clip['text'], f'{clip["duration"]:.3f}',
                  clip['quality'], clip['confidence'], ', '.join(clip['uses']) or '—', clip['note'] or '—']
        lines.append('| ' + ' | '.join(str(v).replace('|','／').replace('\n',' ') for v in fields) + ' |')
    (output / 'README.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def normalize(ffmpeg, source, clip, destination, work):
    duration = clip['end'] - clip['start']
    base = f'afade=t=in:d=0.01,afade=t=out:st={max(0,duration-0.03):.6f}:d=0.03'
    args = ['-ss', f'{clip["start"]:.6f}', '-t', f'{duration:.6f}', '-i', source,
            '-vn', '-ac', 1, '-ar', SAMPLE_RATE]
    def measure(filters):
        result = subprocess.run([ffmpeg, '-nostdin', '-hide_banner', *map(str,args), '-af',
                                 filters + ',loudnorm=I=-16:TP=-2:LRA=11:print_format=json', '-f','null','-'],
                                check=True, capture_output=True, text=True)
        return json.loads(result.stderr[result.stderr.rfind('{'):result.stderr.rfind('}')+1])

    stats = measure(base)
    limiter_db = None
    if float(stats['input_tp']) - float(stats['input_i']) > 14:
        # 小于三秒的片段会退回线性响度调整；先削掉孤立瞬态，避免峰值门限令整体过轻。
        limiter_db = float(stats['input_i']) + 12
        limit = min(1.0, max(0.0625, 10 ** (limiter_db / 20)))
        base = f'alimiter=limit={limit:.8f}:attack=1:release=30:level=false:latency=true,{base}'
        stats = measure(base)
    (work / f'{clip["id"]}_loudness.json').write_text(json.dumps(stats, indent=2)+'\n')
    if not all(math.isfinite(float(stats[k])) for k in ('input_i','input_tp','input_lra','input_thresh','target_offset')):
        raise ValueError(f'{clip["id"]}: 非有限响度值，不能导出静音或过短片段')
    normalizer = (f'loudnorm=I=-16:TP=-2:LRA=11:measured_I={stats["input_i"]}:'
                  f'measured_TP={stats["input_tp"]}:measured_LRA={stats["input_lra"]}:'
                  f'measured_thresh={stats["input_thresh"]}:offset={stats["target_offset"]}:'
                  'linear=true')
    gain = 0.0
    for _ in range(4):
        # 输出先写临时目录，峰值合格后再替换目标文件。
        encoded = work / f'{clip["id"]}.ogg'
        run(ffmpeg, '-y', *args, '-af', f'{base},{normalizer},volume={gain:.6f}dB',
            '-ar', SAMPLE_RATE, '-c:a', 'libvorbis', '-q:a', 4, encoded)
        pcm = subprocess.run([ffmpeg,'-nostdin','-v','error','-i',str(encoded),'-f','f32le',
                              '-acodec','pcm_f32le','-'],check=True,capture_output=True).stdout
        samples = np.frombuffer(pcm,dtype='<f4')
        peak = float(np.max(np.abs(samples)))
        if peak <= 10 ** (-1 / 20):
            destination.write_bytes(encoded.read_bytes())
            return dict(id=clip['id'], decodedPeakDbfs=round(20*math.log10(max(peak,1e-12)),3),
                        attenuationDb=round(gain,3), limiterThresholdDbfs=limiter_db, **stats)
        gain -= 20 * math.log10(peak / (10 ** (-1 / 20))) + 0.15
    raise ValueError(f'{clip["id"]}: 编码后峰值无法满足 -1 dBFS')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['analyze','export'])
    parser.add_argument('--source', type=Path, default=ROOT / SOURCE)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--annotations', type=Path, default=ROOT/'tools/audio/annotations.json')
    parser.add_argument('--output', type=Path, default=ROOT/'assets/sounds/usagi')
    parser.add_argument('--ffmpeg')
    for name,default in DEFAULTS.items():
        parser.add_argument('--'+name.replace('_','-'), type=float, default=default)
    args = parser.parse_args()
    params = {key:getattr(args,key) for key in DEFAULTS}
    if (not all(math.isfinite(v) for v in params.values()) or args.min_silence <= 0 or args.min_duration <= 0
            or args.padding < 0 or args.max_duration <= args.min_duration + 2*args.padding):
        parser.error('切段参数必须为有限数，且 0 < min-duration < max-duration - 2*padding')
    work = args.work_dir.resolve()
    if work.is_relative_to(ROOT):
        parser.error('work-dir 必须位于仓库外，避免提交中间 WAV 和帧图')
    work.mkdir(parents=True, exist_ok=True)
    ffmpeg = args.ffmpeg
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    if args.command == 'analyze':
        samples = decode(ffmpeg, args.source, work)
        clips = detect(samples, **params)
        write_json(work/'candidates.json',dict(parameters=params,clips=clips))
        frames(ffmpeg,args.source,clips,work)
        print(f'{len(clips)} 个候选，人工复核入口：{work}/candidates.json 和 sheet_*.jpg')
        return
    annotations = json.loads(args.annotations.read_text(encoding='utf-8'))
    # TODO(lead): 标注仅完成字幕/画面复核，仍需抽听；click_surprise 还缺第二段明确问句。
    digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
    if digest != annotations['sourceSha256']:
        raise ValueError('源文件 SHA-256 与人工标注不匹配，停止重建')
    clips = annotations['clips']
    manifest = dict(source=SOURCE,generatedBy='tools/audio/split_voice.py',clips=clips)
    from check_manifest import validate
    problems,_ = validate(manifest, args.output, check_files=False)
    if problems:
        raise ValueError('\n'.join(problems))
    args.output.mkdir(parents=True,exist_ok=True)
    wanted = {c['file'] for c in clips if c['file']}
    extras = {p.name for p in args.output.glob('*.ogg')} - wanted
    if extras:
        raise ValueError(f'输出目录存在未列入清单的 OGG，请人工确认：{sorted(extras)}')
    # 确保测量与导出使用已下混的单声道信号，避免按立体声响度归一化后再下混。
    decode(ffmpeg,args.source,work)
    frames(ffmpeg,args.source,clips,work)
    measurements = []
    for clip in clips:
        if clip['file']:
            measurements.append(normalize(ffmpeg,work/'source.wav',clip,args.output/clip['file'],work))
    write_json(work/'normalization.json',measurements)
    write_json(args.output/'manifest.json',manifest)
    write_readme(args.output,manifest,annotations)
    problems,warnings = validate(manifest,args.output)
    for warning in warnings:
        print('WARNING:',warning)
    if problems:
        raise ValueError('\n'.join(problems))
    print(f'已导出 {len(measurements)} 段，manifest 与 README 已生成；响度记录：{work}/normalization.json')


if __name__ == '__main__':
    main()
