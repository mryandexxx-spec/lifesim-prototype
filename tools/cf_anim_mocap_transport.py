"""100STYLE transport diagnostic: exact source excerpts and frozen VRMA bridge.
No loop correction, no changes to R8, no target edits, no production.
"""
import bpy,sys,pathlib,os,json,hashlib,math,urllib.request,subprocess
from mathutils import Vector
from imageio_ffmpeg import get_ffmpeg_exe
sys.path.insert(0,str(pathlib.Path("frozen-retarget/tools").resolve()))
import cf_anim_rig_vrma as V
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,setup,locals_,encode,vertices
clip=sys.argv[-1]
INPUTS={"Neutral_FW":("1-TqZdIJvpr-QVvAmYJREUZkuAgpAQSfd","2f28800baa299547c42c257d1c926172542a1e69b46a3d3e6aa0aded0e9b40f6",420,660,7896),"Neutral_ID":("1Vnz5wnFmOztNzaSBHjSt9v6y0pl0FK8X","71aead2e3246bdb47a5b839cb3e60e0574e9a1a046c071cc147e2922a35f259f",960,1140,2103)}
assert clip in INPUTS
OUT=pathlib.Path("artifacts/cf-anim-mocap-transport")/clip;OUT.mkdir(parents=True,exist_ok=True)
V.OUT=OUT
CREDIT="The 100STYLE Dataset - Ian Mason (Mason, Starke, Komura, 2022), CC BY 4.0. https://www.ianxmason.com/100style/ https://creativecommons.org/licenses/by/4.0/ . Temporal excerpt and retargeted diagnostic, no source key edits."
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
    path=OUT/"native-input.bvh";path.write_bytes(data)
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
    report={"head":os.environ["EXPECTED_SHA"],"clip":clip,"sourceSha256":sha,"url":url,"credit":CREDIT,"license":"CC-BY-4.0","fps":scene.render.fps/scene.render.fps_base,"fpsNumerator":scene.render.fps,"fpsBase":scene.render.fps_base,"frameRange":[lo,hi],"sourceZeroBased":[a,b],"mapping":m,"unmappedSourceBone":"Chest3","calibration":cal,"axesDeg":axes,"referenceHipHeight":refz,"sourcePreservationM":drift,"calibrationReplayM":err,"samples":frames,"status":"SOURCE_READY"}
    save("source-report.json",report)
    V.activate(arm);scene.frame_set(lo)
    path=OUT/"source.vrma"
    assert "FINISHED" in bpy.ops.export_scene.vrma(filepath=str(path.resolve()),armature_object_name=arm.name)
    audit=V.audit_vrma(path.read_bytes(),frames,frame_count=len(frames),fps=report["fps"],stride=1)
    save("source-vrma-audit.json",audit)
    print(clip,audit["status"],audit["failures"],flush=True);V.finish()
def replay():
    source=json.loads((OUT/"source-report.json").read_text())
    audit=json.loads((OUT/"source-vrma-audit.json").read_text())
    assert source["head"]==audit["head"]==os.environ["EXPECTED_SHA"]
    result={"head":source["head"],"clip":clip,"sourceAudit":audit["status"],"ART":"OPEN","production":"BLOCKED","status":"SOURCE_REJECTED"}
    if audit["status"]!="SOURCE_EXPORT_PASS":
        save("target-report.json",result);print(clip,"SOURCE_REJECTED",flush=True);V.finish()
    p=pathlib.Path("input-rigs/male-grid_021-100.glb")
    assert hashlib.sha256(p.read_bytes()).hexdigest()==V.RIG
    arm,bones=import_rig(p);reset(arm,bones);assert len(bones)==104
    V.activate(arm);m=V.target_map();hum,calibrate=V.addon(arm,m)
    bind=locals_(arm,bones,True)
    with calibrate(bpy.context,arm):
        bpy.context.view_layer.update();cal=V.points(arm,m)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(v.type=="ARMATURE" and v.object==arm for v in o.modifiers)]
    h,floor=setup(meshes);cam=bpy.context.scene.camera
    scene=bpy.context.scene;scene.render.fps=source["fpsNumerator"];scene.render.fps_base=source["fpsBase"];scene.frame_set(1);V.activate(arm)
    path=OUT/"source.vrma"
    assert "FINISHED" in bpy.ops.import_scene.vrma(filepath=str(path.resolve()),armature_object_name=arm.name)
    action=arm.animation_data.action;lo,hi=map(round,action.frame_range)
    src=source["samples"];n=min(len(src),hi-lo+1)
    assert abs(len(src)-(hi-lo+1))<=1,(len(src),lo,hi)
    rows=[];poses=[]
    for i in range(n):
        scene.frame_set(lo+i);bpy.context.view_layer.update()
        pp=V.points(arm,m);s=src[i];local=locals_(arm,bones);poses.append(encode(local))
        vs=vertices(meshes);assert all(math.isfinite(x) for v in vs for x in v)
        shoulder=(Vector(pp["left_upper_arm"])+Vector(pp["right_upper_arm"]))/2
        angles={}
        for side in ("left","right"):
            for a,b in (("upper_arm","lower_arm"),("lower_arm","hand"),("upper_leg","lower_leg"),("lower_leg","foot")):
                k=side+"_"+a;end=side+"_"+b
                angles[k]=V.angle(Vector(pp[end])-Vector(pp[k]),Vector(s[end])-Vector(s[k]))
        rows.append({"frame":lo+i,"hips":pp["hips"],"sourceHips":s["hips"],"headShoulderHeightM":pp["head"][2]-shoulder.z,"floorGapM":min(v.z for v in vs)-floor,"nonrootTranslationDriftM":max((a.translation-b.translation).length for j,(a,b) in enumerate(zip(local,bind)) if bones[j].parent),"segmentAngleErrorDeg":angles,"landmarks":pp})
    th=cal["hips"][2];sh=source["referenceHipHeight"]
    ys=[q["hips"][2] for q in rows];sy=[q["sourceHips"][2] for q in rows]
    travel=max(ys)-min(ys);sourceTravel=max(sy)-min(sy)
    errors=sorted(v for row in rows for v in row["segmentAngleErrorDeg"].values())
    result.update({"rigSha":V.RIG,"targetFrames":[lo,hi],"evaluatedFrames":n,"sourceFrames":len(src),"hipTravelM":travel,"sourceTravelNormalized":sourceTravel/sh,"targetTravelNormalized":travel/th,"headShoulderMinM":min(q["headShoulderHeightM"] for q in rows),"floorMinM":min(q["floorGapM"] for q in rows),"segmentAngleP95Deg":errors[math.ceil(.95*len(errors))-1],"maxLocalDriftM":max(q["nonrootTranslationDriftM"] for q in rows),"samples":rows,"renders":[]})
    fails=[]
    if abs(travel/th-sourceTravel/sh)>.15:fails.append("ROOT_TRAVEL_RATIO")
    if result["headShoulderMinM"]<.05:fails.append("HEAD_COLLAPSE")
    if result["floorMinM"]<-.05:fails.append("GROSS_FLOOR_PENETRATION")
    if result["segmentAngleP95Deg"]>35:fails.append("SEGMENT_DIRECTION")
    if result["maxLocalDriftM"]>.002:fails.append("LOCAL_LENGTH")
    result["failures"]=fails;result["status"]="MOTION_SCREEN_FAIL" if fails else "MOTION_SCREEN_PASS"
    save("target-poses.json",{"names":[b.name for b in bones],"parents":[bones.index(b.parent) if b.parent else -1 for b in bones],"poses":poses})
    save("target-report.json",result)
    indices=sorted(set([0,n-1,ys.index(min(ys)),*[round((n-1)*j/5) for j in range(6)]]))
    first=rows[0]["landmarks"];lateral=Vector(first["right_upper_leg"])-Vector(first["left_upper_leg"]);lateral.z=0;lateral.normalize();forward=lateral.cross(Vector((0,0,1)));forward.normalize()
    for label,offset in (("quarter",2*lateral+3*forward+Vector((0,0,.5))),("front",3*forward+Vector((0,0,.2))),("side",3*lateral+Vector((0,0,.2)))):
        for i in indices:
            scene.frame_set(lo+i);bpy.context.view_layer.update()
            hip=Vector(rows[i]["hips"]);focus=Vector((hip.x,hip.y,floor+h*.50))
            cam.location=focus+offset*h;cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.65
            name=f"{label}-{i:03}.png";scene.render.filepath=str(OUT/name)
            bpy.ops.render.render(write_still=True);assert (OUT/name).stat().st_size>0
            result["renders"].append(name)
    # Continuous non-looped side video at native half cadence, no edited keys.
    folder=OUT/"video-frames";folder.mkdir(exist_ok=True)
    for j,i in enumerate(range(0,n,2)):
        scene.frame_set(lo+i);bpy.context.view_layer.update()
        hip=Vector(rows[i]["hips"]);focus=Vector((hip.x,hip.y,floor+h*.50))
        cam.location=focus+(3*lateral+Vector((0,0,.2)))*h;cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler()
        scene.render.filepath=str(folder/f"{j:04}.png")
        bpy.ops.render.render(write_still=True)
    for tag,rate in [("normal",30),("slow",15)]:
        subprocess.run([get_ffmpeg_exe(),"-hide_banner","-loglevel","error","-y","-framerate",str(rate),"-i",str(folder/"%04d.png"),"-c:v","libx264","-pix_fmt","yuv420p",str(OUT/(tag+".mp4"))],check=True)
    result["videos"]=["normal.mp4","slow.mp4"];result["videoSampleRateHz"]=30
    save("target-report.json",result);print(clip,result["status"],fails,flush=True);V.finish()
{"source":source,"replay":replay}[sys.argv[-2]]()
