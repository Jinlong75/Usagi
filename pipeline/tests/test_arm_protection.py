"""031: independent frozen samples on final VRM, no production regions()."""
import gzip
import json
import math
import sys
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'pipeline/blender'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from arm_protection import ARM_RADIUS, read_body, sample_indices, protection_report


class ArmProtectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lm = json.loads((ROOT/'assets/model/usagi_landmarks.json').read_text())
        cls.frozen = json.loads((Path(__file__).parent/'data/031-protect.json').read_text())
        with gzip.open(Path(__file__).parent/'data/031-baseline.json.gz') as f:
            cls.baseline = json.load(f)
        cls.points, cls.weights, cls.edges = read_body(ROOT/'assets/model/usagi.vrm')
        cls.report = protection_report(cls.points, cls.weights, cls.edges, cls.lm)

    def test_01_frozen_independent_samples(self):
        head, hands = sample_indices(self.points, self.lm)
        self.assertEqual(len(head), 2880)
        self.assertEqual(len(hands), 327)
        for indices, group in ((head, 'head'), (hands, 'hands')):
            for index, frozen in zip(indices, self.frozen[group]):
                self.assertLessEqual(math.dist(self.points[index], frozen), 1e-6)
        self.assertEqual(ARM_RADIUS, self.frozen['arm_radius'])
        for sign in (-1, 1):
            target = (sign*.281632, .082804, .316561)
            self.assertLess(min(math.dist(target, self.points[i]) for i in head), 1e-6 if sign == -1 else .001)

    def test_02_head_side_protected_from_arm(self):
        self.assertLessEqual(self.report['head_arm_max'], .05)

    def test_03_hand_core_follows_own_arm(self):
        self.assertGreaterEqual(self.report['hand_arm_min'], .9)

    def test_04_candidate_edges_have_continuous_head_weights(self):
        self.assertLessEqual(self.report['head_edge_max'], .25)
        self.assertEqual(self.report['head_edges_over_05'], 0)

    def test_05_linear_pose_locality(self):
        self.assertLessEqual(self.report['hand_head_motion'], 1e-4)
        self.assertLessEqual(self.report['head_arm_motion'], .003)

    def test_06_neutral_positions_topology_and_ears_unchanged(self):
        self.assertEqual(len(self.points), len(self.baseline['points']))
        self.assertLessEqual(max(math.dist(a, b) for a, b in zip(self.points, self.baseline['points'])), 1e-6)
        self.assertEqual([list(e) for e in self.edges], self.baseline['edges'])
        for index, old in self.baseline['ear_weights'].items():
            new = self.weights[int(index)]
            self.assertEqual(new.keys(), old.keys())
            self.assertLessEqual(max(abs(new[n]-w) for n, w in old.items()), 1e-6)

    def test_07_normalized_four_influences_and_deployment(self):
        for weights in self.weights:
            self.assertGreater(len(weights), 0)
            self.assertLessEqual(len(weights), 4)
            self.assertAlmostEqual(sum(weights.values()), 1, delta=1e-6)
        self.assertEqual((ROOT/'assets/model/usagi.vrm').read_bytes(), (ROOT/'assets/models/usagi.vrm').read_bytes())

    def test_08_rig_face_weights_and_rest_frames(self):
        # face export may split one material-seam vertex. Compare every triangle
        # as the existing 011 test does; never require importer deduplication.
        from test_face_usagi import glb_rest_state, body_triangles
        before = body_triangles(ROOT/'assets/model/usagi_body.vrm')
        after = body_triangles(ROOT/'assets/model/usagi.vrm')
        self.assertEqual(before.keys(), after.keys())
        from collections import Counter
        from mathutils.kdtree import KDTree
        for material in before:
            self.assertEqual(len(before[material]), len(after[material]))
            # Quantized triangle sorting can change order at a decimal boundary.
            # Match actual coordinates, then compare all topology and weights.
            reference = {tuple(p): w for triangle in after[material] for p, w in triangle}
            coordinates = list(reference)
            tree = KDTree(len(coordinates))
            for i, p in enumerate(coordinates):
                tree.insert(p, i)
            tree.balance()
            def canonical(triangles):
                result = []
                for triangle in triangles:
                    ids = []
                    for p, w in triangle:
                        _, index, distance = tree.find(p)
                        self.assertLessEqual(distance, 1e-6)
                        expected = reference[coordinates[index]]
                        self.assertEqual(w.keys(), expected.keys())
                        for name in w:
                            self.assertAlmostEqual(w[name], expected[name], delta=1e-6)
                        ids.append(index)
                    result.append(tuple(sorted(ids)))
                return Counter(result)
            self.assertEqual(canonical(before[material]), canonical(after[material]))
        a, a_skins = glb_rest_state(ROOT/'assets/model/usagi_body.vrm')
        b, b_skins = glb_rest_state(ROOT/'assets/model/usagi.vrm')
        for name, node in a.items():
            for field in node:
                for x, y in zip(node[field], b[name][field]):
                    self.assertAlmostEqual(x, y, delta=1e-6)
        for old, new in zip(a_skins, b_skins):
            self.assertEqual(old.keys(), new.keys())
            for name in old:
                for x, y in zip(old[name], new[name]):
                    self.assertAlmostEqual(x, y, delta=1e-6)


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ArmProtectionTests))
    if not result.wasSuccessful():
        import os
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
