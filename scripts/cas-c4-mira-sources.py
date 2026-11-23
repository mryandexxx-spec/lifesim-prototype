#!/usr/bin/env python3
"""Convert the three approved, independently authored MakeHuman CC0 female shoe
sources to reproducible texture-preserving static GLB pairs for the C3 fitter.

This imports actual vendor OBJ geometry, NOT new procedural footwear. Never
uses an image/model generator, never touches Alex or game/save assets.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "assets/characters/cas-c3"
PIN = {
    "ballet": ("toigo_ballet_flats", "flats_ballet.obj", "BalletFlats.png",
               "80fd320014da", "f72c35c56b67"),
    "mary-jane": ("toigo_mj_cloth_shoes", "mj_shoes.obj", "MJ-shoes3.png",
                  "adcfd0886d1e", "fa20149c846d"),
    "ankle-boots": ("toigo_ankle_boots_female", "boots_ankle.obj", "BootsAnkle.png",
                    "dfceab751494", "2d915244856d"),
}
URL = "https://files2.makehumancommunity.org/asset_packs/shoes01/shoes01_cc0.zip"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def padded(data, padding=b"\0"):
    return data + padding * ((-len(data)) % 4)


def make_glb(mesh, texture):
    chunks = []
    views = []
    accessors = []
    offset = 0

    def append(data, target=None):
        nonlocal offset
        data = padded(data)
        idx = len(views)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data),
                      **({"target": target} if target else {})})
        chunks.append(data)
        offset += len(data)
        return idx

    def attribute(rows, kind, count, target=34962):
        flat = [value for row in rows for value in row]
        encoded = struct.pack("<" + kind * len(flat), *flat)
        idx = append(encoded, target)
        width = len(rows[0])
        at = len(accessors)
        item = {"bufferView": idx, "componentType": 5126 if kind == "f" else 5125,
                "count": len(rows), "type": "SCALAR" if width == 1 else "VEC" + str(width)}
        if count:
            item["min"] = [min(row[i] for row in rows) for i in range(width)]
            item["max"] = [max(row[i] for row in rows) for i in range(width)]
        accessors.append(item)
        return at

    positions = attribute(mesh["positions"], "f", True)
    normals = attribute(mesh["normals"], "f", False)
    uv = attribute(mesh["uv"], "f", False)
    indices = mesh["indices"]
    faces = [[n] for n in indices]
    index_accessor = attribute(faces, "I", False, 34963)
    texture_view = append(texture)
    gltf = {
        "asset": {"version": "2.0", "generator": "LifeSim C4 source-preserving OBJ importer"},
        "buffers": [{"byteLength": offset}], "bufferViews": views, "accessors": accessors,
        "images": [{"bufferView": texture_view, "mimeType": "image/png"}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "textures": [{"source": 0, "sampler": 0}],
        "materials": [{"name": "MakeHuman CC0 source cloth/footwear",
                       "pbrMetallicRoughness": {
                          "baseColorTexture": {"index": 0},
                          "metallicFactor": 0, "roughnessFactor": .88},
                       "doubleSided": True}],
        "meshes": [{"name": "Actual CC0 female pair", "primitives": [{
            "attributes": {"POSITION": positions, "NORMAL": normals, "TEXCOORD_0": uv},
            "indices": index_accessor, "material": 0}]}],
        "nodes": [{"mesh": 0, "name": "MakeHuman source pair"}],
        "scenes": [{"nodes": [0]}], "scene": 0
    }
    header = padded(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    data = b"".join(chunks)
    output = struct.pack("<III", 0x46546C67, 2, 28 + len(header) + len(data))
    output += struct.pack("<II", len(header), 0x4E4F534A) + header
    output += struct.pack("<II", len(data), 0x004E4942) + data
    return output


def parse_obj(data):
    source = data.decode("utf-8", errors="strict").splitlines()
    points, uvs, normals, output, faces = [], [], [], {}, []
    vertices, texcoords, vertex_normals = [], [], []

    def index(value, length):
        number = int(value)
        return number - 1 if number > 0 else length + number

    for line in source:
        fields = line.split()
        if not fields or fields[0].startswith("#"):
            continue
        if fields[0] == "v":
            points.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "vt":
            uvs.append(tuple(map(float, fields[1:3])))
        elif fields[0] == "vn":
            normals.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "f":
            corners = []
            for ref in fields[1:]:
                sections = ref.split("/")
                v = index(sections[0], len(points))
                vt = index(sections[1], len(uvs)) if len(sections) > 1 and sections[1] else None
                vn = index(sections[2], len(normals)) if len(sections) > 2 and sections[2] else None
                if v < 0 or v >= len(points):
                    raise ValueError("Invalid CC0 OBJ position index")
                corners.append((v, vt, vn))
            for i in range(1, len(corners)-1):
                faces.append((corners[0], corners[i], corners[i+1]))
    if not points or not faces:
        raise ValueError("MakeHuman source lacks original triangles")
    if not uvs:
        raise ValueError("MakeHuman source lacks original UVs")
    xgroups = {side: 0 for side in ("left", "right")}
    indices = []
    for face in faces:
        raw = [points[vertex[0]] for vertex in face]
        x = [p[0] for p in raw]
        if min(x) < -0.15 and max(x) > .15:
            raise ValueError("MakeHuman source has a triangle crossing both shoes")
        xgroups["left" if sum(x) > 0 else "right"] += 1
        p0, p1, p2 = raw
        a = tuple(p1[i] - p0[i] for i in range(3))
        b = tuple(p2[i] - p0[i] for i in range(3))
        n = (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
        magnitude = math.sqrt(sum(v*v for v in n)) or 1.
        face_normal = tuple(v / magnitude for v in n)
        for v, vt, vn in face:
            if vt is None or not 0 <= vt < len(uvs):
                raise ValueError("MakeHuman original UV missing on face")
            # If no authored normal is present, preserve each triangle's
            # surface direction instead of fabricating smoothed foot geometry.
            key = (v, vt, vn) if vn is not None else (v, vt, len(indices)//3)
            if key not in output:
                output[key] = len(vertices)
                vertices.append(points[v])
                uv = uvs[vt]
                texcoords.append((uv[0], 1 - uv[1]))
                vertex_normals.append(normals[vn] if vn is not None else face_normal)
            indices.append(output[key])
    if min(xgroups.values()) < 25:
        raise ValueError("MakeHuman source is not a real left/right footwear pair")
    return {"positions": vertices, "normals": vertex_normals,
            "uv": texcoords, "indices": indices, "sourceFaces": len(faces),
            "sides": xgroups}


def main():
    import sys
    # C4A's byte-range client was independently vetted on real source ZIP.
    path = ROOT / "scripts/cas-c4-source-audit.py"
    spec = importlib.util.spec_from_file_location("c4_source_audit", path)
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    print("C4B opening approved CC0 shoe archive", flush=True)
    archive = None
    errors = []
    source_url = None
    for url in audit.MIRRORS:
        try:
            archive = zipfile.ZipFile(audit.RangeSource(url))
            source_url = url
            break
        except Exception as exc:
            errors.append(url + ": " + str(exc))
            print("C4B source mirror fallback: " + str(exc), flush=True)
    if archive is None:
        raise RuntimeError("No audited CC0 MakeHuman mirror available: " + "; ".join(errors))
    result = {"version": 1, "sourceURL": source_url, "styles": {}}
    FOLDER.mkdir(parents=True, exist_ok=True)
    for name, (id, obj_name, image_name, obj_pin, png_pin) in PIN.items():
        folder = "clothes/" + id + "/"
        files = [path for path in archive.namelist() if path.startswith(folder)]
        obj = archive.read(folder + obj_name)
        image = archive.read(folder + image_name)
        mhclo = archive.read(folder + id + ".mhclo")
        header = mhclo.decode("utf-8", errors="replace")[:3000]
        if not re.search(r"(?im)^\s*#?\s*license\s*[:= ]\s*CC0\b", header):
            raise ValueError(name + " has no per-source CC0 declaration")
        if not digest(obj).startswith(obj_pin) or not digest(image).startswith(png_pin):
            raise ValueError(name + " pinned original vendor bytes changed")
        if not image.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError(name + " is missing its real PNG artwork")
        mesh = parse_obj(obj)
        # C4A initially confused similarly named ballet/flower variants.
        # Verify the *exact*, SHA-pinned OBJ topology against the current
        # exact-file parser instead of applying an incorrect variant count.
        actual = audit.geometry(obj)["triangles"]
        if mesh["sourceFaces"] != actual or actual != {
                "ballet": 8960, "mary-jane": 1004, "ankle-boots": 4120}[name]:
            raise ValueError(name + " exact source triangulation inconsistent: " +
                             str(mesh["sourceFaces"]) + " vs " + str(actual))
        model = make_glb(mesh, image)
        if audit.inspect_glb(model)["triangles"] != actual:
            raise ValueError(name + " exported glTF indices lost source triangles")
        dest = FOLDER / ("c4-" + name + ".source.glb")
        dest.write_bytes(model)
        result["styles"][name] = {
            "file": dest.name, "sha256": digest(model),
            "sourceObjSha256": digest(obj), "sourceTextureSha256": digest(image),
            "license": "CC0 (source MHCLO declaration)",
            "sourceID": id, "sourcePaths": sorted(files),
            "triangles": mesh["sourceFaces"], "sides": mesh["sides"],
            "bytes": len(model)}
        print("C4B source", name, "faces", mesh["sourceFaces"],
              "left/right", mesh["sides"], "GLB", digest(model), flush=True)
    (FOLDER / "c4-source-manifest.json").write_text(json.dumps(result, indent=2) + "\n")
    print("C4B 3 ACTUAL vendor MakeHuman source pairs converted; wearer fit still pending")


if __name__ == "__main__":
    main()
