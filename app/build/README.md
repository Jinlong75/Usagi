# Usagi 图标

由 `../scripts/icons.py` 从 `Material/tripo/usagi_3d_ref.png` 的正面裁出含耳朵头像。1024×1024 的 `icon.png` 为透明底，`icon.icns` 用于 macOS，`icon.ico` 含 16、24、32、48、64、128、256px。菜单栏使用黑色 alpha 模板 `trayTemplate.png` / `trayTemplate@2x.png`（16/32px），Windows 使用彩色 `tray.png` / `tray@2x.png`。

可在仓库根目录重跑（工具安装在仓库外）：

```sh
python3 -m venv /tmp/usagi-icons-venv
/tmp/usagi-icons-venv/bin/pip install Pillow==11.3.0
/tmp/usagi-icons-venv/bin/python app/scripts/icons.py
```

仅供个人使用，不分发原素材或安装包。
