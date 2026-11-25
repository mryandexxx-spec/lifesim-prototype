"""Pinned, read-only open animation source intake. No source scripts executed."""
import hashlib, json, math, pathlib, re, struct, tempfile, urllib.request, zipfile
OUT = pathlib.Path("cf-anim-source-report")
OUT.mkdir(exist_ok=True)
MIRROR = "MightyBubble/Ludots-Assets/fab331eff1cb9c552c60399ea10186ef675cd460"
HOLD = "rai-opensource/hold/f80b04d384d4ec8922c88deada878c88597a3cf9"
PINS = [
 ("ual1", MIRROR, "animations/Quaternius-Universal-Animation-Library-Standard.zip", 15904933, "cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724", "CC0-1.0"),
 ("ual2", MIRROR, "animations/Quaternius-Universal-Animation-Library-2-Standard.zip", 18735003, "4008ea208a604773a2b2177d965f0f5d3195498b5bf838c3f5785d68e95f2a68", "CC0-1.0"),
 ("hold_walk", HOLD, "data/bvh/100_percent_scale/Walk_Random_Speed_Transitions_Take_001.bvh", 11560647, "4265003b8f48e10b7394ad5b01b4184db565a50f539bc3bcdc5218d0ffd3279d", "CC-BY-4.0"),
 ("hold_reach", HOLD, "data/bvh/100_percent_scale/natural_reach_1st_depth_right_side_07.bvh", 10659057, "0bd0225c9de2945d291f8d45e04811149672db1de8965e0f9e29994154e21577", "CC-BY-4.0"),
]
def download(repo, path, size, sha):
    url = "https://media.githubusercontent.com/media/" + repo + "/" + path
    with urllib.request.urlopen(url, timeout=60) as r:
        data = r.read(size + 1)
    if len(data) != size or hashlib.sha256(data).hexdigest() != sha:
        raise ValueError("byte length or SHA-256 mismatch")
    return data
def glb(data):
    if len(data) < 20 or struct.unpack_from("<4sII", data) != (b"glTF", 2, len(data)):
        raise ValueError("bad GLB header")
    n, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON" or n > len(data)-20:
        raise ValueError("bad JSON chunk")
    g = json.loads(data[20:20+n])
    nodes, accessors = g.get("nodes", []), g.get("accessors", [])
    clips=[]
    for a in g.get("animations", []):
        times=[accessors[s["input"]] for s in a["samplers"]]
        if not times or any(not t.get("max") or not t.get("min") or t["count"]<1 for t in times):
            raise ValueError("invalid sampler timeline")
        duration=max(t["max"][0] for t in times)-min(t["min"][0] for t in times)
        if not math.isfinite(duration) or duration<=0:
            raise ValueError("bad duration")
        clips.append({"name":a.get("name"),"duration_s":duration,"channels":len(a["channels"]),
          "translation_targets":sorted({nodes[c["target"]["node"]].get("name","") for c in a["channels"] if c["target"]["path"]=="translation"})})
    return {"nodes":len(nodes),"skins":[len(s["joints"]) for s in g.get("skins",[])],"clips":clips}
def zip_inventory(data):
    import io
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        info=z.infolist()
        if len(info)>2000 or sum(i.file_size for i in info)>350_000_000:
            raise ValueError("archive exceeds intake limits")
        for i in info:
            p=pathlib.PurePosixPath(i.filename.replace("\\","/"))
            if p.is_absolute() or ".." in p.parts or re.match(r"^[A-Za-z]:",str(p)):
                raise ValueError("unsafe zip member")
        licenses=[{"path":i.filename,"text":z.read(i).decode("utf-8",errors="replace")} for i in info if "license" in i.filename.lower() and i.file_size<65536 and not i.is_dir()]
        models=[{"path":i.filename,**glb(z.read(i))} for i in info if i.filename.lower().endswith(".glb")]
        if not models or not any(x["clips"] for x in models):
            raise ValueError("no animated GLB")
        if not any(re.search(r"CC0|Creative Commons Zero",x["text"],re.I) for x in licenses):
            raise ValueError("missing embedded CC0 notice")
        return {"members":len(info),"licenses":licenses,"glbs":models}
def bvh(data):
    s=data.decode("utf-8")
    hierarchy, motion=s.split("MOTION",1)
    frames=int(re.search(r"Frames:\s*(\d+)",motion).group(1))
    dt=float(re.search(r"Frame Time:\s*([\d.eE+-]+)",motion).group(1))
    channels=sum(int(v) for v in re.findall(r"CHANNELS\s+(\d+)",hierarchy))
    rows=motion.splitlines()
    values=[line.split() for line in rows if line.strip() and ":" not in line]
    if frames!=len(values) or frames<2 or channels<6 or not math.isfinite(dt) or dt<=0:
        raise ValueError("invalid BVH motion")
    if any(len(row)!=channels or not all(math.isfinite(float(v)) for v in row) for row in values):
        raise ValueError("invalid BVH frame")
    return {"frames":frames,"frame_time":dt,"duration_s":(frames-1)*dt,"channels":channels,"joints":re.findall(r"(?:ROOT|JOINT)\s+(\S+)",hierarchy)}
def main():
    results=[]
    for key,repo,path,size,sha,license in PINS:
        entry={"id":key,"repository_pin":repo,"path":path,"bytes":size,"sha256":sha,"license":license}
        try:
            data=download(repo,path,size,sha)
            entry.update(verified=True,inventory=zip_inventory(data) if path.endswith(".zip") else bvh(data))
        except Exception as e:
            entry.update(verified=False,error=str(e))
        results.append(entry)
        print(key, "PASS" if entry["verified"] else entry["error"], flush=True)
    (OUT/"inventory.json").write_text(json.dumps({"sources":results,"art_status":"OPEN","retarget_status":"OPEN"},indent=2),encoding="utf-8")
    (OUT/"ATTRIBUTION.md").write_text("Quaternius UAL1/2, CC0 1.0: https://quaternius.itch.io/universal-animation-library and https://quaternius.com/packs/universalanimationlibrary2.html\n\nHOLD, RAI Institute and Boston Dynamics, CC BY 4.0: https://github.com/rai-opensource/hold ; https://creativecommons.org/licenses/by/4.0/ . Inventory only; source motion unmodified, no redistribution of binaries in this report.\n",encoding="utf-8")
    if not all(x["verified"] for x in results):
        raise SystemExit(1)
if __name__=="__main__":
    main()
