"""Blender background bake of the two anatomical feet from MPFB's CC0 base.

blender -b --python scripts/cas-c3-extract-foot.py -- base.obj foot-template.json
"""
import hashlib
import json
from pathlib import Path
import sys

import bmesh
from mathutils import Vector


SOURCE_SHA = "8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c"
SOURCE_COMMIT = "650c5c53bd6989a8ac264f31fa1d11d4a0c7bd8a"
# OBJ units are decimeters, +Y is up and +Z is forward.
CUT_Y = -7.25


def read_groups(path):
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA:
        raise ValueError("Unexpected MakeHuman source digest")
    positions, groups = [], {}
    current = None
    for line in data.decode().splitlines():
        cells = line.split()
        if not cells:
            continue
        if cells[0] == "v":
            positions.append(tuple(map(float, cells[1:4])))
        elif cells[0] == "g":
            current = groups.setdefault(cells[1], [])
        elif cells[0] == "f" and current is not None:
            current.append(tuple(int(cell.split("/")[0]) - 1 for cell in cells[1:]))
    return positions, groups


def bake_side(positions, groups, side):
    sign = 1 if side == "left" else -1
    keys = {"ankle": "ankle", "ball": "foot-1",
            "medialBall": "toe-1-1", "lateralBall": "toe-5-1"}
    points = {}
    for key, suffix in keys.items():
        faces = groups[f"joint-{side[0]}-{suffix}"]
        unique = {i for face in faces for i in face}
        points[key] = sum((Vector(positions[i]) for i in unique), Vector()) / len(unique)
    body = [face for face in groups["body"]
            if all(positions[i][0] * sign > 0 for i in face)
            and any(positions[i][1] < CUT_Y for i in face)]
    with_mesh = bmesh.new()
    source = {i: with_mesh.verts.new(positions[i]) for i in sorted({i for f in body for i in f})}
    for face in body:
        with_mesh.faces.new([source[i] for i in face])
    bmesh.ops.bisect_plane(with_mesh,
        geom=[*with_mesh.verts, *with_mesh.edges, *with_mesh.faces],
        dist=0.000001, plane_co=(0, CUT_Y, 0), plane_no=(0, 1, 0), clear_outer=True)
    bmesh.ops.triangulate(with_mesh, faces=list(with_mesh.faces), quad_method="FIXED")
    bmesh.ops.recalc_face_normals(with_mesh, faces=list(with_mesh.faces))
    bone = points["ankle"]
    used = sorted((v for v in with_mesh.verts if v.link_faces),
                  key=lambda v: tuple(v.co))
    ids = {v: i for i, v in enumerate(used)}
    sole = min(v.co.y for v in used)

    def canonical(p):
        return [round(float(value), 6) for value in
                ((p.x - bone.x) * .1, (p.y - sole) * .1, (p.z - bone.z) * .1)]

    vertices = [canonical(v.co) for v in used]
    triangles = sorted([ids[v] for v in f.verts] for f in with_mesh.faces)
    edges = sorted(sorted(ids[v] for v in e.verts) for e in with_mesh.edges
                   if e.is_boundary and all(v in ids for v in e.verts))
    boundary = {i for e in edges for i in e}
    if len(edges) != len(boundary) or len(boundary) < 8 or any(
            abs(used[i].co.y - CUT_Y) > 0.00001 for i in boundary):
        raise ValueError(f"Expected one anatomical ankle opening for {side}")
    top = max(v[1] for v in vertices)
    toe = max(vertices, key=lambda v: v[2])
    heel = min(vertices, key=lambda v: v[2])
    with_mesh.free()
    return {"vertices": vertices, "triangles": triangles, "ankleEdges": edges,
            "seamY": top, "landmarks": {**{key: canonical(p) for key, p in points.items()},
                                       "heel": heel, "toe": toe}}


def main():
    source, output = (Path(p) for p in sys.argv[sys.argv.index("--") + 1:])
    positions, groups = read_groups(source)
    result = {
        "version": 1, "units": "m", "axes": "gltf",
        "source": {"license": "CC0-1.0", "sha256": SOURCE_SHA,
                   "revision": SOURCE_COMMIT,
                   "url": f"https://github.com/makehumancommunity/mpfb2/blob/{SOURCE_COMMIT}/src/mpfb/data/3dobjs/base.obj"},
        "sides": {side: bake_side(positions, groups, side) for side in ("left", "right")}
    }
    output.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
