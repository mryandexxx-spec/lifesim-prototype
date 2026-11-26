"""R2A: unchanged VRM Blender auto T-pose on four native rigs.
Calibration is transient pose metadata, never a new mesh/bind or production VRM.
"""
import bpy,addon_utils,sys,pathlib,os,json,hashlib,math
from mathutils import Vector
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,setup,locals_,encode,vertices
PIN="0428e04fe0a7916cba257ad7876c8cc5268cf316"
OUT=pathlib.Path("artifacts/cf-anim-rig-contract-r2a");OUT.mkdir(parents=True,exist_ok=True)
pins={
"male-grid_021-100":"321f407aa39c0acdb4136b803b4feab62c86bf269ece9bb1a868bc8c3764c775",
"male-grid_021-90":"218965e4c5d79d912a54f2ab13c65a7e38f69b8ed350ec612784ffd98e8ca16f",
"female-grid_201-100":"950d46a93155bc106cf311f2707d8348c81fd0f36247339e7ba4e67ee8d1030e",
"female-grid_201-110":"8293922dfaefbeee1a9aa8f814a2b3afeadf5386a0161e46909c2853eaaf18ab"}
key=sys.argv[-1];path=pathlib.Path("input-rigs")/(key+".glb")
assert hashlib.sha256(path.read_bytes()).hexdigest()==pins[key]
arm,bones=import_rig(path);reset(arm,bones);assert len(bones)==104
sys.path.insert(0,str(pathlib.Path("vrm-addon/src").resolve()))
mod=addon_utils.enable("io_scene_vrm",default_set=True,persistent=False)
assert mod is not None and tuple(mod.bl_info["version"])==(4,7,1)
from io_scene_vrm.editor.extension_accessor import get_armature_extension
from io_scene_vrm.editor.t_pose import setup_humanoid_t_pose
ext=get_armature_extension(arm.data);ext.spec_version="1.0"
hum=ext.vrm1.humanoid;hb=hum.human_bones
mapping={"hips":"root","spine":"spine04","chest":"spine02","upper_chest":"spine01","neck":"neck01","head":"head","left_eye":"eye.L","right_eye":"eye.R"}
for s,suffix in (("left","L"),("right","R")):
    for role,bone in (("upper_leg","upperleg01"),("lower_leg","lowerleg01"),("foot","foot"),("toes","toe1-1"),("shoulder","clavicle"),("upper_arm","upperarm01"),("lower_arm","lowerarm01"),("hand","wrist")):
        mapping[s+"_"+role]=bone+"."+suffix
    for i,finger in enumerate(("thumb","index","middle","ring","little"),1):
        for j,part in enumerate(("metacarpal","proximal","distal") if i==1 else ("proximal","intermediate","distal"),1):
            mapping[s+"_"+finger+"_"+part]=f"finger{i}-{j}.{suffix}"
assert len(mapping)==54 and len(set(mapping.values()))==54
for role,name in mapping.items():
    assert name in arm.pose.bones
    getattr(hb,role).node.bone_name=name
assert all(getattr(hb,r).node.bone_name==n for r,n in mapping.items())
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
assert meshes
neutral=locals_(arm,bones);bind=locals_(arm,bones,True)
def points():return {r:arm.matrix_world@arm.pose.bones[n].head for r,n in mapping.items()}
def angle(v,axis):return math.degrees(v.normalized().angle(Vector(axis)))
def measure():
    p=points();segments={}
    for s,sign in (("left",1),("right",-1)):
        for a,b,axis in (("upper_arm","lower_arm",(sign,0,0)),("lower_arm","hand",(sign,0,0)),("upper_leg","lower_leg",(0,0,-1)),("lower_leg","foot",(0,0,-1))):
            segments[s+"_"+a]=angle(p[s+"_"+b]-p[s+"_"+a],axis)
        for f in ("index","middle","ring","little"):
            segments[s+"_"+f]=angle(p[s+"_"+f+"_distal"]-p[s+"_"+f+"_proximal"],(sign,0,0))
    vs=vertices(meshes);assert all(math.isfinite(x) for v in vs for x in v)
    return {"segmentsDeg":segments,"landmarks":{k:list(v) for k,v in p.items()},"vertices":len(vs),"floorM":min(v.z for v in vs),"heightM":max(v.z for v in vs)-min(v.z for v in vs)}
def err(a,b):
    return {"posM":max((x.translation-y.translation).length for x,y in zip(a,b)),
            "rotRad":max(2*math.acos(min(1.,abs(x.to_quaternion().normalized().dot(y.to_quaternion().normalized())))) for x,y in zip(a,b))}
report={"stage":"RIG-CONTRACT/R2A","head":os.environ["EXPECTED_SHA"],"rig":key,"rigSha":pins[key],"addonPin":PIN,"blender":bpy.app.version_string,"mapping":mapping,"status":"PENDING","ART":"OPEN"}
def save(): (OUT/(key+".json")).write_text(json.dumps(report,indent=2,allow_nan=False))
report["mappingErrors"]=hb.error_messages();save()
def finish():
    # Embedded bpy + registered add-on can hang in interpreter teardown even
    # after all work completed. This is a disposable worker; persist evidence,
    # flush streams, then terminate without invoking the problematic teardown.
    save()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
if not hb.bones_are_correctly_assigned():
    report["status"]="MAPPING_FAIL";finish()
report["neutral"]=measure();h,floor=setup(meshes);cam=bpy.context.scene.camera
from mathutils import Vector
center=Vector((0,0,floor+h*.50))
def render(label):
    for view,offset in (("front",(0,-3,.1)),("quarter",(1.6,-3,.5)),("side",(3,0,.2))):
        cam.location=center+Vector(offset)*h;cam.rotation_euler=(center-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.65
        p=OUT/f"{key}-{label}-{view}.png";bpy.context.scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);assert p.stat().st_size>0
render("native")
hum.pose=hum.POSE_AUTO_POSE.identifier
with setup_humanoid_t_pose(bpy.context,arm):
    bpy.context.view_layer.update()
    report["calibrated"]=measure()
    cal=locals_(arm,bones)
    report["calibratedLocal"]=encode(cal)
    report["calibrationBindError"]=err(bind,locals_(arm,bones,True))
    report["nonRootTranslationDriftM"]=max((a.translation-b.translation).length for i,(a,b) in enumerate(zip(neutral,cal)) if bones[i].parent is not None)
    report["maxArmLegAngleDeg"]=max(v for k,v in report["calibrated"]["segmentsDeg"].items() if any(k.endswith("_"+s) for s in ("upper_arm","lower_arm","upper_leg","lower_leg")))
    report["maxFingerAngleDeg"]=max(v for k,v in report["calibrated"]["segmentsDeg"].items() if any(k.endswith("_"+s) for s in ("index","middle","ring","little")))
    report["failures"]=[]
    if report["maxArmLegAngleDeg"]>5:report["failures"].append("LIMB_AXIS")
    if report["maxFingerAngleDeg"]>10:report["failures"].append("FINGER_AXIS")
    if report["nonRootTranslationDriftM"]>.0002:report["failures"].append("LOCAL_LENGTH")
    if report["calibrationBindError"]["posM"]>.0002 or report["calibrationBindError"]["rotRad"]>.002:report["failures"].append("BIND_CHANGED")
    if abs(report["calibrated"]["floorM"]-report["neutral"]["floorM"])>.05:report["failures"].append("FLOOR_SHIFT")
    if report["calibrated"]["vertices"]!=report["neutral"]["vertices"]:report["failures"].append("VERTEX_COUNT")
    save();render("calibrated")
report["restoreError"]=err(neutral,locals_(arm,bones));report["restoreBindError"]=err(bind,locals_(arm,bones,True))
if any(v["posM"]>.0002 or v["rotRad"]>.002 for v in (report["restoreError"],report["restoreBindError"])):report["failures"].append("RESTORE")
assert hashlib.sha256(path.read_bytes()).hexdigest()==pins[key]
report["status"]="CALIBRATION_SCREEN_PASS" if not report["failures"] else "CALIBRATION_SCREEN_FAIL"
save();print(key,report["status"],report["failures"],flush=True)
assert all((OUT/f"{key}-{label}-{view}.png").stat().st_size>0 for label in ("native","calibrated") for view in ("front","quarter","side"))
finish()
