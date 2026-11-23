#!/usr/bin/env python3
"""CAS-02.1-F2-C4: audit actual female shoe source bytes, never web preview guesses.

Audits approved MakeHuman CC0 ZIP and Grab3D high-heels GLB without importing
anything into the public game. Report is an ephemeral Actions artifact until
all source identities, last geometry and owner-facing visuals are verified.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import struct
import sys
import urllib.request
import zipfile

CANDIDATES = (
    "toigo_ballet_flats",
    "toigo_mj_cloth_shoes",
    "toigo_ankle_boots_female",
)
MIRRORS = (
    "https://files2.makehumancommunity.org/asset_packs/shoes01/shoes01_cc0.zip",
    "https://files.makehumancommunity.org/asset_packs/shoes01/shoes01_cc0.zip",
)
HEELS = "https://grab3d.com/dl/high-heels/"
REPORT = Path("artifacts/cas-02-1-f2-c4/source-audit.json")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "LifeSim-CAS-C4-audit/1"})
    with urllib.request.urlopen(req, timeout=110) as response:
        data = response.read()
    if not data:
        raise ValueError("Empty source download: " + url)
    return data


def geometry(raw):
    vertices, faces = [], 0
    for line in raw.decode("utf-8", errors="replace").splitlines():
        if line.startswith("v "):
            try:
                vertices.append([float(x) for x in line.split()[1:4]])
            except ValueError:
                continue
        if line.startswith("f "):
            faces += max(0, len(line.split()) - 3)
    bounds = [[min(v[i] for v in vertices), max(v[i] for v in vertices)]
              for i in range(3)] if vertices else []
    return {"vertices": len(vertices), "triangles": faces, "bounds": bounds}


def inspect_makehuman(raw):
    archive = zipfile.ZipFile(io.BytesIO(raw))
    result = {}
    for asset in CANDIDATES:
        entries = [n for n in archive.namelist() if asset in n.lower()
                   and not n.endswith("/")]
        files = []
        cc0 = False
        mesh = None
        head = ""
        for name in entries:
            contents = archive.read(name)
            files.append({"path": name, "sha256": sha256(contents),
                          "bytes": len(contents)})
            suffix = Path(name).suffix.lower()
            if suffix == ".mhclo":
                head = contents.decode("utf-8", errors="replace")[:4000]
                cc0 |= bool(re.search(r"(?im)^\s*#?\s*license\s*[:= ]\s*CC0\b", head))
            if suffix == ".obj":
                mesh = geometry(contents)
        result[asset] = {"files": sorted(files, key=lambda v: v["path"]),
                         "licenseCC0": cc0, "mhcloHeader": head[:1200], "geometry": mesh,
                         "mhcloFound": any(x["path"].lower().endswith(".mhclo") for x in files),
                         "objFound": any(x["path"].lower().endswith(".obj") for x in files)}
    return result


def inspect_glb(raw):
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise ValueError("High heel asset not glTF binary")
    _, version, length, json_len, json_type = struct.unpack_from("<4sIIII", raw)
    if version != 2 or length != len(raw) or json_type != 0x4E4F534A:
        raise ValueError("Invalid GLB version, length or JSON chunk")
    gltf = json.loads(raw[20:20 + json_len])
    triangles = 0
    for mesh in gltf.get("meshes", []):
        for part in mesh.get("primitives", []):
            if part.get("mode", 4) != 4:
                raise ValueError("Unexpected non-triangle high-heel primitive")
            accessor = part.get("indices", part["attributes"]["POSITION"])
            triangles += gltf["accessors"][accessor]["count"] // 3
    return {"triangles": triangles, "meshes": len(gltf.get("meshes", [])),
            "skins": len(gltf.get("skins", [])),
            "animations": len(gltf.get("animations", [])),
            "materials": len(gltf.get("materials", []))}


def run():
    errors = []
    source_url = None
    source = None
    for url in MIRRORS:
        try:
            source = download(url)
            source_url = url
            break
        except Exception as exc:
            errors.append(str(exc))
    if source is None:
        raise RuntimeError("All pinned MakeHuman CC0 mirrors failed: " + " / ".join(errors))
    candidates = inspect_makehuman(source)
    model, license_bytes, manifest_bytes = (download(HEELS + item) for item in
                                             ("high-heels.glb", "LICENSE.txt", "manifest.json"))
    heel_manifest = json.loads(manifest_bytes)
    report = {
        "version": 1, "stage": "CAS-02.1-F2-C4-source-audit",
        "makehuman": {"url": source_url, "archiveSha256": sha256(source),
                      "archiveBytes": len(source), "candidates": candidates},
        "heels": {"url": HEELS + "high-heels.glb", "sha256": sha256(model),
                  "bytes": len(model), "licenseSha256": sha256(license_bytes),
                  "manifestSha256": sha256(manifest_bytes),
                  "licenseCC0": bool(re.search(rb"CC0|Creative Commons Zero", license_bytes, re.I)),
                  "declaredLicense": heel_manifest.get("license"),
                  "origin": heel_manifest.get("origin"), "glb": inspect_glb(model)},
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    # Print concise geometry/hash report, not 79 MB files or private data.
    for key, item in candidates.items():
        print(key, "license:", item["licenseCC0"], "geometry:", item["geometry"],
              "files:", [(x["path"], x["sha256"][:12]) for x in item["files"]])
    print("MakeHuman archive", report["makehuman"]["archiveSha256"], len(source))
    print("High heels", report["heels"]["sha256"], report["heels"]["glb"],
          "licenseCC0", report["heels"]["licenseCC0"])
    bad = [key for key, item in candidates.items()
           if not item["licenseCC0"] or not item["objFound"]
           or not item["mhcloFound"] or not item["geometry"]
           or item["geometry"]["triangles"] < 20]
    if bad:
        raise RuntimeError("CAS-C4 source quarantined: " + ", ".join(bad))
    if not report["heels"]["licenseCC0"] or report["heels"]["glb"]["triangles"] != 13432:
        raise RuntimeError("CAS-C4 heel source quarantined: publisher contract mismatch")
    if report["heels"]["glb"]["skins"] or report["heels"]["glb"]["animations"]:
        raise RuntimeError("CAS-C4 heel source changed unexpectedly")
    print("CAS-C4 four approved source candidates: SOURCE AUDIT PASS (not wearable certification)")


if __name__ == "__main__":
    run()
