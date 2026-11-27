"""Append one independently retargeted CC0 idle without changing any baked walk bytes."""
import copy, hashlib, json, math, pathlib, struct, sys, os
import bpy
import numpy as np
from mathutils import Quaternion, Vector
sys.path.insert(0,"prior-code/tools")
from cf_anim_tools import import_rig, reset, locals_, matrix, vertices, Y
P=pathlib.Path; O=P("runtime-lab"); D=P("input-idle"); SRC=P("input-idle-source")
path=O/"walk.glb"; meta=json.loads((O/"manifest.json").read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
source=json.loads((SRC/"source-report.json").read_text()); audit=json.loads((SRC/"source-vrma-audit.json").read_text()); receipt=json.loads((D/"report.json").read_text()); d=json.loads((D/"target-poses.json").read_text())
assert source["clip"]=="Neutral_ID" and source["license"]=="CC-BY-4.0" and d["sourceSha256"]==source["sourceSha256"]
assert source["head"]==audit["head"]==receipt["priorHead"] and receipt["head"]==os.environ["EXPECTED_SHA"]
assert audit["status"]=="SOURCE_EXPORT_PASS" and receipt["status"]=="CLOSURE_SCREEN_PASS" and not receipt["failures"]
assert receipt["rigSha256"]==meta["rigSha"] and digest(path)==meta["glbSha"]
report=receipt["cases"]["actual-closure"]
seq=copy.deepcopy(d["poses"]); fps=source["fps"]; n=len(seq)-1; T=n/fps
assert 2.9<T<3.1 and len(seq)==len(report["samples"])==181
root_index=d["names"].index("root")
origin=np.array(seq[0][root_index]["p"]);origin[1]=0
for f in seq:f[root_index]["p"]=(np.array(f[root_index]["p"])-origin).tolist()
def load(p):
 b=p.read_bytes()
 assert struct.unpack_from("<4sII",b)==(b"glTF",2,len(b))
 size,typ=struct.unpack_from("<I4s",b,12); assert typ==b"JSON"
 g=json.loads(b[20:20+size])
 count,typ=struct.unpack_from("<I4s",b,20+size)
 assert typ==b"BIN\0" and 28+size+count==len(b)
 return g,b[28+size:]
def save(p,g,b):
 j=json.dumps(g,separators=(",",":"),allow_nan=False).encode()
 j+=b" "*(-len(j)%4); b+=b"\0"*(-len(b)%4)
 p.write_bytes(struct.pack("<4sII",b"glTF",2,28+len(j)+len(b))+struct.pack("<I4s",len(j),b"JSON")+j+struct.pack("<I4s",len(b),b"BIN\0")+b)
g,oldbin=load(path); old=copy.deepcopy(g); buf=bytearray(oldbin)
idx={x["name"]:i for i,x in enumerate(g["nodes"])}
assert len(idx)==len(g["nodes"]) and len(g["skins"])==len(g["buffers"])==1
arm,bones=import_rig(path); reset(arm,bones); rest=locals_(arm,bones,True)
assert [b.name for b in bones]==d["names"] and len(bones)==104
assert [bones.index(b.parent) if b.parent else -1 for b in bones]==d["parents"]
root=d["names"].index("root"); assert d["parents"][root]==-1
def acc(a,kind):
 a=np.asarray(a,dtype="<f4"); assert np.isfinite(a).all()
 buf.extend(b"\0"*(-len(buf)%4)); off=len(buf); raw=a.tobytes();buf.extend(raw)
 view=len(g["bufferViews"]);g["bufferViews"].append({"buffer":0,"byteOffset":off,"byteLength":len(raw)})
 i=len(g["accessors"]);item={"bufferView":view,"componentType":5126,"count":len(a),"type":kind}
 if kind=="SCALAR":item.update(min=[float(a.min())],max=[float(a.max())])
 g["accessors"].append(item);return i
t=acc(np.arange(n+1)/fps,"SCALAR"); rot=[]; maxp=maxq=0
for j,b in enumerate(bones):
 node=g["nodes"][idx[b.name]];assert "matrix" not in node and node.get("scale",[1,1,1])==[1,1,1]
 p=Vector(node.get("translation",[0,0,0])); q=node.get("rotation",[0,0,0,1]); qg=Quaternion((q[3],*q[:3])).normalized(); qr=rest[j].to_quaternion().normalized()
 maxp=max(maxp,(rest[j].translation-p).length);maxq=max(maxq,2*math.acos(min(1,abs(qg.dot(qr)))))
 if j!=root:assert max((Vector(f[j]["p"])-p).length for f in seq)<.0002
 a=[]
 for f in seq:
  qq=(matrix(f[j]["p"],f[j]["r"]).to_quaternion().normalized()@qr.inverted()@qg).normalized()
  x=np.array([qq.x,qq.y,qq.z,qq.w])
  if a and a[-1]@x<0:x=-x
  a.append(x)
 rot.append(acc(a,"VEC4"))
assert maxp<.0002 and maxq<.002,(maxp,maxq)
world=np.array([f[root]["p"] for f in seq])
# Authored stationary root retained exactly, no ground offset, no per-frame corrections.
values=rot+[acc(world,"VEC3")]
g["animations"].append({"name":"Idle_MOCAP","samplers":[{"input":t,"output":a,"interpolation":"LINEAR"} for a in values],"channels":[{"sampler":j,"target":{"node":idx[b.name],"path":"rotation"}} for j,b in enumerate(bones)]+[{"sampler":len(bones),"target":{"node":idx["root"],"path":"translation"}}]})
g["buffers"][0]["byteLength"]=len(buf)
out=O/"with-idle.glb";save(out,g,bytes(buf))
new,newbin=load(out)
for k,val in old.items():
 if k in ("accessors","bufferViews","animations"):assert new[k][:len(val)]==val,k
 elif k=="buffers":assert {a:b for a,b in new[k][0].items() if a!="byteLength"}=={a:b for a,b in val[0].items() if a!="byteLength"}
 else:assert new[k]==val,k
assert newbin[:len(oldbin)]==oldbin
# Independent import, verify all keys and dense 120Hz floor, no solver.
a,bones=import_rig(out);reset(a,bones);meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==a for m in o.modifiers)]
floor=min(v.z for v in vertices(meshes));assert abs(floor-meta["floor"])<1e-5
scene=bpy.context.scene;sfps=scene.render.fps/scene.render.fps_base;ad=a.animation_data_create();act=bpy.data.actions["Idle_MOCAP"];ad.action=act;ad.action_slot=act.slots[0]
assert abs((act.frame_range[1]-act.frame_range[0])/sfps-T)<1e-6
def at(t):
 frame=t*sfps;scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame));bpy.context.view_layer.update();return locals_(a,bones)
def gap():return min(v.z for v in vertices(meshes))-floor
errors=[]; ref=[]
for i,f in enumerate(seq):
 local=at(i/fps)
 for j,m in enumerate(local):
  expect=matrix(f[j]["p"],f[j]["r"]);err=(m.translation-expect.translation).length
  angle=2*math.acos(min(1,abs(m.to_quaternion().normalized().dot(expect.to_quaternion().normalized()))))
  errors.append([err,angle])
 assert abs(gap()-report["samples"][i]["floorGapM"])<.002
 w=[]
 for j,m in enumerate(local):w.append(m if d["parents"][j]<0 else w[d["parents"][j]]@m)
 ref.append({"time":i/fps,"positions":{name:list(w[d["names"].index(name)].translation) for name in meta["ref"][0]["positions"]}})
pe,re=np.max(errors,axis=0);assert pe<.0002 and re<.002,(pe,re)
rows=[]
for i in range(math.ceil(T*120)+1):
 time=min(T,i/120);at(time);rows.append({"time":time,"floor":gap()})
res={"clip":"Neutral_ID","track":"Idle_MOCAP","license":"CC-BY-4.0","sourceSha":source["sourceSha256"],"horizontalOriginM":origin.tolist(),"contactStatus":"UNCORRECTED_DIAGNOSTIC","poseSha":digest(D/"target-poses.json"),"originalWalkGlbSha":meta["glbSha"],"outputSha":digest(out),"duration":T,"fps":fps,"keys":len(seq),"samples":len(rows),"floorFailures":sum(x["floor"]<-.005 for x in rows),"worstFloorM":min(x["floor"] for x in rows),"maxKeyPositionErrorM":float(pe),"maxKeyRotationErrorRad":float(re),"rootHorizontalRangeM":float(np.linalg.norm(np.ptp(world[:,[0,2]],axis=0))),"originalWalkPreserved":True,"ref":ref}
(O/"idle-report.json").write_text(json.dumps({"idle":res,"rows":rows},indent=2));meta["idle"]=res;meta["glbSha"]=res["outputSha"];(O/"manifest.json").write_text(json.dumps(meta,indent=2))
out.replace(path)
print("IDLE REIMPORT",{k:v for k,v in res.items() if k!="ref"},flush=True)
