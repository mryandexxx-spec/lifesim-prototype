"""Bounded same-recording start/stop discovery. No retarget, solver or key edits."""
import ast,hashlib,json,math,os,pathlib,re,urllib.request
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.ndimage import uniform_filter1d
from PIL import Image,ImageDraw
P=pathlib.Path
O=P("artifacts/cf-anim-mocap-transitions");O.mkdir(parents=True,exist_ok=True)
CREDIT="The 100STYLE Dataset - Ian Mason (Mason, Starke, Komura, 2022), CC BY 4.0. https://www.ianxmason.com/100style/ https://creativecommons.org/licenses/by/4.0/ . Original captured excerpts and diagnostic figures; no source key edits."
R={"head":os.environ["EXPECTED_SHA"],"stage":"MOCAP-TRANSITIONS/SOURCE","status":"PENDING","credit":CREDIT,"sources":{},"clips":{},"ART":"OPEN","scope":"Source-only start/stop discovery and endpoint compatibility; not a contact or runtime pass."}
def save(): (O/"report.json").write_text(json.dumps(R,indent=2,allow_nan=False))
(O/"ATTRIBUTION.txt").write_text(CREDIT+"\n");save()
# Reuse the already validated native BVH parser. Only extend frame count
# acceptance to the short exact derived artifact, not FK or Euler convention.
parser_src=P("tools/cf_anim_mocap_cycle.py").read_text()
fn=next(x for x in ast.parse(parser_src).body if isinstance(x,ast.FunctionDef) and x.name=="parse")
code=ast.get_source_segment(parser_src,fn)
assert code.count("240<frames<100000")==1
exec(compile(code.replace("240<frames<100000","2<=frames<100000"),"<frozen-native-parser>","exec"))
def download(name,ident,digest,n):
    url="https://drive.google.com/uc?export=download&id="+ident
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"LifeSim source research"}),timeout=60) as f:raw=f.read(40_000_001)
    assert 0<len(raw)<=40_000_000 and hashlib.sha256(raw).hexdigest()==digest
    data=parse(raw);assert len(data[2])==n
    R["sources"][name]={"url":url,"sha256":digest,"frames":n};save()
    return raw,data
fw_raw,fw=download("Neutral_FW","1-TqZdIJvpr-QVvAmYJREUZkuAgpAQSfd","2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",7896)
_,idle=download("Neutral_ID","1Vnz5wnFmOztNzaSBHjSt9v6y0pl0FK8X","71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",2103)
prior=json.loads(P("input-loop/report.json").read_text())
raw=P("input-loop/Neutral_FW_overlap.bvh").read_bytes()
assert prior["head"]=="cfa3f431939ee8f6c55f2523e08b8e5be38d35e8" and prior["status"]=="OVERLAP_SCREEN_PASS"
assert hashlib.sha256(raw).hexdigest()==prior["derivedSha256"]=="bab703d41dc3bd6df2a6bceb3a0d3f773e84ceff65e42097e128ec5cce95e728"
walk=parse(raw)
nodes,dt,xyz,local=fw
assert all(x[0]==nodes and x[1]==dt for x in (idle,walk))
assert len(walk[2])==84
names={x["name"]:k for k,x in enumerate(nodes)}
root=names["Hips"];feet=[names[s+t] for s in ("Left","Right") for t in ("Ankle","Toe")]
animated=[k for k,n in enumerate(nodes) if n["channels"]]
# Heading-normalized joint positions and local angular motion. Only global
# translation and yaw are ignored. No scale changes, no per-joint alignment.
def features(data):
    _,_,p,q=data
    lat=(p[:,names["RightHip"]]-p[:,names["LeftHip"]])*[1,0,1]
    lat=lat/np.linalg.norm(lat,axis=1)[:,None]
    fwd=np.cross(lat,np.array([0.,1.,0.]))
    axes=np.stack([lat,np.broadcast_to([0.,1.,0.],lat.shape),fwd],axis=-1)
    rel=np.einsum("fji,fkj->fki",axes,p-p[:,root,None])
    q=q[:,animated].copy()
    # Root orientation is expressed in body-heading coordinates, other
    # rotations remain in their exact recorded local frames.
    q[:,0]=np.swapaxes(axes,-1,-2)@q[:,0]
    vel=np.gradient(p[:,root],dt,axis=0)
    vel=np.einsum("fji,fj->fi",axes,vel)
    omega=Rotation.from_matrix((q[1:]@np.swapaxes(q[:-1],-1,-2)).reshape(-1,3,3)).as_rotvec().reshape(len(p)-1,len(animated),3)/dt
    return {"rel":rel,"q":q,"vel":vel,"omega":omega,"heading":fwd}
F,I,W=map(features,(fw,idle,walk))
# Retain the accepted idle excerpt, not other source poses.
LIMITS={"poseRad":math.radians(5),"feetM":.025,"rootSpeedDeltaMps":.1,"angularDeltaRadps":2.}
SEARCH={"stationarySpeedMps":.10,"steadyWalkMinMps":.60,"steadyWalkMaxMps":1.20,"windowS":.30,"minTransitionS":.25,"maxTransitionS":1.8,"maxHeadingChangeDeg":20}
R.update(limits=LIMITS,search=SEARCH,idleFrames=[960,1140],walkFrames=[0,83],derivedSha256=prior["derivedSha256"])
speed=np.linalg.norm(np.gradient(xyz[:,root][:,[0,2]],dt,axis=0),axis=-1)
window=round(SEARCH["windowS"]/dt)
smooth=uniform_filter1d(speed,size=window,mode="nearest")
still=smooth<=SEARCH["stationarySpeedMps"]
moving=(smooth>=SEARCH["steadyWalkMinMps"])&(smooth<=SEARCH["steadyWalkMaxMps"])
def sustained(mask,i,direction):
    a,b=(i-window+1,i+1) if direction<0 else (i,i+window)
    return a>=0 and b<=len(mask) and bool(mask[a:b].all())
# A stationary end must have 0.3s of supported low speed on its outer side;
# a gait end must have 0.3s of steady walking on its outer side.
def boundary_candidates(kind):
    ends=np.flatnonzero(still)
    for a in ends:
        if kind=="start":
            if a+1>=len(still) or still[a+1] or not sustained(still,a,-1):continue
            for b in range(a+math.ceil(.25/dt),min(len(still)-1,a+math.floor(1.8/dt))+1):
                if sustained(moving,b,1):yield int(a),int(b)
        else:
            if a==0 or still[a-1] or not sustained(still,a,1):continue
            for b in range(max(1,a-math.floor(1.8/dt)),a-math.ceil(.25/dt)+1):
                if sustained(moving,b,-1):yield int(b),int(a)
def endpoint(frame,refs,ids,side):
    # Compare incoming/outgoing velocity on the actual side of each join.
    # No interpolation or edited poses. Compare all allowed phases once.
    ids=np.asarray(ids,dtype=int)
    q=F["q"][frame];rot=refs["q"][ids]@np.swapaxes(q,-1,-2)
    ang=Rotation.from_matrix(rot.reshape(-1,3,3)).magnitude().reshape(len(ids),len(animated)).max(axis=1)
    foot=np.linalg.norm(refs["rel"][ids][:,feet]-F["rel"][frame,feet],axis=-1).max(axis=1)
    v=np.linalg.norm(refs["vel"][ids]-F["vel"][frame],axis=-1)
    cur=F["omega"][frame if side=="start" else frame-1]
    ri=np.minimum(ids,len(refs["omega"])-1) if side=="stop" else np.maximum(0,ids-1)
    o=np.linalg.norm(refs["omega"][ri]-cur,axis=-1).max(axis=1)
    score=np.maximum.reduce([ang/LIMITS["poseRad"],foot/LIMITS["feetM"],v/LIMITS["rootSpeedDeltaMps"],o/LIMITS["angularDeltaRadps"]])
    j=int(np.argmin(score))
    return {"referenceFrame":int(ids[j]),"poseRad":float(ang[j]),"feetM":float(foot[j]),"rootSpeedDeltaMps":float(v[j]),"angularDeltaRadps":float(o[j]),"score":float(score[j])}
def emit_excerpt(a,b,name):
    header,m=fw_raw.decode("utf-8-sig").split("MOTION",1)
    match=re.fullmatch(r"\s*Frames:\s*(\d+)\s+Frame Time:\s*([0-9.eE+-]+)\s+(.*)",m,re.S)
    tokens=match[3].split();width=len(tokens)//len(xyz);assert len(tokens)==width*len(xyz)
    keys=tokens[a*width:(b+1)*width]
    result=(header+"MOTION\nFrames: "+str(b-a+1)+"\nFrame Time: "+match[2]+"\n"+"\n".join(" ".join(keys[j:j+width]) for j in range(0,len(keys),width))+"\n").encode()
    _,_,p,q=parse(result);assert np.max(np.abs(p-xyz[a:b+1]))<1e-10 and np.max(np.abs(q-local[a:b+1]))<1e-10
    path=O/(name+".bvh");path.write_bytes(result)
    return {"file":path.name,"sha256":hashlib.sha256(result).hexdigest()}
def illustrate(kind,row):
    a,b=row["a"],row["b"];center=xyz[a,root].copy();center[1]=0
    direction=F["heading"][a if kind=="start" else b]
    im=Image.new("RGB",(900,360),(244,246,247));draw=ImageDraw.Draw(im)
    frames=np.linspace(a,b,5).round().astype(int)
    for j,f in enumerate(frames):
        p=xyz[f]-xyz[f,root];base=160+int(xyz[f,root,1]*130)
        coords=[(90+j*180+float(v@direction)*130,base-v[1]*130-50) for v in p]
        for k,n in enumerate(nodes):
            if n["parent"]>=0:
                color=(58,130,200) if n["name"].startswith("Left") else (205,117,65) if n["name"].startswith("Right") else (54,65,75)
                draw.line([coords[n["parent"]],coords[k]],fill=color,width=3)
        draw.text((j*180+10,320),f"frame {f}",fill=(30,35,40))
    draw.text((10,8),kind+" | source only | five poses, no contact proof",fill=(30,35,40));im.save(O/(kind+"-poses.png"))
R["speed"]={"minimumMps":float(smooth.min()),"maximumMps":float(smooth.max()),"stationarySamples":int(still.sum()),"steadyWalkSamples":int(moving.sum())}
# Every eligible boundary is evaluated once. No widening the gates if no pair passes.
for kind in ("start","stop"):
    rows=[];rejected_heading=0
    for a,b in boundary_candidates(kind):
        dot=np.clip(F["heading"][a:b+1]@F["heading"][a],-1,1)
        heading=float(np.degrees(np.arccos(dot)).max())
        if heading>SEARCH["maxHeadingChangeDeg"]:rejected_heading+=1;continue
        if kind=="start":
            one=endpoint(a,I,np.arange(960,1141),"start");two=endpoint(b,W,np.arange(0,83),"stop")
        else:
            one=endpoint(a,W,np.arange(0,83),"start");two=endpoint(b,I,np.arange(960,1141),"stop")
        rows.append({"a":a,"b":b,"durationS":float((b-a)*dt),"headingChangeDeg":heading,"incoming":one,"outgoing":two,"score":max(one["score"],two["score"])})
    rows.sort(key=lambda x:(x["score"],x["a"],x["b"]))
    passed=[r for r in rows if r["score"]<=1]
    report={"eligibleCount":len(rows),"headingRejected":rejected_heading,"compatibleCount":len(passed),"status":"SOURCE_COMPATIBLE" if passed else "SOURCE_HOLD","best":rows[0] if rows else None}
    (O/(kind+"-candidates.json")).write_text(json.dumps(rows,allow_nan=False))
    if rows:illustrate(kind,rows[0])
    if passed:report["excerpt"]=emit_excerpt(passed[0]["a"],passed[0]["b"],kind)
    R["clips"][kind]=report;save()
R["status"]="SOURCE_PAIR_COMPATIBLE" if all(x["status"]=="SOURCE_COMPATIBLE" for x in R["clips"].values()) else "SOURCE_PAIR_HOLD"
R["next"]="Use frozen transport and contact-aware transition qualification only if compatible; otherwise stop same-recording search and design independent contact-aware Start/Stop clips."
save();print(R["status"],{k:(v["eligibleCount"],v["compatibleCount"]) for k,v in R["clips"].items()},flush=True)
# CI success means the bounded audit ran; it does not mean a candidate passed.
assert set(R["clips"])=={"start","stop"}
