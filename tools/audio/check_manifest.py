#!/usr/bin/env python3
"""仅用 Python 标准库校验 Usagi 音效清单：python3 tools/audio/check_manifest.py MANIFEST。"""
from __future__ import annotations

from collections import Counter
import json
import math
from pathlib import Path
import re
import sys

LABELS = {'yaha', 'ura', 'ha', 'pururu', 'other'}
QUALITIES = {'clean', 'bgm', 'mixed'}
CONFIDENCES = {'high', 'low'}
USES = {'click_happy', 'click_surprise', 'click_shout', 'idle_talk', 'drag', 'chat_reply'}
CLICK_USES = ('click_happy', 'click_surprise', 'click_shout')
REQUIRED = {'id', 'file', 'label', 'text', 'start', 'end', 'duration',
            'quality', 'confidence', 'uses', 'note'}
MAX_BYTES = 3_000_000


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate(data, directory, *, check_files=True):
    """返回 (错误列表, 警告列表)，供命令行与重建脚本共用。"""
    errors, warnings = [], []
    directory = Path(directory)
    if not isinstance(data, dict):
        return ['manifest 必须是 JSON 对象'], warnings
    for key in ('source', 'generatedBy'):
        if not isinstance(data.get(key), str) or not data[key].strip():
            errors.append(f'{key}: 必须为非空字符串')
    clips = data.get('clips')
    if not isinstance(clips, list):
        return errors + ['clips 必须为数组'], warnings
    ids, files, counts = set(), set(), Counter()
    for index, clip in enumerate(clips):
        at = f'clips[{index}]'
        if not isinstance(clip, dict):
            errors.append(f'{at}: 必须为对象')
            continue
        missing = REQUIRED - clip.keys()
        if missing:
            errors.append(f'{at}: 缺少字段 {sorted(missing)}')
        label, quality = clip.get('label'), clip.get('quality')
        for key, choices in [('label', LABELS), ('quality', QUALITIES), ('confidence', CONFIDENCES)]:
            if not isinstance(clip.get(key), str) or clip[key] not in choices:
                errors.append(f'{at}.{key}: 非法取值 {clip.get(key)!r}')
        key = clip.get('id')
        if not isinstance(key, str) or not re.fullmatch(r'(yaha|ura|ha|pururu|other)_[0-9]{2}',key):
            errors.append(f'{at}.id: 应为 <label>_<两位序号>')
        elif not key.startswith(str(label)+'_'):
            errors.append(f'{at}.id: 与 label 不符')
        elif key in ids:
            errors.append(f'{at}.id: 重复 {key}')
        else:
            ids.add(key)
        for field in ('text','note'):
            if not isinstance(clip.get(field), str) or (field == 'text' and not clip[field].strip()):
                errors.append(f'{at}.{field}: 必须为字符串，text 不得为空')
        if all(number(clip.get(field)) for field in ('start','end','duration')):
            if clip['start'] < 0 or clip['end'] <= clip['start'] or clip['duration'] <= 0:
                errors.append(f'{at}: 起止时间或时长非法')
            if abs(clip['duration'] - (clip['end']-clip['start'])) >= 0.05:
                errors.append(f'{at}: duration 与 end-start 误差必须 < 0.05 秒')
        else:
            errors.append(f'{at}: start/end/duration 必须为有限数字')
        uses = clip.get('uses')
        if not isinstance(uses, list) or any(not isinstance(use,str) or use not in USES for use in uses):
            errors.append(f'{at}.uses: 必须为合法用途数组')
            uses = []
        elif len(uses) != len(set(uses)):
            errors.append(f'{at}.uses: 用途重复')
        filename = clip.get('file')
        if quality == 'mixed':
            if filename is not None:
                errors.append(f'{at}: mixed 必须 file: null')
            if not isinstance(clip.get('note'), str) or not clip['note'].strip():
                errors.append(f'{at}: mixed 必须在 note 解释排除原因')
            if uses:
                errors.append(f'{at}: mixed 不可分配播放用途')
        elif quality in ('clean','bgm') and filename is None:
            errors.append(f'{at}: clean/bgm 必须指向已导出的音频')
        if filename is None:
            continue
        if (not isinstance(filename,str) or not isinstance(key,str)
                or filename != key+'.ogg' or Path(filename).name != filename):
            errors.append(f'{at}.file: 必须为与 id 相同的平铺 OGG 文件名')
            continue
        if filename in files:
            errors.append(f'{at}.file: 重复 {filename}')
        files.add(filename)
        valid_file = True
        if check_files:
            path = directory / filename
            try:
                if not path.is_file() or path.is_symlink() or path.stat().st_size <= 0:
                    errors.append(f'{at}.file: 文件不存在、为空或为符号链接：{filename}')
                    valid_file = False
            except OSError as exc:
                errors.append(f'{at}.file: 无法读取 {filename}: {exc}')
                valid_file = False
        if valid_file and quality in ('clean','bgm'):
            counts.update(uses)
    if check_files:
        try:
            # 把目录里遗留的 OGG 也计入大小，防止只计清单而漏算产物。
            paths = list(directory.glob('*.ogg'))
            extras = {p.name for p in paths} - files
            if extras:
                errors.append(f'存在清单外 OGG：{sorted(extras)}')
            total = sum(p.stat().st_size for p in paths if p.is_file())
            if total > MAX_BYTES:
                errors.append(f'音频总大小 {total} 字节，超过 {MAX_BYTES}')
        except OSError as exc:
            errors.append(f'无法统计音频大小：{exc}')
    for use in CLICK_USES:
        if counts[use] < 2:
            warnings.append(f'{use} 只有 {counts[use]} 段可用音频，至少需要 2 段；请在 README 留 TODO(lead)')
    return errors, warnings


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print('用法：python3 tools/audio/check_manifest.py MANIFEST', file=sys.stderr)
        return 1
    path = Path(args[0])
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        errors,warnings = validate(data,path.parent)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f'ERROR: {exc}',file=sys.stderr)
        return 1
    for warning in warnings:
        print('WARNING:',warning)
    for error in errors:
        print('ERROR:',error,file=sys.stderr)
    if errors:
        return 1
    print(f'OK: {len(data["clips"])} 段，字段、文件、时长、大小校验通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
