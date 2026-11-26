"""01C-SOURCE-PHASE: one source-informed transition candidate, frozen seated/foot contacts.
Uses validated pose caches, no R12 solve, no geometry search or rendering.
"""
import json,pathlib,math,sys,hashlib
import numpy as np
from mathutils import Vector,Matrix
from mathutils.kdtree import KDTree
import bpy
import cf_interact_balance as B
F=B.F;P=B.P;A=B.A;Q=B.Q
SIDES=B.SIDES
OUT=pathlib.Path("artifacts/cf-interact-01c-source-phase");OUT.mkdir(parents=True,exist_ok=True)
PINS={
"female-grid_201-100":("c2b1306fe71fa434a57c79d0a9ded83986afaefd8027395e808b90d0eeb757a8","d96f4072b70e7a571736244a128f91d53b61e5f12a936d489d3b2753ce69967c"),
"male-grid_021-90":("c1d81529a95ba6f337663c4bdfda40ec1281d72397edb9e5bddf7cde1eaa2a5d","af47150d743f75a9d61d7c601a66be4bd7875a26795f721d7928dbb96bc1274e"),
"female-grid_201-110":("12752a6ac96b469e7c20d18ccd8e9c722651eb705a9d8637b7ab6813e13fd482","dfb2953e80303450532d5015baa19cfe594c0b603c790ecdf7dab7f0b03e3c2b"),
"male-grid_021-100":("df620c9df014b7a146950996f3cc33050528636bfd2372150a20f650ade28ea0","bd45b8419c805e6ff5268a90e0d2d7c48e91055d25d5d9abc1d70cf786cb77bf")}
def role(t,w,n):return B.role(t,w,n)
def mid(t,w,prefix):return B.avg(*[role(t,w,prefix+"_"+s) for s in SIDES])
def axis_map(x,a,b,c,d):
    assert abs(b-a)>1e-4,("degenerate source excursion",a,b)
    return c+(x-a)*(d-c)/(b-a)
def controls():
    assert abs(axis_map(.25,0.,1.,2.,6.)-3)<1e-12
    assert abs(axis_map(-.5,0.,1.,2.,6.)-0)<1e-12
    assert abs(axis_map(.5,1.,0.,6.,2.)-4)<1e-12
    print("Source phase mapping controls PASS",flush=True)
def main():
    controls()
    assert len(sys.argv)==2
    key=sys.argv[1];rsha,csha=PINS[key]
    prior=B.read(pathlib.Path("input-balance/report.json"),rsha)["cases"][0]
    cache=B.read(pathlib.Path("input-balance/pose-cache.json"),csha)
    assert prior["status"]=="BALANCE_DIAGNOSTIC_COMPLETE" and prior["poseCacheSha256"]==csha
    assert cache["schema"]=="01C-pose-cache-v1" and cache["rig"]==prior["rig"]==key
    for name in ("rigSha","assetSha","fixture","slot"):assert cache[name]==prior[name]
    t={"sha256":cache["rigSha"],"names":cache["boneNames"],"parents":cache["parents"],"roles":cache["roles"],"rest":cache["neutral"]}
    neutral=F.world(t,t["rest"]);hip=t["roles"]["hip"]
    eligibility=B.read(pathlib.Path("input-01b/artifacts/cf-interact-01b/eligibility-matrix.json"),"38452dfb5edb2f822ed942f56d2f3786c29fb23f3fdaeba70884eaed71842840")
    asset=next(f["asset"] for f in eligibility["fixtures"] if f["name"]==cache["fixture"])
    assert asset["assetSha"]==cache["assetSha"]
    B.load_bench(cache["fixture"],asset)
    path=pathlib.Path("prior-full")/(key+".glb");assert F.digest(path)==cache["rigSha"]
    arm,bones=F.import_rig(path);F.reset(arm,bones);rest=F.locals_(arm,bones,True)
    assert [b.name for b in bones]==t["names"]
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
    skin=F.WeightedSkin(t,meshes,arm,bones);B.apply_checked(arm,bones,rest,t["rest"])
    assert skin.actual_error(t["rest"])["max_m"]<.002
    regs={"pelvis":F.regions(meshes,t)}
    for s in SIDES:
        regs[s]=F.regions(meshes,t,s);regs["thigh_"+s]=B.region(meshes,t["names"][t["roles"]["thigh_"+s]])
    hands={s:A.palm_region(meshes,t,s) for s in SIDES}
    top=asset["seatY"];floor=asset["floorY"]
    sem=Matrix.Rotation(math.radians(asset["frontYaw"]),3,"Y");inv=sem.inverted()
    style=cache["sourceStyle"];base=cache["preRateBase"];solved=cache["preRateSolved"]
    assert len(style)==len(base)==len(solved)==76
    times=cache["times"];phases=cache["phases"];output=cache["output"]
    assert len(times)==len(phases)==len(output)==prior["evaluatedFrames"]
    # One rigid alignment derived from the same seated source pose used by the prior path.
    align=(F.world(t,base[38])[hip].to_quaternion()@F.world(t,style[38])[hip].to_quaternion().inverted()).normalized()
    upper=B.descendants(t,hip)-{hip}
    for s in SIDES:upper-=B.descendants(t,t["roles"]["thigh_"+s])
    def source_rel(w):return inv@(align@(mid(t,w,"thigh")-mid(t,w,"foot")))
    def solved_mid(j):return inv@mid(t,F.world(t,solved[j]),"thigh")
    source_ends={j:source_rel(F.world(t,style[j])) for j in (0,38,50,75)}
    solved_ends={j:solved_mid(j) for j in (0,38,50,75)}
    lengths={s:((role(t,neutral,"thigh_"+s)-role(t,neutral,"shin_"+s)).length,(role(t,neutral,"shin_"+s)-role(t,neutral,"foot_"+s)).length) for s in SIDES}
    def candidate(time,old):
        if 38-1e-8<=time<=50+1e-8:return F.clone(old),0.,None
        lo,hi=(0,38) if time<38 else (50,75)
        src=B.at_time(style,time);sw=F.world(t,src);ow=F.world(t,old)
        rel=source_rel(sw);a,b=source_ends[lo],source_ends[hi];c,d=solved_ends[lo],solved_ends[hi]
        target=inv@mid(t,ow,"thigh")
        for axis in (1,2):target[axis]=axis_map(rel[axis],a[axis],b[axis],c[axis],d[axis])
        # Blend toward the already solved pose as geometric seated height is approached.
        u=(rel.y-a.y)/(b.y-a.y)
        seat_weight=u if time<38 else 1-u
        weight=F.smooth(min(1.,max(0.,(seat_weight-.70)/.30)))
        f=F.clone(old)
        for j in upper:
            q=F.matrix(src[j]["p"],src[j]["r"]).to_quaternion().slerp(F.matrix(old[j]["p"],old[j]["r"]).to_quaternion(),weight)
            f[j]["r"]=[q.x,q.y,q.z,q.w]
        B.setrot(t,f,hip,(align@sw[hip].to_quaternion()).slerp(ow[hip].to_quaternion(),weight))
        F.move_root(t,f,hip,sem@target-mid(t,F.world(t,f),"thigh"))
        for s in SIDES:
            a,b,e=[t["roles"][n+"_"+s] for n in ("thigh","shin","foot")]
            w=F.world(t,f);h=np.array(inv@F.pos(w,a));ankle=np.array(inv@F.pos(ow,e))
            k=P.knee(h,ankle,*lengths[s])
            if k is None:return None,None,"LEG_REACH"
            B.aim(t,f,a,b,sem@Vector(k)-F.pos(w,a))
            w=F.world(t,f);B.aim(t,f,b,e,F.pos(ow,e)-F.pos(w,b))
            B.setrot(t,f,e,ow[e].to_quaternion())
        w=F.world(t,f)
        err=max((role(t,w,"foot_"+s)-role(t,ow,"foot_"+s)).length for s in SIDES)
        return f,err,None
    rows=[];fails=set();prev=None;poses=[];hold_feet={}
    for i,(time,phase,old) in enumerate(zip(times,phases,output)):
        base_row=prior["samples"][i];assert base_row["frame"]==i and abs(base_row["sourceFrame"]-time)<1e-8
        f,err,reason=candidate(time,old)
        row={"frame":i,"sourceFrame":time,"phase":phase,"baselineBalance":base_row["balance"]}
        bad=[]
        if reason:
            bad.append(reason);poses.append(None);prev=None
        else:
            B.apply_checked(arm,bones,rest,f)
            w=F.world(t,f);cloud=np.array([list(p) for p in F.surface(skin.reg)])
            replay=skin.actual_error(f);assert replay["max_m"]<.002
            local=np.array([list(inv@Vector(p)) for p in cloud])
            deep=int(Q.interior_mask(local,asset["regions"],top-.1,top).sum())
            floor_min=float(cloud[:,1].min()-floor)
            gap,fraction=B.support(t,w,regs,cloud,asset,top,inv)
            sole={s:F.sole(regs[s])-floor for s in SIDES};palms={};slides={}
            hold=phase=="hold"
            for s in SIDES:
                pts=F.surface(regs["thigh_"+s]);tree=KDTree(len(pts))
                for k,p in enumerate(pts):tree.insert(p,k)
                tree.balance();palms[s]=float(np.quantile([tree.find(p)[2] for p in F.surface(hands[s])],.1))
                if hold:
                    foot=role(t,w,"foot_"+s);foot.y=0
                    if s not in hold_feet:hold_feet[s]=foot.copy()
                    slides[s]=(foot-hold_feet[s]).length
            step=0. if prev is None else B.maxstep(prev,f)
            if err>.002:bad.append("ANKLE_REPLAY")
            if deep:bad.append("SLAT_INTERIOR")
            if floor_min<-.005:bad.append("FLOOR_PENETRATION")
            if step>.35:bad.append("JOINT_STEP")
            if hold:
                if gap is None or gap<-.005 or gap>.025:bad.append("HOLD_SUPPORT")
                if fraction<.5:bad.append("HOLD_SUPPORT_FRACTION")
                if any(abs(x)>.02 for x in sole.values()):bad.append("HOLD_SOLE")
                if any(x>.02 for x in slides.values()):bad.append("HOLD_SLIDE")
                if any(x>.03 for x in palms.values()):bad.append("HOLD_PALM")
            if 38-1e-8<=time<=50+1e-8:
                assert f==old
                assert deep==base_row["slatInteriorVertices"] and abs(fraction-base_row["supportSampleFraction"])<.001
            row.update({"balance":B.balance_metrics(t,w,neutral,regs,asset,top,floor,inv),
                "ankleReplayM":err,"skinReplay":replay,"floorMinM":floor_min,"slatInteriorVertices":deep,
                "supportGapM":gap,"supportSampleFraction":fraction,"soleGapsM":sole,"palmP10M":palms,
                "holdFootSlideM":slides,"maxJointStepRad":step})
            prev=f;poses.append(f)
        row["failures"]=bad;fails.update(bad);rows.append(row)
    result={"stage":"01C-SOURCE-PHASE","rig":key,"rigSha":cache["rigSha"],"assetSha":cache["assetSha"],
        "cacheSha":csha,"R12Executed":False,"physicalAcceptance":"BLOCKED","status":"SOURCE_PHASE_DIAGNOSTIC_COMPLETE",
        "scope":"Single source-informed transition with exact cached seated poses and ankle anchors; centroid/hull proxies, not dynamic balance or ART.",
        "originalFailures":prior["failures"],"failures":sorted(fails),"plannedFrames":len(times),
        "evaluatedFrames":sum(p is not None for p in poses),"samples":rows}
    (OUT/"report.json").write_text(json.dumps(result,allow_nan=False,indent=2))
    (OUT/"candidate-poses.json").write_text(json.dumps({"rig":key,"inputCacheSha":csha,"times":times,"phases":phases,"poses":poses},allow_nan=False,separators=(",",":")))
    print(key,result["status"],result["evaluatedFrames"],result["failures"],flush=True)
if __name__=="__main__":main()
