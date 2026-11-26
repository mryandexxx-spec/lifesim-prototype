"""01C-POSE: realize PATH targets on real rigs and screen actual skin; no new solver."""
import pathlib,sys,json,math,hashlib,collections
import numpy as np
import bpy
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(pathlib.Path("frozen-fbik/tools").resolve()))
import cf_anim_fbik as F
from cf_anim_contacts import aim,setrot
import cf_interact_qualify as Q
OUT=pathlib.Path("artifacts/cf-interact-01c-pose");OUT.mkdir(parents=True,exist_ok=True)
SIDES=("l","r");STEP=.35;EPS=.005
def read(path,sha):
    b=path.read_bytes();assert hashlib.sha256(b).hexdigest()==sha
    return json.loads(b)
def v(x):return Vector(x)
def role(t,w,name):return w[t["roles"][name]].translation.copy()
def avg(a,b):return (a+b)*.5
def maxstep(a,b):
    return max(2*math.acos(min(1.,abs(F.matrix(u["p"],u["r"]).to_quaternion().dot(F.matrix(v["p"],v["r"]).to_quaternion())))) for u,v in zip(a,b))
def descendants(t,root):
    result={root}
    for i,p in enumerate(t["parents"]):
        if p in result:result.add(i)
    return result
def load_bench(name,asset):
    path=pathlib.Path("input-01a")/(name+".glb");raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==asset["assetSha"]
    g,acc=Q.decode(raw)
    verts=[];tris=[]
    for primitive in g["meshes"][0]["primitives"]:
        pos=acc(primitive["attributes"]["POSITION"]);idx=acc(primitive["indices"]).reshape(-1,3)
        tris.extend(tuple(map(int,r+len(verts))) for r in idx);verts.extend(v(x) for x in pos)
    return BVHTree.FromPolygons(verts,tris,all_triangles=True),path
def support(t,w,regions,cloud,asset,top,native_to_sem):
    pts=[np.array([list(x) for x in F.surface(regions["pelvis"])])]
    for side in SIDES:
        a=role(t,w,"thigh_"+side);b=role(t,w,"shin_"+side)
        axis=np.array(list(b-a));p=np.array([list(x) for x in F.surface(regions["thigh_"+side])])
        f=(p-np.array(list(a)))@axis/(axis@axis)
        pts.append(p[(f>=-.25)&(f<=.55)])
    p=np.concatenate(pts);low=float(np.quantile(p[:,1],.10));p=p[(p[:,1]>=low-.025)&(p[:,1]<=low+.025)]
    local=np.array([list(native_to_sem@v(q)) for q in p])
    hit=np.zeros(len(p),bool)
    for r in asset["regions"]:
        hit|=(local[:,0]>=r["minX"])&(local[:,0]<=r["maxX"])&(local[:,2]>=r["minZ"])&(local[:,2]<=r["maxZ"])
    gap=float(np.quantile(p[hit,1]-top,.10)) if hit.any() else None
    return gap,float(hit.mean()) if len(hit) else 0.
def region(meshes,name):
    out=[]
    for o in meshes:
        ids={g.index for g in o.vertex_groups if g.name==name}
        ix=[v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in ids)>.5]
        if ix:out.append((o,ix))
    assert out,name
    return out
def case(c,r,t,source,solved,asset):
    key=c["rig"];path=pathlib.Path("prior-full")/(key+".glb");assert F.digest(path)==r["revision"]==c["rigSha"]
    arm,bones=F.import_rig(path);F.reset(arm,bones);rest=F.locals_(arm,bones,True)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
    skin=F.WeightedSkin(t,meshes,arm,bones);F.apply(arm,bones,rest,t["rest"]);assert skin.actual_error(t["rest"])["max_m"]<.002
    # A single authored seated pose provides pelvic orientation and twist;
    # all limb position targets come from the geometry plan. Upper body is
    # intentionally static during this proof, not an accepted animation.
    idx=r["poses"]["Sitting_Enter"]["index"]
    ref=F.clone(solved[key]["Sitting_Enter"]["variants"]["upf_common"][idx])
    pairs,_=F.finger_map(source,t);F.fingers(source,t,source["clips"]["Sitting_Enter"]["frames"][idx],ref,pairs)
    F.apply(arm,bones,rest,ref);assert skin.actual_error(ref)["max_m"]<.002
    rw=F.world(t,ref);_,front=F.seat_axes(t,rw)
    yaw=math.radians(asset["frontYaw"]);sem=Matrix.Rotation(yaw,3,"Y");inv=sem.inverted()
    rot=Matrix.Rotation(yaw-math.atan2(front.x,front.z),4,"Y")
    base=F.encode([rot@F.matrix(b["p"],b["r"]) if t["parents"][i]<0 else F.matrix(b["p"],b["r"]) for i,b in enumerate(ref)])
    # Flat-foot orientations and toe locals from neutral, canonical facing
    # inferred from the horizontal anatomical left-minus-right hip axis.
    nw=F.world(t,t["rest"]);right=role(t,nw,"thigh_l")-role(t,nw,"thigh_r");right.y=0;right.normalize()
    nf=right.cross(Vector((0,1,0))).normalized()
    nrot=Matrix.Rotation(yaw-math.atan2(nf.x,nf.z),3,"Y").to_quaternion()
    foot_q={s:nrot@nw[t["roles"]["foot_"+s]].to_quaternion() for s in SIDES}
    for s in SIDES:
        foot=t["roles"]["foot_"+s]
        for j in descendants(t,foot)-{foot}:base[j]=F.clone(t["rest"][j])
    regs={"pelvis":F.regions(meshes,t)}
    for s in SIDES:
        regs[s]=F.regions(meshes,t,s);regs["thigh_"+s]=region(meshes,t["names"][t["roles"]["thigh_"+s]])
    bvh,_=load_bench(c["fixture"],asset);floor=asset["floorY"];top=asset["seatY"]
    rows=[];fails=set();prev=None;frames=c["path"]["frames"];assert len(frames)==76
    for i,row in enumerate(frames):
        f=F.clone(base);w=F.world(t,f)
        target={s:{k:sem@v(row["legs"][s][k]) for k in ("hip","knee","ankle")} for s in SIDES}
        mid=avg(*[target[s]["hip"] for s in SIDES]);cur=avg(*[role(t,w,"thigh_"+s) for s in SIDES])
        F.move_root(t,f,t["roles"]["hip"],mid-cur)
        w=F.world(t,f)
        hiperr=max((role(t,w,"thigh_"+s)-target[s]["hip"]).length for s in SIDES)
        assert hiperr<.002,("rigid hip pair mismatch",hiperr)
        for s in SIDES:
            a,b,e=[t["roles"][n+"_"+s] for n in ("thigh","shin","foot")]
            w=F.world(t,f);aim(t,f,a,b,target[s]["knee"]-F.pos(w,a))
            w=F.world(t,f);aim(t,f,b,e,target[s]["ankle"]-F.pos(w,b))
            setrot(t,f,e,foot_q[s])
        w=F.world(t,f)
        error=max((role(t,w,n+"_"+s)-target[s][k]).length for s in SIDES for n,k in (("thigh","hip"),("shin","knee"),("foot","ankle")))
        assert error<.002,("planned target mismatch",error)
        try:
            F.apply(arm,bones,rest,f)
        except AssertionError as ex:
            fails.add("POSE_REPLAY")
            rows.append({"frame":i,"phase":row["phase"],"targetMaxM":error,"replayError":str(ex)})
            break
        replay=skin.actual_error(f);assert replay["max_m"]<.002
        cloud=np.array([list(p) for p in F.surface(skin.reg)])
        local=np.array([list(inv@v(x)) for x in cloud]);deep=int(Q.interior_mask(local,asset["regions"],top-.1,top).sum())
        floor_min=float(cloud[:,1].min()-floor)
        sole={s:F.sole(regs[s])-floor for s in SIDES}
        gap,fraction=support(t,w,regs,cloud,asset,top,inv)
        step=0. if prev is None else maxstep(prev,f)
        if deep:fails.add("SLAT_INTERIOR")
        if floor_min<-EPS:fails.add("FLOOR_PENETRATION")
        if step>STEP:fails.add("JOINT_STEP")
        if row["phase"]=="hold":
            if gap is None or gap<-.005 or gap>.025:fails.add("HOLD_SUPPORT")
            if any(abs(x)>.02 for x in sole.values()):fails.add("HOLD_SOLE")
        # BVH oriented nearest triangle distance is diagnostic only, including
        # backrest/legs; it is not watertight containment or swept collision.
        signed=0.;neg=0
        for x in cloud:
            hit,n,_,d=bvh.find_nearest(v(x))
            if hit is not None and d<.08:
                sd=(v(x)-hit).dot(n);signed=min(signed,sd);neg+=int(sd<-.005)
        rows.append({"frame":i,"phase":row["phase"],"targetMaxM":error,"skinReplay":replay,
            "floorMinM":floor_min,"soleGapsM":sole,"slatInteriorVertices":deep,"supportGapM":gap,
            "supportSampleFraction":fraction,"maxJointStepRad":step,"nearTriangleSignedMinM":signed,"nearTriangleNegativeCount":neg})
        prev=f
    return {"rig":key,"fixture":c["fixture"],"slot":c["slot"],"rigSha":c["rigSha"],"assetSha":c["assetSha"],
      "plannedFrames":len(frames),"evaluatedFrames":sum("skinReplay" in r for r in rows),
      "status":"LOWER_BODY_SCREEN_PASS" if not fails else "LOWER_BODY_SCREEN_FAIL","failures":sorted(fails),"samples":rows}
def main():
    report=read(pathlib.Path("input-path/report.json"),"7f71ed67b9244896a99300c75da465d4d58038a28eb96c31859b278f77f15630")
    assert report["counts"]=={"SEAT_TOO_HIGH":12,"PATH_CANDIDATE":24}
    root=pathlib.Path("input-01b/artifacts/cf-interact-01b")
    d=read(root/"rig-action-passports.json","298c13ca48cb650cd342afe245c21e3ea42174de07a52972261bf513e48fc70c")
    m=read(root/"eligibility-matrix.json","38452dfb5edb2f822ed942f56d2f3786c29fb23f3fdaeba70884eaed71842840")
    data=F.read("input.json");solved=F.read("solved.json");inv=F.read("semantic-inventory.json")
    for k,s in data["sources"].items():s["roles"]=inv["sources"][k]["map"]
    for k,t in data["targets"].items():t["roles"]=inv["targets"][k]["map"]
    source=data["sources"][d["action"]["sourceKey"]]
    fixtures={f["name"]:f["asset"] for f in m["fixtures"]}
    # Both sexes and both heights; formerly rejected female central profile.
    selected={("female-grid_201-100","candidate45","left"),("male-grid_021-100","heldout42","right")}
    cases=[c for c in report["cases"] if (c["rig"],c["fixture"],c["slot"]) in selected]
    assert len(cases)==2 and all(c["status"]=="PATH_CANDIDATE" for c in cases)
    out={"stage":"01C-POSE","R12Executed":False,"physicalAcceptance":"BLOCKED","cases":[],
      "scope":["Static seated pelvis and upper-body reference, exact planned lower-body targets, fixed neutral feet",
       "All sampled real skin frames; no source style integration, no hand/COM/anatomy/obstacle/swept collision/ART/device acceptance"]}
    for c in cases:
        key=c["rig"];row=case(c,d["rigs"][key],data["targets"][key],source,solved,fixtures[c["fixture"]]);out["cases"].append(row)
        print(key,row["status"],row["failures"],row["evaluatedFrames"],flush=True)
        (OUT/"report.json").write_text(json.dumps(out,indent=2,allow_nan=False))
    out["counts"]=dict(collections.Counter(c["status"] for c in out["cases"]))
    (OUT/"report.json").write_text(json.dumps(out,indent=2,allow_nan=False))
    print("01C-POSE",out["counts"],"FULL 01C BLOCKED",flush=True)
if __name__=="__main__":main()
