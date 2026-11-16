# 009 验收检查（主导维护，Blender 内运行）：底模朝向、连通块、材质、关键点字段
import bpy, bmesh, json, sys

def fail(msg):
    print("009 检查失败：" + msg)
    sys.stdout.flush()
    import os
    os._exit(1)

args = sys.argv[sys.argv.index("--") + 1:]
glb, lm_path = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb, merge_vertices=True)  # glTF 按材质拆点，合并后再数连通块
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if len(meshes) != 1:
    fail("网格对象数应为 1，实际 %d" % len(meshes))
ob = meshes[0]
names = {m.name.split(".")[0] for m in ob.data.materials if m}
for need in ("Body", "EarInner", "Tail"):
    if need not in names:
        fail("缺少材质 " + need)
counts = {}
for p in ob.data.polygons:
    n = ob.data.materials[p.material_index].name.split(".")[0]
    counts[n] = counts.get(n, 0) + 1
for need in ("Body", "EarInner", "Tail"):
    if counts.get(need, 0) == 0:
        fail("材质 %s 没有分到面" % need)
bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
seen = set(); groups = []
for f in bm.faces:
    if f.index in seen:
        continue
    group = [f]
    stack = [f]; seen.add(f.index)
    while stack:
        c = stack.pop()
        for e in c.edges:
            for g in e.link_faces:
                if g.index not in seen:
                    seen.add(g.index); stack.append(g); group.append(g)
    groups.append(group)
# D12（2026-11-16）：用户新模型 usagi3d2.glb 的尾巴是独立网格块，允许"主体 + 一块尾巴"。
# 第二块必须很小（< 5% 面数）、位于身体背面（正面朝 -Y，背面 y > 0）、且以 Tail 材质为主。
groups.sort(key=len, reverse=True)
if len(groups) > 2:
    fail("连通块应为 1（或主体 + 尾巴共 2），实际 %d" % len(groups))
if len(groups) == 2:
    small = groups[1]
    total = sum(len(g) for g in groups)
    cy = sum(f.calc_center_median().y for f in small) / len(small)
    tail_share = sum(1 for f in small if ob.material_slots[f.material_index].material and
                     ob.material_slots[f.material_index].material.name.startswith("Tail")) / len(small)
    if len(small) >= total * 0.05 or cy <= 0 or tail_share < 0.5:
        fail("第二个连通块不像尾巴：面数 %d/%d，中心 y=%.4f，Tail 材质占比 %.2f" % (len(small), total, cy, tail_share))
lm = json.load(open(lm_path))
fields = ["height", "feet_bottom", "hips", "chest", "neck", "head_center", "head_top",
          "arm_root_l", "arm_root_r", "arm_tip_l", "arm_tip_r", "leg_root_l", "leg_root_r",
          "foot_l", "foot_r", "ear_base_l", "ear_base_r", "ear_tip_l", "ear_tip_r",
          "ear_axis_l", "ear_axis_r", "tail", "face_center", "face_normal", "face_radius"]
miss = [k for k in fields if k not in lm]
if miss:
    fail("关键点缺字段：" + ", ".join(miss))
fn = lm["face_normal"]
if not (fn[1] < -0.7):
    fail("face_normal 应朝 -Y，实际 %s" % fn)
if not (lm["arm_root_l"][0] > 0 and lm["arm_root_r"][0] < 0):
    fail("左右约定错误：角色左手应在 +X")
if not (lm["ear_tip_l"][2] > lm["head_top"][2] and lm["ear_tip_r"][2] > lm["head_top"][2]):
    fail("耳尖应高于头顶")
if not (lm["tail"][1] > 0):
    fail("尾巴应在背后（+Y）")
print("009 Blender 检查通过：材质面数 %s" % counts)
sys.stdout.flush()
import os
os._exit(0)
