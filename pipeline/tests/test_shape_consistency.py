"""022: both directions against raw Tripo geometry, including a fresh prep run."""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from argparse import Namespace

sys.dont_write_bytecode = True
PIPELINE = Path(__file__).resolve().parents[1]
PROJECT = PIPELINE.parent
sys.path.insert(0, str(PIPELINE / 'blender'))
from check_shape import compare_surfaces
from prep_usagi import prep


class ShapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix='usagi-shape-'))

    def check_surface(self, path):
        report = compare_surfaces(PROJECT / 'Material/tripo/usagi3d2.glb', path)
        print('022 shape evidence: ' + json.dumps(report), flush=True)
        (self.root / (Path(path).stem + '.json')).write_text(json.dumps(report, indent=2))
        self.assertGreater(report['base_to_original']['region_vertices'], 0)
        self.assertGreater(report['original_to_base']['region_vertices'], 0)
        for direction in ('base_to_original', 'original_to_base'):
            self.assertGreater(report[direction]['outside_vertices'], 9000)
            self.assertLessEqual(report[direction]['max_distance'], .0005,
                                 (direction, report[direction]))

    def test_committed_surface(self):
        self.check_surface(PROJECT / 'assets/model/usagi_base.glb')

    def test_entire_independent_tail_has_one_skinning_region(self):
        from common import reset_scene, import_model
        from rig_usagi import independent_tail_vertices, regions, geometry_weights
        reset_scene()
        obj, = import_model(PROJECT / 'assets/model/usagi_base.glb')
        lm = json.loads((PROJECT / 'assets/model/usagi_landmarks.json').read_text())
        ids = independent_tail_vertices(obj)
        self.assertEqual(len(ids), 353)  # 整块 Tail 材质，无切线拆点或细分。
        labels = regions(obj, lm)
        for index in ids:
            self.assertEqual(labels[index], 'tail')
            self.assertEqual(geometry_weights(obj.data.vertices[index].co, labels[index], None, lm),
                             {'Tail': 1.0})

    def test_regenerated_surface(self):
        output = self.root / 'regenerated.glb'
        prep(Namespace(input=str(PROJECT / 'Material/tripo/usagi3d2.glb'), output=str(output),
                       landmarks=str(self.root / 'landmarks.json'), report=str(self.root / 'prep.json'),
                       smooth_waist='off', waist_iterations=100))
        self.check_surface(output)


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ShapeTests))
    if result.wasSuccessful():
        shutil.rmtree(ShapeTests.root)
    else:
        print(f'022 failure evidence: {ShapeTests.root}', flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
