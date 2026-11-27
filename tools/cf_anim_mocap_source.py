"""100STYLE source-only native BVH audit. No target, contact solver, or motion edits."""
import os,sys,math,json,re,hashlib,urllib.request,pathlib,subprocess
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.signal import find_peaks
from PIL import Image,ImageDraw
from imageio_ffmpeg import get_ffmpeg_exe
import bpy
OUT=pathlib.Path("artifacts/cf-anim-mocap-source");OUT.mkdir(parents=True,exist_ok=True)
PIN="10938b4881b55c5801faded89e427407ddf14bce"
INPUTS={"Neutral_FW":("1-TqZdIJvpr-QVvAmYJREUZkuAgpAQSfd","a534f69b1d7a867f9b7d4dccefcf3f1d255c4a61"),"Neutral_ID":("1Vnz5wnFmOztNzaSBHjSt9v6y0pl0FK8X","03ee0170cd813f997e528a05f87c41874a734ff5")}
CREDIT="The 100STYLE Dataset - Ian Mason (Mason, Starke, Komura, 2022). CC BY 4.0. https://www.ianxmason.com/100style/ https://creativecommons.org/licenses/by/4.0/ . Diagnostic rendering and temporal excerpt; original joint motion unmodified."
R={"head":os.environ["EXPECTED_SHA"],"stage":"MOCAP-SOURCE","status":"PENDING","credit":CREDIT,"sources":[],"clips":[],"ART":"OPEN","scope":"native BVH joint skeleton only; no skin or target; no cyclic smoothing"}
def save(): (OUT/"report.json").write_text(json.dumps(R,indent=2,allow_nan=False))
def read(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"LifeSim source research"}),timeout=45) as f:
        d=f.read(40_000_001)
    assert 0<len(d)<=40_000_000 and d.lstrip().startswith(b"HIERARCHY"),"not a bounded BVH"
    return d
def acquire(name):
    ident,blob=INPUTS[name];official="https://drive.google.com/uc?export=download&id="+ident
    mirror="https://raw.githubusercontent.com/tomcatmew/Simple_Motion_Matching/"+PIN+"/data/100style/"+name+".bvh"
    try:
        data=read(official);url=official;origin="author download";err=None
    except Exception as e:
        err=str(e);data=read(mirror);url=mirror;origin="pinned third-party copy; original-byte identity not verified"
        assert hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest()==blob
    row={"name":name,"url":url,"official":official,"origin":origin,"officialError":err,"sha256":hashlib.sha256(data).hexdigest(),"gitBlob":hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest(),"mirrorExpectedBlob":blob,"bytes":len(data)}
    R["sources"].append(row);save();return data,row
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
def independent_import(data,nodes,xyz):
    # Compare independent Blender importer to parser without relying on axis sign.
    tmp=OUT/"native-input.bvh";tmp.write_bytes(data)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_anim.bvh(filepath=str(tmp.resolve()),target='ARMATURE',global_scale=.01,frame_start=1,use_fps_scale=False,update_scene_fps=True,rotate_mode='NATIVE')
    arm=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
    scene=bpy.context.scene
    names=[(i,n["name"]) for i,n in enumerate(nodes) if n["channels"]]
    err=[]
    for f in [0,len(xyz)//4,len(xyz)//2,3*len(xyz)//4,len(xyz)-1]:
        scene.frame_set(f+1);bpy.context.view_layer.update()
        a=np.array([list(arm.matrix_world@arm.pose.bones[name].head) for _,name in names])
        b=xyz[f,[i for i,_ in names]]
        err.append(float(np.max(np.abs(np.linalg.norm(a[:,None]-a[None,:],axis=-1)-np.linalg.norm(b[:,None]-b[None,:],axis=-1)))))
    tmp.unlink()
    assert max(err)<.003,("independent BVH importer discrepancy",err)
    return {"maxPairwiseDistanceErrorM":max(err),"sampleFrames":5,"blender":bpy.app.version_string}
def unit(v):
    return v/max(np.linalg.norm(v),1e-9)
def analyse(name,nodes,dt,xyz,local):
    names={n["name"]:k for k,n in enumerate(nodes)}
    def j(n):return xyz[:,names[n]]
    root=j("Hips");up=np.array([0.,1.,0.]);head=j("Head")
    arms=(j("LeftWrist")[:,1]<j("LeftShoulder")[:,1]-.12)&(j("RightWrist")[:,1]<j("RightShoulder")[:,1]-.12)
    speed=np.linalg.norm(np.diff(root[:,[0,2]],axis=0),axis=-1)/dt
    n=len(xyz);pad=round(1/dt);L=round((4 if name.endswith("FW") else 3)/dt);windows=[]
    for a in range(pad,n-pad-L,15):
        b=a+L;delta=root[b,[0,2]]-root[a,[0,2]];travel=np.linalg.norm(delta);path=float(speed[a:b].sum()*dt);mean=travel/(L*dt);ratio=travel/max(path,1e-9)
        armed=float(arms[a:b+1].mean())
        ok=(.6<=mean<=2 and ratio>=.95 and armed>=.98) if name.endswith("FW") else (travel<=.12 and path/(L*dt)<=.10 and armed>=.98)
        windows.append({"a":a,"b":b,"speedMps":mean,"straightness":ratio,"pathM":path,"armsDownFraction":armed,"eligible":bool(ok)})
    row={"name":name,"frames":n,"dt":dt,"fps":1/dt,"nodes":nodes,"windows":windows,"status":"PENDING"}
    R["clips"].append(row);save()
    eligible=[w for w in windows if w["eligible"]]
    if not eligible:row["status"]="NO_ELIGIBLE_WINDOW";save();return
    w=eligible[0] if name.endswith("FW") else min(eligible,key=lambda x:abs((x["a"]+x["b"])/2-n/2))
    a,b=w["a"],w["b"];row["window"]=w
    right=unit(np.mean((j("RightHip")-j("LeftHip"))[a:b+1],axis=0)*[1,0,1])
    direction=unit((root[b]-root[a])*[1,0,1]) if name.endswith("FW") else unit(np.cross(right,up))
    # Keep a fixed camera basis, not per-frame alignment or pose correction.
    right=unit(np.cross(up,direction));direction=unit(np.cross(right,up))
    row["cameraForward"]=direction.tolist()
    def flex(a1,b1,c1):
        u=j(a1)-j(b1);v=j(c1)-j(b1)
        return 180-np.degrees(np.arccos(np.clip(np.sum(u*v,axis=1)/(np.linalg.norm(u,axis=1)*np.linalg.norm(v,axis=1)),-1,1)))
    row["landmarks"]=[]
    for f in range(a,b+1):
        d=(j("LeftAnkle")[f]-j("RightAnkle")[f])*[1,0,1]
        row["landmarks"].append({"frame":f,"root":root[f].tolist(),"footSpacingM":float(np.linalg.norm(d)),"kneeFlexDeg":[float(flex(s+"Hip",s+"Knee",s+"Ankle")[f]) for s in ("Left","Right")],"elbowFlexDeg":[float(flex(s+"Shoulder",s+"Elbow",s+"Wrist")[f]) for s in ("Left","Right")],"ankleHeightM":[float(j(s+"Ankle")[f,1]) for s in ("Left","Right")],"toeHeightM":[float(j(s+"Toe")[f,1]) for s in ("Left","Right")]})
    row["heightEstimateM"]=float(np.median(head[a:b+1,1]-np.minimum(j("LeftToe")[a:b+1,1],j("RightToe")[a:b+1,1])))
    row["cycles"]=[]
    if name.endswith("FW"):
        rel=(j("LeftAnkle")-j("RightAnkle"))@direction
        peaks,_=find_peaks(rel[a:b+1],distance=round(.55/dt),prominence=.12)
        for i,k in zip(peaks,peaks[1:]):
            u,v=a+int(i),a+int(k)
            if not .65<=(v-u)*dt<=1.6:continue
            ro=Rotation.from_matrix(local[v]@np.swapaxes(local[u],-1,-2)).magnitude()
            def vel(i,j):return Rotation.from_matrix(local[j]@np.swapaxes(local[i],-1,-2)).as_rotvec()/dt
            jump=np.linalg.norm(vel(v-1,v)-vel(u,u+1),axis=1)
            row["cycles"].append({"a":u,"b":v,"durationS":(v-u)*dt,"rootTravelM":float(np.linalg.norm((root[v]-root[u])*[1,0,1])),"C0Rad":ro.tolist(),"velocityJumpRadps":jump.tolist(),"maxC0Rad":float(ro.max()),"maxVelocityJumpRadps":float(jump.max())})
    folder=OUT/name;folder.mkdir(exist_ok=True)
    floor=float(np.percentile(np.minimum(j("LeftToe")[a:b+1,1],j("RightToe")[a:b+1,1]),5));row["visualFloor"]="5th percentile toe joint, not physical sole"
    colors={"Left":(65,150,218),"Right":(232,133,81),"body":(65,76,88)}
    def frame(f,view):
        image=Image.new("RGB",(640,640),(243,245,247));draw=ImageDraw.Draw(image)
        center=root[a]+(root[b]-root[a])*(f-a)/(b-a);center[1]=floor
        xaxis=direction if view=="side" else right if view=="front" else unit(right+direction)
        # 250 pixels/m, vertical world-up, fixed linear camera tracking only.
        pts=[(320+float((p-center)@xaxis)*250,550-float((p-center)@up)*250) for p in xyz[f]]
        draw.line((15,550,625,550),fill=(160,170,174),width=2)
        for k,node in enumerate(nodes):
            p=node["parent"]
            if p<0:continue
            color=colors["Left" if node["name"].startswith("Left") else "Right" if node["name"].startswith("Right") else "body"]
            draw.line((pts[p],pts[k]),fill=color,width=7)
            x,y=pts[k];draw.ellipse((x-5,y-5,x+5,y+5),fill=color)
        draw.text((16,12),name+" | "+view+" | frame "+str(f)+" | "+format(f*dt,".2f")+" s",fill=(20,28,38))
        draw.text((16,608),"Native joint skeleton; no skinned surface or physical floor claim.",fill=(45,55,65))
        return image
    ff=get_ffmpeg_exe()
    for f in range(a,b+1):
        frame(f,"side").save(folder/f"side-{f-a:04}.png")
        if f in {a,a+(b-a)//4,a+(b-a)//2,a+3*(b-a)//4,b}:
            for view in ("front","quarter"):frame(f,view).save(folder/f"{view}-{f-a:04}.png")
    for tag,rate in [("normal",60),("slow",30)]:
        subprocess.run([ff,"-hide_banner","-loglevel","error","-y","-framerate",str(rate),"-i",str(folder/"side-%04d.png"),"-c:v","libx264","-pix_fmt","yuv420p",str(folder/(tag+".mp4"))],check=True)
    row["videos"]=[str((folder/(s+".mp4")).relative_to(OUT)) for s in ("normal","slow")]
    row["status"]="CAPTURED";save()
(OUT/"ATTRIBUTION.txt").write_text(CREDIT+"\n")
save()
for name in INPUTS:
    data,src=acquire(name)
    nodes,dt,xyz,local=parse(data)
    src["independentImport"]=independent_import(data,nodes,xyz);save()
    analyse(name,nodes,dt,xyz,local)
assert len(R["clips"])==2 and all(r["status"] in ("CAPTURED","NO_ELIGIBLE_WINDOW") for r in R["clips"])
R["status"]="NATIVE_CAPTURE_COMPLETE" if all(r["status"]=="CAPTURED" for r in R["clips"]) else "SOURCE_WINDOW_HOLD"
save();print(R["status"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
