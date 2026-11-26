"""01C bounded matched bake, no per-rig adjustments and no R12 changes."""
import pathlib,sys,json,math,tempfile,subprocess,shutil
import bpy,numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0,str(pathlib.Path("frozen-fbik/tools").resolve()))
import cf_anim_fbik as F
sys.path.insert(0,str(pathlib.Path("prior-pilot/tools").resolve()))
import cf_anim_pilot as P
OUT=pathlib.Path("pilot-out")
SIDES=("l","r");FPS=24
# Frozen before first solve, same gates for all cases. These are engineering
# screening tolerances, not validated anatomical limits or ART certification.
GATES={"skinReplayM":.002,"floorPenetrationM":.005,"holdSoleGapM":.02,
       "holdSupportGapM":.025,"holdSupportPenetrationM":.005,"holdFootSlideM":.02,
       "holdPalmP10GapM":.03,"jointStepRad":.35,"slatInteriorM":.005}
def vec(v):return Vector((v["x"],v["y"],v["z"])) if isinstance(v,dict) else Vector(v)
def support(t,w,pelvis,thighs):
    points=list(F.surface(pelvis))
    for side in SIDES:
        a=F.pos(w,t["roles"]["thigh_"+side]);b=F.pos(w,t["roles"]["shin_"+side]);axis=b-a
        points.extend(p for p in F.surface(thighs[side]) if -.25<=(p-a).dot(axis)/axis.length_squared<=.55)
    cloud=np.array([list(v) for v in points]);assert len(cloud)>0
    low=float(np.quantile(cloud[:,1],.10))
    return cloud[(cloud[:,1]>=low-.025)&(cloud[:,1]<=low+.025)],low
def bvh_bench(path,asset):
    assert F.digest(path)==asset["assetSha"]
    before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    meshes=[o for o in bpy.context.scene.objects if o not in before and o.type=="MESH"]
    vertices=[];triangles=[]
    for o in meshes:
        o.data.calc_loop_triangles();off=len(vertices)
        vertices.extend(F.Y@o.matrix_world@v.co for v in o.data.vertices)
        triangles.extend(tuple(off+i for i in tri.vertices) for tri in o.data.loop_triangles)
    assert vertices and triangles
    return BVHTree.FromPolygons(vertices,triangles,all_triangles=True),len(vertices),len(triangles)
def stance_weights(action):
    out={}
    for side in SIDES:
        fs=[]
        for name in ("Sitting_Enter","Sitting_Exit"):
            c=action["clips"][name];w=c["footContacts"][side]["weights"]
            n=max(2,round(c["durationS"]*FPS))
            fs.append(np.interp(np.linspace(0,len(w)-1,n+1),np.arange(len(w)),w).tolist())
        out[side]=fs[0]+[1.]*24+fs[1][1:]
    return out
def main():
    plan=json.loads((OUT/"plan.json").read_text());r=plan["rig"];key=r["id"];action=plan["action"];a=plan["asset"];result=plan["result"]
    assert result["status"]=="MEASURED_PREFLIGHT_CANDIDATE"
    data=F.read("input.json");solved=F.read("solved.json");inv=F.read("semantic-inventory.json")
    for k,s in data["sources"].items():s["roles"]=inv["sources"][k]["map"]
    for k,t in data["targets"].items():t["roles"]=inv["targets"][k]["map"]
    t=data["targets"][key];path=pathlib.Path("prior-full")/(key+".glb")
    assert F.digest(path)==r["revision"]==t["sha256"]
    arm,bones=F.import_rig(path);F.reset(arm,bones);rest=F.locals_(arm,bones,True)
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
    h,_=F.setup(meshes);skin=F.WeightedSkin(t,meshes,arm,bones)
    F.apply(arm,bones,rest,t["rest"]);assert skin.actual_error(t["rest"])["max_m"]<.002
    regs={s:F.regions(meshes,t,s) for s in SIDES};pelvis=F.regions(meshes,t)
    thighs={s:P.limb_region(meshes,t,s) for s in SIDES};hands={s:P.palm_region(meshes,t,s) for s in SIDES}
    s=data["sources"][action["sourceKey"]];c=s["clips"]["Sitting_Enter"];idx=action["clips"]["Sitting_Enter"]["seatedIndex"]
    ref=F.clone(solved[key]["Sitting_Enter"]["variants"]["upf_common"][idx]);pairs,_=F.finger_map(s,t);F.fingers(s,t,c["frames"][idx],ref,pairs)
    F.apply(arm,bones,rest,ref);rw=F.world(t,ref);_,front=F.seat_axes(t,rw)
    # Single asset-local-to-world placement from measured passport and resolver.
    yaw=math.radians(result["yaw"])-math.atan2(front.x,front.z);rot=Matrix.Rotation(yaw,4,"Y")
    center=vec(r["poses"]["Sitting_Enter"]["supportOriginWorld"]);contact=vec(result["contact"])
    shift=contact-rot@center;shift.y=result["floorY"]-r["floorY"]
    placement=Matrix.Translation(shift)@rot
    frames,weights,seams=P.timeline(data,solved,t,key)
    for i,f in enumerate(frames):
        frames[i]=F.encode([placement@F.matrix(b["p"],b["r"]) if t["parents"][j]<0 else F.matrix(b["p"],b["r"]) for j,b in enumerate(f)])
    fw=stance_weights(action);assert all(len(w)==len(frames) for w in fw.values())
    floor=result["floorY"];height=a["seatY"]
    x=vec(result["tangent"]);front=x.cross(Vector((0,1,0))).normalized()
    # Frozen solver accepts one continuous slab proxy, not slat union. Audit
    # actual slats and triangles independently; no pretending it solved BVH.
    bounds=(min(q["minX"] for q in a["regions"]),max(q["maxX"] for q in a["regions"]),min(q["minZ"] for q in a["regions"]),max(q["maxZ"] for q in a["regions"]))
    seat_center=Vector((0,height-.05,0))
    slab=(seat_center,x,front,bounds[1]-bounds[0],bounds[3]-bounds[2],height)
    bvh,nv,nt=bvh_bench(OUT/"bench.glb",a)
    # Foot XZ anchors come from the source contact interval. All goal joints
    # appear every frame so frozen trajectory has identical model layout.
    goals=[];anchors={};staging=[]
    for i,(f,wgt) in enumerate(zip(frames,weights)):
        F.apply(arm,bones,rest,f);w=F.world(t,f);patch,low=support(t,w,pelvis,thighs)
        assert len(patch)>0
        # Place pelvis support vertically from one semantic surface; keep
        # authored local rotations and bone lengths, no preliminary limb IK.
        lift=(height+.002-low)*wgt
        F.move_root(t,f,t["roles"]["hip"],Vector((0,lift,0)))
        F.apply(arm,bones,rest,f);w=F.world(t,f)
        hip=t["roles"]["hip"];g={hip:F.transform(F.pos(w,hip),w[hip].to_quaternion())}
        for side in SIDES:
            e=t["roles"]["foot_"+side];v=F.pos(w,e);q=w[e].to_quaternion();weight=float(fw[side][i])
            if weight>0:
                if side not in anchors:
                    anchors[side]=(v.copy(),q.copy())
                target,orientation=anchors[side]
                goal=target.copy();goal.y=v.y+floor-F.sole(regs[side])
                v=v.lerp(goal,weight);q=q.slerp(orientation,weight)
            else:anchors.pop(side,None)
            g[e]=F.transform(v,q)
            hand=t["roles"]["hand_"+side];v=F.pos(w,hand);q=w[hand].to_quaternion()
            weight=F.smooth((wgt-.70)/.30)
            if weight>0:
                aa=F.pos(w,t["roles"]["thigh_"+side]);bb=F.pos(w,t["roles"]["shin_"+side]);axis=bb-aa
                candidates=[p for p in F.surface(thighs[side]) if .35<=(p-aa).dot(axis)/axis.length_squared<=.65]
                assert candidates
                mid=aa+axis*.5;upper=[p for p in candidates if p.y>=float(np.quantile([v.y for v in candidates],.8))]
                target=min(upper,key=lambda p:(p-mid).length)
                pq,pc=F.palm(t,w,side,False);yy=axis.normalized();up=Vector((0,1,0));zz=(up-yy*up.dot(yy)).normalized()
                if (pq@Vector((0,0,1))).dot(zz)<0:zz=-zz
                xx=yy.cross(zz).normalized();zz=xx.cross(yy).normalized()
                want=Matrix((xx,yy,zz)).transposed().to_quaternion();dq=want@pq.inverted()
                v=v.lerp(target+up*.012+dq@(v-pc),weight);q=q.slerp(dq@q,weight)
            g[hand]=F.transform(v,q)
        goals.append(g);staging.append({"frame":i,"rootPlacementLiftM":lift})
    corrected,stats=F.trajectory(t,frames,goals,skin,floor,slab,1/FPS)
    report={"scope":"01C matched preflight candidates only; actual geometry and frozen R12 slab proxy distinguished",
      "rig":key,"fixture":plan["fixture"],"assetSha":a["assetSha"],"rigSha":r["revision"],
      "frozenFbik":"6974fc7e91ee2b089bde79c701eee946da142b51","solver":stats,"gates":GATES,
      "seams":seams,"frames":len(corrected),"staging":staging,"triangleCount":nt,"vertexCount":nv,"samples":[]}
    def save(): (OUT/"contact-report.json").write_text(json.dumps(report,indent=2,allow_nan=False))
    save()
    assert stats["executed"],stats
    # True slat top regions in semantic coordinates, not catalog AABB. Slat
    # interior proxy excludes bevel/edges; BVH nearest normals are diagnostics.
    def local(p):return (float(p.dot(x)),float(p.dot(front)))
    previous=None;hold_feet={};failures=set()
    for i,(f,g,wgt) in enumerate(zip(corrected,goals,weights)):
        F.apply(arm,bones,rest,f);w=F.world(t,f);allp=F.surface(skin.reg)
        actual=skin.actual_error(f);assert actual["max_m"]<GATES["skinReplayM"],(key,i,actual)
        signed_min=0.;neg=0;deep=0
        for p in allp:
            hit,n,_,d=bvh.find_nearest(p)
            if hit is not None and d<.08:
                sd=(p-hit).dot(n);signed_min=min(signed_min,sd);neg+=int(sd<-.005)
            u,v=local(p);eps=GATES["slatInteriorM"]
            if height-.10+eps<p.y<height-eps and any(q["minX"]+eps<u<q["maxX"]-eps and q["minZ"]+eps<v<q["maxZ"]-eps for q in a["regions"]):deep+=1
        patch,low=support(t,w,pelvis,thighs)
        supported=[p[1]-height for p in patch if any(q["minX"]<=local(Vector(p))[0]<=q["maxX"] and q["minZ"]<=local(Vector(p))[1]<=q["maxZ"] for q in a["regions"])]
        gap=float(np.quantile(supported,.10)) if supported else None
        row={"frame":i,"seatWeight":wgt,"floorMinM":min(p.y for p in allp)-floor,"slatInteriorVertices":deep,
             "nearestTriangleNegativeCount":neg,"nearestTriangleSignedMinM":signed_min,
             "supportPatchGapM":gap,"supportPatchCount":len(supported),"skinReplay":actual,"soleGapsM":{},"palmP10M":{},"holdFootSlideM":{}}
        if row["floorMinM"]< -GATES["floorPenetrationM"]:failures.add("FLOOR_PENETRATION")
        if deep:failures.add("SLAT_INTERIOR")
        if previous is not None:
            step=max(2*math.acos(min(1.,abs(F.matrix(u["p"],u["r"]).to_quaternion().dot(F.matrix(v["p"],v["r"]).to_quaternion())))) for u,v in zip(f,previous))
            row["maxJointStepRad"]=step
            if step>GATES["jointStepRad"]:failures.add("JOINT_STEP")
        hold=seams[0]<=i<=seams[1]
        if hold and (gap is None or gap>GATES["holdSupportGapM"] or gap< -GATES["holdSupportPenetrationM"]):failures.add("HOLD_SUPPORT")
        for side in SIDES:
            sole=F.sole(regs[side])-floor;row["soleGapsM"][side]=sole
            tree=KDTree(len(F.surface(thighs[side])))
            for j,p in enumerate(F.surface(thighs[side])):tree.insert(p,j)
            tree.balance();ds=[tree.find(p)[2] for p in F.surface(hands[side])]
            pg=float(np.quantile(ds,.10));row["palmP10M"][side]=pg
            if hold:
                e=F.pos(w,t["roles"]["foot_"+side]);e.y=0
                if side not in hold_feet:hold_feet[side]=e.copy()
                travel=(e-hold_feet[side]).length;row["holdFootSlideM"][side]=travel
                if abs(sole)>GATES["holdSoleGapM"]:failures.add("HOLD_SOLE")
                if travel>GATES["holdFootSlideM"]:failures.add("HOLD_SLIDE")
                if pg>GATES["holdPalmP10GapM"]:failures.add("HOLD_PALM")
        report["samples"].append(row);previous=f
    report["contactGate"]={"status":"FAIL" if failures else "SCREEN_PASS","failures":sorted(failures),
        "pending":["actual obstacle containment and sweep","anatomical limits","balance","ART","device","cancellation and reservations"]}
    save()
    # Actual two-view native videos, even when screening gate fails.
    cam=bpy.context.scene.camera;target=F.Y.inverted()@Vector((0,h*.5,0))
    for view,offset in (("quarter",Vector((1.7,-3.,1.2))),("side",Vector((3.,0.,.8)))):
        cam.location=target+offset*h;cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.7
        with tempfile.TemporaryDirectory() as tmp:
            for i,f in enumerate(corrected):
                F.apply(arm,bones,rest,f);bpy.context.scene.render.filepath=str(pathlib.Path(tmp)/f"{i:03d}.png")
                bpy.ops.render.render(write_still=True)
                if i in (0,*seams,len(corrected)-1):shutil.copyfile(bpy.context.scene.render.filepath,OUT/f"{view}-{i:03d}.png")
            subprocess.run([F.get_ffmpeg_exe(),"-y","-loglevel","error","-framerate",str(FPS),"-i",tmp+"/%03d.png","-c:v","libx264","-pix_fmt","yuv420p",str(OUT/(view+".mp4"))],check=True)
    exported=P.bake(arm,bones,rest,meshes,corrected,OUT/"avatar.glb");replay=P.verify_reimport(OUT/"avatar.glb",t,corrected)
    report["export"]=exported;report["export_reimport"]=replay;save();assert replay["within_2mm"]
    (OUT/"report.json").write_text(json.dumps({"profiles":{"avatar":{"bench":{"origin":[0,0,0],"yaw":0},"frames":len(corrected)}}}))
    print("01C contact screening",report["contactGate"],flush=True)
if __name__=="__main__":main()
