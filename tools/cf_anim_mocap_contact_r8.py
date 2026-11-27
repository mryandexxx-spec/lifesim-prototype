"""Contact contract R8: exact Euclidean velocity cones and coupled restoration."""
import bpy,sys,pathlib,os,json,math,hashlib
import numpy as np
from mathutils import Vector
from scipy.spatial.transform import Rotation
from scipy import sparse
from cf_anim_contact_temporal import seam_vectors, limits_for, norms
for p in ("prior-code/tools","frozen-fbik/tools","prior-pilot/tools","frozen-interact/tools"):
    sys.path.insert(0,str(pathlib.Path(p).resolve()))
import cf_interact_balance as B
F=B.F
clip=sys.argv[-1];assert clip=="Neutral_FW"
PROFILE=os.environ["PROFILE"]
PINS={"male-grid_021-100":"321f407aa39c0acdb4136b803b4feab62c86bf269ece9bb1a868bc8c3764c775","female-grid_201-100":"950d46a93155bc106cf311f2707d8348c81fd0f36247339e7ba4e67ee8d1030e"}
RIG=PINS[PROFILE]
PIN="ca1c1b8e10bd6edd900837baf1c8c27983d68bb3"
DERIVED="bab703d41dc3bd6df2a6bceb3a0d3f773e84ceff65e42097e128ec5cce95e728"
hashes={}
def read(path):
    b=pathlib.Path(path).read_bytes();hashes[str(path)]=hashlib.sha256(b).hexdigest();return json.loads(b)
c=read("input-replay/target/target-poses.json")
target=read("input-replay/target/report.json")
source=read("input-replay/source/source-report.json")
audit=read("input-replay/source/source-vrma-audit.json")
loop=read("input-loop/report.json")
assert target["head"]==source["head"]==audit["head"]==PIN
assert target["status"]=="CLOSURE_SCREEN_PASS" and target["failures"]==[] and audit["status"]=="SOURCE_EXPORT_PASS"
assert target["profile"]==PROFILE and target["rigSha256"]==RIG
assert target["derivedSha256"]==source["derivedSha256"]==c["derivedSha256"]==loop["derivedSha256"]==DERIVED
assert loop["head"]=="cfa3f431939ee8f6c55f2523e08b8e5be38d35e8" and loop["status"]=="OVERLAP_SCREEN_PASS"
assert source["clip"]==clip==target["clip"]
baseline=target["cases"]["actual-closure"]
bases=c["poses"];assert len(bases)==len(baseline["samples"])==len(source["samples"])==84
dt=1/source["fps"];assert abs(c["fps"]-source["fps"])<1e-9
OUT=pathlib.Path("artifacts/cf-anim-mocap-contact")/PROFILE/"r8";OUT.mkdir(parents=True,exist_ok=True)
F.OUT=OUT
r6_dir=OUT.parent/"r6"
r6_bytes=(r6_dir/"report.json").read_bytes();r6=json.loads(r6_bytes)
assert r6["head"]==os.environ["EXPECTED_SHA"] and r6["status"]=="CONTACT_SCREEN_PASS" and not r6["failures"]
assert r6["frames"]==len(bases) and r6["inputHashes"]==hashes
r6_pose_bytes=(r6_dir/"corrected-poses.json").read_bytes();r6_pose=json.loads(r6_pose_bytes)
assert r6_pose["names"]==c["names"] and r6_pose["parents"]==c["parents"] and len(r6_pose["poses"])==len(bases)
p=pathlib.Path("prior-full")/(PROFILE+".glb");assert F.digest(p)==RIG
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
# VRMA already contains the recorded root travel. Preserve it exactly.
wr=F.world(t,t["rest"])
assert t["parents"][roles["hip"]]==-1 and sum(p<0 for p in t["parents"])==1
root=roles["hip"]
native_delta=np.asarray(source["samples"][-1]["hips"])-source["samples"][0]["hips"]
scale=baseline["calibratedPoints"]["hips"][2]/source["referenceHipHeight"]
assert .5<scale<1.5
root_delta=np.asarray(bases[-1][root]["p"])-bases[0][root]["p"]
expected=np.asarray(F.Y@Vector(native_delta))*scale
assert np.linalg.norm(root_delta-expected)<.002,(root_delta,expected)
assert abs(root_delta[1])<.0002
stride=root_delta.copy();stride[1]=0
velocity=stride/((len(bases)-1)*dt);v=native_delta[:2]/((len(bases)-1)*dt)
import copy
bases=copy.deepcopy(bases)
goals=[]
for f in bases:
    w=F.world(t,f)
    # Use original VRMA goals, not manufactured new poses or floor offsets.
    # Only pelvis/leg ancestry is active. Actual weighted-floor inequality is
    # the only added environmental constraint; keep torso/arms local rotations.
    goals.append({roles[n]:w[roles[n]].copy() for n in ("hip","foot_l","foot_r")})
report={"head":os.environ["EXPECTED_SHA"],"stage":"CONTACT-CONTRACT/R8","clip":clip,"inputHashes":hashes,"sourceHead":PIN,"derivedSha256":DERIVED,"profile":PROFILE,"rootMotionMode":"existing native world travel; not added","frozenSolver":"6974fc7e91ee2b089bde79c701eee946da142b51","rigSha":RIG,"frames":len(bases),"floorM":floor,"status":"PENDING","ART":"OPEN","scope":"one world-travel gait cycle, patch centroid contact; no runtime navigation or dynamic balance claim","rootVelocityMps":velocity.tolist(),"sourceVelocityXYMps":v.tolist(),"hipScale":scale,"expectedTravelM":float(np.linalg.norm(velocity)*(len(bases)-1)*dt),"renders":[]}
def save(): (OUT/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False))
root=roles["hip"]
stride=velocity*(len(bases)-1)*dt
def sample_pose(f):
    return np.asarray(f[root]["p"],dtype=float),np.asarray([list(F.matrix(x["p"],x["r"]).to_quaternion()) for x in f],dtype=float)
def pose_seam(seq):
    return seam_vectors([sample_pose(seq[i]) for i in (0,1,-2,-1)],dt,stride)
base_v=pose_seam(bases)
old_v=pose_seam(r6_pose["poses"])
caps=limits_for(base_v[0])
assert abs(norms(old_v)[0,0]-r6["loopSeam"]["rootVelocityJumpMps"])<1e-5
report["temporalBaseline"]={"retargetBeforeSolve":norms(base_v).tolist(),"r6":norms(old_v).tolist(),"jointNames":["root_translation",*names],"limits":caps.tolist(),"r6ReportSha256":hashlib.sha256(r6_bytes).hexdigest(),"r6PosesSha256":hashlib.sha256(r6_pose_bytes).hexdigest(),"r6Provenance":"same exact job and input hashes"}
report["nativeSourceTemporal"]={"scope":"source native BVH joint seam only; separate from actual target physical contact","head":loop["head"],"derivedSha256":DERIVED,"derived":loop["derived"],"tiledSeams":loop["checks"]["tiledSeams"]}
save()
# Spatial relative rotations are expressed in the respective local parent axes.
# Convert the actual MuJoCo FK into the same local convention independently of
# the final Blender pose decoder. Only the four endpoint-adjacent frames enter.
def cfg_sample(cfg):
    ids=[cfg.model.body(f"b{i}").id for i in range(len(names))]
    q=cfg.data.xquat[ids].copy()
    rot=Rotation.from_quat(q[:,[1,2,3,0]])
    local=[]
    for i,p in enumerate(t["parents"]):
        z=rot[i] if p<0 else rot[p].inv()*rot[i]
        a=z.as_quat();local.append(a[[3,0,1,2]])
    return cfg.data.xpos[ids[root]].copy(),np.asarray(local)
def endpoint_indices(ctx):return (0,1,len(ctx)-2,len(ctx)-1)
def cfg_seam(ctx,trials=None):
    vals=[]
    for k in endpoint_indices(ctx):
        cfg=ctx[k][0];old=cfg.q.copy()
        try:
            if trials is not None:cfg.update(trials[k])
            vals.append(cfg_sample(cfg))
        finally:
            if trials is not None:cfg.update(old)
    return seam_vectors(vals,dt,stride)
def temporal_linearization(ctx):
    ks=endpoint_indices(ctx);samples=[cfg_sample(ctx[k][0]) for k in ks]
    residual=seam_vectors(samples,dt,stride)
    J=np.zeros((residual.size,len(ctx)*ctx[0][0].model.nv))
    eps=1e-5
    for slot,k in enumerate(ks):
        cfg=ctx[k][0];old=cfg.q.copy();n=cfg.model.nv
        try:
            for j in range(n):
                direction=np.zeros(n);direction[j]=1
                pair=[]
                for sign in (1.,-1.):
                    trial=old.copy();F.mujoco.mj_integratePos(cfg.model,trial,direction,sign*eps)
                    cfg.update(trial);changed=list(samples);changed[slot]=cfg_sample(cfg)
                    pair.append(seam_vectors(changed,dt,stride).ravel())
                J[:,k*n+j]=(pair[0]-pair[1])/(2*eps)
        finally:cfg.update(old)
    assert np.isfinite(J).all()
    return residual.reshape(-1,3),J
def solve_temporal_conic(P,q,A,upper,E,ctx,stats):
    # Same frozen quadratic objective, linear limits and restoration slack.
    # Replace the finite outer approximation by true second-order cones:
    # ||v + J*delta||_2 <= cap. No velocity slack.
    residual,J=temporal_linearization(ctx)
    C=F.clarabel
    blocks=[A];rhs=[upper];cones=[C.NonnegativeConeT(len(upper))]
    active=0
    for i,v in enumerate(residual):
        block=J[3*i:3*i+3]
        cap=caps[i%len(caps)]-1e-4
        if np.max(np.abs(block))<1e-7:
            if np.linalg.norm(v)>caps[i%len(caps)]:
                stats["solver_status"].append("Inactive velocity constraint infeasible")
                return None
            continue
        M=sparse.csc_matrix(block)@E
        blocks.append(sparse.vstack([sparse.csc_matrix((1,E.shape[1])),-M],format="csc"))
        rhs.append(np.r_[cap,v]);cones.append(C.SecondOrderConeT(4));active+=1
    AA=sparse.vstack(blocks,format="csc");bb=np.concatenate(rhs)
    settings=C.DefaultSettings();settings.verbose=False;settings.max_iter=150
    settings.tol_feas=1e-8;settings.tol_gap_abs=1e-8;settings.tol_gap_rel=1e-8
    sol=C.DefaultSolver(sparse.triu(P,format="csc"),q,AA,bb,cones,settings).solve()
    stats["solver_status"].append("Clarabel SOCP: "+str(sol.status))
    x=np.asarray(sol.x) if sol.x is not None else None
    if str(sol.status) not in ("Solved","AlmostSolved") or x is None or not np.isfinite(x).all():
        return None
    predicted=residual+(J@(E@x)).reshape(-1,3)
    excess=float(np.max(np.linalg.norm(predicted,axis=1)-np.tile(caps,2)))
    stats.setdefault("conicLinearReplay",[]).append({"activeCones":active,"maxVelocityExcess":excess,"maxLinearExcess":float(np.max(A@x-upper))})
    if np.max(A@x-upper)>1e-5 or excess>1e-7:return None
    stats["clarabel_accepted"]+=1
    return x
def temporal_excess(ctx,trials=None):
    a=norms(cfg_seam(ctx,trials))
    return np.maximum(0,a-caps[None,:])/caps[None,:]

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
# Use the fixed source joint proxy as an independent phase prior; no source sole exists.
# Corroborate each candidate on the unchanged target's actual immutable low vertices.
# The diagnostic 30mm/0.15m/s limits are the predeclared source proxy limits,
# not the final 5mm floor / 20mm patch contact constraints.
from cf_anim_mocap_contact_phase import phase_hypotheses
src=phase_hypotheses(F,B,arm,bones,rest,t,skin,meshes,regs,bases,roles,names,floor,dt,loop,stride)
report["phaseEvidence"]=src
save()
# Independent Blender processes may differ at floating point precision.
# Require exact discrete evidence (patch IDs, flags, intervals and status)
# and strictly bounded numeric replay; never permit a changed phase plan.
def compare_phase(a,b,path="phase"):
    if isinstance(a,dict):
        assert isinstance(b,dict) and a.keys()==b.keys(),path
        for k in a:compare_phase(a[k],b[k],path+"."+k)
    elif isinstance(a,list):
        assert isinstance(b,list) and len(a)==len(b),path
        for i,(x,y) in enumerate(zip(a,b)):compare_phase(x,y,path+"["+str(i)+"]")
    elif isinstance(a,float):
        assert isinstance(b,(float,int)) and not isinstance(b,bool) and math.isfinite(a) and math.isfinite(b),path
        # 2 micrometres in position; 0.0002 m/s in finite differences.
        # These are replay tolerances only, not contact acceptance limits.
        tol=2e-4 if ".patchSpeedMps" in path else 2e-6 if any(k in path for k in (".centroidM",".heightResidualM",".wholeSkinFloorMinM")) else 0.
        err=abs(a-b)
        bucket="speedMps" if ".patchSpeedMps" in path else "positionM" if tol else "other"
        phase_diff[bucket]=max(phase_diff[bucket],err)
        assert err<=tol,(path,a,b,err,tol)
    else:
        assert type(a)==type(b) and a==b,(path,a,b)
phase_diff={"positionM":0.,"speedMps":0.,"other":0.}
try:
    compare_phase(r6["phaseEvidence"],src)
except AssertionError as ex:
    report["phaseReplay"]={"status":"HOLD","maxDifferences":phase_diff,"mismatch":str(ex)}
    report["status"]="PHASE_REPLAY_HOLD";report["failures"]=["PHASE_REPLAY"];save()
    raise
report["phaseReplay"]={"status":"PASS","maxDifferences":phase_diff,"discreteEvidenceExact":True}
save()
if src["status"]!="PHASE_INPUT_PASS":
    report["status"]="PHASE_INPUT_HOLD";report["failures"]=src["failures"];save()
    print(report["status"],report["failures"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
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
        assert sub.tolist()==src["patches"][side+"_"+part]
        plan[key]=intervals(src["samples"][side+"_"+part])
        assert [list(x) for x in plan[key]]==src["phasePlan"][side+"_"+part]
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
    # Coupled dimensionless restoration: a single merit across contact
    # and temporal constraints, rather than two competing monotonic filters.
    # Contact normalization is the predeclared 20mm contract scale.
    # Intermediate iterates may trade violations, never the final screen.
    va=temporal_excess(ctx);vb=temporal_excess(ctx,trials)
    before=float(a@a/.02**2+np.sum(va*va))
    after=float(b@b/.02**2+np.sum(vb*vb))
    ok=bool(np.isfinite(b).all() and np.isfinite(vb).all() and
            (after<=1e-12 if before<=1e-12 else after<before))
    guard_stats["history"].append({"beforeNormalized":before,"afterNormalized":after,"contactBeforeM2":float(a@a),"contactAfterM2":float(b@b),"velocityBeforeNormalized":float(np.sum(va*va)),"velocityAfterNormalized":float(np.sum(vb*vb)),"accepted":ok})
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
        sol=solve_temporal_conic(P,q,A,upper,E,ctx,stats)''')
inject_once(needle, "and np.all(np.abs(np.diff(d,axis=0))<=rate+1e-6) and np.max(np.abs(d[-1]-d[0]))<=SEAM_TOL+1e-6 and nonlinear_guard(ctx,trials):")
inject_once('stats["max_rate_ratio"]=float', '''stats["periodicTangentResidual"]=float(np.max(np.abs(final[-1]-final[0])))
    assert stats["periodicTangentResidual"]<=SEAM_TOL+1e-6
    stats["max_rate_ratio"]=float''')
ns=dict(vars(F));ns["nonlinear_guard"]=nonlinear_guard;ns["qp"]=contact_qp;ns["SEAM_TOL"]=SEAM_TOL;ns["solve_temporal_conic"]=solve_temporal_conic
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
actual_v=pose_seam(corrected)
report["temporalFinal"]={"norms":norms(actual_v).tolist(),"vectors":actual_v.tolist()}
if np.any(norms(actual_v)>caps[None,:]):report["failures"].append("VELOCITY_SEAM")
# Actual native pose replay of the four seam samples (separate decoder).
native=[]
for i in (0,1,len(corrected)-2,len(corrected)-1):
    B.apply_checked(arm,bones,rest,corrected[i]);native.append(sample_pose(F.encode(F.locals_(arm,bones))))
native_v=seam_vectors(native,dt,stride)
report["nativeTemporalNorms"]=norms(native_v).tolist()
# Acceleration discontinuity: difference of consecutive velocity differences
# on either side of the actual tiled join, not a velocity threshold.
def native_accel(seq):
    samples=[sample_pose(seq[k]) for k in (0,1,2,-3,-2)]
    p=[x[0] for x in samples];q=[Rotation.from_quat(x[1][:,[1,2,3,0]]) for x in samples]
    left=(p[0]+stride-2*p[4]+p[3])/(dt*dt)
    right=(p[2]-2*p[1]+p[0])/(dt*dt)
    aleft=((q[0]*q[4].inv()).as_rotvec()-(q[4]*q[3].inv()).as_rotvec())/(dt*dt)
    aright=((q[2]*q[1].inv()).as_rotvec()-(q[1]*q[0].inv()).as_rotvec())/(dt*dt)
    return norms(np.vstack([right-left,aright-aleft])).tolist()
report["accelerationJumpDiagnostic"]={"baseline":native_accel(bases),"r6":native_accel(r6_pose["poses"]),"r8":native_accel(corrected),"units":"m/s^2 for root, rad/s^2 for joints; no new acceleration gate"}
if np.any(norms(native_v)>caps[None,:]):report["failures"].append("NATIVE_VELOCITY_SEAM")
report["status"]="CONTACT_SCREEN_PASS" if not report["failures"] else "CONTACT_SCREEN_FAIL"
report["baselineWorstFloorM"]=min(x["floorMinM"] for x in rows)
report["correctedWorstFloorM"]=min(x["floorMinM"] for x in after)
report["baselineFailedFrames"]=sum(x["floorMinM"]<-.005 for x in rows)
report["correctedFailedFrames"]=sum(x["floorMinM"]<-.005 for x in after)
save()
# Three actual world-space cycles, duplicate endpoint omitted at each join.
# Recheck translated native skin and the fixed anchor targets for every sample.
scene=bpy.context.scene;scene.render.resolution_percentage=60
count=len(corrected)-1
focus=F.Y.inverted()@F.world(t,corrected[0])[root].translation + F.Y.inverted()@Vector(stride*1.5)
focus.z=floor+h*.50
side=F.Y.inverted()@Vector(np.cross(velocity,[0,1,0]))
side.normalize()
cam.location=focus+(side*3+Vector((0,0,.2)))*h
cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.ortho_scale=max(h*1.65,h+3*report["expectedTravelM"])*1.1
tiled=[]
for cycle in range(3):
    for k in range(count):
        f=copy.deepcopy(corrected[k]);f[root]["p"]=(np.asarray(f[root]["p"])+cycle*stride).tolist()
        B.apply_checked(arm,bones,rest,f)
        pts=np.array([list(v) for v in F.surface(skin.reg)])
        gap=float(pts[:,1].min()-floor)
        failures=[]
        if gap<-.005:failures.append("FLOOR")
        for key,d in anchors.items():
            if k not in d:continue
            ids,p=d[k];delta=pts[ids].mean(axis=0)-p-cycle*stride
            if np.linalg.norm(delta[[0,2]])>.02 or abs(delta[1])>.02:failures.append("PLANT_"+key.upper())
        tiled.append({"cycle":cycle,"phase":k,"floorMinM":gap,"failures":failures})
        name=f"side-{cycle*count+k:03}-corrected.png";scene.render.filepath=str(OUT/name)
        bpy.ops.render.render(write_still=True);assert (OUT/name).stat().st_size>0
        report["renders"].append(name)
report["threeCycleNativeReplay"]=tiled
if any(x["failures"] for x in tiled):report["failures"].append("TILED_CONTACT")
report["status"]="CONTACT_SCREEN_PASS" if not report["failures"] else "CONTACT_SCREEN_FAIL"
# A fixed one-stride close camera, in addition to the three-cycle world view,
# is needed for artistic inspection of limb poses on a successful candidate.
if not report["failures"]:
    focus=F.Y.inverted()@F.world(t,corrected[count//2])[root].translation
    focus.z=floor+h*.50
    cam.location=focus+(side*3+Vector((0,0,.2)))*h
    cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler()
    cam.data.ortho_scale=max(h*1.65,h+report["expectedTravelM"])*1.1
    for k in range(count):
        B.apply_checked(arm,bones,rest,corrected[k])
        name=f"close-{k:03}.png";scene.render.filepath=str(OUT/name)
        bpy.ops.render.render(write_still=True);assert (OUT/name).stat().st_size>0
        report["renders"].append(name)
import subprocess,imageio_ffmpeg
movie=OUT/"corrected-three-cycles.mp4"
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-y","-framerate",str(source["fps"]),"-i",str(OUT/"side-%03d-corrected.png"),"-vf","pad=ceil(iw/2)*2:ceil(ih/2)*2","-c:v","libx264","-pix_fmt","yuv420p",str(movie)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
assert movie.stat().st_size>0
report["renders"].append(movie.name)
save();print(report["status"],report["failures"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
