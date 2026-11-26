"""R4: apply frozen FBIK R12 floor constraint to verified VRMA seating reference.
One bounded comparison; no bench, foot-anchor redesign, new solver or hand edits.
"""
import bpy,sys,pathlib,os,json,math,hashlib
import numpy as np
from mathutils import Vector
for p in ("prior-code/tools","frozen-fbik/tools","prior-pilot/tools","frozen-interact/tools"):
    sys.path.insert(0,str(pathlib.Path(p).resolve()))
import cf_interact_balance as B
F=B.F
OUT=pathlib.Path("artifacts/cf-anim-rig-contract-r4");OUT.mkdir(parents=True,exist_ok=True)
F.OUT=OUT
PIN="96bf70f880742028dbc91235c6a215703656a9bb"
RIG="321f407aa39c0acdb4136b803b4feab62c86bf269ece9bb1a868bc8c3764c775"
def read(name,sha):
    p=pathlib.Path("input-r3/Sitting_Enter")/name;b=p.read_bytes()
    assert hashlib.sha256(b).hexdigest()==sha,name
    return json.loads(b)
c=read("target-poses.json","77b0e393ba5337d69dc68c70e0a8065db1907d3577901ce3cf595f1261c51de7")
baseline=read("target-report.json","e85ad0fb265ea8c8ecd5a53c420dbdab476e7c1f9b54db77bf4720e9035c6140")
audit=read("source-vrma-audit.json","5749e3c8e60e9f9ac957554ad1c8672cb70cd90d846ee73d865b399d0301ae0a")
assert baseline["head"]==audit["head"]==PIN and audit["status"]=="SOURCE_EXPORT_PASS"
assert baseline["failures"]==["GROSS_FLOOR_PENETRATION"]
bases=c["poses"];assert len(bases)==baseline["evaluatedFrames"]==32
p=pathlib.Path("prior-full/male-grid_021-100.glb");assert F.digest(p)==RIG
arm,bones=F.import_rig(p);F.reset(arm,bones);rest=F.locals_(arm,bones,True)
assert [b.name for b in bones]==c["names"]
assert [bones.index(b.parent) if b.parent else -1 for b in bones]==c["parents"]
names=c["names"]
role_names={"hip":"root","head":"head"}
for s,suf in (("l","L"),("r","R")):
    for role,n in (("thigh","upperleg01"),("shin","lowerleg01"),("foot","foot"),("hand","wrist"),("upperarm","upperarm01")):
        role_names[role+"_"+s]=n+"."+suf
roles={k:names.index(n) for k,n in role_names.items()}
t={"names":names,"parents":c["parents"],"rest":F.encode(rest),"roles":roles,"sha256":RIG}
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
skin=F.WeightedSkin(t,meshes,arm,bones)
B.apply_checked(arm,bones,rest,t["rest"]);assert skin.actual_error(t["rest"])["max_m"]<.002
h,floor=F.setup(meshes);cam=bpy.context.scene.camera
regs={s:F.regions(meshes,t,s) for s in ("l","r")}
goals=[]
for f in bases:
    w=F.world(t,f)
    # Use original VRMA goals, not manufactured new poses or floor offsets.
    # Only pelvis/leg ancestry is active. Actual weighted-floor inequality is
    # the only added environmental constraint; keep torso/arms local rotations.
    goals.append({roles[n]:w[roles[n]].copy() for n in ("hip","foot_l","foot_r")})
report={"head":os.environ["EXPECTED_SHA"],"stage":"RIG-CONTRACT/R4","sourceHead":PIN,"frozenSolver":"6974fc7e91ee2b089bde79c701eee946da142b51","rigSha":RIG,"frames":len(bases),"floorM":floor,"status":"PENDING","ART":"OPEN","scope":"floor penetration mitigation only; no seat or planted-foot locking","renders":[]}
def save(): (OUT/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False))
def measure(f,b):
    B.apply_checked(arm,bones,rest,f)
    replay=skin.actual_error(f);assert replay["max_m"]<.002
    w=F.world(t,f);bw=F.world(t,b);cloud=np.array([list(v) for v in F.surface(skin.reg)])
    gap=float(cloud[:,1].min()-floor)
    foot={s:float(F.sole(regs[s])-floor) for s in ("l","r")}
    drift={n:(w[i].translation-bw[i].translation).length for n,i in roles.items()}
    headgap=w[roles["head"]].translation.y-(w[roles["upperarm_l"]].translation.y+w[roles["upperarm_r"]].translation.y)/2
    length=max((Vector(a["p"])-Vector(b["p"])).length for j,(a,b) in enumerate(zip(f,t["rest"])) if t["parents"][j]>=0)
    return {"floorMinM":gap,"soleGapsM":foot,"driftM":drift,"headShoulderHeightM":headgap,"localTranslationDriftM":length,"skinReplay":replay}
rows=[measure(f,f) for f in bases]
assert max(abs(row["floorMinM"]-old["floorGapM"]) for row,old in zip(rows,baseline["samples"]))<.002
report["baseline"]=rows;save()
print("R4 exact native baseline reproduced; starting frozen R12",flush=True)
corrected,stats=F.trajectory(t,bases,goals,skin,floor,None,1/24)
assert len(corrected)==len(bases)
report["solver"]=stats
(OUT/"corrected-poses.json").write_text(json.dumps({"names":names,"parents":c["parents"],"poses":corrected},allow_nan=False,separators=(",",":")))
after=[measure(f,b) for f,b in zip(corrected,bases)]
for i,row in enumerate(after):
    row["maxJointStepRad"]=B.maxstep(corrected[i-1],corrected[i]) if i else 0
    row["baselineJointStepRad"]=B.maxstep(bases[i-1],bases[i]) if i else 0
    row["failures"]=[]
    if row["floorMinM"]<-.005:row["failures"].append("FLOOR")
    if row["headShoulderHeightM"]<.05:row["failures"].append("HEAD")
    if row["localTranslationDriftM"]>.002:row["failures"].append("LOCAL_LENGTH")
    if row["maxJointStepRad"]>max(.35,row["baselineJointStepRad"]+.05):row["failures"].append("JOINT_STEP")
    # Keep baseline reference meaning: frozen R12 root trust region already
    # caps each axis at .10m; require no displacement of the upper body >.15m.
    if max(row["driftM"][n] for n in ("head","hand_l","hand_r"))>.15:row["failures"].append("REFERENCE_DRIFT")
report["corrected"]=after
report["failures"]=sorted({f for row in after for f in row["failures"]}|({"SOLVER_NOT_EXECUTED"} if not stats["executed"] else set()))
report["status"]="FLOOR_SCREEN_PASS" if not report["failures"] else "FLOOR_SCREEN_FAIL"
report["baselineWorstFloorM"]=min(x["floorMinM"] for x in rows)
report["correctedWorstFloorM"]=min(x["floorMinM"] for x in after)
report["baselineFailedFrames"]=sum(x["floorMinM"]<-.005 for x in rows)
report["correctedFailedFrames"]=sum(x["floorMinM"]<-.005 for x in after)
save()
indices=sorted(set([0,len(bases)-1,min(range(len(rows)),key=lambda i:rows[i]["floorMinM"]),len(bases)//2]))
for label,offset in (("quarter",Vector((1.6,-3,.5))),("side",Vector((3,0,.2)))):
    for i in indices:
        # identical framing of reference and correction
        w=F.world(t,bases[i]);hip=F.Y.inverted()@w[roles["hip"]].translation
        focus=Vector((hip.x,hip.y,floor+h*.50))
        cam.location=focus+offset*h;cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.65
        for variant,frames in (("base",bases),("corrected",corrected)):
            B.apply_checked(arm,bones,rest,frames[i])
            name=f"{label}-{i:03}-{variant}.png";bpy.context.scene.render.filepath=str(OUT/name)
            bpy.ops.render.render(write_still=True);assert (OUT/name).stat().st_size>0
            report["renders"].append(name)
save();print(report["status"],report["failures"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
