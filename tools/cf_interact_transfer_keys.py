"""Phase-aware transfer boundary keys on pinned poses; one bounded proxy solve and native replay.
Two seat-free boundary samples, NOT seat load, dynamic stability, full trajectory or ART acceptance.
"""
import json,pathlib,math,sys,hashlib,traceback
import numpy as np
import bpy
from mathutils import Vector,Matrix
from scipy.spatial import ConvexHull
from scipy.spatial.transform import Rotation
from scipy.optimize import minimize
import cf_interact_balance as B
import cf_interact_stance as S
F=B.F;P=B.P;Q=B.Q
SIDES=B.SIDES
OUT=pathlib.Path("artifacts/cf-interact-01c-transfer-keys");OUT.mkdir(parents=True,exist_ok=True)
def proxy(r,c,a,profile,asset):
    roles=c["roles"];w=S.world(a["poses"],c["parents"])
    src=np.array([s["balance"]["centroidProjectionXZ"] for s in r["samples"]])
    assert asset["frontYaw"]==180
    w[:,:,[0,2]]*=-1
    err=float(np.max(np.abs(S.centroid(w,roles)[:,[0,2]]-src)));assert err<.0002
    rows=r["samples"]
    inds=[max(i for i,s in enumerate(rows) if s["phase"]=="lower" and not s["balance"]["possibleSeatPoints"]),
          min(i for i,s in enumerate(rows) if s["phase"]=="rise" and not s["balance"]["possibleSeatPoints"])]
    x=w[inds].copy()
    ix=lambda k:[roles[k+"_l"],roles[k+"_r"]]
    h0=x[:,ix("thigh")].copy();a0=x[:,ix("foot")].copy();hip=x[:,roles["hip"]].copy()
    lengths=np.array([[profile[s]["thighM"],profile[s]["shinM"]] for s in SIDES])
    L=float(min(lengths.sum(axis=1)));radii=np.array([profile[s]["shinRadiusM"]+.005 for s in SIDES])
    hull=[rows[i]["balance"]["feetOnly"]["hull"] for i in inds];eqs=[ConvexHull(hu).equations for hu in hull]
    upper=[roles["head"]]+[roles[k+"_"+s] for s in SIDES for k in ("upperarm","forearm","hand")]
    front=max(b["maxZ"] for b in asset["regions"]);top=asset["seatY"];bottom=top-.1
    def calc(v):
        shift=np.array([[0,v[1],v[2]],[0,v[4],v[5]]]);pitch=v[[3,6]]
        h=h0+shift[:,None];a=a0.copy();a[:,:,2]+=v[0]
        delta=a-h;d=np.linalg.norm(delta,axis=-1);e=delta/np.maximum(d[...,None],1e-10)
        along=(lengths[:,0]**2-lengths[:,1]**2+d*d)/(2*np.maximum(d,1e-10));rad2=lengths[:,0]**2-along**2
        pole=np.array([0,0,1.])-e*e[...,2,None];pn=np.linalg.norm(pole,axis=-1)
        k=h+e*along[...,None]+pole/np.maximum(pn[...,None],1e-10)*np.sqrt(np.maximum(rad2,0))[...,None]
        ww=x.copy();ww[:,roles["hip"]]+=shift
        m=Rotation.from_rotvec(np.stack([pitch,np.zeros(2),np.zeros(2)],axis=1)).as_matrix()
        ww[:,upper]=hip[:,None]+shift[:,None]+np.einsum("nij,nkj->nki",m,x[:,upper]-hip[:,None])
        ww[:,ix("thigh")]=h;ww[:,ix("shin")]=k;ww[:,ix("foot")]=a
        com=S.centroid(ww,roles)
        pts=k[:,:,None]+(a-k)[:,:,None]*np.linspace(0,1,41)[None,None,:,None]
        z=pts[...,2]-front-radii[None,:,None];below=bottom-radii[None,:,None]-pts[...,1];above=pts[...,1]-top-radii[None,:,None]
        clearance=np.max(np.stack([z,below,above]),axis=0).min(axis=2)
        return d,pn,com,clearance,h,k,a
    def groups(v):
        d,pn,com,clear,h,k,a=calc(v)
        support=np.concatenate([-(e[:,:2]@(com[j,[0,2]]-np.array([0,v[0]]))+e[:,2])-.005 for j,e in enumerate(eqs)])
        return {"outerReachM":lengths.sum(axis=1)-.005-d,
                "innerReachM":d-np.abs(lengths[:,0]-lengths[:,1])-.005,"poleReserve":pn-.0001,
                "supportReserveM":support,"sampledShinClearanceM":clear}
    def cons(v):return np.concatenate([g.ravel() for g in groups(v).values()])
    def cost(v):return float((v[0]/L)**2+np.sum((v[[1,2,4,5]]/L)**2)+.1*np.sum(v[[3,6]]**2))
    lean=np.radians([rows[i]["balance"]["trunkLeanDeg"] for i in inds])
    bounds=[(-L/4,L/4),(0,L/8),(-L/4,L/4),(0,max(0,np.radians(50)-lean[0])),
            (0,L/8),(-L/4,L/4),(0,max(0,np.radians(50)-lean[1]))]
    fit=minimize(cost,np.zeros(7),method="SLSQP",bounds=bounds,constraints={"type":"ineq","fun":cons},options={"maxiter":120,"ftol":1e-10})
    minima=lambda v:{k:float(g.min()) for k,g in groups(v).items()}
    after=minima(fit.x);assert np.isfinite(fit.x).all() and all(math.isfinite(v) for v in after.values())
    feasible=bool(fit.success and min(after.values())>=-1e-6)
    return inds,fit.x,{"feasible":feasible,"success":bool(fit.success),"iterations":int(fit.nit),"message":str(fit.message),
        "objective":float(fit.fun),"minimumBefore":minima(np.zeros(7)),"minimumAfter":after,"fkReplayM":err,
        "bounds":[list(p) for p in bounds],"parameters":fit.x.tolist(),"frames":inds}
def native(t,cache,asset,profile,source,inds,values):
    key=cache["rig"];path=pathlib.Path("prior-full")/(key+".glb");assert F.digest(path)==cache["rigSha"]
    arm,bones=F.import_rig(path);F.reset(arm,bones);rest=F.locals_(arm,bones,True)
    assert [b.name for b in bones]==t["names"]
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
    skin=F.WeightedSkin(t,meshes,arm,bones);B.apply_checked(arm,bones,rest,t["rest"])
    assert skin.actual_error(t["rest"])["max_m"]<.002
    neutral=F.world(t,t["rest"]);hip=t["roles"]["hip"]
    regs={"pelvis":F.regions(meshes,t)}
    for s in SIDES:
        regs[s]=F.regions(meshes,t,s);regs["thigh_"+s]=B.region(meshes,t["names"][t["roles"]["thigh_"+s]])
    sem=Matrix.Rotation(math.radians(asset["frontYaw"]),3,"Y");inv=sem.inverted()
    top=asset["seatY"];floor=asset["floorY"]
    B.load_bench(cache["fixture"],asset)
    def mid(w):return B.avg(*[B.role(t,w,"thigh_"+s) for s in SIDES])
    rows=[];poses={}
    for j,i in enumerate(inds):
        row={"event":("before_seat_on","after_seat_off")[j],"sourceFrame":source["times"][i],"frame":i,"failures":[]}
        try:
            old=source["poses"][i];ow=F.world(t,old);f=F.clone(old)
            y,z,pitch=values[1+3*j:4+3*j]
            target=mid(ow)+sem@Vector((0,y,z))
            dq=Matrix.Rotation(float(pitch),3,sem@Vector((1,0,0))).to_quaternion()
            B.setrot(t,f,hip,dq@ow[hip].to_quaternion());F.move_root(t,f,hip,target-mid(F.world(t,f)))
            ankles={};shin_blocked=[];reserve=[]
            for s in SIDES:
                a,b,e=[t["roles"][k+"_"+s] for k in ("thigh","shin","foot")]
                w=F.world(t,f);h=np.array(inv@F.pos(w,a));ankle=np.array(inv@F.pos(ow,e));ankle[2]+=values[0]
                q=profile[s];l1,l2=q["thighM"],q["shinM"]
                d=np.linalg.norm(ankle-h);reserve.append(float(min(l1+l2-d,d-abs(l1-l2))))
                k=P.knee(h,ankle,l1,l2)
                if k is None:raise ValueError("LEG_REACH")
                rad=q["shinRadiusM"]+.005
                for box in asset["regions"]:
                    lo=np.array([box["minX"],top-.1,box["minZ"]])-rad
                    hi=np.array([box["maxX"],top,box["maxZ"]])+rad
                    if P.segment_hits_box(k,ankle,lo,hi):shin_blocked.append(s)
                ankles[s]=sem@Vector(ankle)
                B.aim(t,f,a,b,sem@Vector(k)-F.pos(w,a));w=F.world(t,f)
                B.aim(t,f,b,e,ankles[s]-F.pos(w,b));B.setrot(t,f,e,ow[e].to_quaternion())
            B.apply_checked(arm,bones,rest,f);w=F.world(t,f)
            replay=skin.actual_error(f);cloud=np.array([list(v) for v in F.surface(skin.reg)])
            local=np.array([list(inv@Vector(v)) for v in cloud])
            deep=int(Q.interior_mask(local,asset["regions"],top-.1,top).sum())
            floor_min=float(cloud[:,1].min()-floor);sole={s:F.sole(regs[s])-floor for s in SIDES}
            balance=B.balance_metrics(t,w,neutral,regs,asset,top,floor,inv)
            ankle_err=max((B.role(t,w,"foot_"+s)-ankles[s]).length for s in SIDES)
            margin=balance["feetOnly"]["halfspaceMarginM"];bad=row["failures"]
            if replay["max_m"]>=.002:bad.append("SKIN_REPLAY")
            if ankle_err>.002:bad.append("ANKLE_REPLAY")
            if min(reserve)<.005-1e-6:bad.append("REACH_RESERVE")
            if shin_blocked:bad.append("SHIN_ENVELOPE_BLOCKED")
            if deep:bad.append("SLAT_INTERIOR")
            if floor_min<-.005:bad.append("FLOOR_PENETRATION")
            if any(abs(v)>.02 for v in sole.values()):bad.append("SOLE")
            if margin is None or margin<0:bad.append("FOOT_SUPPORT_PROXY")
            if balance["trunkLeanDeg"]>50.0001:bad.append("LEAN_LIMIT")
            row.update({"skinReplay":replay,"ankleReplayM":ankle_err,"reachReserveM":reserve,"shinEnvelopeBlocked":shin_blocked,
                "slatInteriorVertices":deep,"floorMinM":floor_min,"soleGapsM":sole,"balance":balance})
            poses[j]=f
        except Exception as ex:
            row["failures"].append("POSE_DIAGNOSTIC_ERROR");row["error"]=repr(ex);row["traceback"]=traceback.format_exc()
        rows.append(row)
    rendered=[]
    if poses:
        try:
            B.apply_checked(arm,bones,rest,t["rest"]);h,_=F.setup(meshes)
            fixture=pathlib.Path("input-01a")/(cache["fixture"]+".glb");assert F.digest(fixture)==cache["assetSha"]
            bpy.ops.import_scene.gltf(filepath=str(fixture.resolve()))
            cam=bpy.context.scene.camera;slot=next(s for s in asset["slots"] if s["id"]==cache["slot"])
            target=F.Y.inverted()@(sem@Vector((slot["anchorX"],floor+h*.48,slot["anchorZ"])))
            for view,offset in (("quarter",Vector((1.7,.9,3.0))),("side",Vector((3.,.7,0.)))):
                cam.location=target+F.Y.inverted()@(sem@offset)*h
                cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler()
                cam.data.ortho_scale=h*1.65
                for j,f in sorted(poses.items()):
                    B.apply_checked(arm,bones,rest,f);name=f"{key}-{j}-{view}.png"
                    bpy.context.scene.render.filepath=str(OUT/name)
                    bpy.ops.render.render(write_still=True);assert (OUT/name).stat().st_size>0
                    rendered.append(name)
        except Exception as ex:
            rows[0]["failures"].append("RENDER_FAIL");rows[0]["renderError"]=repr(ex)
    cache_out={"rig":key,"sourceFrames":inds,"poses":[poses.get(j) for j in range(len(inds))]}
    (OUT/"transfer-poses.json").write_text(json.dumps(cache_out,allow_nan=False,separators=(",",":")))
    return rows,rendered
def main():
    S.controls()
    key=sys.argv[1];rsha,psha,csha=S.PINS[key]
    r=S.read("input-source/report.json",rsha);a=S.read("input-source/candidate-poses.json",psha)
    c=S.read("input-balance/pose-cache.json",csha)
    assert r["rig"]==a["rig"]==c["rig"]==key and r["cacheSha"]==a["inputCacheSha"]==csha
    assert a["times"]==c["times"] and a["phases"]==c["phases"] and r["evaluatedFrames"]==len(a["poses"])
    e=S.read("input-01b/artifacts/cf-interact-01b/eligibility-matrix.json","38452dfb5edb2f822ed942f56d2f3786c29fb23f3fdaeba70884eaed71842840")
    asset=next(f["asset"] for f in e["fixtures"] if f["name"]==c["fixture"]);assert asset["assetSha"]==c["assetSha"]==r["assetSha"]
    p=S.read("input-path/report.json","7f71ed67b9244896a99300c75da465d4d58038a28eb96c31859b278f77f15630")["profiles"][key]
    t={"sha256":c["rigSha"],"names":c["boneNames"],"parents":c["parents"],"roles":c["roles"],"rest":c["neutral"]}
    assert r["rigSha"]==t["sha256"]
    inds,values,fit=proxy(r,c,a,p,asset)
    out={"stage":"01C-TRANSFER-KEYS","rig":key,"rigSha":c["rigSha"],"assetSha":c["assetSha"],"sourceReportSha":rsha,
        "scope":"Two near-plane seat-free boundary keys; distinct transition stance, no full transition or dynamic balance proof.",
        "physicalAcceptance":"BLOCKED","originalFailures":r["failures"],"proxy":fit,"native":[],"rendered":[]}
    if fit["feasible"]:
        out["native"],out["rendered"]=native(t,c,asset,p,a,inds,values)
    ok=fit["feasible"] and len(out["native"])==2 and all(not row["failures"] for row in out["native"])
    out["status"]="TRANSFER_KEYS_SCREEN_PASS" if ok else "TRANSFER_KEYS_SCREEN_FAIL"
    (OUT/"report.json").write_text(json.dumps(out,allow_nan=False,indent=2))
    print(key,out["status"],fit["minimumAfter"],[row["failures"] for row in out["native"]],flush=True)
if __name__=="__main__":main()
