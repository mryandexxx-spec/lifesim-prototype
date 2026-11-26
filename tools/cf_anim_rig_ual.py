"""R3: independent CC0 standard game-motion source test with stock VRMA I/O.
Two previously inspected clips. No root reconstruction, contact solver, or frame tuning.
"""
import bpy,sys,pathlib,os,json,hashlib,math,io,zipfile
from mathutils import Vector
import cf_anim_rig_vrma as V
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,setup,locals_,encode,vertices
from cf_anim_source_intake import PINS,download,zip_inventory
clip=sys.argv[-1]
assert clip in ("Walk_Loop","Sitting_Enter")
OUT=pathlib.Path("artifacts/cf-anim-rig-contract-r3")/clip;OUT.mkdir(parents=True,exist_ok=True)
V.OUT=OUT
def save(name,data):V.dump(name,data)
def map_ual():
    m={"hips":"pelvis","spine":"spine_01","chest":"spine_02","upper_chest":"spine_03","neck":"neck_01","head":"Head"}
    for s,suffix in (("left","l"),("right","r")):
        for role,n in (("upper_leg","thigh"),("lower_leg","calf"),("foot","foot"),("toes","ball"),("shoulder","clavicle"),("upper_arm","upperarm"),("lower_arm","lowerarm"),("hand","hand")):
            m[s+"_"+role]=n+"_"+suffix
        for finger,n in (("thumb","thumb"),("index","index"),("middle","middle"),("ring","ring"),("little","pinky")):
            parts=("metacarpal","proximal","distal") if finger=="thumb" else ("proximal","intermediate","distal")
            for i,part in enumerate(parts,1):m[s+"_"+finger+"_"+part]=f"{n}_{i:02}_{suffix}"
    assert len(m)==52 and len(set(m.values()))==52
    return m
def source():
    _,repo,path,size,sha,license=next(p for p in PINS if p[0]=="ual1")
    assert license=="CC0-1.0"
    raw=download(repo,path,size,sha)
    inventory=zip_inventory(raw)
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names=[i.filename for i in z.infolist() if i.filename.endswith("/UAL1_Standard.glb")]
        assert len(names)==1
        data=z.read(names[0])
    glb=pathlib.Path("ual1-r3.glb");glb.write_bytes(data)
    arm,bones=import_rig(glb);assert len(bones)==65;reset(arm,bones)
    m=map_ual();V.activate(arm);hum,calibrate=V.addon(arm,m)
    with calibrate(bpy.context,arm):
        bpy.context.view_layer.update();cal=V.points(arm,m)
    refz=cal["hips"][2];assert refz>.3,("source hip reference",refz)
    scene=bpy.context.scene
    action=next(a for a in bpy.data.actions if a.name==clip or a.name.startswith(clip+"."))
    ad=arm.animation_data_create();ad.action=action
    slots=[s for s in action.slots if s.target_id_type=="OBJECT"]
    if slots:ad.action_slot=slots[0]
    fps=scene.render.fps/scene.render.fps_base
    lo=math.ceil(action.frame_range[0]-1e-4);hi=math.floor(action.frame_range[1]+1e-4)
    assert 20<=hi-lo+1<=70,(clip,lo,hi,fps)
    scene.frame_start=lo;scene.frame_end=hi
    frames=[]
    for f in range(lo,hi+1):
        scene.frame_set(f);bpy.context.view_layer.update();frames.append(V.points(arm,m))
    report={"head":os.environ["EXPECTED_SHA"],"clip":clip,"sourceArchiveSha256":sha,"sourceGlbSha256":hashlib.sha256(data).hexdigest(),"license":license,"member":names[0],"fps":fps,"fpsBase":scene.render.fps_base,"fpsNumerator":scene.render.fps,"frameRange":[lo,hi],"mapping":m,"calibration":cal,"referenceHipHeight":refz,"samples":frames,"status":"SOURCE_READY"}
    save("source-report.json",report)
    V.activate(arm);scene.frame_set(lo)
    path=OUT/"source.vrma"
    assert "FINISHED" in bpy.ops.export_scene.vrma(filepath=str(path.resolve()),armature_object_name=arm.name)
    audit=V.audit_vrma(path.read_bytes(),frames,frame_count=len(frames),fps=fps,stride=1)
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
        rows.append({"frame":lo+i,"hips":pp["hips"],"sourceHips":s["hips"],"headShoulderHeightM":pp["head"][2]-shoulder.z,"floorGapM":min(v.z for v in vs)-floor,"nonrootTranslationDriftM":max((a.translation-b.translation).length for j,(a,b) in enumerate(zip(local,bind)) if bones[j].parent),"segmentAngleErrorDeg":angles})
    th=cal["hips"][2];sh=source["referenceHipHeight"]
    ys=[q["hips"][2] for q in rows];sy=[q["sourceHips"][2] for q in rows]
    travel=max(ys)-min(ys);sourceTravel=max(sy)-min(sy)
    errors=sorted(v for row in rows for v in row["segmentAngleErrorDeg"].values())
    result.update({"rigSha":V.RIG,"targetFrames":[lo,hi],"evaluatedFrames":n,"sourceFrames":len(src),"hipTravelM":travel,"sourceTravelNormalized":sourceTravel/sh,"targetTravelNormalized":travel/th,"headShoulderMinM":min(q["headShoulderHeightM"] for q in rows),"floorMinM":min(q["floorGapM"] for q in rows),"segmentAngleP95Deg":errors[math.ceil(.95*len(errors))-1],"maxLocalDriftM":max(q["nonrootTranslationDriftM"] for q in rows),"samples":rows,"renders":[]})
    fails=[]
    if abs(travel/th-sourceTravel/sh)>.15:fails.append("ROOT_TRAVEL_RATIO")
    if clip=="Sitting_Enter" and travel<=.15:fails.append("ROOT_TRAVEL")
    if result["headShoulderMinM"]<.05:fails.append("HEAD_COLLAPSE")
    if result["floorMinM"]<-.05:fails.append("GROSS_FLOOR_PENETRATION")
    if result["segmentAngleP95Deg"]>35:fails.append("SEGMENT_DIRECTION")
    if result["maxLocalDriftM"]>.002:fails.append("LOCAL_LENGTH")
    result["failures"]=fails;result["status"]="MOTION_SCREEN_FAIL" if fails else "MOTION_SCREEN_PASS"
    save("target-poses.json",{"names":[b.name for b in bones],"parents":[bones.index(b.parent) if b.parent else -1 for b in bones],"poses":poses})
    save("target-report.json",result)
    indices=sorted(set([0,n-1,ys.index(min(ys)),*[round((n-1)*j/5) for j in range(6)]]))
    for label,offset in (("quarter",(1.6,-3,.5)),("side",(3,0,.2))):
        for i in indices:
            scene.frame_set(lo+i);bpy.context.view_layer.update()
            hip=Vector(rows[i]["hips"]);focus=Vector((hip.x,hip.y,floor+h*.50))
            cam.location=focus+Vector(offset)*h;cam.rotation_euler=(focus-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.65
            name=f"{label}-{i:03}.png";scene.render.filepath=str(OUT/name)
            bpy.ops.render.render(write_still=True);assert (OUT/name).stat().st_size>0
            result["renders"].append(name)
    save("target-report.json",result);print(clip,result["status"],fails,flush=True);V.finish()
{"source":source,"replay":replay}[sys.argv[-2]]()
