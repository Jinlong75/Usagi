"""材质分界闭环及转角：耳内使用椭圆场同一正面 X/Z 投影平面。"""
import math
import bmesh
from mathutils import Vector


def boundary_metrics(obj):
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
        result = {}
        for region in ('EarInner', 'Tail'):
            indices = {i for i, mat in enumerate(obj.data.materials)
                       if mat and mat.name.split('.')[0] == region}
            edges = {e for e in bm.edges if len(e.link_faces) == 2
                     and sum(f.material_index in indices for f in e.link_faces) == 1}
            while edges:
                seed = edges.pop()
                component, pending = {seed}, [seed]
                while pending:
                    for vert in pending.pop().verts:
                        for edge in vert.link_edges:
                            if edge in edges:
                                edges.remove(edge)
                                component.add(edge)
                                pending.append(edge)
                verts = {v for e in component for v in e.verts}
                adjacency = {v: [e.other_vert(v) for e in component if v in e.verts] for v in verts}
                closed = all(len(neighbors) == 2 for neighbors in adjacency.values())
                angles = [math.degrees((v.co - neighbors[0].co).angle(neighbors[1].co - v.co))
                          for v, neighbors in adjacency.items() if len(neighbors) == 2]
                projected = []
                if closed:
                    start = next(iter(verts))
                    ordered, previous, current = [], None, start
                    while not ordered or current != start:
                        ordered.append(current)
                        following = next(v for v in adjacency[current] if v != previous)
                        previous, current = current, following
                    points = []
                    for v in ordered:
                        point = Vector((v.co.x, v.co.z))
                        if not points or (point - points[-1]).length > 1e-7:
                            points.append(point)
                    if len(points) > 1 and (points[0] - points[-1]).length <= 1e-7:
                        points.pop()
                    projected = [math.degrees((point - points[i-1]).angle(points[(i+1) % len(points)] - point))
                                 for i, point in enumerate(points)]
                label = ('ear_l' if sum(v.co.x for v in verts) > 0 else 'ear_r') if region == 'EarInner' else 'tail'
                result.setdefault(label, []).append({'segments': len(component), 'closed': closed,
                                                      'max_turn_degrees': max(angles, default=180),
                                                      'max_front_turn_degrees': max(projected, default=180),
                                                      'max_front_turn_position': list(points[projected.index(max(projected))]) if projected else None})
        return result
    finally:
        bm.free()
