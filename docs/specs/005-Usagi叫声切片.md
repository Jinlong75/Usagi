---
id: 005
title: 从 Usagi_Voice.mp4 切出带标签的叫声音效
type: chore
worker: codex
effort: high
allowed_paths:
  - assets/sounds/**
  - tools/audio/**
verify:
  - test -f assets/sounds/usagi/manifest.json && test -f assets/sounds/usagi/README.md
  - python3 tools/audio/check_manifest.py assets/sounds/usagi/manifest.json
expect_commit: true
verify_timeout_min: 5
---

## 目标

把 `Material/Usagi_Voice.mp4`（约 185 秒、1280×720、AAC 立体声 44.1kHz，Usagi 叫声合集）切成一个个干净的短音效，每段带标签（呀哈 / 乌拉 / 哈？ / 噗噜噜 / 其他），统一响度，放到 `assets/sounds/usagi/`，并写一份 `manifest.json` 供桌宠程序按反应类型取用（点击开心、惊讶、大喊、自言自语等）。

## 范围 / 不做什么

- 做：提取音频、按停顿切段、截画面帧辅助识别、打标签、裁静音、淡入淡出、响度统一、导出、manifest、检查脚本、README。
- 不做：改 `Material/` 下任何文件；不做语音合成；不接入桌宠程序（后续任务做）。
- 工具装在仓库外（例如 `/tmp/usagi-audio-venv` 的 Python 虚拟环境，`imageio-ffmpeg` 自带 ffmpeg 二进制；或 macOS 自带 `afconvert` 转 wav）。不要把虚拟环境、ffmpeg 二进制、中间 wav 放进仓库。

## 参照

- 目标与功能分级：`.agent-router/target.md`（D7 首版：点击 3 种反应——开心"呀哈"、惊讶"哈？"、大喊"乌拉"；自言自语用 Usagi 口癖；叫声确认点击后才播、音量 0.7）。
- 视频画面可能有烧录字幕（中文或日文），可以用来识别每声叫的是什么；你有 `view_image`，可以看截出来的帧。

## 要求

1. **切段**：`tools/audio/split_voice.py`（中文文件头说明用法）。把音轨转成单声道 44.1kHz wav，按能量包络找出每一声（静音阈值、最短静音间隔、最短/最长片段长度做成参数，默认值自己调到合理并写进 README）；每段前后留 50ms，片段长度一般 0.2～3 秒。
2. **识别与打标签**：
   - 每段在其中点时间截一帧画面（`tools/audio/` 的脚本负责），你用 `view_image` 看字幕和画面判断 Usagi 喊的是什么；有字幕以字幕为准，没有字幕就按听感特征和前后文判断，并把置信度标成 `low`。
   - `label` 取值：`yaha`（呀哈 / ヤハ）、`ura`（乌拉 / ウラ）、`ha`（哈？/ ハァ？）、`pururu`（噗噜噜 / プルルル）、`other`（其他叫声，`text` 写出听到/看到的内容）。
   - `quality`：`clean`（只有 Usagi 的声音）、`bgm`（有背景音乐但 Usagi 声音清楚）、`mixed`（有别的角色说话、音效重叠）。`mixed` 的片段**不导出音频**，只在 manifest 里记录（`file: null`），原因写进 `note`。
3. **导出**：保留下来的片段做 10ms 淡入、30ms 淡出，响度统一到约 -16 LUFS（做不到精确 LUFS 就用 RMS 归一化并在 README 说明），峰值不超过 -1 dBFS；导出为 `.ogg`（Opus 或 Vorbis，Chromium 能播），文件名 `<label>_<两位序号>.ogg`，放 `assets/sounds/usagi/`。总大小控制在 3MB 以内。
4. **manifest.json**：
   ```json
   {
     "source": "Material/Usagi_Voice.mp4",
     "generatedBy": "tools/audio/split_voice.py",
     "clips": [
       {"id": "yaha_01", "file": "yaha_01.ogg", "label": "yaha", "text": "呀哈！", "start": 12.34, "end": 12.98,
        "duration": 0.64, "quality": "clean", "confidence": "high", "uses": ["click_happy", "idle_talk"], "note": ""}
     ]
   }
   ```
   `uses` 取值：`click_happy`（开心，优先 yaha）、`click_surprise`（惊讶，优先 ha）、`click_shout`（大喊，优先 ura）、`idle_talk`（自言自语时偶尔出声）、`drag`（被拎起）、`chat_reply`（聊天回复时出声）。每个 `click_*` 至少 2 段可用音频；实在没有就在 README 和汇报里写明缺哪一类，留 `TODO(lead)`。
5. **检查脚本** `tools/audio/check_manifest.py`（只用 Python 标准库）：校验 manifest 字段齐全、`label`/`quality`/`uses` 取值合法、`file` 非空时文件存在且大小 > 0、`duration` 与 `end-start` 误差 < 0.05、总大小 ≤ 3MB、三类 `click_*` 各至少 2 段（不足时打印警告但不失败，退出码仍为 0；字段或文件问题退出码 1）。
6. **README.md**（`assets/sounds/usagi/`）：一张表列出全部片段（id、标签、文字、时长、质量、置信度、用途），切段参数，重建方法，版权说明（素材来自《Chiikawa》，仅个人使用）。

## 验收标准

- verify 两条通过。
- 主导会抽听几段（用 `afplay`），核对标签是否对、有没有切掉半个字、有没有别的角色声音。

## 自测

跑 `python3 tools/audio/check_manifest.py assets/sounds/usagi/manifest.json`；抽几段导出结果用 `afinfo` 看时长与格式。

## 受影响的已有测试

无（新增素材与脚本）。搜过的关键词：sounds、audio、Usagi_Voice。

## 换环境

无（工具装在仓库外临时虚拟环境，README 写明重建命令）。

## 汇报要回答的问题

1. 视频里有没有字幕？标签主要靠什么判断的？`low` 置信度的有几段？
2. 一共切出多少段，各标签多少段，`clean` / `bgm` / `mixed` 各多少段。
3. 视频画面里有没有 Usagi 的全身侧面或背面镜头（对后面核对 3D 造型有用）？有的话写出时间点。
