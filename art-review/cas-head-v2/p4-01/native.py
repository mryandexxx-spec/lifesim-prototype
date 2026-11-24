import bpy,numpy as np,math,json,sys
from pathlib import Path
from mathutils import Vector
from p4_build import load,arrays,sha
P=Path(sys.argv[2]);src=Path(sys.argv[1]);P.mkdir(parents=True,exist_ok=True)
j,b=load(src);_,_,h,n,d,dn,e,c,hc,nc,dc,dnc,cc=arrays(j,b)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src.resolve()))
sc=bpy.context.scene
head=next(o for o in sc.objects if o.type=='MESH' and o.data.shape_keys)
eye=bpy.data.objects['Separate skinned eyes with iris and sclera']
keys=head.data.shape_keys.key_blocks
assert list(keys.keys())==['Basis','eyes','nose','lips','chin','cheeks']
def gltf(o,points):
 v=np.array([tuple(o.matrix_world@p.co) for p in points]);return v[:,[0,2,1]]*[1,1,-1]
def local(o,v):
 mat=o.matrix_world.inverted();return [mat@Vector((float(x),float(-z),float(y))) for x,y,z in v]
assert np.max(abs(gltf(head,keys[0].data)-h))<1e-6
assert np.max(abs(gltf(eye,eye.data.vertices)-e))<1e-6
for i,k in enumerate(keys):
 k.value=0
 expected=h if i==0 else h+d[i-1]
 assert np.max(abs(gltf(head,k.data)-expected))<1e-6
 for p,v in zip(k.data,local(head,hc if i==0 else hc+dc[i-1])):p.co=v
for p,v in zip(head.data.vertices,local(head,hc)):p.co=v
head.data.update()
# Importer preserves the exact original vertex ordering; use original float color data.
mesh=eye.data;attr=mesh.color_attributes.new(name='P4 eye pigment',type='FLOAT_COLOR',domain='CORNER')
for loop,p in zip(mesh.loops,attr.data):p.color=(*cc[loop.vertex_index],1.)
for mat in mesh.materials:
 for n in mat.node_tree.nodes:
  if n.type=='VERTEX_COLOR':n.layer_name=attr.name
  if n.type=='ATTRIBUTE':n.attribute_name=attr.name
mesh.color_attributes.active_color=attr
# Use the transformed glTF vertex normals in the native base geometry, in local axes.
rot=head.matrix_world.to_3x3().transposed()
ln=[tuple((rot@Vector((float(x),float(-z),float(y)))).normalized()) for x,y,z in nc]
head.data.normals_split_custom_set_from_vertices(ln)
head.data.update();mesh.update();bpy.context.view_layer.update()
errs=[float(np.max(abs(gltf(head,k.data)-(hc if i==0 else hc+dc[i-1])))) for i,k in enumerate(keys)]
cerr=max(float(np.max(abs(np.array(p.color[:3])-cc[l.vertex_index]))) for l,p in zip(mesh.loops,attr.data))
assert max(errs)<1e-6 and cerr<1e-6
rig=next(o for o in sc.objects if o.type=='ARMATURE');assert len(rig.data.bones)==66
assert len(bpy.data.actions)==13
# Preserve actions/NLA; save the editable source without review lights first.
bpy.context.preferences.filepaths.save_version=0
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str((P/'asya-p4-01.blend').resolve()),compress=True)
report={'blender':bpy.app.version_string,'source_glb_sha256':sha(src),'blend_sha256':sha(P/'asya-p4-01.blend'),'geometry_max_error_m':max(errs),'color_max_error_linear':cerr,'bones':len(rig.data.bones),'actions':len(bpy.data.actions),'keys':list(keys.keys()),'source_type':'exact GLB imported to native Blender; original pre-export blend retained separately'}
(P/'native-qa.json').write_text(json.dumps(report,indent=2));print(report,flush=True)
# Review scene: same rest pose, camera and lighting as before.
rig.data.pose_position='REST'
for o in sc.objects:
 if o.name=='Icosphere':o.hide_render=True
bpy.context.view_layer.update()
sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=16;sc.cycles.use_denoising=True
sc.render.resolution_x=420;sc.render.resolution_y=490;sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG';sc.render.threads_mode='FIXED';sc.render.threads=2
sc.world=bpy.data.worlds.new('P4 neutral world');sc.world.use_nodes=True
sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.35,.35,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.35
sc.view_settings.view_transform='AgX'
def area(name,loc,energy,size):
 l=bpy.data.lights.new(name,'AREA');l.energy=energy;l.shape='DISK';l.size=size
 o=bpy.data.objects.new(name,l);sc.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((.001,-.015,1.52))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key',(-.6,-.8,2),34,.65);area('Fill',(.55,-.45,1.65),18,.6);area('Rim',(.1,.45,1.9),20,.5)
cam=bpy.data.cameras.new('P4 portrait');o=bpy.data.objects.new('P4 portrait',cam);sc.collection.objects.link(o);sc.camera=o;cam.type='ORTHO';cam.ortho_scale=.31
def render(angle,w,close=False):
 keys['eyes'].value=w;bpy.context.view_layer.update();theta=math.radians(angle)
 if close:
  sc.render.resolution_x=640;sc.render.resolution_y=360;sc.cycles.samples=24;cam.ortho_scale=.125;target=Vector((.001,-.042,1.518))
 else:
  sc.render.resolution_x=420;sc.render.resolution_y=490;sc.cycles.samples=16;cam.ortho_scale=.31;target=Vector((.001,0,1.535))
 o.location=target+Vector((.65*math.sin(theta),-.65*math.cos(theta),.012));o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
 sc.render.filepath=str(P/f'{"close" if close else "portrait"}-{angle}-{w}.png');bpy.ops.render.render(write_still=True)
for w in (0,.5,1):
 for a in (0,45,90):render(a,w)
for w in (0,.5,1):render(0,w,True)
render(45,0,True)

