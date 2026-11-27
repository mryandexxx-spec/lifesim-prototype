"""Select a naturally repeating 100STYLE source excerpt; never edit a captured key."""
import os,sys,math,json,re,hashlib,urllib.request,pathlib,subprocess
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.signal import find_peaks
from PIL import Image,ImageDraw
from imageio_ffmpeg import get_ffmpeg_exe
OUT=pathlib.Path("artifacts/cf-anim-mocap-cycle");OUT.mkdir(parents=True,exist_ok=True)
INPUTS={"Neutral_FW":("1-TqZdIJvpr-QVvAmYJREUZkuAgpAQSfd","2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",7896),"Neutral_ID":("1Vnz5wnFmOztNzaSBHjSt9v6y0pl0FK8X","71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",2103)}
CREDIT="The 100STYLE Dataset - Ian Mason (Mason, Starke, Komura, 2022). CC BY 4.0. https://www.ianxmason.com/100style/ https://creativecommons.org/licenses/by/4.0/ . Excerpts and diagnostic renders; no source key edits."
LIMITS={"maxC0Rad":math.radians(5),"rootVelocityJumpMps":.1,"footEndpointResidualM":.025,"maxAngularVelocityJumpRadps":2.,"relativeJumpRatio":1.}
R={"head":os.environ["EXPECTED_SHA"],"stage":"MOCAP-CYCLE","status":"PENDING","limits":LIMITS,"credit":CREDIT,"sources":[],"clips":{},"ART":"OPEN"}
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
def run(name):
    data=acquire(name);nodes,dt,xyz,local=parse(data);assert len(xyz)==INPUTS[name][2]
    names={n["name"]:k for k,n in enumerate(nodes)};root=xyz[:,names["Hips"]];n=len(root)
    animated=[k for k,node in enumerate(nodes) if node["channels"]];local=local[:,animated]
    feet=[names[s+t] for s in ("Left","Right") for t in ("Ankle","Toe")]
    vel=Rotation.from_matrix((local[1:]@np.swapaxes(local[:-1],-1,-2)).reshape(-1,3,3)).as_rotvec().reshape(n-1,len(animated),3)/dt
    rv=np.diff(root,axis=0)/dt
    row={"fps":1/dt,"jointNames":[nodes[k]["name"] for k in animated],"footNames":[nodes[k]["name"] for k in feet],"candidateCount":0,"passingCount":0}
    R["clips"][name]=row;save()
    if name.endswith("ID"):
        chosen=evaluate(960,1140,root,xyz,local,vel,rv,feet,dt,True);row["candidateCount"]=1;row["passingCount"]=int(chosen["pass"]);row["stationaryRoot"]=True
    else:
        def j(s):return xyz[:,names[s]]
        lat=unit((j("RightHip")-j("LeftHip"))*[1,0,1]);forward=unit(np.cross(lat,np.array([0.,1.,0.])))
        rel=np.sum((j("LeftAnkle")-j("RightAnkle"))*forward,axis=1)
        pos,_=find_peaks(rel,distance=round(.45/dt),prominence=.12)
        neg,_=find_peaks(-rel,distance=round(.45/dt),prominence=.12)
        arms=(j("LeftWrist")[:,1]<j("LeftShoulder")[:,1]-.12)&(j("RightWrist")[:,1]<j("RightShoulder")[:,1]-.12)
        speed=np.linalg.norm(rv[:,[0,2]],axis=-1)
        # Compare adjacent same-phase extrema; allow nearby sampled endpoints only.
        seen=set();candidates=[]
        for peaks,opposite in ((pos,neg),(neg,pos)):
            for u,v in zip(peaks,peaks[1:]):
                if not np.any((opposite>u)&(opposite<v)):continue
                for a in range(int(u)-4,int(u)+5):
                    for b in range(int(v)-4,int(v)+5):
                        if (a,b) in seen or a<60 or b>=n-60 or not .65<=(b-a)*dt<=1.6:continue
                        seen.add((a,b))
                        dist=float(np.linalg.norm((root[b]-root[a])*[1,0,1]));path=float(speed[a:b].sum()*dt);mean=dist/((b-a)*dt);straight=dist/max(path,1e-12);down=float(arms[a:b+1].mean())
                        if not (.6<=mean<=2 and straight>=.95 and down>=.98):continue
                        q=evaluate(a,b,root,xyz,local,vel,rv,feet,dt);q.update({"speedMps":mean,"straightness":straight,"armsDownFraction":down,"samePhasePeaks":[int(u),int(v)]});candidates.append(q)
        row["positiveExtrema"]=pos.tolist();row["negativeExtrema"]=neg.tolist()
        row["candidateCount"]=len(candidates);row["passingCount"]=sum(q["pass"] for q in candidates)
        (OUT/"walk-candidates.json").write_text(json.dumps(candidates,allow_nan=False))
        if not candidates:row["status"]="NO_ELIGIBLE_INTERVAL";save();return
        chosen=min(candidates,key=lambda q:(q["score"],q["a"],q["b"]))
    row["selected"]=chosen;row["status"]="NATIVE_SEAM_SCREEN_PASS" if chosen["pass"] else "NATIVE_SEAM_HOLD"
    row["contactProxies"]=proxies(chosen,xyz,feet,dt);save()
    render(name,chosen,xyz,nodes,dt,root,feet);save()
# Synthetic negative control verifies a mismatched endpoint is rejected by the gate.
assert max(ratios(dict(maxC0Rad=0.,rootVelocityJumpMps=0.,footEndpointResidualM=0.,maxAngularVelocityJumpRadps=0.,relativeJumpRatio=0.)).values())==0
assert ratios(dict(maxC0Rad=math.radians(10),rootVelocityJumpMps=0.,footEndpointResidualM=0.,maxAngularVelocityJumpRadps=0.,relativeJumpRatio=0.))["maxC0Rad"]>1
(OUT/"ATTRIBUTION.txt").write_text(CREDIT+"\n");save()
for name in INPUTS:run(name)
R["status"]="SOURCE_CYCLE_SCREEN_PASS" if all(r["status"]=="NATIVE_SEAM_SCREEN_PASS" for r in R["clips"].values()) else "SOURCE_CYCLE_HOLD"
save();print(R["status"],flush=True)
