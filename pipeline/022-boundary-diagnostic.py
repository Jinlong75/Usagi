"""Read-only 022 diagnosis: sample existing region rules before contour cutting.

Run with Blender -b --factory-startup --python-exit-code 1 --python FILE.
No model, material rule, or test assertion is modified.
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'pipeline/blender'))
import bmesh
from mathutils import Vector
from cleanup_mesh import clean, face_islands
from prep_usagi import (orient_front, shape_profile, ear_sections,
                        ear_inner_field, tail_field, write_json)


def components(bm, predicate):
    remaining = {v for v in bm.verts if predicate(v)}
    result = []
    while remaining:
        seed = remaining.pop()
        group, pending = {seed}, [seed]
        while pending:
            for edge in pending.pop().link_edges:
                for other in edge.verts:
                    if other in remaining:
                        remaining.remove(other)
                        group.add(other)
                        pending.append(other)
        result.append({
            'vertices': len(group),
            'min': [min(v.co[i] for v in group) for i in range(3)],
            'max': [max(v.co[i] for v in group) for i in range(3)],
            'normal_y_min': min(v.normal.y for v in group),
            'normal_y_max': max(v.normal.y for v in group),
        })
    return sorted(result, key=lambda c: c['vertices'], reverse=True)


obj, _ = clean(SimpleNamespace(
    input=str(ROOT / 'Material/tripo/usagi3d2.glb'),
    output=str(ROOT / 'assets/model/diagnostic-unused.glb'),
    report=str(ROOT / 'assets/model/diagnostic-unused.json'),
    merge_dist=.000001, min_island_ratio=0, target_height=1), write_output=False)
bm = bmesh.new()
try:
    bm.from_mesh(obj.data)
    orient_front(bm)
    # Production report has zero moved face vertices and waist smoothing off.
    # Recompute the same profile/subdivision used immediately before cutting.
    profile = shape_profile([v.co for v in bm.verts], bm)
    ear_edges = [e for e in bm.edges if all(v.co.z > profile['head_top'] for v in e.verts)]
    bmesh.ops.subdivide_edges(bm, edges=ear_edges, cuts=1, use_grid_fill=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.normal_update()
    ears = {side: ear_sections([v.co for v in bm.verts], profile, sign)
            for side, sign in (('l', 1), ('r', -1))}
    report = {'stage': 'before split_region_boundaries; original coordinates unchanged',
              'ears': {}, 'tail_by_mesh_island': []}
    for side, sections in ears.items():
        report['ears'][side] = {
            'existing_rule_negative_components': components(
                bm, lambda v: ear_inner_field(v.co, v.normal, sections) < 0),
            # Diagnostic only: identify holes introduced by the existing normal
            # constraint while retaining the exact same ellipse and halfspaces.
            'ellipse_inside_but_normal_excluded': components(
                bm, lambda v: ear_inner_field(v.co, Vector((0, -1, 0)), sections) < 0
                and v.normal.y >= -.25),
        }
    for island in sorted(face_islands(bm), key=len, reverse=True):
        verts = {v for f in island for v in f.verts}
        selected = [v for v in verts if tail_field(v.co, v.normal, profile) < 0]
        report['tail_by_mesh_island'].append({
            'faces': len(island), 'vertices': len(verts),
            'negative_vertices': len(selected),
            'negative_min': [min(v.co[i] for v in selected) for i in range(3)] if selected else None,
            'negative_max': [max(v.co[i] for v in selected) for i in range(3)] if selected else None,
        })
    report['tail_negative_components'] = components(
        bm, lambda v: tail_field(v.co, v.normal, profile) < 0)
    write_json(ROOT / 'assets/model/022-boundary-diagnostic.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
finally:
    bm.free()
