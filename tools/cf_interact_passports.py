"""01B: measure actual frozen rigs and source motion; never solve or modify assets."""
import pathlib,sys,json,math,hashlib
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(pathlib.Path("frozen-fbik/tools").resolve()))
import cf_anim_fbik as F
OUT=pathlib.Path("artifacts/cf-interact-01b");OUT.mkdir(parents=True,exist_ok=True)
CLIPS=("Sitting_Enter","Sitting_Exit");SIDES=("l","r")
def dig(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(",",":"),allow_nan=False).encode()).hexdigest()
def pts(reg):
    p=np.array([list(v) for v in F.surface(reg)])
    assert p.ndim==2 and p.shape[1]==3 and len(p)>0 and np.isfinite(p).all()
    return p
def region(meshes,names):
    out=[]
    for o in meshes:
        ids={g.index for g in o.vertex_groups if g.name in names}
        ix=[v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in ids)>.5]
        if ix:out.append((o,ix))
    assert out,names
    return out
def marker(p,m):
    inv=m.inverted();q=np.array([list(inv@Vector(v)) for v in p])
    return {"vertexCount":len(q),"localMin":q.min(0).tolist(),"localMax":q.max(0).tolist(),"localCentroid":q.mean(0).tolist()}
def role(t,w,n):return w[t["roles"][n]]
def seg(t,w,a,b):return float((role(t,w,b).translation-role(t,w,a).translation).length)
def action_record(s,c,n):
    worlds=[F.world(s,f) for f in c["frames"]]
    hip=np.array([F.pos(w,s["roles"]["hip"]).y for w in worlds]);drop=float(hip.max()-hip.min())
    assert drop>.08 and len(worlds)>3
    dt=c["duration"]/(len(worlds)-1);idx=int(hip.argmin());feet={}
    for side in SIDES:
        windows,weights=F.contact_windows([list(F.pos(w,s["roles"]["foot_"+side])) for w in worlds],dt,.035)
        feet[side]={"windows":windows,"weights":weights.tolist()}
    return {"name":n,"sampleSha":dig(c),"frameCount":len(worlds),"durationS":c["duration"],
      "seatedIndex":idx,"seatWeights":[F.smooth((hip.max()-v)/drop) for v in hip],
      "footContacts":feet,"sourceHipDropM":drop}
def main():
    data=F.read("input.json");solved=F.read("solved.json");inv=F.read("semantic-inventory.json")
    for k,s in data["sources"].items():s["roles"]=inv["sources"][k]["map"]
    for k,t in data["targets"].items():t["roles"]=inv["targets"][k]["map"]
    manifest=json.loads(pathlib.Path("prior-full/manifest.json").read_text())
    assert set(manifest)==set(data["targets"]) and len(manifest)==6
    sources=[(key,s) for key,s in data["sources"].items() if all(n in s["clips"] for n in CLIPS)]
    assert len(sources)==1
    sk,s=sources[0];actions={n:action_record(s,s["clips"][n],n) for n in CLIPS}
    action={"kind":"sit.normal","sourceClip":"Sitting_Enter+Sitting_Exit","revision":dig(actions),
      "sourceKey":sk,"sourceSampleSha":dig(s),"sourceArtifactId":15066040579,"clips":actions,
      "approachGap":.55,"minSupportFraction":.5,"hands":"actor-relative thigh surface",
      "phaseContract":{"enter":"Sitting_Enter","hold":"OPEN: seam not baked","exit":"Sitting_Exit","interrupt":"OPEN"},
      "jointLimitPolicy":"actual declared limits only; observed clip ROM is not anatomy"}
    report={"stage":"01B","frozenFbik":"6974fc7e91ee2b089bde79c701eee946da142b51","solverExecuted":False,
       "sourceArtifacts":[15054212377,15066040579],"action":action,"rigs":{}}
    for key,t in sorted(data["targets"].items()):
        path=pathlib.Path("prior-full")/(key+".glb")
        assert F.digest(path)==t["sha256"]==manifest[key]["candidate_sha256"]
        assert t["sex"]==manifest[key]["sex"] and t["scale"]==manifest[key]["scale"]
        arm,bones=F.import_rig(path);F.reset(arm,bones)
        assert [b.name for b in bones]==t["names"]
        assert [bones.index(b.parent) if b.parent else -1 for b in bones]==t["parents"]
        rest=F.locals_(arm,bones,True)
        meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
        skin=F.WeightedSkin(t,meshes,arm,bones)
        F.apply(arm,bones,rest,t["rest"]);w=F.world(t,t["rest"])
        neutral=skin.actual_error(t["rest"]);assert neutral["max_m"]<.002
        floor=float(pts(skin.reg)[:,1].min())
        pelvis=F.regions(meshes,t);feet={side:F.regions(meshes,t,side) for side in SIDES}
        thighs={side:region(meshes,{t["names"][t["roles"]["thigh_"+side]]}) for side in SIDES}
        hands={side:region(meshes,{t["names"][t["roles"]["hand_"+side]]}|{n for n in t["names"] if n.lower().startswith("metacarpal") and n.lower().endswith("."+side)}) for side in SIDES}
        lengths={};markers={}
        for side in SIDES:
            foot=role(t,w,"foot_"+side);ps=pts(feet[side]);sole=float(ps[:,1].min());drop=float(foot.translation.y-sole)
            assert drop>0
            thigh=seg(t,w,"thigh_"+side,"shin_"+side);shin=seg(t,w,"shin_"+side,"foot_"+side)
            upper=seg(t,w,"upperarm_"+side,"forearm_"+side);fore=seg(t,w,"forearm_"+side,"hand_"+side)
            assert min(thigh,shin,upper,fore)>.02
            lengths[side]={"thighM":thigh,"shinM":shin,"upperarmM":upper,"forearmM":fore,
              "neutralSoleDropM":drop,"neutralSoleFloorGapM":sole-floor,"flatKneeCeilingM":drop+shin,
              "legReachM":[abs(thigh-shin),thigh+shin],"armReachM":[abs(upper-fore),upper+fore]}
            markers["sole_"+side]=marker(ps[ps[:,1]<=sole+.01],foot)
            markers["thigh_"+side]=marker(pts(thighs[side]),role(t,w,"thigh_"+side))
            markers["palm_"+side]=marker(pts(hands[side]),role(t,w,"hand_"+side))
        markers["pelvis"]=marker(pts(pelvis),role(t,w,"hip"))
        limits={}
        for b in bones:
            active={axis:[float(getattr(b,"ik_min_"+axis)),float(getattr(b,"ik_max_"+axis))] for axis in "xyz" if getattr(b,"use_ik_limit_"+axis)}
            cons=[{"name":c.name,"type":c.type,"mute":c.mute} for c in b.constraints if c.type=="LIMIT_ROTATION"]
            if active or cons:limits[b.name]={"ikRad":active,"rotationConstraints":cons}
        poses={};rom={}
        for name in CLIPS:
            c=s["clips"][name];fs=F.clone(solved[key][name]["variants"]["upf_common"]);assert len(fs)==len(c["frames"])
            pairs,_=F.finger_map(s,t);idx=actions[name]["seatedIndex"];pose=fs[idx]
            F.fingers(s,t,c["frames"][idx],pose,pairs)
            F.apply(arm,bones,rest,pose);w1=F.world(t,pose)
            replay=skin.actual_error(pose);assert replay["max_m"]<.002,(key,name,replay)
            # Fixed semantic support definition, no furniture reference or profile fit.
            ps=[pts(pelvis)]
            for side in SIDES:
                a=role(t,w1,"thigh_"+side).translation;b=role(t,w1,"shin_"+side).translation
                axis=np.array(list(b-a));v=pts(thighs[side]);f=(v-np.array(list(a)))@axis/(axis@axis)
                q=v[(f>=-.25)&(f<=.55)];assert len(q)>0;ps.append(q)
            cloud=np.concatenate(ps);low=float(np.quantile(cloud[:,1],.10))
            patch=cloud[(cloud[:,1]>=low-.025)&(cloud[:,1]<=low+.025)];assert len(patch)>=3
            _,front=F.seat_axes(t,w1);right=Vector((front.z,0,-front.x))
            coords=np.stack((patch@np.array(list(right)),patch[:,1],patch@np.array(list(front))),axis=1)
            lo=coords.min(0);hi=coords.max(0);width=float(hi[0]-lo[0]);depth=float(hi[2]-lo[2])
            assert width>.02 and depth>.01,(key,name,width,depth)
            center=Vector((0,low,0))+right*float((lo[0]+hi[0])/2)+front*float((lo[2]+hi[2])/2)
            def rel(v):
                q=v-center
                return [float(q.dot(right)),float(q.y),float(q.dot(front))]
            limb={}
            for side in SIDES:
                a=role(t,w1,"thigh_"+side).translation;b=role(t,w1,"shin_"+side).translation;ankle=role(t,w1,"foot_"+side).translation
                sole=pts(feet[side]);drop=float(ankle.y-sole[:,1].min());assert drop>0,(key,name,side,drop)
                assert abs((a-b).length-lengths[side]["thighM"])<.002
                assert abs((b-ankle).length-lengths[side]["shinM"])<.002
                limb[side]={"hip":rel(a),"knee":rel(b),"ankle":rel(ankle),"soleDropM":drop,
                  "hand":rel(role(t,w1,"hand_"+side).translation),
                  "palmSurface":marker(pts(hands[side]),role(t,w1,"hand_"+side)),
                  "thighSurface":marker(pts(thighs[side]),role(t,w1,"thigh_"+side))}
            poses[name]={"index":idx,"supportWidth":width,"supportDepth":depth,"supportOriginWorld":list(center),
              "supportPoints":[rel(Vector(v)) for v in patch],"supportVertexCount":len(patch),
              "limbs":limb,"skinReplay":replay,"retargetPoseSha":dig(pose)}
            for rn,i in t["roles"].items():
                q0=F.matrix(t["rest"][i]["p"],t["rest"][i]["r"]).to_quaternion()
                values=[2*math.acos(min(1.,abs(q0.dot(F.matrix(f[i]["p"],f[i]["r"]).to_quaternion())))) for f in fs]
                rom.setdefault(rn,{})[name]=[min(values),max(values)]
        rig={"version":1,"id":key,"revision":t["sha256"],"sex":t["sex"],"scale":t["scale"],
          "names":t["names"],"parents":t["parents"],"roles":t["roles"],"bind":t["rest"],
          "bindSkinReplay":neutral,"floorY":floor,"segments":lengths,"markers":markers,"poses":poses,
          "maxFlatKneeHeight":min(x["flatKneeCeilingM"] for x in lengths.values()),
          "supportWidth":max(p["supportWidth"] for p in poses.values()),"supportDepth":max(p["supportDepth"] for p in poses.values()),
          "declaredJointLimits":limits,"anatomicalLimitStatus":"UNVERIFIED","observedClipRomRad":rom,
          "poseEvidence":"actual evaluated skin, frozen retarget samples, no placement correction"}
        report["rigs"][key]=rig
        (OUT/"rig-action-passports.json").write_text(json.dumps(report,indent=2,allow_nan=False))
        print("MEASURED",key,rig["maxFlatKneeHeight"],rig["supportWidth"],rig["supportDepth"],flush=True)
    assert {(r["sex"],round(r["scale"],2)) for r in report["rigs"].values()}=={(s,k) for s in ("female","male") for k in (.9,1.,1.1)}
    print("Six real rigs measured; no FBIK solve",flush=True)
if __name__=="__main__":main()
