"""Usagi 底模整备。所有测量使用米、Blender Z-up、角色正面 -Y。"""

import argparse
import json
import math
import sys
from pathlib import Path
from types import SimpleNamespace

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

from cleanup_mesh import clean, face_islands, remove_loose
from common import export_glb, run, script_args

COLORS = {"Body": "FFF1C1", "EarInner": "F7B8C4", "Tail": "FFFFFF"}
REGION_BITS = {"Body": 1, "EarInner": 2, "Tail": 4}


def positive_int(value):
    result = int(value)
    if result < 1:
        raise argparse.ArgumentTypeError("迭代次数必须为正整数")
    return result


def average(points):
    points = list(points)
    if not points:
        raise ValueError("测量区域为空")
    return sum(points, Vector()) / len(points)


def quantile(values, fraction):
    values = sorted(values)
    return values[round((len(values) - 1) * fraction)]


def solve(matrix, rhs):
    """小型双精度线性方程；避免 mathutils 单精度的局部球面拟合病态。"""
    rows = [list(row) + [value] for row, value in zip(matrix, rhs)]
    for column in range(len(rows)):
        pivot = max(range(column, len(rows)), key=lambda i: abs(rows[i][column]))
        if abs(rows[pivot][column]) < 1e-14:
            raise ValueError("拟合点共面")
        rows[column], rows[pivot] = rows[pivot], rows[column]
        divisor = rows[column][column]
        rows[column] = [value / divisor for value in rows[column]]
        for i in range(len(rows)):
            if i != column:
                factor = rows[i][column]
                rows[i] = [a - factor * b for a, b in zip(rows[i], rows[column])]
    return [row[-1] for row in rows]


def fit_sphere(points, prior_center=None):
    """线性最小二乘拟合局部球面，返回球心、半径。"""
    points = list(points)
    origin = average(points)
    rows = [[2 * c for c in p - origin] + [1.0] for p in points]
    rhs = [(p - origin).length_squared for p in points]
    matrix = [[sum(row[i] * row[j] for row in rows) for j in range(4)] for i in range(4)]
    target = [sum(row[i] * value for row, value in zip(rows, rhs)) for i in range(4)]
    if prior_center is not None:
        # 局部近共面采样易拟合出半径几厘米、球心在表面上的伪球。
        # 对球心加轻微 Tikhonov 约束，不约束半径；保留真实局部曲率。
        penalty = len(rows) * .005 ** 2
        for i in range(3):
            matrix[i][i] += penalty
            target[i] += penalty * (prior_center[i] - origin[i])
    coefficients = solve(matrix, target)
    offset = Vector(coefficients[:3])
    radius_squared = coefficients[3] + offset.length_squared
    if radius_squared <= 0:
        raise ValueError("无有效拟合球面")
    return origin + offset, math.sqrt(radius_squared)


def orient_front(bm):
    islands = sorted(face_islands(bm), key=len, reverse=True)
    main = islands[0]
    main_center = average(v.co for v in {v for f in main for v in f.verts})
    features = [island for island in islands[1:] if len(island) < len(main) * .05]
    if not features:
        raise ValueError("没有面数小于主块 5% 的五官块，不能可靠判断正面")
    centers = [average(v.co for v in {v for f in island for v in f.verts}) for island in features]
    direction = average(centers) - main_center
    direction.z = 0
    if direction.length < .01:
        raise ValueError("五官水平方向不明确")
    angle = -math.pi / 2 - math.atan2(direction.y, direction.x)
    # 近似对称模型的采样误差不应产生肉眼可见的轻微倾斜。
    cardinal = round(angle / (math.pi / 2)) * (math.pi / 2)
    if abs(angle - cardinal) < math.radians(3):
        angle = cardinal
    rotation = Matrix.Rotation(angle, 3, "Z")
    for vert in bm.verts:
        vert.co = rotation @ vert.co
    discarded = [face for island in islands[1:] for face in island]
    bmesh.ops.delete(bm, geom=discarded, context="FACES")
    remove_loose(bm)
    bm.normal_update()
    return {"rotation_degrees": math.degrees(angle), "front_before": list(direction.normalized()),
            "front_after": list((rotation @ direction).normalized()),
            "orientation_feature_islands": len(features), "removed_feature_islands": len(islands) - 1,
            "removed_feature_faces": len(discarded)}


def smooth_face(bm, tolerance=.004, iterations=30):
    """局部球面偏差检查；只沿正面深度平滑，避免横向投影翻折三角形。"""
    bm.verts.ensure_lookup_table()
    candidates = [v for v in bm.verts if .28 <= v.co.z <= .68 and v.normal.y < -.35
                  and v.co.y < -.05]
    prior_center, _ = fit_sphere(v.co for v in candidates)

    def targets():
        tree = KDTree(len(bm.verts))
        for i, vert in enumerate(bm.verts):
            tree.insert(vert.co, i)
        tree.balance()
        result = []
        for vert in candidates:
            neighbors = [bm.verts[i].co for _, i, _ in tree.find_range(vert.co, .08)
                         if bm.verts[i] != vert and bm.verts[i].normal.dot(vert.normal) > .65]
            if len(neighbors) < 8:
                continue
            try:
                center, radius = fit_sphere(neighbors, prior_center)
            except ValueError:
                continue
            if not .10 < radius < 2 or center.y <= vert.co.y:
                continue
            delta = vert.co - center
            residual = delta.length - radius
            depth_squared = radius ** 2 - delta.x ** 2 - delta.z ** 2
            if depth_squared <= 0:
                continue
            goal = vert.co.copy()
            goal.y = center.y - math.sqrt(depth_squared)
            result.append((vert, abs(residual), goal))
        return result

    initial = targets()
    before = max((error for _, error, _ in initial), default=0)
    changed = set()
    passes = 0
    for passes in range(iterations):
        values = initial if passes == 0 else targets()
        bad = [(v, goal) for v, error, goal in values if error > tolerance * .98]
        if not bad:
            break
        for vert, goal in bad:
            vert.co = vert.co.lerp(goal, .65)
            changed.add(vert.index)
        bm.normal_update()
    after = max((error for _, error, _ in targets()), default=0)
    if after > tolerance:
        raise ValueError(f"脸部局部球面偏差仍为 {after:.6f} m（限值 {tolerance}）")
    return {"vertices_processed": len(changed), "vertices_checked": len(candidates),
            "max_deviation_before": before, "max_deviation_after": after,
            "tolerance": tolerance, "iterations": passes,
            "method": "local least-squares sphere, radius-0.08m neighborhood, weak global-center regularization; front-depth projection with X/Z pinned"}


def shape_profile(points, bm=None):
    """归一化 Usagi 轮廓的保守测量；头顶取两耳之间中央表面的最高点。"""
    height = max(p.z for p in points)
    head = [p for p in points if .38 * height < p.z < .68 * height]
    width = max(abs(p.x) for p in head)
    crown = [p for p in points if abs(p.x) < width * .08 and .58 * height < p.z < .85 * height]
    head_top = max(crown, key=lambda p: p.z).z if crown else .72 * height
    if bm is not None:
        hit, _, _, _ = BVHTree.FromBMesh(bm).ray_cast(Vector((0, 0, .50 * height)), Vector((0, 0, 1)))
        if hit is not None:
            head_top = hit.z
    arm_candidates = [p for p in points if .16 * height < p.z < .36 * height]
    outer = quantile([abs(p.x) for p in arm_candidates], .96)
    arm_z = average(p for p in arm_candidates if abs(p.x) >= outer).z
    # 腋下躯干宽度由手臂下方水平带估计，避免把手尖当成躯干边界。
    lower = [abs(p.x) for p in points if arm_z - .065 * height < p.z < arm_z - .045 * height]
    trunk_width = max(lower) if lower else width * .78
    profile = {"height": height, "head_top": head_top, "head_width": width,
               "arm_z": arm_z, "trunk_width": min(trunk_width, width * .83)}
    tail_points = [p for p in points if .13 * height < p.z < .26 * height
                   and abs(p.x) < .065 * height and p.y > .21 * height]
    if len(tail_points) >= 8:
        center, radius = fit_sphere(tail_points)
        if .015 * height < radius < .12 * height:
            profile.update(tail_center=list(center), tail_radius=radius)
    return profile


def waist_envelopes(bm, center_z, half_width, excluded=None):
    """上下边界带拟合椭圆；不把尾巴和手尖当成躯干剖面。"""
    endpoints = []
    for z in (center_z - half_width, center_z + half_width):
        band = [v.co for v in bm.verts if v not in (excluded or set())
                and abs(v.co.z - z) < half_width * .20]
        if len(band) < 8:
            band = sorted((v.co for v in bm.verts if v not in (excluded or set())),
                          key=lambda p: abs(p.z - z))[:48]
        rows = [[p.x ** 2, p.y ** 2, p.y] for p in band]
        coefficients = solve([[sum(row[i] * row[j] for row in rows) for j in range(3)]
                              for i in range(3)], [sum(row[i] for row in rows) for i in range(3)])
        if coefficients[0] <= 0 or coefficients[1] <= 0:
            raise ValueError("躯干边界无法拟合有效椭圆")
        endpoints.append(coefficients)
    return endpoints


def envelope_radius(point, center_z, half_width, endpoints):
    angle = math.atan2(point.y, point.x)
    radii = []
    for a, b, c in endpoints:
        quadratic = a * math.cos(angle) ** 2 + b * math.sin(angle) ** 2
        linear = c * math.sin(angle)
        radii.append((-linear + math.sqrt(linear ** 2 + 4 * quadratic)) / (2 * quadratic))
    t = (point.z - center_z + half_width) / (2 * half_width)
    return radii[0] * (1 - t) + radii[1] * t


def waist_depth(bm, center_z, half_width, trunk_limit=None, excluded=None, endpoints=None):
    """顶点到上下边界椭圆调和包络的最大径向向内偏差，排除手臂/尾巴。"""
    endpoints = endpoints or waist_envelopes(bm, center_z, half_width, excluded)
    depths = []
    for vert in bm.verts:
        p = vert.co
        if vert in (excluded or set()) or abs(p.z - center_z) >= half_width:
            continue
        if trunk_limit is not None and (abs(p.x) >= trunk_limit or abs(p.y) / max(math.hypot(p.x, p.y), 1e-8) < .42):
            continue
        depths.append(max(0, envelope_radius(p, center_z, half_width, endpoints) - math.hypot(p.x, p.y)))
    return max(depths, default=0)


def smooth_waist(bm, center_z, half_width=.06, iterations=100, trunk_limit=None, enabled=True, excluded=None):
    """固定带边界/手臂/Z/方位角，径向 Laplacian + 精确有符号体积补偿。"""
    selected = [v for v in bm.verts if abs(v.co.z - center_z) < half_width - 1e-6
                and (trunk_limit is None or abs(v.co.x) < trunk_limit) and v not in (excluded or set())]
    endpoints = waist_envelopes(bm, center_z, half_width, excluded)
    before = waist_depth(bm, center_z, half_width, trunk_limit, excluded, endpoints)
    signed_volume = bm.calc_volume(signed=True)
    original = {v: v.co.copy() for v in bm.verts}
    directions = {v: Vector((v.co.x, v.co.y, 0)).normalized() for v in selected}
    taper = {v: math.sin(math.pi * (v.co.z - center_z + half_width) / (2 * half_width)) ** 2
             for v in selected}
    # 上下固定边界的线性插值是径向 1D Laplacian 的调和解。
    goals_by_vertex = {v: envelope_radius(v.co, center_z, half_width, endpoints) for v in selected}
    if enabled:
        for _ in range(iterations):
            radii = {v: math.hypot(v.co.x, v.co.y) for v in bm.verts}
            goals = {v: radii[v] + .2 * taper[v] * (goals_by_vertex[v] - radii[v]) for v in selected}
            for v, radius in goals.items():
                v.co.x, v.co.y = directions[v].x * radius, directions[v].y * radius
            # 仅 XY 移动，体积关于补偿距离是二次多项式；三次采样后求靠近零的根。
            current = {v: v.co.copy() for v in selected}
            def volume_at(offset):
                for v in selected:
                    v.co = current[v] + directions[v] * (offset * taper[v])
                return bm.calc_volume(signed=True)
            v0 = volume_at(0)
            epsilon = .001
            vp, vm = volume_at(epsilon), volume_at(-epsilon)
            linear = (vp - vm) / (2 * epsilon)
            quadratic = (vp + vm - 2 * v0) / (2 * epsilon ** 2)
            offset = 0
            if abs(linear) > 1e-10:
                for _ in range(5):
                    derivative = linear + 2 * quadratic * offset
                    if abs(derivative) < 1e-10:
                        break
                    offset -= (v0 + linear * offset + quadratic * offset ** 2 - signed_volume) / derivative
                volume_at(offset)
            else:
                volume_at(0)
        bm.normal_update()
    after = waist_depth(bm, center_z, half_width, trunk_limit, excluded, endpoints)
    return {"enabled": enabled, "iterations": iterations if enabled else 0,
            "center_z": center_z, "half_width": half_width, "trunk_x_limit": trunk_limit,
            "vertices_processed": sum((v.co - original[v]).length > 1e-8 for v in bm.verts),
            "max_inward_depth_before": before, "max_inward_depth_after": after,
            "volume_before": abs(signed_volume), "volume_after": abs(bm.calc_volume(signed=True)),
            "method": "radial Laplacian relaxation toward angular Dirichlet harmonic profiles; signed-volume compensation with sin^2 boundary taper; Z/azimuth/arms pinned; depth vs interpolated fitted boundary ellipses"}


def ear_sections(points, profile, side):
    base_z = profile["head_top"]
    ear = [p for p in points if p.z > base_z and p.x * side > profile["head_width"] * .04]
    if not ear:
        raise ValueError("没有找到两只耳朵")
    tip_z = max(p.z for p in ear)
    sections = []
    for i in range(5):
        z = base_z + (tip_z - base_z) * i / 4
        near = [p for p in ear if abs(p.z - z) < (tip_z - base_z) * .07]
        if not near:
            nearest = sorted(ear, key=lambda p: abs(p.z - z))[:8]
            near = nearest
        lo = Vector(tuple(min(p[j] for p in near) for j in range(3)))
        hi = Vector(tuple(max(p[j] for p in near) for j in range(3)))
        mid = (lo + hi) / 2
        mid.z = z
        sections.append({"center": mid, "half_width": max((hi.x - lo.x) / 2, .005),
                         "front_y": lo.y, "back_y": hi.y})
    return sections


def ear_inner_field(point, normal, sections):
    """同一长椭圆的连续隐式量；保留 60%/.43/.51/.08..94 和前侧限制。"""
    z0, z1 = sections[0]["center"].z, sections[-1]["center"].z
    t = (point.z - z0) / max(z1 - z0, 1e-8)
    sample = max(0, min(1, t))
    index = min(int(sample * 4), 3)
    alpha = sample * 4 - index
    a, b = sections[index:index + 2]
    center = a["center"].lerp(b["center"], alpha)
    width = a["half_width"] * (1 - alpha) + b["half_width"] * alpha
    ellipse = ((point.x - center.x) / (width * .60)) ** 2 + ((t - .51) / .43) ** 2 - 1
    return max(ellipse, .08 - t, t - .94, (point.y - center.y) / width, normal.y + .25)


def ear_inner_region(point, normal, sections):
    return ear_inner_field(point, normal, sections) < 0


def tail_field(point, normal, profile):
    """球面距离与背面半空间的连续交集；未拟合球面时沿用原回退区间。"""
    h = profile["height"]
    if "tail_center" in profile:
        center = Vector(profile["tail_center"])
        radius = profile["tail_radius"]
        sphere = (point - center).length - radius * 1.03  # 只留球本体；1.15 会在球上方身体留白色月牙（主导 2026-11-16）
        back = center.y - radius * .25 - point.y
        # 紧支撑 smooth-max：保留球内/背面两个约束，只圆滑它们相交处的尖角。
        # TODO(lead): 对照尾巴特写确认交界最多 0.5 mm 内收可接受。
        blend = .002 * h
        overlap = max(blend - abs(sphere - back), 0)
        return max(sphere, back) + overlap ** 2 / (4 * blend)
    return max(.13 * h - point.z, point.z - .27 * h, abs(point.x) - .105 * h,
               .205 * h - point.y, (.15 - normal.y) * h)


def tail_region(point, normal, profile):
    return tail_field(point, normal, profile) < 0


def cut_isocontour(bm, field, material_index):
    """共享边只切一次，再在原三角面内连接两交点，不复制接缝顶点。

    顶点隐式量异号时沿原边二分求零，
    法线也沿边连续插值；所有新点仍在原表面上。
    """
    values = {v: field(v.co, v.normal) for v in bm.verts}
    intersections = {}
    original_faces = list(bm.faces)
    for edge in list(bm.edges):
        a, b = edge.verts
        fa, fb = values[a], values[b]
        if (fa < 0) == (fb < 0):
            continue
        lo, hi = 0.0, 1.0
        for _ in range(32):
            mid = (lo + hi) / 2
            value = field(a.co.lerp(b.co, mid), a.normal.lerp(b.normal, mid))
            if (value < 0) == (fa < 0):
                lo = mid
            else:
                hi = mid
        factor = (lo + hi) / 2
        faces = list(edge.link_faces)
        if factor < 1e-5:
            vert = a
        elif factor > 1 - 1e-5:
            vert = b
        else:
            _, vert = bmesh.utils.edge_split(edge, a, factor)
        values[vert] = 0.0
        for face in faces:
            intersections.setdefault(face, set()).add(vert)
    for face in original_faces:
        points = intersections.get(face, set())
        if len(points) == 2:
            a, b = points
            if not any(b in edge.verts for edge in a.link_edges):
                bmesh.utils.face_split(face, a, b)
    # 交点处非线性场沿弦会略微向内弯：用原三角面线性场的中心值，
    # 避免瘦长外侧碎片的几何中心落回理想曲线内而重新染色。
    for face in bm.faces:
        samples = [values[v] for v in face.verts if abs(values[v]) > 1e-10]
        if samples and sum(samples) / len(samples) < 0:
            face.material_index = material_index
    bm.normal_update()


def split_region_boundaries(obj, profile, ears):
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        # Marching triangles has at most two intersections per face.
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        before = len(bm.faces)
        # 尾根边界局部线性细分，不改原表面。
        tail_edges = [e for e in bm.edges if all(
            abs(tail_field(v.co, v.normal, profile)) < .025 * profile["height"]
            for v in e.verts)]
        bmesh.ops.subdivide_edges(bm, edges=tail_edges, cuts=3, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        after_local = len(bm.faces)
        bm.normal_update()
        for sections in ears.values():
            cut_isocontour(bm, lambda p, n: ear_inner_field(p, n, sections), 1)
        cut_isocontour(bm, lambda p, n: tail_field(p, n, profile), 2)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-8)
        remove_loose(bm)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bm.normal_update()
        report = {"faces_before_tail_subdivision": before, "faces_before_cut": after_local, "faces_after_cut": len(bm.faces),
                  "tail_halfspace_blend_m": .002 * profile["height"],
                  "connected_components": len(face_islands(bm)),
                  "zero_area_faces": sum(f.calc_area() <= 1e-14 for f in bm.faces),
                  "method": "shared-edge exact implicit zero crossing, triangle face split; continuous interpolated normal and front/back halfspaces"}
        bm.to_mesh(obj.data)
        obj.data.update()
        return report
    finally:
        bm.free()


def classify_region(point, normal, profile, ears):
    for sections in ears.values():
        if ear_inner_region(point, normal, sections):
            return "EarInner"
    if tail_region(point, normal, profile):
        return "Tail"
    return "Body"


def linear_color(hex_color):
    def channel(value):
        value = int(value, 16) / 255
        return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
    return tuple(channel(hex_color[i:i + 2]) for i in (0, 2, 4)) + (1,)


def assign_regions(obj, profile, ears):
    obj.data.materials.clear()
    for name, color in COLORS.items():
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = linear_color(color)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = mat.diffuse_color
        bsdf.inputs["Roughness"].default_value = 1
        obj.data.materials.append(mat)
    boundary_cut = split_region_boundaries(obj, profile, ears)
    obj["usagi_boundary_cut"] = boundary_cut
    groups = {name: obj.vertex_groups.new(name=name) for name in COLORS}
    membership = {name: set() for name in COLORS}
    counts = dict.fromkeys(COLORS, 0)
    names = list(COLORS)
    for face in obj.data.polygons:
        name = names[face.material_index]
        face.material_index = names.index(name)
        face.use_smooth = True
        membership[name].update(face.vertices)
        counts[name] += 1
    for name, indices in membership.items():
        if indices:
            groups[name].add(sorted(indices), 1, "REPLACE")
    # glTF 没有原生的无骨架顶点组：逐点位掩码跨材质拆点保留成员关系。
    attribute = obj.data.attributes.new(name="_USAGI_REGION", type="FLOAT", domain="POINT")
    for index, value in enumerate(attribute.data):
        value.value = sum(REGION_BITS[name] for name in COLORS if index in membership[name])
    obj["usagi_vertex_groups"] = REGION_BITS
    return counts


def measure_landmarks(obj, profile, ears):
    points = [v.co.copy() for v in obj.data.vertices]
    h, arm_z = profile["height"], profile["arm_z"]
    head_band = [p for p in points if .38 * h < p.z < .60 * h]
    # 最宽头截面的高度；轻微采样差异以中位带平均吸收。
    widest = quantile([abs(p.x) for p in head_band], .92)
    head_z = average(p for p in head_band if abs(p.x) >= widest).z
    front = [v for v in obj.data.vertices if abs(v.co.x) < .04 * h and v.co.y < -.15 * h
             and abs(v.co.z - head_z) < .07 * h]
    face_vertex = min(front, key=lambda v: abs(v.co.x) + abs(v.co.z - head_z))
    face = face_vertex.co.copy()
    head_center = Vector((0, 0, head_z))
    radius = (face - head_center).length
    # 无明显脖子的吉祥物：手臂根部上方 0.06 m 内最窄躯干截面。
    sections = []
    for i in range(13):
        z = arm_z + .01 * h + i * .005 * h
        band = [p for p in points if abs(p.z - z) < .008 * h and abs(p.x) < profile["trunk_width"]]
        if band:
            sections.append((max(p.x for p in band) - min(p.x for p in band), z))
    neck_z = min(sections)[1] if sections else arm_z + .04 * h
    landmarks = {"height": h, "feet_bottom": [0, 0, min(p.z for p in points)],
                 "hips": [0, 0, .12 * h], "chest": [0, 0, arm_z], "neck": [0, 0, neck_z],
                 "head_center": list(head_center), "head_top": [0, 0, profile["head_top"]],
                 "face_center": list(face), "face_normal": list(face_vertex.normal.normalized()),
                 "face_radius": radius}
    for suffix, side in (("l", 1), ("r", -1)):
        arm = [p for p in points if abs(p.z - arm_z) < .05 * h and p.x * side > 0]
        tip = max(arm, key=lambda p: p.x * side)
        foot_points = [p for p in points if p.z < .055 * h and p.x * side > 0]
        bottom = min(p.z for p in foot_points)
        foot = min([p for p in foot_points if p.z < bottom + .025 * h], key=lambda p: p.y)
        root = Vector((side * profile["trunk_width"], 0, arm_z))
        axis = [list(section["center"]) for section in ears[suffix]]
        landmarks.update({f"arm_root_{suffix}": list(root), f"arm_tip_{suffix}": list(tip),
                          f"leg_root_{suffix}": [foot.x, 0, .075 * h], f"foot_{suffix}": list(foot),
                          f"ear_base_{suffix}": axis[0], f"ear_tip_{suffix}": axis[-1],
                          f"ear_axis_{suffix}": axis})
    tail_points = [face.center for face in obj.data.polygons if obj.data.materials[face.material_index].name == "Tail"]
    landmarks["tail"] = list(average(tail_points)) if tail_points else list(max(
        (p for p in points if .12 * h < p.z < .27 * h), key=lambda p: p.y))
    landmarks["_meta"] = {
        "units": "meters", "coordinates": "Blender Z-up; front -Y; character left +X; GLB Y-up",
        "neck_algorithm": "minimum X span in 0.008m slices, arm-root +0.01..0.07m; central trunk only",
        "ear_algorithm": "five equally spaced Z sections from central crown to ear maximum; midpoint of section XY bounding box",
        "face_algorithm": "front surface vertex nearest central widest-head height; vertex normal; radius to head center",
        "approximate": ["hips", "chest", "neck", "leg_root_l", "leg_root_r", "arm_root_l", "arm_root_r"],
        "note": "TODO(lead): stylized character has no anatomical neck/hips; confirm joint pivots against landmark previews before rigging"}
    return landmarks


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prep(args):
    paths = [Path(value).resolve() for value in (args.input, args.output, args.landmarks, args.report)]
    if len(set(paths)) != len(paths):
        raise ValueError("输入、底模、关键点和报告必须使用不同路径")
    # 朝向检测前保留五官；碎片在检测完成后统一按非主块删除。
    obj, cleanup = clean(SimpleNamespace(input=args.input, output=args.output, report=args.report,
                                        merge_dist=.0001, min_island_ratio=0, target_height=1),
                         write_output=False)
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        orientation = orient_front(bm)
        face_report = smooth_face(bm)
        profile = shape_profile([v.co for v in bm.verts], bm)
        tail_verts = {v for v in bm.verts if tail_region(v.co, v.normal, profile)}
        waist = smooth_waist(bm, profile["arm_z"], iterations=args.waist_iterations,
                             trunk_limit=profile["trunk_width"], enabled=args.smooth_waist == "on",
                             excluded=tail_verts)
        # 增加耳朵采样，仅线性细分、完全不改变原轮廓，支持平涂长椭圆边界。
        subdivision_before = len(bm.faces)
        ear_faces_before = sum(all(v.co.z > profile["head_top"] for v in f.verts) for f in bm.faces)
        ear_edges = [e for e in bm.edges if all(v.co.z > profile["head_top"] for v in e.verts)]
        bmesh.ops.subdivide_edges(bm, edges=ear_edges, cuts=3, use_grid_fill=True)
        subdivision_after = len(bm.faces)
        ear_faces_after = sum(all(v.co.z > profile["head_top"] for v in f.verts) for f in bm.faces)

        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    obj.data.update()
    ears = {suffix: ear_sections([v.co for v in obj.data.vertices], profile, side)
            for suffix, side in (("l", 1), ("r", -1))}
    counts = assign_regions(obj, profile, ears)
    from region_boundary import boundary_metrics
    boundary_report = dict(obj["usagi_boundary_cut"])
    boundary_report.update(faces_before_subdivision=subdivision_before,
                           faces_after_subdivision=subdivision_after,
                           ear_faces_before_subdivision=ear_faces_before,
                           ear_faces_after_subdivision=ear_faces_after,
                           boundaries=boundary_metrics(obj),
                           ear_inner_max_face_normal_y=max(
                               f.normal.y for f in obj.data.polygons if f.material_index == 1))
    landmarks = measure_landmarks(obj, profile, ears)
    # 报告只写仓库相对路径/文件名，不将本机私有路径写进提交产物。
    cleanup.pop("input", None)
    cleanup.pop("output", None)
    report = {"input": Path(args.input).name, "output": Path(args.output).name,
              "cleanup": cleanup, **orientation, "face": face_report, "waist": waist,
              "region_boundary": boundary_report, "material_face_counts": counts, "colors_srgb": {k: "#" + v for k, v in COLORS.items()},
              "vertex_groups": REGION_BITS, "vertex_groups_storage": "_USAGI_REGION point attribute bitmask + usagi_vertex_groups extras; common.import_model restores Blender groups",
              "vertices": len(obj.data.vertices), "faces": len(obj.data.polygons),
              "profile": profile}
    export_glb(args.output, export_attributes=True, export_extras=True, export_shared_accessors=True)
    write_json(args.landmarks, landmarks)
    write_json(args.report, report)
    print(json.dumps(report, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="Usagi 转正、清脸、平滑腰线、分材质与测量")
    parser.add_argument("--in", dest="input", required=True)
    parser.add_argument("--out", dest="output", required=True)
    parser.add_argument("--landmarks", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--smooth-waist", choices=("on", "off"), default="off")
    parser.add_argument("--waist-iterations", type=positive_int, default=100)
    prep(parser.parse_args(script_args()))


if __name__ == "__main__":
    run(main)
