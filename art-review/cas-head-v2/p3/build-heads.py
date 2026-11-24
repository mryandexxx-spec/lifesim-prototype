"""Offline Blender authoring for the two CAS P3 residents.

blender -b --python-exit-code 1 -P art-review/cas-head-v2/p3/build-heads.py -- \
    --donor ../mpfb-donor/src/mpfb/data --output ../p3-output
"""
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

REVIEW = Path(__file__).resolve().parents[1]
ROOT = REVIEW.parents[1]
PIN = json.loads((REVIEW / 'MPFB-DONOR-PIN.json').read_text())
CHANNELS = ('eyes', 'nose', 'lips', 'chin', 'cheeks')
HEAD = 'mixamorig:Head'
SOURCE = {
    'alex': dict(file='meshy-casual-v1.glb', name='Леон', cut=1.444, x=-.003,
                 height=(1.463, 1.477, 1.492, 1.525, 1.581, 1.655),
                 width=.092, back=.053, skin=(224, 145, 103),
                 lip=(168, 78, 77), brow=(81, 43, 28), iris=(80, 104, 82)),
    'mira': dict(file='meshy-mira-mobile-v1.glb', name='Ася', cut=1.408, x=.001,
                 height=(1.422, 1.423, 1.432, 1.450, 1.513, 1.627),
                 width=.088, back=.049, skin=(216, 147, 113),
                 lip=(163, 59, 73), brow=(70, 36, 29), iris=(94, 67, 45)),
}


def hash_file(path, expected):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f'Unexpected asset SHA for {path}: {actual}')


def donor_data(folder):
    path = folder / '3dobjs/base.obj'
    hash_file(path, PIN['donor']['sha256'])
    points, uvs, surface = [], [], []
    group = None
    with path.open() as stream:
        for line in stream:
            kind, *fields = line.split() if line.strip() else ('',)
            if kind == 'g':
                group = fields[0]
            elif kind == 'v':
                points.append(Vector(map(float, fields)))
            elif kind == 'vt':
                uvs.append(tuple(map(float, fields[:2])))
            elif kind == 'f' and group == 'body':
                face = [tuple(int(index) - 1 for index in token.split('/')[:2]) for token in fields]
                if all(points[index].y > 6.03 for index, _ in face):
                    surface.append(face)
    targets = {}
    lookup = {tuple(round(k, 4) for k in v): i for i, v in enumerate(points)}
    for item in PIN['targets']:
        path = folder / 'targets' / item['path']
        hash_file(path, item['sha256'])
        delta = {}
        with gzip.open(path, 'rt') as stream:
            for line in stream:
                if not line.strip() or line.startswith('#'):
                    continue
                i, x, y, z = line.split()
                i = int(i)
                delta[i] = Vector((float(x), float(y), float(z)))
        for i, d in tuple(delta.items()):
            x, y, z = points[i]
            mirror = lookup.get(tuple(round(k, 4) for k in (-x, y, z)))
            if mirror is not None:
                delta.setdefault(mirror, Vector((-d.x, d.y, d.z)))
        targets[item['channel']] = delta
    return points, uvs, surface, targets


def smoothstep(a, b, x):
    u = min(1., max(0., (x - a) / (b - a)))
    return u * u * (3. - 2. * u)


def soft_peak(x, center, width):
    return math.exp(-((x - center) / width) ** 2)


def shaped_height(y, stations, heights):
    # Monotone cubic prevents a horizontal crease at each anatomical station.
    slopes = [(b - a) / (v - u) for a, b, u, v in zip(heights, heights[1:], stations, stations[1:])]
    tangent = [slopes[0], *(2 * a * b / (a + b) for a, b in zip(slopes, slopes[1:])), slopes[-1]]
    i = min(len(slopes)-1, max(0, sum(station < y for station in stations) - 1))
    stretch = stations[i+1] - stations[i]
    t = (y - stations[i]) / stretch
    if not 0 <= t <= 1:
        return heights[i] + (y - stations[i]) * slopes[i]
    return ((2*t**3 - 3*t**2 + 1) * heights[i] + (t**3 - 2*t**2 + t) * stretch * tangent[i]
            + (-2*t**3 + 3*t**2) * heights[i+1] + (t**3 - t**2) * stretch * tangent[i+1])


def fit_surface(p, spec, family):
    """Landmark stations along the sagittal plane and localized volume edits."""
    x, h, depth = p
    stations = (6.03, 6.19, 6.40, 6.75, 7.28, 8.50)
    z = shaped_height(h, stations, spec['height'])
    u = abs(x)
    x = spec['x'] + x * (spec['width'] + .013 * soft_peak(u, .26, .28))
    front = smoothstep(.64, 1.39, depth)
    face_depth = .064 if family == 'alex' else .060
    y = spec['back'] - (depth + .35) * face_depth
    y += front * (.008 - .012 * soft_peak(h, 6.32, .22))
    y -= front * (.009 if family == 'alex' else .003) * soft_peak(h, 6.95, .17) * soft_peak(u, 0, .16)
    y -= .008 * front * soft_peak(u, .43, .19) * soft_peak(h, 7.09, .26)
    x += math.copysign(front * (.004 if family == 'alex' else -.004) * soft_peak(h, 6.38, .24) * smoothstep(.20, .57, u), p.x)
    if family == 'mira':
        z += .0025 * front * soft_peak(u, .39, .25) * soft_peak(h, 7.25, .24)
        x -= math.copysign(.005 * front * soft_peak(u, .36, .20) * soft_peak(h, 6.34, .27), p.x)
        y -= .007 * front * soft_peak(h, 7.24, .19) * soft_peak(u, .29, .27)
    else:
        z -= .003 * front * soft_peak(h, 7.22, .23) * soft_peak(u, .24, .28)
    z += (.0023 * math.tanh(p.x * 3)) * front * soft_peak(h, 6.64, .22)
    z += (.005 if family == 'mira' else .004) * front * soft_peak(u, .22, .095) * soft_peak(h, 6.64, .12)
    socket = front * soft_peak(u, .30, .18) * soft_peak(h, 7.27, .18)
    z += (.30 if family == 'alex' else .15) * socket * (z - (1.579 if family == 'alex' else 1.517))
    return Vector((x, y, z))


def mesh_object(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def bind(obj, rig, weights=None):
    groups = {}
    for index, row in enumerate(weights or [{HEAD: 1.}] * len(obj.data.vertices)):
        for name, weight in row.items():
            if weight <= 0:
                continue
            if name not in groups:
                groups[name] = obj.vertex_groups.new(name=name)
            groups[name].add([index], weight, 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('Original resident armature', 'ARMATURE')
    mod.object = rig


def boundary_loop(faces):
    uses = Counter(tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:] + f[:1]))
    return closed_rings([e for e, count in uses.items() if count == 1])


def closed_rings(edges):
    neighbors = defaultdict(set)
    for a, b in edges:
        if a != b:
            neighbors[a].add(b)
            neighbors[b].add(a)
    rings = []
    while neighbors:
        first = min(neighbors)
        chain = [first]
        previous = None
        current = first
        while current in neighbors:
            following = sorted(neighbors.pop(current) - {previous})
            if not following:
                break
            previous, current = current, following[0]
            if current == first:
                if len(chain) >= 3:
                    rings.append(chain)
                break
            chain.append(current)
    return rings


def trim_body(body, spec):
    """Bisect a copy of the live body and read the actual cut edge and weights."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    groups = bm.verts.layers.deform.verify()
    plane = spec['cut']
    bmesh.ops.bisect_plane(bm, geom=[*bm.verts, *bm.edges, *bm.faces], dist=1e-7,
                          plane_co=(0, 0, plane), plane_no=(0, 0, 1), clear_outer=True)
    bm.verts.index_update()
    points, weights, uv_colors, edges = {}, {}, {}, set()
    texture = next(node.image for m in body.data.materials for node in m.node_tree.nodes if node.type == 'TEX_IMAGE')
    width, height = texture.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    texture.pixels.foreach_get(pixels)
    pixels = pixels.reshape((height, width, 4))
    uv_layer = bm.loops.layers.uv.active
    for edge in bm.edges:
        if not edge.is_boundary or any(abs(v.co.z - plane) > 5e-6 for v in edge.verts):
            continue
        keys = []
        for v in edge.verts:
            key = tuple(round(x, 6) for x in v.co)
            keys.append(key)
            points[key] = v.co.copy()
            weights[key] = {body.vertex_groups[index].name: weight for index, weight in v[groups].items()}
            samples = [loop[uv_layer].uv for loop in v.link_loops]
            if samples:
                rgb = [pixels[int((uv.y % 1) * (height - 1)), int((uv.x % 1) * (width - 1)), :3] for uv in samples]
                uv_colors[key] = srgb_to_linear(np.median(rgb, axis=0) * 255.)
        edges.add(tuple(sorted(keys)))
    loops = closed_rings(edges)
    if not loops:
        raise ValueError('The source neck cut did not produce a closed contour')
    loop = max(loops, key=len)
    center = sum((points[k] for k in loop), Vector()) / len(loop)
    if abs(center.x) > .02 or len(loop) < 16:
        raise ValueError(f'Invalid source-neck contour: {center}, {len(loop)} points')
    # Prune severed hair tips in the collar area of the fused source mesh.
    if spec['name'] == 'Ася':
        clipped_hair = []
        for f in bm.faces:
            p = f.calc_center_median()
            if p.z < 1.348 or abs(p.x) < .039 or p.y > .023:
                continue
            color = np.mean([pixels[int((l[uv_layer].uv.y % 1)*(height-1)),
                                    int((l[uv_layer].uv.x % 1)*(width-1)), :3] for l in f.loops], axis=0)
            if color[0] < .55 and color[1] < .39:
                clipped_hair.append(f)
        bmesh.ops.delete(bm, geom=clipped_hair, context='FACES')
    # Small hair or mouth components removed by the cut do not belong to the collar.
    for other in loops:
        if other == loop:
            continue
        if all((points[key] - center).xy.length > .04 for key in other):
            tips = {v for v in bm.verts if tuple(round(x, 6) for x in v.co) in set(other)}
            bmesh.ops.delete(bm, geom=list(tips), context='VERTS')
    if spec['name'] == 'Ася':
        close_source_collar_hole(bm, uv_layer)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    body.name = 'Original body below the fitted neckline'
    return [points[k] for k in loop], [weights[k] for k in loop], [uv_colors[k] for k in loop]


def close_source_collar_hole(mesh, uv_layer):
    """Repair the exposed open skin patch inherited from the Mira body copy."""
    def in_patch(vertex):
        x, y, z = vertex.co
        return -.034 < x < -.014 and -.010 < y < .010 and 1.373 < z < 1.395
    bmesh.ops.remove_doubles(mesh, verts=[v for v in mesh.verts if in_patch(v)], dist=8e-6)
    mesh.verts.index_update()
    mesh.verts.ensure_lookup_table()
    border = [edge for edge in mesh.edges if edge.is_boundary and all(in_patch(v) for v in edge.verts)]
    loops = closed_rings([tuple(v.index for v in edge.verts) for edge in border])
    if len(loops) != 1 or len(loops[0]) != 5:
        raise ValueError('Unexpected topology at the source Mira collar hole')
    vertices = [mesh.verts[i] for i in loops[0]]
    sample_vertex = min(vertices, key=lambda vert: vert.co.x)
    source_loop = next(loop for loop in sample_vertex.link_loops if loop.face.normal.y < -.1)
    pigment_uv = source_loop[uv_layer].uv.copy()
    patch = mesh.faces.new(vertices)
    patch.normal_update()
    if patch.normal.y > 0:
        patch.normal_flip()
    patch.smooth = True
    for loop in patch.loops:
        loop[uv_layer].uv = pigment_uv
    bmesh.ops.triangulate(mesh, faces=[patch])


def ring_order(ids, coords, center):
    """Rotate a clockwise/counterclockwise topological loop to the back seam."""
    def angle(i):
        v = coords[i] - center
        return (math.atan2(v.x, v.y) + math.tau) % math.tau
    steps = [(angle(b) - angle(a) + math.pi) % math.tau - math.pi for a, b in zip(ids, ids[1:] + ids[:1])]
    if sum(steps) < 0:
        ids = ids[::-1]
    first = min(range(len(ids)), key=lambda k: angle(ids[k]))
    return ids[first:] + ids[:first]


def collar_bridge(outer, inner, coords, center):
    """Triangulate only the transition from donor quads to the source cut."""
    def angular(i):
        v = coords[i] - center
        return math.atan2(v.x, v.y) % math.tau
    i = j = 0
    while i < len(outer) or j < len(inner):
        a, b = outer[i % len(outer)], inner[j % len(inner)]
        advance_outer = j == len(inner) or (
            i < len(outer) and (
                angular(outer[i + 1]) if i + 1 < len(outer) else math.tau + angular(outer[0])) < (
                angular(inner[j + 1]) if j + 1 < len(inner) else math.tau + angular(inner[0])))
        if advance_outer:
            i += 1
            yield a, b, outer[i % len(outer)]
        else:
            j += 1
            yield a, b, inner[j % len(inner)]


def linear(color):
    return tuple((c / 255 + .055) / 1.055 if c > 10 else c / (255 * 12.92) for c in color)


def srgb_to_linear(color):
    return tuple(v ** 2.4 if c > 10 else v for c, v in zip(color, linear(color)))


def paint(p, spec, family):
    x, h, d = p
    x_abs = abs(x)
    front = smoothstep(.85, 1.43, d)
    color = np.asarray(spec['skin'], dtype=float)
    color += np.asarray((13, 14, 16)) * front * soft_peak(h, 7.03, .69)
    color += np.asarray((14, -4, -1)) * front * soft_peak(x_abs, .44, .20) * soft_peak(h, 7.05, .17)
    color += np.asarray((-6, -16, -17)) * front * soft_peak(x_abs, .30, .20) * soft_peak(h, 7.41, .075)
    color += np.asarray((2, -6, -5)) * front * soft_peak(x_abs, 0, .13) * soft_peak(h, 6.94, .12)
    lid = soft_peak(h, 7.356 + .027 * (1 - min(1., abs(x_abs - .30) / .13)), .031)
    lid *= soft_peak(x_abs, .30, .15) * smoothstep(1.32, 1.41, d)
    color += (np.asarray((105, 61, 51)) - color) * lid * (.38 if family == 'mira' else .26)
    lip_mid = 6.609 + .054 * (min(1, x_abs / .25) ** 1.7)
    lip = 1 - smoothstep(.56, 1.03, math.hypot(x_abs / .285, (h - lip_mid) / (.110 if family == 'mira' else .094)))
    lip *= smoothstep(1.26, 1.48, d)
    color += (np.asarray(spec['lip']) - color) * lip * (.88 if family == 'mira' else .74)
    crease = soft_peak(h, lip_mid, .013) * (1 - smoothstep(.19, .238, x_abs))
    color *= 1 - crease * .43 * smoothstep(1.28, 1.50, d)
    oral = (1 - smoothstep(.98, 1.30, d)) * (1 - smoothstep(.16, .25, x_abs)) * soft_peak(h, lip_mid, .09)
    color += (np.asarray((65, 27, 25)) - color) * oral
    color += 1.2 * math.sin(42 * x + 13 * h) * math.sin(51 * h - 16 * d)
    return (*srgb_to_linear(np.clip(color, 0, 255)), 1)


def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*srgb_to_linear(color), 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat, shader


def bake_skin(obj, spec, family, colors, out):
    layer = obj.data.color_attributes.new(name='Skin pigment', type='FLOAT_COLOR', domain='POINT')
    for item, color in zip(layer.data, colors):
        item.color = color
    mat, shader = material(f'CAS_HEAD_SKIN_{family.upper()}', spec['skin'], .76)
    shader.inputs['Specular IOR Level'].default_value = .23
    obj.data.materials.append(mat)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    paint_node = nodes.new('ShaderNodeVertexColor')
    paint_node.layer_name = layer.name
    emission = nodes.new('ShaderNodeEmission')
    output = nodes.get('Material Output')
    links.new(paint_node.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs[0], output.inputs[0])
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.new(f'{family} · skin atlas', 1024, 1024, alpha=False)
    nodes.active = tex
    select_only(obj)
    # Body, eyes and studio lighting do not participate in this pigment bake.
    bpy.context.scene.cycles.samples = 1
    bpy.ops.object.bake(type='EMIT', margin=10, margin_type='EXTEND')
    tex.image.filepath_raw = str(out / f'{family}-skin.png')
    tex.image.file_format = 'PNG'
    tex.image.save()
    tex.image.pack()
    nodes.remove(emission)
    nodes.remove(paint_node)
    links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    links.new(shader.outputs[0], output.inputs[0])
    # Packed atlas is the material input. Keeping vertex pigment would multiply it in glTF.
    obj.data.color_attributes.remove(layer)


def select_only(*objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def build_face(data, family, spec, rig, body, out):
    points, uvs, surface, targets = data
    seam, seam_weights, seam_colors = trim_body(body, spec)
    donors = sorted({i for f in surface for i, _ in f})
    remap = {old: new for new, old in enumerate(donors)}
    positions = [fit_surface(points[i], spec, family) for i in donors]
    faces = [tuple(remap[i] for i, _ in p) for p in surface]
    outer, = boundary_loop(faces)
    center = sum(seam, Vector()) / len(seam)
    neck = set(outer)
    def radial(v):
        return math.atan2(v.x, v.y) % math.tau
    seam_radii = sorted((radial(p - center), (p - center).xy.length) for p in seam)
    angles, radii = zip(*seam_radii)
    for i, donor_id in enumerate(donors):
        donor = points[donor_id]
        coords = positions[i]
        neck_shape = (1 - smoothstep(6.21, 6.65, donor.y)) * (1 - smoothstep(.78, 1.16, donor.z))
        if i in neck:
            coords.z = spec['cut'] + .011
            neck_shape = 1.
        if neck_shape > 0:
            angle = radial(coords - center)
            radius = float(np.interp(angle, angles, radii, period=math.tau))
            radius *= 1 - .14 * smoothstep(spec['cut'], spec['cut'] + .028, coords.z)
            coords.x = (1 - neck_shape) * coords.x + neck_shape * (center.x + math.sin(angle) * radius)
            coords.y = (1 - neck_shape) * coords.y + neck_shape * (center.y + math.cos(angle) * radius)
    first_seam = len(positions)
    positions.extend(seam)
    outer = ring_order(outer, positions, center)
    inner = ring_order(list(range(first_seam, len(positions))), positions, center)
    faces.extend(collar_bridge(outer, inner, positions, center))
    obj = mesh_object(f'CAS {family.title()} P3 · head and neck', positions, faces)
    obj.data['lifeSimRole'] = 'derivative-head'
    head_uv_values = [uvs[j] for p in surface for _, j in p]
    low = [min(p[a] for p in head_uv_values) for a in (0, 1)]
    high = [max(p[a] for p in head_uv_values) for a in (0, 1)]
    layer = obj.data.uv_layers.new(name='Dedicated face and collar islands')
    uv_by_vertex = {}
    for poly, face in zip(obj.data.polygons, surface):
        for loop_index, (i, ui) in zip(poly.loop_indices, face):
            u, v = uvs[ui]
            uv = (.04 + .90 * (u - low[0]) / (high[0] - low[0]), .25 + .71 * (v - low[1]) / (high[1] - low[1]))
            layer.data[loop_index].uv = uv
            uv_by_vertex[remap[i]] = uv
    ranks = {i: k / len(loop) for loop in (outer, inner) for k, i in enumerate(loop)}
    for poly in list(obj.data.polygons)[len(surface):]:
        high_rank = any(ranks[i] > .85 for i in poly.vertices)
        for li in poly.loop_indices:
            i = obj.data.loops[li].vertex_index
            u = ranks[i]
            if high_rank and u < .15:
                u += 1.
            layer.data[li].uv = (.04 + .88 * u, .06 if i >= first_seam else .19)
    # Recalculate winding across the donor quads and sewn neck bridge.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    colors = [paint(points[i], spec, family) for i in donors]
    colors.extend(tuple(np.clip(rgb, 0, 1)) + (1.,) for rgb in seam_colors)
    for i in outer:
        nearest = min(range(len(seam)), key=lambda j: (seam[j].xy - positions[i].xy).length_squared)
        colors[i] = tuple(.45 * a + .55 * b for a, b in zip(colors[i], colors[first_seam + nearest]))
    bake_skin(obj, spec, family, colors, out)
    weights = [{HEAD: 1.} for _ in donors]
    for i in outer:
        nearest = min(range(len(seam)), key=lambda j: (seam[j].xy - positions[i].xy).length_squared)
        weights[i] = {name: weight * .35 for name, weight in seam_weights[nearest].items()}
        weights[i][HEAD] = weights[i].get(HEAD, 0.) + .65
    bind(obj, rig, weights + seam_weights)
    obj.shape_key_add(name='Basis')
    for name in CHANNELS:
        key = obj.shape_key_add(name=name)
        for i, delta in targets[name].items():
            idx = remap.get(i)
            if idx is None or idx in neck:
                continue
            p = points[i]
            displacement = fit_surface(p + delta, spec, family) - fit_surface(p, spec, family)
            key.data[idx].co += displacement * {
                'eyes': 1.55, 'nose': 1.2, 'lips': 1.32, 'chin': .53, 'cheeks': 1.15,
            }[name]
    correct_morph_triangles(obj)
    print(f'P3 {family}: {len(donors)} donor vertices, {len(surface)} quads, {len(seam)} exact source seam points', flush=True)
    return obj


def correct_morph_triangles(obj):
    """Repair individual collapsing triangles at 100%, including combined extremes."""
    obj.data.calc_loop_triangles()
    triangles = np.asarray([tuple(tri.vertices) for tri in obj.data.loop_triangles])
    basis = np.asarray([tuple(v.co) for v in obj.data.vertices])
    keys = obj.data.shape_keys.key_blocks
    deltas = np.array([[tuple(v.co) for v in keys[name].data] for name in CHANNELS]) - basis

    def normals(points):
        corners = points[triangles]
        return np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])

    surface = normals(basis)
    areas = np.linalg.norm(surface, axis=1)
    cases = [(i,) for i in range(len(CHANNELS))] + [tuple(range(len(CHANNELS)))]
    for case in cases:
        for iteration in range(12):
            posed = normals(basis + deltas[list(case)].sum(axis=0))
            dot = np.sum(surface * posed, axis=1)
            invalid = (areas > 1e-10) & ((np.linalg.norm(posed, axis=1) < .25 * areas) | (dot <= .05 * areas**2))
            if not np.any(invalid):
                break
            affected = np.unique(triangles[invalid])
            deltas[np.ix_(case, affected)] *= .77
        else:
            raise ValueError('Could not repair a folded facial triangle')
    for index, name in enumerate(CHANNELS):
        for point, position in zip(keys[name].data, basis + deltas[index]):
            point.co = position


def vertex_pigment(obj, colors, mat_name, roughness):
    layer = obj.data.color_attributes.new(name='Pigment', type='FLOAT_COLOR', domain='POINT')
    for item, color in zip(layer.data, colors):
        item.color = (*srgb_to_linear(color), 1.)
    mat, shader = material(mat_name, (255, 255, 255), roughness)
    shader.inputs['Specular IOR Level'].default_value = .20 if mat_name == 'Hair pigment' else .34
    pigment = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    pigment.layer_name = layer.name
    mat.node_tree.links.new(pigment.outputs['Color'], shader.inputs['Base Color'])
    obj.data.materials.append(mat)


def build_eyes(face, rig, family, spec):
    """Fit the front hemi-sphere into each recessed, closed orbital skin surface."""
    positions = [v.co.copy() for v in face.data.vertices]
    polys = [tuple(p.vertices) for p in face.data.polygons]
    surface = BVHTree.FromPolygons(positions, polys)
    def front(x, z):
        hit, *_ = surface.ray_cast(Vector((x, -1., z)), (0, 1, 0))
        if hit is None:
            raise ValueError(f'Brow is outside the head: {x}, {z}')
        return hit.y
    eyes_vertices, eyes_faces, color = [], [], []
    brow_vertices, brow_faces = [], []
    width = spec['width'] + .013
    eye_x = .298 * width
    eye_height = 1.578 if family == 'alex' else 1.516
    for side in (-1, 1):
        cx = spec['x'] + side * eye_x
        cz = eye_height + (.001 if side > 0 else 0)
        y_rim = min(front(cx, cz + .0075), front(cx, cz - .0075))
        w, h, depth = ((.0152, .0124, .0125) if family == 'alex' else (.0154, .0138, .0135))
        base = len(eyes_vertices)
        part = 44
        rings = 22
        for k in range(rings + 1):
            phi = .00008 + (math.pi - .00016) * k / rings
            for i in range(part):
                angle = 2 * math.pi * i / part
                x = math.sin(phi) * math.cos(angle)
                z = math.sin(phi) * math.sin(angle)
                y = math.cos(phi)
                eyes_vertices.append((cx + x * w, y_rim + depth + .00075 - y * depth, cz + z * h))
                radial = math.hypot(x + side*.020, z - .020)
                if y < 0 or radial > .61:
                    rgb = (177 + 23 * y, 164 + 28 * y, 151 + 30 * y)
                elif radial < .30:
                    rgb = (24, 21, 22)
                elif radial > .52:
                    rgb = (44, 39, 34)
                else:
                    variation = 13 * math.sin(angle * 15 + radial * 7) + 9 * math.sin(angle * 31)
                    rgb = tuple(max(0, c + variation) for c in spec['iris'])
                color.append(rgb)
        for k in range(rings):
            for i in range(part):
                a = base + k * part + i
                b = base + k * part + (i + 1) % part
                eyes_faces.append((a, b, b + part, a + part))
        eyes_faces.append(tuple(base + i for i in reversed(range(part))))
        eyes_faces.append(tuple(base + rings * part + i for i in range(part)))
        base = len(brow_vertices)
        for step in range(29):
            t = step / 28
            x = cx + side * (.046 * t - .020)
            arch = .005 * math.sin(math.pi * t) + .0015 * math.sin(2 * math.pi * t)
            z = cz + (.013 if family == 'alex' else .013) + arch - .005 * t
            thick = (.0067 if family == 'alex' else .0049) * (1.02 - .70 * t)
            thick *= smoothstep(-.10, .08, t) * (1 - .90 * smoothstep(.79, 1.01, t))
            for across in (-.5, 0, .5):
                height = z + across * thick
                depth = front(x, height) - .00035 - (.00048 if across == 0 else 0.)
                brow_vertices.append((x, depth, height))
            if step:
                i = base + step * 3
                brow_faces.extend(((i - 3, i, i + 1, i - 2), (i - 2, i + 1, i + 2, i - 1)))
    eyes = mesh_object('Separate skinned eyes with iris and sclera', eyes_vertices, eyes_faces)
    fix_normals(eyes)
    vertex_pigment(eyes, color, 'Painted iris and sclera', .24)
    bind(eyes, rig)
    brows = mesh_object('Tapered eyebrows seated against the brow ridge', brow_vertices, brow_faces)
    mat, _ = material('Eyebrow pigment', spec['brow'], .66)
    mat.use_backface_culling = False
    brows.data.materials.append(mat)
    bind(brows, rig)
    return eyes, brows


def fix_normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()


def build_hair(rig, family, spec, face):
    """Sculpt a close scalp base and continuous, individually swept locks."""
    hair_vertices, hair_faces, colors = [], [], []
    alex = family == 'alex'
    center = Vector((spec['x'], .002 if alex else .000, 1.566 if alex else 1.536))
    pigment = np.array((58, 30, 21) if alex else (48, 24, 20))
    skin = BVHTree.FromPolygons([v.co for v in face.data.vertices], [tuple(p.vertices) for p in face.data.polygons])

    def surface(theta, phi, lift=0.):
        front = math.cos(theta)
        side = math.sin(theta)
        wave = .00037 * math.sin(theta * 23 + phi * 10) + .00024 * math.sin(theta * 39 - phi * 7)
        style = (.010 if alex else .003) * soft_peak(theta, -.55, .8) * soft_peak(phi, .52, .6)
        local = Vector((side * math.sin(phi) * (.084 + wave + lift),
                        -front * math.sin(phi) * ((.082 if front > 0 else .088) + wave + lift),
                        math.cos(phi) * ((.099 if alex else .112) + lift + style + wave)))
        axis = local.normalized()
        if phi < 1.46:
            contact, *_ = skin.ray_cast(center + axis * .21, -axis, .20)
            if contact is not None:
                clearance = (contact - center).dot(axis) + .002 - local.length
                local += axis * max(0., min(.010, clearance))
        return center + local
    angular, vertical = 96, 28
    for k in range(vertical + 1):
        t = k / vertical
        for i in range(angular):
            theta = -math.pi + math.tau * i / angular
            view = 0.5 + 0.5 * math.cos(theta)
            if alex:
                rim = 1.93 - 1.01 * view + .08 * math.sin(theta * 2 + .6) * view
                rim += .10 * soft_peak(abs(theta), 1.26, .22)
            else:
                rim = 2.04 - 1.06 * view
                rim += .37 * soft_peak(abs(theta), 1.36, .46)
                rim += .09 * math.sin(2 * theta + .6) * view
            phi = .001 + (rim - .001) * t
            hair_vertices.append(surface(theta, phi))
            streak = 7 * math.sin(theta * 21 + phi * 12) + 4 * math.sin(theta * 47 - phi * 8)
            colors.append(tuple(pigment + streak * np.array((1.3, .95, .68)) + 14 * math.cos(phi)))
            if k:
                j = (k - 1) * angular + i
                n = (k - 1) * angular + (i + 1) % angular
                hair_faces.append((j, n, n + angular, j + angular))
    hair_faces.append(tuple(range(angular - 1, -1, -1)))

    def sculpt_lock(start, end, arch, width, lift, color_shift):
        base = len(hair_vertices)
        along, across = 28, 12
        for k in range(along + 1):
            t = k / along
            theta = start[0] * (1 - t) + end[0] * t + arch[0] * math.sin(math.pi * t)
            phi = start[1] * (1 - t) + end[1] * t + arch[1] * math.sin(math.pi * t)
            shape = (math.sin(math.pi * (.12 + t * .88)) ** .72 + .008) * (1. - .35 * t)
            for j in range(across):
                cross = math.tau * j / across
                side = math.cos(cross)
                crown = math.sin(cross)
                p = surface(theta + width * shape * side, phi + .07 * side * shape,
                            max(-.001, lift * shape * (.40 + .67 * crown)))
                hair_vertices.append(p)
                streak = (6 * math.sin(14 * side + 2 * t) + 4 * math.cos(24 * side - 6 * t)) * max(0, crown)
                colors.append(tuple(pigment + (color_shift + streak + 8 * (1 - t)) * np.array((1.45, 1., .68))))
                if k:
                    a = base + (k - 1) * across + j
                    b = base + (k - 1) * across + (j + 1) % across
                    hair_faces.append((a, b, b + across, a + across))
        hair_faces.append(tuple(base + i for i in range(across - 1, -1, -1)))
        hair_faces.append(tuple(base + along * across + i for i in range(across)))

    if alex:
        for i in range(7):
            sculpt_lock((.49 + .17*i, .38 + .047*i), (-1.24 - .17*i, .93 + .061*i),
                        (.04, .02), .26 - .009*i, .020 - .001*i, 15 - 2*i)
        for i in range(4):
            sculpt_lock((.78 + .12*i, .43 + .13*i), (1.80 + .25*i, 1.28 + .13*i),
                        (.26, -.12), .29, .012, 7 - i)
    else:
        for side in (-1, 1):
            for i in range(6):
                sculpt_lock((side * (.11 + .15*i) - .21, .42 + .079*i),
                            (side * (1.28 + .20*i), 2.06 - .042*i), (side * .51, -.04),
                            .34 - .013*i, .017 - .001*i, 15 - 2*i)
    obj = mesh_object('Sculpted hair cap and swept locks', hair_vertices, hair_faces)
    fix_normals(obj)
    vertex_pigment(obj, colors, 'Hair pigment', .52)
    bind(obj, rig)
    return obj


def studio(family, spec, samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 760
    scene.render.resolution_y = 760
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Warm grey studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (.24, .24, .24, 1)
    scene.view_settings.view_transform = 'AgX'
    center = Vector((0, .001, 1.555 if family == 'alex' else 1.514))
    camera = bpy.data.cameras.new('Portrait camera')
    cam = bpy.data.objects.new(camera.name, camera)
    scene.collection.objects.link(cam)
    scene.camera = cam
    camera.type = 'ORTHO'
    camera.ortho_scale = .40
    for position, energy, size, color in [((-.52, -.74, 2.15), 78, .8, (1., .91, .83)),
                                          ((.54, -.35, 1.62), 22, .94, (.79, .88, 1.)),
                                          ((.13, .55, 2.03), 49, .56, (1., .82, .66))]:
        light = bpy.data.lights.new('Portrait softbox', 'AREA')
        light.energy, light.size, light.color = energy, size, color
        ob = bpy.data.objects.new(light.name, light)
        scene.collection.objects.link(ob)
        ob.location = position
        ob.rotation_euler = (center - ob.location).to_track_quat('-Z', 'Y').to_euler()
    return scene, cam, center


def render_portrait(scene, cam, center, angle, path):
    a = math.radians(angle)
    cam.location = center + Vector((1.40 * math.sin(a), -1.40 * math.cos(a), .014))
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--donor', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--families', nargs='+', choices=SOURCE, default=list(SOURCE))
    parser.add_argument('--quick', action='store_true')
    parser.add_argument('--assets-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    data = donor_data(args.donor)
    for family in args.families:
        spec = SOURCE[family]
        bpy.ops.wm.read_factory_settings(use_empty=True)
        original = ROOT / 'assets/characters' / spec['file']
        hash_file(original, PIN['originalHeroGLBSha256'][family])
        bpy.ops.import_scene.gltf(filepath=str(original))
        rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
        for action in bpy.data.actions:
            action.use_fake_user = True
        rig.animation_data_clear()
        for bone in rig.pose.bones:
            bone.matrix_basis.identity()
        bpy.context.view_layer.update()
        body = next(o for o in bpy.data.objects if o.type == 'MESH')
        scene, cam, center = studio(family, spec, 10 if args.quick else 100)
        face = build_face(data, family, spec, rig, body, out)
        eyewear = build_eyes(face, rig, family, spec)
        hair = build_hair(rig, family, spec, face)
        scene.cycles.samples = 16 if args.quick else 112
        select_only(face)
        if not args.assets_only:
            for angle in (0, 45, 90):
                render_portrait(scene, cam, center, angle, out / f'{family}-neutral-{angle}.png')
        if args.quick:
            continue
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(out / f'{family}-p3.blend'), compress=True)
        select_only(rig, body, face, *eyewear, hair)
        bpy.ops.export_scene.gltf(filepath=str(out / f'{family}-blender.glb'), export_format='GLB',
                                  use_selection=True, export_morph=True, export_morph_normal=True,
                                  export_skins=True, export_animations=False, export_extras=True)
        if args.assets_only:
            continue
        keys = face.data.shape_keys.key_blocks
        for name in CHANNELS:
            keys[name].value = 1.
        for angle in (0, 45, 90):
            render_portrait(scene, cam, center, angle, out / f'{family}-max-{angle}.png')
        for name in CHANNELS:
            keys[name].value = 0.
        rig.animation_data_create()
        for kind, clip in [('walk', 'Walking'), ('sit', 'Sit_to_Stand_Transition_M' if family == 'alex' else 'Sit_Cross_Legged')]:
            action = next((a for a in bpy.data.actions if a.name == clip or a.name == clip + '_' + rig.name), None)
            if action is None:
                continue
            rig.animation_data.action = action
            if hasattr(action, 'slots') and len(action.slots) == 1:
                rig.animation_data.action_slot = action.slots[0]
            frame = round(action.frame_range[0] + .4 * (action.frame_range[1] - action.frame_range[0]))
            scene.frame_set(frame)
            cam.data.ortho_scale = .68
            head_location = rig.matrix_world @ rig.pose.bones[HEAD].head
            portrait_center = head_location + Vector((0., -.016, .047))
            render_portrait(scene, cam, portrait_center, 36,
                            out / f'{family}-pose-{kind}.png')


if __name__ == '__main__':
    main()
