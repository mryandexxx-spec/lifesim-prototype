"""Render actual pinned UAL skinned source motion; not target-character retarget."""
import bpy, pathlib, json, math, subprocess, tempfile
from mathutils import Vector, Matrix
ROOT=pathlib.Path("cf-anim-source-report")
CLIPS={"ual1":["Walk_Loop","Sitting_Enter","Sitting_Exit","Idle_Talking_Loop"],
       "ual2":["Consume","Farm_Watering","Farm_Harvest","Idle_TalkingPhone_Loop"]}
def verts(meshes):
    dep=bpy.context.evaluated_depsgraph_get()
    vs=[]
    for o in meshes:
        e=o.evaluated_get(dep); m=e.to_mesh()
        vs.extend(tuple(e.matrix_world @ v.co) for v in m.vertices);e.to_mesh_clear()
    return vs
def choose(arm,action,frame):
    for o in bpy.data.objects:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks:tr.mute=True
    ad=arm.animation_data_create();ad.action=None
    for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
    ad.action=action
    slots=[x for x in action.slots if x.target_id_type=="OBJECT"]
    if slots:ad.action_slot=slots[0]
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
def setup(v):
    s=bpy.context.scene;s.render.engine="CYCLES";s.cycles.samples=4;s.cycles.use_denoising=True
    s.render.threads_mode="FIXED";s.render.threads=2
    s.render.resolution_x=288;s.render.resolution_y=360;s.render.resolution_percentage=100
    s.render.image_settings.file_format="PNG"
    s.world=bpy.data.worlds.new("World");s.world.use_nodes=True
    s.world.node_tree.nodes["Background"].inputs[0].default_value=(.25,.25,.25,1)
    s.world.node_tree.nodes["Background"].inputs[1].default_value=.6
    lo=[min(p[j] for p in v) for j in range(3)];hi=[max(p[j] for p in v) for j in range(3)]
    h=hi[2]-lo[2];assert h>.1
    center=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]+h*.53))
    bpy.ops.object.camera_add(location=center+Vector((2.0,-3.8,1.0))*h)
    c=bpy.context.object;s.camera=c;c.data.type="ORTHO";c.data.ortho_scale=h*1.8
    c.rotation_euler=(center-c.location).to_track_quat("-Z","Y").to_euler()
    for offset,power in [((2,-3,4),550),((-3,-1,2),350),((0,3,3),450)]:
        bpy.ops.object.light_add(type="AREA",location=center+Vector(offset)*h)
        o=bpy.context.object;o.data.energy=power*h*h;o.data.shape="DISK";o.data.size=3*h
        o.rotation_euler=(center-o.location).to_track_quat("-Z","Y").to_euler()
    bpy.ops.mesh.primitive_plane_add(size=12*h,location=(center.x,center.y,lo[2]-.005*h))
    mat=bpy.data.materials.new("floor");mat.diffuse_color=(.30,.32,.35,1);bpy.context.object.data.materials.append(mat)
    return h
def main():
    report={}
    for key,names in CLIPS.items():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath="/tmp/cf-anim-sources/"+key+".glb")
        arms=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"];assert len(arms)==1
        arm=arms[0];meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
        assert meshes and len(arm.data.bones)==65
        actions={a.name:a for a in bpy.data.actions}
        fps=bpy.context.scene.render.fps/bpy.context.scene.render.fps_base
        neutral=verts(meshes);h=setup(neutral)
        for name in names:
            a=actions.get(name) or next((a for n,a in actions.items() if n.startswith(name+".")),None)
            assert a is not None,(name,list(actions))
            start,end=map(float,a.frame_range);duration=(end-start)/fps
            assert duration>0
            n=max(12,min(36,math.ceil(duration*12)+1))
            first=None;move=0;mins=[]
            with tempfile.TemporaryDirectory() as tmp:
                for i in range(n):
                    frame=round(start+(end-start)*i/(n-1));choose(arm,a,frame)
                    v=verts(meshes);assert v
                    if first is None:first=v
                    move=max(move,max(math.dist(p,q) for p,q in zip(first,v)))
                    mins.append(min(p[2] for p in v))
                    s=bpy.context.scene;s.render.filepath=str(pathlib.Path(tmp)/f"{i:03d}.png")
                    bpy.ops.render.render(write_still=True)
                    if i in (0,n//2,n-1):
                        import shutil
                        shutil.copyfile(s.render.filepath,ROOT/f"{key}-{name}-{i:03d}.png")
                rate=(n-1)/duration
                subprocess.run(["ffmpeg","-y","-loglevel","error","-framerate",str(rate),"-i",tmp+"/%03d.png","-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(ROOT/f"{key}-{name}.mp4")],check=True)
            assert move>h*.005,(name,move,h)
            report[key+"/"+name]={"source_frames":[start,end],"fps":fps,"duration_s":duration,"rendered_samples":n,"max_surface_displacement":move,"height":h,"floor_min_range":[min(mins),max(mins)]}
            (ROOT/"playback.json").write_text(json.dumps({"clips":report,"art":"OPEN","hold_visual":"OPEN","target_retarget":"OPEN"},indent=2))
if __name__=="__main__":main()
