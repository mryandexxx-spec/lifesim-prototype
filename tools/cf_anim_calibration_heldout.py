"""Discriminating VRMA calibration closure experiment. No motion fitting or solver."""
import bpy,sys,pathlib,os,json,hashlib,math,struct,subprocess
import numpy as np
from mathutils import Vector
from imageio_ffmpeg import get_ffmpeg_exe
sys.path.insert(0,str(pathlib.Path("frozen-retarget/tools").resolve()))
import cf_anim_rig_vrma as V
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,setup,locals_,vertices
clip=sys.argv[-1];assert clip in ("Neutral_ID","Neutral_FW")
PROFILE=os.environ["PROFILE"]
PINS={"male-grid_021-90":"218965e4c5d79d912a54f2ab13c65a7e38f69b8ed350ec612784ffd98e8ca16f","female-grid_201-100":"950d46a93155bc106cf311f2707d8348c81fd0f36247339e7ba4e67ee8d1030e","female-grid_201-110":"8293922dfaefbeee1a9aa8f814a2b3afeadf5386a0161e46909c2853eaaf18ab"}
assert PROFILE in PINS
OUT=pathlib.Path("artifacts/cf-anim-calibration-heldout")/PROFILE/clip;OUT.mkdir(parents=True,exist_ok=True)
SRC=pathlib.Path("input-transport")
source=json.loads((SRC/"source-report.json").read_text())
prior=json.loads((SRC/"target-report.json").read_text())
audit=json.loads((SRC/"source-vrma-audit.json").read_text())
assert source["head"]==prior["head"]==audit["head"]=="a8c0e88dba371bcf078ea80bf0a9b0f250fb60fb"
assert audit["status"]=="SOURCE_EXPORT_PASS" and source["clip"]==prior["clip"]==clip
(OUT/"ATTRIBUTION.txt").write_text((SRC/"ATTRIBUTION.txt").read_text()+"\nCalibration closure diagnostic, no source key modifications in real replay. Synthetic rest input for test only.\n")
rig=pathlib.Path("input-rigs")/(PROFILE+".glb")
assert hashlib.sha256(rig.read_bytes()).hexdigest()==PINS[PROFILE]
raw=(SRC/"source.vrma").read_bytes()
R={"head":os.environ["EXPECTED_SHA"],"clip":clip,"profile":PROFILE,"rigSha256":PINS[PROFILE],"priorHead":prior["head"],"sourceSha256":source["sourceSha256"],"vrmaSha256":hashlib.sha256(raw).hexdigest(),"cases":{},"status":"PENDING","ART":"OPEN"}
def save(): (OUT/"report.json").write_text(json.dumps(R,indent=2,allow_nan=False))
def qangle(a,b):return math.degrees(a.rotation_difference(b).angle if a.dot(b)>=0 else a.rotation_difference(-b).angle)
def zero_delta(data):
    n,kind=struct.unpack_from("<II",data,12);assert kind==0x4e4f534a
    g=json.loads(data[20:20+n]);size,kind=struct.unpack_from("<II",data,20+n);assert kind==0x004e4942
    buf=bytearray(data);base=28+n
    anim,=g["animations"];changed=set()
    for ch in anim["channels"]:
        t=ch["target"];prop=t["path"];assert prop in ("rotation","translation")
        node=g["nodes"][t["node"]];v=node.get(prop,[0,0,0,1] if prop=="rotation" else [0,0,0])
        sampler=anim["samplers"][ch["sampler"]];assert sampler.get("interpolation","LINEAR")=="LINEAR"
        acc=g["accessors"][sampler["output"]];view=g["bufferViews"][acc["bufferView"]]
        assert acc["componentType"]==5126 and not acc.get("sparse") and view.get("buffer",0)==0
        assert sampler["output"] not in changed,"unexpected shared sampler output";changed.add(sampler["output"])
        offset=base+view.get("byteOffset",0)+acc.get("byteOffset",0);stride=view.get("byteStride",4*len(v))
        for i in range(acc["count"]):struct.pack_into("<"+"f"*len(v),buf,offset+i*stride,*v)
    return bytes(buf),g
zero,g=zero_delta(raw);(OUT/"zero-probe.vrma").write_bytes(zero)
R["zeroProbeSha256"]=hashlib.sha256(zero).hexdigest()
def render(scene,cam,focus,offset,h,path):
    cam.location=focus+offset*h;cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler()
    scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);assert path.stat().st_size>0
def run(kind,closure):
    case=kind+("-closure" if closure else "-stock")
    arm,bones=import_rig(rig);reset(arm,bones)
    V.activate(arm);m=V.target_map();hum,calibrate=V.addon(arm,m)
    srcroles=set(source["mapping"]);mapped={m[k] for k in srcroles}
    bind=locals_(arm,bones,True)
    with calibrate(bpy.context,arm):
        bpy.context.view_layer.update()
        cal=V.points(arm,m);basis={b.name:b.matrix_basis.copy() for b in bones}
    # All ancestors of actually animated humanoid roles, excluding mapped roles.
    ancestors=set()
    for name in mapped:
        p=arm.pose.bones[name].parent
        while p is not None:
            if p.name not in mapped:ancestors.add(p.name)
            p=p.parent
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(v.type=="ARMATURE" and v.object==arm for v in o.modifiers)]
    h,floor=setup(meshes);scene=bpy.context.scene;cam=scene.camera
    scene.render.fps=source["fpsNumerator"];scene.render.fps_base=source["fpsBase"];scene.frame_set(1);V.activate(arm)
    path=OUT/"zero-probe.vrma" if kind=="zero" else SRC/"source.vrma"
    assert "FINISHED" in bpy.ops.import_scene.vrma(filepath=str(path.resolve()),armature_object_name=arm.name)
    action=arm.animation_data.action;slot=arm.animation_data.action_slot;lo,hi=map(round,action.frame_range)
    assert hi-lo+1==len(source["samples"]),(lo,hi,len(source["samples"]))
    # Verify actual F-curves rather than assume omitted channel from names.
    curves=[]
    for layer in action.layers:
        for strip in layer.strips:
            bag=strip.channelbag(slot)
            if bag:curves.extend(list(bag.fcurves))
    assert curves,"no action channelbag curves"
    animated={bone.name for bone in bones if any(f.data_path.startswith(bone.path_from_id()+".") for f in curves)}
    assert mapped<=animated,sorted(mapped-animated)
    omitted=sorted(ancestors-animated)
    scene.frame_set(lo);bpy.context.view_layer.update()
    lost={name:qangle(arm.pose.bones[name].matrix_basis.to_quaternion(),basis[name].to_quaternion()) for name in omitted}
    candidate=[name for name in omitted if lost[name]>.001]
    before={n:arm.pose.bones[n].matrix_basis.copy() for n in candidate}
    for n in candidate:
        assert (before[n].translation-basis[n].translation).length<.000002,(n,"nonrotational calibration")
        assert (before[n].to_scale()-basis[n].to_scale()).length<.000002,(n,"scale")
    if closure:
        from io_scene_vrm.common.rotation import set_rotation_without_mode_change,insert_rotation_keyframe
        for f in (lo,hi):
            scene.frame_set(f)
            for name in candidate:
                bone=arm.pose.bones[name]
                set_rotation_without_mode_change(bone,basis[name].to_quaternion())
                insert_rotation_keyframe(bone,frame=f)
        bpy.context.view_layer.update()
    row={"calibratedPoints":cal,"omittedAncestors":omitted,"lostCalibrationDeg":lost,"constantRotationKeys":candidate if closure else [],"mappedRoles":sorted(srcroles),"samples":[],"renders":[]}
    R["cases"][case]=row;save()
    n=len(source["samples"])
    indices=[0] if kind=="zero" else list(range(n))
    for i in indices:
        scene.frame_set(lo+i);bpy.context.view_layer.update()
        pp=V.points(arm,m);s=source["samples"][i];local=locals_(arm,bones)
        vs=vertices(meshes);assert all(math.isfinite(x) for v in vs for x in v)
        angles={}
        for side in ("left","right"):
            for u,v in (("upper_arm","lower_arm"),("lower_arm","hand"),("upper_leg","lower_leg"),("lower_leg","foot")):
                k=side+"_"+u;e=side+"_"+v
                angles[k]=V.angle(Vector(pp[e])-Vector(pp[k]),Vector(s[e])-Vector(s[k]))
        def spacing(p):
            x=Vector(p["left_foot"])-Vector(p["right_foot"]);x.z=0
            length=sum((Vector(p[k+"_"+u])-Vector(p[k+"_"+v])).length for k in ("left","right") for u,v in (("upper_leg","lower_leg"),("lower_leg","foot")))/2
            return x.length/length
        shoulder=(Vector(pp["left_upper_arm"])+Vector(pp["right_upper_arm"]))/2
        mapped_q={name:list(arm.pose.bones[name].matrix_basis.to_quaternion()) for name in sorted(mapped)}
        row["samples"].append({"i":i,"landmarks":{k:pp[k] for k in sorted(srcroles)},"mappedRotation":mapped_q,"spacingNorm":spacing(pp),"sourceSpacingNorm":spacing(s),"segmentAngleErrorDeg":angles,"floorGapM":min(v.z for v in vs)-floor,"headShoulderHeightM":pp["head"][2]-shoulder.z,"localDriftM":max((a.translation-b.translation).length for j,(a,b) in enumerate(zip(local,bind)) if bones[j].parent),"zeroLandmarkMaxM":max((Vector(pp[k])-Vector(cal[k])).length for k in srcroles) if kind=="zero" else None})
    rows=row["samples"]
    row["legP95Deg"]=float(np.percentile([v for r in rows for k,v in r["segmentAngleErrorDeg"].items() if "leg" in k],95))
    row["minFloorM"]=min(r["floorGapM"] for r in rows)
    row["maxLocalDriftM"]=max(r["localDriftM"] for r in rows)
    row["minHeadShoulderM"]=min(r["headShoulderHeightM"] for r in rows)
    row["spacingErrorMax"]=max(abs(r["spacingNorm"]-r["sourceSpacingNorm"]) for r in rows)
    row["targetTravelNormalized"]=(max(r["landmarks"]["hips"][2] for r in rows)-min(r["landmarks"]["hips"][2] for r in rows))/cal["hips"][2]
    save()
    # Use a fixed common view basis from the source first pose, not each candidate.
    first=source["samples"][0];lat=Vector(first["right_upper_leg"])-Vector(first["left_upper_leg"]);lat.z=0;lat.normalize();fwd=lat.cross(Vector((0,0,1)));fwd.normalize()
    cam.data.ortho_scale=h*1.65
    frameids=[0] if kind=="zero" else sorted({0,n//2,n-1})
    for i in frameids:
        scene.frame_set(lo+i);bpy.context.view_layer.update()
        hip=Vector(rows[i]["landmarks"]["hips"]);focus=Vector((hip.x,hip.y,floor+h*.50))
        for label,offset in (("front",3*fwd+Vector((0,0,.2))),("side",3*lat+Vector((0,0,.2))),("quarter",2*lat+3*fwd+Vector((0,0,.5)))):
            name=f"{case}-{label}-{i:03}.png";render(scene,cam,focus,offset,h,OUT/name);row["renders"].append(name)
    save()
for kind in ("zero","actual"):
    for closure in (False,True):run(kind,closure)
from mathutils import Quaternion
a=R["cases"]["actual-stock"];b=R["cases"]["actual-closure"];z=R["cases"]["zero-stock"];zc=R["cases"]["zero-closure"]
base_error=None # Held-out target intentionally differs from male100 reference.
mapped_change=max(qangle(Quaternion(r["mappedRotation"][k]),Quaternion(s["mappedRotation"][k])) for r,s in zip(a["samples"],b["samples"]) for k in r["mappedRotation"])
zero_stock=z["samples"][0]["zeroLandmarkMaxM"];zero_new=zc["samples"][0]["zeroLandmarkMaxM"]
fail=[]
all_limb_p95=float(np.percentile([v for r in b["samples"] for v in r["segmentAngleErrorDeg"].values()],95))
if all_limb_p95>10:fail.append("ALL_LIMB_DIRECTION")
if mapped_change>.1:fail.append("MAPPED_ROTATIONS_CHANGED")
if zero_new>.002 or zero_new>=zero_stock:fail.append("ZERO_CLOSURE")
if b["legP95Deg"]>10 or b["legP95Deg"]>=a["legP95Deg"]:fail.append("LEG_DIRECTION")
if clip=="Neutral_ID" and b["spacingErrorMax"]>.08:fail.append("IDLE_STANCE")
if b["maxLocalDriftM"]>.002 or b["minHeadShoulderM"]<.05 or b["minFloorM"]<-.05 or abs(b["targetTravelNormalized"]-prior["sourceTravelNormalized"])>.15:fail.append("PRIOR_MOTION_SCREEN")
R.update({"baselineMaxM":base_error,"baselineReproduction":"NA: distinct held-out rig","allLimbP95Deg":all_limb_p95,"mappedRotationChangeDeg":mapped_change,"zeroStockMaxM":zero_stock,"zeroClosureMaxM":zero_new,"failures":fail,"status":"CLOSURE_SCREEN_PASS" if not fail else "HYPOTHESIS_REJECTED"})
save();print(R["status"],fail,flush=True);sys.stdout.flush();sys.stderr.flush();os._exit(0)
