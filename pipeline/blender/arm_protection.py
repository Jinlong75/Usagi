"""031 independent geometry samples and linear-skinning quality checks.

No production region labels are used here. Coordinates are Blender Z-up.
"""
import json
import math
import struct
from pathlib import Path

ARM_RADIUS = .032
ARM_PARTS = ('Shoulder', 'UpperArm', 'LowerArm', 'Hand')


def distance_segment(p, a, b):
    d = [y-x for x, y in zip(a, b)]
    t = max(0, min(1, sum((x-y)*z for x, y, z in zip(p, a, d))/sum(x*x for x in d)))
    return math.dist(p, [x+t*y for x, y in zip(a, d)])


def sample_indices(points, lm):
    head, hands = [], []
    for i, p in enumerate(points):
        side = 'l' if p[0] >= 0 else 'r'
        root, tip = lm['arm_root_'+side], lm['arm_tip_'+side]
        d = distance_segment(p, root, tip)
        if lm['chest'][2] <= p[2] <= lm['head_top'][2] and d >= ARM_RADIUS+.02*lm['height']:
            head.append(i)
        if abs(p[0]) > abs(root[0]) and d < ARM_RADIUS*.8:
            hands.append(i)
    return head, hands


def rotate(p, pivot, axis, angle):
    v = [x-y for x, y in zip(p, pivot)]
    c, s = math.cos(angle), math.sin(angle)
    dot = sum(x*y for x, y in zip(axis, v))
    cross = [axis[1]*v[2]-axis[2]*v[1], axis[2]*v[0]-axis[0]*v[2], axis[0]*v[1]-axis[1]*v[0]]
    return [pivot[i]+v[i]*c+cross[i]*s+axis[i]*dot*(1-c) for i in range(3)]


def protection_report(points, weights, edges, lm):
    head, hands = sample_indices(points, lm)
    def arm_weight(i):
        label = 'Left' if points[i][0] >= 0 else 'Right'
        return sum(weights[i].get(label+p, 0) for p in ARM_PARTS)
    def candidate(p):
        root = lm['arm_root_l' if p[0] >= 0 else 'arm_root_r']
        return abs(p[0]) > abs(root[0])-.024 and abs(p[2]-root[2]) < .055 and abs(p[1]-root[1]) < .10
    differences = [abs(weights[a].get('Head', 0)-weights[b].get('Head', 0))
                   for a, b in edges if candidate(points[a]) or candidate(points[b])]
    head_motion = 0
    for i in head:
        p = points[i]
        displacement = [0., 0., 0.]
        for name, w in weights[i].items():
            side = 'l' if name.startswith('Left') else 'r'
            label = 'Left' if side == 'l' else 'Right'
            if name not in {label+part for part in ('UpperArm', 'LowerArm', 'Hand')}:
                continue
            sign = 1 if side == 'l' else -1
            root, tip = lm['arm_root_'+side], lm['arm_tip_'+side]
            elbow = [a+.4*(b-a) for a, b in zip(root, tip)]
            moved = rotate(p, elbow, (0, -1, 0), -sign*.10) if name != label+'UpperArm' else p
            moved = rotate(moved, root, (0, -1, 0), sign*.43)
            for axis in range(3):
                displacement[axis] += w*(moved[axis]-p[axis])
        head_motion = max(head_motion, math.sqrt(sum(d*d for d in displacement)))
    hand_motion = 0
    for i in hands:
        for axis, angle in (((0,0,1), .4), ((0,0,1), -.4), ((1,0,0), .25), ((1,0,0), -.25)):
            pivot = [*lm['neck'][:2], lm['neck'][2]+.04]
            hand_motion = max(hand_motion, weights[i].get('Head', 0)*math.dist(points[i], rotate(points[i], pivot, axis, angle)))
    values = dict(head_samples=len(head), hand_samples=len(hands),
                  head_arm_max=max((sum(w for n, w in weights[i].items() if n.startswith(('Left', 'Right')) and any(n.endswith(part) for part in ARM_PARTS)) for i in head), default=1),
                  hand_arm_min=min(map(arm_weight, hands), default=0),
                  head_edge_max=max(differences, default=1),
                  head_edges_over_05=sum(d > .5 for d in differences),
                  hand_head_motion=hand_motion/lm['height'], head_arm_motion=head_motion/lm['height'])
    values['valid'] = bool(head and hands and values['head_arm_max'] <= .05 and
                           values['hand_arm_min'] >= .9 and values['head_edge_max'] <= .25 and
                           values['hand_head_motion'] <= 1e-4 and values['head_arm_motion'] <= .003)
    return values


def read_body(path):
    """Read exported POSITION/JOINTS/WEIGHTS, without importer bone heuristics."""
    data = Path(path).read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+size])
    binary = data[28+size:]
    def accessor(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        fmt = {5121:'B', 5123:'H', 5125:'I', 5126:'f'}[a['componentType']]
        width = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}[a['type']]
        stride = view.get('byteStride', struct.calcsize(fmt)*width)
        start = view.get('byteOffset', 0)+a.get('byteOffset', 0)
        return [struct.unpack_from('<'+fmt*width, binary, start+i*stride) for i in range(a['count'])]
    points, weights, edges = [], [], set()
    for node in doc['nodes']:
        if 'mesh' not in node or not node.get('name', '').startswith('Usagi_Body'):
            continue
        joints = [doc['nodes'][i]['name'] for i in doc['skins'][node['skin']]['joints']]
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            attrs = primitive['attributes']
            offset = len(points)
            points.extend((x, -z, y) for x, y, z in accessor(attrs['POSITION']))
            weights.extend({joints[j]:w for j, w in zip(js, ws) if w > 1e-7}
                           for js, ws in zip(accessor(attrs['JOINTS_0']), accessor(attrs['WEIGHTS_0'])))
            indices = [i[0]+offset for i in accessor(primitive['indices'])]
            for i in range(0, len(indices), 3):
                a, b, c = indices[i:i+3]
                edges.update(tuple(sorted(pair)) for pair in ((a,b),(b,c),(c,a)))
    if not points:
        raise ValueError('No exported Usagi body')
    return points, weights, sorted(edges)


def preservation_report(points, weights, lm):
    """Compare real prep/rig geometry and ears with the frozen pre-fix export.

    Synthetic rigs have their own rest/ear tests and no production reference.
    The final-export test additionally checks vertex multiplicity and topology.
    """
    if '_meta' not in lm:
        return dict(reference='synthetic', valid=True)
    import gzip
    with gzip.open(Path(__file__).resolve().parents[1]/'tests/data/031-baseline.json.gz') as f:
        baseline = json.load(f)
    # Retain collocated seam vertices and search neighboring buckets. Import/
    # export can move Float32 coordinates across a rounding boundary.
    key = lambda p: tuple(round(v*1e6) for v in p)
    reference = {}
    for i, p in enumerate(baseline['points']):
        reference.setdefault(key(p), []).append(i)
    rig_ears = {tuple(p): w for p, w in baseline['rig_ears']}
    position_max, ear_max, missing = 0., 0., 0
    for p, w in zip(points, weights):
        center = key(p)
        candidates = [i for x in (-1, 0, 1) for y in (-1, 0, 1) for z in (-1, 0, 1)
                      for i in reference.get((center[0]+x, center[1]+y, center[2]+z), [])]
        index = min(candidates, key=lambda i: math.dist(p, baseline['points'][i])) if candidates else None
        if index is None:
            missing += 1
            continue
        position_max = max(position_max, math.dist(p, baseline['points'][index]))
        old = rig_ears.get(tuple(p))
        if p[2] > lm['head_top'][2] and old is None:
            missing += 1
        if old is not None:
            ear_max = max(ear_max, max(abs(w.get(n, 0)-old.get(n, 0)) for n in w.keys() | old.keys()))
    return dict(reference='031-baseline', position_max_error=position_max,
                ear_weight_max_error=ear_max, missing_vertices=missing,
                valid=not missing and position_max <= 1e-6*lm['height'] and ear_max <= 1e-6)
