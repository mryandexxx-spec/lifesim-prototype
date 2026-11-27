"""Replay exact accepted #368 derived cycle, frozen #363 transport; retain original frame-1 calibration."""
import bpy,sys,pathlib,os,json,hashlib,math,urllib.request,subprocess,re
from mathutils import Vector
from imageio_ffmpeg import get_ffmpeg_exe
sys.path.insert(0,str(pathlib.Path("frozen-retarget/tools").resolve()))
import cf_anim_rig_vrma as V
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,setup,locals_,encode,vertices
clip=sys.argv[-1]
INPUTS={"Neutral_FW":("1-TqZdIJvpr-QVvAmYJREUZkuAgpAQSfd","2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",1166,1249,7896),"Neutral_ID":("1Vnz5wnFmOztNzaSBHjSt9v6y0pl0FK8X","71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",960,1140,2103)}
assert clip in INPUTS
OUT=pathlib.Path("artifacts/cf-anim-mocap-replay")/os.environ["PROFILE"]/"source";OUT.mkdir(parents=True,exist_ok=True)
V.OUT=OUT
CREDIT="The 100STYLE Dataset - Ian Mason (Mason, Starke, Komura, 2022), CC BY 4.0. https://www.ianxmason.com/100style/ https://creativecommons.org/licenses/by/4.0/ . Derived walking excerpt: #368 symmetric seam overlap; original calibration frame preserved."
def save(name,data):V.dump(name,data)
def map_mocap():
    m={"hips":"Hips","spine":"Chest","chest":"Chest2","upper_chest":"Chest4","neck":"Neck","head":"Head"}
    for side,p in (("left","Left"),("right","Right")):
        for role,n in (("upper_leg","Hip"),("lower_leg","Knee"),("foot","Ankle"),("toes","Toe"),("shoulder","Collar"),("upper_arm","Shoulder"),("lower_arm","Elbow"),("hand","Wrist")):m[side+"_"+role]=p+n
    assert len(m)==22 and len(set(m.values()))==22
    return m
def source():
    ident,sha,a,b,n=INPUTS[clip]
    url="https://drive.google.com/uc?export=download&id="+ident
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"LifeSim source research"}),timeout=60) as f:data=f.read(40_000_001)
    assert hashlib.sha256(data).hexdigest()==sha and data.startswith(b"HIERARCHY"),"source bytes changed"
    # Reuse full original hierarchy and original frame 1 for calibration. Replace only
    # the exact previously accepted excerpt with artifact values, never refit keys.
    assert clip=="Neutral_FW"
    inp=pathlib.Path("input-loop")
    loop=json.loads((inp/"report.json").read_text())
    assert loop["head"]=="cfa3f431939ee8f6c55f2523e08b8e5be38d35e8"
    assert loop["status"]=="OVERLAP_SCREEN_PASS" and loop["failures"]==[]
    assert loop["sourceFrames"]==[a,b] and loop["sources"][0]["sha256"]==sha
    derived=(inp/"Neutral_FW_overlap.bvh").read_bytes()
    dsha=hashlib.sha256(derived).hexdigest();assert dsha==loop["derivedSha256"]
    h,m=data.decode("utf-8-sig").split("MOTION",1)
    dh,dm=derived.decode("utf-8-sig").split("MOTION",1)
    assert h==dh
    pattern=r"\s*Frames:\s*(\d+)\s+Frame Time:\s*([0-9.eE+-]+)\s+(.*)"
    orig=re.fullmatch(pattern,m,re.S);new=re.fullmatch(pattern,dm,re.S)
    assert orig and new and int(orig[1])==n and int(new[1])==b-a+1 and orig[2]==new[2]
    allkeys=orig[3].split();keys=new[3].split()
    assert len(allkeys)%n==0
    width=len(allkeys)//n;assert len(keys)==width*(b-a+1)
    allkeys[a*width:(b+1)*width]=keys
    assert allkeys[a*width:(b+1)*width]==keys
    rebuilt=h+"MOTION\nFrames: "+str(n)+"\nFrame Time: "+orig[2]+"\n"+"\n".join(" ".join(allkeys[i:i+width]) for i in range(0,len(allkeys),width))+"\n"
    path=OUT/"native-input.bvh";path.write_text(rebuilt)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    assert "FINISHED" in bpy.ops.import_anim.bvh(filepath=str(path.resolve()),target="ARMATURE",global_scale=.01,frame_start=1,use_fps_scale=False,update_scene_fps=True,rotate_mode="NATIVE",axis_forward="-Z",axis_up="Y")
    path.unlink()
    arm,=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    m=map_mocap();V.activate(arm);hum,calibrate=V.addon(arm,m)
    scene=bpy.context.scene
    action=arm.animation_data.action;slot=arm.animation_data.action_slot
    assert tuple(map(round,action.frame_range))==(1,n),list(action.frame_range)
    assert abs(scene.render.fps/scene.render.fps_base-60)<.01
    lo,hi=a+1,b+1
    def points(f):scene.frame_set(f);bpy.context.view_layer.update();return V.points(arm,m)
    frames=[points(f) for f in range(lo,hi+1)]
    first=points(1);refz=first["hips"][2]
    assert .5<refz<1.4,("grounded reference height",refz)
    with calibrate(bpy.context,arm):
        bpy.context.view_layer.update()
        hip=arm.pose.bones[m["hips"]];mat=hip.matrix.copy()
        delta=Vector((0,0,refz-(arm.matrix_world@hip.head).z))
        mat.translation+=arm.matrix_world.inverted_safe().to_3x3()@delta
        hip.matrix=mat;bpy.context.view_layer.update()
        cal=V.points(arm,m)
        basis={b.name:b.matrix_basis.copy() for b in arm.pose.bones}
    axes={}
    for s,sign in (("left",1),("right",-1)):
        for u,v,axis in (("upper_arm","lower_arm",(sign,0,0)),("lower_arm","hand",(sign,0,0)),("upper_leg","lower_leg",(0,0,-1)),("lower_leg","foot",(0,0,-1))):
            axes[s+"_"+u]=V.angle(Vector(cal[s+"_"+v])-Vector(cal[s+"_"+u]),Vector(axis))
    assert abs(cal["hips"][2]-refz)<.0002 and max(axes.values())<=5,axes
    V.activate(arm);arm.animation_data.action=None;scene.frame_set(0)
    for bone in arm.pose.bones:
        bone.matrix_basis=basis[bone.name]
        for prop in ("location","scale","rotation_quaternion" if bone.rotation_mode=="QUATERNION" else "rotation_axis_angle" if bone.rotation_mode=="AXIS_ANGLE" else "rotation_euler"):bone.keyframe_insert(data_path=prop,frame=0)
    ref=arm.animation_data.action;ref.name="100STYLE grounded reference only"
    marker=ref.pose_markers.new("Grounded reference");marker.frame=0
    arm.animation_data.action=action
    if slot is not None:arm.animation_data.action_slot=slot
    hum.pose_library=ref;hum.pose_marker_name=marker.name;hum.pose=hum.POSE_CUSTOM_POSE.identifier
    scene.frame_start=lo;scene.frame_end=hi
    points(lo)
    with calibrate(bpy.context,arm):
        bpy.context.view_layer.update();now=V.points(arm,m)
    err=max((Vector(now[k])-Vector(cal[k])).length for k in m)
    assert err<.002,("calibration replay",err)
    drift=0
    for i,f in enumerate(range(lo,hi+1)):
        now=points(f);drift=max(drift,max((Vector(now[k])-Vector(frames[i][k])).length for k in m))
    assert drift<.002,("source motion changed",drift)
    (OUT/"ATTRIBUTION.txt").write_text(CREDIT+"\n")
    report={"head":os.environ["EXPECTED_SHA"],"clip":clip,"sourceSha256":sha,"derivedSha256":dsha,"loopHead":loop["head"],"loopDurationS":loop["durationS"],"url":url,"credit":CREDIT,"license":"CC-BY-4.0","fps":scene.render.fps/scene.render.fps_base,"fpsNumerator":scene.render.fps,"fpsBase":scene.render.fps_base,"frameRange":[lo,hi],"sourceZeroBased":[a,b],"mapping":m,"unmappedSourceBone":"Chest3","calibration":cal,"axesDeg":axes,"referenceHipHeight":refz,"sourcePreservationM":drift,"calibrationReplayM":err,"samples":frames,"status":"SOURCE_READY"}
    save("source-report.json",report)
    V.activate(arm);scene.frame_set(lo)
    path=OUT/"source.vrma"
    assert "FINISHED" in bpy.ops.export_scene.vrma(filepath=str(path.resolve()),armature_object_name=arm.name)
    audit=V.audit_vrma(path.read_bytes(),frames,frame_count=len(frames),fps=report["fps"],stride=1)
    save("source-vrma-audit.json",audit)
    assert len(frames)==84 and abs((len(frames)-1)/report["fps"]-loop["durationS"])<.002
    print(clip,audit["status"],audit["failures"],flush=True);V.finish()
source()
