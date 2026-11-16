"""Landmark driven VRM 1.0 rig. Blender -b (without --factory-startup)."""
import argparse
import importlib
import json
import math
import re
import sys
import uuid
from array import array
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import addon_utils
import bpy
from mathutils import Vector, Quaternion
from common import import_model, reset_scene, run, script_args
from prep_usagi import linear_color

EAR_SPRING = dict(stiffness=1.6, gravity_power=0.15, gravity_dir=(0, 0, -1),
                  drag_force=0.45, hit_radius=0.012)  # Blender Z-up -> VRM (0,-1,0)
TAIL_SPRING = dict(stiffness=2.5, gravity_power=0.15, gravity_dir=(0, 0, -1),
                   drag_force=0.6, hit_radius=0.012)
NECK_HALF_WIDTH = 0.06
ARM_ROOT_BLEND = 0.024
LEG_ROOT_BLEND = 0.025
MATERIAL_COLORS = {"Body": ("FFF1C1", "F0D9A0"), "EarInner": ("F7B8C4", "E9A0B0"),
                   "Tail": ("FFFFFF", "E8E8EE")}
HUMANOID = {"hips": "Hips", "spine": "Spine", "chest": "Chest", "neck": "Neck", "head": "Head"}
for side in ("left", "right"):
    for part in ("UpperArm", "LowerArm", "Hand", "UpperLeg", "LowerLeg", "Foot"):
        HUMANOID[side + "_" + re.sub(r"(?<!^)(?=[A-Z])", "_", part).lower()] = side.title() + part


def enable_vrm():
    modules = [m.__name__ for m in addon_utils.modules()
               if m.__name__ == "vrm" or m.__name__.endswith(".vrm")]
    if not modules:
        raise RuntimeError("Install VRM Add-on for Blender; do not use --factory-startup")
    module = modules[0]
    addon_utils.enable(module, default_set=False)
    bpy.ops.export_scene.vrm.get_rna_type()
    return module


def smoothstep(low, high, value):
    t = min(1.0, max(0.0, (value - low) / (high - low)))
    return t * t * (3 - 2 * t)


def segment_projection(point, a, b):
    direction = b - a
    t = max(0, min(1, (point - a).dot(direction) / direction.length_squared))
    return t, (point - a.lerp(b, t)).length


def make_armature(lm):
    data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    ext = data.vrm_addon_extension
    ext.spec_version = "1.0"
    ext.vrm0.humanoid.initial_automatic_bone_assignment = False
    ext.vrm1.humanoid.human_bones.initial_automatic_bone_assignment = False
    # Landmarks already define the rest T-pose; preserve it through export.
    ext.vrm1.humanoid.pose = "restPositionPose"
    bpy.ops.object.mode_set(mode="EDIT")
    def bone(name, head, tail, parent=None):
        b = data.edit_bones.new(name)
        b.head, b.tail = head, tail
        if b.length <= .01:
            raise ValueError(f"Bone too short: {name} ({b.length})")
        if parent:
            b.parent = data.edit_bones[parent]
            b.use_connect = (b.head - b.parent.tail).length < 1e-6
        # Local +Z points toward Blender -Y (front), except near-parallel bones.
        front = Vector((0, -1, 0))
        b.align_roll(front if abs((b.tail-b.head).normalized().dot(front)) < .95 else Vector((0, 0, 1)))
    hips, chest, neck = (Vector(lm[k]) for k in ("hips", "chest", "neck"))
    hip_tail = hips.lerp(chest, .25)
    head_base = neck + Vector((0, 0, .04))
    bone("Hips", hips, hip_tail)
    bone("Spine", hip_tail, chest, "Hips")
    bone("Chest", chest, neck, "Spine")
    bone("Neck", neck, head_base, "Chest")
    bone("Head", head_base, lm["head_top"], "Neck")
    for side, label in (("l", "Left"), ("r", "Right")):
        root, tip = Vector(lm[f"arm_root_{side}"]), Vector(lm[f"arm_tip_{side}"])
        bone(label+"Shoulder", neck, root, "Chest")
        points = [root, root.lerp(tip, .4), root.lerp(tip, .8), tip]
        parent = label+"Shoulder"
        for i, part in enumerate(("UpperArm", "LowerArm", "Hand")):
            bone(label+part, points[i], points[i+1], parent)
            parent = label+part
        root, foot = Vector(lm[f"leg_root_{side}"]), Vector(lm[f"foot_{side}"])
        ankle = root.lerp(foot, .73)
        knee = root.lerp(ankle, .5)
        bone(label+"UpperLeg", root, knee, "Hips")
        bone(label+"LowerLeg", knee, ankle, label+"UpperLeg")
        bone(label+"Foot", ankle, foot, label+"LowerLeg")
        points = lm[f"ear_axis_{side}"]
        parent = "Head"
        for i in range(4):
            name = f"Ear{side.upper()}_{i+1}"
            bone(name, points[i], points[i+1], parent)
            parent = name
        # Explicit endpoints let VRM runtimes derive the final joint's length.
        end = Vector(points[-1])
        direction = (end-Vector(points[-2])).normalized()
        bone(f"Ear{side.upper()}_Tip", end, end+direction*.012, parent)
    tail = Vector(lm["tail"])
    bone("Tail", tail - Vector((0, .04, 0)), tail + Vector((0, .04, 0)), "Hips")
    bone("TailTip", tail+Vector((0, .04, 0)), tail+Vector((0, .052, 0)), "Tail")
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.show_in_front = True
    return arm


def regions(obj, lm):
    """Disjoint semantic masks; Tail uses preserved 009 region membership."""
    tail_group = obj.vertex_groups.get("Tail")
    tail_ids = {v.index for v in obj.data.vertices if tail_group and
                any(g.group == tail_group.index and g.weight > .5 for g in v.groups)}
    result = []
    for v in obj.data.vertices:
        p = v.co
        side = "l" if p.x >= 0 else "r"
        root = Vector(lm[f"arm_root_{side}"])
        leg = Vector(lm[f"leg_root_{side}"])
        if (p - Vector(lm["face_center"])).length <= lm["face_radius"] * .6:
            kind = "face"
        elif p.z > lm["head_top"][2]:
            kind = "ear_"+side
        elif v.index in tail_ids:
            kind = "tail"
        elif (abs(p.x) > abs(root.x) - ARM_ROOT_BLEND and
              abs(p.z-root.z) < .055 and abs(p.y-root.y) < .10):
            kind = "arm_"+side
        elif p.z < leg.z + LEG_ROOT_BLEND and abs(p.x) > .005:
            kind = "leg_"+side
        else:
            kind = "trunk"
        result.append(kind)
    return result


def chain_weights(point, names, arm):
    """Distance to bone segments, blended between segment centers, max 2 joints."""
    bones = [arm.data.bones[name] for name in names]
    centers = [(b.head_local + b.tail_local) * .5 for b in bones]
    nearest = min(range(len(bones)), key=lambda i: segment_projection(point, bones[i].head_local, bones[i].tail_local)[1])
    pairs = [i for i in (nearest-1, nearest) if 0 <= i < len(bones)-1]
    for i in pairs:
        direction = centers[i+1] - centers[i]
        t = (point - centers[i]).dot(direction) / direction.length_squared
        if 0 <= t <= 1:
            t = smoothstep(0, 1, t)
            return {names[i]: 1-t, names[i+1]: t}
    return {names[nearest]: 1.0}


def geometry_weights(point, kind, arm, lm):
    if kind == "face":
        return {"Head": 1.0}
    if kind == "tail":
        return {"Tail": 1.0}
    if kind.startswith("ear_"):
        side = kind[-1]
        names = [f"Ear{side.upper()}_{i}" for i in range(1, 5)]
        weights = chain_weights(point, names, arm)
        root, end = Vector(lm[f"ear_axis_{side}"][0]), Vector(lm[f"ear_axis_{side}"][1])
        blend = smoothstep(root.z, (root.z+end.z)*.5, point.z)
        return {**{name: w*blend for name, w in weights.items()}, "Head": 1-blend}
    if kind.startswith("arm_"):
        side = kind[-1]
        label = "Left" if side == "l" else "Right"
        weights = chain_weights(point, [label+p for p in ("UpperArm", "LowerArm", "Hand")], arm)
        root_x = abs(lm[f"arm_root_{side}"][0])
        blend = smoothstep(root_x-ARM_ROOT_BLEND, root_x+ARM_ROOT_BLEND, abs(point.x))
        return {**{name: w*blend for name, w in weights.items()}, "Chest": 1-blend}
    if kind.startswith("leg_"):
        side = kind[-1]
        label = "Left" if side == "l" else "Right"
        weights = chain_weights(point, [label+p for p in ("UpperLeg", "LowerLeg", "Foot")], arm)
        root_z = lm[f"leg_root_{side}"][2]
        blend = 1-smoothstep(root_z-LEG_ROOT_BLEND, root_z+LEG_ROOT_BLEND, point.z)
        return {**{name: w*blend for name, w in weights.items()}, "Hips": 1-blend}
    # Spread head rotation through a broad height band to avoid a waist crease.
    neck = lm["neck"][2]
    blend = smoothstep(neck-NECK_HALF_WIDTH, neck+NECK_HALF_WIDTH, point.z)
    # Use the same broad band outside the rigid face core: a narrower radial
    # transition can still pinch the lower face when the Head turns 30 degrees.
    distance = (point-Vector(lm["face_center"])).length
    face_core = lm["face_radius"]*.6
    protection = 1-smoothstep(face_core, face_core+NECK_HALF_WIDTH*2, distance)
    # Smooth union avoids the derivative kink where the two bands intersect.
    blend += (1-blend)*protection
    # Face protection can extend below the height band. Blend it into the normal
    # torso chain there too, instead of cutting it off at neck - half_width.
    torso = chain_weights(point, ["Hips", "Spine", "Chest"], arm)
    return {**{name: w*(1-blend) for name, w in torso.items()}, "Head": blend}


def vertex_weights(obj, arm):
    names = {g.index: g.name for g in obj.vertex_groups if g.name in arm.data.bones}
    return [{names[g.group]: g.weight for g in v.groups if g.group in names and g.weight > 1e-7}
            for v in obj.data.vertices]


def weight_report(obj, arm, lm, kinds):
    all_weights = vertex_weights(obj, arm)
    checks = {k: [] for k in ("ear_region", "ear_tip", "tail_region", "limb_isolation", "face_region")}
    counts = dict.fromkeys(arm.data.bones.keys(), 0)
    unnormalized, zero, maximum = [], [], 0
    samples = dict.fromkeys(checks, 0)
    for v, kind, weights in zip(obj.data.vertices, kinds, all_weights):
        names = set(weights)
        maximum = max(maximum, len(weights))
        if not names:
            zero.append(v.index)
        if abs(sum(weights.values())-1) > 1e-4:
            unnormalized.append(v.index)
        for name in names:
            counts[name] += 1
        if kind.startswith("ear_"):
            allowed = {"Head"} | {f"Ear{kind[-1].upper()}_{i}" for i in range(1, 5)}
            samples["ear_region"] += 1
            if not names <= allowed:
                checks["ear_region"].append(v.index)
            axis = lm[f"ear_axis_{kind[-1]}"]
            if v.co.z >= axis[-1][2] - (axis[-1][2]-axis[0][2]) * .08:
                samples["ear_tip"] += 1
                if weights.get(f"Ear{kind[-1].upper()}_4", 0) < .8:
                    checks["ear_tip"].append(v.index)
        if "Tail" in names and kind != "tail":
            checks["tail_region"].append(v.index)
        if kind == "tail":
            samples["tail_region"] += 1
        if kind.startswith(("arm_", "leg_")):
            samples["limb_isolation"] += 1
            label = "Left" if kind[-1] == "l" else "Right"
            parts = ("UpperArm", "LowerArm", "Hand") if kind.startswith("arm") else ("UpperLeg", "LowerLeg", "Foot")
            allowed = {label+p for p in parts} | ({"Chest"} if kind.startswith("arm") else {"Hips"})
            if not names <= allowed:
                checks["limb_isolation"].append(v.index)
        if kind == "face":
            samples["face_region"] += 1
            if names != {"Head"} or abs(weights.get("Head", 0)-1) > 1e-4:
                checks["face_region"].append(v.index)
    return dict(per_bone_vertex_count=counts, max_influences=maximum,
                unnormalized_vertices=len(unnormalized), zero_weight_vertices=len(zero),
                constraint_failures={k: len(v) for k, v in checks.items()},
                constraint_samples=samples, region_counts={k: kinds.count(k) for k in sorted(set(kinds))},
                valid=maximum <= 4 and not zero and not unnormalized and not any(checks.values()))


def bind_weights(obj, arm, lm):
    kinds = regions(obj, lm)
    # Save semantic membership before auto-parenting overwrites same-name Tail group.
    obj.vertex_groups.clear()
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    auto = {"attempted": True, "operator_finished": False, "accepted": False}
    try:
        result = bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        auto["operator_finished"] = result == {"FINISHED"}
        auto["quality"] = weight_report(obj, arm, lm, kinds)
        auto["accepted"] = auto["operator_finished"] and auto["quality"]["valid"]
    except RuntimeError as exc:
        auto["error"] = str(exc)
    if not auto["accepted"]:
        obj.vertex_groups.clear()
        groups = {b.name: obj.vertex_groups.new(name=b.name) for b in arm.data.bones}
        for v, kind in zip(obj.data.vertices, kinds):
            weights = {n: w for n, w in geometry_weights(v.co, kind, arm, lm).items() if w > 1e-7}
            total = sum(weights.values())
            for name, weight in weights.items():
                groups[name].add([v.index], weight/total, "REPLACE")
    obj.parent = arm
    modifier = next((m for m in obj.modifiers if m.type == "ARMATURE"), None)
    if modifier is None:
        modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = arm
    # VRM linear skinning and Blender preview use the same deformation model.
    modifier.use_deform_preserve_volume = False
    report = weight_report(obj, arm, lm, kinds)
    if not report["valid"]:
        raise RuntimeError("Weight constraints failed: " + json.dumps(report))
    return auto, report, kinds


def configure_vrm(arm, lm):
    ext = arm.data.vrm_addon_extension
    ext.spec_version = "1.0"
    bones = ext.vrm1.humanoid.human_bones
    bones.initial_automatic_bone_assignment = False
    for key, value in HUMANOID.items():
        getattr(bones, key).node.bone_name = value
    # Optional shoulders keep the entire hierarchy explicit.
    for side in ("left", "right"):
        getattr(bones, side+"_shoulder").node.bone_name = side.title()+"Shoulder"
    meta = ext.vrm1.meta
    meta.vrm_name, meta.version = "Usagi", "0.1"
    meta.authors.clear()
    meta.authors.add().value = "Usagi Desktop Pet (personal)"
    meta.copyright_information = "角色版权归《Chiikawa》原作者，仅个人使用。"
    meta.avatar_permission = "onlyAuthor"
    meta.commercial_usage = "personalNonProfit"
    meta.credit_notation = "required"
    meta.other_license_url = ""
    for key in ("allow_redistribution", "allow_excessively_violent_usage", "allow_excessively_sexual_usage",
                "allow_political_or_religious_usage", "allow_antisocial_or_hate_usage"):
        setattr(meta, key, False)
    sb = ext.spring_bone1
    collider_report = []
    # Conservative sphere for the rounded trunk, derived from head radius and trunk height.
    body_center = Vector(lm["hips"]).lerp(Vector(lm["chest"]), .5)
    for name, center, radius in (("Head", Vector(lm["head_center"]), lm["face_radius"]*.95),
                                  ("Chest", body_center, min(lm["face_radius"]*.70, .17))):
        collider = sb.colliders.add()
        collider.uuid = uuid.uuid4().hex
        collider.node.bone_name = name
        collider.shape_type = "Sphere"
        collider.reset_bpy_object(bpy.context, arm)
        collider.shape.sphere.offset = arm.data.bones[name].matrix_local.inverted() @ center
        collider.shape.sphere.radius = radius
        group = sb.collider_groups.add()
        group.uuid = uuid.uuid4().hex
        group.vrm_name = name+"Collision"
        group.colliders.add().collider_uuid = collider.uuid
        collider_report.append(dict(bone=name, center=list(center), radius=radius,
                                    offset=list(collider.shape.sphere.offset)))
    spring_report = []
    for name, joints, params, groups in (
        ("LeftEar", [f"EarL_{i}" for i in range(1, 5)]+["EarL_Tip"], EAR_SPRING, [0, 1]),
        ("RightEar", [f"EarR_{i}" for i in range(1, 5)]+["EarR_Tip"], EAR_SPRING, [0, 1]),
        ("Tail", ["Tail", "TailTip"], TAIL_SPRING, [1])):
        spring = sb.springs.add()
        spring.vrm_name = name
        for bone in joints:
            joint = spring.joints.add()
            joint.node.bone_name = bone
            for key, value in params.items():
                setattr(joint, key, value)
        for index in groups:
            spring.collider_groups.add().collider_group_uuid = sb.collider_groups[index].uuid
        spring_report.append(dict(name=name, joints=joints, **params,
                                  collider_groups=[sb.collider_groups[i].vrm_name for i in groups]))
    return collider_report, spring_report


def configure_materials(obj):
    for mat in obj.data.materials:
        name = mat.name.split(".")[0]
        base, shade = MATERIAL_COLORS[name]
        mt = mat.vrm_addon_extension.mtoon1
        mt.enabled = True
        mt.pbr_metallic_roughness.base_color_factor = linear_color(base)
        mt.pbr_metallic_roughness.base_color_texture.index.source = None
        toon = mt.extensions.vrmc_materials_mtoon
        toon.shade_color_factor = linear_color(shade)[:3]
        toon.shading_shift_factor = -.05
        toon.shading_toony_factor = .95
        toon.outline_width_mode = "worldCoordinates"
        toon.outline_width_factor = .006
        toon.outline_color_factor = linear_color("4A2A1A")[:3]
        mat.diffuse_color = linear_color(base)


def validate(arm, module):
    validation = importlib.import_module(module+".editor.validation")
    # Use the plugin's real error collection, including exact translated messages/severity.
    error_type = validation.VrmValidationError
    class UsagiValidation(bpy.types.PropertyGroup):
        errors: bpy.props.CollectionProperty(type=error_type)
    bpy.utils.register_class(UsagiValidation)
    bpy.types.Scene.usagi_validation = bpy.props.PointerProperty(type=UsagiValidation)
    try:
        errors = bpy.context.scene.usagi_validation.errors
        failed = validation.WM_OT_vrm_validator.detect_errors(bpy.context, errors, arm.name)
        messages = [dict(severity=e.severity, message=e.message) for e in errors]
        if failed:
            raise RuntimeError("VRM validation: " + json.dumps(messages, ensure_ascii=False))
        return messages
    finally:
        del bpy.types.Scene.usagi_validation
        bpy.utils.unregister_class(UsagiValidation)


def render_poses(obj, arm, destination, size=384):
    """Focused Cycles renders: plugin MToon nodes + actual world-width outline modifier."""
    from render_preview import make_sheet
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("RigPreviewWorld")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.8, .8, .8, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .8
    light = bpy.data.lights.new("RigKey", "AREA")
    light.energy, light.shape, light.size = 70, "DISK", 3
    light_obj = bpy.data.objects.new("RigKey", light)
    scene.collection.objects.link(light_obj)
    light_obj.location = (1, -3, 4)
    light_obj.rotation_euler = (Vector((0, 0, .5))-light_obj.location).to_track_quat("-Z", "Y").to_euler()
    camera = bpy.data.objects.new("RigCamera", bpy.data.cameras.new("RigCamera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 1.35
    target = Vector((0, 0, .50))
    def rotate(name, axis, degrees):
        pb = arm.pose.bones[name]
        pb.rotation_mode = "QUATERNION"
        local_axis = arm.data.bones[name].matrix_local.to_3x3().inverted() @ Vector(axis)
        pb.rotation_quaternion = Quaternion(local_axis, math.radians(degrees))
    paths = []
    # TODO(lead): Short 009 arms enter the head silhouette when raised; confirm
    # acceptable animation ranges without changing the source proportions here.
    poses = ("neutral_t", "arms_up", "arms_down_70", "head_left_30", "ears_back_25", "one_leg_up")
    for pose in (*poses, "head_left_20"):
        for pb in arm.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = Quaternion()
        if pose in {"arms_up", "arms_down_70"}:
            angle = 70 if pose == "arms_up" else -70
            rotate("LeftUpperArm", (0, -1, 0), angle)
            rotate("RightUpperArm", (0, -1, 0), -angle)
        elif pose in {"head_left_20", "head_left_30"}:
            rotate("Head", (0, 0, 1), 20 if pose == "head_left_20" else 30)
        elif pose == "ears_back_25":
            for side in ("L", "R"):
                for i in range(1, 5):
                    rotate(f"Ear{side}_{i}", (-1, 0, 0), 25)
        elif pose == "one_leg_up":
            rotate("LeftUpperLeg", (-1, 0, 0), 55)
            rotate("LeftLowerLeg", (1, 0, 0), 35)
        bpy.context.view_layer.update()
        for view, direction in (("front", (0, -1, 0)), ("45", (1, -1, .35))):
            if pose == "head_left_20" and view != "front":
                continue
            camera.location = target + Vector(direction).normalized()*3
            camera.rotation_euler = (target-camera.location).to_track_quat("-Z", "Y").to_euler()
            path = destination / f"{pose}_{view}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            if pose in poses:
                paths.append(path)
    # Two rows (front / 45), six columns. make_sheet preserves pixels; then stack rows.
    make_sheet(paths[::2], destination/".front.png", size)
    make_sheet(paths[1::2], destination/".45.png", size)
    sheet = bpy.data.images.new("PoseSheet", width=size*6, height=size*2, alpha=True)
    pixels = array("f", [0])* (size*size*6*2*4)
    for row, filename in ((1, ".front.png"), (0, ".45.png")):
        picture = bpy.data.images.load(str(destination/filename), check_existing=False)
        source = array("f", [0])* (size*size*6*4)
        picture.pixels.foreach_get(source)
        start = row*len(source)
        pixels[start:start+len(source)] = source
        bpy.data.images.remove(picture)
        (destination/filename).unlink()
    sheet.pixels.foreach_set(pixels)
    sheet.filepath_raw = str(destination/"pose_sheet.png")
    sheet.file_format = "PNG"
    sheet.save()
    bpy.data.images.remove(sheet)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()


def rig(input_path, landmarks, output, report_path, blend_path=None, preview_dir=None):
    module = enable_vrm()
    reset_scene()
    objects = import_model(input_path)
    if len(objects) != 1:
        raise ValueError("Expected a single prepared mesh")
    obj = objects[0]
    # Bake importer transforms: landmark coordinates are world Blender Z-up.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lm = json.loads(Path(landmarks).read_text(encoding="utf-8"))
    arm = make_armature(lm)
    auto, weights, kinds = bind_weights(obj, arm, lm)
    colliders, springs = configure_vrm(arm, lm)
    configure_materials(obj)
    warnings = validate(arm, module)
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.vrm(filepath=str(output), armature_object_name=arm.name,
                                      export_only_selections=False, use_addon_preferences=False,
                                      ignore_warning=True)
    if result != {"FINISHED"} or not output.is_file():
        raise RuntimeError(f"VRM export failed: {result}")
    report = dict(plugin_module=module, vrm_version="1.0", automatic_weights=auto,
                  weight_method="bone_heat" if auto["accepted"] else "geometry",
                  weights=weights, humanoid_mapping={k: getattr(arm.data.vrm_addon_extension.vrm1.humanoid.human_bones, k).node.bone_name for k in HUMANOID},
                  bones=[dict(name=b.name, length=b.length, parent=b.parent.name if b.parent else None,
                              head=list(b.head_local), tail=list(b.tail_local)) for b in arm.data.bones],
                  colliders=colliders, springs=springs, plugin_validation=warnings,
                  transition_widths=dict(neck=NECK_HALF_WIDTH*2, face_protection=NECK_HALF_WIDTH*2,
                                         arm_root=ARM_ROOT_BLEND*2,
                                         leg_root=LEG_ROOT_BLEND*2),
                  coordinate_system="Blender Z-up, front -Y; spring gravity exports as VRM (0,-1,0)")
    Path(report_path).parent.mkdir(parents=True, exist_ok=True)
    Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    if blend_path:
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(blend_path).resolve()), check_existing=False)
    if preview_dir:
        render_poses(obj, arm, preview_dir)
    return obj, arm, report, kinds


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="input", required=True)
    parser.add_argument("--landmarks", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--blend")
    parser.add_argument("--preview-dir")
    args = parser.parse_args(script_args())
    rig(args.input, args.landmarks, args.out, args.report, args.blend, args.preview_dir)


if __name__ == "__main__":
    run(main)
