"""Frozen append-only bake contract, UAL1 R8 replay; never calls retarget or solver."""
import copy, hashlib, json, math, pathlib, struct, sys, os
import bpy
import numpy as np
from mathutils import Quaternion, Vector
sys.path.insert(0,"prior-code/tools")
from cf_anim_tools import import_rig, reset, locals_, matrix, vertices, Y
P=pathlib.Path
O=P("runtime-lab"); O.mkdir(exist_ok=True)
D=P("input-contact/r8")
PROFILE=os.environ["PROFILE"]
PINS={"male-grid_021-100":"321f407aa39c0acdb4136b803b4feab62c86bf269ece9bb1a868bc8c3764c775","female-grid_201-100":"950d46a93155bc106cf311f2707d8348c81fd0f36247339e7ba4e67ee8d1030e"}
rig=P("input-rigs")/(PROFILE+".glb")
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((D/"report.json").read_text())
d=json.loads((D/"corrected-poses.json").read_text())
assert r["head"]=="3f016dc90a792120c54a2b4f79d3ffe4e354786e" and r["profile"]==PROFILE
assert r["derivedSha256"]=="bab703d41dc3bd6df2a6bceb3a0d3f773e84ceff65e42097e128ec5cce95e728"
assert r["status"]=="CONTACT_SCREEN_PASS" and not r["failures"]
assert digest(rig)==r["rigSha"]==PINS[PROFILE]
seq=d["poses"]; n=len(seq)-1
v=np.array(r["rootVelocityMps"]); T=r["expectedTravelM"]/np.linalg.norm(v)
fps=n/T
assert len(seq)==r["frames"]==84 and abs(fps-60)<.01,(n,T,fps)
stride=v*T
# Change coordinate origin only: both motions share the same horizontal start.
root_index=d["names"].index("root")
origin=np.array(seq[0][root_index]["p"]);origin[1]=0
seq=copy.deepcopy(seq)
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
g,oldbin=load(rig); old=copy.deepcopy(g); buf=bytearray(oldbin)
idx={x["name"]:i for i,x in enumerate(g["nodes"])}
assert len(idx)==len(g["nodes"]) and len(g["skins"])==len(g["buffers"])==1
arm,bones=import_rig(rig); reset(arm,bones); rest=locals_(arm,bones,True)
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
for name,positions in [("Walk_R8_World",world),("Walk_R8_InPlace",world-np.arange(n+1)[:,None]/n*stride)]:
 values=rot+[acc(positions,"VEC3")]
 g.setdefault("animations",[]).append({"name":name,"samplers":[{"input":t,"output":a,"interpolation":"LINEAR"} for a in values],"channels":[{"sampler":j,"target":{"node":idx[b.name],"path":"rotation"}} for j,b in enumerate(bones)]+[{"sampler":len(bones),"target":{"node":idx["root"],"path":"translation"}}]})
g["buffers"][0]["byteLength"]=len(buf); path=O/"walk.glb";save(path,g,bytes(buf))
new,newbin=load(path)
for k,val in old.items():
 if k in ("accessors","bufferViews","animations"):assert new[k][:len(val)]==val,k
 elif k=="buffers":assert {a:b for a,b in new[k][0].items() if a!="byteLength"}=={a:b for a,b in val[0].items() if a!="byteLength"}
 else:assert new[k]==val,k
assert newbin[:len(oldbin)]==oldbin
meta={"source":"100STYLE Neutral_FW derived overlap, CC BY 4.0","credit":"The 100STYLE Dataset – Ian Mason (Mason, Starke, Komura, 2022); CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ https://www.ianxmason.com/100style/ ; overlap, retarget, R8, origin normalization and bake","sourceSha":r["derivedSha256"],"profile":PROFILE,"horizontalOriginM":origin.tolist(),"r8Head":r["head"],"rigSha":digest(rig),"posesSha":digest(D/"corrected-poses.json"),"glbSha":digest(path),"fps":fps,"duration":T,"speed":v.tolist(),"stride":stride.tolist(),"originalAnimationNames":[x["name"] for x in old["animations"]],"keyCount":len(seq),"originalBinPreserved":True,"restPositionErrorM":maxp,"restRotationErrorRad":maxq}
(O/"bake.json").write_text(json.dumps(meta,indent=2))
# Clean import: original skin and full pose verification, then real 120Hz dense contacts.
a,bones=import_rig(path); reset(a,bones); meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==a for m in o.modifiers)]
floor=min(v.z for v in vertices(meshes));assert abs(floor-r["floorM"])<1e-5
scene=bpy.context.scene;sfps=scene.render.fps/scene.render.fps_base;ad=a.animation_data_create()
def select(name):
 act=bpy.data.actions[name];ad.action=act;ad.action_slot=act.slots[0]
 assert abs((act.frame_range[1]-act.frame_range[0])/sfps-T)<1e-6
def at(t):
 frame=t*sfps;scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame));bpy.context.view_layer.update();return locals_(a,bones)
def cloud():return np.asarray([list(Y@p) for p in vertices(meshes)])
ref=[]; errors=[]
for mode in ("Walk_R8_World","Walk_R8_InPlace"):
 select(mode)
 for i,f in enumerate(seq):
  local=at(i/fps);offset=stride*i/n if mode.endswith("InPlace") else np.zeros(3)
  for j,m in enumerate(local):
   expect=matrix(f[j]["p"],f[j]["r"]);err=(m.translation+(Vector(offset) if j==root else Vector((0,0,0)))-expect.translation).length
   angle=2*math.acos(min(1,abs(m.to_quaternion().normalized().dot(expect.to_quaternion().normalized()))))
   errors.append([err,angle])
  assert abs(float(cloud()[:,1].min()-floor)-r["corrected"][i]["floorMinM"])<.002
  if mode.endswith("InPlace"):
   w=[]
   for j,m in enumerate(local):w.append(m if d["parents"][j]<0 else w[d["parents"][j]]@m)
   ref.append({"time":i/fps,"positions":{name:list(w[d["names"].index(name)].translation) for name in ("root","head","foot.L","foot.R","wrist.L","wrist.R","lowerarm01.R")}})
pe,re=np.max(errors,axis=0);assert pe<.0002 and re<.002,(pe,re)
rows=[]
select("Walk_R8_InPlace")
for i in range(3*n*2+1):
 k,sub=divmod(i,2);c,j=divmod(k,n) if k<3*n else (2,n)
 phase=(j+sub/2)/fps;at(phase);points=cloud()+stride*(c+phase/T);gap=float(points[:,1].min()-floor);contacts={}
 for name,anchors in r["anchors"].items():
  x=anchors.get(str(j));y=anchors.get(str(min(j+1,n)))
  if x is None or (sub and (y is None or x["vertices"]!=y["vertices"] or np.linalg.norm(np.array(x["positionM"])-y["positionM"])>1e-7)):continue
  delta=points[x["vertices"]].mean(axis=0)-(np.array(x["positionM"])-origin)-c*stride
  contacts[name]={"slip":float(np.linalg.norm(delta[[0,2]])),"height":abs(float(delta[1]))}
 rows.append({"i":i,"floor":gap,"contacts":contacts})
dense={"count":len(rows),"worstFloorM":min(x["floor"] for x in rows),"floorFailures":sum(x["floor"]<-.005 for x in rows),"contactFailures":sum(any(a["slip"]>.02 or a["height"]>.02 for a in x["contacts"].values()) for x in rows),"contactSamples":sum(bool(x["contacts"]) for x in rows)}
assert dense["contactSamples"]>0
meta.update(floor=floor,ref=ref,dense=dense,maxKeyPositionErrorM=float(pe),maxKeyRotationErrorRad=float(re))
(O/"manifest.json").write_text(json.dumps(meta,indent=2));(O/"native-report.json").write_text(json.dumps({"meta":meta,"rows":rows},indent=2))
(O/"ATTRIBUTION.txt").write_text(meta["credit"]+"\n")
print("NATIVE REIMPORT",dense,flush=True)
