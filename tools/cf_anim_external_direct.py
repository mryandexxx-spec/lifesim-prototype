"""R2 direct source retarget; one constant placement, no contact solver."""
import sys,pathlib,json,math,hashlib,subprocess
import bpy,numpy as np
from mathutils import Vector,Matrix,Quaternion
sys.path.insert(0,str(pathlib.Path("frozen-interact/tools").resolve()))
import cf_interact_balance as B
F=B.F;Q=B.Q
OUT=pathlib.Path("artifacts/cf-anim-external-r2");OUT.mkdir(parents=True,exist_ok=True)
key="male-grid_021-100"
def read(p,sha):
    b=pathlib.Path(p).read_bytes();assert hashlib.sha256(b).hexdigest()==sha,p
    return json.loads(b)
c=read("input-balance/pose-cache.json","bd45b8419c805e6ff5268a90e0d2d7c48e91055d25d5d9abc1d70cf786cb77bf")
base=read("input-source/candidate-poses.json","4673b0434781a36a4e90c4cee4dcb591faa22f91fe661790d0f1ebbbf03642e4")
old=read("input-source/report.json","31b7a751be1eb7d93cf0620b8c63da502aa320e714a10b34f7995454d3f49838")
e=read("input-01b/artifacts/cf-interact-01b/eligibility-matrix.json","38452dfb5edb2f822ed942f56d2f3786c29fb23f3fdaeba70884eaed71842840")
asset=next(f["asset"] for f in e["fixtures"] if f["name"]==c["fixture"])
assert c["rig"]==base["rig"]==old["rig"]==key and c["assetSha"]==asset["assetSha"]==old["assetSha"]
t={"names":c["boneNames"],"parents":c["parents"],"roles":c["roles"],"rest":c["neutral"],"sha256":c["rigSha"]}
r=t["roles"];p=pathlib.Path("prior-full")/(key+".glb");assert F.digest(p)==c["rigSha"]
arm,bones=F.import_rig(p);F.reset(arm,bones);rest=F.locals_(arm,bones,True)
assert [b.name for b in bones]==t["names"]
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
skin=F.WeightedSkin(t,meshes,arm,bones);B.apply_checked(arm,bones,rest,t["rest"]);assert skin.actual_error(t["rest"])["max_m"]<.002
nw=F.world(t,t["rest"]);up=Vector((0,1,0));sem=Matrix.Rotation(math.radians(asset["frontYaw"]),3,"Y");inv=sem.inverted()
src=json.loads(pathlib.Path("external-input/cmu-113_15.json").read_text())
assert src["sourceSha256"]=="a7d1294ee85122f8c4c8e0ec4420f8804b847974940a581970ec83b69142000c" and len(src["frames"])==191
S=src["rest"];frames=src["frames"]
def pos(s,n):return Vector(s[n]["p"])
def quat(s,n):return Quaternion(s[n]["q"]).normalized()
def front(a,b):
    v=a-b;v.y=0;return v.normalized().cross(up).normalized()
def yaw(v):return math.atan2(v.x,v.z)
sf=front(pos(S,"LeftUpLeg"),pos(S,"RightUpLeg"))
tf=front(nw[r["thigh_l"]].translation,nw[r["thigh_r"]].translation)
dest=sem@Vector((0,0,1))
sq=Matrix.Rotation(yaw(dest)-yaw(sf),3,"Y").to_quaternion()
tq=Matrix.Rotation(yaw(dest)-yaw(tf),3,"Y").to_quaternion()
def source_length(side):return sum((pos(S,a)-pos(S,b)).length for a,b in [(side+"UpLeg",side+"Leg"),(side+"Leg",side+"Foot")])
def target_length(side):return sum((nw[r[a+"_"+side]].translation-nw[r[b+"_"+side]].translation).length for a,b in [("thigh","shin"),("shin","foot")])
scale=(target_length("l")+target_length("r"))/(source_length("Left")+source_length("Right"))
# Explicit segment-axis alignment in bind pose; source rotation carries twist.
# Root and trunk use anatomical hip/shoulder/head directions; no per-frame fitting.
mapped={}
def bind(role,sname,sd,td):
    i=r[role];a=(tq@td).normalized();b=(sq@sd).normalized()
    mapped[i]=(sname,quat(S,sname).inverted(),a.rotation_difference(b)@tq@nw[i].to_quaternion())
def sb(a,b):return pos(S,b)-pos(S,a)
def tb(a,b):return nw[r[b]].translation-nw[r[a]].translation
bind("hip","Hips",sb("Hips","Spine"),tb("hip","spine_43"))
bind("spine_43","Spine",sb("Spine","Spine1"),tb("spine_43","spine_45"))
bind("spine_45","Spine1",sb("Spine1","Neck"),tb("spine_45","neck"))
bind("neck","Neck",sb("Neck","Head"),tb("neck","head"))
# Head carries source global rotation relative to rest.
mapped[r["head"]]=("Head",quat(S,"Head").inverted(),tq@nw[r["head"]].to_quaternion())
for side,prefix in (("l","Left"),("r","Right")):
    for role,child,sn,sc in [("thigh","shin","UpLeg","Leg"),("shin","foot","Leg","Foot"),("shoulder","upperarm","Shoulder","Arm"),("upperarm","forearm","Arm","ForeArm"),("forearm","hand","ForeArm","Hand")]:
        bind(role+"_"+side,prefix+sn,sb(prefix+sn,prefix+sc),tb(role+"_"+side,child+"_"+side))
    for role,sn in [("foot","Foot"),("hand","Hand")]:
        i=r[role+"_"+side]
        # Align the terminal segment's forward anatomical axis when available.
        if role=="foot":
            toe=next((j for j,n in enumerate(t["names"]) if t["parents"][j]==i and "toe" in n.lower()),None)
            if toe is not None:
                bind(role+"_"+side,prefix+sn,sb(prefix+sn,prefix+"ToeBase"),nw[toe].translation-nw[i].translation);continue
        mapped[i]=(prefix+sn,quat(S,prefix+sn).inverted(),tq@nw[i].to_quaternion())
ys=[f["bones"]["Hips"]["p"][1] for f in frames];low=min(ys);high=max(ys);mid=ys.index(low)
def relaxed(i):
    s=frames[i]["bones"]
    return ys[i]>=low+.80*(high-low) and all(sb0.angle(-up)<math.radians(50) for sb0 in (pos(s,"LeftForeArm")-pos(s,"LeftArm"),pos(s,"RightForeArm")-pos(s,"RightArm")))
starts=[i for i in range(mid) if relaxed(i)];ends=[i for i in range(mid+1,len(frames)) if relaxed(i)]
assert starts and ends,("no relaxed standing bounds",mid)
start,end=starts[0],ends[-1];assert start<mid<end
hold=[i for i in range(start,end+1) if ys[i]<=low+.10*(high-low)]
assert hold
# Use exact old seated root XZ as fixed placement, not a phase-varying correction.
oldhold=[i for i,phase in enumerate(base["phases"]) if phase=="hold"]
assert oldhold
refw=F.world(t,base["poses"][oldhold[len(oldhold)//2]])
ref=refw[r["hip"]].translation
origin=pos(frames[start]["bones"],"Hips")
seated=sq@(pos(frames[mid]["bones"],"Hips")-origin)*scale
root0=Vector((ref.x-seated.x,nw[r["hip"]].translation.y,ref.z-seated.z))
def pose(i,root):
    s=frames[i]["bones"];f=F.clone(t["rest"]);world=[]
    for j,b in enumerate(f):
        local=F.matrix(b["p"],b["r"]);par=t["parents"][j]
        parent=world[par] if par>=0 else Matrix.Identity(4)
        w=parent@local
        if j in mapped:
            name,qinv,baseq=mapped[j]
            delta=sq@quat(s,name)@qinv@sq.inverted()
            want=(delta@baseq).normalized()
            w=Matrix.Translation(w.translation)@want.to_matrix().to_4x4()
        if j==r["hip"]:
            w.translation=root+sq@(pos(s,"Hips")-origin)*scale
        local=parent.inverted()@w
        b.update(F.encode([local])[0]);world.append(w)
    return f
B.apply_checked(arm,bones,rest,pose(start,root0))
floor=asset["floorY"];top=asset["seatY"];root0.y+=floor-min(v.y for v in F.surface(skin.reg))
regs={"pelvis":F.regions(meshes,t)}
for side in ("l","r"):
    regs[side]=F.regions(meshes,t,side);regs["thigh_"+side]=B.region(meshes,t["names"][r["thigh_"+side]])
rows=[];poses=[]
for i in range(start,end+1):
    f=pose(i,root0);B.apply_checked(arm,bones,rest,f);w=F.world(t,f)
    replay=skin.actual_error(f);assert replay["max_m"]<.002
    cloud=np.array([list(v) for v in F.surface(skin.reg)])
    local=np.array([list(inv@Vector(v)) for v in cloud])
    deep=int(Q.interior_mask(local,asset["regions"],top-.1,top).sum())
    gap,fraction=B.support(t,w,regs,cloud,asset,top,inv)
    soles={side:F.sole(regs[side])-floor for side in ("l","r")}
    balance=B.balance_metrics(t,w,nw,regs,asset,top,floor,inv)
    step=B.maxstep(poses[-1],f) if poses else 0
    failures=[]
    if deep:failures.append("SLAT_INTERIOR")
    if float(cloud[:,1].min())-floor<-.005:failures.append("FLOOR_PENETRATION")
    if step>.35:failures.append("JOINT_STEP")
    if i in hold:
        if gap is None or gap<-.005 or gap>.025:failures.append("HOLD_SUPPORT")
        if fraction<.5:failures.append("HOLD_SUPPORT_FRACTION")
        if any(abs(v)>.02 for v in soles.values()):failures.append("HOLD_SOLE")
    rows.append({"sourceFrame":frames[i]["frame"],"phase":"hold" if i in hold else "lower" if i<mid else "rise","floorMinM":float(cloud[:,1].min())-floor,"slatInteriorVertices":deep,"supportGapM":gap,"supportSampleFraction":fraction,"soleGapsM":soles,"skinReplay":replay,"maxJointStepRad":step,"balance":balance,"failures":failures})
    poses.append(f)
    if i%24==0:print("evaluated",i,flush=True)
B.apply_checked(arm,bones,rest,t["rest"]);h,_=F.setup(meshes)
fixture=pathlib.Path("input-01a")/(c["fixture"]+".glb");assert F.digest(fixture)==c["assetSha"]
bpy.ops.import_scene.gltf(filepath=str(fixture.resolve()))
cam=bpy.context.scene.camera;slot=next(s for s in asset["slots"] if s["id"]==c["slot"])
target=F.Y.inverted()@(sem@Vector((slot["anchorX"],floor+h*.48,slot["anchorZ"])))
indices=sorted(set([0,len(poses)-1,mid-start,*[round((len(poses)-1)*j/6) for j in range(7)]]))
rendered=[]
for view,offset in (("quarter",Vector((1.7,.9,3.0))),("side",Vector((3.,.7,0.)))):
    cam.location=target+F.Y.inverted()@(sem@offset)*h;cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.65
    for j in indices:
        B.apply_checked(arm,bones,rest,poses[j]);name=f"{view}-{j:03}.png"
        bpy.context.scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True);rendered.append(name)
from collections import Counter
report={"stage":"EXTERNAL_R2_DIRECT","head":__import__("os").environ.get("EXPECTED_SHA"),"rig":key,"rigSha":c["rigSha"],"assetSha":c["assetSha"],"fixture":c["fixture"],"slot":c["slot"],"sourceSha":src["sourceSha256"],"sourceBlender":src["blender"],"targetBlender":bpy.app.version_string,"sourceScale":scale,"trimFrames":[frames[start]["frame"],frames[end]["frame"]],"sampleRate":24,"rootPlacement":list(root0),"mappedBones":len(mapped),"unmappedFingerDetail":"neutral; not accepted","evaluatedFrames":len(rows),"holdFrames":len(hold),"failures":dict(Counter(x for row in rows for x in row["failures"])),"baseline":{"sourcePhaseReportSha":"31b7a751be1eb7d93cf0620b8c63da502aa320e714a10b34f7995454d3f49838","evaluatedFrames":old["evaluatedFrames"],"failures":old["failures"],"comparison":"same rig/fixture, different timing and hold selection; not matched temporal ART"},"samples":rows,"rendered":rendered,"status":"DIRECT_SCREEN_PASS" if all(not x["failures"] for x in rows) else "DIRECT_SCREEN_FAIL","ART":"OPEN","physicalAcceptance":"BLOCKED"}
(OUT/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False))
(OUT/"poses.json").write_text(json.dumps({"rig":key,"poses":poses,"sourceFrames":[x["sourceFrame"] for x in rows]},separators=(",",":"),allow_nan=False))
print(report["status"],report["evaluatedFrames"],report["failures"],flush=True)
