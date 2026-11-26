"""R2 source geometry audit. No target solve, edits, or inferred physical stability."""
import bpy,sys,pathlib,os,json,math,hashlib,io,zipfile
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig,reset,vertices,setup
from cf_anim_source_intake import PINS,download,zip_inventory
clip=sys.argv[-1];assert clip in ("Walk_Loop","Sitting_Enter")
out=pathlib.Path("artifacts/cf-anim-contact-source")/clip;out.mkdir(parents=True,exist_ok=True)
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
frames=[];landmark_error=0.
for k,f in enumerate(range(lo,hi+1)):
    scene.frame_set(f);bpy.context.view_layer.update()
    landmark_error=max(landmark_error,max(float(np.linalg.norm(point(n)-prior["samples"][k][role])) for role,n in mapping.items()))
    frames.append(cloud())
assert landmark_error<.002,landmark_error
frames=np.asarray(frames);N=len(frames)
# Ground gate applies to source geometry, normalized by source hip reference.
# Candidate contact may roll; compare same vertex indices at both consecutive samples.
# No source floor or root offsets are applied to the stored clip.
threshold=.02*hip
measure={};velocity={s:[] for s in ("left","right")}
for name,ids in patches.items():
    p=frames[:,ids,:]
    gap=p[:,:,2]-ground
    low=(gap>=-threshold)&(gap<=threshold)
    rows=[]
    for i in range(N):
        common=low[i]&low[i-1] if i else np.zeros(len(ids),bool)
        v=(p[i,common,:2]-p[i-1,common,:2])*fps if i and common.any() else np.empty((0,2))
        median=np.median(v,axis=0) if len(v) else None
        if median is not None:velocity[name.split("_")[0]].append(median)
        rows.append({"frame":i,"gapMinM":float(gap[i].min()),"nearFloorVertices":int(low[i].sum()),"sameContactVertices":int(common.sum()),"horizontalVelocityMps":median.tolist() if median is not None else None,"pointIds":ids[low[i]].tolist()})
    measure[name]=rows
def fit(vals):
    return np.median(np.asarray(vals),axis=0) if vals else None
fits={s:fit(v) for s,v in velocity.items()}
# For walk only, estimate a single constant scene velocity independently from each
# foot. Evaluate on the opposite foot, never optimize per-frame root motion.
root={s:(-v).tolist() if v is not None else None for s,v in fits.items()}
for name,rows in measure.items():
    other="right" if name.startswith("left") else "left"
    vfit=fits[other] if clip=="Walk_Loop" else np.zeros(2)
    for row in rows:
        v=row["horizontalVelocityMps"]
        row["heldOutResidualMps"]=float(np.linalg.norm(np.asarray(v)-vfit)) if v is not None and vfit is not None else None
        row["stationaryCandidate"]=bool(row["sameContactVertices"] and row["heldOutResidualMps"] is not None and row["heldOutResidualMps"]<=.05*hip)
report={"head":os.environ["EXPECTED_SHA"],"priorHead":prior["head"],"sourceSha":prior["sourceGlbSha256"],"clip":clip,"fps":fps,"frames":N,"nativeLandmarkMaxM":landmark_error,"groundM":ground,"referenceHipM":hip,"heightToleranceM":threshold,"velocityToleranceMps":.05*hip,"status":"SOURCE_CONTACT_AUDIT","ART":"OPEN","wholeSkinFloorMinM":[float(p[:,2].min()-ground) for p in frames],"patches":{k:v.tolist() for k,v in patches.items()},"perFootRootVelocityHypothesesMps":root,"rootFitDisagreementMps":float(np.linalg.norm(fits["left"]-fits["right"])) if all(v is not None for v in fits.values()) else None,"samples":measure,"renders":[]}
(out/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False))
cam=scene.camera;scene.render.resolution_percentage=80
for i in range(N):
    scene.frame_set(lo+i);bpy.context.view_layer.update()
    center=Vector(point(mapping["hips"]));center.z=ground+h*.45
    cam.location=center+Vector((3,0,.2))*h;cam.rotation_euler=(center-cam.location).to_track_quat("-Z","Y").to_euler();cam.data.ortho_scale=h*1.35
    name=f"side-{i:03}.png";scene.render.filepath=str(out/name);bpy.ops.render.render(write_still=True)
    assert (out/name).stat().st_size>0;report["renders"].append(name)
(out/"report.json").write_text(json.dumps(report,indent=2,allow_nan=False))
print(clip,"SOURCE_CONTACT_AUDIT",report["rootFitDisagreementMps"],flush=True)
sys.stdout.flush();sys.stderr.flush();os._exit(0)
