"""R3: exercise an unchanged, pinned third-party BVH retarget operator.
No custom bone map, pose edits, solver, furniture modification or production output.
"""
import bpy,addon_utils,sys,pathlib,tempfile,urllib.request,hashlib,json,math,os
from mathutils import Matrix,Vector
import numpy as np
sys.path.insert(0,str(pathlib.Path("frozen-interact/tools").resolve()))
import cf_interact_balance as B
F=B.F;Q=B.Q
OUT=pathlib.Path("artifacts/cf-anim-external-r3");OUT.mkdir(parents=True,exist_ok=True)
PIN="8bbf2d44bccc5456d1ce3e3932e3e53812d71493"
key="male-grid_021-100"
def read(p,sha):
    b=pathlib.Path(p).read_bytes();assert hashlib.sha256(b).hexdigest()==sha,p
    return json.loads(b)
c=read("input-balance/pose-cache.json","bd45b8419c805e6ff5268a90e0d2d7c48e91055d25d5d9abc1d70cf786cb77bf")
base=read("input-source/candidate-poses.json","4673b0434781a36a4e90c4cee4dcb591faa22f91fe661790d0f1ebbbf03642e4")
e=read("input-01b/artifacts/cf-interact-01b/eligibility-matrix.json","38452dfb5edb2f822ed942f56d2f3786c29fb23f3fdaeba70884eaed71842840")
asset=next(f["asset"] for f in e["fixtures"] if f["name"]==c["fixture"])
assert asset["assetSha"]==c["assetSha"]
t={"names":c["boneNames"],"parents":c["parents"],"roles":c["roles"],"rest":c["neutral"],"sha256":c["rigSha"]}
r=t["roles"];p=pathlib.Path("prior-full")/(key+".glb");assert F.digest(p)==c["rigSha"]
arm,bones=F.import_rig(p);F.reset(arm,bones);rest=F.locals_(arm,bones,True)
assert [b.name for b in bones]==t["names"]
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
skin=F.WeightedSkin(t,meshes,arm,bones);B.apply_checked(arm,bones,rest,t["rest"]);assert skin.actual_error(t["rest"])["max_m"]<.002
report={"stage":"EXTERNAL_R3_STOCK_ADDON","head":os.environ["EXPECTED_SHA"],"addon":"Diffeomorphic/retarget_bvh","pin":PIN,"license":"GPL-2.0-or-later; external unchanged diagnostic executable, not vendored in game","blender":bpy.app.version_string,"rig":key,"rigSha":c["rigSha"],"assetSha":c["assetSha"],"ART":"OPEN","physicalAcceptance":"BLOCKED"}
def save():
    (OUT/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False))
save()
# Checkout is in a directory named exactly like the Python add-on package.
sys.path.insert(0,str(pathlib.Path("external-addons").resolve()))
# Register in the ephemeral Blender preferences before register() reads them.
module=addon_utils.enable("retarget_bvh",default_set=True,persistent=False)
assert module is not None, "add-on enable failed"
assert tuple(module.bl_info["version"])==(4,4,0)
prefs=bpy.context.preferences.addons.get("retarget_bvh")
assert prefs is not None and prefs.preferences is not None, "add-on preferences unavailable"
from retarget_bvh.bsettings import BD, BS
BD.prefs=prefs.preferences
assert BS() is not None
# The UI invoke() normally initializes the rig definitions; headless execute() does not.
BD.ensureInited(bpy.context.scene)
report["addonPreferencesInitialized"]=True
save()
module.setSilentMode(True)
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True);bpy.context.view_layer.objects.active=arm
scene=bpy.context.scene;scene.render.fps=24;scene.render.fps_base=1
with tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d)/"113_15.bvh"
    with urllib.request.urlopen("https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/09a07f54f3bbb58797325f009282d0b2048a2871/data/113/113_15.bvh",timeout=30) as resp:raw=resp.read(2000000)
    assert hashlib.sha256(raw).hexdigest()=="a7d1294ee85122f8c4c8e0ec4420f8804b847974940a581970ec83b69142000c"
    p.write_bytes(raw)
    op=bpy.ops.mcp.load_and_retarget
    result=op(filepath=str(p),useAutoSource=True,useAutoTarget=True,useAutoScale=True,
              useDefaultSS=False,ssFactor=5,useAllFrames=True,useBendPositive=False,
              useTimeScale=False,useSimplify=False,useCenterAnimation=False)
    report["centerAnimation"]=False # optional origin shift; constant placement below already handles it
    report["operatorResult"]=sorted(result)
    report["operatorMessage"]=str(module.getErrorMessage())
    save()
# Operator may return CANCELLED on a user-facing error; don't declare success.
if "FINISHED" not in result or not arm.animation_data or not arm.animation_data.action:
    report["status"]="STOCK_ADDON_INCOMPATIBLE";save();print(report,flush=True);sys.exit(0)
action=arm.animation_data.action
lo,hi=map(round,action.frame_range);assert hi>lo
report["action"]=action.name;report["actionFrameRange"]=[lo,hi]
# Collect native poses, ensure original mesh and bone rest transforms unchanged.
assert [b.name for b in bones]==t["names"]
assert max((a.translation-b.translation).length for a,b in zip(rest,F.locals_(arm,bones,True)))<.0002
poses=[]
for i in range(lo,hi+1):
    scene.frame_set(i);bpy.context.view_layer.update()
    poses.append(F.encode(F.locals_(arm,bones)))
assert 150<=len(poses)<=210,("unexpected 24Hz output duration",len(poses))
F.reset(arm,bones)
nw=F.world(t,t["rest"]);sem=Matrix.Rotation(math.radians(asset["frontYaw"]),3,"Y");inv=sem.inverted()
ys=[F.world(t,f)[r["hip"]].translation.y for f in poses];low=min(ys);high=max(ys);mid=ys.index(low)
# Preserve the failed qualification; collect diagnostic evidence instead of aborting before renders.
root_motion_pass=high-low>.15
report["rootHeightRangeM"]=[low,high]
report["rootTravelM"]=high-low
report["rootTravelThresholdM"]=.15
report["rootTravelPass"]=root_motion_pass
report["status"]="STOCK_ADDON_SCREEN_FAIL" if not root_motion_pass else "MEASUREMENT_PENDING"
save()
(OUT/"raw-poses.json").write_text(json.dumps({"rig":key,"poses":poses,"frameRange":[lo,hi]},allow_nan=False,separators=(",",":")))
assert high>low,("degenerate root motion",low,high)
hold=[i for i,y in enumerate(ys) if y<=low+.10*(high-low)]
# Same constant placement policy as R2. Global yaw inferred from the neutral hip axis.
up=Vector((0,1,0));v=nw[r["thigh_l"]].translation-nw[r["thigh_r"]].translation;v.y=0
front=v.normalized().cross(up).normalized();dest=sem@Vector((0,0,1))
yaw=math.atan2(dest.x,dest.z)-math.atan2(front.x,front.z);rot=Matrix.Rotation(yaw,4,"Y")
def rotate(f):
    return F.encode([rot@F.matrix(b["p"],b["r"]) if t["parents"][j]<0 else F.matrix(b["p"],b["r"]) for j,b in enumerate(f)])
poses=[rotate(f) for f in poses]
oldhold=[i for i,phase in enumerate(base["phases"]) if phase=="hold"]
ref=F.world(t,base["poses"][oldhold[len(oldhold)//2]])[r["hip"]].translation
s=F.world(t,poses[mid])[r["hip"]].translation
delta=Vector((ref.x-s.x,0,ref.z-s.z))
B.apply_checked(arm,bones,rest,poses[0]);floor=asset["floorY"];top=asset["seatY"]
delta.y=floor-min(v.y for v in F.surface(skin.reg))
for f in poses:F.move_root(t,f,r["hip"],delta)
regs={"pelvis":F.regions(meshes,t)}
for side in ("l","r"):
    regs[side]=F.regions(meshes,t,side);regs["thigh_"+side]=B.region(meshes,t["names"][r["thigh_"+side]])
rows=[]
for i,f in enumerate(poses):
    B.apply_checked(arm,bones,rest,f);w=F.world(t,f)
    replay=skin.actual_error(f);assert replay["max_m"]<.002
    cloud=np.array([list(v) for v in F.surface(skin.reg)])
    local=np.array([list(inv@Vector(v)) for v in cloud])
    deep=int(Q.interior_mask(local,asset["regions"],top-.1,top).sum())
    gap,fraction=B.support(t,w,regs,cloud,asset,top,inv)
    soles={side:F.sole(regs[side])-floor for side in ("l","r")}
    step=B.maxstep(poses[i-1],f) if i else 0
    fm=float(cloud[:,1].min())-floor;fail=[]
    if deep:fail.append("SLAT_INTERIOR")
    if fm<-.005:fail.append("FLOOR_PENETRATION")
    if step>.35:fail.append("JOINT_STEP")
    if i in hold:
        if gap is None or gap<-.005 or gap>.025:fail.append("HOLD_SUPPORT")
        if fraction<.5:fail.append("HOLD_SUPPORT_FRACTION")
        if any(abs(v)>.02 for v in soles.values()):fail.append("HOLD_SOLE")
    rows.append({"frame":i+lo,"phase":"hold" if i in hold else "lower" if i<mid else "rise","floorMinM":fm,"slatInteriorVertices":deep,"supportGapM":gap,"supportSampleFraction":fraction,"soleGapsM":soles,"skinReplay":replay,"maxJointStepRad":step,"failures":fail})
from collections import Counter
report.update({"status":"STOCK_ADDON_SCREEN_PASS" if root_motion_pass and all(not x["failures"] for x in rows) else "STOCK_ADDON_SCREEN_FAIL","evaluatedFrames":len(rows),"holdFrames":len(hold),"placement":list(delta),"failures":dict(Counter(x for row in rows for x in row["failures"])),"globalFailures":[] if root_motion_pass else ["ROOT_TRAVEL"],"samples":rows,"rendered":[]});save()
B.apply_checked(arm,bones,rest,t["rest"]);h,_=F.setup(meshes)
fixture=pathlib.Path("input-01a")/(c["fixture"]+".glb");assert F.digest(fixture)==c["assetSha"]
bpy.ops.import_scene.gltf(filepath=str(fixture.resolve()))
cam=bpy.context.scene.camera;slot=next(s for s in asset["slots"] if s["id"]==c["slot"])
target=F.Y.inverted()@(sem@Vector((slot["anchorX"],floor+h*.48,slot["anchorZ"])))
indices=sorted(set([0,len(poses)-1,mid,*[round((len(poses)-1)*j/6) for j in range(7)]]))
for view,offset in (("quarter",Vector((1.7,.9,3.0))),("side",Vector((3.,.7,0.)))):
    cam.location=target+F.Y.inverted()@(sem@offset)*h;cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.65
    for j in indices:
        B.apply_checked(arm,bones,rest,poses[j]);name=f"{view}-{j:03}.png"
        bpy.context.scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True);report["rendered"].append(name)
save()
(OUT/"poses.json").write_text(json.dumps({"rig":key,"poses":poses},allow_nan=False,separators=(",",":")))
print(report["status"],report["failures"],flush=True)
