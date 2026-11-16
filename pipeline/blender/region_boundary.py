"""材质分界的闭环与三维转角测量；glTF 材质接缝先在临时网格焊接。"""
import math
import bmesh


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
                label = ('ear_l' if sum(v.co.x for v in verts) > 0 else 'ear_r') if region == 'EarInner' else 'tail'
                result.setdefault(label, []).append({'segments': len(component), 'closed': closed,
                                                      'max_turn_degrees': max(angles, default=180)})
        return result
    finally:
        bm.free()
