"""清理 Tripo 网格（无界面）。

用法：blender -b --factory-startup --python cleanup_mesh.py --
      --in input.glb --out clean.glb --report clean.report.json
保留面角 UV 和材质，不减面；正面沿 Blender -Y，不额外猜测模型朝向。
"""

import argparse
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh
import bpy
from mathutils import Matrix, Vector

from common import bounds, export_glb, import_model, positive_float, reset_scene, run, script_args


def nonnegative(value):
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise argparse.ArgumentTypeError("必须是有限非负数")
    return result


def ratio(value):
    result = nonnegative(value)
    if result > 1:
        raise argparse.ArgumentTypeError("比例必须在 0 到 1 之间")
    return result


def face_islands(bm):
    remaining = set(bm.faces)
    islands = []
    while remaining:
        seed = remaining.pop()
        island, pending = [seed], [seed]
        while pending:
            face = pending.pop()
            for vert in face.verts:
                for neighbor in vert.link_faces:
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        island.append(neighbor)
                        pending.append(neighbor)
        islands.append(island)
    return islands


def inward_estimate(islands):
    """相对各连通块顶点中心的点积估计；凹面、开放面不保证可靠。"""
    count = 0
    for faces in islands:
        verts = {vert for face in faces for vert in face.verts}
        center = sum((vert.co for vert in verts), Vector()) / len(verts)
        count += sum(face.normal.dot(face.calc_center_median() - center) < -1e-9
                     for face in faces)
    return count


def remove_loose(bm):
    edges = [edge for edge in bm.edges if not edge.link_faces]
    edge_count = len(edges)
    # 删除边也可能连带删除端点，须在删除前计数。
    vert_count = sum(not vert.link_faces for vert in bm.verts)
    bmesh.ops.delete(bm, geom=edges, context="EDGES")
    verts = [vert for vert in bm.verts if not vert.link_faces]
    bmesh.ops.delete(bm, geom=verts, context="VERTS")
    return {"verts": vert_count, "edges": edge_count}


def clean(args, *, write_output=True):
    """清理并返回 (对象, 报告)；prep 可复用内存结果而不产生中间 GLB。"""
    if Path(args.input).resolve() in {Path(args.output).resolve(), Path(args.report).resolve()}:
        raise ValueError("输入、输出和报告必须使用不同路径")
    if Path(args.output).resolve() == Path(args.report).resolve():
        raise ValueError("输出和报告必须使用不同路径")
    if Path(args.output).suffix.lower() != ".glb":
        raise ValueError("输出扩展名必须为 .glb")
    reset_scene()
    objects = import_model(args.input)
    report = {"input": str(Path(args.input).resolve()), "output": str(Path(args.output).resolve()),
              "objects_joined": len(objects),
              "verts_before": sum(len(obj.data.vertices) for obj in objects),
              "faces_before": sum(len(obj.data.polygons) for obj in objects)}
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    for other in list(bpy.context.scene.objects):
        if other != obj:
            bpy.data.objects.remove(other, do_unlink=True)
    obj.name = "Usagi_Body"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        before = len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=args.merge_dist)
        report["merged_verts"] = before - len(bm.verts)
        # 变换后的单精度坐标会让共线三角形残留微小面积；用局部边长作容差基准。
        degenerate = [face for face in bm.faces
                      if face.calc_area() <= max(1e-12, max(edge.calc_length() ** 2 for edge in face.edges) * 1e-6)]
        report["removed_degenerate"] = len(degenerate)
        bmesh.ops.delete(bm, geom=degenerate, context="FACES_ONLY")
        report["removed_loose"] = remove_loose(bm)
        islands = face_islands(bm)
        threshold = len(bm.faces) * args.min_island_ratio
        discarded = [island for island in islands if len(island) < threshold]
        report.update(islands_total=len(islands), islands_removed=len(discarded),
                      island_faces_removed=sum(map(len, discarded)))
        bmesh.ops.delete(bm, geom=[face for island in discarded for face in island], context="FACES")
        remove_loose(bm)
        if not bm.faces:
            raise ValueError("清理后没有剩余网格面，请检查输入和碎片阈值")
        bm.normal_update()
        before_normals = inward_estimate(face_islands(bm))
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.normal_update()
        report["normals_flipped_estimate"] = {
            "before": before_normals, "after": inward_estimate(face_islands(bm)),
            "method": "approximate: face normal dot (face center - per-island vertex center); unreliable for concave/open surfaces"}
        report["non_manifold_edges"] = sum(not edge.is_manifold for edge in bm.edges)
        minimum = Vector(tuple(min(v.co[i] for v in bm.verts) for i in range(3)))
        maximum = Vector(tuple(max(v.co[i] for v in bm.verts) for i in range(3)))
        height = maximum.z - minimum.z
        if height <= 1e-12:
            raise ValueError("模型高度为零，无法统一尺寸")
        foot = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
        scale = args.target_height / height
        for vert in bm.verts:
            vert.co = (vert.co - foot) * scale
        report.update(verts_after=len(bm.verts), faces_after=len(bm.faces))
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()
    bpy.context.view_layer.update()
    minimum, maximum = bounds([obj])
    report.update(bbox_min=list(minimum), bbox_max=list(maximum), height=maximum.z - minimum.z,
                  materials=[mat.name for mat in obj.data.materials if mat])
    textures = {}
    for material in obj.data.materials:
        if material and material.use_nodes:
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    textures[node.image.name] = {"name": node.image.name, "size": list(node.image.size)}
    report["textures"] = list(textures.values())
    if write_output:
        export_glb(args.output)
        report_path = Path(args.report).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False))
    return obj, report


def main():
    parser = argparse.ArgumentParser(description="合并并清理 GLB 网格，输出 GLB 和 JSON 报告")
    parser.add_argument("--in", dest="input", required=True)
    parser.add_argument("--out", dest="output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--merge-dist", type=nonnegative, default=0.0001)
    parser.add_argument("--min-island-ratio", type=ratio, default=0.005)
    parser.add_argument("--target-height", type=positive_float, default=1.0)
    clean(parser.parse_args(script_args()))


if __name__ == "__main__":
    run(main)
