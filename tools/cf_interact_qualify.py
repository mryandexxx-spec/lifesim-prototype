"""01C-Q: source timing and continuous depth feasibility, not a new FBIK solve."""
import collections,hashlib,json,math,pathlib,struct,sys
import numpy as np
from scipy.spatial.transform import Rotation,Slerp
FPS=24;STEP=.35;EPS=.005
SOURCE_SHA="e33c2967ee13aba08acf849af4c23477622198d7c7e3700c4a013c6166762a2c"
PINS={
("male-grid_021-110","candidate45"):("7ca634e5e0294037d97bd24df07c622a3b290f32a5a1957b3155cb585b5853f9","c1b494f93f2e56feb89ca4c4571c7fd64e43ee98d27a42ceebbbedcefed5e957"),
("male-grid_021-90","heldout42"):("ad24c3c395aa80313c1a1eab8b7831deba0db5579fa73709ef8505c7e30e7f26","c9464b169cb2f9b1c0609676e5bb7358ed122b3bd91a6beacb9e7abab485fc19"),
("male-grid_021-110","heldout42"):("7c4ddea9eb02116a47701a8f0d05b01bb54088678a4f99fe4b341f210dfe549f","fa720d6a58e9bb6f7667806778b0a93fd89321a5371a6093bac0c45ee49c3e74"),
("male-grid_021-100","candidate45"):("92ab52055a4b3d03d55c72230fef774e874c941029e880cfc38ded023922cb1d","7cac0d37a6ad8db9ffd8dbf2a0d27856f0289dacc3ce60783369566dfebc9b97"),
("male-grid_021-90","candidate45"):("64e0afd3c2cdf7b6776ad15b0867332216883021a04c4b5e23ac6a695d476718","f421834c58e24b0d2f7f37a2638fe9657a90ddf3d8d5db2624126b11bf7339fb"),
("female-grid_201-90","candidate45"):("0443cc9fce09b8c243064cb6e27feb887fedef8957bef092ce752fc0d8527086","59ed26610ccdec66f33ed69335204ee711ddc641aab1e0a2a54516c55cf331fc"),
("female-grid_201-90","heldout42"):("39ce2257df06353dac0112ff2011384a7a9da2933db7913fb532eff2f1749e69","ba8ac8ef3cc32f1dbe3b9aac9af0343a459dbec2b3475f585e70ded7d005fb48"),
("male-grid_021-100","heldout42"):("6d89ccbeaaef2085681380f1568bafc7076e3f32af05e1bfe9587657ec07a29a","a1e7d6586d1f5021077dbb76869cc9868ad14bda64da3a6d81c661649a231930")}
def sha(b):return hashlib.sha256(b).hexdigest()
def angles(q):
    q=np.asarray(q,dtype=float);q=q/np.linalg.norm(q,axis=-1,keepdims=True)
    return 2*np.arccos(np.clip(np.abs(np.sum(q[1:]*q[:-1],axis=-1)),0,1))
def retime(clip,names):
    f=clip["frames"];duration=float(clip["duration"]);p=np.array([[b["p"] for b in a] for a in f]);q=np.array([[b["r"] for b in a] for a in f])
    assert len(f)>1 and duration>0 and np.isfinite(p).all() and np.isfinite(q).all()
    assert np.allclose(np.linalg.norm(q,axis=-1),1,atol=.001)
    d=angles(q);worst=float(d.max());i,j=np.unravel_index(d.argmax(),d.shape)
    # Piecewise shortest-arc angular speed bound over ALL source bones.
    # No per-bone edits, no smoothing of authored rotations, no altered gate.
    n=max(math.ceil(duration*FPS-1e-8),math.ceil(worst*(len(f)-1)/STEP-1e-8),1)
    old=np.linspace(0,1,len(f));new=np.linspace(0,1,n+1)
    pp=np.stack([np.interp(new,old,p[:,b,k]) for b in range(p.shape[1]) for k in range(3)],axis=1).reshape(n+1,p.shape[1],3)
    qq=np.stack([Slerp(old,Rotation.from_quat(q[:,b]))(new).as_quat() for b in range(q.shape[1])],axis=1)
    peak=float(angles(qq).max());assert peak<=STEP+1e-8,(peak,STEP)
    assert np.allclose(pp[[0,-1]],p[[0,-1]]) and np.allclose(np.abs(np.sum(qq[[0,-1]]*q[[0,-1]],axis=-1)),1,atol=1e-5)
    result={"duration":n/FPS,"frames":[[{"p":a.tolist(),"r":b.tolist()} for a,b in zip(u,v)] for u,v in zip(pp,qq)]}
    return result,{"originalDurationS":duration,"durationS":n/FPS,"timeScale":n/FPS/duration,"rawMaxStepRad":worst,"rawWorstBone":names[j],"rawWorstFrame":int(i+1),"retimedMaxStepRad":peak,"samples":n+1}
def free_intervals(lo,hi,forbidden):
    merged=[]
    for a,b in sorted((max(lo,float(a)),min(hi,float(b))) for a,b in forbidden if b>lo and a<hi):
        if b<=a:continue
        if merged and a<=merged[-1][1]:merged[-1][1]=max(b,merged[-1][1])
        else:merged.append([a,b])
    free=[];x=lo
    for a,b in merged:
        if a>x+1e-10:free.append([x,a])
        x=max(x,b)
    if hi>x+1e-10:free.append([x,hi])
    return free
def overlap(a,b,c,d):return max(0.,min(b,d)-max(a,c))
def support_fraction(z,x,width,depth,regions):
    return sum(overlap(x-width/2,x+width/2,r["minX"],r["maxX"])*overlap(z-depth/2,z+depth/2,r["minZ"],r["maxZ"]) for r in regions)/(width*depth)
def feasible_depth(free,anchor_x,anchor_z,width,depth,regions,min_fraction):
    # The rectangular support approximation is piecewise linear in depth.
    # Intersect analytic breakpoints, not a grid of per-character offsets.
    out=[]
    for l,h in free:
        for r in regions:
            if not r["minX"]<=anchor_x<=r["maxX"]:continue
            a=max(l,r["minZ"]-anchor_z);b=min(h,r["maxZ"]-anchor_z)
            if b<=a+1e-10:continue
            cuts=sorted({a,b}|{v for s in regions for edge in (s["minZ"],s["maxZ"]) for v in (edge-depth/2-anchor_z,edge+depth/2-anchor_z) if a<v<b})
            def f(d):return support_fraction(anchor_z+d,anchor_x,width,depth,regions)
            for u,v in zip(cuts,cuts[1:]):
                fu,fv=f(u),f(v)
                if max(fu,fv)<min_fraction-1e-10:continue
                if min(fu,fv)<min_fraction:
                    if abs(fv-fu)<1e-12:continue
                    c=u+(v-u)*(min_fraction-fu)/(fv-fu)
                    if fu<min_fraction:u=c
                    else:v=c
                if v>u+1e-10:out.append([u,v])
    # Merge adjacent support segments in the same continuous permissible zone.
    merged=[]
    for a,b in sorted(out):
        if merged and a<=merged[-1][1]+1e-10:merged[-1][1]=max(b,merged[-1][1])
        else:merged.append([a,b])
    return merged
def interior_mask(points,regions,bottom,top,shift=0):
    x,y,z=points.T;z=z+shift
    mask=(y>bottom+EPS)&(y<top-EPS);hit=np.zeros(len(points),bool)
    for r in regions:hit|=(x>r["minX"]+EPS)&(x<r["maxX"]-EPS)&(z>r["minZ"]+EPS)&(z<r["maxZ"]-EPS)
    return mask&hit
def intervals_for_samples(points,regions,bottom,top,slot,width,depth,min_fraction):
    # x,y,z in semantic furniture coordinates. Union all blocked translation
    # intervals from every sampled skin vertex, independent of rig identity.
    forbidden=[]
    for p in points:
        x,y,z=p.T;vertical=(y>bottom+EPS)&(y<top-EPS)
        for r in regions:
            mask=vertical&(x>r["minX"]+EPS)&(x<r["maxX"]-EPS)
            forbidden.extend(zip(r["minZ"]+EPS-z[mask],r["maxZ"]-EPS-z[mask]))
    ax,az=slot["anchorX"],slot["anchorZ"]
    free=free_intervals(slot["region"]["minZ"]-az,slot["region"]["maxZ"]-az,forbidden)
    fit=feasible_depth(free,ax,az,width,depth,regions,min_fraction)
    chosen=None
    if fit:
        a,b=max(fit,key=lambda r:(r[1]-r[0],-abs(sum(r)/2),-r[0]));d=(a+b)/2
        frac=support_fraction(az+d,ax,width,depth,regions)
        assert frac>=min_fraction-1e-8 and not any(interior_mask(p,regions,bottom,top,d).any() for p in points)
        chosen={"deltaM":d,"anchorZM":az+d,"supportFraction":frac,"intervalM":[a,b]}
    return {"freeDepthIntervalsM":free,"supportFeasibleIntervalsM":fit,"candidate":chosen,
      "status":"RIGID_REPLAY_CANDIDATE" if chosen else "NO_RIGID_DEPTH_SOLUTION"}
def decode(raw):
    assert raw[:4]==b"glTF" and struct.unpack_from("<I",raw,4)[0]==2
    n,kind=struct.unpack_from("<I4s",raw,12);assert kind==b"JSON";g=json.loads(raw[20:20+n])
    size,kind=struct.unpack_from("<I4s",raw,20+n);assert kind==b"BIN\x00";buf=raw[28+n:28+n+size]
    def acc(i):
        a=g["accessors"][i];assert not a.get("sparse") and not a.get("normalized")
        v=g["bufferViews"][a["bufferView"]];assert v["buffer"]==0
        dt=np.dtype({5126:"<f4",5121:"u1",5123:"<u2",5125:"<u4"}[a["componentType"]])
        k={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16}[a["type"]]
        return np.ndarray((a["count"],k),dtype=dt,buffer=buf,offset=v.get("byteOffset",0)+a.get("byteOffset",0),strides=(v.get("byteStride",k*dt.itemsize),dt.itemsize)).copy()
    return g,acc
def replay(raw,frames):
    g,acc=decode(raw);assert len(g["skins"])==1 and len(g["animations"])==1
    skin=g["skins"][0];nodes=g["nodes"];anim=g["animations"][0];channels={};jumps=[]
    assert len(skin["joints"])==104
    for ch in anim["channels"]:
        s=anim["samplers"][ch["sampler"]];mode=s.get("interpolation","LINEAR");assert mode in ("LINEAR","STEP")
        o=acc(s["output"]);t=acc(s["input"]).ravel();assert len(t) in (2,frames) and len(o)==len(t)
        assert np.all(np.diff(t)>0)
        old=(t-t[0])/(t[-1]-t[0]);new=np.linspace(0,1,frames)
        if mode=="STEP":
            assert ch["target"]["path"]=="scale" and len(t)==2 and float(np.max(np.abs(o[-1]-o[0])))<1e-6,("unexpected nonconstant STEP channel",ch)
            out=o[np.searchsorted(old,new,side="right")-1]
        elif ch["target"]["path"]=="rotation":
            out=Slerp(old,Rotation.from_quat(o))(new).as_quat()
            d=angles(out);jumps.append((float(d.max()),nodes[ch["target"]["node"]]["name"],int(d.argmax()+1)))
        else:out=np.stack([np.interp(new,old,o[:,k]) for k in range(o.shape[1])],axis=1)
        channels[(ch["target"]["node"],ch["target"]["path"])]=out
    ibm=acc(skin["inverseBindMatrices"]).reshape(-1,4,4).transpose(0,2,1);prims=[]
    for node in nodes:
        if "mesh" not in node:continue
        assert node["skin"]==0
        for p in g["meshes"][node["mesh"]]["primitives"]:
            a=p["attributes"];assert "JOINTS_1" not in a and "WEIGHTS_1" not in a
            pos=acc(a["POSITION"]);weight=acc(a["WEIGHTS_0"]);joint=acc(a["JOINTS_0"])
            assert np.allclose(weight.sum(1),1,atol=.005)
            prims.append((np.c_[pos,np.ones(len(pos))],weight,joint))
    assert prims
    def world(frame):
        matrices={}
        def walk(i,parent):
            n=nodes[i];m=np.eye(4)
            if "matrix" in n:m=np.array(n["matrix"]).reshape(4,4).T
            else:
                def val(k,default):
                    a=channels.get((i,k));return n.get(k,default) if a is None else a[frame]
                m[:3,:3]=Rotation.from_quat(val("rotation",[0,0,0,1])).as_matrix()@np.diag(val("scale",[1,1,1]));m[:3,3]=val("translation",[0,0,0])
            matrices[i]=parent@m
            for c in n.get("children",[]):walk(c,matrices[i])
        for i in g["scenes"][g.get("scene",0)]["nodes"]:walk(i,np.eye(4))
        return matrices
    def samples():
        for i in range(frames):
            w=world(i);mat=np.stack([w[j] for j in skin["joints"]])@ibm
            yield np.concatenate([(np.einsum("nkij,nj->nki",mat[j],p)*v[:,:,None]).sum(1)[:,:3] for p,v,j in prims])
    return samples(),sorted(jumps,reverse=True)[:10]
def analyze(path):
    pb=(path/"plan.json").read_bytes();plan=json.loads(pb);a=plan["asset"];rig=plan["rig"]
    key=(rig["id"],plan["fixture"]);avatar=(path/"avatar.glb").read_bytes();assert (sha(avatar),sha(pb))==PINS[key]
    bench=(path/"bench.glb").read_bytes();assert sha(bench)==a["assetSha"]
    r=json.loads((path/"contact-report.json").read_text());assert r["contactGate"]["status"]=="FAIL" and r["export_reimport"]["within_2mm"]
    assert r["frames"]==81
    bg,acc=decode(bench);wood=[acc(p["attributes"]["POSITION"]) for p in bg["meshes"][0]["primitives"] if bg["materials"][p["material"]]["name"]=="Honey oak"]
    bottom=float(np.concatenate(wood)[:,1].min());top=float(a["seatY"])
    assert abs(top-bottom-.10)<1e-5
    yaw=math.radians(plan["result"]["yaw"]);x=np.array([math.cos(yaw),0,-math.sin(yaw)]);front=np.array([math.sin(yaw),0,math.cos(yaw)])
    samples,jumps=replay(avatar,r["frames"]);pts=[np.stack((p@x,p[:,1],p@front),axis=1) for p in samples]
    slot=next(s for s in a["slots"] if plan["result"]["slotId"].endswith(":"+s["id"]))
    regions=a["regions"];depth=rig["supportDepth"];width=rig["supportWidth"]
    assert all(overlap(q["minX"],q["maxX"],v["minX"],v["maxX"])*overlap(q["minZ"],q["maxZ"],v["minZ"],v["maxZ"])==0 for i,q in enumerate(regions) for v in regions[i+1:])
    result=intervals_for_samples(pts,regions,bottom,top,slot,width,depth,plan["action"]["minSupportFraction"])
    result.update({"rig":key[0],"fixture":key[1],"avatarSha":sha(avatar),"assetSha":sha(bench),"measuredSlatDepthM":top-bottom,
        "maxIndependentInteriorVertices":max(int(interior_mask(p,regions,bottom,top).sum()) for p in pts),
        "nativeInteriorVertices":max(s["slatInteriorVertices"] for s in r["samples"]),
        "maxBakedJointSteps":jumps,"priorGateFailures":r["contactGate"]["failures"]})
    assert result["maxIndependentInteriorVertices"]>0 and jumps[0][0]>STEP
    return key,result
def tests():
    assert free_intervals(0,1,[(-1,.2),(.1,.4),(.6,.9)])==[[.4,.6],[.9,1]]
    assert free_intervals(0,1,[(-1,2)])==[]
    regs=[{"minX":-1,"maxX":1,"minZ":-.5,"maxZ":.5}]
    slot={"anchorX":0,"anchorZ":0,"region":{"minZ":-.5,"maxZ":.5}}
    # A point inside the solid blocks every shift that keeps that point inside.
    blocked=intervals_for_samples([np.array([[0,.05,0]])],regs,0,.1,slot,.2,.2,.5)
    assert blocked["candidate"] is not None and abs(blocked["candidate"]["deltaM"])>=.495
    # Two opposing points cover all allowable shifts.
    both=intervals_for_samples([np.array([[0,.05,-.2],[0,.05,.2]])],regs,0,.1,slot,.2,.2,.5)
    assert both["status"]=="NO_RIGID_DEPTH_SOLUTION"
    clear=intervals_for_samples([np.array([[0,.2,0]])],regs,0,.1,slot,.2,.2,.5)
    assert abs(clear["candidate"]["deltaM"])<1e-8
    q=Rotation.from_rotvec([[0,0,0],[0,0,.8]]).as_quat()
    f={"duration":1/FPS,"frames":[[{"p":[0,0,0],"r":a.tolist()}] for a in q]}
    n,r=retime(f,["test"]);assert r["samples"]==4 and r["retimedMaxStepRad"]<=STEP
    print("Independent interval and timing unit controls PASS",flush=True)
def main():
    tests()
    root=pathlib.Path("prior-tools");inputs=list(root.rglob("input.json"));assert len(inputs)==1
    b=inputs[0].read_bytes();assert sha(b)==SOURCE_SHA
    source=json.loads(b);s=next(s for s in source["sources"].values() if "Sitting_Enter" in s["clips"])
    clips={};timing={}
    for n in ("Sitting_Enter","Sitting_Exit"):
        clips[n],timing[n]=retime(s["clips"][n],s["names"])
    out=pathlib.Path("artifacts/cf-interact-01c-qual");out.mkdir(parents=True,exist_ok=True)
    (out/"qualified-source.json").write_text(json.dumps({"sourceSha":SOURCE_SHA,"names":s["names"],"parents":s["parents"],"clips":clips},separators=(",",":"),allow_nan=False))
    result={"stage":"01C-Q","R12Executed":False,"full01C":"BLOCKED: original contact failure remains","sourceTiming":timing,
      "limits":{"fps":FPS,"jointStepRad":STEP,"slatInteriorMarginM":EPS},"cases":[]}
    seen=set()
    for path in sorted(pathlib.Path("prior-r1").rglob("plan.json")):
        key,row=analyze(path.parent);assert key not in seen;seen.add(key);result["cases"].append(row)
        print(key,row["status"],row["candidate"],flush=True)
    assert seen==set(PINS)
    result["counts"]=dict(collections.Counter(r["status"] for r in result["cases"]))
    result["limitsOfEvidence"]=["Rigid shift of prior baked samples only; no new motion, no full mesh containment/sweep, no balance/foot/hand requalification","Rectangular support approximation retained, not actual support contact","Timing-normalized source still needs retarget/placement/bake with original physical gates","No runtime wiring or ART/DEVICE acceptance"]
    (out/"report.json").write_text(json.dumps(result,indent=2,allow_nan=False))
    print("01C-Q",result["counts"],"FULL 01C BLOCKED",flush=True)
if __name__=="__main__":main()
