"""Atlas pixel invariants; external Pillow only, no Blender required."""
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'face'))
from draw_atlas import generate
from layout import CELL, MARGIN, EYES, MOUTHS


class AtlasTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(tempfile.mkdtemp(prefix='usagi-atlas-'))
        generate(cls.root)

    def test_dimensions_names_coverage_and_guard_band(self):
        for filename, names in (('eyes_atlas.png', EYES), ('mouth_atlas.png', MOUTHS)):
            atlas = Image.open(self.root/filename)
            self.assertEqual(atlas.mode, 'RGBA')
            self.assertEqual(atlas.size, (2048, 2048))
            self.assertEqual(len(set(names)), len(names))
            for index in range(16):
                with self.subTest(atlas=filename, index=index):
                    x, y = index%4*CELL, index//4*CELL
                    alpha = atlas.getchannel('A').crop((x, y, x+CELL, y+CELL))
                    histogram = alpha.histogram()
                    if index >= len(names):
                        self.assertIsNone(alpha.getbbox())
                        continue
                    fraction = sum(histogram[1:])/(CELL*CELL)
                    self.assertGreater(fraction, .005)
                    self.assertLess(fraction, .50)
                    bbox = alpha.getbbox()
                    self.assertGreaterEqual(bbox[0], MARGIN)
                    self.assertGreaterEqual(bbox[1], MARGIN)
                    self.assertLessEqual(bbox[2], CELL-MARGIN)
                    self.assertLessEqual(bbox[3], CELL-MARGIN)
            # Distinct named cells really contain distinct pixels.
            tiles = [atlas.crop((i%4*CELL, i//4*CELL, i%4*CELL+CELL, i//4*CELL+CELL)).tobytes()
                     for i in range(len(names))]
            self.assertEqual(len(set(tiles)), len(names))
        self.assertEqual(Image.open(self.root/'atlas_preview.png').size, (2048, 1152))


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(AtlasTests))
    if result.wasSuccessful():
        shutil.rmtree(AtlasTests.root)
    else:
        print('011 图集失败现场：', AtlasTests.root)
        sys.exit(1)
