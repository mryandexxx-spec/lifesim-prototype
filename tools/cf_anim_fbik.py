"""FBIK R1 capability comparison on frozen real rigs; not a production solver."""
import sys, pathlib, json, math, tempfile, subprocess, shutil, time
import xml.etree.ElementTree as ET
import numpy as np
import bpy
import mujoco
import mink
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig, reset, locals_, matrix, encode, setup, digest, Y, get_ffmpeg_exe
from cf_anim_contacts import (read, world, pos, unit, clone, move_root, regions, sole, surface,
    ear_candidates, palm, fingers, finger_map, contact_windows, stance_travel, seat_axes,
    oriented_seat, seat_overlap, proxy, smooth, ik)
OUT=pathlib.Path("fbik-out");OUT.mkdir(exist_ok=True)

def nums(v):return " ".join(str(float(x)) for x in v)
def transform(p,q):
    return Matrix.Translation(p)@q.to_matrix().to_4x4()
def ancestor_set(t,ids):
    result=set()
    for i in ids:
        while i>=0:
            result.add(i);i=t["parents"][i]
    return result

def native(arm,bones,rest,t,bf,goals):
    # Native multi-effector constraints evaluated together, not sequential limb edits.
    arm.pose.ik_solver="ITASC"
    apply(arm,bones,rest,bf)
    added=[]
    try:
        for i,goal in goals.items():
            obj=bpy.data.objects.new("FBIK target",None);bpy.context.collection.objects.link(obj)
            obj.matrix_world=Y.inverted()@goal
            b=bones[i];con=b.constraints.new("IK");con.target=obj;con.use_tail=False
            con.chain_count=0;con.use_location=True;con.use_rotation=True
            con.use_stretch=False;con.weight=1.;con.orient_weight=.35
            added.append((b,con,obj))
        bpy.context.view_layer.update()
        deps=bpy.context.evaluated_depsgraph_get();ea=arm.evaluated_get(deps)
        actual=encode(locals_(ea,list(ea.pose.bones)))
    finally:
        for b,c,o in added:b.constraints.remove(c);bpy.data.objects.remove(o,do_unlink=True)
        bpy.context.view_layer.update()
    return actual

def skin_samples(t,meshes,arm,bones,rest):
    # Point proxies from actual neutral skinned surface with dominant bone support.
    # These are sparse proxies, not exact triangle collision or blended-skin certificates.
    reset(arm,bones)
    w=world(t,t["rest"]); roles=t["roles"]
    selected={roles["hip"]}
    for side in ("l","r"):
        selected.update(roles[x+"_"+side] for x in ("thigh","shin","foot"))
    for i,p in enumerate(t["parents"]):
        if p in (roles["foot_l"],roles["foot_r"]):selected.add(i)
    samples={i:[] for i in selected}
    for o in meshes:
        mapping={g.index:t["names"].index(g.name) for g in o.vertex_groups if g.name in t["names"]}
        for v in o.data.vertices:
            if not v.groups:continue
            g=max(v.groups,key=lambda g:g.weight);i=mapping.get(g.group)
            if i in samples and g.weight>.5:samples[i].append(w[i].inverted()@(Y@o.matrix_world@v.co))
    out={}
    for i,pts in samples.items():
        if not pts:continue
        a=np.asarray([list(p) for p in pts]);center=a.mean(axis=0)
        # Extremal and farthest-point sampling, identical procedure for every body.
        chosen=[int(np.argmax(np.linalg.norm(a-center,axis=1)))]
        for _ in range(min(11,len(a)-1)):
            d=np.min(np.linalg.norm(a[:,None,:]-a[chosen][None,:,:],axis=2),axis=1)
            chosen.append(int(np.argmax(d)))
        out[i]=[a[j] for j in sorted(set(chosen))]
    assert roles["hip"] in out and all(roles["foot_"+s] in out for s in ("l","r"))
    return out

def qp(t,bf,goals,collision=None):

    # MJCF built from the actual sampled hierarchy, no robot or borrowed body.
    # The starting pose is the local reference; ball joints preserve segment length.
    root=ET.Element("mujoco",model="LifeSim diagnostic");ET.SubElement(root,"compiler",angle="radian")
    scene=ET.SubElement(root,"worldbody")
    active=ancestor_set(t,goals); nodes=[]
    if collision:
        samples,floor,seat_info=collision
        active|=ancestor_set(t,samples)
        floorq=Quaternion((1,0,0),-math.pi/2)
        ET.SubElement(scene,"geom",name="floor",type="plane",pos=nums((0,floor,0)),quat=nums(floorq),size="10 10 .01")
        if seat_info:
            center,x,front,width,depth,top=seat_info
            up=Vector((0,1,0));z=unit(x.cross(up))
            q=Matrix((x,up,z)).transposed().to_quaternion()
            ET.SubElement(scene,"geom",name="seat",type="box",pos=nums(center),quat=nums(q),size=nums((width/2,.05,depth/2)))
    proxy_names=[]

    for i,b in enumerate(bf):
        p=t["parents"][i];m=matrix(b["p"],b["r"]);q=m.to_quaternion()
        node=ET.SubElement(scene if p<0 else nodes[p],"body",name=f"b{i}",pos=nums(m.translation),quat=nums(q))
        nodes.append(node)
        if i in active:
            if p<0:ET.SubElement(node,"freejoint",name=f"j{i}")
            else:ET.SubElement(node,"joint",name=f"j{i}",type="ball")
            ET.SubElement(node,"inertial",pos="0 0 0",mass="1",diaginertia=".01 .01 .01")
        if collision and i in samples:
            for j,p in enumerate(samples[i]):
                name=f"skin{i}_{j}";proxy_names.append(name)
                ET.SubElement(node,"geom",name=name,type="sphere",pos=nums(p),size=".002",mass="0",contype="1",conaffinity="1")

    model=mujoco.MjModel.from_xml_string(ET.tostring(root,encoding="unicode"))
    cfg=mink.Configuration(model)
    # Validate the conversion before trusting solver numbers.
    before=world(t,bf)
    for i,w in enumerate(before):
        j=model.body(f"b{i}").id
        assert np.linalg.norm(cfg.data.xpos[j]-np.array(w.translation))<.0001,("MJCF position mismatch",i)
        assert abs(np.dot(cfg.data.xquat[j],np.array(w.to_quaternion())))>.99999,("MJCF rotation mismatch",i)
    tasks=[]
    posture=mink.PostureTask(model,cost=.015);posture.set_target_from_configuration(cfg);tasks.append(posture)
    for i,g in goals.items():
        task=mink.FrameTask(f"b{i}","body",position_cost=1.,orientation_cost=.35,lm_damping=.01)
        task.set_target(mink.SE3.from_rotation_and_translation(mink.SO3(np.array(g.to_quaternion())),np.array(g.translation)))
        tasks.append(task)
    limits=None
    if collision:
        pairs=[(proxy_names,["floor"])]
        if seat_info:pairs.append((proxy_names,["seat"]))
        limits=[mink.ConfigurationLimit(model),mink.CollisionAvoidanceLimit(model,geom_pairs=pairs,
            minimum_distance_from_collisions=0.,collision_detection_distance=.06)]
    for _ in range(24):
        vel=mink.solve_ik(cfg,tasks,.05,"daqp",damping=.001,limits=limits)

        assert np.isfinite(vel).all()
        cfg.integrate_inplace(vel,.05)
    ws=[]
    for i in range(len(bf)):
        j=model.body(f"b{i}").id
        ws.append(transform(Vector(cfg.data.xpos[j]),Quaternion(cfg.data.xquat[j])))
    return encode([w if p<0 else ws[p].inverted()@w for w,p in zip(ws,t["parents"])])

def apply(arm,bones,rest,f):
    for b,m,v in zip(bones,rest,f):b.matrix_basis=m.inverted()@matrix(v["p"],v["r"])
    bpy.context.view_layer.update()
def pose_error(t,f,goals):
    w=world(t,f)
    return {t["names"][i]:{"position_m":(w[i].translation-g.translation).length,
        "orientation_rad":2*math.acos(min(1.,abs(w[i].to_quaternion().dot(g.to_quaternion()))))}
        for i,g in goals.items()}
def metrics(t,f,goals,arm,bones,rest,regs,meshes,seat_info,floor,bf):
    apply(arm,bones,rest,f);actual=encode(locals_(arm,bones))
    w=world(t,actual);base=world(t,bf)
    # Measure actual evaluated skin and pose; not a collision-free certification.
    errors=pose_error(t,actual,goals)
    return {"targets":errors,"floor_min_m":min(sole(regs[s])-floor for s in regs),
        "seat_slab_vertices":seat_overlap(meshes,seat_info) if seat_info else None,
        "max_local_rotation_delta_rad":max(2*math.acos(min(1.,abs(matrix(a["p"],a["r"]).to_quaternion().dot(matrix(b["p"],b["r"]).to_quaternion())))) for a,b in zip(actual,bf)),
        "max_segment_change_m":max(abs((pos(w,i)-pos(w,p)).length-(pos(base,i)-pos(base,p)).length) for i,p in enumerate(t["parents"]) if p>=0 and i!=t["roles"]["hip"])}
def main():
    data=read("input.json");solved=read("solved.json");inv=read("semantic-inventory.json")
    for k,s in data["sources"].items():s["roles"]=inv["sources"][k]["map"]
    for k,t in data["targets"].items():t["roles"]=inv["targets"][k]["map"]
    old=list(pathlib.Path("prior-contacts").rglob("report.json"));assert len(old)==1
    prior=json.loads(old[0].read_text());assert len(prior["profiles"])==6
    report={"scope":"R4: matched Mink with/without sparse skin-derived collision inequalities; iTaSC original reference; not full contact/ART gate","production":"BLOCKED","ART":"OPEN","profiles":{}}
    for key,t in data["targets"].items():
        path=pathlib.Path("prior-full")/(key+".glb");assert digest(path)==t["sha256"]
        arm,bones=import_rig(path);reset(arm,bones);rest=locals_(arm,bones,True)
        meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
        h,floor=setup(meshes);regs={s:regions(meshes,t,s) for s in ("l","r")}
        samples=skin_samples(t,meshes,arm,bones,rest)
        pelvis=regions(meshes,t);ears=ear_candidates(meshes,t);hip=t["roles"]["hip"]
        report["profiles"][key]={}
        central=key==min((k for k,v in data["targets"].items() if v["sex"]==t["sex"]),key=lambda k:abs(data["targets"][k]["scale"]-1))
        for sk,s in data["sources"].items():
            for name,c in s["clips"].items():
                frames=clone(solved[key][name]["variants"]["upf_common"])
                dt=c["duration"]/(len(frames)-1);sw=[world(s,f) for f in c["frames"]]
                windows={};weights={}
                for side in regs:
                    windows[side],weights[side]=contact_windows([list(pos(w,s["roles"]["foot_"+side])) for w in sw],dt,.035)
                if name=="Walk_Loop":
                    travel=stance_travel(t,frames,windows,dt)
                    for i,f in enumerate(frames):move_root(t,f,hip,travel*(i*dt))
                tw=[world(t,f) for f in frames]
                anchors={side:{i:pos(tw[a],t["roles"]["foot_"+side]) for a,b in windows[side] for i in range(a,b+1)} for side in regs}
                seat=None;seat_info=None;seatw=np.zeros(len(frames));phone=None;pside=None
                if "Sitting_" in name:
                    ys=np.array([pos(w,s["roles"]["hip"]).y for w in sw]);drop=float(max(ys)-min(ys))
                    assert drop>.08
                    seatw=np.array([smooth((max(ys)-y)/drop) for y in ys])
                    idx=int(np.argmin(ys));center=pos(tw[idx],hip);x,front=seat_axes(t,tw[idx])
                    center=center-front*(.38*.35);center.y=floor+.40
                    seat=oriented_seat(center,x,front,.52,.38);seat_info=(center,x,front,.52,.38,floor+.45)
                if "Phone" in name:
                    pside=min(regs,key=lambda side:np.median([(pos(w,s["roles"]["hand_"+side])-pos(w,s["roles"]["head"])).length for w in sw]))
                    phone=proxy("phone-proxy",(0,0,0),(.075,.145,.012),(.12,.12,.15))
                pairs,_=finger_map(s,t);rows=[];variants={k:[] for k in ("baseline","itasc","mink","mink_collision")};props=[]
                # All sampled source frames; same target definitions for both solvers.
                for i,bf0 in enumerate(frames):
                    bf=clone(bf0);fingers(s,t,c["frames"][i],bf,pairs);apply(arm,bones,rest,bf)
                    w=world(t,bf);goals={}
                    for side in regs:
                        e=t["roles"]["foot_"+side];low=sole(regs[side])
                        weight=float(weights[side][i])
                        if weight>0 or low<floor:
                            target=anchors[side].get(i,pos(w,e)).copy();target.y=w[e].translation.y+floor-low
                            p=pos(w,e).lerp(target,weight if weight>0 else 1.)
                            goals[e]=transform(p,w[e].to_quaternion())
                    if seat and seatw[i]>.01:
                        shift=(floor+.45-min(p.y for p in surface(pelvis)))*float(seatw[i])
                        goals[hip]=transform(pos(w,hip)+Vector((0,shift,0)),w[hip].to_quaternion())
                    phone_matrix=None
                    if phone:
                        head=w[t["roles"]["head"]];ear=head@ears[pside]
                        lateral=unit(ear-head.translation);e=t["roles"]["hand_"+pside]
                        palmq,pc=palm(t,w,pside,False)
                        normal=palmq@Vector((0,0,1))
                        # Choose the inward-facing palm sign closest to source; explicit orientation proxy.
                        inward=-lateral if normal.dot(-lateral)>=0 else lateral
                        dq=normal.rotation_difference(inward)
                        target=ear+lateral*.025-dq@(pc-pos(w,e))
                        goals[e]=transform(target,dq@w[e].to_quaternion())
                        phone_matrix=transform(ear+lateral*.012,dq@palmq)
                    row={"frame":i,"goal_count":len(goals),"variants":{}}
                    for label,fn in (("baseline",lambda:bf),("itasc",lambda:native(arm,bones,rest,t,bf,goals)),("mink",lambda:qp(t,bf,goals)),("mink_collision",lambda:qp(t,bf,goals,(samples,floor,seat_info)))):
                        start=time.perf_counter()
                        failure=None
                        try:
                            f=fn() if goals or label=="mink_collision" else bf
                        except mink.NoSolutionFound as exc:
                            if label!="mink_collision":raise
                            failure=str(exc);f=bf
                        assert all(math.isfinite(z) for b in f for z in b["p"]+b["r"])
                        row["variants"][label]=metrics(t,f,goals,arm,bones,rest,regs,meshes,seat_info,floor,bf)
                        row["variants"][label]["elapsed_s"]=time.perf_counter()-start
                        row["variants"][label]["infeasible"]=failure is not None
                        variants[label].append(f)
                    props.append(phone_matrix);rows.append(row)
                report["profiles"][key][name]={"samples":rows,"prior_r2_summary":prior["profiles"][key][name]["summary"],"comparison_note":"R2 historical targets differ; not a matched R2 solve."}
                (OUT/"report.json").write_text(json.dumps(report,indent=2))
                if central:
                    for label,fs in variants.items():
                        n=min(12,len(fs));prefix=f"{key}-{name}-{label}"
                        with tempfile.TemporaryDirectory() as tmp:
                            for j in range(n):
                                idx=round((len(fs)-1)*j/(n-1));apply(arm,bones,rest,fs[idx])
                                if phone and props[idx] is not None:phone.matrix_world=Y.inverted()@props[idx]@Matrix.Diagonal((.075,.012,.145,1.))
                                scene=bpy.context.scene;scene.render.filepath=str(pathlib.Path(tmp)/f"{j:03d}.png")
                                bpy.ops.render.render(write_still=True)
                                if j in (0,n//2,n-1):shutil.copyfile(scene.render.filepath,OUT/(prefix+f"-{j:03d}.png"))
                            subprocess.run([get_ffmpeg_exe(),"-y","-loglevel","error","-framerate",str((n-1)/c["duration"]),"-i",tmp+"/%03d.png","-c:v","libx264","-pix_fmt","yuv420p",str(OUT/(prefix+".mp4"))],check=True)
                for o in (seat,phone):
                    if o:bpy.data.objects.remove(o,do_unlink=True)
    assert len(report["profiles"])==6 and all(len(x)==4 for x in report["profiles"].values())
    assert len(list(OUT.glob("*.mp4")))==32
    print("R4 diagnostic execution complete; ART and contact acceptance OPEN")
if __name__=="__main__":main()
