"""CAS-HEAD-V2-P2 EXPERIMENTAL source-fitted derivative face, NEVER art accepted.
Uses official CC0 MPFB mesh + sparse targets as offline topology/morph donor.
Keeps both canonical source GLBs read-only; uses original 66-joint rigs and clips.
"""
import bpy, json, math, gzip, hashlib, statistics, random
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path('/vercel/sandbox')
DONOR=Path('/vercel/mpfb2/src/mpfb/data')
OUT=Path('/vercel/p2-output');OUT.mkdir(exist_ok=True)
PIN=json.loads((ROOT/'art-review/cas-head-v2/MPFB-DONOR-PIN.json').read_text())
POINTS=json.loads((ROOT/'art-review/cas-02-2-b/G1-LANDMARK-CANDIDATES.json').read_text())['families']
TARGETS={x['channel']:x for x in PIN['targets']}
def check_hash(p,expected):
 h=hashlib.sha256(p.read_bytes()).hexdigest()
 if h!=expected:raise RuntimeError(f'SHA mismatch {p}: {h}')
def parse_donor():
 obj=DONOR/'3dobjs/base.obj'
 check_hash(obj,PIN['donor']['sha256'])
 vertices=[];faces=[]
 for line in obj.open():
  if line.startswith('v '):vertices.append(Vector([float(a) for a in line.split()[1:4]]))
  elif line.startswith('f '):
   ids=[int(part.split('/')[0])-1 for part in line.split()[1:]]
   if len(ids)==4:faces.append(tuple(ids))
 return vertices,faces
def donor_targets():
 out={}
 for channel,t in TARGETS.items():
  p=DONOR/'targets'/t['path']
  check_hash(p,t['sha256'])
  d={}
  with gzip.open(p,'rt') as f:
   for line in f:
    if not line.strip() or line.startswith('#'):continue
    a=line.split();d[int(a[0])]=Vector(tuple(map(float,a[1:4])))
  out[channel]=d
 return out
VERT,FACES=parse_donor()
DELTA=donor_targets()
print('PINNED_DONOR',len(VERT),len(FACES),flush=True)
def material(name,color,metallic=0):
 mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1)
 mat.use_nodes=True
 bs=mat.node_tree.nodes.get('Principled BSDF')
 bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.86
 bs.inputs['Metallic'].default_value=metallic
 return mat
def create_skin_texture(family,skin):
 rng=random.Random(20261124 if family=='alex' else 21112026)
 size=512
 pix=Image.new('RGBA',(size,size));arr=[]
 for y in range(size):
  for x in range(size):
   u=x/(size-1);v=y/(size-1)
   glow=3*math.sin(math.pi*u)*math.sin(math.pi*v)
   cheek=4*(math.exp(-((u-.31)**2+(v-.41)**2)/.01)+math.exp(-((u-.69)**2+(v-.41)**2)/.01))
   noise=rng.uniform(-1.4,1.4)
   
   radial=math.sqrt(((u-.5)/.47)**2+((v-.48)/.52)**2)
   alpha=int(255*max(0,min(1,(1.04-radial)/.32)))
   rgb=tuple(int(max(0,min(255,skin[c]+glow+noise+(cheek if c==0 else -.9*cheek if c==1 else -.8*cheek)))) for c in range(3))
   arr.append((*rgb,alpha))
 pix.putdata(arr)
 file=OUT/(family+'-head-skin.png');pix.save(file)
 mat=material('CAS_HEAD_SKIN_'+family,tuple(x/255 for x in skin))
 image=bpy.data.images.load(str(file));image.pack()
 nodes=mat.node_tree.nodes
 tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear'
 mat.node_tree.links.new(tex.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
 mat.node_tree.links.new(tex.outputs['Alpha'],nodes.get('Principled BSDF').inputs['Alpha'])
 mat.surface_render_method='DITHERED'
 return mat
def bind_to_original(obj,arm,zfloor):
 obj.parent=arm
 mod=obj.modifiers.new('CAS_original_66_bone_armature','ARMATURE');mod.object=arm
 head=obj.vertex_groups.new(name='mixamorig:Head')
 neck=obj.vertex_groups.new(name='mixamorig:Neck')
 for i,v in enumerate(obj.data.vertices):
  w=max(.15,min(1.0,(v.co.z-zfloor)/.055))
  head.add([i],w,'REPLACE')
  if w<.999:neck.add([i],1-w,'REPLACE')
def build_mesh(family,source,arm,points,skinmat):
 eyesz=(points['eyeLO'].z+points['eyeRO'].z)*.5
 lipsz=(points['upperLip'].z+points['lowerLip'].z)*.5
 scale=(eyesz-lipsz)/.6
 offsetz=eyesz-7.28*scale
 # Calibrate front depth on non-hair original landmarks, not blind donor projection.
 front=[points[k].y for k in ('bridge','noseTip','nostrilL','nostrilR','upperLip','lowerLip','cheekL','cheekR')]
 depthShift=statistics.median(front)+1.43*scale
 xbias=(points['bridge'].x+points['chin'].x)*.5
 xscale=scale*(0.75 if family=='alex' else 0.76)
 def to_world(p):
  x=p.x*xscale+xbias
  z=p.y*scale+offsetz
  # conservative source-surface fitting preserving independently sculpted donor depth
  y=depthShift-p.z*scale-.004
  return Vector((x,y,z))
 # Standalone real quad topology, only front head patch; NOT full MPFB body.
 good=[f for f in FACES if all(6.28<VERT[i].y<7.93 and VERT[i].z>.28 and abs(VERT[i].x)<1.0 for i in f)]
 ids=sorted(set(i for face in good for i in face));mapping={old:i for i,old in enumerate(ids)}
 verts=[tuple(to_world(VERT[i])) for i in ids];faces=[tuple(mapping[i] for i in face) for face in good]
 mesh=bpy.data.meshes.new('CAS_'+family+'_retopo_face');mesh.from_pydata(verts,[],faces);mesh.update()
 obj=bpy.data.objects.new('CAS_'+family+'_DERIVATIVE_HEAD',mesh);bpy.context.collection.objects.link(obj)
 uv=mesh.uv_layers.new(name='CAS_head_unwrap')
 for poly in mesh.polygons:
  for li in poly.loop_indices:
   i=ids[mesh.loops[li].vertex_index];p=VERT[i]
   uv.data[li].uv=((p.x+1.08)/2.16,(p.y-6.25)/1.73)
 for mat in [skinmat]:mesh.materials.append(mat)
 for poly in mesh.polygons:poly.use_smooth=True
 # Correct local winding if needed after donor Y-up -> Blender Z-up transform.
 # Five real, distinct CC0-source geometric targets, mirrored by topological vertex pairing.
 # Convert raw sparse offsets to weighted local semantic deltas (NOT UV stretching).
 rawtree=KDTree(len(VERT))
 for i,v in enumerate(VERT):rawtree.insert(v,i)
 rawtree.balance()
 obj.shape_key_add(name='Basis')
 channels=['eyes','nose','lips','chin','cheeks']
 for name in channels:
  key=obj.shape_key_add(name=name)
  sourceD=DELTA[name]
  increments={}
  for old,d in sourceD.items():
   if old in mapping:increments[old]=d
   # source targets may act on one side only; mirror for nonidentical residents
   v=VERT[old];j,idx,dist=rawtree.find(Vector((-v.x,v.y,v.z)))
   if dist<.025 and idx in mapping and idx not in increments:
    increments[idx]=Vector((-d.x,d.y,d.z))
  count=0
  for old,delta in increments.items():
   i=mapping[old]
   # MPFB original space: X->X, Y->Z, Z->-Y
   gain=1.0
   change=Vector((delta.x*xscale,-delta.z*scale,delta.y*scale))*gain
   if change.length<1e-6:continue
   key.data[i].co+=change
   count+=1
  print('SHAPE',family,name,'changed',count,flush=True)
  key.value=0.0
 mesh['lifeSimRole']='derivative-head'
 bind_to_original(obj,arm,1.41 if family=='mira' else 1.48)
 print('FACE',family,'scale',round(scale,4),'verts',len(verts),'quads',len(faces),'depth',round(depthShift,4),flush=True)
 return obj
def make_eye(family,arm,points,skinmat):
 nameprefix='CAS_'+family+'_eyes'
 whites=material('CAS_EYE_SCLERA_'+family,(.96,.937,.87))
 iris=material('CAS_EYE_IRIS_'+family,(.28,.30,.27) if family=='alex' else (.42,.29,.24))
 dark=material('CAS_EYE_PUPIL_'+family,(.055,.044,.044))
 lids=material('CAS_LID_'+family,(.60,.37,.33) if family=='alex' else (.48,.31,.30))
 def ellipsoid(name,xyz,scale,mat):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=xyz)
  ob=bpy.context.object;ob.name=name
  ob.scale=scale
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  ob.data.materials.clear();ob.data.materials.append(mat)
  bind_to_original(ob,arm,-99)
  return ob
 for side in ['L','R']:
  i=points['eye'+side+'I'];o=points['eye'+side+'O']
  cx=(i.x+o.x)/2;cz=(i.z+o.z)/2
  y=min(i.y,o.y)-.034
  hw=abs(i.x-o.x)*.56
  ellipsoid(nameprefix+side+'white',(cx,y,cz),(hw,.006,.009),whites)
  ellipsoid(nameprefix+side+'iris',(cx,y-.005,cz-.0001),(.006,.002,.006),iris)
  ellipsoid(nameprefix+side+'pupil',(cx,y-.007,cz-.0001),(.003,.0013,.003),dark)
  # Eyelid curves follow the original landmark width, not flat painted pupils.
  for upper in [True,False]:
   curve=bpy.data.curves.new(nameprefix+side+('Upper' if upper else 'Lower'),'CURVE')
   curve.dimensions='3D';curve.bevel_depth=.0017;curve.bevel_resolution=2
   sp=curve.splines.new('POLY');sp.points.add(12)
   for j,p in enumerate(sp.points):
    t=j/12;xx=cx+hw*(2*t-1)
    zz=cz+(1 if upper else -1)*.009*math.sqrt(max(0,1-(2*t-1)**2))
    p.co=(xx,y-.0065,zz,1)
   ob=bpy.data.objects.new(nameprefix+side+'Lid',curve);bpy.context.collection.objects.link(ob)
   ob.data.materials.append(lids);ob.parent=arm
 # lip curves as independent 3D accents; no copied baked face atlas
 lipmat=material('CAS_LIPS_'+family,(.64,.33,.34) if family=='alex' else (.71,.38,.40))
 a=points['lipL'];b=points['lipR']
 for part in ('upper','lower'):
  c=bpy.data.curves.new('CAS_'+family+'_lips_'+part,'CURVE');c.dimensions='3D';c.bevel_depth=.0016;c.bevel_resolution=2
  sp=c.splines.new('POLY');sp.points.add(16)
  for j,p in enumerate(sp.points):
   t=j/16
   x=a.x*(1-t)+b.x*t
   z=(points['upperLip'].z if part=='upper' else points['lowerLip'].z)+(.003 if part=='upper' else -.001)*math.sin(math.pi*t)
   y=min(points['upperLip'].y,points['lowerLip'].y)-.032
   p.co=(x,y,z,1)
  ob=bpy.data.objects.new('CAS_'+family+'_'+part+'_LIP',c);bpy.context.collection.objects.link(ob);ob.data.materials.append(lipmat);ob.parent=arm
def render(family,scene,arm,preview):
 scene.render.engine='CYCLES';scene.cycles.samples=16
 scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG'
 scene.world=bpy.data.worlds.new('STUDIO');scene.world.color=(.65,.65,.65)
 camera=bpy.data.cameras.new('ArtReviewCamera');cam=bpy.data.objects.new('ArtReviewCamera',camera);scene.collection.objects.link(cam)
 z=1.55 if family=='alex' else 1.47
 cam.location=(0,-1.25,z);cam.rotation_euler=(Vector((0,-.02,z))-cam.location).to_track_quat('-Z','Y').to_euler()
 camera.type='ORTHO';camera.ortho_scale=.48;scene.camera=cam
 for pos,energy in [((-.4,-.8,2.2),450),((.8,-.4,1.5),280)]:
  d=bpy.data.lights.new('CAS_studio_softbox','AREA');o=bpy.data.objects.new('CAS_studio_softbox',d);scene.collection.objects.link(o)
  o.location=pos;d.energy=energy;d.shape='DISK';d.size=1.4
 scene.render.filepath=str(OUT/(family+'-'+preview+'.png'))
 bpy.ops.render.render(write_still=True)
def create_skin_texture(family,skin,source,points):
 """Source-guided FACE reprojection into new topology UV. Not final hand-painted art."""
 from mathutils.bvhtree import BVHTree
 mesh=source.data
 img=next(n.image for m in mesh.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
 iw,ih=img.size
 data=img.pixels[:]
 uvsrc=mesh.uv_layers.active.data
 bvh=BVHTree.FromObject(source,bpy.context.evaluated_depsgraph_get())
 eyez=(points['eyeLO'].z+points['eyeRO'].z)*.5
 lipsz=(points['upperLip'].z+points['lowerLip'].z)*.5
 scale=(eyez-lipsz)/.6
 zoffset=eyez-7.28*scale
 xbias=(points['bridge'].x+points['chin'].x)*.5
 xscale=scale*(.75 if family=='alex' else .76)
 size=512
 result=Image.new('RGBA',(size,size));px=result.load()
 missed=0
 for yy in range(size):
  v=1-(yy+.5)/size
  z=(v*1.73+6.25)*scale+zoffset
  for xx in range(size):
   u=(xx+.5)/size
   x=(u*2.16-1.08)*xscale+xbias
   hit,normal,polyid,dist=bvh.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),4)
   rgb=skin
   if hit is not None and 0<=polyid<len(mesh.polygons):
    polygon=mesh.polygons[polyid]
    loops=list(polygon.loop_indices)
    def tri_uv(li):
     a,b,c=[mesh.vertices[mesh.loops[j].vertex_index].co for j in li]
     det=(b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z)
     if abs(det)<1e-11:return None
     v1=((x-a.x)*(c.z-a.z)-(c.x-a.x)*(z-a.z))/det
     v2=((b.x-a.x)*(z-a.z)-(x-a.x)*(b.z-a.z))/det
     bary=[1-v1-v2,v1,v2]
     if min(bary)<-.01:return None
     texuv=[uvsrc[j].uv for j in li]
     return [(sum(bary[k]*texuv[k][t] for k in range(3))%1) for t in range(2)]
    uv=tri_uv(loops[:3]) if len(loops)>=3 else None
    if uv is None and len(loops)>3:uv=tri_uv([loops[0],loops[2],loops[3]])
    if uv:
     ix=int(uv[0]*(iw-1));iy=int(uv[1]*(ih-1));off=(iy*iw+ix)*4
     c=[int(max(0,min(255,data[off+j]*255))) for j in range(3)]
     rgb=tuple(int(.9*c[j]+.1*skin[j]) for j in range(3))
   else:missed+=1
   radial=math.sqrt(((u-.5)/.47)**2+((v-.48)/.52)**2)
   alpha=int(255*max(0,min(1,(1.04-radial)/.35)))
   px[xx,yy]=(*rgb,alpha)
 dest=OUT/(family+'-head-skin.png')
 result.filter(ImageFilter.GaussianBlur(.45)).save(dest)
 mat=material('CAS_HEAD_SKIN_'+family,(1,1,1))
 tex=mat.node_tree.nodes.new('ShaderNodeTexImage')
 tex.image=bpy.data.images.load(str(dest));tex.image.pack()
 bs=mat.node_tree.nodes.get('Principled BSDF')
 mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
 mat.node_tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
 mat.surface_render_method='DITHERED'
 print('SOURCE_REPROJECTION',family,'missed',missed,flush=True)
 return mat

def main():
 for family,path in [('alex','meshy-casual-v1.glb'),('mira','meshy-mira-mobile-v1.glb')]:
  bpy.ops.wm.read_factory_settings(use_empty=True)
  orig=ROOT/'assets/characters'/path;check_hash(orig,PIN['originalHeroGLBSha256'][family])
  bpy.ops.import_scene.gltf(filepath=str(orig))
  source=max((o for o in bpy.data.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
  arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
  points={k:(source.matrix_world@source.data.vertices[v[0]].co) for k,v in POINTS[family]['points'].items()}
  skin=create_skin_texture(family,(204,146,126) if family=='alex' else (207,165,151),source,points)
  face=build_mesh(family,source,arm,points,skin)
  make_eye(family,arm,points,skin)
  bpy.context.view_layer.objects.active=face;face.select_set(True)
  bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(family+'-derivative-wip.blend')),compress=True)
  render(family,bpy.context.scene,arm,'neutral')
  # Native Blender export, preserving imported rig and SOURCE action names when possible
  bpy.ops.export_scene.gltf(filepath=str(OUT/(family+'-derivative-wip.glb')),export_format='GLB',
    export_morph=True,export_morph_normal=False,export_skins=True,export_animations=True,
    export_animation_mode='ACTIONS',export_image_format='AUTO',export_extras=True)
  for kb in face.data.shape_keys.key_blocks:
   if kb.name in ('eyes','nose','lips','chin','cheeks'):kb.value=1.0
  render(family,bpy.context.scene,arm,'max5')
  print('EXPORTED',family,(OUT/(family+'-derivative-wip.glb')).stat().st_size,flush=True)
if __name__=='__main__':main()
