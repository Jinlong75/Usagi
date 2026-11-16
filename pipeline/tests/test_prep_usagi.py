"""009 聚焦测试：合成几何端到端、选择器、保体积腰线、关键点叠图。"""
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

sys.dont_write_bytecode = True
BLENDER_DIR = Path(__file__).resolve().parents[1] / "blender"
sys.path.insert(0, str(BLENDER_DIR))
import bmesh
import bpy
from mathutils import Matrix, Vector
from common import export_glb, import_model, reset_scene
from cleanup_mesh import face_islands
from prep_usagi import (ear_inner_region, tail_region, smooth_waist, waist_depth,
                        prep, smooth_face, linear_color, assign_regions)
from region_boundary import boundary_metrics


def sphere(location, scale, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def synthetic_character():
    reset_scene()
    sphere((0, 0, .44), (.32, .28, .29))
    sphere((0, 0, .23), (.245, .20, .22))
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.055, depth=.34,
                                           location=(side * .10, 0, .83))
        sphere((side * .075, 0, .05), (.065, .075, .05), 16, 8)
    sphere((0, .22, .19), (.08, .08, .08), 24, 12)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.join()
    body = bpy.context.object
    remesh = body.modifiers.new("SyntheticConnectedBody", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = .018
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    for x, z in ((-.10, .46), (.10, .46), (0, .37)):
        sphere((x, -.28, z), (.025, .025, .025), 12, 6)
    # 将约定的 -Y 朝向变为 +X；生产 prep 应自动旋转回去。
    for obj in bpy.context.scene.objects:
        obj.matrix_world = Matrix.Rotation(math.pi / 2, 4, "Z") @ obj.matrix_world
    bpy.ops.object.select_all(action="SELECT")


def grooved_cylinder():
    bm = bmesh.new()
    rings = []
    for i in range(41):
        z = i / 40
        radius = .20 - .045 * math.exp(-((z - .5) / .045) ** 2)
        rings.append([bm.verts.new((radius * math.cos(j * math.tau / 48),
                                    radius * math.sin(j * math.tau / 48), z)) for j in range(48)])
    for low, high in zip(rings, rings[1:]):
        for j in range(48):
            k = (j + 1) % 48
            bm.faces.new((low[j], low[k], high[k], high[j]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))
    bm.normal_update()
    return bm


class PrepTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix="usagi-prep-"))
        synthetic_character()
        cls.source = cls.root / "source.glb"
        export_glb(cls.source)
        cls.output = cls.root / "prepared.glb"
        cls.lm = cls.root / "landmarks.json"
        cls.report_file = cls.root / "report.json"
        prep(Namespace(input=str(cls.source), output=str(cls.output), landmarks=str(cls.lm),
                       report=str(cls.report_file), smooth_waist="on", waist_iterations=100))
        cls.report = json.loads(cls.report_file.read_text())
        cls.landmarks = json.loads(cls.lm.read_text())

    def test_01_orientation_deletion_and_groups_roundtrip(self):
        self.assertAlmostEqual(self.report["rotation_degrees"], -90, places=4)
        self.assertEqual(self.report["removed_feature_islands"], 3)
        self.assertLess(self.report["front_after"][1], -.99)
        reset_scene()
        obj, = import_model(self.output)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        # glTF 按材质拆点；仅在计数用的临时网格中焊接同位置顶点。
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
        self.assertEqual(len(face_islands(bm)), 1)
        bm.free()
        self.assertEqual({g.name for g in obj.vertex_groups}, {"Body", "EarInner", "Tail"})
        for group in obj.vertex_groups:
            self.assertTrue(any(any(g.group == group.index for g in v.groups) for v in obj.data.vertices), group.name)
        for mat in obj.data.materials:
            name = mat.name.split(".")[0]
            self.assertGreater(sum(p.material_index == list(obj.data.materials).index(mat)
                                   for p in obj.data.polygons), 0)
            expected = linear_color({"Body": "FFF1C1", "EarInner": "F7B8C4", "Tail": "FFFFFF"}[name])
            for a, b in zip(mat.diffuse_color, expected):
                self.assertAlmostEqual(a, b, places=5)
        self.assertFalse(any(o.type == "ARMATURE" for o in bpy.context.scene.objects))

    def test_02_landmarks_geometry_and_surface(self):
        lm = self.landmarks
        for side in ("l", "r"):
            self.assertGreater(lm[f"ear_tip_{side}"][2], lm["head_top"][2])
            axis = lm[f"ear_axis_{side}"]
            self.assertEqual(len(axis), 5)
            self.assertEqual(axis[0], lm[f"ear_base_{side}"])
            self.assertEqual(axis[-1], lm[f"ear_tip_{side}"])
            for a, b in zip(axis, axis[1:]):
                self.assertAlmostEqual(b[2] - a[2], (axis[-1][2] - axis[0][2]) / 4)
        self.assertGreater(lm["arm_root_l"][0], 0)
        self.assertLess(lm["arm_root_r"][0], 0)
        self.assertGreater(lm["tail"][1], 0)
        self.assertLess(lm["face_normal"][1], -.7)
        self.assertAlmostEqual(lm["height"], 1, places=5)
        reset_scene()
        obj, = import_model(self.output)
        self.assertLess(min((v.co - Vector(lm["face_center"])).length for v in obj.data.vertices), 1e-5)
        self.assertLessEqual(self.report["face"]["max_deviation_after"], .004)

    def test_03_region_selectors_on_analytic_ear_and_tail(self):
        sections = [{"center": Vector((.1, 0, .7 + i * .075)), "half_width": .05,
                     "front_y": -.04, "back_y": .04} for i in range(5)]
        front = Vector((0, -1, 0))
        self.assertTrue(ear_inner_region(Vector((.1, -.04, .85)), front, sections))
        for point, normal in ((Vector((.145, -.04, .85)), front),
                              (Vector((.1, .04, .85)), Vector((0, 1, 0))),
                              (Vector((.1, -.04, .701)), front)):
            self.assertFalse(ear_inner_region(point, normal, sections))
        self.assertTrue(tail_region(Vector((0, .25, .20)), Vector((0, 1, 0)), {"height": 1}))
        self.assertFalse(tail_region(Vector((0, -.25, .20)), front, {"height": 1}))
        self.assertFalse(tail_region(Vector((.20, .25, .20)), Vector((0, 1, 0)), {"height": 1}))

    def test_04_waist_depth_volume_and_pinned_vertices(self):
        bm = grooved_cylinder()
        try:
            original = {v: v.co.copy() for v in bm.verts}
            report = smooth_waist(bm, .5, half_width=.30, iterations=100)
            print("腰线合成实验：" + json.dumps(report), flush=True)
            self.assertGreater(report["max_inward_depth_before"], .04)
            self.assertLess(report["max_inward_depth_after"], report["max_inward_depth_before"] * .30)
            for vert in bm.verts:
                self.assertAlmostEqual(vert.co.z, original[vert].z, places=6)
                if abs(original[vert].z - .5) >= .30 - 1e-6:
                    self.assertLess((vert.co - original[vert]).length, 1e-7)
            self.assertLess(abs(report["volume_after"] / report["volume_before"] - 1), .01)
        finally:
            bm.free()

    def test_05_waist_off_and_excluded_arms_unchanged(self):
        bm = grooved_cylinder()
        try:
            original = {v: v.co.copy() for v in bm.verts}
            report = smooth_waist(bm, .5, half_width=.30, enabled=False)
            self.assertEqual(report["max_inward_depth_before"], report["max_inward_depth_after"])
            self.assertEqual(report["vertices_processed"], 0)
            smooth_waist(bm, .5, half_width=.30, trunk_limit=.15, iterations=10)
            for vert in bm.verts:
                if abs(original[vert].x) >= .15:
                    self.assertLess((vert.co - original[vert]).length, 1e-7)
        finally:
            bm.free()

    def test_06_landmark_overlay(self):
        out_dir = self.root / "preview"
        command = [os.environ.get("BLENDER", bpy.app.binary_path), "-b", "--factory-startup",
                   "--python", str(BLENDER_DIR / "render_preview.py"), "--", "--in", str(self.output),
                   "--out-dir", str(out_dir), "--size", "128", "--landmarks", str(self.lm)]
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=100)
        (self.root / "preview.log").write_text(result.stdout)
        self.assertEqual(result.returncode, 0, result.stdout)
        for view in ("front", "left"):
            base = bpy.data.images.load(str(out_dir / f"preview_{view}.png"), check_existing=False)
            overlay = bpy.data.images.load(str(out_dir / f"preview_landmarks_{view}.png"), check_existing=False)
            try:
                original, marked = list(base.pixels), list(overlay.pixels)
                red = [i for i in range(0, len(marked), 4) if marked[i] > .95 and marked[i+1] < .02 and marked[i+2] < .02]
                self.assertGreater(len(red), 20)
                self.assertNotEqual(original, marked)
                self.assertEqual(list(overlay.size), [128, 128])
            finally:
                bpy.data.images.remove(base)
                bpy.data.images.remove(overlay)

    def assert_smooth_boundaries(self, obj, expected):
        metrics = boundary_metrics(obj)
        self.assertEqual(set(metrics), set(expected), metrics)
        for label in expected:
            self.assertEqual(len(metrics[label]), 1, metrics)
            loop, = metrics[label]
            self.assertTrue(loop["closed"], metrics)
            self.assertLess(loop["max_turn_degrees"], 35, metrics)
        print("014 boundary metrics: " + json.dumps(metrics), flush=True)

    def test_08_synthetic_cut_ellipse_closed_and_smooth(self):
        reset_scene()
        # 三角格平面：旧面中心着色会沿格线产生台阶。
        bm = bmesh.new()
        rows = [[bm.verts.new((.025 + x * .0025, -.04, .69 + z * .0025))
                 for x in range(61)] for z in range(129)]
        for low, high in zip(rows, rows[1:]):
            for x in range(60):
                bm.faces.new((low[x], low[x+1], high[x+1], high[x]))
        mesh = bpy.data.meshes.new("EllipseGrid")
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new("EllipseGrid", mesh)
        bpy.context.collection.objects.link(obj)
        sections = [{"center": Vector((.1, 0, .7 + i * .075)), "half_width": .05}
                    for i in range(5)]
        assign_regions(obj, {"height": 1}, {"l": sections})
        self.assert_smooth_boundaries(obj, {"ear_l"})

    def test_09_real_product_boundaries(self):
        product = BLENDER_DIR.parents[1] / "assets/model/usagi_base.glb"
        if not product.exists():
            self.skipTest("正式产物尚未生成")
        reset_scene()
        obj, = import_model(product)
        self.assert_real_regions(obj)
        # 同时从正式原始模型临时重建，防止已提交的旧 GLB 掩盖分区代码回退。
        source = BLENDER_DIR.parents[1] / "Material/tripo/usagi3d2.glb"
        regenerated = self.root / "real-regenerated.glb"
        prep(Namespace(input=str(source), output=str(regenerated),
                       landmarks=str(self.root / "real-landmarks.json"),
                       report=str(self.root / "real-report.json"),
                       smooth_waist="off", waist_iterations=100))
        report = json.loads((self.root / "real-report.json").read_text())
        components = report["region_boundary"]["ear_components"]
        self.assertEqual(sum(c["kept"] for c in components), 2, components)
        for component in components:
            self.assertEqual(component["kept"], component["mean_normal_y"] < -.25)
        reset_scene()
        obj, = import_model(regenerated)
        self.assert_real_regions(obj)

    def assert_real_regions(self, obj):
        bm = bmesh.new()
        try:
            bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
            islands = sorted(face_islands(bm), key=len, reverse=True)
            self.assertEqual(len(islands), 2)
            tail = islands[1]
            self.assertLess(len(tail), len(bm.faces) * .05)
            self.assertGreater(sum(f.calc_center_median().y for f in tail) / len(tail), 0)
            self.assertEqual(len(tail), 702)  # 原始独立网格不细分、不改形状。
            self.assertEqual({f for f in bm.faces if f.material_index == 2}, set(tail))
            self.assertEqual(sum(f.material_index == 2 for f in islands[0]), 0)
            self.assertFalse(any(face.calc_area() <= 1e-14 for face in bm.faces))
        finally:
            bm.free()
        self.assert_smooth_boundaries(obj, {"ear_l", "ear_r"})

    def test_07_face_sphere_local_bump(self):
        reset_scene()
        obj = sphere((0, 0, .46), (.28, .28, .28), 64, 32)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        try:
            for v in bm.verts:
                if abs(v.co.x) < .025 and abs(v.co.z - .46) < .025 and v.co.y < -.20:
                    v.co.y -= .015
            bm.normal_update()
            regions = [{"min": [-.031, -.31, .429], "max": [.031, -.20, .491]}]
            original = {v: v.co.copy() for v in bm.verts}
            report = smooth_face(bm, regions)
            for v, before in original.items():
                if not all(regions[0]["min"][i] <= before[i] <= regions[0]["max"][i] for i in range(3)):
                    self.assertEqual(tuple(v.co), tuple(before))
            self.assertGreater(report["max_deviation_before"], .004)
            self.assertGreater(report["vertices_processed"], 0)
            self.assertLessEqual(report["max_deviation_after"], .004)
        finally:
            bm.free()


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(PrepTests))
    if result.wasSuccessful():
        print(f"009 全部通过 {result.testsRun} 项", flush=True)
        shutil.rmtree(PrepTests.root)
    else:
        print(f"009 失败现场：{getattr(PrepTests, 'root', '初始化前失败')}", flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
