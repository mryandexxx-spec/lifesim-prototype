"""Actual browser and pixel acceptance; preserve raw evidence even on failed gates."""
import json, math, pathlib, sys, traceback
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright
P=pathlib.Path;engine=sys.argv[1];B=P("runtime-lab");m=json.loads((B/"manifest.json").read_text())
O=B/"evidence"/engine;O.mkdir(parents=True,exist_ok=True)
report={"engine":engine,"cases":[],"errors":[],"failures":[]}
def save(): (O/"report.json").write_text(json.dumps(report,indent=2))
def gate(ok,reason):
 if not ok: report["failures"].append(reason)
with sync_playwright() as p:
 opts={"headless":False}
 if engine=="chromium":opts.update(args=["--enable-unsafe-swiftshader","--use-angle=swiftshader","--no-sandbox"])
 browser=getattr(p,engine).launch(**opts)
 for w,h in [(390,844),(844,390)]:
  tag=f"{w}x{h}";ctx=browser.new_context(viewport={"width":w,"height":h},device_scale_factor=1,has_touch=True,is_mobile=True,record_video_dir=str(O/tag),record_video_size={"width":w,"height":h})
  page=ctx.new_page();page.on("pageerror",lambda e:report["errors"].append(str(e)))
  case={"viewport":[w,h],"keys":[],"views":[],"scenarios":[]};report["cases"].append(case)
  try:
   page.goto("http://127.0.0.1:8765/lab.html",wait_until="load");page.wait_for_function("window.lab?.ready===true",timeout=60000)
   def raf():page.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
   for ref in m["ref"][:-1]:
    t=ref["time"];page.evaluate("t=>lab.seek(t)",t);raf();a=page.evaluate("()=>lab.probe()")
    pe=max(math.dist(a["positions"][n],v) for n,v in ref["positions"].items());nav=math.dist(a["wrapper"],[v*t for v in m["speed"]])
    case["keys"].append({"t":t,"poseErrorM":pe,"navErrorM":nav,"glError":a["glError"]})
   gate(max(x["poseErrorM"] for x in case["keys"])<.002,tag+":pose")
   gate(max(x["navErrorM"] for x in case["keys"])<.0002,tag+":navigation")
   gate(not any(x["glError"] for x in case["keys"]),tag+":keyGL")
   # Actual character contribution, not color diversity of the floor.
   for view in ["side","quarter","front"]:
    page.evaluate("v=>lab.view(v)",view);page.evaluate("()=>lab.seek(.3)");raf()
    path=O/f"{tag}-{view}.png";page.locator("canvas").screenshot(path=str(path))
    page.evaluate("()=>lab.visible(false)");raf();bg=O/f"{tag}-{view}-hidden.png";page.locator("canvas").screenshot(path=str(bg))
    page.evaluate("()=>lab.visible(true)");raf()
    a=Image.open(path).convert("RGB");b=Image.open(bg).convert("RGB");d=ImageChops.difference(a,b)
    count=sum(max(px)>12 for px in d.getdata());case["views"].append({"view":view,"visiblePixels":count})
    gate(count>w*h*.002,tag+":"+view+":actor-visible")
   for view in ["side","quarter"]:
    page.evaluate("v=>lab.view(v)",view);page.evaluate("()=>lab.start()")
    page.wait_for_function("lab.result().rows.length>0 && !lab.result().running",timeout=60000);raf()
    r=page.evaluate("()=>lab.result()");rows=r["rows"];case["scenarios"].append({"view":view,**r})
    gate(r["engine"]=="2.24.1" and r["meshCount"]==2,tag+":binding")
    gate([e["event"] for e in r["events"]]==["start","stop"],tag+":events")
    gate(all(any(x["stage"]==s for x in rows) for s in ["idle","start","walk","stop","settled"]),tag+":stages")
    gate(any(x["transitioning"] and x["stage"]=="start" for x in rows) and any(x["transitioning"] and x["stage"]=="stop" for x in rows),tag+":actualCrossfade")
    gate(rows[-1]["state"]=="Idle" and not rows[-1]["transitioning"],tag+":settled")
    gate(not any(x["glLost"] or x["glError"] for x in rows),tag+":GL")
    gate(max(math.dist(x["wrapper"],[v*x["travelTime"] for v in m["speed"]]) for x in rows)<.0002,tag+":travel")
    # Actual loaded weighted skin, with the original active body morph retained.
    for stage in ["start","stop","walk","settled"]:
     sampled=[x["floorGapM"] for x in rows if x["stage"]==stage and x["floorGapM"] is not None]
     gate(bool(sampled),tag+":"+stage+":skinCoverage")
     if sampled:gate(min(sampled)>=-.005,tag+":"+stage+":floor")
    case["scenarios"][-1]["sampledFloorMinM"]=min(x["floorGapM"] for x in rows if x["floorGapM"] is not None)
    case["scenarios"][-1]["wallSeconds"]=(rows[-1]["wallMs"]-rows[0]["wallMs"])/1000
    # Report world joint speeds at each transition; not a new solver or anatomical gate.
    jumps=[]
    for a,b in zip(rows,rows[1:]):
     dt=b["elapsed"]-a["elapsed"]
     if dt>0:
      jumps.append({"t":b["elapsed"],"stage":b["stage"],"maxJointSpeedMps":max(math.dist([a["positions"][n][i]+a["wrapper"][i] for i in range(3)],[b["positions"][n][i]+b["wrapper"][i] for i in range(3)])/dt for n in a["positions"])})
    case["scenarios"][-1]["jointSpeeds"]=jumps
    page.screenshot(path=str(O/f"{tag}-{view}-settled.png"))
  except Exception as e:
   report["failures"].append(tag+":"+repr(e));traceback.print_exc()
  finally:
   ctx.close();save()
 browser.close()
gate(not report["errors"],"pageErrors")
save();print("BROWSER",engine,report["failures"],flush=True)
assert not report["failures"],report["failures"]
