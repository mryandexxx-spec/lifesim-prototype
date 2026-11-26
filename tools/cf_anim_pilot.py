"""Production pilot, not a new solver experiment. Frozen R12 imported unmodified."""
import pathlib, sys, json, math, shutil, subprocess, tempfile, struct
import numpy as np
import bpy
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(pathlib.Path("frozen-fbik/tools").resolve()))
import cf_anim_fbik as F
OUT=pathlib.Path("pilot-out"); OUT.mkdir(exist_ok=True)
BENCH=pathlib.Path("assets/furniture/of-r2/garden.bench-new.glb")
BENCH_SHA="eb4407b9e6abc3ad42568f90e3a5d9242845dd7af81fa7f84714aeb4de7cd30b"
FPS=24

def interpolate(a,b,u):
    return F.encode([F.transform(Vector(x["p"]).lerp(Vector(y["p"]),u),
        F.matrix(x["p"],x["r"]).to_quaternion().slerp(F.matrix(y["p"],y["r"]).to_quaternion(),u)) for x,y in zip(a,b)])

def timeline(data,solved,t,key):
    clips={}
    for sk,s in data["sources"].items():
        for name,c in s["clips"].items():
            if name not in ("Sitting_Enter","Sitting_Exit"):continue
            frames=F.clone(solved[key][name]["variants"]["upf_common"])
            pairs,_=F.finger_map(s,t)
            for f,sf in zip(frames,c["frames"]):F.fingers(s,t,sf,f,pairs)
            assert len(frames)==len(c["frames"])
            hip=t["roles"]["hip"]
            ys=[F.pos(F.world(s,f),s["roles"]["hip"]).y for f in c["frames"]]
            lo,hi=min(ys),max(ys);assert hi-lo>.08
            weights=[F.smooth((hi-y)/(hi-lo)) for y in ys]
            n=max(2,round(c["duration"]*FPS))
            samples=[];wts=[]
            for k in range(n+1):
                v=k*(len(frames)-1)/n;i=min(int(v),len(frames)-2);u=v-i
                samples.append(interpolate(frames[i],frames[i+1],u))
                wts.append((1-u)*weights[i]+u*weights[i+1])
            clips[name]=(samples,wts)
    a,wa=clips["Sitting_Enter"];b,wb=clips["Sitting_Exit"]
    # Align seated root horizontally before the transition; no per-body angle edits.
    hip=t["roles"]["hip"]; pa=F.pos(F.world(t,a[-1]),hip);pb=F.pos(F.world(t,b[0]),hip)
    delta=pa-pb;delta.y=0
    for f in b:F.move_root(t,f,hip,delta)
    bridge=[interpolate(a[-1],b[0],F.smooth(i/12)) for i in range(1,13)]
    return a+bridge+[F.clone(b[0]) for _ in range(12)]+b[1:],wa+[1.]*24+wb[1:],(len(a)-1,len(a)+23)

def native_bench(t,pose,floor):
    assert F.digest(BENCH)==BENCH_SHA
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(BENCH.resolve()))
    objects=[o for o in bpy.context.scene.objects if o not in before]
    meshes=[o for o in objects if o.type=="MESH"]
    points=[]
    for o in meshes:
        for poly in o.data.polygons:
            mat=o.data.materials[poly.material_index]
            if not mat or not mat.name.startswith("Honey oak"):continue
            pts=[F.Y@o.matrix_world@o.data.vertices[i].co for i in poly.vertices]
            if all(abs(v.y-.64)<.001 for v in pts):points+=pts
    assert len(points)>=6,"Missing actual bench top geometry"
    lo=np.min(np.array(points),axis=0);hi=np.max(np.array(points),axis=0)
    assert hi[0]-lo[0]>1.4 and hi[2]-lo[2]>.15
    w=F.world(t,pose);x,front=F.seat_axes(t,w)
    # Native game bench front is +Z. Ensure a proper rotation (no reflection).
    x=Vector((front.z,0,-front.x))
    center=F.pos(w,t["roles"]["hip"]);center.y=floor+.64-.05
    native=Vector(((lo[0]+hi[0])/2,0,(lo[2]+hi[2])/2))
    rot=Matrix((x,Vector((0,1,0)),front)).transposed().to_4x4()
    assert rot.to_3x3().determinant()>.99
    origin=Vector((center.x,floor,center.z))-rot.to_3x3()@native
    m=Matrix.Translation(origin)@rot
    for o in objects:
        if o.parent not in objects:o.matrix_world=F.Y.inverted()@m@F.Y@o.matrix_world
    bpy.context.view_layer.update()
    vertices=[];triangles=[]
    for o in meshes:
        o.data.calc_loop_triangles();off=len(vertices)
        vertices.extend(F.Y@o.matrix_world@v.co for v in o.data.vertices)
        triangles.extend(tuple(off+i for i in tri.vertices) for tri in o.data.loop_triangles)
    bvh=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
    return (center,x,front,float(hi[0]-lo[0]),float(hi[2]-lo[2]),floor+.64),bvh,{"origin":list(origin),"yaw":math.atan2(front.x,front.z)*180/math.pi,"surface_bounds":[lo.tolist(),hi.tolist()]}

def limb_region(meshes,t,side):
    name=t["names"][t["roles"]["thigh_"+side]]
    out=[]
    for o in meshes:
        ids={g.index for g in o.vertex_groups if g.name==name}
        ix=[v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in ids)>.5]
        if ix:out.append((o,ix))
    assert out
    return out

def targets(t,frames,weights,arm,bones,rest,regs,pelvis,thighs,seat,floor):
    result=[]; anchors={}
    # Fixed joint set across the full clip is required by the frozen trajectory solver.
    for i,(f,s) in enumerate(zip(frames,weights)):
        F.apply(arm,bones,rest,f);w=F.world(t,f);g={}
        for side in regs:
            e=t["roles"]["foot_"+side];v=F.pos(w,e)
            if F.sole(regs[side])-floor<.035:
                if side not in anchors:anchors[side]=v.copy()
                v.x=anchors[side].x;v.z=anchors[side].z;v.y+=floor-F.sole(regs[side])
            else:anchors.pop(side,None)
            g[e]=F.transform(v,w[e].to_quaternion())
        hip=t["roles"]["hip"];v=F.pos(w,hip)
        shift=(seat[-1]-min(p.y for p in F.surface(pelvis)))*s
        g[hip]=F.transform(v+Vector((0,shift,0)),w[hip].to_quaternion())
        for side in regs:
            e=t["roles"]["hand_"+side];v=F.pos(w,e);q=w[e].to_quaternion()
            # Lap marker from actual thigh skin at the source palm's longitudinal position.
            pq,pc=F.palm(t,w,side,False)
            pts=F.surface(thighs[side]);nearest=min(pts,key=lambda p:(p-pc).length)
            # Preserve source arm swing; request lap contact only in seated phase.
            weight=F.smooth((s-.75)/.25)
            v=v.lerp(nearest+(v-pc)+Vector((0,.015,0)),weight)
            g[e]=F.transform(v,q)
        result.append(g)
    return result

def bake(arm,bones,rest,meshes,frames,path):
    scene=bpy.context.scene;scene.render.fps=FPS;scene.render.fps_base=1
    for o in [arm,*meshes]:
        if o.animation_data:o.animation_data_clear()
    for action in list(bpy.data.actions):bpy.data.actions.remove(action)
    previous={}
    for b in bones:b.rotation_mode="QUATERNION"
    for i,f in enumerate(frames):
        F.apply(arm,bones,rest,f)
        for b in bones:
            q=b.rotation_quaternion.copy()
            if b.name in previous and q.dot(previous[b.name])<0:q.negate()
            b.rotation_quaternion=q;previous[b.name]=q.copy()
            for prop in ("location","rotation_quaternion","scale"):b.keyframe_insert(prop,frame=i+1,group=b.name)
    arm.animation_data.action.name="Bench_Sit_Rest_Stand"
    scene.frame_start=1;scene.frame_end=len(frames);scene.frame_set(1)
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm,*meshes]:o.select_set(True)
    bpy.context.view_layer.objects.active=arm
    bpy.ops.export_scene.gltf(filepath=str(path.resolve()),export_format="GLB",use_selection=True,
        export_animations=True,export_animation_mode="ACTIONS",export_force_sampling=True,export_frame_range=True)
    raw=path.read_bytes();assert raw[:4]==b"glTF"
    n=struct.unpack_from("<I",raw,12)[0];doc=json.loads(raw[20:20+n])
    assert doc.get("skins") and len(doc["animations"])==1
    animation=doc["animations"][0]
    assert len(animation["channels"])>=len(bones)
    return {"sha256":F.digest(path),"bytes":len(raw),"animation":animation["name"],"channels":len(animation["channels"])}

def audit(t,f,g,arm,bones,rest,regs,meshes,pelvis,seat,bvh,weight,thighs):
    F.apply(arm,bones,rest,f);w=F.world(t,f)
    pts=F.surface([(o,list(range(len(o.data.vertices)))) for o in meshes])
    # Nearest oriented real triangle diagnostic, not proof of solid mesh containment.
    penetration=0;minimum=0.
    for p in pts:
        hit,normal,_,d=bvh.find_nearest(p)
        if hit is not None and d<.08:
            sd=(p-hit).dot(normal)
            if sd<-.005:penetration+=1;minimum=min(minimum,sd)
    support=min(abs(p.y-seat[-1]) for p in F.surface(pelvis))
    lap={}
    for side in regs:
        _,pc=F.palm(t,w,side,False)
        lap[side]=min((p-pc).length for p in F.surface(thighs[side]))
    return {"floor_min_m":min(F.sole(regs[s])-seat[-1]+.64 for s in regs),
        "slab_vertices":F.seat_overlap(meshes,seat),"near_triangle_negative_count":penetration,
        "near_triangle_min_m":minimum,"pelvis_height_gap_m":support,"lap_marker_gap_m":lap,
        "seated_weight":weight,"targets":F.pose_error(t,f,g)}

def main():
    data=F.read("input.json");solved=F.read("solved.json");inv=F.read("semantic-inventory.json")
    for k,s in data["sources"].items():s["roles"]=inv["sources"][k]["map"]
    for k,t in data["targets"].items():t["roles"]=inv["targets"][k]["map"]
    report={"scope":"bench sit/rest/stand pilot; exact frozen R12 solver, actual native bench; ART and DEVICE OPEN","profiles":{}}
    for sex in ("female","male"):
        key=min((k for k,v in data["targets"].items() if v["sex"]==sex),key=lambda k:abs(data["targets"][k]["scale"]-1))
        t=data["targets"][key];path=pathlib.Path("prior-full")/(key+".glb");assert F.digest(path)==t["sha256"]
        arm,bones=F.import_rig(path);F.reset(arm,bones);rest=F.locals_(arm,bones,True)
        meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
        h,floor=F.setup(meshes);regs={s:F.regions(meshes,t,s) for s in ("l","r")}
        skin=F.WeightedSkin(t,meshes,arm,bones);F.apply(arm,bones,rest,t["rest"]);assert skin.actual_error(t["rest"])["max_m"]<.002
        pelvis=F.regions(meshes,t);thighs={s:limb_region(meshes,t,s) for s in regs}
        frames,weights,seams=timeline(data,solved,t,key)
        seat,bvh,bench=native_bench(t,frames[seams[0]],floor)
        goals=targets(t,frames,weights,arm,bones,rest,regs,pelvis,thighs,seat,floor)
        corrected,stats=F.trajectory(t,frames,goals,skin,floor,seat,1/FPS)
        assert stats["executed"],stats
        rows=[]
        for i,(f,g,s) in enumerate(zip(corrected,goals,weights)):
            row=audit(t,f,g,arm,bones,rest,regs,meshes,pelvis,seat,bvh,s,thighs)
            row["skin_replay"]=skin.actual_error(f);assert row["skin_replay"]["max_m"]<.002
            if i:row["max_joint_step_rad"]=max(2*math.acos(min(1.,abs(F.matrix(a["p"],a["r"]).to_quaternion().dot(F.matrix(b["p"],b["r"]).to_quaternion())))) for a,b in zip(f,corrected[i-1]))
            rows.append(row)
        # Render both front-quarter and side: every frame, actual mesh and furniture.
        scene=bpy.context.scene;cam=scene.camera;target=F.Y.inverted()@Vector((seat[0].x,floor+h*.5,seat[0].z))
        for view,offset in (("quarter",Vector((1.7,-3.,1.2))),("side",Vector((3.,0.,.8)))):
            cam.location=target+offset*h;cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.7
            with tempfile.TemporaryDirectory() as tmp:
                for i,f in enumerate(corrected):
                    F.apply(arm,bones,rest,f);scene.render.filepath=str(pathlib.Path(tmp)/f"{i:03d}.png")
                    bpy.ops.render.render(write_still=True)
                    if i in (0,*seams,len(corrected)-1):shutil.copyfile(scene.render.filepath,OUT/f"{sex}-{view}-{i:03d}.png")
                subprocess.run([F.get_ffmpeg_exe(),"-y","-loglevel","error","-framerate",str(FPS),"-i",tmp+"/%03d.png","-c:v","libx264","-pix_fmt","yuv420p",str(OUT/f"{sex}-{view}.mp4")],check=True)
        exported=bake(arm,bones,rest,meshes,corrected,OUT/f"{sex}.glb")
        report["profiles"][sex]={"key":key,"rig_sha":t["sha256"],"bench":bench,"frames":len(corrected),"fps":FPS,"seams":seams,"solver":stats,"export":exported,"samples":rows}
        (OUT/"report.json").write_text(json.dumps(report,indent=2))
    shutil.copyfile(BENCH,OUT/"bench.glb")
    print("Pilot exported; independent artistic/contact gate OPEN")
if __name__=="__main__":main()
