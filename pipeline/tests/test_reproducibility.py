"""022: compare two complete real-model exports in separate Blender processes.

Run with the pipeline's FACE_PYTHON (Pillow installed). No preview rendering or
deployment copy: each run must generate its own prep, rig and face artifacts.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

PIPELINE = Path(__file__).resolve().parents[1]
PROJECT = PIPELINE.parent
BLENDER = os.environ.get('BLENDER') or shutil.which('Blender')
ARTIFACTS = ('usagi_base.glb', 'usagi_body.vrm', 'usagi.vrm')


def glb_chunks(data):
    size = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20+size]), data[28+size:]


class ReproducibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix='usagi-reproducibility-'))

    def command(self, label, args):
        result = subprocess.run(args, cwd=PROJECT, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=240)
        (self.root / (label + '.log')).write_bytes(result.stdout)
        self.assertEqual(result.returncode, 0, f'{label}: see {self.root}')

    def export(self, directory):
        directory.mkdir()
        landmarks = str(directory / 'usagi_landmarks.json')
        stages = (
            ('prep', ['--factory-startup'], ['--in', str(PROJECT / 'Material/tripo/usagi3d2.glb'),
                '--out', str(directory / ARTIFACTS[0]), '--landmarks', landmarks,
                '--report', str(directory / 'prep.json')]),
            ('rig', [], ['--in', str(directory / ARTIFACTS[0]), '--landmarks', landmarks,
                '--out', str(directory / ARTIFACTS[1]), '--report', str(directory / 'rig.json')]),
            ('face', [], ['--in', str(directory / ARTIFACTS[1]), '--landmarks', landmarks,
                '--atlas-dir', str(self.root / 'atlas'), '--out', str(directory / ARTIFACTS[2]),
                '--report', str(directory / 'face.json')]),
        )
        for stage, options, args in stages:
            self.command(directory.name + '-' + stage, [BLENDER, '-b', *options,
                '--python-exit-code', '1', '--python', str(PIPELINE / 'blender' / (stage + '_usagi.py')),
                '--', *args])

    def test_two_fresh_full_exports_are_byte_identical(self):
        self.assertTrue(BLENDER, 'Set BLENDER to the Blender executable (run_tests.sh exports it).')
        self.command('atlas', [sys.executable, str(PIPELINE / 'face/draw_atlas.py'),
                               '--out', str(self.root / 'atlas')])
        for name in ('first', 'second'):
            self.export(self.root / name)
        evidence = {}
        for name in ARTIFACTS:
            first = (self.root / 'first' / name).read_bytes()
            second = (self.root / 'second' / name).read_bytes()
            first_json, first_binary = glb_chunks(first)
            second_json, second_binary = glb_chunks(second)
            evidence[name] = dict(equal=first == second, bytes=len(second),
                first_sha256=hashlib.sha256(first).hexdigest(),
                second_sha256=hashlib.sha256(second).hexdigest(),
                json_equal=first_json == second_json, binary_equal=first_binary == second_binary)
        print('022 reproducibility: ' + json.dumps(evidence), flush=True)
        (self.root / 'comparison.json').write_text(json.dumps(evidence, indent=2) + '\n')
        self.assertTrue(all(item['equal'] for item in evidence.values()),
                        f'Full exports differ: see {self.root}/comparison.json')


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(ReproducibilityTests))
    if result.wasSuccessful():
        shutil.rmtree(ReproducibilityTests.root)
    else:
        print(f'022 reproducibility failure evidence: {ReproducibilityTests.root}', flush=True)
        sys.exit(1)
