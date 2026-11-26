"""Ready-made stock walk qualification only; no retarget, solver or clip modifications."""
import bpy,sys,pathlib,os,json,math,hashlib,io,zipfile,struct,re
import numpy as np
from scipy.spatial.transform import Rotation
from mathutils import Vector
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,vertices,setup
from cf_anim_source_intake import PINS,download,MIRROR
from cf_anim_contact_temporal import seam_vectors,norms
OUT=pathlib.Path("artifacts/cf-anim-stock-walk");OUT.mkdir(parents=True,exist_ok=True)
KAY=("kaykit",MIRROR,"animations/KayKit-Character-Animations-Free-1.1.zip",14858957,"65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f","CC0-1.0")
REPORT={"head":os.environ["EXPECTED_SHA"],"stage":"STOCK-WALK","status":"PENDING","scope":"native authored clips, no edits, no target/furniture/ART acceptance","sources":[],"clips":[]}
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
    row={"source":label,"member":member,"sourceGlbSha256":hashlib.sha256(data).hexdigest(),"action":action_name,"names":[b.name for b in bones],"hip":hip.name,"durationS":duration,"sourceSceneFps":fps,"rootHorizontalTravelM":float(np.linalg.norm(stride)),"rootVerticalSeamM":abs(float(last[0][2]-first[0][2])),"angularC0Rad":c0.tolist(),"rates":rates,"floorMinM":[],"renders":[]}
    REPORT["clips"].append(row);save()
    cam=scene.camera;center=Vector((first[0]+last[0])/2);center.z=floor+h*.50
    cam.location=center+Vector((3,0,.2))*h;cam.rotation_euler=(center-cam.location).to_track_quat("-Z","Y").to_euler()
    cam.data.ortho_scale=max(h*1.65,h+float(np.linalg.norm(stride)))*1.1
    scene.render.resolution_percentage=80
    n=max(12,round(duration*24))
    for k in range(n+1):
        sample(k*duration/n)
        row["floorMinM"].append(float(min(p.z for p in vertices(meshes))-floor))
        if k in set(round(j*n/12) for j in range(13)):
            name=f"{label}-{len(REPORT['clips']):02}-{k:03}.png"
            scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True)
            assert (OUT/name).stat().st_size>0;row["renders"].append(name)
    save();print(label,action_name,"maxAngular24/240",max(rates["24"]["angularJumpRadps"]),max(rates["240"]["angularJumpRadps"]),flush=True)
    path.unlink()
def source(pin):
    label,repo,path,size,sha,license=pin
    raw=download(repo,path,size,sha)
    entry={"name":label,"archiveSha256":sha,"archiveBytes":size,"license":license,"repositoryPin":repo,"path":path,"inventory":[]}
    REPORT["sources"].append(entry);save()
    choices=[]
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        assert len(z.infolist())<2000 and sum(i.file_size for i in z.infolist())<350_000_000
        for member in z.namelist():
            if not member.lower().endswith(".glb"):continue
            data=z.read(member);names,skins=stock_names(data)
            if not skins:continue
            entry["inventory"].append({"member":member,"actions":names,"skins":skins})
            for name in names:
                if label=="ual1":
                    if name!="Walk_Loop" or not member.endswith("/UAL1_Standard.glb"):continue
                elif not eligible(name):continue
                # Prefer medium rigs and explicit forward walking, preserve all inventory.
                priority=(0 if "medium" in member.lower() else 1,0 if "walk" in name.lower() else 1,member,name)
                choices.append((priority,member,name))
        save()
        selected=[];seen=set()
        for _,member,name in sorted(choices):
            if name.lower() in seen:continue
            selected.append((member,name));seen.add(name.lower())
            if len(selected)>=(1 if label=="ual1" else 3):break
        assert selected,entry["inventory"]
        for member,name in selected:
            try:audit(z.read(member),label,member,name)
            except Exception as e:
                REPORT.setdefault("auditErrors",[]).append({"source":label,"member":member,"action":name,"error":str(e)})
                save();print("AUDIT ERROR",label,name,repr(e),flush=True)
for pin in (next(p for p in PINS if p[0]=="ual1"),KAY):source(pin)
complete=[x for x in REPORT["clips"] if len(x["renders"])>=12]
REPORT["status"]="STOCK_AUDIT_COMPLETE" if any(x["source"]=="ual1" for x in complete) and any(x["source"]=="kaykit" for x in complete) and not REPORT.get("auditErrors") else "STOCK_AUDIT_PARTIAL"
save()
print(REPORT["status"],flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
