"""011: run face on 010's synthetic body, inspect GLB and plugin round trip."""
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'blender'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'face'))
import bpy
from mathutils import Vector
from common import reset_scene
from test_rig_usagi import synthetic
from rig_usagi import rig, vertex_weights
from face_usagi import face
from layout import EXPRESSIONS


def glb_json(path):
    data = Path(path).read_bytes()
    return json.loads(data[20:20+struct.unpack_from('<I', data, 12)[0]])


def body_triangles(path):
    """Compare actual triangles/skin, independent of exporter's seam splitting."""
    data = Path(path).read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+json_length])
    binary = memoryview(data)[28+json_length:]
    def accessor(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        count = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
        fmt = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[a['componentType']]
        unpacker = struct.Struct('<'+fmt*count)
        stride = view.get('byteStride', unpacker.size)
        start = view.get('byteOffset', 0)+a.get('byteOffset', 0)
        return [unpacker.unpack_from(binary, start+i*stride) for i in range(a['count'])]
    index = max(range(len(doc['meshes'])),
                key=lambda i: sum(doc['accessors'][p['indices']]['count'] for p in doc['meshes'][i]['primitives']))
    node = next(n for n in doc['nodes'] if n.get('mesh') == index)
    bones = [doc['nodes'][i]['name'] for i in doc['skins'][node['skin']]['joints']]
    result = {}
    for primitive in doc['meshes'][index]['primitives']:
        attr = primitive['attributes']
        positions, joints, weights = (accessor(attr[k]) for k in ('POSITION', 'JOINTS_0', 'WEIGHTS_0'))
        indices = [i[0] for i in accessor(primitive['indices'])]
        vertices = [(position, {bones[j]: w for j, w in zip(js, ws) if w > 1e-7})
                    for position, js, ws in zip(positions, joints, weights)]
        triangles = [sorted([vertices[i] for i in indices[start:start+3]],
                            key=lambda v: tuple(round(c, 4) for c in v[0]))
                     for start in range(0, len(indices), 3)]
        triangles.sort(key=lambda triangle: tuple(round(c, 4) for v in triangle for c in v[0]))
        name = doc['materials'][primitive['material']]['name'].split('.')[0]
        result[name] = triangles
    return result


class FaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix='usagi-face-'))
        cls.lm = synthetic(cls.root)
        body, arm, _, _ = rig(cls.root/'synthetic.glb', cls.root/'landmarks.json',
                              cls.root/'body.vrm', cls.root/'rig-report.json')
        draw = Path(__file__).resolve().parents[1]/'face'/'draw_atlas.py'
        result = subprocess.run([os.environ['FACE_PYTHON'], str(draw), '--out', str(cls.root/'atlas')],
                                capture_output=True, text=True)
        (cls.root/'atlas.log').write_text(result.stdout+result.stderr)
        if result.returncode:
            raise RuntimeError('Atlas generation failed: '+str(cls.root/'atlas.log'))
        cls.meshes, cls.arm, cls.report = face(cls.root/'body.vrm', cls.root/'landmarks.json',
                                              cls.root/'atlas', cls.root/'face.vrm', cls.root/'report.json')
        cls.gltf = glb_json(cls.root/'face.vrm')
        cls.body_gltf = glb_json(cls.root/'body.vrm')

    def test_01_source_surface_and_skin(self):
        body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name not in self.meshes)
        for name in ('FaceEyes', 'FaceMouth'):
            obj = self.meshes[name]
            self.assertGreater(len(obj.data.polygons), 0)
            self.assertEqual({g.name for g in obj.vertex_groups}, {'Head'})
            self.assertEqual(vertex_weights(obj, self.arm), [{'Head': 1.0}]*len(obj.data.vertices))
            self.assertTrue(any(m.type == 'ARMATURE' and m.object == self.arm for m in obj.modifiers))
            self.assertTrue(all(0 <= c <= 1 for uv in obj.data.uv_layers.active.data for c in uv.uv))
            source_ids = self.report['patches'][name]['source_vertex_ids']
            for vertex, index in zip(obj.data.vertices, source_ids):
                source = body.data.vertices[index]
                delta = vertex.co - body.matrix_world @ source.co
                self.assertAlmostEqual(delta.length, .0015, delta=1e-6)
                self.assertGreater(delta.dot(source.normal), .00149)

    def test_02_exported_expressions_materials_and_offsets(self):
        presets = self.gltf['extensions']['VRMC_vrm']['expressions']['preset']
        self.assertTrue(set(EXPRESSIONS) <= set(presets))
        extras = set(presets)-set(EXPRESSIONS)
        self.assertTrue(extras <= {'lookUp', 'lookDown', 'lookLeft', 'lookRight'})
        for name in extras:
            self.assertFalse(presets[name].get('textureTransformBinds'))
            self.assertFalse(presets[name].get('morphTargetBinds'))
            self.assertFalse(presets[name].get('materialColorBinds'))
        eyes = ('neutral', 'blink', 'blinkLeft', 'blinkRight', 'happy', 'angry', 'sad', 'relaxed', 'surprised')
        mouths = ('neutral', 'aa', 'ih', 'ou', 'ee', 'oh', 'happy', 'angry', 'sad', 'surprised')
        for name in EXPRESSIONS:
            e = presets[name]
            self.assertTrue(e['isBinary'])
            self.assertFalse(e.get('morphTargetBinds'))
            self.assertFalse(e.get('materialColorBinds'))
            expected = {'FaceEyes', 'FaceMouth'} if name in ('neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised') else ({'FaceEyes'} if name.startswith('blink') else {'FaceMouth'})
            binds = e['textureTransformBinds']
            self.assertEqual({self.gltf['materials'][b['material']]['name'] for b in binds}, expected)
            self.assertEqual(len(binds), len(expected))
            for b in binds:
                material = self.gltf['materials'][b['material']]
                names = eyes if material['name'] == 'FaceEyes' else mouths
                tile = name if name in names else 'neutral'
                index = names.index(tile)
                self.assertEqual(b['scale'], [.25, .25])
                self.assertEqual(b['offset'], [index%4/4, index//4/4])
            if name in ('happy', 'angry', 'sad', 'relaxed', 'surprised'):
                self.assertEqual(e['overrideBlink'], 'block')
                self.assertEqual(e['overrideMouth'], 'block')
                self.assertEqual(e.get('overrideLookAt', 'none'), 'none')
        for mat in self.gltf['materials']:
            if mat['name'] not in ('FaceEyes', 'FaceMouth'):
                continue
            self.assertEqual(mat['alphaMode'], 'MASK')
            self.assertEqual(mat['alphaCutoff'], .5)
            self.assertEqual(mat['emissiveFactor'], [1, 1, 1])
            self.assertEqual(mat['extensions']['KHR_materials_emissive_strength']['emissiveStrength'], 1)
            mt = mat['extensions']['VRMC_materials_mtoon']
            self.assertEqual(mt['outlineWidthMode'], 'none')
            self.assertEqual(mt['renderQueueOffsetNumber'], 1)
            for texture in (mat['pbrMetallicRoughness']['baseColorTexture'], mat['emissiveTexture']):
                tr = texture['extensions']['KHR_texture_transform']
                self.assertEqual(tr['scale'], [.25, .25])
                self.assertEqual(tr['offset'], [0, 0])

    def test_03_preserve_body_rig_and_springs(self):
        def resolve_nodes(document, value):
            if isinstance(value, list):
                return [resolve_nodes(document, v) for v in value]
            if isinstance(value, dict):
                return {k: document['nodes'][v]['name'] if k == 'node' else resolve_nodes(document, v)
                        for k, v in value.items()}
            return value
        def assert_close(a, b):
            if isinstance(a, dict):
                self.assertEqual(a.keys(), b.keys())
                for key in a:
                    assert_close(a[key], b[key])
            elif isinstance(a, list):
                self.assertEqual(len(a), len(b))
                for x, y in zip(a, b):
                    assert_close(x, y)
            elif isinstance(a, float):
                self.assertAlmostEqual(a, b, delta=1e-6)
            else:
                self.assertEqual(a, b)
        assert_close(resolve_nodes(self.body_gltf, self.body_gltf['extensions']['VRMC_springBone']),
                     resolve_nodes(self.gltf, self.gltf['extensions']['VRMC_springBone']))
        old = self.body_gltf['extensions']['VRMC_vrm']
        new = self.gltf['extensions']['VRMC_vrm']
        for key in ('meta', 'humanoid'):
            self.assertEqual(resolve_nodes(self.body_gltf, old[key]), resolve_nodes(self.gltf, new[key]))
        # Re-export can split shared seam vertices. Compare every triangle's
        # geometry and skin instead of imposing a particular deduplication.
        old_mesh = body_triangles(self.root/'body.vrm')
        new_mesh = body_triangles(self.root/'face.vrm')
        self.assertEqual(old_mesh.keys(), new_mesh.keys())
        for material in old_mesh:
            self.assertEqual(len(old_mesh[material]), len(new_mesh[material]))
            for before, after in zip(old_mesh[material], new_mesh[material]):
                for (pa, wa), (pb, wb) in zip(before, after):
                    for a, b in zip(pa, pb):
                        self.assertAlmostEqual(a, b, delta=1e-6)
                    self.assertEqual(wa.keys(), wb.keys())
                    for bone in wa:
                        self.assertAlmostEqual(wa[bone], wb[bone], delta=1e-6)

    def test_99_round_trip(self):
        reset_scene()
        self.assertEqual(bpy.ops.import_scene.vrm(filepath=str(self.root/'face.vrm')), {'FINISHED'})
        arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
        preset = arm.data.vrm_addon_extension.vrm1.expressions.preset
        for name in EXPRESSIONS:
            attr = {'blinkLeft': 'blink_left', 'blinkRight': 'blink_right'}.get(name, name)
            expr = getattr(preset, attr)
            self.assertTrue(expr.is_binary)
            binds = self.report['expressions'][name]['textureTransformBinds']
            self.assertEqual(len(expr.texture_transform_binds), len(binds))
            for actual, expected in zip(expr.texture_transform_binds, binds):
                self.assertEqual(actual.material.name.split('.')[0], expected['material'])
                self.assertEqual(list(actual.scale), expected['scale'])
                self.assertEqual(list(actual.offset), expected['offset'])
        self.assertEqual(preset.happy.override_blink, 'block')
        for name in ('FaceEyes', 'FaceMouth'):
            obj = next(o for o in bpy.context.scene.objects if o.name.split('.')[0] == name)
            self.assertEqual(vertex_weights(obj, arm), [{'Head': 1.0}]*len(obj.data.vertices))


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(FaceTests))
    if result.wasSuccessful():
        # Runtime test consumes the actual exported VRM instead of a hand-built fixture.
        if os.environ.get('FACE_RUNTIME_VRM'):
            shutil.copy2(FaceTests.root/'face.vrm', os.environ['FACE_RUNTIME_VRM'])
        print(f'011 合成模型全部通过 {result.testsRun} 项', flush=True)
        shutil.rmtree(FaceTests.root)
    else:
        print('011 失败现场：', getattr(FaceTests, 'root', '初始化前失败'), flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
