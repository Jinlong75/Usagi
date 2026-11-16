"""Blender 内置 Python 集成测试；合成输入和临时文件均不进入仓库。"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
BLENDER_DIR = Path(__file__).resolve().parents[1] / "blender"
sys.path.insert(0, str(BLENDER_DIR))

import bmesh
import bpy
from mathutils import Vector

from common import bounds, export_glb, import_model, reset_scene

REQUIRED_FIELDS = {
    "input", "output", "objects_joined", "verts_before", "verts_after", "faces_before",
    "faces_after", "merged_verts", "removed_loose", "removed_degenerate", "islands_total",
    "islands_removed", "island_faces_removed", "normals_flipped_estimate", "non_manifold_edges",
    "bbox_min", "bbox_max", "height", "materials", "textures",
}
CUBE_VERTS = [(-.5, -.5, -.5), (.5, -.5, -.5), (.5, .5, -.5), (-.5, .5, -.5),
              (-.5, -.5, .5), (.5, -.5, .5), (.5, .5, .5), (-.5, .5, .5)]
CUBE_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
              (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, texture=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    if texture:
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = texture
        mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def split_cube(name, center, mat, inward=False):
    verts, faces = [], []
    for indices in CUBE_FACES:
        if inward:
            indices = tuple(reversed(indices))
        start = len(verts)
        verts.extend(CUBE_VERTS[i] for i in indices)
        faces.append(tuple(range(start, start + 4)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name="UVMap")
    for face in mesh.polygons:
        for index, coord in zip(face.loop_indices, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            uv.data[index].uv = coord
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = center
    return obj


def corners_signature(objects, foot, scale):
    result = set()
    for obj in objects:
        uv = obj.data.uv_layers.active
        if uv is None:
            raise AssertionError("UV 层丢失")
        for loop in obj.data.loops:
            point = (obj.matrix_world @ obj.data.vertices[loop.vertex_index].co - foot) * scale
            result.add(tuple(round(value, 5) for value in (*point, *uv.data[loop.index].uv)))
    return result


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix="usagi-pipeline-"))
        cls.invocation = 0
        cls.blender = os.environ.get("BLENDER", bpy.app.binary_path)
        cls.input = cls.root / "source.glb"
        cls.output = cls.root / "clean.glb"
        cls.report_path = cls.root / "clean.report.json"
        cls.artifacts = Path(os.environ.get("AR_GATE_ARTIFACT_DIR", str(cls.root / "previews"))).resolve()
        cls.artifacts.mkdir(parents=True, exist_ok=True)
        fresh()
        image = bpy.data.images.new("SyntheticChecker", width=8, height=8)
        image.pixels[:] = [component for y in range(8) for x in range(8)
                           for component in ((1, .35, .1, 1) if (x + y) % 2 else (.8, .1, .3, 1))]
        image.filepath_raw = str(cls.root / "checker.png")
        image.file_format = "PNG"
        image.save()
        image.pack()
        warm = material("WarmChecker", (1, .35, .1), image)
        cool = material("Cool", (.05, .3, .9))
        split_cube("CubeOut", (-1.5, 0, 1), warm)
        split_cube("CubeIn", (1.5, .4, 1.5), cool, inward=True)
        for index in range(3):
            mesh = bpy.data.meshes.new(f"Fragment{index}")
            mesh.from_pydata([(0, 0, 0), (.01, 0, 0), (0, .01, 0), (0, 0, .01)], [],
                             [(0, 2, 1), (0, 1, 3), (1, 2, 3), (2, 0, 3)])
            mesh.materials.append(cool)
            obj = bpy.data.objects.new(mesh.name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            obj.location = (6 + index, 0, 4)
        bpy.ops.object.select_all(action="SELECT")
        export_glb(cls.input)
        fresh()
        imported = import_model(cls.input)
        cls.input_verts = sum(len(obj.data.vertices) for obj in imported)
        cubes = [obj for obj in imported if obj.name.startswith("Cube")]
        minimum, maximum = bounds(cubes)
        cls.foot = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
        cls.scale = 1 / (maximum.z - minimum.z)
        cls.expected_corners = corners_signature(cubes, cls.foot, cls.scale)
        cls.call("cleanup_mesh.py", "--in", cls.input, "--out", cls.output, "--report", cls.report_path,
                 "--min-island-ratio", "0.12")
        cls.report = json.loads(cls.report_path.read_text(encoding="utf-8"))
        if os.environ.get("AR_GATE_ARTIFACT_DIR"):
            shutil.copy2(cls.report_path, cls.artifacts / "synthetic-clean.report.json")
        print("合成模型 1 报告：" + json.dumps(cls.report, ensure_ascii=False), flush=True)

    @classmethod
    def call(cls, script, *args, expected=0):
        command = [cls.blender, "-b", "--factory-startup", "--python", str(BLENDER_DIR / script),
                   "--", *map(str, args)]
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=100)
        cls.invocation += 1
        (cls.root / f"{cls.invocation:02d}-{script}.log").write_text(result.stdout, encoding="utf-8")
        if (expected == 0 and result.returncode != 0) or (expected != 0 and result.returncode == 0):
            raise AssertionError(f"命令退出码 {result.returncode}：{command}\n{result.stdout}")
        return result

    def test_01_weld_fragments_normals_and_origin(self):
        report = self.report
        self.assertEqual(report["objects_joined"], 5)
        self.assertEqual(report["verts_before"], self.input_verts)
        # 焊接后：两个立方体 16 点、三个四面体 12 点；再删四面体得到 16 点。
        self.assertEqual(report["merged_verts"], self.input_verts - 28)
        self.assertEqual(report["verts_after"], 16)
        self.assertEqual(report["faces_before"], 36)
        self.assertEqual(report["faces_after"], 24)
        self.assertEqual(report["islands_total"], 5)
        self.assertEqual(report["islands_removed"], 3)
        self.assertEqual(report["island_faces_removed"], 12)
        self.assertEqual(report["normals_flipped_estimate"]["before"], 12)
        self.assertEqual(report["normals_flipped_estimate"]["after"], 0)
        self.assertEqual(report["non_manifold_edges"], 0)
        self.assertAlmostEqual(report["height"], 1, delta=1e-4)
        for axis in (0, 1):
            self.assertAlmostEqual(report["bbox_min"][axis] + report["bbox_max"][axis], 0, delta=1e-4)
        self.assertAlmostEqual(report["bbox_min"][2], 0, delta=1e-4)

    def test_02_large_island_preserved_by_default(self):
        fresh()
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16)
        body = bpy.context.object
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=3, radius=.15, location=(0, 0, 1.3))
        ear = bpy.context.object
        body.data.materials.append(material("Body", (.8, .6, .1)))
        ear.data.materials.append(body.data.materials[0])
        # glTF 会三角化：球 960 面，小块 32 面，约 3.33%。
        body_faces = sum(len(face.vertices) - 2 for face in body.data.polygons)
        ear_faces = sum(len(face.vertices) - 2 for face in ear.data.polygons)
        self.assertGreater(ear_faces / body_faces, .02)
        self.assertLess(ear_faces / body_faces, .04)
        bpy.ops.object.select_all(action="SELECT")
        source, output, report = (self.root / name for name in ("ear.glb", "ear-clean.glb", "ear.json"))
        export_glb(source)
        self.call("cleanup_mesh.py", "--in", source, "--out", output, "--report", report)
        data = json.loads(report.read_text())
        self.assertEqual(data["islands_total"], 2)
        self.assertEqual(data["islands_removed"], 0)
        self.assertEqual(data["faces_after"], body_faces + ear_faces)

    def test_03_report_fields_and_texture(self):
        self.assertTrue(REQUIRED_FIELDS <= self.report.keys())
        self.assertEqual(len(self.report["materials"]), 2)
        self.assertEqual(len(self.report["textures"]), 1)
        self.assertEqual(self.report["textures"][0]["size"], [8, 8])
        self.assertIn("approximate", self.report["normals_flipped_estimate"]["method"])

    def test_04_export_readback_and_uv(self):
        fresh()
        objects = import_model(self.output)
        self.assertEqual(len(objects), 1)
        obj = objects[0]
        self.assertEqual(obj.name, "Usagi_Body")
        self.assertEqual(len(obj.data.materials), 2)
        self.assertEqual(corners_signature(objects, Vector(), 1), self.expected_corners)
        self.assertEqual(len({tuple(round(c, 5) for c in v.co) for v in obj.data.vertices}), 16)
        self.assertLess(obj.location.length, 1e-5)
        self.assertLess((obj.scale - Vector((1, 1, 1))).length, 1e-5)
        for face in obj.data.polygons:
            cube_center = Vector((-1.5, 0, 1) if face.center.x < 0 else (1.5, .4, 1.5))
            cube_center = (cube_center - self.foot) * self.scale
            self.assertGreater(face.normal.dot(face.center - cube_center), 0)

    def test_05_preview_images(self):
        self.call("render_preview.py", "--in", self.output, "--out-dir", self.artifacts)
        source_pixels = []
        for view in ("front", "left", "back", "right", "34", "sheet"):
            path = self.artifacts / f"preview_{view}.png"
            self.assertTrue(path.is_file(), str(path))
            image = bpy.data.images.load(str(path), check_existing=False)
            try:
                width, height = image.size
                self.assertEqual((width, height), (768 * (5 if view == "sheet" else 1), 768))
                pixels = list(image.pixels)
                background = pixels[:3]
                foreground = sum(max(abs(pixels[i + c] - background[c]) for c in range(3)) > .03
                                 for i in range(0, len(pixels), 4))
                self.assertGreater(foreground / (width * height), .01, view)
                # 四个角必须是同一种不透明的纯背景。
                for x, y in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
                    start = (y * width + x) * 4
                    self.assertEqual(pixels[start:start + 3], background)
                    self.assertEqual(pixels[start + 3], 1)
                if view != "sheet":
                    source_pixels.append(pixels)
                else:
                    # 拼图各面板与源图一致（允许 PNG 色彩量化误差）。
                    for column, source in enumerate(source_pixels):
                        for y in (100, 384, 600):
                            start = (y * width + column * 768) * 4
                            row = pixels[start:start + 768 * 4]
                            original = source[y * 768 * 4:(y + 1) * 768 * 4]
                            self.assertLess(max(abs(a - b) for a, b in zip(row, original)), .01)
            finally:
                bpy.data.images.remove(image)
        print(f"预览证据：{self.artifacts}", flush=True)

    def test_06_parameter_and_runtime_failures(self):
        for script in ("cleanup_mesh.py", "render_preview.py"):
            with self.subTest(script=script):
                result = self.call(script, expected=1)
                self.assertIn("usage:", result.stdout)
                self.assertIn("--in", result.stdout)
        result = self.call("cleanup_mesh.py", "--in", self.root / "missing.glb", "--out", self.root / "unused.glb",
                           "--report", self.root / "unused.json", expected=1)
        self.assertIn("找不到输入模型", result.stdout)
        result = self.call("cleanup_mesh.py", "--in", self.input, "--out", self.output,
                           "--report", self.report_path, "--merge-dist", "nan", expected=1)
        self.assertIn("usage:", result.stdout)

    def test_07_loose_degenerate_and_transforms(self):
        # glTF 导出通常省略松散点/边，直接测试同一清理函数的 Blender 输入边界。
        from cleanup_mesh import clean
        from argparse import Namespace
        from unittest.mock import patch
        fresh()
        obj = split_cube("Transformed", (3, -2, 4), material("Plain", (.6, .2, .1)))
        obj.rotation_euler.z = .3
        obj.scale = (2, 1, 3)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        loose_a, loose_b = bm.verts.new((8, 0, 0)), bm.verts.new((9, 0, 0))
        bm.edges.new((loose_a, loose_b))
        bm.verts.new((10, 0, 0))
        degenerate = [bm.verts.new((x, 0, 0)) for x in (11, 12, 13)]
        bm.faces.new(degenerate)
        bm.to_mesh(obj.data)
        bm.free()
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action="SELECT")
        bpy.context.view_layer.objects.active = obj
        report = self.root / "loose.json"
        args = Namespace(input=str(self.root / "mock-input.glb"), output=str(self.root / "loose.glb"),
                         report=str(report), merge_dist=.0001, min_island_ratio=.005, target_height=2)
        with patch("cleanup_mesh.reset_scene"), patch("cleanup_mesh.import_model", return_value=[obj]):
            clean(args)
        data = json.loads(report.read_text())
        self.assertEqual(data["removed_degenerate"], 1)
        self.assertGreaterEqual(data["removed_loose"]["edges"], 1)
        self.assertEqual(data["verts_after"], 8)
        self.assertEqual(data["non_manifold_edges"], 0)
        self.assertAlmostEqual(data["height"], 2, delta=1e-4)
        self.assertEqual(list(obj.location), [0, 0, 0])
        self.assertEqual(list(obj.rotation_euler), [0, 0, 0])
        self.assertEqual(list(obj.scale), [1, 1, 1])


if __name__ == "__main__":
    started = time.monotonic()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PipelineTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    elapsed = time.monotonic() - started
    if result.wasSuccessful():
        print(f"全部通过 {result.testsRun} 项（{elapsed:.1f} 秒）", flush=True)
        shutil.rmtree(PipelineTests.root)
    else:
        print(f"失败现场：{getattr(PipelineTests, 'root', '初始化前失败')}", flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
