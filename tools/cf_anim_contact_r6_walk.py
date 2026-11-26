"""Contact contract R6: periodic gait boundary within the trajectory QP, no postprocessing."""
import bpy,sys,pathlib,os,json,math,hashlib
import numpy as np
from mathutils import Vector
for p in ("prior-code/tools","frozen-fbik/tools","prior-pilot/tools","frozen-interact/tools"):
    sys.path.insert(0,str(pathlib.Path(p).resolve()))
import cf_interact_balance as B
F=B.F
clip=sys.argv[-1];assert clip=="Walk_Loop"
OUT=pathlib.Path("artifacts/cf-anim-contact-r6")/clip;OUT.mkdir(parents=True,exist_ok=True)
F.OUT=OUT
PIN="96bf70f880742028dbc91235c6a215703656a9bb"
RIG="321f407aa39c0acdb4136b803b4feab62c86bf269ece9bb1a868bc8c3764c775"
hashes={}
def read(name,sha=None):
    p=pathlib.Path("input-r3")/clip/name;b=p.read_bytes()
    hashes[name]=hashlib.sha256(b).hexdigest()
    if sha:assert hashes[name]==sha,name
    return json.loads(b)
c=read("target-poses.json","abd807d53f7781d1be146ce0f702fe2b04927a0fe9f41c549dde3d9a9330255f")
baseline=read("target-report.json","ec8fd190435ab0befa22a9051377aa87317d38b390e47aa49ef1d1838c097b0c")
audit=read("source-vrma-audit.json","54f46ba1dbc6a6e7f8aad835eff3cd508db571d18b2724d750377a292db86ba3")
assert baseline["head"]==audit["head"]==PIN and audit["status"]=="SOURCE_EXPORT_PASS"
source=read("source-report.json","024a87183c46e7baeb644fb073cb19c195d10928a704213c3b1f43ec5093b6e8")
assert source["head"]==PIN and source["clip"]==clip and source["sourceGlbSha256"]=="69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997"
assert baseline["failures"]==[]
bases=c["poses"];assert len(bases)==baseline["evaluatedFrames"]==len(source["samples"])
dt=1/source["fps"]
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
# Map independently estimated source velocity from native Z-up into
# the target anatomical horizontal axes. Scale by neutral hip height.
path=pathlib.Path("input-r2")/clip/"report.json"
raw_report=path.read_bytes()
assert hashlib.sha256(raw_report).hexdigest()=="0b70e6265d6ae5ff8536ef2a4a7fa4f12c758d7717daec9a54d5234a91b28555"
src=json.loads(raw_report)
assert src["head"]=="287df96bf9219c8a56ba8e7e2098f6be3f02122c" and src["sourceSha"]==source["sourceGlbSha256"] and src["frames"]==len(bases)
assert src["rootFitDisagreementMps"]<.01
wr=F.world(t,t["rest"])
def horizontal_unit(a):
    a=np.asarray(a,dtype=float).copy();a[1]=0
    assert np.linalg.norm(a)>.01
    return a/np.linalg.norm(a)
forward=horizontal_unit(sum((np.array(wr[names.index("toe1-1."+s)].translation-wr[roles["foot_"+k]].translation) for k,s in (("l","L"),("r","R"))),np.zeros(3)))
left=horizontal_unit(np.array(wr[roles["foot_l"]].translation-wr[roles["foot_r"]].translation))
# Orthonormalize lateral axis, no frame-specific fitting.
left=horizontal_unit(left-(left@forward)*forward)
v=np.mean(list(src["perFootRootVelocityHypothesesMps"].values()),axis=0)
scale=(wr[roles["hip"]].translation.y-floor)/source["referenceHipHeight"]
assert .5<scale<1.5
velocity=scale*(v[0]*left-v[1]*forward)
assert t["parents"][roles["hip"]]==-1 and sum(p<0 for p in t["parents"])==1
import copy
bases=copy.deepcopy(bases)
for i,f in enumerate(bases):
    j=roles["hip"];f[j]["p"]=(np.asarray(f[j]["p"])+i*dt*velocity).tolist()
goals=[]
for f in bases:
    w=F.world(t,f)
    # Use original VRMA goals, not manufactured new poses or floor offsets.
    # Only pelvis/leg ancestry is active. Actual weighted-floor inequality is
    # the only added environmental constraint; keep torso/arms local rotations.
    goals.append({roles[n]:w[roles[n]].copy() for n in ("hip","foot_l","foot_r")})
report={"head":os.environ["EXPECTED_SHA"],"stage":"CONTACT-CONTRACT/R6","clip":clip,"inputHashes":hashes,"sourceHead":PIN,"frozenSolver":"6974fc7e91ee2b089bde79c701eee946da142b51","rigSha":RIG,"frames":len(bases),"floorM":floor,"status":"PENDING","ART":"OPEN","scope":"one world-travel gait cycle, patch centroid contact; no runtime navigation or dynamic balance claim","rootVelocityMps":velocity.tolist(),"sourceVelocityXYMps":v.tolist(),"hipScale":scale,"expectedTravelM":float(np.linalg.norm(velocity)*(len(bases)-1)*dt),"renders":[]}
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
import inspect
# Reserve 0.10 mm inside the unchanged 20 mm external gate.
# R3 independent Blender replay error <=1.654 micrometers; reserve
# covers numerical disagreement without relaxing any quality threshold.
INTERNAL_CONTACT_M=.0199
report["internalContactM"]=INTERNAL_CONTACT_M
report["externalContactM"]=.02
path=pathlib.Path("input-r2")/clip/"report.json"
raw_report=path.read_bytes()
assert hashlib.sha256(raw_report).hexdigest()=="0b70e6265d6ae5ff8536ef2a4a7fa4f12c758d7717daec9a54d5234a91b28555"
src=json.loads(raw_report)
assert src["head"]=="287df96bf9219c8a56ba8e7e2098f6be3f02122c" and src["sourceSha"]==source["sourceGlbSha256"] and src["frames"]==len(bases)
def intervals(rows):
    runs=[];a=None
    for i,yes in enumerate([*[q["stationaryCandidate"] for q in rows],False]):
        if yes and a is None:a=i
        if not yes and a is not None:
            if i-a>=2:runs.append((max(0,a-1),i-1))
            a=None
    return runs
# Fixed target heel/forefoot low vertex clusters, defined only from neutral skin.
B.apply_checked(arm,bones,rest,t["rest"])
neutral=np.array([list(v) for v in F.surface(skin.reg)])
wr=F.world(t,t["rest"])
offsets={};offset=0
for o in meshes:offsets[o.name]=offset;offset+=len(o.data.vertices)
plan={};anchors={};patches={}
for s,side,suffix in (("l","left","L"),("r","right","R")):
    ids=np.array([offsets[o.name]+j for o,ix in regs[s] for j in ix])
    origin=np.array(wr[roles["foot_"+s]].translation)
    axis=np.array(wr[names.index("toe1-1."+suffix)].translation)-origin;axis[1]=0
    assert np.linalg.norm(axis)>.01;axis/=np.linalg.norm(axis)
    along=(neutral[ids]-origin)@axis
    for part,q in (("heel",.4),("forefoot",.6)):
        key=s+"_"+part
        sub=ids[along<=np.quantile(along,q)] if part=="heel" else ids[along>=np.quantile(along,q)]
        sub=sub[neutral[sub,1]<=np.quantile(neutral[sub,1],.25)+.005]
        assert len(sub)>=3
        center=neutral[sub].mean(axis=0)
        # Three closest low vertices, immutable patch centroid. Not a whole-sole lock.
        sub=sub[np.argsort(np.linalg.norm(neutral[sub]-center,axis=1),kind="stable")[:3]]
        patches[key]=sub
        plan[key]=intervals(src["samples"][side+"_"+part])
        anchors[key]={}
        for a,b in plan[key]:
            B.apply_checked(arm,bones,rest,bases[a])
            pts=np.array([list(v) for v in F.surface(skin.reg)])
            target=pts[sub].mean(axis=0)
            target[1]=floor+max(0.,float(neutral[sub,1].mean()-neutral[:,1].min()))
            for k in range(a,b+1):anchors[key][k]=(sub,target.copy())
report["phasePlan"]=plan
report["anchors"]={s:{str(k):{"vertices":j.tolist(),"positionM":p.tolist()} for k,(j,p) in d.items()} for s,d in anchors.items()}
save()
# Explicit linearized patch inequalities use the same weighted point Jacobian
# as the existing floor constraint. Existing slack is restoration-only.
class PatchLimit(F.WeightedSurfaceLimit):
    def __init__(self,model,k):
        super().__init__(model,skin,floor,None);self.k=k
    def compute_qp_inequalities(self,cfg,dt):
        base=super().compute_qp_inequalities(cfg,dt)
        G=[] if base.inactive else list(base.G)
        H=[] if base.inactive else list(base.h)
        pts,parts=self.points(cfg)
        for key,d in anchors.items():
            if self.k not in d:continue
            ids,p=d[self.k];delta=pts[ids].mean(axis=0)-p
            jac=sum((self.point_jac(cfg,int(j),parts) for j in ids))/len(ids)
            # Componentwise horizontal box lies inside 20mm Euclidean disk.
            for axis,tol in enumerate((INTERNAL_CONTACT_M/math.sqrt(2),INTERNAL_CONTACT_M,INTERNAL_CONTACT_M/math.sqrt(2))):
                G.extend([jac[axis],-jac[axis]])
                H.extend([tol-delta[axis],tol+delta[axis]])
        return F.Constraint(np.asarray(G),np.asarray(H)) if G else F.Constraint()
counter=0
def contact_qp(*args,**kwargs):
    global counter
    cfg,tasks,limit,q0=F.qp(*args,**kwargs)
    k=counter;counter+=1
    return cfg,tasks,PatchLimit(cfg.model,k),q0
guard_stats={"calls":0,"rejected":0,"history":[]}
def violations(ctx,trial=None):
    vals=[]
    for k,(cfg,_,limit,_) in enumerate(ctx):
        old=cfg.q.copy()
        try:
            if trial is not None:cfg.update(trial[k])
            pts,_=limit.points(cfg)
            vals.append(max(0.,floor-.005-float(pts[:,1].min())))
            for key,d in anchors.items():
                if k not in d:continue
                ids,p=d[k];delta=pts[ids].mean(axis=0)-p
                vals.extend(max(0.,abs(float(v))-tol) for v,tol in zip(delta,(INTERNAL_CONTACT_M/math.sqrt(2),INTERNAL_CONTACT_M,INTERNAL_CONTACT_M/math.sqrt(2))))
        finally:
            if trial is not None:cfg.update(old)
    return np.asarray(vals)
def nonlinear_guard(ctx,trials):
    guard_stats["calls"]+=1
    a=violations(ctx);b=violations(ctx,trials)
    # Global feasibility merit allows a competing contact to transiently
    # worsen while reducing overall excess; once feasible cannot leave feasibility.
    before=float(a@a);after=float(b@b)
    ok=bool(np.isfinite(b).all() and (after<=1e-12 if before<=1e-12 else after<before))
    guard_stats["history"].append({"beforeM2":before,"afterM2":after,"accepted":ok})
    if not ok:guard_stats["rejected"]+=1
    return ok
raw=inspect.getsource(F.trajectory)
needle="and np.all(np.abs(np.diff(d,axis=0))<=rate+1e-6):"
assert raw.count(needle)==1
# The clip contains duplicate phase endpoints. Tie the corrections, not
# world positions (which differ by a stride). Add the missing wrapped
# second difference to the existing smoothness objective.
SEAM_TOL=1e-4
def inject_once(old,new):
    global raw
    assert raw.count(old)==1,old
    raw=raw.replace(old,new)
inject_once('W=(.12*(D1.T@D1)+.4*(D2.T@D2)).tocsc()', '''edge=np.zeros((1,N))
    edge[0,0]=-1.;edge[0,-1]=1.
    S=sparse.kron(sparse.csc_matrix(edge),sparse.eye(n),format="csc")
    wrap=np.zeros((1,N))
    wrap[0,0]=-2.;wrap[0,1]=1.;wrap[0,-2]=1.
    C=sparse.kron(sparse.csc_matrix(wrap),sparse.eye(n),format="csc")
    W=(.12*(D1.T@D1)+.4*(D2.T@D2+C.T@C)).tocsc()''')
inject_once('sol=solve_sparse_qp(P,q,A,upper,stats)', '''# Hard periodic tangent boundary; no contact slack can pay for a seam.
        seam_current=S@current
        A=sparse.vstack([A,S@B,-S@B],format="csc")
        upper=np.r_[upper,np.full(n,SEAM_TOL)-seam_current,np.full(n,SEAM_TOL)+seam_current]
        sol=solve_sparse_qp(P,q,A,upper,stats)''')
inject_once(needle, "and np.all(np.abs(np.diff(d,axis=0))<=rate+1e-6) and np.max(np.abs(d[-1]-d[0]))<=SEAM_TOL+1e-6 and nonlinear_guard(ctx,trials):")
inject_once('stats["max_rate_ratio"]=float', '''stats["periodicTangentResidual"]=float(np.max(np.abs(final[-1]-final[0])))
    assert stats["periodicTangentResidual"]<=SEAM_TOL+1e-6
    stats["max_rate_ratio"]=float''')
ns=dict(vars(F));ns["nonlinear_guard"]=nonlinear_guard;ns["qp"]=contact_qp;ns["SEAM_TOL"]=SEAM_TOL
exec(compile(raw,"<R12-patch-contact-guard>","exec"),ns)
corrected,stats=ns["trajectory"](t,bases,goals,skin,floor,None,dt)
assert counter==len(bases)
report["nonlinearGuard"]=guard_stats
assert len(corrected)==len(bases)
report["solver"]=stats
(OUT/"corrected-poses.json").write_text(json.dumps({"names":names,"parents":c["parents"],"poses":corrected},allow_nan=False,separators=(",",":")))
after=[measure(f,b) for f,b in zip(corrected,bases)]
for i,row in enumerate(after):
    row["maxJointStepRad"]=B.maxstep(corrected[i-1],corrected[i]) if i else 0
    row["baselineJointStepRad"]=B.maxstep(bases[i-1],bases[i]) if i else 0
    row["failures"]=[]
    B.apply_checked(arm,bones,rest,corrected[i]);pts=np.array([list(v) for v in F.surface(skin.reg)])
    row["contacts"]={}
    for s,d in anchors.items():
        if i not in d:continue
        j,p=d[i];delta=pts[j].mean(axis=0)-p
        slip=float(np.linalg.norm(delta[[0,2]]));height=abs(float(delta[1]));row["contacts"][s]={"slipM":slip,"heightM":height}
        if slip>.02 or height>.02:row["failures"].append("PLANT_"+s.upper())
    if row["floorMinM"]<-.005:row["failures"].append("FLOOR")
    if row["headShoulderHeightM"]<.05:row["failures"].append("HEAD")
    if row["localTranslationDriftM"]>.002:row["failures"].append("LOCAL_LENGTH")
    if row["maxJointStepRad"]>max(.35,row["baselineJointStepRad"]+.05):row["failures"].append("JOINT_STEP")
    # Keep baseline reference meaning: frozen R12 root trust region already
    # caps each axis at .10m; require no displacement of the upper body >.15m.
    if max(row["driftM"][n] for n in ("head","hand_l","hand_r"))>.15:row["failures"].append("REFERENCE_DRIFT")
report["corrected"]=after
report["failures"]=sorted({f for row in after for f in row["failures"]}|({"SOLVER_NOT_EXECUTED"} if not stats["executed"] else set()))
if any(not plan[s] for s in plan):report["failures"].append("SUPPORT_COVERAGE")
if guard_stats["calls"]==0:report["failures"].append("NONLINEAR_GUARD_NOT_EXECUTED")
# Loop seam check: compare first and last samples after removing the
# known world translation. Do not mask seam error with the root path.
root=roles["hip"];offset=velocity*(len(bases)-1)*dt
seam=float(np.linalg.norm(np.asarray(corrected[-1][root]["p"])-corrected[0][root]["p"]-offset))
joint_seam=B.maxstep(corrected[0],corrected[-1])
base_seam=B.maxstep(bases[0],bases[-1])
def root_velocity_jump(seq):
    p=np.asarray([f[root]["p"] for f in seq])
    return float(np.linalg.norm((p[1]-p[0])-(p[-1]-p[-2]))/dt)
report["loopSeam"]={"rootResidualM":seam,"jointStepRad":joint_seam,"baselineJointStepRad":base_seam,"rootVelocityJumpMps":root_velocity_jump(corrected),"baselineRootVelocityJumpMps":root_velocity_jump(bases),"periodicTangentTolerance":SEAM_TOL,"periodicTangentResidual":stats["periodicTangentResidual"]}
report["unlabelledSupportFrames"]=[i for i in range(len(bases)) if not any(i in d for d in anchors.values())]
if seam>.02 or joint_seam>max(.10,base_seam+.05):report["failures"].append("LOOP_SEAM")
report["status"]="CONTACT_SCREEN_PASS" if not report["failures"] else "CONTACT_SCREEN_FAIL"
report["baselineWorstFloorM"]=min(x["floorMinM"] for x in rows)
report["correctedWorstFloorM"]=min(x["floorMinM"] for x in after)
report["baselineFailedFrames"]=sum(x["floorMinM"]<-.005 for x in rows)
report["correctedFailedFrames"]=sum(x["floorMinM"]<-.005 for x in after)
save()
indices=range(len(bases))
scene=bpy.context.scene;scene.render.resolution_percentage=60
for label,offset in (("quarter",Vector((1.6,-3,.5))),("side",Vector((3,0,.2)))):
    for i in (indices if label=="side" else [k for k in indices if after[k]["failures"]]):
        # identical framing of reference and correction
        w=F.world(t,bases[len(bases)//2]);hip=F.Y.inverted()@w[roles["hip"]].translation
        focus=Vector((hip.x,hip.y,floor+h*.50))
        cam.location=focus+offset*h;cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=max(h*1.65, h+report["expectedTravelM"])*1.1
        for variant,frames in (("base",bases),("corrected",corrected)):
            B.apply_checked(arm,bones,rest,frames[i])
            name=f"{label}-{i:03}-{variant}.png";bpy.context.scene.render.filepath=str(OUT/name)
            bpy.ops.render.render(write_still=True);assert (OUT/name).stat().st_size>0
            report["renders"].append(name)
import subprocess,imageio_ffmpeg
for variant in ("base","corrected"):
    movie=OUT/(variant+".mp4")
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-y","-framerate",str(source["fps"]),"-i",str(OUT/("side-%03d-"+variant+".png")),"-vf","pad=ceil(iw/2)*2:ceil(ih/2)*2","-c:v","libx264","-pix_fmt","yuv420p",str(movie)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    assert movie.stat().st_size>0
    report["renders"].append(movie.name)
save();print(report["status"],report["failures"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
