"""Atlas pixel invariants; external Pillow only, no Blender required."""
import shutil
import json
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageDraw
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'face'))
from draw_atlas import generate, eyes, mouth
from layout import (CELL, MARGIN, EYES, MOUTHS, FRAMES, MOUTH_BOUNDS,
                    CHEEK_CENTERS, CHEEK_SIZE, LINE_M, EYE_CENTERS, EYE_DIAMETER)
import layout
from measure_layout import measure, layout_values
from compare_reference import compare as compare_reference, reference_head_width


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
            # Shared artwork is deliberate; names/UV cells remain distinct.
            groups = ((('neutral', 'happy', 'angry', 'sad', 'surprised'),
                       ('blink',), ('blinkLeft',), ('blinkRight',), ('relaxed',))
                      if names == EYES else
                      (('neutral',), ('aa', 'oh', 'angry'),
                       ('ih', 'ee', 'ou', 'happy', 'surprised'), ('sad',)))
            painter = eyes if names == EYES else mouth
            representatives = []
            for group in groups:
                first = painter(group[0]).tobytes()
                for name in group:
                    index = names.index(name)
                    x, y = index%4*CELL, index//4*CELL
                    self.assertEqual(atlas.crop((x, y, x+CELL, y+CELL)).tobytes(), first, name)
                representatives.append(first)
            self.assertEqual(len(set(representatives)), len(groups))
        self.assertEqual(Image.open(self.root/'atlas_preview.png').size, (2048, 1152))

    def test_neutral_physical_bounds_and_cheek_proportions(self):
        mouth = Image.open(self.root/'mouth_atlas.png').crop((0, 0, CELL, CELL))
        box = mouth.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
        xmin, xmax, vmin, vmax = FRAMES['FaceMouth']
        bounds = (xmin+box[0]/CELL*(xmax-xmin), xmin+box[2]/CELL*(xmax-xmin),
                  vmax-box[3]/CELL*(vmax-vmin), vmax-box[1]/CELL*(vmax-vmin))
        for actual, expected in zip(bounds, MOUTH_BOUNDS):
            self.assertAlmostEqual(actual, expected, delta=.001)
        eyes = Image.open(self.root/'eyes_atlas.png').crop((0, 0, CELL, CELL))
        xmin, xmax, vmin, vmax = FRAMES['FaceEyes']
        # Identify pink independently of ink strokes, including both cheeks.
        for i, (left, right) in enumerate(((0, CELL//2), (CELL//2, CELL))):
            centre, height_centre = CHEEK_CENTERS[i]
            pixels = [(x, y) for y in range(CELL) for x in range(left, right)
                      if (lambda c: c[3] >= 128 and c[0] > 220 and 130 < c[1] < 210 and c[2] > 150)(eyes.getpixel((x, y)))]
            lowx, highx = min(x for x, y in pixels), max(x for x, y in pixels)+1
            lowy, highy = min(y for x, y in pixels), max(y for x, y in pixels)+1
            width, height = (highx-lowx)/CELL*(xmax-xmin), (highy-lowy)/CELL*(vmax-vmin)
            self.assertAlmostEqual(width, CHEEK_SIZE[0], delta=.002)
            self.assertAlmostEqual(width/height, 1.5, delta=.06)
            self.assertAlmostEqual(xmin+(lowx+highx)/2/CELL*(xmax-xmin), centre, delta=.001)
            self.assertAlmostEqual(vmax-(lowy+highy)/2/CELL*(vmax-vmin), height_centre, delta=.001)

    def test_new_model_measurements_match_layout_within_two_mm(self):
        measured = measure()
        self.assertEqual(measured['front_islands'], 10)
        self.assertAlmostEqual(layout.HEAD_WIDTH, measured['head_width'], delta=.002)
        for name, expected in measured['sculpture'].items():
            for actual_row, expected_row in zip(layout.SCULPTURE[name], expected):
                for actual, expected in zip(actual_row, expected_row):
                    self.assertAlmostEqual(actual, expected, delta=.002)
        def compare(actual, expected):
            if isinstance(expected, dict):
                self.assertEqual(actual.keys(), expected.keys())
                for key in expected:
                    compare(actual[key], expected[key])
            elif isinstance(expected, (tuple, list)):
                self.assertEqual(len(actual), len(expected))
                for a, e in zip(actual, expected):
                    compare(a, e)
            else:
                self.assertAlmostEqual(actual, expected, delta=.002)
        for key, expected in layout_values(measured).items():
            with self.subTest(constant=key):
                compare(getattr(layout, key), expected)
        compare(layout.NORMAL, measured['normal'])
        self.assertAlmostEqual(LINE_M, .0142*.75, delta=1e-8)

    def pixel(self, tile, frame, x, v):
        x0, x1, v0, v1 = FRAMES[frame]
        return tile.getpixel((round((x-x0)/(x1-x0)*CELL), round((v1-v)/(v1-v0)*CELL)))

    def test_round_eyes_single_highlight_straight_blink_and_fixed_brows(self):
        neutral, blink, relaxed = eyes('neutral'), eyes('blink'), eyes('relaxed')
        for cx, cv in EYE_CENTERS:
            # A circle in metre coordinates, not in the non-square UV frame.
            for dx, dv in ((0, .40), (.40, 0), (-.40, 0), (0, -.40)):
                color = self.pixel(neutral, 'FaceEyes', cx+dx*EYE_DIAMETER, cv+dv*EYE_DIAMETER)
                self.assertEqual(color[:3], (43, 26, 20))
            self.assertEqual(self.pixel(neutral, 'FaceEyes', cx-.14*EYE_DIAMETER,
                                       cv+.17*EYE_DIAMETER)[:3], (255, 255, 255))
            # No lower white smile arc or line below the eye.
            self.assertEqual(self.pixel(neutral, 'FaceEyes', cx, cv-.28*EYE_DIAMETER)[:3], (43, 26, 20))
            self.assertEqual(self.pixel(neutral, 'FaceEyes', cx, cv-.62*EYE_DIAMETER)[3], 0)
            self.assertGreater(self.pixel(blink, 'FaceEyes', cx, cv)[3], 200)
            for dv in (-.018, .018):
                self.assertEqual(self.pixel(blink, 'FaceEyes', cx, cv+dv)[3], 0)
            self.assertEqual(self.pixel(relaxed, 'FaceEyes', cx, cv-.02)[3], 0)
        # Everything above eyes is identical in every cell: no anger/sad brows.
        frame = FRAMES['FaceEyes']
        cutoff = round((frame[3]-.50)/(frame[3]-frame[2])*CELL)
        for name in EYES:
            self.assertEqual(eyes(name).crop((0, 0, CELL, cutoff)).tobytes(),
                             neutral.crop((0, 0, CELL, cutoff)).tobytes())
        self.assertNotEqual(eyes('blinkLeft').tobytes(), eyes('blinkRight').tobytes())

    def test_omega_cusp_opening_depth_tongue_and_happy_difference(self):
        x0, x1, bottom, top = MOUTH_BOUNDS
        cx, w = (x0+x1)/2, x1-x0
        neutral = mouth('neutral')
        for name in MOUTHS:
            tile = mouth(name)
            # Upward cusp and transparent sides at its height rule out ovals.
            self.assertGreater(self.pixel(tile, 'FaceMouth', cx, top-LINE_M/2)[3], 200)
            for sign in (-1, 1):
                self.assertLess(self.pixel(tile, 'FaceMouth', cx+sign*w*.35, top-LINE_M/2)[3], 30)
            if name in ('neutral', 'sad'):
                self.assertFalse(any(c[:3] == (240, 138, 160) for c in tile.getdata()))
                continue
            tongue = [(x, y) for y in range(CELL) for x in range(CELL)
                      if tile.getpixel((x, y))[:3] == (240, 138, 160)]
            self.assertTrue(tongue, name)
            cavity = [(x, y) for y in range(CELL) for x in range(CELL)
                      if tile.getpixel((x, y))[:3] == (84, 35, 43)]
            self.assertTrue(cavity, name)
            frame = FRAMES['FaceMouth']
            depth = (max(y for x, y in cavity+tongue)-min(y for x, y in cavity+tongue))/CELL*(frame[3]-frame[2])
            # Visible cavity excludes the omega's ink. Check the complete ink
            # separately so a detached chin arc cannot hide below this region.
            self.assertAlmostEqual(depth/w, .925 if name in ('aa', 'oh', 'angry') else .475, delta=.08)
            alpha = tile.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
            box = alpha.getbbox()
            ink_height = (box[3]-box[1])/CELL*(frame[3]-frame[2])
            ink_width = (box[2]-box[0])/CELL*(frame[1]-frame[0])
            self.assertLessEqual(ink_height/ink_width, 1.4 if name in ('aa', 'oh', 'angry') else .9)
            # Every occupied row must touch the next: no independent chin arc.
            self.assertTrue(all(alpha.crop((0, y, CELL, y+1)).getbbox()
                                for y in range(box[1], box[3])))
            # U stays broad near its base, unlike the old pointed long strip.
            y = box[3]-round((box[3]-box[1])*.12)
            row = alpha.crop((0, y, CELL, y+1)).getbbox()
            self.assertGreater(row[2]-row[0], (box[2]-box[0])*.40)
        self.assertNotEqual(neutral.tobytes(), mouth('happy').tobytes())
        box = neutral.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
        self.assertLessEqual((box[3]-box[1])*(FRAMES['FaceMouth'][3]-FRAMES['FaceMouth'][2])/
                             ((box[2]-box[0])*(FRAMES['FaceMouth'][1]-FRAMES['FaceMouth'][0])), .75)

    def test_f01_artwork_proportions_and_four_saturated_cheek_strokes(self):
        self.assertAlmostEqual(EYE_DIAMETER, .0917*.70)
        self.assertAlmostEqual((EYE_CENTERS[1][0]-EYE_CENTERS[0][0])/layout.HEAD_WIDTH, .2592, delta=.001)
        self.assertAlmostEqual(EYE_DIAMETER/layout.HEAD_WIDTH, .09784, delta=.001)
        for brow, source, eye in zip(layout.BROW_BOUNDS, layout.SCULPTURE_BROW_BOUNDS, EYE_CENTERS):
            self.assertAlmostEqual(brow[1]-brow[0], (source[1]-source[0])*.75)
            self.assertAlmostEqual(brow[3]-eye[1], (source[3]-eye[1])*.70)
        tile = eyes('neutral')
        for cx, cv in CHEEK_CENTERS:
            for shift in (-.039, -.013, .013, .039):
                self.assertEqual(self.pixel(tile, 'FaceEyes', cx+shift, cv)[:3], (224, 96, 126))
                # Width doubled from .42 to .84 of the unchanged line width.
                color = self.pixel(tile, 'FaceEyes', cx+shift+.003, cv)[:3]
                self.assertLessEqual(max(abs(a-b) for a, b in zip(color, (224, 96, 126))), 5)
            for shift in (-.026, 0, .026):
                self.assertEqual(self.pixel(tile, 'FaceEyes', cx+shift, cv)[:3], (246, 163, 181))

    def test_left_clipped_reference_infers_complete_width_from_f01_eyes(self):
        full = Image.new('RGB', (440, 300), '#888888')
        ImageDraw.Draw(full).ellipse((20, 20, 420, 280), fill='#fff1c1', outline='#2b1a14', width=5)
        eyes = ((170, 145), (270, 145))
        self.assertEqual(reference_head_width(full, eyes, 400), (400, False, False))
        clipped = full.crop((70, 0, 440, 300))
        width, inferred, edge_fill = reference_head_width(clipped, ((100, 145), (200, 145)), 370)
        self.assertTrue(edge_fill)
        self.assertTrue(inferred)
        self.assertAlmostEqual(width, 100*347/(92**2+2**2)**.5)
        self.assertNotEqual(width, clipped.width)

    def test_reference_comparison_has_five_pairs_at_equal_head_width(self):
        source = self.root/'renders'
        source.mkdir()
        for name in ('neutral', 'aa', 'blink', 'happy', 'sad'):
            Image.new('RGB', (384, 384), '#fff1c1').save(source/(name+'.png'))
        output = self.root/'compare_reference.png'
        compare_reference(source, output)
        self.assertEqual(Image.open(output).size, (840, 1870))
        evidence = json.loads(output.with_suffix('.json').read_text())
        self.assertEqual([e['reference'] for e in evidence], ['F01', 'F05', 'F09', 'F19', 'F12'])
        self.assertEqual([e['expression'] for e in evidence], ['neutral', 'aa', 'blink', 'happy', 'sad'])
        for e in evidence:
            self.assertAlmostEqual(e['source_head_width_px']*e['source_scale'], 320)
            self.assertAlmostEqual(e['render_head_width_px']*e['render_scale'], 320)
        self.assertEqual([e['width_inferred_from_F01_eyes'] for e in evidence],
                         [False, True, True, True, True])
        self.assertTrue(evidence[3]['head_fill_at_image_edge'])



if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(AtlasTests))
    if result.wasSuccessful():
        shutil.rmtree(AtlasTests.root)
    else:
        print('011 图集失败现场：', AtlasTests.root)
        sys.exit(1)
