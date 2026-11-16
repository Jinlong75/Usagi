"""022 bidirectional BVH surface comparison in normalized (height=1) coordinates."""
import argparse
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from common import import_model, reset_scene, run, script_args
from prep_usagi import orient_front, in_feature_region, write_json

LIMIT = .0005


def normalize_original(objects):
    """Same translation/scale as clean(), then the prep orientation; no cleanup.

    Keep the original sculptures and independent tail for rendering and the BVH.
    """
    points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
    lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    foot = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    scale = 1 / (hi.z - lo.z)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        world = obj.matrix_world.copy()
        obj.parent = None
        for v in obj.data.vertices:
            v.co = (world @ v.co - foot) * scale
        obj.matrix_world.identity()
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        orientation = orient_front(bm, remove_features=False)
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    obj.data.update()
    bpy.context.view_layer.update()
    return obj, orientation


def mesh_snapshot(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    bm.normal_update()
    return bm


def directed_distance(source, target_tree, regions):
    outside, inside = [], 0
    for v in source.verts:
        if in_feature_region(v.co, regions):
            inside += 1
            continue
        _, _, _, distance = target_tree.find_nearest(v.co)
        outside.append((distance, tuple(v.co)))
    maximum, position = max(outside, default=(0, None))
    return {'region_vertices': inside, 'outside_vertices': len(outside),
            'max_distance': maximum, 'max_position': position}


def compare_surfaces(original, prepared, limit=LIMIT):
    reset_scene()
    reference, orientation = normalize_original(import_model(original))
    regions = orientation['feature_regions']
    raw = mesh_snapshot(reference)
    try:
        reset_scene()
        objects = import_model(prepared)
        if len(objects) != 1:
            raise AssertionError('prepared model must contain one mesh')
        base = mesh_snapshot(objects[0])
        try:
            forward = directed_distance(base, BVHTree.FromBMesh(raw), regions)
            reverse = directed_distance(raw, BVHTree.FromBMesh(base), regions)
        finally:
            base.free()
    finally:
        raw.free()
    return {'input': Path(original).name, 'output': Path(prepared).name,
            'normalized_height': 1, 'limit': limit, 'feature_regions': regions,
            'base_to_original': forward, 'original_to_base': reverse,
            'passed': max(forward['max_distance'], reverse['max_distance']) <= limit}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original', required=True)
    parser.add_argument('--prepared', required=True)
    parser.add_argument('--report')
    args = parser.parse_args(script_args())
    report = compare_surfaces(args.original, args.prepared)
    if args.report:
        write_json(args.report, report)
    print('022 surface comparison: ' + json.dumps(report), flush=True)
    if not report['passed']:
        raise AssertionError('non-feature surface changed by more than 0.5 mm')


if __name__ == '__main__':
    run(main)
