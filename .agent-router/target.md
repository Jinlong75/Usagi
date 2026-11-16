# 目标：Usagi 3D 桌宠

来源：`usagi3Dpet.md`（用户需求原文）、2026-11-16 用户对平台与分工的回答。

## 最终目标

一只 Usagi（乌萨奇）3D 桌宠：VRM 角色站在桌面上，会眨眼、看鼠标、耳朵随动作晃，点它有表情和叫声，能用 DeepSeek API 聊天；Mac（.dmg）和 Windows（.exe）都能一键安装。同一个 VRM 也能导入 Mate Engine（Windows）使用。

## 已定方案（决定 D1～D6）

- D1 平台：自己做跨平台桌宠程序（Electron + three + @pixiv/three-vrm），不依赖 Mate Engine；Mate Engine 只做 Windows 上的兼容检查（用户自己在 Windows 电脑上试）。
- D2 建模：用户自己在 Tripo 网页上**图生 3D**（以原图为底图改出 T-pose 多视图 → 智能拓扑；不用文生 3D，用户要求完全还原），把 .glb 放到 `Material/tripo/`；我们只出操作指南。
- D3 五官（2026-11-16 用户确认"方案a"）：Tripo 生成**无五官**的身体（只有底色、耳朵内侧粉色、尾巴）；眼睛、嘴、腮红用贴在脸上的薄片 + 表情贴图集，表情用 VRM 的 UV 平移（textureTransformBinds）切换。理由：Tripo 烘进贴图的五官模糊且没法做表情；五官照原作正脸图描线（还原优先），不凭空画。
- D4 Blender：本机 `~/Applications/Blender.app`（5.2.3 LTS），已装 VRM 插件（extensions: vrm）。所有 Blender 步骤写成命令行脚本（`blender -b --python …`），可重复跑、可验收；每一步出预览图供主导看。
- D5 弹簧骨骼：两只耳朵各一串骨骼（3～4 节）做弹簧，头部和身体加碰撞球。
- D6 目录：原始素材 `Material/`；Blender 脚本 `pipeline/`；中间与最终模型 `assets/`；桌宠程序 `app/`；给用户的操作指南 `docs/guides/`。占位模型 `assets/placeholder/Seed-san.vrm`（VRM Public License 1.0，VirtualCast），只供开发，不打进安装包。

## 里程碑与完成条件

1. M0 模型：用户按指南在 Tripo 生成并放好 glb。
2. M1 网格清理：`pipeline/blender/cleanup_mesh.py` 合并重合点、去碎片、修法线、统一尺寸与原点；出预览图。
3. M2 骨骼与权重：VRM humanoid 骨骼 + 耳朵骨骼，自动权重后修复（耳根、手臂短小处），导出 VRM 1.0。
4. M3 弹簧骨骼与碰撞体。
5. M4 表情：眨眼、开心、生气、悲伤、惊讶、aa/ih/ou/ee/oh 口型。
6. M5 桌宠程序：透明置顶窗口、拖动、点击穿透、待机动作、看鼠标、托盘菜单；DeepSeek 聊天（用户在设置里填 key，本机加密保存）；叫声音效。
7. M6 安装包：Mac .dmg（arm64）一键安装；Windows .exe（NSIS）一键安装。
8. M7 用户走查：Mac 上实际使用；Windows 上试安装包和 Mate Engine 导入。

## 不做什么

- 不公开发布：Usagi 是《Chiikawa》的角色，素材和成品只供个人使用，不上传公开仓库或商店。
- 不做手机版、不做多角色。

## 预算与截止

用户没给，按正常节奏推进。
