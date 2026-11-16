"""无界面渲染五视图和横排预览。

GLB：blender -b --factory-startup --python render_preview.py -- --in model.glb --out-dir preview
VRM：启用 VRM Add-on for Blender，去掉 --factory-startup，其他参数相同。
正面沿 -Y；右前上方视角沿 (1, -1, sqrt(2))，方位角、仰角均为 45°。
"""

import argparse
import json
import math
import sys
from array import array
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Vector

from common import bounds, import_model, reset_scene, run, script_args


def landmark_points(data):
    """只绘制位置；法线、半径、元数据不是空间关键点。"""
    for name, value in data.items():
        if name.startswith("_") or name == "face_normal":
            continue
        if isinstance(value, list) and len(value) == 3 and all(isinstance(c, (float, int)) for c in value):
            yield name, Vector(value)
        elif name.startswith("ear_axis_"):
            for i, point in enumerate(value):
                yield f"{name}_{i}", Vector(point)


def draw_landmarks(source, destination, landmarks, camera, size):
    """在 PNG 缓冲区投影红点，内部骨骼点也可见；不污染普通预览。"""
    from bpy_extras.object_utils import world_to_camera_view
    picture = bpy.data.images.load(str(source), check_existing=False)
    try:
        pixels = array("f", [0.0]) * (size * size * 4)
        picture.pixels.foreach_get(pixels)
        radius = max(2, round(size / 160))
        for _, point in landmark_points(landmarks):
            projected = world_to_camera_view(bpy.context.scene, camera, point)
            x, y = round(projected.x * (size - 1)), round(projected.y * (size - 1))
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if dx * dx + dy * dy <= radius * radius and 0 <= x + dx < size and 0 <= y + dy < size:
                        index = ((y + dy) * size + x + dx) * 4
                        pixels[index:index + 4] = array("f", (1, 0, 0, 1))
        picture.pixels.foreach_set(pixels)
        picture.filepath_raw = str(destination)
        picture.file_format = "PNG"
        picture.save()
    finally:
        bpy.data.images.remove(picture)


def positive_int(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("尺寸必须为正整数")
    return number


def upstream_nodes(socket):
    """只遍历指定输入的上游，避免从整个材质里误取法线、ORM 或自发光图。"""
    pending = [link.from_node for link in socket.links] if socket else []
    visited = set()
    while pending:
        node = pending.pop(0)
        if node.as_pointer() in visited:
            continue
        visited.add(node.as_pointer())
        yield node
        # 图像的 Vector 输入不是颜色来源；Normal/Bump 也不是基础色。
        if node.type in {"TEX_IMAGE", "NORMAL_MAP", "BUMP"}:
            continue
        pending.extend(link.from_node for value in node.inputs for link in value.links)


def base_color_source(material):
    """返回基础色图像节点和常量颜色；不依赖导入器留下的活动图像节点。"""
    tree = material.node_tree if material.use_nodes else None
    if tree is None:
        return None, material.diffuse_color[:]
    # 当前 VRM 插件明确提供主贴图引用；不要按节点顺序猜 MToon 数据图。
    extension = getattr(material, "vrm_addon_extension", None)
    mtoon = getattr(extension, "mtoon1", None)
    if mtoon and mtoon.enabled:
        pbr = mtoon.pbr_metallic_roughness
        texture = pbr.base_color_texture.index
        node = tree.nodes.get(texture.get_image_texture_node_name())
        if node is None or node.type != "TEX_IMAGE" or node.image != texture.source:
            node = None
        return node if node and node.image else None, tuple(pbr.base_color_factor)
    output = next((node for node in tree.nodes
                   if node.type == "OUTPUT_MATERIAL" and node.is_active_output), None)
    for node in upstream_nodes(output.inputs.get("Surface") if output else None):
        if node.type == "BSDF_PRINCIPLED":
            color = node.inputs["Base Color"]
        elif (node.type == "GROUP" and node.node_tree
              and node.node_tree.get("SHADER") == "MToon_unversioned"):
            # 旧版 VRM/MToon 节点组的主贴图和基础色输入。
            texture = next((value for value in upstream_nodes(node.inputs.get("MainTexture"))
                            if value.type == "TEX_IMAGE" and value.image), None)
            color = node.inputs.get("DiffuseColor")
            return texture, tuple(color.default_value) if color else material.diffuse_color[:]
        else:
            continue
        texture = next((value for value in upstream_nodes(color)
                        if value.type == "TEX_IMAGE" and value.image), None)
        return texture, tuple(color.default_value)
    return None, material.diffuse_color[:]


def prepare_material_colors(objects):
    """Workbench 使用选定的基础色图；无贴图时使用 MATERIAL 基础色。"""
    textured = False
    materials = {slot.material for obj in objects for slot in obj.material_slots if slot.material}
    for material in materials:
        texture, color = base_color_source(material)
        material.diffuse_color = color
        if material.node_tree:
            material.node_tree.nodes.active = texture
        if texture:
            textured = True
        else:
            # 混合材质场景的 TEXTURE 模式也必须走该材质的颜色回退，
            # 5.2 的 use_nodes=False 已无效；清空仅在预览进程中使用的
            # 节点树，防止 Workbench 在活动节点为空时自动选其他数据图。
            # 不导出材质，也不改写输入模型或图像。
            if material.node_tree:
                material.node_tree.nodes.clear()
    return "TEXTURE" if textured else "MATERIAL"


def make_sheet(paths, destination, size):
    """直接拼接 RGBA 缓冲区，不依赖 PIL；PNG 的色彩空间由 Blender 处理。"""
    sheet = bpy.data.images.new("PreviewSheet", width=size * len(paths), height=size, alpha=True)
    pixels = array("f", [0.0]) * (size * size * len(paths) * 4)
    try:
        for column, path in enumerate(paths):
            image = bpy.data.images.load(str(path), check_existing=False)
            try:
                source = array("f", [0.0]) * (size * size * 4)
                image.pixels.foreach_get(source)
                for row in range(size):
                    start = (row * size * len(paths) + column * size) * 4
                    pixels[start:start + size * 4] = source[row * size * 4:(row + 1) * size * 4]
            finally:
                bpy.data.images.remove(image)
        sheet.pixels.foreach_set(pixels)
        sheet.filepath_raw = str(destination)
        sheet.file_format = "PNG"
        sheet.save()
    finally:
        bpy.data.images.remove(sheet)


def render(args):
    if not args.prefix or Path(args.prefix).name != args.prefix or args.prefix in {".", ".."}:
        raise ValueError("--prefix 必须是不含目录分隔符的文件名前缀")
    reset_scene()
    objects = import_model(args.input, allow_vrm=True)
    # VRM 可以带骨架，保留依赖；隐藏输入相机、灯光等辅助对象。
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            obj.hide_render = True
    bpy.context.view_layer.update()
    minimum, maximum = bounds(objects)
    center = (minimum + maximum) / 2
    radius = (maximum - minimum).length / 2
    if radius <= 1e-12:
        raise ValueError("模型包围盒为零，无法渲染")
    corners = [Vector((x, y, z)) for x in (minimum.x, maximum.x)
               for y in (minimum.y, maximum.y) for z in (minimum.z, maximum.z)]
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = scene.render.resolution_y = args.size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.dither_intensity = 0
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = prepare_material_colors(objects)
    shading.show_shadows = False
    shading.show_cavity = False
    shading.show_specular_highlight = False
    shading.show_object_outline = True
    shading.object_outline_color = (0.12, 0.12, 0.12)
    shading.background_type = "WORLD"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.72, 0.72, 0.72)
    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.clip_start = max(radius * 0.001, 1e-6)
    camera_data.clip_end = radius * 20
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    landmark_data = json.loads(Path(args.landmarks).read_text(encoding="utf-8")) if args.landmarks else None
    views = {"front": (0, -1, 0), "left": (-1, 0, 0), "back": (0, 1, 0),
             "right": (1, 0, 0), "34": (1, -1, math.sqrt(2))}
    for name, direction in views.items():
        camera.location = center + Vector(direction).normalized() * radius * 4
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        rotation_inverse = camera.rotation_euler.to_matrix().transposed()
        projected = [rotation_inverse @ (point - center) for point in corners]
        extent = max(max(p.x for p in projected) - min(p.x for p in projected),
                     max(p.y for p in projected) - min(p.y for p in projected))
        # 两侧各留 10% 的画幅边距，模型占最长轴的 80%。
        camera_data.ortho_scale = extent / 0.8
        path = out_dir / f"{args.prefix}_{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
        if landmark_data is not None and name in {"front", "left"}:
            draw_landmarks(path, out_dir / f"{args.prefix}_landmarks_{name}.png",
                           landmark_data, camera, args.size)
    make_sheet(paths, out_dir / f"{args.prefix}_sheet.png", args.size)
    if landmark_data is not None:
        # prep 专用聚焦证据，目标区域占画面高度约 80%。
        ear_bottom = min(landmark_data[f"ear_base_{side}"][2] for side in ("l", "r"))
        ear_top = max(landmark_data[f"ear_tip_{side}"][2] for side in ("l", "r"))
        tail = Vector(landmark_data["tail"])
        closeups = (("ears_closeup_front", Vector((0, 0, (ear_bottom + ear_top) / 2)),
                     Vector((0, -1, 0)), (ear_top - ear_bottom) / .8),
                    ("tail_closeup_back", tail, Vector((0, 1, 0)), .20 * landmark_data["height"]))
        for name, target, direction, scale in closeups:
            camera.location = target + direction * radius * 4
            camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
            camera_data.ortho_scale = scale
            scene.render.filepath = str(out_dir / f"{name}.png")
            bpy.ops.render.render(write_still=True)
    print(f"已输出五视图与拼图：{out_dir}")


def main():
    parser = argparse.ArgumentParser(description="Workbench 五视图预览（正面沿 Blender -Y）")
    parser.add_argument("--in", dest="input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--size", type=positive_int, default=768)
    parser.add_argument("--prefix", default="preview")
    parser.add_argument("--landmarks", help="Blender 坐标 JSON；额外输出 front/left 红点标记图")
    render(parser.parse_args(script_args()))


if __name__ == "__main__":
    run(main)
