"""01C-REPLAY: frozen R12, output timing qualification, full native videos and bake replay."""
import pathlib,sys,json,math,hashlib,collections,tempfile,subprocess,shutil
import numpy as np
import bpy
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0,str(pathlib.Path("frozen-fbik/tools").resolve()))
import cf_anim_fbik as F
from cf_anim_contacts import aim,setrot
import cf_interact_qualify as Q
import cf_interact_path as P
sys.path.insert(0,str(pathlib.Path("prior-pilot/tools").resolve()))
import cf_anim_pilot as A
OUT=pathlib.Path("artifacts/cf-interact-01c-replay");OUT.mkdir(parents=True,exist_ok=True)
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
def at_time(poses,x):
    k=int(round(x))
    if abs(x-k)<1e-9:return F.clone(poses[k])
    j=int(math.floor(x));return A.interpolate(poses[j],poses[j+1],x-j)

def rate_map(poses):
    assert len(poses)==76
    times=[0.];phases=["lower"];timing=[]
    for phase,lo,hi in (("lower",0,38),("hold",38,50),("rise",50,75)):
        n=hi-lo
        peak=max(maxstep(poses[j-1],poses[j]) for j in range(lo+1,hi+1))
        count=max(n,math.ceil(n*peak/(STEP-1e-6)))
        timing.append({"phase":phase,"sourceStart":lo,"sourceEnd":hi,"sourceSteps":n,
            "sourcePeakRad":peak,"outputSteps":count})
        if count>2*n:return None,None,timing
        times.extend(lo+n*k/count for k in range(1,count+1))
        phases.extend([phase]*count)
    assert times[0]==0 and times[-1]==75 and all(a<b for a,b in zip(times,times[1:]))
    return times,phases,timing

def timing_controls():
    # Synthetic rotation sequence checks that a too-fast phase extends,
    # endpoints are retained and no already-qualified phase is shortened.
    from mathutils import Quaternion
    poses=[]
    for i in range(76):
        angle=.36*max(0,i-50)
        q=Quaternion((1,0,0),angle)
        poses.append([{"p":[0,0,0],"r":[q.x,q.y,q.z,q.w]}])
    times,phases,timing=rate_map(poses)
    assert times is not None and 38 in times and 50 in times and 75 in times
    assert [x["outputSteps"] for x in timing]==[38,12,26],timing
    out=[at_time(poses,x) for x in times]
    assert max(maxstep(a,b) for a,b in zip(out,out[1:]))<=STEP
    assert out[0]==poses[0] and out[-1]==poses[-1]
    print("Output timing controls PASS",flush=True)

def case(c,r,t,source,solved,asset,profile,accepted,style_report,prior_fbik):
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
    frames=c["path"]["frames"];assert len(frames)==76
    def realize(row,dy,style):
        f=F.clone(base);w=F.world(t,f)
        target={}
        for s in SIDES:
            q=row["legs"][s];h=np.array(q["hip"],dtype=float);h[1]+=dy
            a=np.array(q["ankle"],dtype=float)
            p=profile[s];k=P.knee(h,a,p["thighM"],p["shinM"])
            if k is None:return None,"LEG_REACH"
            target[s]={n:sem@v(x) for n,x in (("hip",h),("knee",k),("ankle",a))}
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
        for j in upper:f[j]["r"]=F.clone(style[j]["r"])
        w=F.world(t,f)
        error=max((role(t,w,n+"_"+s)-target[s][k]).length for s in SIDES for n,k in (("thigh","hip"),("shin","knee"),("foot","ankle")))
        assert error<.002,("planned target mismatch",error)
        return measure(f,error)
    def measure(f,error):
        w=F.world(t,f)
        try:
            F.apply(arm,bones,rest,f)
        except AssertionError:
            return None,"POSE_REPLAY"
        replay=skin.actual_error(f);assert replay["max_m"]<.002
        cloud=np.array([list(p) for p in F.surface(skin.reg)])
        local=np.array([list(inv@v(x)) for x in cloud]);deep=int(Q.interior_mask(local,asset["regions"],top-.1,top).sum())
        floor_min=float(cloud[:,1].min()-floor)
        sole={s:F.sole(regs[s])-floor for s in SIDES}
        gap,fraction=support(t,w,regs,cloud,asset,top,inv)
        palms={}
        for s in SIDES:
            pts=F.surface(regs["thigh_"+s]);tree=KDTree(len(pts))
            for k,p in enumerate(pts):tree.insert(p,k)
            tree.balance();palms[s]=float(np.quantile([tree.find(p)[2] for p in F.surface(hands[s])],.10))
        return (f,cloud,{"palmP10M":palms,"targetMaxM":error,"skinReplay":replay,"floorMinM":floor_min,
            "soleGapsM":sole,"slatInteriorVertices":deep,"supportGapM":gap,"supportSampleFraction":fraction}),None
    def classify(m,hold):
        failed=[]
        if m["slatInteriorVertices"]:failed.append("SLAT_INTERIOR")
        if m["floorMinM"]<-EPS:failed.append("FLOOR_PENETRATION")
        if hold:
            gap=m["supportGapM"]
            if gap is None or gap<-.005 or gap>.025:failed.append("HOLD_SUPPORT")
            if m["supportSampleFraction"]<.5:failed.append("HOLD_SUPPORT_FRACTION")
            if any(abs(x)>.02 for x in m["soleGapsM"].values()):failed.append("HOLD_SOLE")
        return failed
    original=c["path"]
    assert accepted["status"]=="LOWER_BODY_SCREEN_PASS" and accepted["evaluatedFrames"]==76
    for field in ("rig","fixture","slot","rigSha","assetSha"):assert accepted[field]==c[field],field
    slot=next(s for s in asset["slots"] if s["id"]==c["slot"])
    z=accepted["selectedDepthM"];delta=accepted["selectedHoldDeltaM"]
    if abs(z-original["anchor"][2])<1e-8:path=original
    else:
        status,path=P.plan_at(r,profile,asset,slot,top-.10,top,z,38,25)
        assert status=="PATH_CANDIDATE" and path is not None
    for s in SIDES:assert np.max(np.abs(np.array(path["footAnchors"][s])-np.array(accepted["selectedFootAnchors"][s])))<1e-8
    assert abs(path["anchor"][2]-z)<1e-8
    frames=path["frames"]
    common={"rig":key,"fixture":c["fixture"],"slot":c["slot"],"rigSha":c["rigSha"],"assetSha":c["assetSha"],
      "plannedFrames":76,"selectedDepthM":z,"selectedFootAnchors":path["footAnchors"]}
    upper=descendants(t,t["roles"]["hip"])-{t["roles"]["hip"]}
    for s in SIDES:upper-=descendants(t,t["roles"]["thigh_"+s])
    assert upper and all(t["roles"]["hand_"+s] in upper for s in SIDES)
    hands={s:A.palm_region(meshes,t,s) for s in SIDES}
    def clip(name,n):
        src=source["clips"][name]["frames"]
        fs=F.clone(solved[key][name]["variants"]["upf_common"]);assert len(fs)==len(src) and len(fs)>1
        for f,sf in zip(fs,src):F.fingers(source,t,sf,f,pairs)
        result=[]
        for i in range(n+1):
            u=i*(len(fs)-1)/n;j=min(int(u),len(fs)-2)
            result.append(A.interpolate(fs[j],fs[j+1],u-j))
        return result
    enter=clip("Sitting_Enter",38);exit=clip("Sitting_Exit",25)
    bridge=[A.interpolate(enter[-1],exit[0],F.smooth(i/12)) for i in range(1,13)]
    style=enter+bridge+exit[1:]
    assert len(style)==len(frames)==76
    common["upperBodyBones"]=[t["names"][j] for j in sorted(upper)]
    stand=np.array(path["standingHipCenter"]);seated=np.array(path["seatedHipCenter"])
    direction=seated-stand;den=float(direction@direction);assert den>0
    # Reconstruct the exact pre-solve style poses and compare with pinned evidence.
    for field in ("rig","fixture","slot","rigSha","assetSha"):assert style_report[field]==c[field],field
    assert style_report["status"]=="STYLE_SCREEN_FAIL" and style_report["failures"]==["HOLD_PALM"]
    bases=[];goals=[];baseline=[]
    for i,row in enumerate(frames):
        u=float((np.array(row["pelvisCenter"])-stand)@direction/den)
        dy=delta*min(1.,max(0.,u))
        result,reason=realize(row,dy,style[i]);assert result is not None,reason
        f,cloud,m=result
        old=style_report["samples"][i];assert old["phase"]==row["phase"]
        assert m["slatInteriorVertices"]==old["slatInteriorVertices"]==0
        assert abs(m["supportSampleFraction"]-old["supportSampleFraction"])<.001
        if m["supportGapM"] is None:assert old["supportGapM"] is None
        else:assert abs(m["supportGapM"]-old["supportGapM"])<.001
        assert all(abs(m["palmP10M"][s]-old["palmP10M"][s])<.001 for s in SIDES)
        bases.append(f);baseline.append(m);w=F.world(t,f)
        # Keep the same goal layout across frames. R12 tasks are soft;
        # lower-body drift is measured independently after the solve.
        names=["hip"]+[n+"_"+s for s in SIDES for n in ("thigh","shin","foot")]
        g={t["roles"][name]:w[t["roles"][name]].copy() for name in names}
        weight=F.smooth(min(1.,max(0.,(u-.70)/.30)))
        for s in SIDES:
            hand=t["roles"]["hand_"+s];p=w[hand].translation.copy();q=w[hand].to_quaternion()
            if weight>0:
                a=role(t,w,"thigh_"+s);b=role(t,w,"shin_"+s);axis=b-a
                candidates=[v for v in F.surface(regs["thigh_"+s]) if .35<=(v-a).dot(axis)/axis.length_squared<=.65]
                assert candidates
                mid=a+axis*.5;level=float(np.quantile([v.y for v in candidates],.8))
                target=min((v for v in candidates if v.y>=level),key=lambda v:(v-mid).length)
                pq,pc=F.palm(t,w,s,False)
                yy=axis.normalized();up=Vector((0,1,0));zz=(up-yy*up.dot(yy)).normalized()
                if (pq@Vector((0,0,1))).dot(zz)<0:zz=-zz
                xx=yy.cross(zz).normalized();zz=xx.cross(yy).normalized()
                want=Matrix((xx,yy,zz)).transposed().to_quaternion();dq=want@pq.inverted()
                p=p.lerp(target+up*.012+dq@(p-pc),weight);q=q.slerp(dq@q,weight)
            g[hand]=F.transform(p,q)
        goals.append(g)
    loX=min(x["minX"] for x in asset["regions"]);hiX=max(x["maxX"] for x in asset["regions"])
    loZ=min(x["minZ"] for x in asset["regions"]);hiZ=max(x["maxZ"] for x in asset["regions"])
    slab=(sem@Vector(((loX+hiX)/2,top-.05,(loZ+hiZ)/2)),sem@Vector((1,0,0)),sem@Vector((0,0,1)),hiX-loX,hiZ-loZ,top)
    corrected,stats=F.trajectory(t,bases,goals,skin,floor,slab,1/24)
    assert len(corrected)==len(bases)==76
    common["solver"]=stats;common["frozenFbik"]="6974fc7e91ee2b089bde79c701eee946da142b51"
    # Reproduce the original two exact R12 controls before modifying timing.
    if prior_fbik is not None:
        assert prior_fbik["evaluatedFrames"]==76 and prior_fbik["solver"]["executed"]
        lower=["hip"]+[n+"_"+s for s in SIDES for n in ("thigh","shin","foot")]
        for j,f in enumerate(corrected):
            w=F.world(t,f);bw=F.world(t,bases[j])
            drift={name:(role(t,w,name)-role(t,bw,name)).length for name in lower}
            checked,reason=measure(f,max(drift.values()));assert checked is not None,reason
            _,_,m=checked;old=prior_fbik["samples"][j]
            assert m["slatInteriorVertices"]==old["slatInteriorVertices"]
            assert all(abs(m["palmP10M"][s]-old["palmP10M"][s])<.001 for s in SIDES)
            assert all(abs(drift[k]-old["lowerBodyDriftM"][k])<.001 for k in lower)
            step=0. if j==0 else maxstep(corrected[j-1],f)
            assert abs(step-old["maxJointStepRad"])<.002
        common["originalR12Control"]=prior_fbik["status"]
    times,phases,timing=rate_map(corrected)
    common["timing"]=timing
    if times is None:
        return {**common,"selectedHoldDeltaM":delta,"evaluatedFrames":0,
            "status":"REPLAY_SCREEN_FAIL","failures":["RATE_BUDGET"],"samples":[],"rendered":[]}
    common["plannedFrames"]=len(times);common["originalFrames"]=76
    common["durationS"]=(len(times)-1)/24
    rows=[];fails=set();prev=None;poses={};hold_feet={}
    if not stats["executed"]:fails.add("SOLVER_NOT_EXECUTED")
    for i,(time,phase) in enumerate(zip(times,phases)):
        j=min(int(time),74);weight=time-j
        center=(1-weight)*np.array(frames[j]["pelvisCenter"])+weight*np.array(frames[j+1]["pelvisCenter"])
        u=float((center-stand)@direction/den)
        assert -1e-8<=u<=1+1e-8
        dy=delta*min(1.,max(0.,u))
        f=at_time(corrected,time);bf=at_time(bases,time)
        w=F.world(t,f);bw=F.world(t,bf)
        if abs(time-round(time))<1e-9:bm=baseline[int(round(time))]
        else:
            checked,reason=measure(bf,0.);assert checked is not None,reason
            _,_,bm=checked
        lower=["hip"]+[n+"_"+s for s in SIDES for n in ("thigh","shin","foot")]
        drift={name:(role(t,w,name)-role(t,bw,name)).length for name in lower}
        if max(drift.values())>.02:fails.add("LOWER_BODY_DRIFT")
        result,reason=measure(f,max(drift.values()))
        if result is None:
            fails.add(reason)
            rows.append({"frame":i,"sourceFrame":time,"phase":phase,"heightDeltaM":dy,"failure":reason})
            break
        f,cloud,m=result
        error=m["targetMaxM"];replay=m["skinReplay"];floor_min=m["floorMinM"];sole=m["soleGapsM"]
        deep=m["slatInteriorVertices"];gap=m["supportGapM"];fraction=m["supportSampleFraction"]
        fails.update(classify(m,phase=="hold"))
        w=F.world(t,f);slide={}
        if phase=="hold":
            for s in SIDES:
                foot=role(t,w,"foot_"+s);foot.y=0
                if s not in hold_feet:hold_feet[s]=foot.copy()
                slide[s]=(foot-hold_feet[s]).length
                if slide[s]>.02:fails.add("HOLD_SLIDE")
                if m["palmP10M"][s]>.03:fails.add("HOLD_PALM")
        poses[i]=F.clone(f)
        step=0. if prev is None else maxstep(prev,f)
        if deep:fails.add("SLAT_INTERIOR")
        if floor_min<-EPS:fails.add("FLOOR_PENETRATION")
        if step>STEP:fails.add("JOINT_STEP")
        if phase=="hold":
            if gap is None or gap<-.005 or gap>.025:fails.add("HOLD_SUPPORT")
            if any(abs(x)>.02 for x in sole.values()):fails.add("HOLD_SOLE")
        # BVH oriented nearest triangle distance is diagnostic only, including
        # backrest/legs; it is not watertight containment or swept collision.
        signed=0.;neg=0
        for x in cloud:
            hit,n,_,d=bvh.find_nearest(v(x))
            if hit is not None and d<.08:
                sd=(v(x)-hit).dot(n);signed=min(signed,sd);neg+=int(sd<-.005)
        rows.append({"frame":i,"sourceFrame":time,"phase":phase,"heightDeltaM":dy,"targetMaxM":error,"skinReplay":replay,
            "floorMinM":floor_min,"soleGapsM":sole,"slatInteriorVertices":deep,"supportGapM":gap,
            "supportSampleFraction":fraction,"palmP10M":m["palmP10M"],"baselinePalmP10M":bm["palmP10M"],"lowerBodyDriftM":drift,"holdFootSlideM":slide,"maxJointStepRad":step,"nearTriangleSignedMinM":signed,"nearTriangleNegativeCount":neg})
        prev=f
    # Full native videos on actual furniture, then bake/reimport only on measured pass.
    rendered=[]
    if len(poses)!=len(times):fails.add("INCOMPLETE_PATH")
    try:
        F.apply(arm,bones,rest,t["rest"]);h,_=F.setup(meshes)
        fixture=pathlib.Path("input-01a")/(c["fixture"]+".glb")
        assert F.digest(fixture)==c["assetSha"]
        bpy.ops.import_scene.gltf(filepath=str(fixture.resolve()))
        cam=bpy.context.scene.camera
        target=F.Y.inverted()@(sem@Vector((slot["anchorX"],floor+h*.48,z)))
        for view,offset in (("quarter",Vector((1.7,.9,3.0))),("side",Vector((3.,.7,0.)))):
            cam.location=target+F.Y.inverted()@(sem@offset)*h
            cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler()
            cam.data.ortho_scale=h*1.65
            if len(poses)!=len(times):break
            with tempfile.TemporaryDirectory() as tmp:
                for i,f in sorted(poses.items()):
                    F.apply(arm,bones,rest,f)
                    image=pathlib.Path(tmp)/f"{i:03d}.png"
                    bpy.context.scene.render.filepath=str(image)
                    bpy.ops.render.render(write_still=True);assert image.stat().st_size>0
                    if i in (0,len(times)-1) or i in [k for k in range(len(times)) if times[k] in (38,50)]:
                        name=f"{key}-{view}-{i:03d}.png";shutil.copyfile(image,OUT/name);rendered.append(name)
                name=f"{key}-{view}.mp4"
                subprocess.run([F.get_ffmpeg_exe(),"-y","-loglevel","error","-framerate","24","-i",tmp+"/%03d.png",
                    "-c:v","libx264","-pix_fmt","yuv420p",str(OUT/name)],check=True)
                assert (OUT/name).stat().st_size>0;rendered.append(name)
    except Exception as ex:
        fails.add("RENDER_FAIL");common["renderError"]=str(ex)
    if not fails:
        try:
            ordered=[poses[i] for i in range(len(times))]
            name=f"{key}-avatar.glb";common["export"]=A.bake(arm,bones,rest,meshes,ordered,OUT/name)
            common["exportReimport"]=A.verify_reimport(OUT/name,t,ordered)
            if not common["exportReimport"]["within_2mm"]:fails.add("EXPORT_REPLAY")
        except Exception as ex:
            common["exportError"]=str(ex);fails.add("EXPORT_FAIL")
    return {**common,"selectedHoldDeltaM":delta,"evaluatedFrames":sum("skinReplay" in r for r in rows),
      "status":"REPLAY_SCREEN_PASS" if not fails else "REPLAY_SCREEN_FAIL","failures":sorted(fails),"samples":rows,"rendered":rendered}
def main():
    timing_controls()
    report=read(pathlib.Path("input-path/report.json"),"7f71ed67b9244896a99300c75da465d4d58038a28eb96c31859b278f77f15630")
    assert report["counts"]=={"SEAT_TOO_HIGH":12,"PATH_CANDIDATE":24}
    baseline=read(pathlib.Path("input-coupled/report.json"),"8147117ceb184f5ae878d28e2ad95e110a57d4953739bafca0c7aa0f2570e5bb")
    assert baseline["counts"]=={"LOWER_BODY_SCREEN_PASS":4}
    prior=read(pathlib.Path("input-style/report.json"),"30ceae6c4b2f04630bcd70b6d33b4470efd5f6468438bcbfcbdb044584002f09")
    assert prior["counts"]=={"STYLE_SCREEN_FAIL":4}
    styles={(x["rig"],x["fixture"],x["slot"]):x for x in prior["cases"]}
    old=read(pathlib.Path("input-fbik/report.json"),"b89b20377e8be0b28c338866f9e83cb8b4ed626397c0c152bdb1d53caabda1f4")
    assert old["counts"]=={"FBIK_SCREEN_PASS":1,"FBIK_SCREEN_FAIL":1}
    old_cases={(x["rig"],x["fixture"],x["slot"]):x for x in old["cases"]}
    accepted={(x["rig"],x["fixture"],x["slot"]):x for x in baseline["cases"]}
    root=pathlib.Path("input-01b/artifacts/cf-interact-01b")
    d=read(root/"rig-action-passports.json","298c13ca48cb650cd342afe245c21e3ea42174de07a52972261bf513e48fc70c")
    m=read(root/"eligibility-matrix.json","38452dfb5edb2f822ed942f56d2f3786c29fb23f3fdaeba70884eaed71842840")
    data=F.read("input.json");solved=F.read("solved.json");inv=F.read("semantic-inventory.json")
    for k,s in data["sources"].items():s["roles"]=inv["sources"][k]["map"]
    for k,t in data["targets"].items():t["roles"]=inv["targets"][k]["map"]
    source=data["sources"][d["action"]["sourceKey"]]
    fixtures={f["name"]:f["asset"] for f in m["fixtures"]}
    # Both sexes and both heights; formerly rejected female central profile.
    selected={("female-grid_201-100","candidate45","left"),("male-grid_021-100","heldout42","right"),
              ("female-grid_201-110","heldout42","right"),("male-grid_021-90","candidate45","left")}
    cases=[c for c in report["cases"] if (c["rig"],c["fixture"],c["slot"]) in selected]
    assert len(cases)==4 and all(c["status"]=="PATH_CANDIDATE" for c in cases)
    out={"stage":"01C-REPLAY","R12Requested":True,"physicalAcceptance":"BLOCKED","cases":[],
      "scope":["Exact STYLE baselines, frozen R12 weighted trajectory, semantic palm goals and lower body drift screen",
       "Phase output-rate qualification, actual skin screen, full native videos and conditional GLB reimport; no COM/anatomy/true obstacle containment/swept collision or device acceptance"]}
    for c in cases:
        key=c["rig"];row=case(c,d["rigs"][key],data["targets"][key],source,solved,fixtures[c["fixture"]],report["profiles"][key],accepted[(key,c["fixture"],c["slot"])],styles[(key,c["fixture"],c["slot"])],old_cases.get((key,c["fixture"],c["slot"])));out["cases"].append(row)
        print(key,row["status"],row["failures"],row["evaluatedFrames"],flush=True)
        (OUT/"report.json").write_text(json.dumps(out,indent=2,allow_nan=False))
    out["counts"]=dict(collections.Counter(c["status"] for c in out["cases"]))
    (OUT/"report.json").write_text(json.dumps(out,indent=2,allow_nan=False))
    print("01C-REPLAY",out["counts"],"FULL 01C BLOCKED",flush=True)
if __name__=="__main__":main()
