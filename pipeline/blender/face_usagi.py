"""Copy face surface polygons, attach rigid Head decals, export VRM UV expressions."""
import argparse
import itertools
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'face'))
import bpy
from mathutils import Vector
from common import reset_scene, run, script_args
from rig_usagi import enable_vrm, validate
from layout import EYES, MOUTHS, EXPRESSIONS, EMOTIONS, SCULPTURE, targets, offset, FRAMES


def plane(lm):
    normal = Vector(lm.get('face_normal', (0, -1, 0))).normalized()
    right = Vector((1, 0, 0))
    right = (right-normal*right.dot(normal)).normalized()
    return right, normal.cross(right).normalized(), normal


def patch(body, arm, name, material, lm):
    right, up, normal = plane(lm)
    xmin, xmax, vmin, vmax = FRAMES[name]
    vertices, faces, source_ids = [], [], {}
    # Select source polygons, including their original triangulation. A 15%+
    # transparent border lets us retain only faces wholly inside the UV frame.
    world = body.matrix_world
    normals = world.to_3x3().inverted().transposed()
    for poly in body.data.polygons:
        points = [world @ body.data.vertices[i].co for i in poly.vertices]
        if (normals @ poly.normal).dot(normal) <= .20:
            continue
        # The rear of a rounded head must never receive a second copy.
        if (sum(points, Vector())/len(points)-Vector(lm['head_center'])).dot(normal) <= 0:
            continue
        if not all(xmin <= p.dot(right) <= xmax and vmin <= p.dot(up) <= vmax for p in points):
            continue
        face = []
        for index in poly.vertices:
            if index not in source_ids:
                source_ids[index] = len(vertices)
                v = body.data.vertices[index]
                vertices.append(world @ v.co + (normals @ v.normal).normalized()*.0015)
            face.append(source_ids[index])
        faces.append(face)
    if not faces:
        raise ValueError(f'No body surface polygons selected for {name}')
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    obj.vertex_groups.new(name='Head').add(list(range(len(vertices))), 1, 'REPLACE')
    obj.modifiers.new('FaceHeadSkin', 'ARMATURE').object = arm
    uv = mesh.uv_layers.new(name='UVMap')
    # Raw mesh UV spans [0,1]; KHR_texture_transform selects a quarter-size cell.
    # Use un-offset source positions for UVs, so extrusion does not shift the art.
    inverse_ids = {v: k for k, v in source_ids.items()}
    for poly in mesh.polygons:
        poly.use_smooth = True
        for loop in poly.loop_indices:
            p = world @ body.data.vertices[inverse_ids[mesh.loops[loop].vertex_index]].co
            uv.data[loop].uv = ((p.dot(right)-xmin)/(xmax-xmin), (p.dot(up)-vmin)/(vmax-vmin))
    uvs = [tuple(loop.uv) for loop in uv.data]
    return obj, dict(vertices=len(vertices), faces=len(faces), source_body=body.name,
                     source_vertex_ids=list(source_ids), offset_m=.0015, head_weight=1,
                     uv_min=[min(p[i] for p in uvs) for i in (0, 1)],
                     uv_max=[max(p[i] for p in uvs) for i in (0, 1)], plane_bounds=FRAMES[name])


def set_transform(mat, value):
    for info in mat.vrm_addon_extension.mtoon1.uv_transformable_texture_info():
        if info.index.source:
            transform = info.extensions.khr_texture_transform
            transform.scale = (.25, .25)
            transform.offset = value


def material(name, image_path):
    mat = bpy.data.materials.new(name)
    image = bpy.data.images.load(str(Path(image_path).resolve()), check_existing=False)
    image.pack()
    mt = mat.vrm_addon_extension.mtoon1
    mt.enabled = True
    mt.alpha_mode = 'MASK'
    mt.alpha_cutoff = .5
    mt.double_sided = False
    base = mt.pbr_metallic_roughness
    # Fully emissive color from the same atlas; base/shade zero prevents lighting
    # from tinting line art. three-vrm transforms both map and emissiveMap.
    base.base_color_factor = (0, 0, 0, 1)
    base.base_color_texture.index.source = image
    mt.emissive_factor = (1, 1, 1)
    mt.extensions.khr_materials_emissive_strength.emissive_strength = 1
    mt.emissive_texture.index.source = image
    toon = mt.extensions.vrmc_materials_mtoon
    toon.shade_color_factor = (0, 0, 0)
    toon.outline_width_mode = 'none'
    toon.outline_width_factor = 0
    toon.render_queue_offset_number = 1
    set_transform(mat, (0, 0))
    return mat


# TODO(lead): During app/model integration, confirm one active emotion, blink and
# viseme per group. VRM override/isBinary do not arbitrate between peer emotions.
def configure_expressions(arm, materials):
    preset = arm.data.vrm_addon_extension.vrm1.expressions.preset
    report = {}
    for name in EXPRESSIONS:
        attr = {'blinkLeft': 'blink_left', 'blinkRight': 'blink_right'}.get(name, name)
        expr = getattr(preset, attr)
        expr.morph_target_binds.clear()
        expr.material_color_binds.clear()
        expr.texture_transform_binds.clear()
        expr.is_binary = True
        expr.override_blink = 'block' if name in EMOTIONS else 'none'
        expr.override_mouth = 'block' if name in EMOTIONS else 'none'
        expr.override_look_at = 'none'
        bindings = []
        for mat_name, tile in targets(name).items():
            names = EYES if mat_name == 'FaceEyes' else MOUTHS
            bind = expr.texture_transform_binds.add()
            bind.material = materials[mat_name]
            bind.scale = (.25, .25)
            bind.offset = offset(names, tile)
            bindings.append(dict(material=mat_name, tile=tile, scale=list(bind.scale), offset=list(bind.offset)))
        report[name] = dict(isBinary=True, overrideBlink=expr.override_blink,
                            overrideMouth=expr.override_mouth, overrideLookAt=expr.override_look_at,
                            textureTransformBinds=bindings)
    return report


def render_expressions(arm, materials, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = scene.render.resolution_y = 384
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'
    scene.world = bpy.data.worlds.new('FacePreviewWorld')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.8, .8, .8, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .8
    light = bpy.data.lights.new('FaceKey', 'AREA')
    light.energy, light.size = 70, 3
    lo = bpy.data.objects.new('FaceKey', light)
    scene.collection.objects.link(lo)
    lo.location = (1, -3, 4)
    lo.rotation_euler = (Vector((0, 0, .5))-lo.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.objects.new('FaceCamera', bpy.data.cameras.new('FaceCamera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type, camera.data.ortho_scale = 'ORTHO', .77
    target = Vector((0, -.04, .475))
    camera.location = target + Vector((0, -3, 0))
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
    preset = arm.data.vrm_addon_extension.vrm1.expressions.preset
    for name in EXPRESSIONS:
        for mat in materials.values():
            set_transform(mat, (0, 0))
        attr = {'blinkLeft': 'blink_left', 'blinkRight': 'blink_right'}.get(name, name)
        # Use the very binds that are exported, without plugin preview mixing.
        for bind in getattr(preset, attr).texture_transform_binds:
            set_transform(bind.material, tuple(bind.offset))
        bpy.context.view_layer.update()
        scene.render.filepath = str(destination/(name+'.png'))
        bpy.ops.render.render(write_still=True)
    for mat in materials.values():
        set_transform(mat, (0, 0))


def face(input_path, landmarks, atlas_dir, output, report_path, preview_dir=None):
    module = enable_vrm()
    reset_scene()
    if not Path(input_path).is_file():
        raise FileNotFoundError('rig stage required: '+str(input_path))
    if bpy.ops.import_scene.vrm(filepath=str(Path(input_path).resolve())) != {'FINISHED'}:
        raise RuntimeError('Could not import body VRM')
    arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    if len(arms) != 1:
        raise ValueError('Expected one rig armature')
    arm = arms[0]
    body = max((o for o in bpy.context.scene.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
    lm = json.loads(Path(landmarks).read_text())
    materials = {name: material(name, Path(atlas_dir)/file) for name, file in
                 (('FaceEyes', 'eyes_atlas.png'), ('FaceMouth', 'mouth_atlas.png'))}
    meshes, patches = {}, {}
    for name, mat in materials.items():
        meshes[name], patches[name] = patch(body, arm, name, mat, lm)
    expressions = configure_expressions(arm, materials)
    warnings = validate(arm, module)
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.vrm(filepath=str(output), armature_object_name=arm.name,
                                      export_only_selections=False, use_addon_preferences=False,
                                      ignore_warning=True)
    if result != {'FINISHED'} or not output.is_file():
        raise RuntimeError(f'Face VRM export failed: {result}')
    right, up, normal = plane(lm)
    sculpture = {}
    for name, (low, high) in SCULPTURE.items():
        points = [Vector((y, -x, z)) for x, y, z in itertools.product(*zip(low, high))]
        sculpture[name] = dict(source_bounds=[low, high],
                              rotated_bounds=[[min(p[i] for p in points) for i in range(3)],
                                              [max(p[i] for p in points) for i in range(3)]],
                              projected_bounds=[[min(p.dot(axis) for p in points), max(p.dot(axis) for p in points)]
                                                for axis in (right, up)])
    report = dict(patches=patches, expressions=expressions, plugin_validation=warnings,
                  atlas=dict(eyes=list(EYES), mouth=list(MOUTHS), grid=[4, 4], cell=512, margin=41),
                  plane=dict(right=list(right), up=list(up), normal=list(normal)),
                  sculpture=sculpture, alpha_mode='MASK', alpha_cutoff=.5,
                  blend_policy='Binary weights; emotions block blink/mouth; application must select one emotion, one blink and one viseme at a time. Offsets add relative to neutral.',
                  body_unchanged=True)
    Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    if preview_dir:
        render_expressions(arm, materials, preview_dir)
    return meshes, arm, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--in', dest='input', required=True)
    parser.add_argument('--landmarks', required=True)
    parser.add_argument('--atlas-dir', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--preview-dir')
    args = parser.parse_args(script_args())
    face(args.input, args.landmarks, args.atlas_dir, args.out, args.report, args.preview_dir)


if __name__ == '__main__':
    run(main)
