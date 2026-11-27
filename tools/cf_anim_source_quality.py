"""Native source qualification, pinned CC0 inputs only. No target, solver or clip edits."""
import bpy,sys,pathlib,os,json,math,hashlib,io,zipfile,struct,re,subprocess,urllib.request
from imageio_ffmpeg import get_ffmpeg_exe
import numpy as np
from scipy.spatial.transform import Rotation
from mathutils import Vector
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,vertices,setup
from cf_anim_source_intake import PINS,download,MIRROR
from cf_anim_contact_temporal import seam_vectors,norms
FAMILY=sys.argv[1];assert FAMILY in ("ual-control","mesh2motion")
OUT=pathlib.Path("artifacts/cf-anim-source-quality")/FAMILY;OUT.mkdir(parents=True,exist_ok=True)
CONTROL_SHA="69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997"
REPORT={"head":os.environ["EXPECTED_SHA"],"stage":"SOURCE-QUALITY","family":FAMILY,"status":"PENDING","scope":"native authored clips, no edits, no target/furniture/ART acceptance","sources":[],"clips":[]}
def save(): (OUT/"report.json").write_text(json.dumps(REPORT,indent=2,allow_nan=False))
def stock_names(data):
    assert struct.unpack_from("<4sII",data)==(b"glTF",2,len(data))
    n,k=struct.unpack_from("<I4s",data,12);assert k==b"JSON"
    g=json.loads(data[20:20+n])
    return [a.get("name","") for a in g.get("animations",[])],len(g.get("skins",[]))
def eligible(name):
    low=name.lower()
    return "walk" in low and not any(x in low for x in ("back","side","left","right","crouch","attack","strafe","zombie","skeleton","turn","weapon","aim"))
def audit(data,label,member,action_name,role):
    path=OUT/"native-input.glb";path.write_bytes(data)
    arm,bones=import_rig(path);reset(arm,bones)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
    assert meshes
    scene=bpy.context.scene
    h,floor=setup(meshes);fps=scene.render.fps/scene.render.fps_base
    roles={}
    for key in ('pelvis','head','thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r','ball_l','ball_r','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','hand_l','hand_r'):
        hits=[b for b in bones if b.name.lower()==key];assert len(hits)==1,(key,[b.name for b in bones]);roles[key]=hits[0]
    def point(key):return arm.matrix_world@roles[key].head
    lateral=point('thigh_l')-point('thigh_r');lateral.z=0;lateral.normalize()
    forward=point('ball_l')-point('foot_l');forward.z=0;forward-=lateral*forward.dot(lateral);assert forward.length>.001;forward.normalize()
    def angle(a,b,c):return math.degrees((point(a)-point(b)).angle(point(c)-point(b)))
    def landmarks():
        p={k:list(point(k)) for k in roles};delta=point('foot_l')-point('foot_r');delta.z=0
        return {'positions':p,'footSpacingOverHeight':delta.length/h,'lateralFootSpacingOverHeight':abs(delta.dot(lateral))/h,'foreAftFootSpacingOverHeight':abs(delta.dot(forward))/h,'kneeFlexDeg':[180-angle('thigh_'+s,'calf_'+s,'foot_'+s) for s in ('l','r')],'elbowFlexDeg':[180-angle('upperarm_'+s,'lowerarm_'+s,'hand_'+s) for s in ('l','r')]}

    scene.cycles.samples=4
    a=next(a for a in bpy.data.actions if a.name==action_name or a.name.startswith(action_name+"."))
    ad=arm.animation_data_create();ad.action=a
    slots=[s for s in a.slots if s.target_id_type=="OBJECT"]
    if slots:ad.action_slot=slots[0]
    lo,hi=map(float,a.frame_range);duration=(hi-lo)/fps
    assert duration>.25 and duration<8,(action_name,duration)
    hips=[b for b in bones if re.search(r"hips?|pelvis",b.name,re.I)]
    hip=hips[0] if hips else next(b for b in bones if b.parent is None)
    def sample(time):
        f=lo+time*fps;k=math.floor(f);scene.frame_set(k,subframe=f-k);bpy.context.view_layer.update()
        p=np.array(arm.matrix_world@hip.head)
        q=np.array([list((b.parent.matrix.inverted()@b.matrix if b.parent else b.matrix).to_quaternion()) for b in bones])
        return p,q
    first=sample(0);last=sample(duration)
    stride=last[0]-first[0];stride[2]=0
    q0=Rotation.from_quat(first[1][:,[1,2,3,0]]);q1=Rotation.from_quat(last[1][:,[1,2,3,0]])
    c0=np.linalg.norm((q1*q0.inv()).as_rotvec(),axis=1)
    rates={}
    for hz in (24,60,120,240):
        dt=1/hz
        ss=[sample(k) for k in (0,dt,duration-dt,duration)]
        v=norms(seam_vectors(ss,dt,stride))
        # Compare actual seam with ordinary adjacent samples, not a claim that
        # any nonzero finite difference equals a true derivative discontinuity.
        count=round(duration*hz);delta=duration/count
        seq=[sample(k*delta) for k in range(count+1)]
        p=np.array([x[0] for x in seq]);q=Rotation.from_quat(np.array([x[1] for x in seq]).reshape(-1,4)[:,[1,2,3,0]])
        ar=q.as_quat().reshape(count+1,len(bones),4)
        u=Rotation.from_quat(ar[1:].reshape(-1,4));w=Rotation.from_quat(ar[:-1].reshape(-1,4))
        av=(u*w.inv()).as_rotvec().reshape(count,len(bones),3)/delta
        ordinary=np.linalg.norm(np.diff(av,axis=0),axis=-1)
        rates[str(hz)]={"rootVelocityJumpMps":float(v[0,0]),"angularJumpRadps":v[0,1:].tolist(),"tiledRootVelocityJumpMps":float(v[1,0]),"tiledAngularJumpRadps":v[1,1:].tolist(),"interiorP95AngularVelocityDifferenceRadps":np.percentile(ordinary,95,axis=0).tolist(),"interiorMaxRootVelocityDifferenceMps":float(np.max(np.linalg.norm(np.diff(p,n=2,axis=0),axis=1))/delta)}
    row={"role":role,"landmarks":[],"source":label,"nativeHeightM":h,"rootTravelVectorM":stride.tolist(),"member":member,"sourceGlbSha256":hashlib.sha256(data).hexdigest(),"action":action_name,"names":[b.name for b in bones],"hip":hip.name,"durationS":duration,"sourceSceneFps":fps,"rootHorizontalTravelM":float(np.linalg.norm(stride)),"rootVerticalSeamM":abs(float(last[0][2]-first[0][2])),"angularC0Rad":c0.tolist(),"rates":rates,"floorMinM":[],"renders":[]}
    REPORT["clips"].append(row);save()
    # Full one-cycle replay, excluding duplicate endpoint in video. Fixed side camera
    # tracks only the known average stride (not actual pelvis jitter); report explicitly.
    # This is a camera-relative repeated preview, not a physical world replay.
    cam=scene.camera;center=Vector(first[0]);center.z=floor+h*.50
    cam.data.ortho_scale=h*1.35
    scene.render.resolution_percentage=100
    n=max(12,round(duration*24));rate=n/duration
    folder=OUT/f"{len(REPORT['clips']):02}-{re.sub(r'[^A-Za-z0-9_-]+','_',action_name)}-{label}"
    folder.mkdir(exist_ok=True)
    for k in range(n+1):
        frac=k/n;sample(frac*duration)
        row["floorMinM"].append(float(min(p.z for p in vertices(meshes))-floor));row["landmarks"].append({"time":frac*duration,**landmarks()})
        c=center+Vector(stride*frac)
        cam.location=c+(3*lateral+Vector((0,0,.2)))*h;cam.rotation_euler=(c-cam.location).to_track_quat("-Z","Y").to_euler()
        name=folder/f"side-{k:03}.png"
        scene.render.filepath=str(name);bpy.ops.render.render(write_still=True)
        assert name.stat().st_size>0;row["renders"].append(str(name.relative_to(OUT)))
        if k in {0,n//4,n//2,3*n//4,n}:
            cam.location=c+(2*lateral+3*forward+Vector((0,0,.5)))*h;cam.rotation_euler=(c-cam.location).to_track_quat("-Z","Y").to_euler()
            qname=folder/f"quarter-{k:03}.png";scene.render.filepath=str(qname)
            bpy.ops.render.render(write_still=True);assert qname.stat().st_size>0
            row.setdefault("quarterRenders",[]).append(str(qname.relative_to(OUT)))
            cam.location=c+(3*forward+Vector((0,0,.2)))*h;cam.rotation_euler=(c-cam.location).to_track_quat("-Z","Y").to_euler()
            fname=folder/f"front-{k:03}.png";scene.render.filepath=str(fname);bpy.ops.render.render(write_still=True);assert fname.stat().st_size>0
            row.setdefault("frontRenders",[]).append(str(fname.relative_to(OUT)))
    # Repeat exact sampled source frames without editing motion or including duplicate endpoint.
    ff=get_ffmpeg_exe()
    for tag,speed in [("normal",1.0),("slow",.5)]:
        pathvideo=folder/f"{tag}.mp4"
        cmd=[ff,"-hide_banner","-loglevel","error","-y","-framerate",str(rate*speed),"-i",str(folder/"side-%03d.png"),"-frames:v",str(n),"-c:v","libx264","-pix_fmt","yuv420p",str(folder/"cycle.mp4")]
        subprocess.run(cmd,check=True)
        subprocess.run([ff,"-hide_banner","-loglevel","error","-y","-stream_loop","2","-i",str(folder/"cycle.mp4"),"-c","copy",str(pathvideo)],check=True)
        row.setdefault("videos",{})[tag]=str(pathvideo.relative_to(OUT))
        (folder/"cycle.mp4").unlink()
    row["preview"]={"samplesPerCycle":n,"sampleRateHz":rate,"repeats":3,"camera":"side, linear authored stride compensation","worldReplay":False}
    save();print(label,action_name,"maxAngular24/240",max(rates["24"]["angularJumpRadps"]),max(rates["240"]["angularJumpRadps"]),flush=True)
    path.unlink()

M2PIN="88b8d089f8b99deea431b2decf01660340a1e0a8"
M2BASE="https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/"+M2PIN+"/"
FILES=[("human-base-animations.glb","540c8d63bce29cec9a135cd33f6fc6a995d85dd4"),("human-addon-animations.glb","b314ab1a99c546882786b44745915d97f32b6a88")]
def read_blob(path,sha,limit):
    with urllib.request.urlopen(M2BASE+path,timeout=60) as r:data=r.read(limit+1)
    assert 0<len(data)<=limit
    assert hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest()==sha,(path,len(data))
    return data
def glb_doc(data):
    assert struct.unpack_from("<4sII",data)==(b"glTF",2,len(data))
    n,k=struct.unpack_from("<I4s",data,12);assert k==b"JSON"
    return json.loads(data[20:20+n])
def inventory(data,label,member):
    d=glb_doc(data);names=[a["name"] for a in d.get("animations",[])];assert len(names)==len(set(names))
    durations={}
    for a in d["animations"]:
        ts=[d["accessors"][s["input"]] for s in a["samplers"]]
        durations[a["name"]]=max(x["max"][0] for x in ts)-min(x["min"][0] for x in ts)
    row={"source":label,"member":member,"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data),"names":names,"durations":durations,"skins":len(d.get("skins",[])),"meshes":len(d.get("meshes",[])),"asset":d["asset"],"extras":d.get("extras"),"clipExtras":{a["name"]:a.get("extras") for a in d["animations"]}}
    REPORT["sources"].append(row);save();return row
def rank(name,role):
    # Names are a shortlist filter, never proof of neutral posture or provenance.
    x=re.sub(r"[^a-z0-9]+"," ",re.sub(r"([a-z])([A-Z])",r"\1 \2",name)).lower().strip()
    if any(w in x for w in ("combat","fight","attack","weapon","sword","shield","pistol","rifle","bow","aim","crouch","run","sprint","jog","zombie","skeleton","tired","hurt","hit","death","sleep","sit","lay","lie","jump","fall","swim","dance","talk","gesture","wave","cheer","back","left","right","side","turn","strafe","sneak","crawl","walk to","idle to","to idle","look around","phone","angry","block","victory","formal")):return None
    if role=="idle":
        if not re.search(r"\bidl(e|ing)\b|\bstanding\b|\bstand\b",x):return None
        if not re.search(r"\bidle\b",x) and not re.search(r"\bstanding\b|\bstand\b",x):return None
        return 0 if any(w in x for w in ("neutral","relaxed","casual")) else 1 if x in ("idle","idle loop","standing idle","idle standing","stand idle") else 2
    if not re.search(r"\bwalk(ing)?\b",x):return None
    return 0 if any(w in x for w in ("neutral","relaxed","casual","normal")) else 1 if x in ("walk","walking","walk loop","walking loop","walk forward","walking forward") else 2
if FAMILY=="ual-control":
    pin=next(p for p in PINS if p[0]=="ual1");raw=download(pin[1],pin[2],pin[3],pin[4])
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        members=[n for n in z.namelist() if n.endswith("/UAL1_Standard.glb")];assert len(members)==1
        data=z.read(members[0]);assert hashlib.sha256(data).hexdigest()==CONTROL_SHA
    info=inventory(data,"ual1",members[0]);assert info["skins"]==1
    chosen=[("idle","Idle_Loop"),("walk","Walk_Loop")]
    for role,action in chosen:
        assert action in info["names"]
        audit(data,"ual1",members[0],action,role)
else:
    license=read_blob("LICENSE-CC0.MD","94ad1fbd6db91a77e2890ebf92c868a1201308a6",4096).decode()
    assert "CC0 1.0 Universal" in license and "animations" in license
    (OUT/"LICENSE-CC0.MD").write_text(license)
    REPORT["license"]={"url":M2BASE+"LICENSE-CC0.MD","claim":"CC0 blanket asset declaration; individual authorship/Quaternius derivation OPEN until review","commit":M2PIN}
    sources=[]
    for filename,sha in FILES:
        path="static/animations/"+filename;data=read_blob(path,sha,80_000_000);label="addon" if "addon" in filename else "base"
        info=inventory(data,label,path);info["gitBlob"]=sha;info["url"]=M2BASE+path;save()
        sources.append((label,path,data,info))
    selected=[]
    for role in ("idle","walk"):
        choices=[]
        for i,(label,path,data,info) in enumerate(sources):
            for name in info["names"]:
                value=rank(name,role)
                if value is not None and .25<info["durations"][name]<8 and info["skins"]==1 and info["meshes"]>0:
                    choices.append((value,0 if label=="addon" else 1,name,i))
        if choices:
            _,_,name,i=min(choices);selected.append((role,name,i))
    REPORT["selection"]=[{"role":role,"name":name,"member":sources[i][1]} for role,name,i in selected];save()
    if len(selected)!=2:
        REPORT["status"]="NO_ELIGIBLE_PAIR";save();print(REPORT["status"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
    for role,name,i in selected:
        label,path,data,info=sources[i];audit(data,label,path,name,role)
assert len(REPORT["clips"])==2 and all(len(x["renders"])>=12 and len(x["videos"])==2 and len(x["landmarks"])==len(x["renders"]) for x in REPORT["clips"])
REPORT["status"]="NATIVE_COMPARISON_CAPTURED";REPORT["ART"]="OPEN";REPORT["independentSource"]="OPEN";save()
print(REPORT["status"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
