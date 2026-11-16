"""010 synthetic rig, independent skinning constraints and VRM plugin round trip."""
import json
import math
import os
import shutil
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"blender"))
import bpy
from mathutils import Vector
from common import export_glb, reset_scene
from rig_usagi import rig, HUMANOID, weight_report, vertex_weights, enable_vrm


def sphere(center, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=center)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(material)
    if material.name == "Tail":
        obj.vertex_groups.new(name="Tail").add(list(range(len(obj.data.vertices))), 1, "REPLACE")
    return obj


def cylinder(a, b, radius, material):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=(b-a).length,
                                       location=(a+b)*.5)
    obj = bpy.context.object
    obj.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.data.materials.append(material)
    return obj


def synthetic(root):
    reset_scene()
    mats = {name: bpy.data.materials.new(name) for name in ("Body", "EarInner", "Tail")}
    sphere((0, 0, .20), (.20, .16, .15), mats["Body"])
    sphere((0, 0, .49), (.24, .22, .23), mats["Body"])
    sphere((0, .18, .18), (.06, .06, .06), mats["Tail"])
    lm = dict(height=1, hips=[0, 0, .13], chest=[0, 0, .29], neck=[0, 0, .33],
              head_center=[0, 0, .49], head_top=[0, 0, .72], face_center=[0, -.22, .49],
              face_radius=.22, tail=[0, .18, .18])
    for side, sign in (("l", 1), ("r", -1)):
        lm[f"arm_root_{side}"] = [sign*.18, 0, .29]
        lm[f"arm_tip_{side}"] = [sign*.32, 0, .29]
        cylinder(lm[f"arm_root_{side}"], lm[f"arm_tip_{side}"], .027, mats["Body"])
        lm[f"leg_root_{side}"] = [sign*.07, 0, .10]
        lm[f"foot_{side}"] = [sign*.07, -.018, .015]
        cylinder([sign*.07, 0, .012], [sign*.07, 0, .10], .035, mats["Body"])
        lm[f"ear_axis_{side}"] = [[sign*.10, 0, .72+i*.07] for i in range(5)]
        cylinder(lm[f"ear_axis_{side}"][0], lm[f"ear_axis_{side}"][-1], .035, mats["Body"])
        cylinder([sign*.10, -.03, .76], [sign*.10, -.03, .97], .012, mats["EarInner"])
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    # Match 009's custom GLB attribute, so Tail region survives import/export.
    group = obj.vertex_groups.get("Tail")
    attribute = obj.data.attributes.new("_USAGI_REGION", "FLOAT", "POINT")
    for v in obj.data.vertices:
        attribute.data[v.index].value = 4 if any(g.group == group.index for g in v.groups) else 1
    obj["usagi_vertex_groups"] = {"Body": 1, "EarInner": 2, "Tail": 4}
    export_glb(root/"synthetic.glb", export_attributes=True, export_extras=True)
    (root/"landmarks.json").write_text(json.dumps(lm))
    return lm


class RigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix="usagi-rig-"))
        enable_vrm()
        cls.lm = synthetic(cls.root)
        cls.obj, cls.arm, cls.report, cls.kinds = rig(cls.root/"synthetic.glb", cls.root/"landmarks.json",
                                                   cls.root/"synthetic.vrm", cls.root/"report.json")
        data = (cls.root/"synthetic.vrm").read_bytes()
        cls.gltf = json.loads(data[20:20+struct.unpack_from("<I", data, 12)[0]])
        cls.weights = vertex_weights(cls.obj, cls.arm)
        cls.points = [v.co.copy() for v in cls.obj.data.vertices]

    def test_01_hierarchy_and_lengths(self):
        required = {"Hips", "Spine", "Head"} | {s+p for s in ("Left", "Right") for p in
                       ("UpperArm", "LowerArm", "Hand", "UpperLeg", "LowerLeg", "Foot")}
        self.assertTrue(required <= set(self.arm.data.bones.keys()))
        self.assertTrue(all(b.length > .01 for b in self.arm.data.bones))
        hb = self.arm.data.vrm_addon_extension.vrm1.humanoid.human_bones
        self.assertEqual({key: getattr(hb, key).node.bone_name for key in HUMANOID}, HUMANOID)
        for side in ("L", "R"):
            self.assertEqual(self.arm.data.bones[f"Ear{side}_1"].parent.name, "Head")
            for i in range(2, 5):
                b = self.arm.data.bones[f"Ear{side}_{i}"]
                self.assertLess((b.head_local-b.parent.tail_local).length, 1e-6)
        self.assertEqual(self.arm.data.bones["Tail"].parent.name, "Hips")
        for name in ("EarL_4", "EarR_4", "Tail"):
            self.assertEqual(len(self.arm.data.bones[name].children), 1)
        sb = self.arm.data.vrm_addon_extension.spring_bone1
        for collider, expected in zip(sb.colliders, self.report["colliders"]):
            actual = self.arm.matrix_world.inverted() @ collider.bpy_object.matrix_world.translation
            self.assertLess((actual-Vector(expected["center"])).length, 1e-5)

    def test_02_weights_independent_masks(self):
        counts = dict(ear=0, tip=0, face=0, arm=0, leg=0, tail=0)
        for p, weights in zip(self.points, self.weights):
            names = set(weights)
            self.assertGreater(len(names), 0)
            self.assertLessEqual(len(names), 4)
            self.assertAlmostEqual(sum(weights.values()), 1, delta=1e-4)
            label, ear = ("Left", "L") if p.x >= 0 else ("Right", "R")
            if p.z > .72001:
                counts["ear"] += 1
                self.assertTrue(names <= {"Head"} | {f"Ear{ear}_{i}" for i in range(1, 5)})
                if p.z > .98:
                    counts["tip"] += 1
                    self.assertGreaterEqual(weights.get(f"Ear{ear}_4", 0), .8)
            if (p-Vector(self.lm["face_center"])).length <= .22*.6:
                counts["face"] += 1
                self.assertEqual(names, {"Head"})
            if abs(p.x) > .24 and abs(p.z-.29) < .035:
                counts["arm"] += 1
                self.assertTrue(names <= {label+s for s in ("UpperArm", "LowerArm", "Hand")} | {"Chest"})
            if p.z < .05:
                counts["leg"] += 1
                self.assertTrue(names <= {label+s for s in ("UpperLeg", "LowerLeg", "Foot")} | {"Hips"})
            if "Tail" in names:
                counts["tail"] += 1
                self.assertGreater(p.y, .119)
                self.assertLess(abs(p.x), .061)
        self.assertTrue(all(v > 0 for v in counts.values()), counts)
        self.assertTrue(self.report["weights"]["valid"])
        self.assertTrue(self.report["automatic_weights"]["attempted"])

    def test_03_checker_detects_wrong_weights(self):
        v = next(v for v, kind in zip(self.obj.data.vertices, self.kinds) if kind == "face")
        original = self.weights[v.index]
        for group in self.obj.vertex_groups:
            group.remove([v.index])
        self.obj.vertex_groups["LeftFoot"].add([v.index], 1, "REPLACE")
        try:
            report = weight_report(self.obj, self.arm, self.lm, self.kinds)
            self.assertFalse(report["valid"])
            self.assertEqual(report["constraint_failures"]["face_region"], 1)
        finally:
            self.obj.vertex_groups["LeftFoot"].remove([v.index])
            for name, weight in original.items():
                self.obj.vertex_groups[name].add([v.index], weight, "REPLACE")

    def test_04_exported_meta_materials_springs(self):
        ext = self.gltf["extensions"]
        self.assertEqual(ext["VRMC_vrm"]["specVersion"], "1.0")
        meta = ext["VRMC_vrm"]["meta"]
        for key, value in dict(name="Usagi", version="0.1", authors=["Usagi Desktop Pet (personal)"],
                               licenseUrl="https://vrm.dev/licenses/1.0/", avatarPermission="onlyAuthor",
                               commercialUsage="personalNonProfit", creditNotation="required",
                               allowRedistribution=False, allowExcessivelyViolentUsage=False,
                               allowExcessivelySexualUsage=False, allowPoliticalOrReligiousUsage=False,
                               allowAntisocialOrHateUsage=False,
                               copyrightInformation="角色版权归《Chiikawa》原作者，仅个人使用。").items():
            self.assertEqual(meta[key], value, key)
        sb = ext["VRMC_springBone"]
        self.assertEqual(len(sb["colliders"]), 2)
        self.assertEqual(len(sb["colliderGroups"]), 2)
        self.assertEqual([len(s["joints"]) for s in sb["springs"]], [4, 4, 1])
        for spring in sb["springs"]:
            leaf = self.gltf["nodes"][spring["joints"][-1]["node"]]
            self.assertTrue(leaf.get("children"), "spring endpoint must be explicit")
        for spring in sb["springs"][:2]:
            self.assertEqual(spring["colliderGroups"], [0, 1])
            for j in spring["joints"]:
                for key, value in dict(stiffness=1.6, gravityPower=.15, dragForce=.45, hitRadius=.012).items():
                    self.assertAlmostEqual(j[key], value, places=5)
                for actual, expected in zip(j["gravityDir"], (0, -1, 0)):
                    self.assertAlmostEqual(actual, expected, places=5)
        mats = {m["name"].split(".")[0]: m for m in self.gltf["materials"] if ".Outline" not in m["name"]}
        self.assertTrue({"Body", "EarInner", "Tail"} <= mats.keys())
        for name in ("Body", "EarInner", "Tail"):
            mt = mats[name]["extensions"]["VRMC_materials_mtoon"]
            self.assertEqual(mt["outlineWidthMode"], "worldCoordinates")
            self.assertAlmostEqual(mt["outlineWidthFactor"], .006, places=6)
        self.assertFalse(any(m["severity"] == 0 for m in self.report["plugin_validation"]))

    def test_05_pose_deformation_locality(self):
        def evaluated_points():
            bpy.context.view_layer.update()
            obj = self.obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = obj.to_mesh()
            points = [v.co.copy() for v in mesh.vertices[:len(self.points)]]
            obj.to_mesh_clear()
            return points
        # Disable outline geometry for a strict vertex-correspondence check.
        outlines = [m for m in self.obj.modifiers if m.type != "ARMATURE"]
        for m in outlines:
            m.show_viewport = False
        original = evaluated_points()
        pb = self.arm.pose.bones["EarL_2"]
        pb.rotation_mode = "XYZ"
        pb.rotation_euler.x = math.radians(25)
        bent = evaluated_points()
        pb.rotation_euler.x = 0
        for i, kind in enumerate(self.kinds):
            if kind != "ear_l":
                self.assertLess((original[i]-bent[i]).length, 1e-6)
        self.assertGreater(max((a-b).length for a, b in zip(original, bent)), .01)
        for m in outlines:
            m.show_viewport = True

    def test_99_plugin_round_trip(self):
        expected = self.report["humanoid_mapping"]
        reset_scene()
        result = bpy.ops.import_scene.vrm(filepath=str(self.root/"synthetic.vrm"))
        self.assertEqual(result, {"FINISHED"})
        arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
        self.assertEqual(len(arms), 1)
        ext = arms[0].data.vrm_addon_extension
        self.assertEqual(ext.spec_version, "1.0")
        actual = {k: getattr(ext.vrm1.humanoid.human_bones, k).node.bone_name for k in expected}
        self.assertEqual(actual, expected)
        self.assertTrue(all(b.length > .01 for b in arms[0].data.bones))
        sb = ext.spring_bone1
        self.assertEqual(len(sb.colliders), 2)
        self.assertEqual(len(sb.collider_groups), 2)
        self.assertEqual([[j.node.bone_name for j in s.joints] for s in sb.springs],
                         [[f"Ear{side}_{i}" for i in range(1, 5)] for side in ("L", "R")]+[["Tail"]])
        self.assertEqual([len(s.collider_groups) for s in sb.springs], [2, 2, 1])
        for spring in sb.springs[:2]:
            for joint in spring.joints:
                self.assertAlmostEqual(joint.stiffness, 1.6, places=5)
                self.assertAlmostEqual(joint.gravity_dir[2], -1, places=5)


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RigTests))
    if result.wasSuccessful():
        print(f"010 全部通过 {result.testsRun} 项", flush=True)
        shutil.rmtree(RigTests.root)
    else:
        print(f"010 失败现场：{getattr(RigTests, 'root', '初始化前失败')}", flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
