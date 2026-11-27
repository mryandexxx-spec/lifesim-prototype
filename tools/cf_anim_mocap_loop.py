"""Select a naturally repeating 100STYLE source excerpt; never edit a captured key."""
import os,sys,math,json,re,hashlib,urllib.request,pathlib,subprocess
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.signal import find_peaks
from PIL import Image,ImageDraw
from imageio_ffmpeg import get_ffmpeg_exe
OUT=pathlib.Path("artifacts/cf-anim-mocap-loop");OUT.mkdir(parents=True,exist_ok=True)
INPUTS={"Neutral_FW":("1-TqZdIJvpr-QVvAmYJREUZkuAgpAQSfd","2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",7896),"Neutral_ID":("1Vnz5wnFmOztNzaSBHjSt9v6y0pl0FK8X","71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",2103)}
CREDIT="The 100STYLE Dataset - Ian Mason (Mason, Starke, Komura, 2022). CC BY 4.0. https://www.ianxmason.com/100style/ https://creativecommons.org/licenses/by/4.0/ . Derived walking excerpt: symmetric overlap crossfade at seam; attribution and diagnostic renders."
LIMITS={"maxC0Rad":math.radians(5),"rootVelocityJumpMps":.1,"footEndpointResidualM":.025,"maxAngularVelocityJumpRadps":2.,"relativeJumpRatio":1.}
R={"head":os.environ["EXPECTED_SHA"],"stage":"MOCAP-LOOP","status":"PENDING","limits":LIMITS,"credit":CREDIT,"sources":[],"clips":{},"ART":"OPEN"}
def save(): (OUT/"report.json").write_text(json.dumps(R,indent=2,allow_nan=False))
def acquire(name):
    ident,sha,n=INPUTS[name];url="https://drive.google.com/uc?export=download&id="+ident
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"LifeSim source research"}),timeout=60) as f:data=f.read(40_000_001)
    assert 0<len(data)<=40_000_000 and hashlib.sha256(data).hexdigest()==sha and data.startswith(b"HIERARCHY")
    R["sources"].append({"name":name,"url":url,"sha256":sha,"bytes":len(data),"framesExpected":n});save();return data
def parse(data):
    h,m=data.decode("utf-8-sig").split("MOTION",1)
    t=re.findall(r"\{|\}|[^\s{}]+",h);i=0;nodes=[];count=0
    def pop(expected=None):
        nonlocal i
        x=t[i];i+=1
        if expected is not None:assert x==expected,(x,expected)
        return x
    def joint(parent,kind):
        nonlocal count
        if kind=="End":
            pop("Site");name=nodes[parent]["name"]+"_end"
        else:name=pop()
        pop("{");pop("OFFSET");off=[float(pop())*.01 for _ in range(3)]
        ch=[];start=count
        if kind!="End":
            pop("CHANNELS");ch=[pop() for _ in range(int(pop()))];count+=len(ch)
        idx=len(nodes);nodes.append({"name":name,"parent":parent,"offset":off,"channels":ch,"start":start})
        while t[i]!="}":
            k=pop();assert k in ("JOINT","End");joint(idx,k)
        pop("}")
    pop("HIERARCHY");pop("ROOT");joint(-1,"ROOT");assert i==len(t)
    mm=re.fullmatch(r"\s*Frames:\s*(\d+)\s+Frame Time:\s*([0-9.eE+-]+)\s+(.*)",m,re.S);assert mm
    frames=int(mm[1]);dt=float(mm[2]);assert abs(dt-1/60)<1e-5 and 240<frames<100000
    values=np.fromstring(mm[3],sep=" ");assert values.size==frames*count
    values=values.reshape(frames,count);assert np.isfinite(values).all()
    xyz=np.zeros((frames,len(nodes),3));world=np.empty((frames,len(nodes),3,3));local=np.empty_like(world)
    for k,n in enumerate(nodes):
        ch=n["channels"];v=values[:,n["start"]:n["start"]+len(ch)]
        pos=np.tile(n["offset"],(frames,1));axes=[];angles=[]
        for j,c in enumerate(ch):
            if c.endswith("position"):pos[:,"XYZ".index(c[0])]+=v[:,j]*.01
            else:assert c.endswith("rotation");axes.append(c[0]);angles.append(v[:,j])
        rot=Rotation.from_euler("".join(axes),np.array(angles).T,degrees=True).as_matrix() if axes else np.broadcast_to(np.eye(3),(frames,3,3))
        local[:,k]=rot;p=n["parent"]
        if p<0:xyz[:,k]=pos;world[:,k]=rot
        else:xyz[:,k]=xyz[:,p]+np.einsum("fij,fj->fi",world[:,p],pos);world[:,k]=world[:,p]@rot
    return nodes,dt,xyz,local

def unit(v):
    return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-12)
def ratios(row):
    return {k:float(row[k]/v) for k,v in LIMITS.items()}
def evaluate(a,b,root,xyz,local,vel,rv,feet,dt,stationary=False):
    stride=root[b]-root[a];stride[1]=0
    if stationary:stride[:]=0
    pose=Rotation.from_matrix(local[b]@np.swapaxes(local[a],-1,-2)).magnitude()
    jumps=np.linalg.norm(vel[b-1]-vel[a],axis=-1)
    ordinary=np.max(np.linalg.norm(np.diff(vel[a:b],axis=0),axis=-1),axis=0)
    residual=np.linalg.norm(xyz[b,feet]-xyz[a,feet]-stride,axis=-1)
    row={"a":a,"b":b,"durationS":float((b-a)*dt),"strideM":stride.tolist(),"maxC0Rad":float(pose.max()),"rootVelocityJumpMps":float(np.linalg.norm(rv[b-1]-rv[a])),"footEndpointResidualM":float(residual.max()),"maxAngularVelocityJumpRadps":float(jumps.max()),"relativeJumpRatio":float(np.max(jumps/(2*ordinary+.10))),"C0ByJointRad":pose.tolist(),"angularJumpByJointRadps":jumps.tolist(),"ordinaryMaxByJointRadps":ordinary.tolist(),"footResidualsM":residual.tolist()}
    row["gateRatios"]=ratios(row);row["score"]=max(row["gateRatios"].values());row["pass"]=bool(row["score"]<=1)
    return row
def render(name,row,xyz,nodes,dt,root,feet):
    a,b=row["a"],row["b"];stride=np.array(row["strideM"]);n=b-a;folder=OUT/name;folder.mkdir(exist_ok=True)
    names={x["name"]:k for k,x in enumerate(nodes)};up=np.array([0.,1.,0.])
    lat=unit((xyz[a,names["RightHip"]]-xyz[a,names["LeftHip"]])*[1,0,1])
    direction=unit(stride) if np.linalg.norm(stride)>1e-6 else unit(np.cross(lat,up))
    lat=unit(np.cross(up,direction));direction=unit(np.cross(lat,up))
    floor=float(np.percentile(xyz[a:b+1,feet,1],5));colors={"Left":(65,150,218),"Right":(232,133,81),"body":(65,76,88)}
    def frame(i,repeat,view):
        f=a+i;delta=stride*repeat;center=root[a]+stride*(repeat+i/n);center[1]=floor
        xaxis=direction if view=="side" else lat if view=="front" else unit(lat+direction)
        pts=[(320+float((p+delta-center)@xaxis)*250,550-float((p+delta-center)@up)*250) for p in xyz[f]]
        im=Image.new("RGB",(640,640),(243,245,247));draw=ImageDraw.Draw(im);draw.line((15,550,625,550),fill=(160,170,174),width=2)
        for k,node in enumerate(nodes):
            parent=node["parent"]
            if parent<0:continue
            color=colors["Left" if node["name"].startswith("Left") else "Right" if node["name"].startswith("Right") else "body"]
            draw.line((pts[parent],pts[k]),fill=color,width=7);x,y=pts[k];draw.ellipse((x-5,y-5,x+5,y+5),fill=color)
        draw.text((16,12),name+" | "+view+" | source "+str(f)+" | repeat "+str(repeat+1),fill=(20,28,38))
        draw.text((16,608),"Native joints only; no physical sole or load-bearing claim.",fill=(45,55,65))
        return im
    # Explicit world repeat: root stride added exactly once, same linear camera track.
    frames=folder/"frames";frames.mkdir(exist_ok=True)
    for rep in range(3):
        for i in range(n):frame(i,rep,"side").save(frames/f"{rep*n+i:05}.png")
    for i in sorted({0,n//4,n//2,3*n//4,n}):
        for view in ("front","side","quarter"):frame(i,0,view).save(folder/f"{view}-{i:03}.png")
    for tag,rate in [("normal",60),("slow",30)]:
        subprocess.run([get_ffmpeg_exe(),"-hide_banner","-loglevel","error","-y","-framerate",str(rate),"-i",str(frames/"%05d.png"),"-c:v","libx264","-pix_fmt","yuv420p",str(folder/(tag+".mp4"))],check=True)
    row["videos"]=[str((folder/(s+".mp4")).relative_to(OUT)) for s in ("normal","slow")]
    row["renderedFrames"]=3*n;row["camera"]="world repeat with one stride addition and linear camera tracking"
    row["sourceJointFloorProxyM"]=floor
def proxies(row,xyz,feet,dt):
    a,b=row["a"],row["b"];p=xyz[a:b+1,feet];speed=np.linalg.norm(np.gradient(p,dt,axis=0),axis=-1)
    low=np.percentile(p[:,:,1],5,axis=0)
    # Diagnostic only, independently each ankle/toe; no actual surface or support.
    flags=(p[:,:,1]<=low+.03)&(speed<=.15)
    return {"semantics":"low joint and low 3D speed proxy only; not contact labels","heightAboveJointP05M":.03,"maxSpeedMps":.15,"perFrame":[{"frame":a+i,"positions":p[i].tolist(),"speedMps":speed[i].tolist(),"lowSlow":flags[i].tolist()} for i in range(len(p))]}

# Fixed selection from immutable prior source audit. No search of overlap width.
A,B,W=1166,1249,8
N=B-A
def parse_short(data):
    h,m=data.decode("utf-8-sig").split("MOTION",1)
    t=re.findall(r"\{|\}|[^\s{}]+",h);i=0;nodes=[];count=0
    def pop(expected=None):
        nonlocal i
        x=t[i];i+=1
        if expected is not None:assert x==expected,(x,expected)
        return x
    def joint(parent,kind):
        nonlocal count
        if kind=="End":
            pop("Site");name=nodes[parent]["name"]+"_end"
        else:name=pop()
        pop("{");pop("OFFSET");off=[float(pop())*.01 for _ in range(3)]
        ch=[];start=count
        if kind!="End":
            pop("CHANNELS");ch=[pop() for _ in range(int(pop()))];count+=len(ch)
        idx=len(nodes);nodes.append({"name":name,"parent":parent,"offset":off,"channels":ch,"start":start})
        while t[i]!="}":
            k=pop();assert k in ("JOINT","End");joint(idx,k)
        pop("}")
    pop("HIERARCHY");pop("ROOT");joint(-1,"ROOT");assert i==len(t)
    mm=re.fullmatch(r"\s*Frames:\s*(\d+)\s+Frame Time:\s*([0-9.eE+-]+)\s+(.*)",m,re.S);assert mm
    frames=int(mm[1]);dt=float(mm[2]);assert abs(dt-1/60)<1e-5 and frames==84
    values=np.fromstring(mm[3],sep=" ");assert values.size==frames*count
    values=values.reshape(frames,count);assert np.isfinite(values).all()
    xyz=np.zeros((frames,len(nodes),3));world=np.empty((frames,len(nodes),3,3));local=np.empty_like(world)
    for k,n in enumerate(nodes):
        ch=n["channels"];v=values[:,n["start"]:n["start"]+len(ch)]
        pos=np.tile(n["offset"],(frames,1));axes=[];angles=[]
        for j,c in enumerate(ch):
            if c.endswith("position"):pos[:,"XYZ".index(c[0])]+=v[:,j]*.01
            else:assert c.endswith("rotation");axes.append(c[0]);angles.append(v[:,j])
        rot=Rotation.from_euler("".join(axes),np.array(angles).T,degrees=True).as_matrix() if axes else np.broadcast_to(np.eye(3),(frames,3,3))
        local[:,k]=rot;p=n["parent"]
        if p<0:xyz[:,k]=pos;world[:,k]=rot
        else:xyz[:,k]=xyz[:,p]+np.einsum("fij,fj->fi",world[:,p],pos);world[:,k]=world[:,p]@rot
    return nodes,dt,xyz,local


def fk(nodes,local,root):
    n=len(root);xyz=np.zeros((n,len(nodes),3));world=np.empty((n,len(nodes),3,3))
    for k,node in enumerate(nodes):
        p=node["parent"]
        if p<0:xyz[:,k]=root;world[:,k]=local[:,k]
        else:
            xyz[:,k]=xyz[:,p]+np.einsum("fij,j->fi",world[:,p],node["offset"])
            world[:,k]=world[:,p]@local[:,k]
    return xyz
def angular_velocity(local,dt):
    return Rotation.from_matrix((local[1:]@np.swapaxes(local[:-1],-1,-2)).reshape(-1,3,3)).as_rotvec().reshape(len(local)-1,local.shape[1],3)/dt
def blend(data,nodes,dt,xyz,local):
    names={q["name"]:i for i,q in enumerate(nodes)}
    root=xyz[:,names["Hips"]];assert names["Hips"]==0
    assert all(not c.endswith("position") for q in nodes[1:] for c in q["channels"])
    assert np.max(np.abs(fk(nodes,local,root)-xyz))<1e-8
    stride=root[B]-root[A];stride[1]=0
    original_root=root[A:B+1].copy();original_rot=local[A:B+1].copy()
    new_root=original_root.copy();new_rot=original_rot.copy()
    for i in range(N+1):
        if i>W and i<N-W:continue
        t=i if i<=W else i-N
        x=(t+W)/(2*W);alpha=x*x*x*(10+x*(-15+6*x))
        outgoing=root[B+t]-stride;incoming=root[A+t]
        new_root[i]=(1-alpha)*outgoing+alpha*incoming+(stride if i>N-W-1 else 0)
        outgoing_rot=local[B+t];incoming_rot=local[A+t]
        # SLERP written as exponential of shortest relative rotation, same for all joints.
        delta=Rotation.from_matrix(incoming_rot@np.swapaxes(outgoing_rot,-1,-2)).as_rotvec()
        new_rot[i]=Rotation.from_rotvec(alpha*delta).as_matrix()@outgoing_rot
    # Export an actual derived BVH using exact source hierarchy and channel order.
    header,motion=data.decode("utf-8-sig").split("MOTION",1)
    mm=re.fullmatch(r"\s*Frames:\s*(\d+)\s+Frame Time:\s*([0-9.eE+-]+)\s+(.*)",motion,re.S);assert mm
    count=sum(len(q["channels"]) for q in nodes)
    original=np.fromstring(mm[3],sep=" ").reshape(len(root),count)[A:B+1].copy()
    values=original.copy()
    changed=list(range(W+1))+list(range(N-W,N+1))
    for k,node in enumerate(nodes):
        ch=node["channels"];start=node["start"];axes=[];indices=[]
        for j,c in enumerate(ch):
            if c.endswith("position"):values[changed,start+j]=(new_root[changed,"XYZ".index(c[0])]-node["offset"]["XYZ".index(c[0])])*100
            else:axes.append(c[0]);indices.append(start+j)
        if axes:
            angles=Rotation.from_matrix(new_rot[changed,k]).as_euler("".join(axes),degrees=True)
            values[np.ix_(changed,indices)]=angles
    derived=(header+"MOTION\nFrames: "+str(N+1)+"\nFrame Time: "+mm[2]+"\n"+"\n".join(" ".join(format(x,".12g") for x in row) for row in values)+"\n").encode()
    out=OUT/"Neutral_FW_overlap.bvh";out.write_bytes(derived)
    nn,dd,xx,ll=parse_short(derived)
    assert nn==nodes and dd==dt and len(xx)==N+1
    expected=fk(nodes,new_rot,new_root)
    reparse_pos=float(np.max(np.linalg.norm(xx-expected,axis=-1)))
    reparse_angle=float(np.max(Rotation.from_matrix((ll@np.swapaxes(new_rot,-1,-2)).reshape(-1,3,3)).magnitude()))
    assert reparse_pos<=.0001 and reparse_angle<=math.radians(.01)
    feet=[names[s+t] for s in ("Left","Right") for t in ("Ankle","Toe")]
    animated=[k for k,q in enumerate(nodes) if q["channels"]]
    local0=local[A:B+1,animated];local1=ll[:,animated]
    orig_xyz=xyz[A:B+1];orig_root=orig_xyz[:,0];new_root=xx[:,0]
    prev=evaluate(0,N,orig_root,orig_xyz,local0,angular_velocity(local0,dt),np.diff(orig_root,axis=0)/dt,feet,dt)
    cand=evaluate(0,N,new_root,xx,local1,angular_velocity(local1,dt),np.diff(new_root,axis=0)/dt,feet,dt)
    delta=Rotation.from_matrix((local1@np.swapaxes(local0,-1,-2)).reshape(-1,3,3)).magnitude().reshape(N+1,len(animated))
    middle=slice(W+1,N-W)
    checks={"maxAngularChangeDeg":float(np.degrees(delta.max())),"maxRootChangeM":float(np.max(np.linalg.norm(new_root-orig_root,axis=-1))),"maxFootChangeM":float(np.max(np.linalg.norm(xx[:,feet]-orig_xyz[:,feet],axis=-1))),"unchangedMiddleRootM":float(np.max(np.linalg.norm(new_root[middle]-orig_root[middle],axis=-1))),"unchangedMiddleRotationRad":float(delta[middle].max()),"strideErrorM":float(np.linalg.norm(np.array(cand["strideM"])-stride)),"reparsePositionM":reparse_pos,"reparseRotationDeg":float(np.degrees(reparse_angle))}
    lengths=[]
    for k,node in enumerate(nodes):
        if node["parent"]>=0:lengths.append(float(np.max(np.abs(np.linalg.norm(xx[:,k]-xx[:,node["parent"]],axis=-1)-np.linalg.norm(node["offset"])))))
    checks["maxBoneLengthErrorM"]=max(lengths)
    # Three actual tiled repetitions, duplicate endpoint excluded, stride added once.
    tiled=np.concatenate([xx[:-1]+rep*np.array(cand["strideM"])[None,None,:] for rep in range(3)])
    tile_rot=np.concatenate([local1[:-1] for rep in range(3)])
    tile_vel=angular_velocity(tile_rot,dt);tile_rv=np.diff(tiled[:,0],axis=0)/dt
    checks["tiledSeams"]=[{"boundary":k,"rootVelocityJumpMps":float(np.linalg.norm(tile_rv[k]-tile_rv[k-1])),"maxAngularVelocityJumpRadps":float(np.max(np.linalg.norm(tile_vel[k]-tile_vel[k-1],axis=-1)))} for k in (N,2*N)]
    fails=[]
    if not cand["pass"]:fails.append("SEAM")
    if checks["maxAngularChangeDeg"]>5:fails.append("ANGULAR_DISTORTION")
    if checks["maxRootChangeM"]>.025:fails.append("ROOT_DISTORTION")
    if checks["maxFootChangeM"]>.025:fails.append("FOOT_DISTORTION")
    if max(checks["unchangedMiddleRootM"],checks["unchangedMiddleRotationRad"],checks["strideErrorM"],checks["maxBoneLengthErrorM"])>1e-7:fails.append("INVARIANTS")
    if any(t["rootVelocityJumpMps"]>.1 or t["maxAngularVelocityJumpRadps"]>2 for t in checks["tiledSeams"]):fails.append("TILED_SEAM")
    R.update({"sourceFrames":[A,B],"overlapHalfWidthFrames":W,"durationS":N*dt,"original":prev,"derived":cand,"checks":checks,"failures":fails,"derivedFile":out.name,"derivedSha256":hashlib.sha256(derived).hexdigest(),"status":"OVERLAP_SCREEN_PASS" if not fails else "OVERLAP_HOLD","contactProxies":proxies(cand,xx,feet,dt)})
    save()
    render("original",prev,orig_xyz,nodes,dt,orig_root,feet)
    render("derived",cand,xx,nodes,dt,new_root,feet)
    save()
(OUT/"ATTRIBUTION.txt").write_text(CREDIT+"\n");save()
# Same frozen parser with its frame-count precondition adapted only to the 84-key derived excerpt.
data=acquire("Neutral_FW");nodes,dt,xyz,local=parse(data);assert len(xyz)==7896
blend(data,nodes,dt,xyz,local)
print(R["status"],flush=True)
