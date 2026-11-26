"""01C-PATH: contact-first lower-body geometric path planning; no pose bake or R12 solve."""
import pathlib,sys,json,math,hashlib,collections
import numpy as np
import bpy
from mathutils import Vector
sys.path.insert(0,str(pathlib.Path("frozen-fbik/tools").resolve()))
import cf_anim_fbik as F
import cf_interact_qualify as Q

OUT=pathlib.Path("artifacts/cf-interact-01c-path")
OUT.mkdir(parents=True,exist_ok=True)
SIDES=("l","r")
FPS=24;STEP=.35;MARGIN=.005;GRID=.01
SOURCE=pathlib.Path("assets/furniture/of-r2/garden.bench-new.glb")
def load(path,sha):
    b=path.read_bytes();assert hashlib.sha256(b).hexdigest()==sha,(path,"SHA")
    return json.loads(b)
def pos(t,w,role):
    return np.array(list(F.pos(w,t["roles"][role])),dtype=float)
def xyz(v):return np.array(v,dtype=float)
def norm(v):return float(np.linalg.norm(v))
def points(region):
    a=np.array([list(v) for v in F.surface(region)],dtype=float)
    assert a.ndim==2 and a.shape[1]==3 and len(a)>0 and np.isfinite(a).all()
    return a
def weighted_region(meshes,names):
    out=[]
    for o in meshes:
        ids={g.index for g in o.vertex_groups if g.name in names}
        ix=[v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in ids)>.5]
        if ix:out.append((o,ix))
    assert out,names
    return out
def radius_to_segment(pts,a,b):
    v=b-a;u=np.clip((pts-a)@v/(v@v),0.,1.)
    return float(np.max(np.linalg.norm(pts-(a+u[:,None]*v),axis=1)))
def measure(r):
    path=pathlib.Path("prior-full")/(r["id"]+".glb")
    assert F.digest(path)==r["revision"]
    t={**r,"rest":r["bind"],"sha256":r["revision"]}
    arm,bones=F.import_rig(path);F.reset(arm,bones);assert [b.name for b in bones]==t["names"]
    rest=F.locals_(arm,bones,True)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
    F.apply(arm,bones,rest,t["rest"]);w=F.world(t,t["rest"])
    allp=points([(o,list(range(len(o.data.vertices)))) for o in meshes])
    floor=float(allp[:,1].min());assert abs(floor-r["floorY"])<.002
    out={}
    for s in SIDES:
        h,k,a=[pos(t,w,n+"_"+s) for n in ("thigh","shin","foot")]
        shin=points(weighted_region(meshes,{t["names"][t["roles"]["shin_"+s]]}))
        foot=points(F.regions(meshes,t,s))
        radius=radius_to_segment(shin,k,a)
        footprint=float(np.linalg.norm((foot-a)[:,[0,2]],axis=1).max())
        drop=float(a[1]-foot[:,1].min())
        lengths=r["segments"][s]
        assert abs(norm(h-k)-lengths["thighM"])<.002 and abs(norm(k-a)-lengths["shinM"])<.002
        assert abs(drop-lengths["neutralSoleDropM"])<.002
        assert min(radius,footprint,drop)>.001
        out[s]={"neutralHipY":float(h[1]-floor),"neutralSoleDropM":drop,"shinRadiusM":radius,
                "footHorizontalRadiusM":footprint,"shinVertexCount":len(shin),"footVertexCount":len(foot),
                "thighM":lengths["thighM"],"shinM":lengths["shinM"]}
    return out
def knee(h,a,l1,l2):
    v=a-h;d=norm(v)
    # Strictly within the two-bone annulus; no length clamp, no stretch.
    if d<=abs(l1-l2)+1e-8 or d>=l1+l2-1e-8:return None
    e=v/d;along=(l1*l1-l2*l2+d*d)/(2*d);rad2=l1*l1-along*along
    if rad2<=0:return None
    front=np.array([0.,0.,1.]);pole=front-e*(front@e);pn=norm(pole)
    if pn<1e-8:return None
    k=h+e*along+pole/pn*math.sqrt(rad2)
    assert abs(norm(h-k)-l1)<1e-8 and abs(norm(k-a)-l2)<1e-8
    return k
def segment_hits_box(a,b,lo,hi):
    # Slab method: expanded AABB is conservative for a swept-radius capsule.
    # Touch counts as blocked; no collision of the actual skinned mesh is claimed.
    low,high=0.,1.
    for j,d in enumerate(b-a):
        if abs(d)<1e-12:
            if a[j]<lo[j] or a[j]>hi[j]:return False
        else:
            u,v=sorted(((lo[j]-a[j])/d,(hi[j]-a[j])/d))
            low=max(low,u);high=min(high,v)
            if low>high:return False
    return True
def direction_angle(a,b):
    return math.acos(float(np.clip((a@b)/(norm(a)*norm(b)),-1.,1.)))
def prepare_fixture(f):
    a=f["asset"];name=f["name"]
    raw=(SOURCE if name=="native" else pathlib.Path("input-01a")/(name+".glb")).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==a["assetSha"]
    g,acc=Q.decode(raw)
    wood=[acc(p["attributes"]["POSITION"]) for p in g["meshes"][0]["primitives"] if g["materials"][p["material"]]["name"]=="Honey oak"]
    bottom=float(np.concatenate(wood)[:,1].min());top=float(a["seatY"])
    assert abs(top-bottom-.10)<1e-5
    return bottom,top
def phase_samples(nin,nout):
    # Fixed floor anchors through the complete lower/hold/rise path.
    for i in range(nin+1):
        u=i/nin;yield "lower",u*u*(3-2*u)
    for i in range(12):yield "hold",1.
    for i in range(1,nout+1):
        u=1-i/nout;yield "rise",u*u*(3-2*u)
def plan_at(r,profile,asset,slot,bottom,top,z,nin,nout):
    floor=asset["floorY"];anchor=np.array([slot["anchorX"],top,z])
    pose=r["poses"]["Sitting_Enter"];regions=asset["regions"]
    front=max(v["maxZ"] for v in regions)
    seated={s:anchor+xyz(pose["limbs"][s]["hip"]) for s in SIDES}
    center=np.mean(list(seated.values()),axis=0);off={s:seated[s]-center for s in SIDES}
    feet={}
    for s in SIDES:
        q=profile[s];v=anchor+xyz(pose["limbs"][s]["ankle"])
        # Explicit planted sole anchor, not following retargeted ankle motion.
        # Front clearance is derived from actual foot envelope and furniture.
        v[1]=floor+q["neutralSoleDropM"]
        v[2]=max(v[2],front+q["footHorizontalRadiusM"]+MARGIN)
        feet[s]=v
    stand=np.mean(list(feet.values()),axis=0)
    # Standing hip target uses measured neutral height, limited by reach with
    # a shared 5mm reserve against singular straight-leg extension.
    maxy=[]
    for s in SIDES:
        q=profile[s];dxz=(stand+off[s]-feet[s])[[0,2]]
        reach=q["thighM"]+q["shinM"]-MARGIN
        rad=reach*reach-dxz@dxz
        if rad<=0:return "STAND_REACH",None
        maxy.append(feet[s][1]+math.sqrt(rad)-off[s][1])
    neutral=floor+float(np.mean([profile[s]["neutralHipY"] for s in SIDES]))
    stand[1]=min(neutral,*maxy)
    if stand[1]<=center[1]:return "STAND_BELOW_SEAT",None
    # Identical pelvis offset vectors at every sample (rigid hip pair).
    rows=[];prev={};maxstep=0.
    for phase,u in phase_samples(nin,nout):
        pelvis=(1-u)*stand+u*center;legs={}
        for s in SIDES:
            q=profile[s];h=pelvis+off[s];a=feet[s]
            k=knee(h,a,q["thighM"],q["shinM"])
            if k is None:return "LEG_REACH",None
            rad=q["shinRadiusM"]+MARGIN
            for box in regions:
                lo=np.array([box["minX"],bottom,box["minZ"]])-rad
                hi=np.array([box["maxX"],top,box["maxZ"]])+rad
                if segment_hits_box(k,a,lo,hi):return "SHIN_ENVELOPE_BLOCKED",None
            dirs=(k-h,a-k)
            if s in prev:
                maxstep=max(maxstep,*(direction_angle(a,b) for a,b in zip(dirs,prev[s])))
            prev[s]=dirs
            legs[s]={"hip":h.tolist(),"knee":k.tolist(),"ankle":a.tolist(),"solePlaneY":floor}
        assert abs(norm(xyz(legs["l"]["hip"])-xyz(legs["r"]["hip"]))-norm(off["l"]-off["r"]))<1e-8
        rows.append({"phase":phase,"pelvisCenter":pelvis.tolist(),"legs":legs})
    if maxstep>STEP:return "SEGMENT_DIRECTION_STEP",None
    return "PATH_CANDIDATE",{"anchor":anchor.tolist(),"standingHipCenter":stand.tolist(),
       "standingHeightReductionM":neutral-stand[1],"seatedHipCenter":center.tolist(),
       "footAnchors":{s:v.tolist() for s,v in feet.items()},"maxSegmentDirectionStepRad":maxstep,
       "frames":rows,"phases":["approach OPEN","plant","lower","hold","rise","release OPEN"]}
def solve_case(r,profile,f,slot,bottom,top,action,nin,nout):
    a=f["asset"];regions=a["regions"];x=slot["anchorX"];z=slot["anchorZ"]
    # Preserve ordinary seat height exclusion; new path can legitimately
    # revisit fixed-anchor support rejection using unchanged .5 criterion.
    if top-a["floorY"]>r["maxFlatKneeHeight"]+1e-8:
        return {"status":"SEAT_TOO_HIGH"}
    intervals=Q.feasible_depth([[slot["region"]["minZ"]-z,slot["region"]["maxZ"]-z]],x,z,
          r["supportWidth"],r["supportDepth"],regions,action["minSupportFraction"])
    if not intervals:return {"status":"NO_SUPPORT_INTERVAL","intervalsM":[]}
    depths=set()
    for lo,hi in intervals:
        # Fixed resolution for all assets/rigs. Include interval endpoints
        # and midpoint; no searching over animation rotations or offsets.
        n=max(1,math.ceil((hi-lo)/GRID))
        depths.update(float(z+d) for d in np.linspace(lo,hi,n+1))
        depths.add(float(z+(lo+hi)/2))
        if lo<=0<=hi:depths.add(float(z))
    failures=collections.Counter();ok=[]
    for d in sorted(depths):
        fraction=Q.support_fraction(d,x,r["supportWidth"],r["supportDepth"],regions)
        if fraction<action["minSupportFraction"]-1e-8:continue
        status,result=plan_at(r,profile,a,slot,bottom,top,d,nin,nout)
        if not result:failures[status]+=1;continue
        result["rectangularSupportFraction"]=fraction
        ok.append(result)
    if not ok:return {"status":"NO_PATH_CANDIDATE","supportIntervalsM":intervals,"sampledDepthCount":len(depths),"failures":dict(failures)}
    # Choose the closest viable geometry location to the semantic slot
    # origin, not the most forward location or best-looking frame.
    best=min(ok,key=lambda p:(abs(p["anchor"][2]-z),-p["rectangularSupportFraction"],p["anchor"][2]))
    return {"status":"PATH_CANDIDATE","supportIntervalsM":intervals,"sampledDepthCount":len(depths),
            "candidateCount":len(ok),"failures":dict(failures),"path":best}
def tests():
    h=xyz([0,.6,0]);a=xyz([0,.1,.2])
    k=knee(h,a,.4,.4);assert k is not None and k[2]>h[2]
    assert knee(h,xyz([0,-1,0]),.4,.4) is None
    lo=xyz([-.1,0,-.1]);hi=xyz([.1,.2,.1])
    assert segment_hits_box(xyz([0,-.1,0]),xyz([0,.3,0]),lo,hi)
    assert not segment_hits_box(xyz([0,-.1,.2]),xyz([0,.3,.2]),lo,hi)
    assert segment_hits_box(xyz([0,0,.1]),xyz([0,.2,.1]),lo,hi)
    rows=list(phase_samples(38,25));assert len(rows)==76 and rows[0][1]==rows[-1][1]==0 and max(v for _,v in rows)==1
    print("Analytical geometry and phase controls PASS",flush=True)
def main():
    tests()
    root=pathlib.Path("input-01b/artifacts/cf-interact-01b")
    d=load(root/"rig-action-passports.json","298c13ca48cb650cd342afe245c21e3ea42174de07a52972261bf513e48fc70c")
    m=load(root/"eligibility-matrix.json","38452dfb5edb2f822ed942f56d2f3786c29fb23f3fdaeba70884eaed71842840")
    q=load(pathlib.Path("input-q/qualified-source.json"),"90bac04570f0650e6578e80a8d1c6b4dfc8b6c423533200fd572b04364ab423e")
    nin=len(q["clips"]["Sitting_Enter"]["frames"])-1;nout=len(q["clips"]["Sitting_Exit"]["frames"])-1
    assert (nin,nout)==(38,25)
    assert len(d["rigs"])==6 and len(m["fixtures"])==3
    measured={k:measure(r) for k,r in sorted(d["rigs"].items())}
    fixtures=[(f,*prepare_fixture(f)) for f in m["fixtures"]];cases=[]
    for f,bottom,top in fixtures:
        for key,r in sorted(d["rigs"].items()):
            for slot in f["asset"]["slots"]:
                row=solve_case(r,measured[key],f,slot,bottom,top,d["action"],nin,nout)
                row.update({"rig":key,"fixture":f["name"],"slot":slot["id"],"assetSha":f["asset"]["assetSha"],"rigSha":r["revision"]})
                if f["name"]=="native":assert row["status"]=="SEAT_TOO_HIGH"
                cases.append(row);print(key,f["name"],slot["id"],row["status"],flush=True)
    assert len(cases)==36
    report={"stage":"01C-PATH","R12Executed":False,"physicalAcceptance":"BLOCKED","profiles":measured,"cases":cases,
      "counts":dict(collections.Counter(v["status"] for v in cases)),
      "limits":{"fps":FPS,"segmentDirectionStepRad":STEP,"marginM":MARGIN,"depthResolutionM":GRID,"supportFraction":d["action"]["minSupportFraction"]},
      "scope":["Actual neutral shin/foot vertex envelopes and measured segment lengths; simplified capsule broad-phase against actual slat boxes",
        "Sampled 3D lower-body joint positions with fixed feet and rigid hip spacing; not real pose or full skin replay",
        "Foot orientations, anatomical joint rotations/limits, full body and obstacle sweep, COM, support, hands, approach/release, ART and device OPEN",
        "No previous R1/R2 depth offsets; no per-rig corrections; no new solver or animation bake"]}
    (OUT/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    print("01C-PATH",report["counts"],"FULL 01C BLOCKED",flush=True)
if __name__=="__main__":main()
