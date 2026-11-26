"""R2 source geometry audit. No target solve, edits, or inferred physical stability."""
import bpy,sys,pathlib,os,json,math,hashlib,io,zipfile
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,vertices,setup
from cf_anim_source_intake import PINS,download,zip_inventory
clip=sys.argv[-1];assert clip=="Walk_Loop"
out=pathlib.Path("artifacts/cf-anim-contact-r7")/clip;out.mkdir(parents=True,exist_ok=True)
prior=json.loads((pathlib.Path("input-r3")/clip/"source-report.json").read_text())
assert prior["head"]=="96bf70f880742028dbc91235c6a215703656a9bb" and prior["clip"]==clip
audit=json.loads((pathlib.Path("input-r3")/clip/"source-vrma-audit.json").read_text())
assert audit["head"]==prior["head"] and audit["status"]=="SOURCE_EXPORT_PASS"
_,repo,path,size,sha,license=next(p for p in PINS if p[0]=="ual1")
assert license=="CC0-1.0"
raw=download(repo,path,size,sha);zip_inventory(raw)
with zipfile.ZipFile(io.BytesIO(raw)) as z:
    names=[i.filename for i in z.infolist() if i.filename.endswith("/UAL1_Standard.glb")]
    assert len(names)==1
    data=z.read(names[0])
assert hashlib.sha256(data).hexdigest()==prior["sourceGlbSha256"]=="69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997"
glb=pathlib.Path("contact-source.glb");glb.write_bytes(data)
arm,bones=import_rig(glb);reset(arm,bones);assert len(bones)==65
meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
assert meshes
def cloud():
    p=np.asarray([list(v) for v in vertices(meshes)],dtype=float)
    assert np.isfinite(p).all()
    return p
neutral=cloud();ground=float(neutral[:,2].min());hip=prior["referenceHipHeight"];assert hip>.3
mapping=prior["mapping"]
def point(n):return np.array(arm.matrix_world@arm.pose.bones[n].head)
regions={};patches={}
for side in ("left","right"):
    names={mapping[side+"_foot"],mapping[side+"_toes"]}
    ids=[];offset=0
    for o in meshes:
        groups={g.index for g in o.vertex_groups if g.name in names}
        ids.extend(offset+v.index for v in o.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>.5)
        offset+=len(o.data.vertices)
    assert offset==len(neutral) and len(ids)>=6
    ids=np.array(ids,dtype=int);regions[side]=ids
    origin=point(mapping[side+"_foot"]);axis=point(mapping[side+"_toes"])-origin;axis[2]=0
    assert np.linalg.norm(axis)>.01;axis/=np.linalg.norm(axis)
    along=(neutral[ids]-origin)@axis
    for name,q in (("heel",.4),("forefoot",.6)):
        sub=ids[along<=np.quantile(along,q)] if name=="heel" else ids[along>=np.quantile(along,q)]
        # Anatomical patch identities stay fixed. Include the lower quartile, not a single changing vertex.
        sub=sub[neutral[sub,2]<=np.quantile(neutral[sub,2],.25)+.005]
        assert len(sub)>=1
        patches[side+"_"+name]=sub
scene=bpy.context.scene
h,floor=setup(meshes);assert abs(floor-ground)<1e-5
action=next(a for a in bpy.data.actions if a.name==clip or a.name.startswith(clip+"."))
ad=arm.animation_data_create();ad.action=action
slots=[s for s in action.slots if s.target_id_type=="OBJECT"]
if slots:ad.action_slot=slots[0]
lo=math.ceil(action.frame_range[0]-1e-4);hi=math.floor(action.frame_range[1]+1e-4);fps=scene.render.fps/scene.render.fps_base
assert [lo,hi]==prior["frameRange"] and abs(fps-prior["fps"])<1e-6
# Native source velocity seam, before any target retarget or correction.
from cf_anim_contact_temporal import seam_vectors,norms
def snapshot():
    root=point(mapping["hips"])
    local=[]
    for bone in bones:
        b=arm.pose.bones[bone.name]
        m=b.parent.matrix.inverted()@b.matrix if b.parent else b.matrix
        local.append(list(m.to_quaternion()))
    return root,np.asarray(local)
samples=[]
error=0.
for k in (0,1,hi-lo-1,hi-lo):
    scene.frame_set(lo+k);bpy.context.view_layer.update()
    error=max(error,max(float(np.linalg.norm(point(n)-prior["samples"][k][role])) for role,n in mapping.items()))
    samples.append(snapshot())
assert error<.002,error
# Native source is in-place; constant world travel cancels in velocity differences.
v=seam_vectors(samples,1/fps,np.zeros(3))
report={"head":os.environ["EXPECTED_SHA"],"sourceSha":prior["sourceGlbSha256"],"clip":clip,"frames":hi-lo+1,"fps":fps,"nativeLandmarkMaxM":error,"names":["hips_translation",*[b.name for b in bones]],"duplicateAndTiledVelocityNorms":norms(v).tolist(),"scope":"unmodified native source; root in-place; parent-frame angular velocity, no target gate"}
(out/"native-source-temporal.json").write_text(json.dumps(report,indent=2,allow_nan=False))
print("NATIVE_SOURCE_TEMPORAL",float(norms(v)[0,0]),float(norms(v)[0,1:].max()),flush=True)
sys.stdout.flush();sys.stderr.flush();os._exit(0)
