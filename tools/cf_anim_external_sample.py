"""Stock BVH native sample for R2; original capture, no processing/IK."""
import bpy, addon_utils, hashlib, json, pathlib, tempfile, urllib.request, math
from mathutils import Matrix
OUT=pathlib.Path("external-input");OUT.mkdir(exist_ok=True)
URL="https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/09a07f54f3bbb58797325f009282d0b2048a2871/data/113/113_15.bvh"
Y=Matrix.Rotation(-math.pi/2,4,"X")
def sample(arm,rest=False):
    return {b.name:{"p":list(m.translation),"q":list(m.to_quaternion().normalized())}
            for b in arm.pose.bones for m in [Y@arm.matrix_world@(b.bone.matrix_local if rest else b.matrix)]}
with tempfile.TemporaryDirectory() as d:
    p=pathlib.Path(d)/"113_15.bvh"
    with urllib.request.urlopen(URL,timeout=30) as resp:raw=resp.read(2000000)
    assert hashlib.sha256(raw).hexdigest()=="a7d1294ee85122f8c4c8e0ec4420f8804b847974940a581970ec83b69142000c"
    p.write_bytes(raw)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("io_anim_bvh",default_set=False,persistent=False)
    assert "FINISHED" in bpy.ops.import_anim.bvh(filepath=str(p),target="ARMATURE",global_scale=1,frame_start=1,use_fps_scale=False,update_scene_fps=True,rotate_mode="NATIVE",axis_forward="-Z",axis_up="Y")
    arm,=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    scene=bpy.context.scene
    assert tuple(map(round,arm.animation_data.action.frame_range))==(1,954)
    rest=sample(arm,True);frames=[]
    # Exactly 24 Hz, no duplicate last fractional interval.
    for i in range(1,955,5):
        scene.frame_set(i);bpy.context.view_layer.update()
        frames.append({"frame":i,"bones":sample(arm)})
    assert len(frames)==191 and len(rest)==31
    (OUT/"cmu-113_15.json").write_text(json.dumps({"blender":bpy.app.version_string,"sourceSha256":hashlib.sha256(raw).hexdigest(),"fps":24,"rest":rest,"frames":frames},allow_nan=False))
