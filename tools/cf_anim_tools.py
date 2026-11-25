"""Isolated actual source and candidate-rig sampling. No production asset changes."""
import bpy, pathlib, json, math, hashlib, sys, subprocess, tempfile, shutil
from mathutils import Matrix, Vector, Quaternion
from imageio_ffmpeg import get_ffmpeg_exe
ROOT=pathlib.Path("anim-tools-out"); ROOT.mkdir(exist_ok=True)
PRIOR=pathlib.Path("prior-full")
CLIPS={"ual1":["Walk_Loop","Sitting_Enter","Sitting_Exit"],"ual2":["Idle_TalkingPhone_Loop"]}
Y=Matrix.Rotation(-math.pi/2,4,"X")
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def import_rig(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    arms=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    assert len(arms)==1,(path,len(arms))
    arm=arms[0]
    bones=list(arm.pose.bones)
    assert all(b.parent is None or bones.index(b.parent)<i for i,b in enumerate(bones))
    return arm,bones
def reset(arm,bones):
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data.action=None
            for t in o.animation_data.nla_tracks:t.mute=True
    for b in bones:b.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
def matrix(p,r): return Matrix.Translation(Vector(p)) @ Quaternion((r[3],r[0],r[1],r[2])).to_matrix().to_4x4()
def rigid(m):
    p,q,s=m.decompose()
    assert all(math.isfinite(x) for x in [*p,*q,*s]) and min(s)>0
    assert max(s)-min(s)<.001*max(s), tuple(s)
    return Matrix.Translation(p)@q.to_matrix().to_4x4()
def locals_(arm,bones,rest=False):
    w=[rigid(Y@arm.matrix_world@(b.bone.matrix_local if rest else b.matrix)) for b in bones]
    return [m if b.parent is None else w[bones.index(b.parent)].inverted()@m for b,m in zip(bones,w)]
def encode(ms):
    return [{"p":list(m.to_translation()),"r":[q.x,q.y,q.z,q.w]} for m in ms for q in [m.to_quaternion()]]
def rig(arm,bones):
    return {"names":[b.name for b in bones],"parents":[bones.index(b.parent) if b.parent else -1 for b in bones],"rest":encode(locals_(arm,bones,True))}
def source(key):
    arm,bones=import_rig(pathlib.Path("/tmp/cf-anim-sources")/(key+".glb"))
    assert len(bones)==65
    reset(arm,bones); data=rig(arm,bones); data["clips"]={}
    actions={a.name:a for a in bpy.data.actions}
    scene=bpy.context.scene;fps=scene.render.fps/scene.render.fps_base
    for name in CLIPS[key]:
        a=actions.get(name) or next((a for n,a in actions.items() if n.startswith(name+".")),None)
        assert a is not None,(name,list(actions))
        reset(arm,bones);ad=arm.animation_data_create();ad.action=a
        slots=[x for x in a.slots if x.target_id_type=="OBJECT"]
        if slots:ad.action_slot=slots[0]
        lo,hi=map(float,a.frame_range);duration=(hi-lo)/fps
        assert 0<duration<60
        n=max(12,math.ceil(duration*24)+1);frames=[]
        for i in range(n):
            f=lo+(hi-lo)*i/(n-1);scene.frame_set(math.floor(f),subframe=f-math.floor(f))
            bpy.context.view_layer.update();frames.append(encode(locals_(arm,bones)))
        data["clips"][name]={"duration":duration,"frames":frames}
    return data
def prepare():
    manifest=json.loads((PRIOR/"manifest.json").read_text())
    assert len(manifest)==6
    targets={}
    for key,entry in sorted(manifest.items()):
        p=PRIOR/(key+".glb");assert digest(p)==entry["candidate_sha256"],key
        arm,bones=import_rig(p);assert len(bones)==104
        reset(arm,bones);targets[key]={**rig(arm,bones),"sha256":digest(p),"scale":entry["scale"],"sex":entry["sex"]}
    data={"sources":{k:source(k) for k in CLIPS},"targets":targets}
    (ROOT/"input.json").write_text(json.dumps(data,separators=(",",":")))
    (ROOT/"rig-inventory.json").write_text(json.dumps({"sources":{k:{x:v[x] for x in ("names","parents")} for k,v in data["sources"].items()},"targets":{k:{x:v[x] for x in ("names","parents","sha256")} for k,v in targets.items()}},indent=2))
def vertices(meshes):
    dep=bpy.context.evaluated_depsgraph_get();pts=[]
    for o in meshes:
        e=o.evaluated_get(dep);m=e.to_mesh()
        pts.extend(e.matrix_world@v.co for v in m.vertices);e.to_mesh_clear()
    return pts
def setup(meshes):
    pts=vertices(meshes);lo=Vector([min(p[j] for p in pts) for j in range(3)]);hi=Vector([max(p[j] for p in pts) for j in range(3)])
    h=hi.z-lo.z;assert .5<h<3.5,(lo,hi)
    c=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z+h*.53))
    s=bpy.context.scene;s.render.engine="CYCLES";s.cycles.samples=4;s.cycles.use_denoising=True;s.render.threads_mode="FIXED";s.render.threads=2
    s.render.resolution_x=384;s.render.resolution_y=480;s.render.resolution_percentage=100;s.render.image_settings.file_format="PNG"
    s.world=bpy.data.worlds.new("World");s.world.use_nodes=True;s.world.node_tree.nodes["Background"].inputs[0].default_value=(.25,.25,.25,1);s.world.node_tree.nodes["Background"].inputs[1].default_value=.6
    bpy.ops.object.camera_add(location=c+Vector((1.5,-3.5,.9))*h);cam=bpy.context.object;s.camera=cam;cam.data.type="ORTHO";cam.data.ortho_scale=h*1.45;cam.rotation_euler=(c-cam.location).to_track_quat("-Z","Y").to_euler()
    for offset,power in [((2,-3,4),550),((-3,-1,2),350),((0,3,3),450)]:
        bpy.ops.object.light_add(type="AREA",location=c+Vector(offset)*h);o=bpy.context.object;o.data.energy=power*h*h;o.data.size=3*h;o.rotation_euler=(c-o.location).to_track_quat("-Z","Y").to_euler()
    bpy.ops.mesh.primitive_plane_add(size=10*h,location=(c.x,c.y,lo.z));mat=bpy.data.materials.new("floor");mat.diffuse_color=(.30,.32,.35,1);bpy.context.object.data.materials.append(mat)
    return h,lo.z
def render():
    data=json.loads((ROOT/"input.json").read_text());out=json.loads((ROOT/"solved.json").read_text());report={}
    for sex in ("male","female"):
        key=min((k for k,v in data["targets"].items() if v["sex"]==sex),key=lambda k:abs(data["targets"][k]["scale"]-1))
        p=PRIOR/(key+".glb");assert digest(p)==data["targets"][key]["sha256"]
        arm,bones=import_rig(p);reset(arm,bones);rest=locals_(arm,bones,True)
        meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
        assert meshes;h,floor=setup(meshes)
        for name,entry in out[key].items():
            for variant,frames in entry["variants"].items():
                if not frames:continue
                n=min(16,len(frames));prefix=key+"-"+name+"-"+variant;mins=[];err=0
                with tempfile.TemporaryDirectory() as tmp:
                    for i in range(n):
                        f=frames[round((len(frames)-1)*i/(n-1))]
                        for b,m,t in zip(bones,rest,f):b.matrix_basis=m.inverted()@matrix(t["p"],t["r"])
                        bpy.context.view_layer.update()
                        actual=locals_(arm,bones)
                        err=max(err,max((m.to_translation()-Vector(t["p"])).length for m,t in zip(actual,f)))
                        pts=vertices(meshes);mins.append(min(p.z for p in pts)-floor)
                        s=bpy.context.scene;s.render.filepath=str(pathlib.Path(tmp)/f"{i:03d}.png");bpy.ops.render.render(write_still=True)
                        if i in (0,n//2,n-1):shutil.copyfile(s.render.filepath,ROOT/(prefix+f"-{i:03d}.png"))
                    subprocess.run([get_ffmpeg_exe(),"-y","-loglevel","error","-framerate",str((n-1)/entry["duration"]),"-i",tmp+"/%03d.png","-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(ROOT/(prefix+".mp4"))],check=True)
                report[prefix]={"frames":n,"body_height_m":h,"surface_floor_min_m":min(mins),"surface_floor_max_m":max(mins),"pose_replay_max_position_error_m":err}
                (ROOT/"render-report.json").write_text(json.dumps({"renders":report,"ART":"OPEN","contact":"OPEN","production":"BLOCKED"},indent=2))
                assert err<.002,(prefix,err)
if __name__=="__main__": {"prepare":prepare,"render":render}[sys.argv[-1]]()
