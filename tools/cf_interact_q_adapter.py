"""01C R2: frozen Q data, one generic time/placement adapter for two cases."""
import pathlib,json,hashlib,math
import numpy as np
from mathutils import Vector
import cf_anim_fbik as F
import cf_anim_pilot as P
FPS=24;MAX_STEP=.35
def read_pinned(root,name,sha):
    b=(pathlib.Path(root)/name).read_bytes();assert hashlib.sha256(b).hexdigest()==sha,(name,"Q artifact mismatch")
    return json.loads(b)
def angle_step(frames):
    peak=0.
    for a,b in zip(frames,frames[1:]):
        for u,v in zip(a,b):
            q=F.matrix(u["p"],u["r"]).to_quaternion();r=F.matrix(v["p"],v["r"]).to_quaternion()
            peak=max(peak,2*math.acos(min(1.,abs(q.dot(r)))))
    return peak
def interp(frames,n):
    out=[]
    for k in range(n+1):
        v=k*(len(frames)-1)/n;i=min(int(v),len(frames)-2);u=v-i
        out.append(P.interpolate(frames[i],frames[i+1],u))
    return out
def prepare(plan,data,solved,t,key):
    root="input-q"
    report=read_pinned(root,"report.json","71a49f15e0970865353bdbc1d8c9c30a754b8012c523116b81c003558f3d97a1")
    source=read_pinned(root,"qualified-source.json","90bac04570f0650e6578e80a8d1c6b4dfc8b6c423533200fd572b04364ab423e")
    assert report["counts"]=={"RIGID_REPLAY_CANDIDATE":5,"NO_RIGID_DEPTH_SOLUTION":3}
    row=next(r for r in report["cases"] if r["rig"]==key and r["fixture"]==plan["fixture"])
    assert row["assetSha"]==plan["asset"]["assetSha"]
    candidate=row["candidate"];assert row["status"]=="RIGID_REPLAY_CANDIDATE" and candidate
    lo,hi=candidate["intervalM"];d=candidate["deltaM"]
    assert lo<d<hi and abs(d-(lo+hi)/2)<1e-8 and candidate["supportFraction"]>=plan["action"]["minSupportFraction"]
    # No identity-specific corrections. Exact previously computed interval only;
    # depth candidate is calibrated on R1 and is not held-out validation.
    raw=data["sources"][plan["action"]["sourceKey"]]
    assert raw["names"]==source["names"] and raw["parents"]==source["parents"]
    pairs,_=F.finger_map(raw,t)
    clips={};trace={}
    for name in ("Sitting_Enter","Sitting_Exit"):
        c=raw["clips"][name];qualified=source["clips"][name]
        assert abs(qualified["duration"]*FPS-(len(qualified["frames"])-1))<1e-7
        assert angle_step(qualified["frames"])<=MAX_STEP
        fs=F.clone(solved[key][name]["variants"]["upf_common"]);assert len(fs)==len(c["frames"])
        for f,sf in zip(fs,c["frames"]):F.fingers(raw,t,sf,f,pairs)
        # Re-evaluate retargeted joint motion independently: preserving sequence
        # and shortest-arc interpolation, only extend time, never individual rotations.
        peak=angle_step(fs);n=max(len(qualified["frames"])-1,math.ceil(peak*(len(fs)-1)/MAX_STEP))
        target=interp(fs,n);assert angle_step(target)<=MAX_STEP+1e-6
        # Same normalized source phase, now sampled at the final target times.
        ss=interp(c["frames"],n);ws=[F.world(raw,f) for f in ss]
        ys=[F.pos(w,raw["roles"]["hip"]).y for w in ws];mn,mx=min(ys),max(ys);assert mx-mn>.08
        weights=[F.smooth((mx-y)/(mx-mn)) for y in ys]
        foot={}
        for side in ("l","r"):
            windows,w=F.contact_windows([list(F.pos(v,raw["roles"]["foot_"+side])) for v in ws],1/FPS,.035)
            foot[side]=w.tolist()
        clips[name]=(target,weights,foot)
        trace[name]={"sourceQualifiedDurationS":qualified["duration"],"targetDurationS":n/FPS,"rawTargetMaxStepRad":peak,"targetMaxStepRad":angle_step(target),"frames":n+1}
    a,wa,fa=clips["Sitting_Enter"];b,wb,fb=clips["Sitting_Exit"]
    hip=t["roles"]["hip"];delta=F.pos(F.world(t,a[-1]),hip)-F.pos(F.world(t,b[0]),hip);delta.y=0
    for f in b:F.move_root(t,f,hip,delta)
    # Same bridge shape as R1; analytic rate bound from smoothstep derivative.
    seam=angle_step([a[-1],b[0]]);bridgeN=max(12,math.ceil(1.5*seam/MAX_STEP))
    bridge=[P.interpolate(a[-1],b[0],F.smooth(i/bridgeN)) for i in range(1,bridgeN+1)]
    holdN=bridgeN+12
    frames=a+bridge+[F.clone(b[0]) for _ in range(12)]+b[1:]
    weights=wa+[1.]*holdN+wb[1:]
    fw={side:fa[side]+[1.]*holdN+fb[side][1:] for side in ("l","r")}
    maxstep=angle_step(frames);assert maxstep<=MAX_STEP+1e-6,(maxstep,"pre-solve action rate")
    info={"QArtifact":15127027624,"depth":candidate,"retargetTiming":trace,"bridgeFrames":bridgeN,"preSolveMaxJointStepRad":maxstep,
      "scope":"calibrated Q replay zone, not general eligibility or balance certification"}
    return frames,weights,(len(a)-1,len(a)+holdN-1),fw,info
