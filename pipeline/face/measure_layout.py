"""Measure usagi3d2's detached sculptures, without modifying/importing the model.

The source has one untransformed triangle primitive. Normalize to one metre,
convert glTF Y-up to Blender Z-up, then rotate -90 degrees as prep does. Connected
front islands are classified by height and size, never by exporter vertex order.
"""
import argparse
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'Material/tripo/usagi3d2.glb'


def bounds(points):
    return tuple(tuple(f(p[k] for p in points) for k in range(len(points[0])))
                 for f in (min, max))


def axes(normal):
    length = math.sqrt(sum(c*c for c in normal))
    normal = tuple(c/length for c in normal)
    right = tuple((1 if k == 0 else 0)-normal[0]*normal[k] for k in range(3))
    length = math.sqrt(sum(c*c for c in right))
    right = tuple(c/length for c in right)
    up = (normal[1]*right[2]-normal[2]*right[1],
          normal[2]*right[0]-normal[0]*right[2],
          normal[0]*right[1]-normal[1]*right[0])
    return right, up, normal


def project(point, normal):
    return tuple(sum(a*b for a, b in zip(point, axis)) for axis in axes(normal)[:2])


def measure(source=SOURCE, landmarks=None):
    raw = Path(source).read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+size])
    binary = raw[28+size:]
    if len(doc['meshes']) != 1 or any(any(k in n for k in ('matrix', 'translation', 'rotation', 'scale'))
                                    for n in doc['nodes']):
        raise ValueError('Measurement expects the original untransformed usagi3d2 mesh')
    primitive, = doc['meshes'][0]['primitives']

    def read(index):
        acc = doc['accessors'][index]
        view = doc['bufferViews'][acc['bufferView']]
        fmt = {5126: 'f', 5123: 'H', 5125: 'I'}[acc['componentType']]
        reader = struct.Struct('<'+fmt*{'SCALAR': 1, 'VEC3': 3}[acc['type']])
        offset = view.get('byteOffset', 0)+acc.get('byteOffset', 0)
        return [reader.unpack_from(binary, offset+i*view.get('byteStride', reader.size))
                for i in range(acc['count'])]

    # glTF (x,y,z) -> Blender (x,-z,y), then normalized and rotated (y,-x,z).
    points = [(x, -z, y) for x, y, z in read(primitive['attributes']['POSITION'])]
    low, high = bounds(points)
    foot = ((low[0]+high[0])/2, (low[1]+high[1])/2, low[2])
    points = [tuple((p[k]-foot[k])/(high[2]-low[2]) for k in range(3)) for p in points]
    points = [(y, -x, z) for x, y, z in points]
    parents = list(range(len(points)))

    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    indices = [row[0] for row in read(primitive['indices'])]
    used = set(indices)
    for i in range(0, len(indices), 3):
        a, b, c = map(root, indices[i:i+3])
        parents[b] = parents[c] = a
    groups = {}
    for i in sorted(used):
        groups.setdefault(root(i), []).append(points[i])
    islands = sorted(groups.values(), key=len, reverse=True)
    body = islands[0]
    front = [p for p in islands[1:] if sum(v[1] for v in p)/len(p) < -.15]
    features = {}
    mouths = []
    for island in front:
        lo, hi = bounds(island)
        cx, cz = (lo[0]+hi[0])/2, (lo[2]+hi[2])/2
        side = 'Left' if cx > 0 else 'Right'
        if cz > .52:
            features['brow'+side] = island
        elif cz > .43 and hi[0]-lo[0] > .05:
            features['eye'+side] = island
        elif cz < .43:
            mouths.extend(island)
        # Small eye highlight islands are inside the eyes' bounds already.
    features['mouth'] = mouths
    if set(features) != {'eyeLeft', 'eyeRight', 'browLeft', 'browRight', 'mouth'}:
        raise ValueError('Could not identify all source sculptures')
    if landmarks is None:
        landmarks = json.loads((ROOT/'assets/model/usagi_landmarks.json').read_text())
    normal = landmarks['face_normal']
    result = {'source': 'Material/tripo/usagi3d2.glb', 'normal': normal,
              'head_width': max(p[0] for p in body if .38 < p[2] < .68)
                            - min(p[0] for p in body if .38 < p[2] < .68),
              'sculpture': {name: bounds(vertices) for name, vertices in features.items()},
              'projected': {name: bounds([project(p, normal) for p in vertices])
                            for name, vertices in features.items()},
              'front_islands': len(front),
              'cheek_method': 'No cheek sculpture/material in source; F01 anchors on measured body surface.'}
    # F01 manual anchors, normalized by its visible head width: cheeks are
    # 0.27 head widths from centre, 0.10 head widths below the eye centre.
    eye_uv = [result['projected'][name] for name in ('eyeRight', 'eyeLeft')]
    eye_v = sum((lo[1]+hi[1])/2 for lo, hi in eye_uv)/2
    cheeks = []
    for sign in (-1, 1):
        uv = (sign*.27*result['head_width'], eye_v-.10*result['head_width'])
        front_body = [p for p in body if p[1] < -.15]
        nearest = min(front_body, key=lambda p: sum((a-b)**2 for a, b in zip(project(p, normal), uv)))
        cheeks.append({'anchor': uv, 'nearest_surface': nearest})
    result['cheeks'] = cheeks
    return result


def layout_values(measured):
    """Measured anchors plus explicit drawing/guard-band design envelopes."""
    projected = measured['projected']
    def rect(name):
        lo, hi = projected[name]
        return (lo[0], hi[0], lo[1], hi[1])
    cheeks = tuple(tuple(c['anchor']) for c in measured['cheeks'])
    size = (measured['head_width']*.20, measured['head_width']*.20/1.5)
    extent = math.ceil((max(abs(c[0]) for c in cheeks)+size[0]/2
                        +measured['head_width']*.10)*100)/100
    brows = tuple(rect(name) for name in ('browRight', 'browLeft'))
    mouth = rect('mouth')
    line = .0142*.75
    frames = {'FaceEyes': (-extent, extent,
              math.floor((cheeks[0][1]-size[1]/2-3*line)*100)/100,
              math.ceil((max(b[3] for b in brows)+3*line)*100)/100),
              'FaceMouth': (-math.ceil((max(abs(mouth[0]), abs(mouth[1]))+.04)*100)/100,
                             math.ceil((max(abs(mouth[0]), abs(mouth[1]))+.04)*100)/100,
                             math.floor((mouth[2]-.15)*100)/100,
                             math.ceil((mouth[3]+.03)*100)/100)}
    return dict(FRAMES=frames, MOUTH_BOUNDS=mouth, CHEEK_CENTERS=cheeks,
                CHEEK_SIZE=size, BROW_BOUNDS=brows,
                EYE_CENTERS=tuple(tuple((lo[k]+hi[k])/2 for k in (0, 1))
                    for lo, hi in (projected[n] for n in ('eyeRight', 'eyeLeft'))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out')
    args = parser.parse_args()
    output = json.dumps(measure(), ensure_ascii=False, indent=2)+'\n'
    if args.out:
        Path(args.out).write_text(output)
    else:
        print(output, end='')
