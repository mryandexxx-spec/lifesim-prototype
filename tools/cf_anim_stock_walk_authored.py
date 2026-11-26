"""Ready-made stock walk qualification only; no retarget, solver or clip modifications."""
import bpy,sys,pathlib,os,json,math,hashlib,io,zipfile,struct,re,subprocess
from imageio_ffmpeg import get_ffmpeg_exe
import numpy as np
from scipy.spatial.transform import Rotation
from mathutils import Vector
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,vertices,setup
from cf_anim_source_intake import PINS,download,MIRROR
from cf_anim_contact_temporal import seam_vectors,norms
OUT=pathlib.Path("artifacts/cf-anim-stock-walk-authored");OUT.mkdir(parents=True,exist_ok=True)
CONTROL_SHA="69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997"
REPORT={"head":os.environ["EXPECTED_SHA"],"stage":"STOCK-WALK-AUTHORED","status":"PENDING","scope":"native authored clips, no edits, no target/furniture/ART acceptance","sources":[],"clips":[]}
def save(): (OUT/"report.json").write_text(json.dumps(REPORT,indent=2,allow_nan=False))
def stock_names(data):
    assert struct.unpack_from("<4sII",data)==(b"glTF",2,len(data))
    n,k=struct.unpack_from("<I4s",data,12);assert k==b"JSON"
    g=json.loads(data[20:20+n])
    return [a.get("name","") for a in g.get("animations",[])],len(g.get("skins",[]))
def eligible(name):
    low=name.lower()
    return "walk" in low and not any(x in low for x in ("back","side","left","right","crouch","attack","strafe","zombie","skeleton","turn","weapon","aim"))
def audit(data,label,member,action_name):
    path=OUT/"native-input.glb";path.write_bytes(data)
    arm,bones=import_rig(path);reset(arm,bones)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
    assert meshes
    scene=bpy.context.scene
    h,floor=setup(meshes);fps=scene.render.fps/scene.render.fps_base
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
    row={"source":label,"nativeHeightM":h,"rootTravelVectorM":stride.tolist(),"member":member,"sourceGlbSha256":hashlib.sha256(data).hexdigest(),"action":action_name,"names":[b.name for b in bones],"hip":hip.name,"durationS":duration,"sourceSceneFps":fps,"rootHorizontalTravelM":float(np.linalg.norm(stride)),"rootVerticalSeamM":abs(float(last[0][2]-first[0][2])),"angularC0Rad":c0.tolist(),"rates":rates,"floorMinM":[],"renders":[]}
    REPORT["clips"].append(row);save()
    # Full one-cycle replay, excluding duplicate endpoint in video. Fixed side camera
    # tracks only the known average stride (not actual pelvis jitter); report explicitly.
    # This is a camera-relative repeated preview, not a physical world replay.
    cam=scene.camera;center=Vector(first[0]);center.z=floor+h*.50
    cam.data.ortho_scale=h*1.35
    scene.render.resolution_percentage=100
    n=max(12,round(duration*24));rate=n/duration
    folder=OUT/f"{len(REPORT['clips']):02}-{action_name}-{label}"
    folder.mkdir(exist_ok=True)
    for k in range(n+1):
        frac=k/n;sample(frac*duration)
        row["floorMinM"].append(float(min(p.z for p in vertices(meshes))-floor))
        c=center+Vector(stride*frac)
        cam.location=c+Vector((3,0,.2))*h;cam.rotation_euler=(c-cam.location).to_track_quat("-Z","Y").to_euler()
        name=folder/f"side-{k:03}.png"
        scene.render.filepath=str(name);bpy.ops.render.render(write_still=True)
        assert name.stat().st_size>0;row["renders"].append(str(name.relative_to(OUT)))
        if k in {0,n//4,n//2,3*n//4,n}:
            cam.location=c+Vector((2,-3,.5))*h;cam.rotation_euler=(c-cam.location).to_track_quat("-Z","Y").to_euler()
            qname=folder/f"quarter-{k:03}.png";scene.render.filepath=str(qname)
            bpy.ops.render.render(write_still=True);assert qname.stat().st_size>0
            row.setdefault("quarterRenders",[]).append(str(qname.relative_to(OUT)))
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
def source(pin):
    label,repo,path,size,sha,license=pin
    raw=download(repo,path,size,sha)
    entry={"name":label,"archiveSha256":sha,"archiveBytes":size,"license":license,"repositoryPin":repo,"path":path,"inventory":[]}
    REPORT["sources"].append(entry);save()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        assert len(z.infolist())<2000 and sum(i.file_size for i in z.infolist())<350_000_000
        prefix="Universal Animation Library[Standard]/Unreal-Godot/"
        for suffix,variant,actions in [
            ("UAL1_Standard.glb","in-place",["Walk_Formal_Loop"]),
            ("UAL1_Standard_RM.glb","authored-root",["Walk_Loop","Walk_Formal_Loop"])]:
            member=prefix+suffix;data=z.read(member);names,skins=stock_names(data)
            assert skins==1
            if variant=="in-place":assert hashlib.sha256(data).hexdigest()==CONTROL_SHA
            entry["inventory"].append({"member":member,"actions":names,"skins":skins})
            for name in actions:
                assert name in names
                audit(data,variant,member,name)
source(next(p for p in PINS if p[0]=="ual1"))
REPORT["status"]="AUTHORED_AUDIT_COMPLETE"
save()
print(REPORT["status"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
