"""CF-ANIM/CONTACTS R1: isolated surface-aware diagnostic, not a production solver."""
import json, pathlib, math, tempfile, subprocess, shutil
import numpy as np
import bpy
from mathutils import Vector, Quaternion, Matrix
from cf_anim_tools import import_rig, reset, locals_, matrix, setup, digest, Y, get_ffmpeg_exe

OUT=pathlib.Path("anim-contacts-out"); OUT.mkdir(exist_ok=True)
def read(name):
    paths=list(pathlib.Path("prior-tools").rglob(name)); assert len(paths)==1,(name,paths)
    return json.loads(paths[0].read_text())
def world(r,f):
    w=[]
    for i,b in enumerate(f):
        m=matrix(b["p"],b["r"]); p=r["parents"][i]
        w.append(m if p<0 else w[p]@m)
    return w
def pos(w,i): return w[i].translation.copy()
def unit(v):
    if v.length<1e-8: raise ValueError("degenerate direction")
    return v.normalized()
def smooth(x):
    x=max(0.,min(1.,float(x)));return x*x*(3-2*x)
def setrot(r,f,i,desired):
    w=world(r,f);p=r["parents"][i]
    q=(w[p].to_quaternion().inverted()@desired if p>=0 else desired).normalized()
    f[i]["r"]=[q.x,q.y,q.z,q.w]
def aim(r,f,a,b,want):
    w=world(r,f);q=unit(pos(w,b)-pos(w,a)).rotation_difference(unit(want))
    setrot(r,f,a,q@w[a].to_quaternion())
def move_root(r,f,hip,d):
    w=world(r,f);p=r["parents"][hip]
    delta=w[p].to_quaternion().inverted()@d if p>=0 else d
    f[hip]["p"]=list(Vector(f[hip]["p"])+delta)
def ik(r,f,ids,goal,weight):
    a,b,e=ids;w=world(r,f);A,B,E=map(lambda i:pos(w,i),ids)
    end=E.lerp(goal,weight);d=end-A
    if d.length<1e-7:return None
    axis=unit(d);l1=(B-A).length;l2=(E-B).length
    radius=max(abs(l1-l2)+1e-5,min(l1+l2-1e-5,d.length))
    pole=(B-A)-axis*(B-A).dot(axis)
    if pole.length<1e-6:return None
    along=(l1*l1-l2*l2+radius*radius)/(2*radius)
    mid=axis*along+unit(pole)*math.sqrt(max(0,l1*l1-along*along))
    final=axis*radius
    endrot=w[e].to_quaternion()
    aim(r,f,a,b,mid);aim(r,f,b,e,final-mid);setrot(r,f,e,endrot)
    return {"requested_error_m":(pos(world(r,f),e)-end).length,"reach_clamp_m":abs(radius-d.length)}
def palm(r,w,side,source):
    suffix="_"+side if source else "."+side.upper()
    ns=["index_01","middle_01","pinky_01"] if source else ["finger2-1","finger3-1","finger5-1"]
    a,b,c=[pos(w,r["names"].index(n+suffix)) for n in ns]
    hand=pos(w,r["roles"]["hand_"+side])
    x=unit(a-c);z=unit(x.cross(unit(b-hand)));y=unit(z.cross(x))
    return Matrix((x,y,z)).transposed().to_quaternion(),(a+b+c)/3
def finger_map(s,t):
    result=[];missing=[]
    for side in ("l","r"):
        for j,n in enumerate(("thumb","index","middle","ring","pinky"),1):
            for k in (1,2,3):
                sn=f"{n}_{k:02d}_{side}";tn=f"finger{j}-{k}.{side.upper()}"
                if sn not in s["names"] or tn not in t["names"]:
                    missing.append([sn,tn]);continue
                result.append((side,s["names"].index(sn),t["names"].index(tn),k))
    return result,missing
def fingers(s,t,sf,f,pairs):
    sw=world(s,sf);sr=world(s,s["rest"]);tr=world(t,t["rest"])
    for side,si,ti,k in pairs:
        # Transfer local anatomical segment rotation relative to palm, never a profile offset.
        # A terminal joint without a child receives its local rest-relative quaternion.
        sc=[j for j,p in enumerate(s["parents"]) if p==si]
        tc=[j for j,p in enumerate(t["parents"]) if p==ti]
        if len(sc)==1 and len(tc)==1:
            tw=world(t,f);sp,_=palm(s,sw,side,True);tp,_=palm(t,tw,side,False)
            want=tp@(sp.inverted()@unit(pos(sw,sc[0])-pos(sw,si)))
            aim(t,f,ti,tc[0],want)
        else:
            # Do not guess terminal twist; report unresolved below.
            continue
def contact_windows(points,dt,ground):
    p=np.array(points); y=p[:,1]
    speed=np.abs(np.gradient(y,dt)); floor=float(np.quantile(y,.1))
    # source-derived near-low and low vertical speed; horizontal velocity is measured separately.
    mask=(y<=floor+ground)&(speed<=.22)
    windows=[];start=None
    for i,yes in enumerate([*mask,False]):
        if yes and start is None:start=i
        if not yes and start is not None:
            if i-start>=3:windows.append((start,i-1))
            start=None
    weights=np.zeros(len(p))
    for a,b in windows:
        for i in range(a,b+1):weights[i]=smooth(min(i-a+1,b-i+1)/3)
    return windows,weights
def apply(arm,bones,rest,f):
    for b,m,v in zip(bones,rest,f):b.matrix_basis=m.inverted()@matrix(v["p"],v["r"])
    bpy.context.view_layer.update()
def regions(meshes,t,side=None):
    names=t["names"];m=t["roles"]
    if side:
        root=m["foot_"+side];ids={root}
        for i,p in enumerate(t["parents"]):
            if p in ids:ids.add(i)
    else:
        ids={m["hip"],m["thigh_l"],m["thigh_r"]}
        ids.update(i for i,n in enumerate(names) if n.lower().startswith("pelvis"))
    result=[]
    for o in meshes:
        vg={g.index for g in o.vertex_groups if g.name in {names[i] for i in ids}}
        ix=[v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in vg)>.50]
        if ix:result.append((o,ix))
    assert result,("missing skin regions",side)
    return result
def surface(reg):
    dep=bpy.context.evaluated_depsgraph_get();out=[]
    for o,ix in reg:
        e=o.evaluated_get(dep);m=e.to_mesh()
        out.extend(Y@e.matrix_world@m.vertices[i].co for i in ix);e.to_mesh_clear()
    return out
def sole(reg):return min(p.y for p in surface(reg))
def proxy(name,loc,size,color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=Y.inverted()@Vector(loc))
    o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1])
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);o.data.materials.append(m);return o
def clone(f):return json.loads(json.dumps(f))
def summarize(rows):
    out={}
    for key in rows[0]:
        vals=[r[key] for r in rows if isinstance(r.get(key),(int,float)) and math.isfinite(r[key])]
        if vals:out[key]={"min":min(vals),"max":max(vals),"mean":sum(vals)/len(vals)}
    return out
def main():
    data=read("input.json"); solved=read("solved.json"); inv=read("semantic-inventory.json")
    for k,r in data["sources"].items():r["roles"]=inv["sources"][k]["map"]
    for k,r in data["targets"].items():r["roles"]=inv["targets"][k]["map"]
    report={"production":"BLOCKED","ART":"OPEN","scope":"R1: actual skin floor measurements, source stance windows, seat/phone proxy experiment, nonterminal finger direction transfer; twist/terminal curl/grasp and exact collisions open","profiles":{}}
    for key,t in data["targets"].items():
        p=pathlib.Path("prior-full")/(key+".glb");assert digest(p)==t["sha256"]
        arm,bones=import_rig(p);reset(arm,bones);rest=locals_(arm,bones,True)
        meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
        assert meshes;h,floor=setup(meshes)
        regs={side:regions(meshes,t,side) for side in ("l","r")}
        pelvis=regions(meshes,t)
        report["profiles"][key]={}
        for sk,s in data["sources"].items():
            for name,c in s["clips"].items():
                baseline=solved[key][name]["variants"]["upf_common"]
                assert len(baseline)==len(c["frames"])
                dt=c["duration"]/(len(baseline)-1)
                sw=[world(s,f) for f in c["frames"]]
                # Foot windows are derived independently on each source clip.
                windows={};weights={};anchors={};tw=[world(t,f) for f in baseline]
                for side in ("l","r"):
                    role="foot_"+side
                    windows[side],weights[side]=contact_windows([list(pos(w,s["roles"][role])) for w in sw],dt,.035)
                    anchors[side]={i:pos(tw[a],t["roles"][role]) for a,b in windows[side] for i in range(a,b+1)}
                pairs,missing=finger_map(s,t)
                hip=t["roles"]["hip"];sh=s["roles"]["hip"]
                hipy=np.array([pos(w,sh).y for w in sw])
                seatw=np.zeros(len(sw));seat=None
                if "Sitting_" in name:
                    drop=float(max(hipy)-min(hipy))
                    if drop>.08:
                        seatw=np.array([smooth((max(hipy)-y)/drop) for y in hipy])
                        idx=int(np.argmin(hipy));center=pos(tw[idx],hip)
                        seat=proxy("seat-proxy",(center.x,floor+.40,center.z),(.60,.10,.55),(.20,.40,.55))
                phonew=np.zeros(len(sw));phone=None;pside=None
                if "Phone" in name:
                    shead=s["roles"]["head"]
                    distances={side:np.array([(pos(w,s["roles"]["hand_"+side])-pos(w,shead)).length for w in sw]) for side in ("l","r")}
                    pside=min(distances,key=lambda side:float(np.median(distances[side])))
                    d=distances[pside];limit=float(np.quantile(d,.75))+.015
                    phonew=np.array([smooth((limit-x)/.06) for x in d])
                    phone=proxy("phone-proxy",(0,0,0),(.075,.145,.012),(.12,.12,.15))
                rows=[];variants={"baseline":[],"contacts":[]};props=[]
                for i,(sf,bf) in enumerate(zip(c["frames"],baseline)):
                    f=clone(bf);apply(arm,bones,rest,bf)
                    bsole={side:sole(regs[side])-floor for side in regs}
                    bseat=min(p.y for p in surface(pelvis))-floor if seat else None
                    fingers(s,t,sf,f,pairs)
                    # Seat target is a fixed physical plane, not a per-character joint height.
                    if seat and seatw[i]>.01:
                        apply(arm,bones,rest,f);low=min(p.y for p in surface(pelvis))
                        delta=max(-.20,min(.20,floor+.45-low))*float(seatw[i])
                        move_root(t,f,hip,Vector((0,delta,0)))
                    apply(arm,bones,rest,f)
                    corrections=[]
                    for side in regs:
                        if weights[side][i]>.0:
                            e=t["roles"]["foot_"+side];w=world(t,f);P=pos(w,e)
                            target=anchors[side][i].copy()
                            target.y=P.y+floor-sole(regs[side])
                            chain=[t["roles"][r+"_"+side] for r in ("thigh","shin","foot")]
                            m=ik(t,f,chain,target,float(weights[side][i]))
                            if m:corrections.append(m["reach_clamp_m"])
                    # Phone target: head-relative geometric ear proxy; not anatomical ear validation.
                    phonepos=None;handerr=None;basehanderr=None
                    if phone:
                        w=world(t,f);head=pos(w,t["roles"]["head"])
                        wr=world(t,t["rest"]);headrest=pos(wr,t["roles"]["head"])
                        lateral=unit(pos(wr,t["roles"]["upperarm_l"])-pos(wr,t["roles"]["upperarm_r"]))
                        headrot=w[t["roles"]["head"]].to_quaternion()@wr[t["roles"]["head"]].to_quaternion().inverted()
                        phonepos=head+headrot@lateral*(h*.056*(1 if pside=="l" else -1))
                        _,palmpos=palm(t,w,pside,False)
                        chain=[t["roles"][r+"_"+pside] for r in ("upperarm","forearm","hand")]
                        hand=pos(w,chain[-1]);target=hand+(phonepos-palmpos)
                        basehanderr=(palm(t,tw[i],pside,False)[1]-phonepos).length
                        m=ik(t,f,chain,target,float(phonew[i]))
                        if m:corrections.append(m["reach_clamp_m"])
                        handerr=(palm(t,world(t,f),pside,False)[1]-phonepos).length
                    apply(arm,bones,rest,f)
                    csole={side:sole(regs[side])-floor for side in regs}
                    row={"frame":i,"max_reach_clamp_m":max(corrections,default=0.),"baseline_floor_min_m":min(bsole.values()),"contact_floor_min_m":min(csole.values())}
                    for side in regs:
                        if weights[side][i]>.9:
                            row["baseline_stance_gap_"+side]=abs(bsole[side]);row["contact_stance_gap_"+side]=abs(csole[side])
                            for label,w in (("baseline",tw[i]),("contact",world(t,f))):
                                d=pos(w,t["roles"]["foot_"+side])-anchors[side][i];d.y=0
                                row[label+"_stance_slip_"+side]=d.length
                    if seat and seatw[i]>.9:
                        row["baseline_seat_surface_error_m"]=abs(bseat-.45)
                        row["contact_seat_surface_error_m"]=abs(min(p.y for p in surface(pelvis))-floor-.45)
                    if handerr is not None and phonew[i]>.5:row.update(baseline_phone_proxy_gap_m=basehanderr,contact_phone_proxy_gap_m=handerr)
                    assert all(math.isfinite(x) for b in f for x in b["p"]+b["r"])
                    rows.append(row);variants["baseline"].append(bf);variants["contacts"].append(f);props.append(list(phonepos) if phonepos else None)
                # Summarize union of keys (stance/seat/phone may begin after frame zero).
                keys=set().union(*(r.keys() for r in rows))
                summary=summarize([{k:r.get(k) for k in keys} for r in rows])
                item={"windows":windows,"finger_map_count":len(pairs),"missing_finger_roles":missing,"terminal_twist_status":"OPEN","phone_side":pside,"phone_proxy_only":bool(phone),"seat_proxy_only":bool(seat),"samples":rows,"summary":summary}
                report["profiles"][key][name]=item
                (OUT/"report.json").write_text(json.dumps(report,indent=2))
                # Matched real videos of both sexes, central height profiles only.
                central=min((k for k,v in data["targets"].items() if v["sex"]==t["sex"]),key=lambda k:abs(data["targets"][k]["scale"]-1))
                if key==central:
                    for label,frames in variants.items():
                        n=min(12,len(frames));prefix=f"{key}-{name}-{label}"
                        with tempfile.TemporaryDirectory() as tmp:
                            for j in range(n):
                                idx=round((len(frames)-1)*j/(n-1));apply(arm,bones,rest,frames[idx])
                                if phone and props[idx] is not None:phone.location=Y.inverted()@Vector(props[idx])
                                scene=bpy.context.scene;scene.render.filepath=str(pathlib.Path(tmp)/f"{j:03d}.png")
                                bpy.ops.render.render(write_still=True)
                                if j in (0,n//2,n-1):shutil.copyfile(scene.render.filepath,OUT/(prefix+f"-{j:03d}.png"))
                            subprocess.run([get_ffmpeg_exe(),"-y","-loglevel","error","-framerate",str((n-1)/c["duration"]),"-i",tmp+"/%03d.png","-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(OUT/(prefix+".mp4"))],check=True)
                for obj in (seat,phone):
                    if obj:bpy.data.objects.remove(obj,do_unlink=True)
    assert len(report["profiles"])==6 and all(len(x)==4 for x in report["profiles"].values())
    print("Completed R1 contact diagnostic; no production or art acceptance.")
if __name__=="__main__":main()
