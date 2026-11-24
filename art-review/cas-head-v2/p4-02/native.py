import bpy,numpy as np,struct,json,sys,math,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import itertools
P=Path(sys.argv[4]).resolve();P.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'p4-01'))
from p4_build import view
def load(path):
 b=Path(path).read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),bytearray(b[28+n:])
def arr(j,b,i):return view(j,b,i).copy().astype(float)
src=sys.argv[1];dst=sys.argv[2]
a,ab=load(src);j,b=load(dst);h=a['meshes'][1]['primitives'][0];g=j['meshes'][1]['primitives'][0]
p=arr(a,ab,h['attributes']['POSITION']);q=arr(j,b,g['attributes']['POSITION']);n=arr(j,b,g['attributes']['NORMAL'])
d=np.array([arr(a,ab,t['POSITION']) for t in h['targets']]);dd=np.array([arr(j,b,t['POSITION']) for t in g['targets']])
tri=view(a,ab,h['indices']).copy().reshape(-1,3);_,weld=np.unique(np.round(p,6),axis=0,return_inverse=True);wt=weld[tri]
# Check all eye and lower-face vertices, not just new local edits; preserve all positions outside field.
eye=p[:,1]>1.499;assert np.array_equal(p[eye],q[eye]);assert np.array_equal(d[:,eye],dd[:,eye])
region=set(np.flatnonzero(np.any((p[tri][:,:,1]>1.419)&(p[tri][:,:,1]<1.499)&(p[tri][:,:,2]>.03),axis=1)).tolist())
def bvh(v,t):return BVHTree.FromPolygons(v.tolist(),t.tolist(),all_triangles=True)
def contacts(v):
 t=bvh(v,tri);return {(i,k) for i,k in t.overlap(t) if i<k and (i in region or k in region) and not set(wt[i]).intersection(wt[k])}
flips=0;minratio=1.;new=0;max_before=0;max_after=0
for w in itertools.product((0,.5,1),repeat=5):
 v=p+np.tensordot(w,d,axes=1);u=q+np.tensordot(w,dd,axes=1)
 aa=np.cross(v[tri[:,1]]-v[tri[:,0]],v[tri[:,2]]-v[tri[:,0]]);bb=np.cross(u[tri[:,1]]-u[tri[:,0]],u[tri[:,2]]-u[tri[:,0]])
 ar=np.linalg.norm(aa,axis=1);ok=ar>1e-9;flips+=int((np.sum(aa*bb,axis=1)[ok]<0).sum());minratio=min(minratio,float((np.linalg.norm(bb,axis=1)[ok]/ar[ok]).min()))
 x=contacts(v);y=contacts(u);new=max(new,len(y-x));max_before=max(max_before,len(x));max_after=max(max_after,len(y))
report=dict(combinations=243,flips=flips,minAreaRatio=minratio,maxNewSelfPairs=new,maxBeforeSelfPairs=max_before,maxAfterSelfPairs=max_after,eyePositionsAndMorphsExact=True)
print(report,flush=True);(P/'qa.json').write_text(json.dumps(report,indent=2))
assert flips==0 and new==0,report
bpy.ops.wm.open_mainfile(filepath=str(Path(sys.argv[3]).resolve()))
sc=bpy.context.scene;o=next(o for o in sc.objects if o.type=='MESH' and o.data.shape_keys);ks=o.data.shape_keys.key_blocks
def gltf(points):return np.array([tuple(o.matrix_world@v.co) for v in points])[:,[0,2,1]]*[1,1,-1]
def local(v):return o.matrix_world.inverted()@Vector((float(v[0]),float(-v[2]),float(v[1])))
assert np.max(abs(gltf(ks[0].data)-p))<1e-6
for k,key in enumerate(ks):
 target=q if k==0 else q+dd[k-1]
 for item,v in zip(key.data,target):item.co=local(v)
 assert np.max(abs(gltf(key.data)-target))<1e-6
for item,v in zip(o.data.vertices,q):item.co=local(v)
rot=o.matrix_world.to_3x3().transposed();o.data.normals_split_custom_set_from_vertices([tuple((rot@Vector((float(x),float(-z),float(y)))).normalized()) for x,y,z in n]);o.data.update()
rig=next(x for x in sc.objects if x.type=='ARMATURE');assert len(rig.data.bones)==66 and len(bpy.data.actions)==13
bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(P/'asya-p4-02.blend'),compress=True)
rig.data.pose_position='REST'
for obj in sc.objects:
 if obj.name=='Icosphere':obj.hide_render=True
sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=16;sc.cycles.use_denoising=True;sc.render.threads_mode='FIXED';sc.render.threads=2
sc.render.resolution_x=420;sc.render.resolution_y=490;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX'
sc.world=bpy.data.worlds.new('Review world');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.35,.35,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.35
def light(name,loc,energy,size):
 l=bpy.data.lights.new(name,'AREA');l.energy=energy;l.shape='DISK';l.size=size;o=bpy.data.objects.new(name,l);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((.001,-.015,1.52))-o.location).to_track_quat('-Z','Y').to_euler()
light('Key',(-.6,-.8,2),34,.65);light('Fill',(.55,-.45,1.65),18,.6);light('Rim',(.1,.45,1.9),20,.5)
cam=bpy.data.cameras.new('Review');co=bpy.data.objects.new('Review',cam);sc.collection.objects.link(co);sc.camera=co;cam.type='ORTHO';cam.ortho_scale=.31
def render(label,angle):
 t=math.radians(angle);target=Vector((.001,0,1.535));co.location=target+Vector((.65*math.sin(t),-.65*math.cos(t),.012));co.rotation_euler=(target-co.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(P/f'{label}-{angle}.png');bpy.ops.render.render(write_still=True)
for ang in (0,45,90):render('neutral',ang)
for ch in ('nose','lips','chin'):
 ks[ch].value=1;render(ch,0);render(ch,90);ks[ch].value=0

