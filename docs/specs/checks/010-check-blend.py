# 010 验收检查（主导维护，Blender 内运行，需启用 VRM 插件）：人形骨骼、弹簧、碰撞体、材质、元信息
import bpy, sys, os, addon_utils

def done(code, msg):
    print(msg)
    sys.stdout.flush()
    os._exit(code)

vrm_path = sys.argv[sys.argv.index("--") + 1]
mods = [m.__name__ for m in addon_utils.modules() if m.__name__.endswith(".vrm") or m.__name__ == "vrm"]
if not mods:
    done(1, "010 检查失败：找不到 VRM 插件")
for m in mods:
    addon_utils.enable(m, default_set=True)
bpy.ops.wm.read_homefile(use_empty=True)
for m in mods:
    addon_utils.enable(m, default_set=True)
if not hasattr(bpy.ops.import_scene, "vrm"):
    done(1, "010 检查失败：VRM 插件未启用")
bpy.ops.import_scene.vrm(filepath=vrm_path)
arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
if len(arms) != 1:
    done(1, "010 检查失败：骨架数应为 1，实际 %d" % len(arms))
ext = arms[0].data.vrm_addon_extension
if ext.spec_version != "1.0":
    done(1, "010 检查失败：不是 VRM 1.0（%s）" % ext.spec_version)
hb = ext.vrm1.humanoid.human_bones
required = ["hips", "spine", "head", "left_upper_arm", "left_lower_arm", "left_hand",
            "right_upper_arm", "right_lower_arm", "right_hand", "left_upper_leg", "left_lower_leg",
            "left_foot", "right_upper_leg", "right_lower_leg", "right_foot", "chest", "neck"]
missing = [n for n in required if not getattr(hb, n).node.bone_name]
if missing:
    done(1, "010 检查失败：人形骨骼未映射 " + ", ".join(missing))
sb = ext.spring_bone1
if len(sb.springs) < 3:
    done(1, "010 检查失败：弹簧数应 ≥3（两耳 + 尾巴），实际 %d" % len(sb.springs))
if len(sb.colliders) < 2:
    done(1, "010 检查失败：碰撞体应 ≥2，实际 %d" % len(sb.colliders))
ear_joints = sum(len(s.joints) for s in sb.springs if any("Ear" in j.node.bone_name for j in s.joints))
if ear_joints < 6:
    done(1, "010 检查失败：耳朵弹簧关节过少（%d）" % ear_joints)
mats = [m for m in bpy.data.materials if m.users]
names = {m.name.split(".")[0] for m in mats}
for need in ("Body", "EarInner", "Tail"):
    if need not in names:
        done(1, "010 检查失败：缺少材质 " + need)
for m in mats:
    if m.name.split(".")[0] in ("Body", "EarInner", "Tail"):
        mt = m.vrm_addon_extension.mtoon1
        if not mt.enabled:
            done(1, "010 检查失败：材质 %s 不是 MToon" % m.name)
        if mt.extensions.vrmc_materials_mtoon.outline_width_mode == "none":
            done(1, "010 检查失败：材质 %s 没有描边" % m.name)
meta = ext.vrm1.meta
if meta.vrm_name != "Usagi" or meta.allow_redistribution:
    done(1, "010 检查失败：元信息不符（name=%s, allowRedistribution=%s）" % (meta.vrm_name, meta.allow_redistribution))
done(0, "010 Blender 检查通过：弹簧 %d 条、碰撞体 %d 个、耳朵关节 %d" % (len(sb.springs), len(sb.colliders), ear_joints))
