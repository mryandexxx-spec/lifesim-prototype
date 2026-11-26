"""Restricted support-aware stance feasibility on exact cached source-phase poses.
No Blender, new R12 solve, dynamic stability claim, or rendered/accepted animation.
"""
import json,pathlib,hashlib,sys
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.optimize import minimize

PINS={
"male-grid_021-100":("31b7a751be1eb7d93cf0620b8c63da502aa320e714a10b34f7995454d3f49838","4673b0434781a36a4e90c4cee4dcb591faa22f91fe661790d0f1ebbbf03642e4","bd45b8419c805e6ff5268a90e0d2d7c48e91055d25d5d9abc1d70cf786cb77bf"),
"male-grid_021-90":("75e1f6df8b32c8c0febf5789fc25a2aadb01c48ca750d2ef14da872998c3747f","edbbf130383f20e6c284e6d9dd9d5dd880709a72ec138b653d4d4bddc9e3e39e","af47150d743f75a9d61d7c601a66be4bd7875a26795f721d7928dbb96bc1274e"),
"female-grid_201-110":("3141e8178801dccb35286f18e1641aadde15070eb91d27d52f8f12959b59d960","d6773b752f8470ab0b5ef14d79687ec61b52323d034afac4f34d6f8e0cb9df32","dfb2953e80303450532d5015baa19cfe594c0b603c790ecdf7dab7f0b03e3c2b"),
"female-grid_201-100":("fbd01ac71177a23c66469af01b2f54050fecf49fb0fa98617c35e31a9135b0bb","a06f33f5a0e241f7333f0c860550d059f0f679d35bab793731f8c55a8a984629","d96f4072b70e7a571736244a128f91d53b61e5f12a936d489d3b2753ce69967c")}
def read(path,sha):
    b=pathlib.Path(path).read_bytes();assert hashlib.sha256(b).hexdigest()==sha,path
    return json.loads(b)
def world(poses,parents):
    p=np.asarray([[b["p"] for b in f] for f in poses],dtype=np.float64)
    q=np.asarray([[b["r"] for b in f] for f in poses],dtype=np.float64)
    assert np.isfinite(p).all() and np.isfinite(q).all()
    m=Rotation.from_quat(q.reshape(-1,4)).as_matrix().reshape(*q.shape[:2],3,3)
    for i,par in enumerate(parents):
        if par>=0:
            assert par<i
            p[:,i]=p[:,par]+np.einsum("nij,nj->ni",m[:,par],p[:,i])
            m[:,i]=m[:,par]@m[:,i]
    return p
def centroid(w,roles):
    ix=lambda k:[roles[k+"_l"],roles[k+"_r"]]
    result=(w[:,roles["hip"]]+w[:,ix("upperarm")].mean(axis=1))*.249+w[:,roles["head"]]*.08
    for s in ("l","r"):
        a,b,d=[w[:,roles[n+"_"+s]] for n in ("thigh","shin","foot")]
        u,e,h=[w[:,roles[n+"_"+s]] for n in ("upperarm","forearm","hand")]
        result+=(a+b)*.05+(b+d)*.02325+d*.0145+(u+e)*.014+(e+h)*.008+h*.006
    return result
def controls():
    q=Rotation.from_euler("z",90,degrees=True).as_quat().tolist()
    data=[[{"p":[1,2,3],"r":q},{"p":[1,0,0],"r":[0,0,0,1]}]]
    assert np.allclose(world(data,[-1,0])[0,1],[1,3,3],atol=1e-10)
    assert abs(.778+2*.07325+.0755-1)<1e-12
    print("FK and centroid translation controls PASS",flush=True)
def plan(hips,knees,ankles,lengths,center,hull_bounds,seat_points,times):
    n=len(hips);lengths=np.array(lengths)
    lim=float(np.min(lengths.sum(axis=1)));lo,hi=hull_bounds.T
    fixed=(times>=38-1e-8)&(times<=50+1e-8)
    active=np.flatnonzero(~fixed);unsupported=seat_points==0
    assert fixed.any() and unsupported.any() and not np.any(fixed&unsupported)
    def pose(x):
        shift=np.zeros(n);shift[active]=x[1:]
        h=hips.copy();h[:,:,2]+=shift[:,None]
        a=ankles.copy();a[:,:,2]+=x[0]
        v=a-h;d=np.linalg.norm(v,axis=-1);e=v/np.maximum(d[...,None],1e-12)
        along=(lengths[:,0]**2-lengths[:,1]**2+d*d)/(2*np.maximum(d,1e-12))
        rad2=lengths[:,0]**2-along**2
        front=np.array([0.,0.,1.]);pole=front-e*e[...,2,None]
        pn=np.linalg.norm(pole,axis=-1)
        k=h+e*along[...,None]+pole/np.maximum(pn[...,None],1e-12)*np.sqrt(np.maximum(rad2,0))[...,None]
        com=center[:,2]+.778*shift+.07325*np.sum(k[:,:,2]-knees[:,:,2],axis=1)+.0755*x[0]
        return shift,d,pn,com,k
    def groups(x):
        shift,d,pn,com,k=pose(x)
        return {"outerReachM":lengths.sum(axis=1)-.005-d,
                "innerReachM":d-np.abs(lengths[:,0]-lengths[:,1])-.005,
                "poleReserve":pn-.0001,
                "rearSupportM":(com-lo-x[0])[unsupported],
                "frontSupportM":(hi+x[0]-com)[unsupported]}
    def constraints(x):return np.concatenate([g.ravel() for g in groups(x).values()])
    def objective(x):
        shift,_,_,_,_=pose(x)
        return (x[0]**2+np.mean(shift**2)+30*np.mean(np.diff(shift,n=2)**2))/lim**2
    x0=np.zeros(1+len(active))
    fit=minimize(objective,x0,method="SLSQP",
        bounds=[(-lim/4,lim/4)]+[(-lim/2,lim/2)]*len(active),
        constraints={"type":"ineq","fun":constraints},options={"maxiter":120,"ftol":1e-10})
    return fit,groups(x0),groups(fit.x),pose(fit.x),lim,unsupported
def main():
    controls();assert len(sys.argv)==2
    key=sys.argv[1];rsha,psha,csha=PINS[key]
    r=read("input-source/report.json",rsha);a=read("input-source/candidate-poses.json",psha)
    c=read("input-balance/pose-cache.json",csha)
    assert r["rig"]==a["rig"]==c["rig"]==key
    assert r["cacheSha"]==a["inputCacheSha"]==csha
    assert r["rigSha"]==c["rigSha"] and r["assetSha"]==c["assetSha"]
    assert a["times"]==c["times"] and a["phases"]==c["phases"]
    assert r["evaluatedFrames"]==r["plannedFrames"]==len(a["poses"]) and all(p is not None for p in a["poses"])
    roles=c["roles"];w=world(a["poses"],c["parents"]);n=world([c["neutral"]],c["parents"])[0]
    src=np.array([s["balance"]["bodyCentroidProxyM"] for s in r["samples"]])
    replay_error=float(np.max(np.linalg.norm(centroid(w,roles)-src,axis=-1)))
    assert replay_error<.0002,("centroid FK replay",replay_error)
    dest=np.array([s["balance"]["centroidProjectionXZ"] for s in r["samples"]])
    # All four pinned fixtures face yaw 180; prove transformation on actual
    # published projection samples, never assume a general furniture yaw.
    assert np.max(np.abs(-src[:,[0,2]]-dest))<1e-5
    w[:,:,0]*=-1;w[:,:,2]*=-1;src[:,0]*=-1;src[:,2]*=-1
    idx=lambda k:[roles[k+"_l"],roles[k+"_r"]]
    h,k,f=(w[:,idx(role)] for role in ("thigh","shin","foot"))
    lengths=np.stack([np.linalg.norm(n[idx("thigh")]-n[idx("shin")],axis=-1),np.linalg.norm(n[idx("shin")]-n[idx("foot")],axis=-1)],axis=1)
    bounds=np.array([[min(p[1] for p in s["balance"]["feetOnly"]["hull"]),max(p[1] for p in s["balance"]["feetOnly"]["hull"])] for s in r["samples"]])
    seats=np.array([s["balance"]["possibleSeatPoints"] for s in r["samples"]])
    result,before,after,(shift,d,pn,com,kn),lim,unsupported=plan(h,k,f,lengths,src,bounds,seats,np.array(a["times"]))
    assert np.isfinite(result.x).all() and all(np.isfinite(g).all() for g in after.values())
    minima=lambda groups:{name:float(g.min()) for name,g in groups.items()}
    violations=lambda groups:{name:int(np.sum(g< -1e-6)) for name,g in groups.items()}
    feasible=all(g.min()>=-1e-6 for g in after.values())
    out={"stage":"01C-STANCE","rig":key,"sourceReportSha":rsha,"sourcePoseSha":psha,"balanceCacheSha":csha,
         "status":"PROXY_FEASIBLE_CANDIDATE" if feasible and result.success else "NO_FEASIBLE_CANDIDATE_FOUND",
         "physicalAcceptance":"BLOCKED","scope":"Restricted fixed stance sagittal proxy; not proof of global infeasibility or dynamic balance; actual skin/collision not executed.",
         "originalFailures":r["failures"],"centroidFkErrorM":replay_error,"frames":len(h),
         "unsupportedFrames":int(unsupported.sum()),"legLengthsM":lengths.tolist(),"bounds":{"stanceM":lim/4,"pelvisM":lim/2,"reachReserveM":.005},
         "solver":{"success":bool(result.success),"message":str(result.message),"status":int(result.status),"iterations":int(result.nit),"budget":120,"objective":float(result.fun)},
         "minimumConstraintsBefore":minima(before),"minimumConstraintsAfter":minima(after),
         "violationsBefore":violations(before),"violationsAfter":violations(after),
         "stanceShiftM":float(result.x[0]),"pelvisShiftM":shift.tolist(),
         "sourceUnsupportedFrames":np.flatnonzero(unsupported).tolist(),
         "candidateCentroidSagittalM":com.tolist(),"candidateAnkleDistanceM":d.tolist()}
    path=pathlib.Path("artifacts/cf-interact-01c-stance");path.mkdir(parents=True,exist_ok=True)
    (path/"report.json").write_text(json.dumps(out,allow_nan=False,indent=2))
    print(key,out["status"],out["solver"],out["minimumConstraintsAfter"],flush=True)
if __name__=="__main__":main()
