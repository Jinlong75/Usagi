"""Blender 命令行脚本的公共入口、导入和包围盒工具。"""

import math
import os
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector


def script_args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def run(main):
    """Blender 会吞掉 Python 异常；失败时直接返回真正的进程退出码。"""
    try:
        main()
    except BaseException as exc:
        code = exc.code if isinstance(exc, SystemExit) else 1
        if code is None or code == 0:
            return
        if not isinstance(exc, SystemExit):
            traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(code if isinstance(code, int) and 0 < code < 256 else 1)


def positive_float(value):
    result = float(value)
    if not math.isfinite(result) or result <= 0:
        raise ValueError("必须是有限正数")
    return result


def reset_scene():
    # 直接删除数据，避免用户启动场景里的隐藏对象逃过 select_all。
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def import_model(path, allow_vrm=False):
    path = Path(path).resolve()
    if not path.is_file():
        raise ValueError(f"找不到输入模型：{path}")
    suffix = path.suffix.lower()
    if suffix == ".glb":
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".vrm" and allow_vrm:
        try:
            operator = bpy.ops.import_scene.vrm
            operator.get_rna_type()
        except (AttributeError, RuntimeError) as exc:
            raise ValueError("VRM 输入需要启用 VRM Add-on for Blender（扩展 vrm），启动时不要使用 --factory-startup") from exc
        operator(filepath=str(path))
    else:
        raise ValueError("输入必须是 .glb" + (" 或 .vrm" if allow_vrm else ""))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects or not any(obj.data.polygons for obj in objects):
        raise ValueError("输入模型不包含网格面")
    for obj in objects:
        restore_region_groups(obj)
    return objects


def restore_region_groups(obj):
    """glTF 自定义逐点位掩码还原无骨架顶点组（材质边界拆点后仍有效）。"""
    groups = obj.get("usagi_vertex_groups")
    attribute = obj.data.attributes.get("_USAGI_REGION")
    if not groups or attribute is None:
        return
    for name, bit in groups.items():
        group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        indices = [i for i, item in enumerate(attribute.data) if round(item.value) & int(bit)]
        if indices:
            group.add(indices, 1, "REPLACE")


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (Vector(tuple(min(p[i] for p in points) for i in range(3))),
            Vector(tuple(max(p[i] for p in points) for i in range(3))))


def export_glb(path, **options):
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
                              export_apply=True, export_yup=True,
                              use_selection=True, **options)
