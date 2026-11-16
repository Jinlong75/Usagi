# Usagi 叫声音效

素材来自《Chiikawa》，仅供个人使用；角色、画面、配音与音乐的权利归原权利人。不得将本目录用于公开发布或商业发行。

源文件：`Material/Usagi_Voice.mp4`（184.81 秒）。共 86 个已复核区间，导出 20 段，排除 66 段；OGG 合计 436,396 字节（上限 3,000,000 字节）。

标签计数：yaha 6、ura 4、ha 1、pururu 1、other 74。
其中可用音频：yaha 5、ura 4、ha 1、pururu 1、other 9。
质量计数：clean 0、bgm 20、mixed 66。

## 切段与标注

音轨先解码成单声道 44.1 kHz PCM WAV，使用 10ms RMS 能量包络。默认参数：

| 参数 | 默认值 |
| --- | --- |
| `--threshold-db` | -25.0 |
| `--min-silence` | 0.16 |
| `--min-duration` | 0.2 |
| `--max-duration` | 3.0 |
| `--padding` | 0.05 |

阈值单位 dBFS，其余单位秒。短停顿合并；超过最长时长的自动候选在能量低谷拆分。背景音乐会跨越停顿，因此候选只是起点，最终边界以 `tools/audio/annotations.json` 的人工复核记录为准。一般在语音前后保留 50ms；紧邻其他角色或剪辑点时按记录收紧，防止串入下一声。

每段在最终区间中点截帧；有中日字幕时按字幕标注，无明确叫声字幕时置信度为 `low`。画面动作、角色口型和能量包络只作辅助。未进行自动语音识别或声源分离；无法单独确认的对白、音乐转场、拟音或其他角色重叠统一记为 `mixed`，`file: null`，不导出。本次无法直接进行听感复核，低置信度和背景音乐条目仍需主导抽听；具体不确定性写在每条 note 中。

## 导出规格

Vorbis / OGG，单声道 44.1 kHz，质量参数 4，Chromium 支持。先施加 10ms 淡入和 30ms 淡出，再用 FFmpeg loudnorm 两遍测量/归一化到 -16 LUFS、LRA 11。少数短片段的瞬态会阻止 loudnorm 达到目标；此时先用 1ms 前视、30ms 释放的限幅器把峰值控制在原始积分响度以上 12dB，再重新测量并归一化（保留淡入淡出）。为编码留余量，loudnorm 真峰值目标为 -2 dBTP；解码 OGG 后检查采样峰值，如超过 -1 dBFS 则降低增益重编码，直到峰值满足要求。短叫声的主观响度仍可能略有差异。

## 重建

在仓库根目录运行；依赖和 WAV、帧图、响度测量均放在仓库外。Python 3.12+：

```sh
python3 -m venv /tmp/usagi-audio-venv
/tmp/usagi-audio-venv/bin/pip install -r tools/audio/requirements.txt
/tmp/usagi-audio-venv/bin/python tools/audio/split_voice.py analyze --work-dir /tmp/usagi-audio-review
# 查看 /tmp/usagi-audio-review/frames/ 与 sheet_*.jpg；最终复核记录已随库保存。
/tmp/usagi-audio-venv/bin/python tools/audio/split_voice.py export --work-dir /tmp/usagi-audio-export
python3 tools/audio/check_manifest.py assets/sounds/usagi/manifest.json
```

可通过 `--source`、`--annotations`、`--output` 指定路径，或用 `--ffmpeg` 指定外部 FFmpeg；默认采用 imageio-ffmpeg 的二进制。源文件 SHA-256 必须匹配标注，防止时间戳错用到另一版素材。重新导出前若存在本次清单以外的 OGG 会停止，不会静默删除其他素材。中点截图由 export 同样生成，所有证据留在 work-dir；不提交中间 WAV 或截图。

## 使用约定与待核对项

三种 `click_*` 只分配给对应标签的可用片段；`idle_talk` / `chat_reply` 用于已导出的口癖。`uses` 是素材适用性，不是播放开关；首版只在确认点击后播放，音量 0.7，拖动不播（D7）。

- TODO(lead): `click_surprise` 只有 1 段明确的「哈？」（ha_01，157.03–157.44 秒），缺 1 段；请补素材或决定是否接受单段。未复制音频或把唱词中的ハ凑数。
- TODO(lead): 当前工具不能直接听音。标签高置信度来自字幕，并不代表已做听感质检；请优先抽听五类已导出音频及连接边界。未明确支持的区间保守排除，不能把 mixed 记录当可播放素材。
- 所有导出片段保守归 `bgm`；本次未确认纯人声，不宣称 `clean` 或消除了配乐。低置信度条目均为未导出的混合/待核对区间。
- 末段 `other_74` 是一整组 4.227 秒连声，唯一超过 3 秒的可用片段；为避免切掉半个词保留整组，只分配 idle_talk/chat_reply。TODO(lead): 抽听后决定是否进一步收短。
- 造型参考画面：64.0 秒、103.5 秒为全身背面（含尾巴）；40.5 秒、174.5 秒为全身侧向/四分之三视角。18.5–23.5 秒还有旋转背面，但存在光束遮挡与动作变形。所有截图可在外部临时目录按对应时间重取。

## 全部片段

| id | 标签 | 文字 | 时长(秒) | 质量 | 置信度 | 用途 | 备注 |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| other_01 | other | 张口短叫（无字幕，文字待听审） | 2.680 | mixed | low | — | 无字幕；张口特写中的叫声、配乐/拟音边界未能区分，保守排除。 |
| other_02 | other | 摆臂短叫（无字幕，文字待听审） | 2.240 | mixed | low | — | 无字幕；与吉伊同场，配乐连成有声区，无法确认独立 Usagi 声音，保守排除。 |
| other_03 | other | 摆臂连叫（无字幕，文字待听审） | 2.990 | mixed | low | — | 无字幕；吉伊同时张口，无法排除另一角色及配乐重叠。 |
| other_04 | other | 摆臂收尾（无字幕，文字待听审） | 1.600 | mixed | low | — | 无字幕；同场角色与音乐区间，不能确认完整独立叫声。 |
| other_05 | other | 骑鱼张口叫（无字幕，文字待听审） | 2.970 | mixed | low | — | 无字幕；吉伊与 Usagi 同时张口，另有飞鱼场景拟音，保守排除。 |
| other_06 | other | 骑鱼连叫（无字幕，文字待听审） | 2.240 | mixed | low | — | 无字幕；吉伊与 Usagi 同时张口，无法排除重叠角色声音。 |
| other_07 | other | 骑鱼转身（无字幕，文字待听审） | 2.210 | mixed | low | — | 无字幕；鱼转向的拟音/音乐和叫声边界无法区分。 |
| other_08 | other | 骑鱼转场（无字幕，文字待听审） | 1.140 | mixed | low | — | 无字幕；音乐转场与飞行拟音区间，不能确认独立叫声。 |
| other_09 | other | 保佑我能买到相机 | 3.000 | mixed | high | — | 字幕为其他角色的祈愿对白；与旋转光束拟音/音乐同段，不导出。 |
| other_10 | other | 保佑我能买到相机（续） | 2.380 | mixed | high | — | 其他角色祈愿对白及旋转光束拟音，不是独立 Usagi 口癖。 |
| other_11 | other | 旋转光束（无叫声字幕） | 1.630 | mixed | low | — | 多人在场及光束拟音；不能确认独立 Usagi 叫声。 |
| other_12 | other | 啊 怎么回事 什么从两端喷出来了 | 2.130 | mixed | high | — | 小八对白与喷烟音效重叠，不导出。 |
| other_13 | other | 喷烟/跳跃（无叫声字幕） | 2.790 | mixed | low | — | 棍棒喷烟与跳跃拟音区间；不能分离 Usagi 声音。 |
| other_14 | other | 跳跃/片尾（无叫声字幕） | 2.230 | mixed | low | — | 跳跃和片尾音效重叠，保守排除。 |
| other_15 | other | 林间转场（无叫声字幕） | 0.360 | mixed | low | — | 转场音乐/拟音，无明确独立 Usagi 声音证据。 |
| other_16 | other | 那个啊 我们考了除草5级 | 2.540 | mixed | high | — | 小八对白，不导出；合并同一句话的停顿。 |
| other_17 | other | 举证件（无叫声字幕） | 1.330 | mixed | low | — | 证件展示前的音效/音乐，不能确认单独叫声；后面的呀哈另切。 |
| yaha_01 | yaha | 呀哈！ | 1.210 | bgm | high | click_happy, idle_talk, chat_reply | 字幕「呀哈 / ヤハ」；前后边界按较低能量尾音扩至 38.25–39.46 秒。 |
| other_18 | other | 好厉害 | 1.040 | mixed | high | — | 小八/吉伊的惊叹对白，不导出。 |
| other_19 | other | 乌噜噜噜噜……（ウルルル……） | 2.500 | bgm | high | idle_talk, chat_reply | 字幕为ウルルル连声，起首不是プ；归 other，不冒充 pururu。 |
| other_20 | other | 乌乌乌哇哇哈哈哈啊啊啊…… | 2.860 | bgm | high | idle_talk, chat_reply | 字幕为多音节连声，不是单次ウラ；在跳跃镜头切换处结束，供 idle_talk；尚需抽听尾字。 |
| other_21 | other | 树上跃下（无叫声字幕） | 1.390 | mixed | low | — | 跃下拟音与长叫尾声/音乐同段，自动边界不能保证完整音节，不导出。 |
| other_22 | other | 落地转身（无叫声字幕） | 1.370 | mixed | low | — | 落地拟音/音乐区间，没有独立口癖证据。 |
| other_23 | other | 乌・呀・咿・哈（ウ・ヤ・イ・ハ） | 2.750 | bgm | high | idle_talk, chat_reply | 字幕是四音节口癖；合并四个自动候选，末尾「哈」不是问句，不分配 click_surprise。 |
| other_24 | other | 乌・呀・咿（ウ・ヤ・イ） | 1.400 | bgm | high | idle_talk, chat_reply | 字幕为三音节连声；在小桃「怎么回事」对白前结束。 |
| other_25 | other | 怎么回事 你这家伙 | 1.240 | mixed | high | — | 小桃对白，不导出。 |
| other_26 | other | 乌啦啦啦咿咿呀呀呀哈哈哈哈啊啊啊…… | 5.100 | mixed | high | — | 字幕为连续长叫，跨镜头伴小桃震动拟音；自动最长时限会切断元音，合并记录并排除。 |
| other_27 | other | 滚一边去啦 | 0.770 | mixed | high | — | 小桃对白，不导出。 |
| yaha_02 | yaha | 呀哈！呀哈！ | 1.960 | bgm | high | click_happy, idle_talk, chat_reply | 字幕「呀哈 呀哈 / ヤハ ヤハ」；合并同一组两次叫声，避免把第二声哈单独截断。 |
| other_28 | other | 呀哈/去去交界（待听审） | 0.300 | mixed | low | — | 虽仍显示呀哈字幕，但已接近小桃「去去」对白；边界/说话者不确定，保守排除。 |
| other_29 | other | 去 去（シッシッ） | 1.670 | mixed | high | — | 小桃驱赶对白及其尾部音效，不导出。 |
| other_30 | other | 但是吃不完 | 2.040 | mixed | high | — | 小八对白，不导出。 |
| other_31 | other | 巨大蛋包饭场景拟音（无叫声字幕） | 0.660 | mixed | low | — | 其他角色在场，配乐/拟音区间，无独立叫声证据。 |
| yaha_03 | yaha | 咿呀～哈～～！ | 2.040 | bgm | high | click_happy, idle_talk, chat_reply | 字幕「咿呀～哈～～ / イヤ～ハ～～」；独立完整叫声。 |
| other_32 | other | 钻进食物（无叫声字幕） | 1.730 | mixed | low | — | 钻入食物和动作拟音重叠，不能确认纯净叫声。 |
| other_33 | other | 食物场景短音（无叫声字幕） | 0.270 | mixed | low | — | 咀嚼/动作拟音，无法确认单独 Usagi 口癖。 |
| other_34 | other | 吃不完的话就做成饭团带回去吧（前） | 1.540 | mixed | high | — | 小八对白，Usagi 倒在食物旁，不导出。 |
| other_35 | other | 吃不完的话就做成饭团带回去吧（后） | 1.380 | mixed | high | — | 小八对白，不导出。 |
| other_36 | other | 饭团场景片尾拟音 | 1.360 | mixed | low | — | 片尾伴奏/拟音，没有独立叫声证据。 |
| other_37 | other | 要拍了哦 | 1.190 | mixed | high | — | 字幕「撮ります」为拿相机的小八说话，不把 Usagi 画面误认成其叫声。 |
| yaha_04 | yaha | 咿～呀～哈啊啊啊～～！ | 1.820 | bgm | high | click_happy, idle_talk, chat_reply | 字幕「イ～～ヤ～～ハアアア～～」；倒立摆姿势的完整长呀哈。 |
| other_38 | other | 相机快门/反应（无叫声字幕） | 0.640 | mixed | low | — | 相机拟音及小八反应，不能确认 Usagi 独立叫声。 |
| other_39 | other | 姿势好好玩 | 1.200 | mixed | high | — | 小八对白，不导出。 |
| other_40 | other | 新朋友③（片头音乐） | 2.200 | mixed | low | — | 画面为片名卡，片头配音/音乐区间，不是 Usagi 叫声。 |
| other_41 | other | 跟你回家了吗 | 2.120 | mixed | high | — | 小八对白，不导出。 |
| other_42 | other | 都没有注意到呢 | 2.110 | mixed | high | — | 吉伊反应与小八对白；Usagi 在旁不等于其独立发声。 |
| other_43 | other | 贴脸观察（无叫声字幕） | 1.300 | mixed | low | — | 小动物贴脸的拟音/互动声音，无法确认独立 Usagi 声音。 |
| other_44 | other | 甩动小动物（无叫声字幕） | 1.220 | mixed | low | — | 小动物及甩动动作拟音重叠，不能分离。 |
| other_45 | other | 带小动物跑动（无叫声字幕） | 0.980 | mixed | low | — | 脚步/动作拟音；没有文字支持独立 Usagi 叫声。 |
| other_46 | other | 它们好像很合得来 | 2.830 | mixed | high | — | 小八对白与 Usagi 跳动/小动物同场声音，不导出。 |
| other_47 | other | 交到了新朋友呢 | 3.010 | mixed | high | — | 小八/吉伊对白及后续短反应，不导出。 |
| yaha_05 | yaha | 咿呀～哈～～，呀～哈～～ | 4.610 | mixed | high | — | 字幕为呀哈拖长；小动物贴脸、滚动拟音同段，不能确认无重叠；合并记录，不按最大时限切掉半个元音。 |
| other_48 | other | 那是什么 | 0.800 | mixed | high | — | 小八对白，不导出。 |
| yaha_06 | yaha | 呀呀呀哈！ | 1.270 | bgm | high | click_happy, idle_talk, chat_reply | 字幕「ヤ↗↗↗ ハ！」；两个能量团为同一声，合并保留。 |
| other_49 | other | 在慢慢地融化 / 完全搞不懂 | 2.700 | mixed | high | — | 小八对白，不导出。 |
| pururu_01 | pururu | 噗噜噜噜噜噜噜…… | 1.860 | bgm | high | idle_talk, chat_reply | 字幕明确「プルルルル……」；没有把ウルル误标为本类。 |
| ura_01 | ura | 乌拉！ | 0.620 | bgm | high | click_shout, idle_talk, chat_reply | 字幕「乌啦 / ウラ」；在小八「用脚敲的门」对白前停止。 |
| other_50 | other | 用脚敲的门 | 1.750 | mixed | high | — | 小八对白和门/踢击动作拟音，不导出。 |
| other_51 | other | 乌～啦～呀哈～呀哈～乌～啦～ | 2.020 | bgm | high | idle_talk, chat_reply | 字幕为ウーラー・ヤハ～ヤハ～・ウーラー，混合口癖不分配点击类别；按弱起音扩前缘。 |
| other_52 | other | 两倍速平常就能做到啊 | 1.550 | mixed | high | — | 小八对白，不导出。 |
| ura_02 | ura | 乌拉～乌拉～乌拉～ | 2.070 | bgm | high | click_shout, idle_talk, chat_reply | 字幕「ウラ～ウラ～ウラ～」；两候选属同一组连声。 |
| ura_03 | ura | 乌拉～乌拉～乌拉～ | 1.980 | bgm | high | click_shout, idle_talk, chat_reply | 同一口癖的另一组独立时间区间；字幕持续显示ウラ，合并低能量尾段。 |
| other_53 | other | 摘果实（无叫声字幕） | 0.430 | mixed | low | — | 摘取/动作拟音，不能确认独立叫声。 |
| other_54 | other | 递果实（无叫声字幕） | 0.400 | mixed | low | — | 动作拟音/短反应无字幕；不能确认独立口癖。 |
| other_55 | other | 捏果实（无叫声字幕） | 2.110 | mixed | low | — | 果实挤压/动作拟音，缺少独立 Usagi 语音证据。 |
| ura_04 | ura | 乌拉↗乌拉↗乌拉↗ | 0.960 | bgm | high | click_shout, idle_talk, chat_reply | 字幕开头连续「ウラ↘ウラ↗ウラ↗」；只取这一组，后面的升调连声另列。 |
| other_56 | other | 乌拉↗↗↗（升调连声） | 1.040 | bgm | high | idle_talk, chat_reply | 字幕后段用升调箭头表示连声；归 other，避免把无清晰ラ尾音的部分当标准乌拉。 |
| other_57 | other | 旋转面包（无叫声字幕） | 0.790 | mixed | low | — | 面包旋转/动作拟音，不能确认纯净叫声。 |
| other_58 | other | 非常热的岩石（画面文字） | 0.750 | mixed | low | — | 画面文字说明热岩石，非叫声字幕；伴岩石/烤面包拟音，不导出。 |
| other_59 | other | 咬面包（无叫声字幕） | 0.930 | mixed | low | — | 进食拟音重叠，不能确认独立 Usagi 口癖。 |
| other_60 | other | 咀嚼面包（无叫声字幕） | 1.400 | mixed | low | — | 咀嚼/流口水拟音混合，不能分离。 |
| other_61 | other | 流口水（じゅるり） | 0.780 | mixed | high | — | 字幕じゅるり指小桃流口水拟音，不是 Usagi 叫声。 |
| other_62 | other | 流口水/咀嚼（じゅるり） | 0.860 | mixed | high | — | 小桃流口水及进食拟音，不导出。 |
| ha_01 | ha | 哈？ | 0.410 | bgm | high | click_surprise, idle_talk, chat_reply | 字幕明确「哈↗ / ハァ？」；仅此一段明确问句，不复制或把唱词末尾的ハ凑数。 |
| other_63 | other | 啊↗↗↗！ | 1.110 | bgm | high | idle_talk, chat_reply | 字幕「アア↗↗↗」是升调啊声，不是ハァ问句，归 other。 |
| other_64 | other | 交出来 | 1.280 | mixed | high | — | 小桃对白，不导出。 |
| other_65 | other | 伸手示意（无叫声字幕，待听审） | 1.010 | mixed | low | — | 没有叫声字幕；手势伴拟音/短反应，不能确认独立词音。 |
| other_66 | other | 食物想象画面拟音 | 1.370 | mixed | low | — | 食物想象转场/拟音，无法确认独立叫声。 |
| other_67 | other | 跟我谈条件吗？ | 2.250 | mixed | high | — | 小桃对白，不导出。 |
| other_68 | other | 讨厌～不要～不要～ | 2.820 | mixed | high | — | 小桃对白，不导出。 |
| other_69 | other | 咀嚼/转身（无叫声字幕） | 2.340 | mixed | low | — | 嘴里含食物的咀嚼/动作拟音；不确定独立口癖，保守排除。 |
| other_70 | other | 乌拉～呀哈～呀哈～ | 2.700 | bgm | high | idle_talk, chat_reply | 字幕为三段混合口癖；合并以保留完整词音，在小桃「不许模仿我」之前结束。 |
| other_71 | other | 不许模仿我 | 1.790 | mixed | high | — | 小桃对白与 Usagi 模仿声同时出现，不导出。 |
| other_72 | other | 模仿收尾/片尾拟音 | 0.850 | mixed | low | — | 片尾音效与角色尾声无法分离，不导出。 |
| other_73 | other | 不来一起「噗～」吗？ | 1.460 | mixed | high | — | 小八对白；字幕中的噗是对白内容，不能误标成 Usagi 的 pururu。 |
| other_74 | other | 乌・拉・呀・哈・呀哈・乌・拉 | 4.227 | bgm | high | idle_talk, chat_reply | 字幕「ウ・ラ・ヤ・ハ・ヤハ・ウ・ラ」；末尾一整组连声无自然停顿，保留 4.227 秒例外，避免截断词音；仅作 idle/chat，需主导听审。 |
