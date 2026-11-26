"""Stock BVH import/replay, no LifeSim solver or rig edits.
Run: blender -b --factory-startup --python-exit-code 1 --python tools/cf_anim_external_stock.py
"""
import bpy
import addon_utils
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import urllib.request

PIN = "09a07f54f3bbb58797325f009282d0b2048a2871"
CLIPS = [
    ("113_15", "2779dc4bfd247e3a8a002da9823f71d7f9ee035c", 954, 120),
    ("143_18", "4108245ba1721b5c9b5e62c369a5967e74112c34", 753, 120),
]
OUT = Path("artifacts/cf-anim-external-stock")
OUT.mkdir(parents=True, exist_ok=True)
report = {"scope": "stock native BVH replay only; no target mesh, furniture or ART acceptance",
          "head": os.environ.get("EXPECTED_SHA", "local"),
          "blender": bpy.app.version_string, "source_commit": PIN, "clips": []}
credit = "CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), NSF EIA-0196217; BVH conversion Bruce Hahne; mirror una-dinosauria/cmu-mocap. Diagnostic visualization only."

def acquire(clip, expected, dest):
    url = f"https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/{PIN}/data/{clip[:3]}/{clip}.bvh"
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = resp.read(2_000_000)
    digest = hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()
    if digest != expected:
        raise RuntimeError(f"source blob mismatch: {clip} {digest}")
    dest.write_bytes(data)
    return hashlib.sha256(data).hexdigest()

def point(obj, bone, end):
    return [float(v) for v in obj.matrix_world @ getattr(bone, end)]

def replay(clip, expected, count, fps, dest):
    sha256 = acquire(clip, expected, dest)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("io_anim_bvh", default_set=False, persistent=False)
    result = bpy.ops.import_anim.bvh(filepath=str(dest), target="ARMATURE",
        global_scale=1.0, frame_start=1, use_fps_scale=False,
        update_scene_fps=True, rotate_mode="NATIVE", axis_forward="-Z", axis_up="Y")
    if "FINISHED" not in result:
        raise RuntimeError(f"BVH import failed: {result}")
    rigs = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    if len(rigs) != 1:
        raise RuntimeError("expected one imported armature")
    rig = rigs[0]
    action = rig.animation_data.action
    if not action:
        raise RuntimeError("missing animation")
    scene = bpy.context.scene
    actual_fps = scene.render.fps / scene.render.fps_base
    if abs(actual_fps-fps) > 0.1:
        raise RuntimeError(f"unexpected fps {actual_fps}")
    first,last = [round(v) for v in action.frame_range]
    if last-first+1 != count:
        raise RuntimeError(f"unexpected native frame span {first}..{last}, expected {count}")
    names = [b.name for b in rig.pose.bones]
    required = {"Hips","LeftUpLeg","RightUpLeg","LeftLeg","RightLeg","LeftFoot","RightFoot","Spine","Head"}
    if not required.issubset(names):
        raise RuntimeError("missing required joint names")
    heights, samples = [], []
    for frame in range(first,last+1):
        scene.frame_set(frame)
        obj = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
        bones = obj.pose.bones
        segments = [[point(obj,b,"head"),point(obj,b,"tail")] for b in bones]
        if not all(math.isfinite(v) for seg in segments for p in seg for v in p):
            raise RuntimeError(f"nonfinite pose {frame}")
        heights.append(point(obj,bones["Hips"],"head")[2])
        if (frame-first)%5==0 or frame==last:
            samples.append(segments)
    span = max(heights)-min(heights)
    drop = min(heights[0],heights[-1])-min(heights)
    if span<=0 or drop < 0.5*span:
        raise RuntimeError("root does not descend and return; investigate source/axis")
    return {"clip":clip,"blob":expected,"sha256":sha256,"native_frames":count,
            "fps":actual_fps,"duration_sec":(last-first)/actual_fps,
            "bone_count":len(names),"bone_names":names,
            "root_height_raw_units":{"start":heights[0],"min":min(heights),
                                      "end":heights[-1],"max":max(heights)},
            "min_height_frame":first+heights.index(min(heights)),
            "preview_frames":len(samples),"status":"STOCK_REPLAY_PASS"},samples

def svg_preview(clip,samples):
    # Fixed camera, common scale for both orthographic views; raw source units.
    pts=[p for frame in samples for seg in frame for p in seg]
    lows=[min(p[i] for p in pts) for i in range(3)]
    highs=[max(p[i] for p in pts) for i in range(3)]
    scale=210/max(highs[i]-lows[i] for i in range(3))
    def frame_svg(frame,x,y,axis):
        def project(p):
            return (x+125+(p[axis]-(lows[axis]+highs[axis])/2)*scale,
                    y+245-(p[2]-lows[2])*scale)
        lines=[]
        for a,b in frame:
            ax,ay=project(a);bx,by=project(b)
            lines.append(f'<line x1="{ax:.2f}" y1="{ay:.2f}" x2="{bx:.2f}" y2="{by:.2f}" stroke="#263b50" stroke-width="2.8" stroke-linecap="round"/>')
        return "".join(lines)
    indices=[round((len(samples)-1)*i/6) for i in range(7)]
    svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1750" height="570" viewBox="0 0 1750 570">',
         '<rect width="100%" height="100%" fill="#f3f5f7"/>',
         f'<text x="15" y="24" font-size="18">CMU {clip} | stock Blender skeleton | fixed views X/Z, Y/Z</text>']
    for i,k in enumerate(indices):
        for j,axis in enumerate((0,1)):
            svg.append(frame_svg(samples[k],250*i,25+260*j,axis))
        svg.append(f'<text x="{250*i+15}" y="553" font-size="14">sample {k}</text>')
    svg.append('</svg>')
    (OUT/f"{clip}-contact.svg").write_text("".join(svg),encoding="utf-8")
    # Self-contained playback, no network or external script. Not a game asset.
    frames=[frame_svg(f,0,0,0)+frame_svg(f,250,0,1) for f in samples]
    html="""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CMU stock playback</title><style>body{font:16px system-ui;margin:16px;background:#f3f5f7;color:#263b50}svg{width:100%;max-width:640px;background:white}button,input{font:inherit}</style>
<h2>CMU """+clip+""" — stock Blender replay</h2><p>Two fixed orthographic views; original timing, approximately 24 fps display. No target mesh or furniture.</p>
<svg viewBox="0 0 500 260" id="view"></svg><p><button id="toggle">Pause / play</button> <input type="range" min="0" id="scrub" value="0"> <span id="label"></span></p><p>"""+credit+"""</p>
<script>const frames="""+json.dumps(frames)+""";let start=performance.now(),playing=true,index=0;const view=document.getElementById('view'),scrub=document.getElementById('scrub'),label=document.getElementById('label');scrub.max=frames.length-1;function draw(){view.innerHTML=frames[index];scrub.value=index;label.textContent=(index/24).toFixed(2)+' s';}function loop(t){if(playing){index=Math.floor((t-start)*24/1000)%frames.length;draw()}requestAnimationFrame(loop)}document.getElementById('toggle').onclick=()=>{playing=!playing;if(playing)start=performance.now()-index*1000/24};scrub.oninput=()=>{playing=false;index=Number(scrub.value);draw()};draw();requestAnimationFrame(loop);</script>"""
    (OUT/f"{clip}-playback.html").write_text(html,encoding="utf-8")

with tempfile.TemporaryDirectory() as temp:
    for clip,sha,count,fps in CLIPS:
        item,frames=replay(clip,sha,count,fps,Path(temp)/f"{clip}.bvh")
        svg_preview(clip,frames)
        report["clips"].append(item)
        (OUT/"report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
print(json.dumps(report,indent=2))
