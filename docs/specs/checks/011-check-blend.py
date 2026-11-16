# 011 验收检查（主导维护，Blender 内运行，需启用 VRM 插件）：表情齐全、绑定贴片材质、happy 阻止 blink
import bpy, sys, os, addon_utils

def done(code, msg):
    print(msg)
    sys.stdout.flush()
    os._exit(code)

vrm_path = sys.argv[sys.argv.index("--") + 1]
mods = [m.__name__ for m in addon_utils.modules() if m.__name__.endswith(".vrm") or m.__name__ == "vrm"]
for m in mods:
    addon_utils.enable(m, default_set=True)
if not hasattr(bpy.ops.import_scene, "vrm"):
    done(1, "011 检查失败：VRM 插件未启用")
bpy.ops.import_scene.vrm(filepath=vrm_path)
arm = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"][0]
ext = arm.data.vrm_addon_extension
ex = ext.vrm1.expressions
preset = ex.preset
need = ["happy", "angry", "sad", "relaxed", "surprised", "aa", "ih", "ou", "ee", "oh",
        "blink", "blink_left", "blink_right", "neutral"]
bad = []
for n in need:
    e = getattr(preset, n, None)
    if e is None:
        bad.append(n + "(无)")
        continue
    if n != "neutral" and len(e.texture_transform_binds) == 0:
        bad.append(n + "(无贴图绑定)")
if bad:
    done(1, "011 检查失败：表情问题 " + ", ".join(bad))
if preset.happy.override_blink != "block":
    done(1, "011 检查失败：happy 的 overrideBlink 应为 block，实际 %s" % preset.happy.override_blink)
meshes = {o.name.split(".")[0] for o in bpy.context.scene.objects if o.type == "MESH"}
for m in ("FaceEyes", "FaceMouth"):
    if m not in meshes:
        done(1, "011 检查失败：缺少贴片网格 " + m)
done(0, "011 Blender 检查通过：网格 %s" % sorted(meshes))
