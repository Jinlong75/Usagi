"""031 focused MToon comparison; actual three-vrm raw bone matrices, no pose baking.

Run capture_arm_poses.mjs for before/after, then this Blender -b entry. Individual
frames go to --out; compose_arm_protection.py adds labels and fixed closeups.
"""
import argparse
import json
import math
import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Matrix, Vector
from common import reset_scene, script_args, run
from rig_usagi import enable_vrm
from face_usagi import preserve_source_rest_pose


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--before', required=True)
    parser.add_argument('--before-poses', required=True)
    parser.add_argument('--after', required=True)
    parser.add_argument('--after-poses', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(script_args())
    destination = Path(args.out)
    destination.mkdir(parents=True, exist_ok=True)
    enable_vrm()
    to_blender = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    evidence = {}
    for version, model, poses in (('before', args.before, args.before_poses), ('after', args.after, args.after_poses)):
        reset_scene()
        bpy.ops.import_scene.vrm(filepath=str(Path(model).resolve()))
        arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
        preserve_source_rest_pose(arm, model)
        snapshots = json.loads(Path(poses).read_text())
        body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('Usagi_Body'))
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 16
        scene.cycles.use_denoising = True
        scene.render.resolution_x = scene.render.resolution_y = 640
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.view_settings.view_transform = 'Standard'
        scene.world = bpy.data.worlds.new('031World')
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.8,.8,.8,1)
        scene.world.node_tree.nodes['Background'].inputs[1].default_value = .8
        light = bpy.data.objects.new('031Key', bpy.data.lights.new('031Key','AREA'))
        scene.collection.objects.link(light)
        light.data.energy, light.data.size = 70, 3
        light.location = (1,-3,4)
        light.rotation_euler = (Vector((0,0,.5))-light.location).to_track_quat('-Z','Y').to_euler()
        camera = bpy.data.objects.new('031Camera',bpy.data.cameras.new('031Camera'))
        scene.collection.objects.link(camera)
        scene.camera = camera
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = 1.22
        target = Vector((0,0,.5))
        for pose in ('yaw','arms','neutral'):
            for bone in arm.pose.bones:
                raw = Matrix([snapshots[pose]['bones'][bone.name][i:i+4] for i in range(0,16,4)]).transposed()
                bone.matrix = arm.matrix_world.inverted() @ to_blender @ raw
                bpy.context.view_layer.update()
            bpy.context.view_layer.update()
            # Compare the same linear skin without outline geometry to Node.
            outlines = [m for m in body.modifiers if m.type != 'ARMATURE']
            for m in outlines: m.show_viewport = False
            evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            actual = [body.matrix_world @ v.co for v in mesh.vertices]
            expected = [to_blender @ Vector(p) for p in snapshots[pose]['points']]
            # Blender joins material primitives and welds seam duplicates on
            # import. Nearest-position comparison handles that representation.
            from mathutils.kdtree import KDTree
            tree = KDTree(len(expected))
            for i, p in enumerate(expected): tree.insert(p,i)
            tree.balance()
            error = max(tree.find(p)[2] for p in actual)
            evaluated.to_mesh_clear()
            for m in outlines: m.show_viewport = True
            evidence[version+'_'+pose] = dict(blender_cpu_max_error=error)
            if error > 1e-6: raise RuntimeError('Blender / three-vrm pose mismatch: '+str(error))
            if pose == 'neutral' and version == 'before': continue
            markers = None
            if pose == 'neutral':
                frozen = json.loads((Path(__file__).resolve().parents[1]/'tests/data/031-protect.json').read_text())
                markers = []
                # Small emissive spheres mark every frozen sample in 3D; the
                # hidden side remains correctly occluded by the body surface.
                for group, color in (('head',(0.05,.35,1,1)),('hands',(1,.08,.04,1))):
                    mat = bpy.data.materials.new('031-'+group)
                    mat.diffuse_color = color
                    mat.use_nodes = True
                    nodes = mat.node_tree.nodes
                    nodes.clear()
                    emission = nodes.new('ShaderNodeEmission'); emission.inputs[0].default_value=color
                    output = nodes.new('ShaderNodeOutputMaterial')
                    mat.node_tree.links.new(emission.outputs[0],output.inputs[0])
                    verts, faces = [], []
                    for p in frozen[group]:
                        base=len(verts); x,y,z=p; r=.002
                        verts.extend(((x+r,y,z),(x-r,y,z),(x,y+r,z),(x,y-r,z),(x,y,z+r),(x,y,z-r)))
                        faces.extend(tuple(base+i for i in f) for f in ((0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)))
                    data=bpy.data.meshes.new('031Markers'); data.from_pydata(verts,[],faces)
                    marker=bpy.data.objects.new('031Markers',data);scene.collection.objects.link(marker);data.materials.append(mat)
                    markers.append(marker)
            for view, direction in (('front',(0,-1,0)),('45',(1,-1,.35))):
                camera.location=target+Vector(direction).normalized()*3
                camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
                scene.render.filepath=str(destination/f'{version}-{pose}-{view}.png')
                bpy.ops.render.render(write_still=True)
            if markers:
                for marker in markers: bpy.data.objects.remove(marker,do_unlink=True)
    (destination/'render-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')


if __name__ == '__main__': run(main)
