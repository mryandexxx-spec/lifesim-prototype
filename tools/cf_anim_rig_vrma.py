"""R2B: native captured motion -> official VRM Animation -> existing native rig.
Diagnostic only. No furniture, motion solver, pose-by-pose corrections or game changes.
"""
import bpy,addon_utils,sys,pathlib,os,json,hashlib,math,urllib.request,tempfile
from mathutils import Vector,Matrix
OUT=pathlib.Path("artifacts/cf-anim-rig-contract-r2b");OUT.mkdir(parents=True,exist_ok=True)
PIN="0428e04fe0a7916cba257ad7876c8cc5268cf316"
CLIP="a7d1294ee85122f8c4c8e0ec4420f8804b847974940a581970ec83b69142000c"
RIG="321f407aa39c0acdb4136b803b4feab62c86bf269ece9bb1a868bc8c3764c775"
SRC=pathlib.Path("input-cmu.blend")
VRMA=OUT/"113_15.vrma"
def dump(name,data):
    (OUT/name).write_text(json.dumps(data,indent=2,allow_nan=False))
def finish():
    sys.stdout.flush();sys.stderr.flush();os._exit(0)
def activate(arm):
    if bpy.context.object and bpy.context.object.mode!="OBJECT":bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT");arm.select_set(True);bpy.context.view_layer.objects.active=arm
def addon(arm,mapping):
    sys.path.insert(0,str(pathlib.Path("vrm-addon/src").resolve()))
    mod=addon_utils.enable("io_scene_vrm",default_set=True,persistent=False)
    assert mod is not None and tuple(mod.bl_info["version"])==(4,7,1)
    from io_scene_vrm.editor.extension_accessor import get_armature_extension
    from io_scene_vrm.editor.t_pose import setup_humanoid_t_pose
    ext=get_armature_extension(arm.data);ext.spec_version="1.0"
    hum=ext.vrm1.humanoid
    for role,name in mapping.items():
        assert name in arm.pose.bones,name
        getattr(hum.human_bones,role).node.bone_name=name
    assert hum.human_bones.bones_are_correctly_assigned(),hum.human_bones.error_messages()
    hum.pose=hum.POSE_AUTO_POSE.identifier
    return hum,setup_humanoid_t_pose
def points(arm,m):
    return {k:list(arm.matrix_world@arm.pose.bones[n].head) for k,n in m.items()}
def angle(v,w):
    return math.degrees(v.normalized().angle(w.normalized()))
def source_map():
    m={"hips":"Hips","spine":"LowerBack","chest":"Spine","upper_chest":"Spine1","neck":"Neck1","head":"Head"}
    for s,p in (("left","Left"),("right","Right")):
        for role,n in (("upper_leg","UpLeg"),("lower_leg","Leg"),("foot","Foot"),("toes","ToeBase"),("shoulder","Shoulder"),("upper_arm","Arm"),("lower_arm","ForeArm"),("hand","Hand")):m[s+"_"+role]=p+n
    return m
def target_map():
    m={"hips":"root","spine":"spine04","chest":"spine02","upper_chest":"spine01","neck":"neck01","head":"head","left_eye":"eye.L","right_eye":"eye.R"}
    for s,p in (("left","L"),("right","R")):
        for role,n in (("upper_leg","upperleg01"),("lower_leg","lowerleg01"),("foot","foot"),("toes","toe1-1"),("shoulder","clavicle"),("upper_arm","upperarm01"),("lower_arm","lowerarm01"),("hand","wrist")):m[s+"_"+role]=n+"."+p
        for i,f in enumerate(("thumb","index","middle","ring","little"),1):
            for j,part in enumerate(("metacarpal","proximal","distal") if i==1 else ("proximal","intermediate","distal"),1):m[s+"_"+f+"_"+part]=f"finger{i}-{j}.{p}"
    return m
def audit_vrma(data,source,frame_count=946,fps=120,stride=5):
    """Independent GLB forward-kinematics on the exported channels, no importer.
    Compare original source landmarks at exact 120Hz indices, not target anatomy.
    """
    import struct,re
    from mathutils import Quaternion
    assert data[:4]==b"glTF" and struct.unpack_from("<I",data,4)[0]==2
    n,kind=struct.unpack_from("<II",data,12)
    assert kind==0x4e4f534a
    g=json.loads(data[20:20+n])
    size,kind=struct.unpack_from("<II",data,20+n)
    assert kind==0x004e4942
    binary=data[28+n:28+n+size]
    def accessor(i):
        a=g["accessors"][i];v=g["bufferViews"][a["bufferView"]]
        assert a["componentType"]==5126 and not a.get("sparse") and v.get("buffer",0)==0
        width={"SCALAR":1,"VEC3":3,"VEC4":4}[a["type"]]
        base=v.get("byteOffset",0)+a.get("byteOffset",0);stride=v.get("byteStride",4*width)
        assert base+(a["count"]-1)*stride+4*width<=len(binary)
        rows=[struct.unpack_from("<"+"f"*width,binary,base+j*stride) for j in range(a["count"])]
        assert all(math.isfinite(x) for row in rows for x in row)
        return rows
    anim,=g["animations"];channels={}
    for channel in anim["channels"]:
        t=channel["target"];sampler=anim["samplers"][channel["sampler"]]
        assert sampler.get("interpolation","LINEAR")=="LINEAR"
        ts=accessor(sampler["input"]);values=accessor(sampler["output"])
        assert len(ts)==len(values)==frame_count
        assert abs(ts[0][0])<1e-6 and abs(ts[-1][0]-(frame_count-1)/fps)<.002
        channels[t["node"],t["path"]]=values
    nodes=g["nodes"];parents={ch:i for i,node in enumerate(nodes) for ch in node.get("children",[])}
    roles={re.sub(r"([A-Z])",lambda m:"_"+m[0].lower(),role):node["node"] for role,node in g["extensions"]["VRMC_vrm_animation"]["humanoid"]["humanBones"].items()}
    assert set(roles)==set(source[0])
    errors={k:[] for k in roles}
    for j,reference in enumerate(source):
        worlds={}
        def world(i):
            if i in worlds:return worlds[i]
            node=nodes[i]
            p=channels[i,"translation"][j*stride] if (i,"translation") in channels else node.get("translation",[0,0,0])
            r=channels[i,"rotation"][j*stride] if (i,"rotation") in channels else node.get("rotation",[0,0,0,1])
            s=node.get("scale",[1,1,1])
            assert all(abs(v-1)<.0002 for v in s)
            q=Quaternion((r[3],r[0],r[1],r[2])).normalized()
            local=Matrix.Translation(Vector(p))@q.to_matrix().to_4x4()
            worlds[i]=world(parents[i])@local if i in parents else local
            return worlds[i]
        for role,i in roles.items():
            p=world(i).translation
            blender=Vector((p.x,-p.z,p.y))
            errors[role].append((blender-Vector(reference[role])).length)
    result={role:{"meanM":sum(values)/len(values),"maxM":max(values)} for role,values in errors.items()}
    failed=[k for k,v in result.items() if v["maxM"]>.02]
    return {"head":os.environ["EXPECTED_SHA"],"frames":len(source),"sourceLandmarkMaxThresholdM":.02,"roles":result,"failures":failed,"status":"SOURCE_EXPORT_FAIL" if failed else "SOURCE_EXPORT_PASS"}
def prepare():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("io_anim_bvh",default_set=False,persistent=False)
    with tempfile.TemporaryDirectory() as d:
        path=pathlib.Path(d)/"113_15.bvh"
        url="https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/09a07f54f3bbb58797325f009282d0b2048a2871/data/113/113_15.bvh"
        with urllib.request.urlopen(url,timeout=30) as resp:raw=resp.read(2000000)
        assert hashlib.sha256(raw).hexdigest()==CLIP
        path.write_bytes(raw)
        assert "FINISHED" in bpy.ops.import_anim.bvh(filepath=str(path),target="ARMATURE",global_scale=.05,frame_start=1,use_fps_scale=False,update_scene_fps=True,rotate_mode="NATIVE",axis_forward="-Z",axis_up="Y")
    arm,=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    assert len(arm.pose.bones)==31
    assert tuple(map(round,arm.animation_data.action.frame_range))==(1,954)
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC.resolve()))
    print("Source imported:",SRC,flush=True)
def export():
    bpy.ops.wm.open_mainfile(filepath=str(SRC.resolve()))
    arm,=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    activate(arm);m=source_map();hum,setup=addon(arm,m)
    scene=bpy.context.scene
    action=arm.animation_data.action
    scene.frame_set(1);bpy.context.view_layer.update()
    first=points(arm,m)
    refz=first["hips"][2]
    assert refz>.3,"source calibration frame has no positive standing hip height"
    original=[]
    for f in range(6,952,5):
        scene.frame_set(f);bpy.context.view_layer.update();original.append(points(arm,m))
    scene.frame_set(1);bpy.context.view_layer.update()
    # The BVH root rest OFFSET is zero, unlike a grounded VRM humanoid.
    # Make a single transient T-pose reference using the recorded frame-1
    # standing height. Never alter any captured keys or frame trajectories.
    with setup(bpy.context,arm):
        bpy.context.view_layer.update()
        hip=arm.pose.bones[m["hips"]]
        mat=hip.matrix.copy()
        delta=Vector((0,0,refz-(arm.matrix_world@hip.head).z))
        mat.translation+=arm.matrix_world.inverted_safe().to_3x3()@delta
        hip.matrix=mat;bpy.context.view_layer.update()
        calibration=points(arm,m)
        # Neck is a zero-offset virtual joint at Spine1. Neck1 is the
        # actual displaced anatomical neck pivot; preserve this as metadata.
        assert (Vector(calibration["neck"])-Vector(calibration["upper_chest"])).length>.04
        basis={b.name:b.matrix_basis.copy() for b in arm.pose.bones}
    assert abs(calibration["hips"][2]-refz)<.0002
    # Validate positive reference height and both leg/arm directions.
    axes={}
    for s,sign in (("left",1),("right",-1)):
        for a,b,axis in (("upper_arm","lower_arm",(sign,0,0)),("lower_arm","hand",(sign,0,0)),("upper_leg","lower_leg",(0,0,-1)),("lower_leg","foot",(0,0,-1))):
            axes[s+"_"+a]=angle(Vector(calibration[s+"_"+b])-Vector(calibration[s+"_"+a]),Vector(axis))
    assert max(axes.values())<=5,axes
    # Stock custom pose library is independent of the source capture action.
    activate(arm);arm.animation_data.action=None
    scene.frame_set(0)
    for b in arm.pose.bones:
        b.matrix_basis=basis[b.name]
        for prop in ("location","scale", "rotation_quaternion" if b.rotation_mode=="QUATERNION" else "rotation_axis_angle" if b.rotation_mode=="AXIS_ANGLE" else "rotation_euler"):b.keyframe_insert(data_path=prop,frame=0)
    cal=arm.animation_data.action;cal.name="Diagnostic grounded T reference"
    marker=cal.pose_markers.new("Grounded reference");marker.frame=0
    arm.animation_data.action=action
    hum.pose_library=cal;hum.pose_marker_name=marker.name;hum.pose=hum.POSE_CUSTOM_POSE.identifier
    scene.frame_start=6;scene.frame_end=951
    scene.frame_set(6);bpy.context.view_layer.update()
    with setup(bpy.context,arm):
        bpy.context.view_layer.update()
        ref=points(arm,m)
    err=max((Vector(ref[k])-Vector(calibration[k])).length for k in m)
    assert err<.002,("custom reference replay",err)
    # Check source animation was not changed by reference creation.
    err=0
    for j,f in enumerate(range(6,952,5)):
        scene.frame_set(f);bpy.context.view_layer.update()
        now=points(arm,m);err=max(err,max((Vector(now[k])-Vector(original[j][k])).length for k in m))
    assert err<.002,("source motion changed",err)
    dump("source-report.json",{"head":os.environ["EXPECTED_SHA"],"sourceSha256":CLIP,"addonPin":PIN,"scale":.05,"sourceFps":scene.render.fps/scene.render.fps_base,"sourceFrames":[6,951],"mapping":m,"calibration":calibration,"axesDeg":axes,"referenceHipHeight":refz,"sourcePreservationM":err,"samples":original,"status":"SOURCE_READY"})
    activate(arm);scene.frame_set(6)
    result=bpy.ops.export_scene.vrma(filepath=str(VRMA.resolve()),armature_object_name=arm.name)
    assert "FINISHED" in result and VRMA.stat().st_size>1000
    data=VRMA.read_bytes();assert data[:4]==b"glTF"
    n=int.from_bytes(data[12:16],"little");g=json.loads(data[20:20+n])
    assert "VRMC_vrm_animation" in g["extensions"] and g["animations"]
    audit=audit_vrma(data,original);dump("source-vrma-audit.json",audit)
    print("Independent source FK",audit["status"],audit["failures"],flush=True)
    print("VRMA exported",len(data),"bytes",flush=True);finish()
def replay():
    sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
    from cf_anim_tools import import_rig,reset,setup,locals_,encode,vertices
    p=pathlib.Path("input-rigs/male-grid_021-100.glb")
    assert hashlib.sha256(p.read_bytes()).hexdigest()==RIG
    source=json.loads((OUT/"source-report.json").read_text())
    assert source["head"]==os.environ["EXPECTED_SHA"]
    arm,bones=import_rig(p);reset(arm,bones)
    assert len(bones)==104
    activate(arm);m=target_map();hum,calibrate=addon(arm,m)
    bind=locals_(arm,bones,True)
    with calibrate(bpy.context,arm):
        bpy.context.view_layer.update();cal=points(arm,m)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(v.type=="ARMATURE" and v.object==arm for v in o.modifiers)]
    h,floor=setup(meshes);cam=bpy.context.scene.camera
    scene=bpy.context.scene;scene.render.fps=24;scene.render.fps_base=1;scene.frame_set(1);activate(arm)
    result=bpy.ops.import_scene.vrma(filepath=str(VRMA.resolve()),armature_object_name=arm.name)
    assert "FINISHED" in result and arm.animation_data and arm.animation_data.action
    action=arm.animation_data.action;lo,hi=map(round,action.frame_range)
    assert 189<=hi-lo+1<=191,(lo,hi)
    report={"head":os.environ["EXPECTED_SHA"],"stage":"RIG-CONTRACT/R2B","rigSha":RIG,"vrmaSha256":hashlib.sha256(VRMA.read_bytes()).hexdigest(),"sourceSha256":CLIP,"targetAction":action.name,"frameRange":[lo,hi],"status":"PENDING","ART":"OPEN","samples":[],"renders":[]}
    def save():dump("target-report.json",report)
    save()
    samples=[];frames=[]
    n=min(190,hi-lo+1)
    for i in range(n):
        f=lo+i;scene.frame_set(f);bpy.context.view_layer.update()
        pp=points(arm,m);s=source["samples"][i];local=locals_(arm,bones);frames.append(encode(local))
        drift=max((a.translation-b.translation).length for j,(a,b) in enumerate(zip(local,bind)) if bones[j].parent)
        vs=vertices(meshes);assert all(math.isfinite(x) for v in vs for x in v)
        floor_gap=min(v.z for v in vs)-floor
        shoulder=(Vector(pp["left_upper_arm"])+Vector(pp["right_upper_arm"]))/2
        headgap=pp["head"][2]-shoulder.z
        angles={}
        for side in ("left","right"):
            for a,b in (("upper_arm","lower_arm"),("lower_arm","hand"),("upper_leg","lower_leg"),("lower_leg","foot")):
                k=side+"_"+a;end=side+"_"+b
                angles[k]=angle(Vector(pp[end])-Vector(pp[k]),Vector(s[end])-Vector(s[k]))
        samples.append({"frame":f,"hips":pp["hips"],"sourceHips":s["hips"],"headShoulderHeightM":headgap,"floorGapM":floor_gap,"nonrootTranslationDriftM":drift,"segmentAngleErrorDeg":angles})
    report["samples"]=samples
    ys=[q["hips"][2] for q in samples];sy=[q["sourceHips"][2] for q in samples]
    travel=max(ys)-min(ys);sourceTravel=max(sy)-min(sy)
    th=cal["hips"][2];sh=source["referenceHipHeight"]
    errors=sorted(v for q in samples for v in q["segmentAngleErrorDeg"].values())
    p95=errors[math.ceil(.95*len(errors))-1]
    report.update({"targetCalHipHeightM":th,"sourceCalHipHeightM":sh,"hipTravelM":travel,"sourceTravelNormalized":sourceTravel/sh,"targetTravelNormalized":travel/th,"initialHipHeightErrorM":abs(ys[0]-th),"headShoulderMinM":min(q["headShoulderHeightM"] for q in samples),"floorMinM":min(q["floorGapM"] for q in samples),"segmentAngleP95Deg":p95,"maxLocalDriftM":max(q["nonrootTranslationDriftM"] for q in samples)})
    fails=[]
    audit=json.loads((OUT/"source-vrma-audit.json").read_text())
    assert audit["head"]==os.environ["EXPECTED_SHA"]
    report["sourceExportAudit"]=audit["status"]
    if audit["status"]!="SOURCE_EXPORT_PASS":fails.append("SOURCE_EXPORT_LANDMARKS")
    if travel<=.15 or abs(travel/th-sourceTravel/sh)>.15:fails.append("ROOT_TRAVEL")
    if abs(ys[0]-th)>.15:fails.append("INITIAL_HIP_HEIGHT")
    if report["headShoulderMinM"]<.05:fails.append("HEAD_COLLAPSE")
    if report["floorMinM"]<-.05:fails.append("GROSS_FLOOR_PENETRATION")
    if p95>35:fails.append("SEGMENT_DIRECTION")
    if report["maxLocalDriftM"]>.002:fails.append("LOCAL_LENGTH")
    report["headGateFailedFrames"]=sum(q["headShoulderHeightM"]<.05 for q in samples)
    report["floorGateFailedFrames"]=sum(q["floorGapM"]<-.05 for q in samples)
    report["failures"]=fails;report["status"]="MOTION_SCREEN_FAIL" if fails else "MOTION_SCREEN_PASS"
    dump("target-poses.json",{"names":[b.name for b in bones],"parents":[bones.index(b.parent) if b.parent else -1 for b in bones],"poses":frames});save()
    center=Vector((0,0,floor+h*.50))
    indices=sorted(set([0,n-1,ys.index(min(ys)),*[round((n-1)*j/6) for j in range(7)]]))
    for label,offset in (("quarter",(1.6,-3,.5)),("side",(3,0,.2))):
        cam.location=center+Vector(offset)*h;cam.rotation_euler=(center-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.65
        for i in indices:
            scene.frame_set(lo+i);bpy.context.view_layer.update()
            # Follow horizontal root only; fixed camera angle and scale preserve
            # full-body visibility while the captured character walks.
            hip=Vector(samples[i]["hips"])
            focus=Vector((hip.x,hip.y,center.z))
            cam.location=focus+Vector(offset)*h
            cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler()
            name=f"{label}-{i:03}.png";scene.render.filepath=str(OUT/name)
            bpy.ops.render.render(write_still=True);assert (OUT/name).stat().st_size>0
            report["renders"].append(name)
    save();print(report["status"],fails,flush=True);finish()
if __name__=="__main__":
    {"prepare":prepare,"export":export,"replay":replay}[sys.argv[-1]]()
