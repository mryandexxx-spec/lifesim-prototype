"""CF-SKIN BASE checkpoint 1: native UV proof. No auto unwrap or artist approval."""
import hashlib, json, struct, math, itertools, pathlib, copy, shutil
import numpy as np
import torch, anny, bpy
from PIL import Image, ImageDraw
from mathutils import Vector
from anny.paths import get_anny_root_dir
import yaml
ROOT=pathlib.Path("skin-out"); ROOT.mkdir(exist_ok=True)
SRC=pathlib.Path("pinned-vis")
PINS={"male":"4ce29a6ffce21817f92bb2c7df8c27afe630d0dd88e373a05e2ceca591fdcbb8","female":"f4973254fb39f2ff962f429725e66c17a478d7e4110ed556679babb400c7d85e"}
NAMES=json.loads((SRC/"models.json").read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
def read_glb(p):
    r=p.read_bytes(); assert r[:4]==b'glTF' and struct.unpack_from('<I',r,8)[0]==len(r)
    n,t=struct.unpack_from('<II',r,12); assert t==0x4e4f534a
    j=json.loads(r[20:20+n]); m,t=struct.unpack_from('<II',r,20+n); assert t==0x004e4942
    return j,bytearray(r[28+n:28+n+m])
def acc(j,b,i):
    a=j['accessors'][i]; dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]); w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    def view(s,n,d,k):
        v=j['bufferViews'][s['bufferView']]
        return np.ndarray((n,k),dtype=d,buffer=b,offset=v.get('byteOffset',0)+s.get('byteOffset',0),strides=(v.get('byteStride',d.itemsize*k),d.itemsize)).copy()
    x=view(a,a['count'],dt,w) if 'bufferView' in a else np.zeros((a['count'],w),dt)
    if 'sparse' in a:
        s=a['sparse']; d=np.dtype({5121:'u1',5123:'<u2',5125:'<u4'}[s['indices']['componentType']])
        x[view(s['indices'],s['count'],d,1).ravel()]=view(s['values'],s['count'],dt,w)
    return x
def append(j,b,a,kind):
    a=np.ascontiguousarray(a); b.extend(b'\0'*((-len(b))%4))
    v=len(j['bufferViews']); j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=a.nbytes)); b.extend(a.tobytes())
    i=len(j['accessors']); j['accessors'].append(dict(bufferView=v,componentType={np.dtype('<f4'):5126,np.dtype('<u4'):5125}[a.dtype],count=len(a),type=kind,min=a.min(0).reshape(-1).tolist(),max=a.max(0).reshape(-1).tolist())); return i
def put_image(j,b,p):
    data=p.read_bytes(); b.extend(b'\0'*((-len(b))%4)); i=len(j['bufferViews']); j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=len(data))); b.extend(data)
    j.setdefault('images',[]).append(dict(bufferView=i,mimeType='image/png')); j.setdefault('textures',[]).append(dict(source=len(j['images'])-1)); return len(j['textures'])-1
def write(p,j,b):
    b.extend(b'\0'*((-len(b))%4)); j['buffers'][0]['byteLength']=len(b)
    s=json.dumps(j,separators=(',',':')).encode(); s+=b' '*((-len(s))%4)
    p.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(s)+len(b))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(b),0x004e4942)+b)
def tri_area(v,tri):
    a,b,c=v[tri[:,0]],v[tri[:,1]],v[tri[:,2]]
    if v.shape[1]==3:return np.linalg.norm(np.cross(b-a,c-a),axis=1)*.5
    return np.abs((b[:,0]-a[:,0])*(c[:,1]-a[:,1])-(b[:,1]-a[:,1])*(c[:,0]-a[:,0]))*.5
def corner_map(raw,faces,fuv):
    lookup={}
    for f,u in zip(faces,fuv):
        k=tuple(sorted(f.tolist()))
        assert k not in lookup,('duplicate native triangle',k)
        lookup[k]=dict(zip(f.tolist(),u.tolist()))
    assert len(lookup)==len(raw)
    out=[]
    for f in raw:
        k=tuple(sorted(f.tolist())); assert k in lookup,('native face mismatch',k)
        entry=lookup.pop(k)
        out.append([entry[int(v)] for v in f])
    assert not lookup
    return np.asarray(out,dtype=np.int32)
torch.set_num_threads(2)
model=anny.Anny(topology='anny',rig='anny',local_changes='default',facial_actions='all').to(device='cpu',dtype=torch.float32)
def npy(x):return x.detach().cpu().numpy() if hasattr(x,'detach') else np.asarray(x)
faces=npy(model.faces).astype(np.int32); fuv=npy(model.face_texture_coordinate_indices).astype(np.int32); uv=npy(model.texture_coordinates).astype(np.float32)
assert faces.shape==fuv.shape==(27420,3) and np.isfinite(uv).all() and fuv.min()>=0 and fuv.max()<len(uv)
assert uv.min()>=-1e-6 and uv.max()<=1+1e-6
vendor=get_anny_root_dir()/'data'; seg=Image.open(vendor/'segmentation/body_parts_segmentation.png').convert('RGB')
seg.save(ROOT/'vendor-region-map.png')
colors=yaml.safe_load((vendor/'segmentation/body_parts_segmentation.yaml').read_text())['colors']
# Preserve available donor masks and original notice for visual inspection; do not assume
# they are finished albedo textures. No art candidate released until inspected.
masks=vendor/'mpfb2/textures'; md={}
for p in sorted(masks.glob('*')):
    if p.suffix.lower() not in ('.jpg','.png'):continue
    im=Image.open(p)
    md[p.name]={'sha256':sha(p.read_bytes()),'size':im.size,'mode':im.mode,'extrema':im.getextrema()}
    shutil.copy2(p,ROOT/p.name)
shutil.copy2(vendor/'mpfb2/LICENSE.md',ROOT/'mpfb-LICENSE.md')
for name in ('anny-LICENSE','anny-README.md','NOTICE.txt'):
    shutil.copy2(SRC/name,ROOT/name)
check=Image.new('RGB',(1024,1024)); draw=ImageDraw.Draw(check)
for y in range(16):
    for x in range(16):
        draw.rectangle((x*64,y*64,x*64+63,y*64+63),fill=((240,226,185) if (x+y)%2==0 else (55,107,128)))
        draw.text((x*64+4,y*64+4),f'{x},{y}',fill=(10,10,10) if (x+y)%2==0 else (255,255,255))
check.save(ROOT/'checker.png')
report={'status':'UV diagnostic only; TECH/ART not accepted','upstream':'8f35dc2df1c4062fd2fae86734f9705de50c0c2b','native_faces_sha':sha(faces.astype('<i8').tobytes()),'native_uv_sha':sha(uv.astype('<f4').tobytes()),'native_corner_uv_sha':sha(fuv.astype('<i4').tobytes()),'donor_masks':md,'sexes':{}}
def save_report(): (ROOT/'uv-report.json').write_text(json.dumps(report,indent=2))
save_report()
for sex,pin in PINS.items():
    p=SRC/(sex+'-candidate.glb'); assert sha(p.read_bytes())==pin
    j,b=read_glb(p); m=j['meshes'][0]; prim=m['primitives'][0]
    assert len(j['meshes'])==len(m['primitives'])==1 and len(prim['targets'])==15
    names=m['extras']['targetNames']; assert names==NAMES[sex]['targets']
    raw=acc(j,b,prim['indices']).reshape(-1,3).astype(np.int32)
    pos=acc(j,b,prim['attributes']['POSITION'])
    assert pos.shape==(13718,3) and raw.shape==(27420,3)
    assert sha(raw.astype('<i8').tobytes())=='72a1d21fc87e04b194835769265008a4bcac5fdb5a1b1be4846d850960c5bca1'
    mapped=corner_map(raw,faces,fuv)
    # glTF uses top-left image coordinates; native Anny has bottom-left origin.
    top=uv.copy(); top[:,1]=1-top[:,1]
    pairs=np.stack([raw.ravel(),mapped.ravel()],axis=1)
    uniq,inv=np.unique(pairs,axis=0,return_inverse=True)
    src=uniq[:,0]; uidx=uniq[:,1]; newtri=inv.reshape(-1,3).astype('<u4'); tex=top[uidx]
    assert np.array_equal(src[newtri],raw) and np.array_equal(uidx[newtri],mapped)
    area=tri_area(tex,newtri); deg=int((area<1e-12).sum())
    # Quantify overlap conservatively by counting pixel-center coverage; shared edges excluded.
    coverage=np.zeros((1024,1024),np.uint16)
    for f in newtri:
        a,c,d=tex[f]*1024
        lo=np.maximum(np.floor(np.minimum(np.minimum(a,c),d)).astype(int),0); hi=np.minimum(np.ceil(np.maximum(np.maximum(a,c),d)).astype(int),1024)
        if np.any(hi<=lo):continue
        xx,yy=np.meshgrid(np.arange(lo[0],hi[0])+.5,np.arange(lo[1],hi[1])+.5)
        def cross(p,q):return (q[0]-p[0])*(yy-p[1])-(q[1]-p[1])*(xx-p[0])
        z=np.stack([cross(a,c),cross(c,d),cross(d,a)])
        inside=(np.all(z>1e-7,axis=0)|np.all(z<-1e-7,axis=0))
        coverage[lo[1]:hi[1],lo[0]:hi[0]]+=inside
    Image.fromarray(np.minimum(coverage*80,255).astype(np.uint8)).save(ROOT/f'{sex}-uv-coverage.png')
    uvcenter=top[mapped].mean(1); s=np.asarray(seg)
    xy=np.clip(np.rint(uvcenter*np.array([s.shape[1],s.shape[0]])).astype(int),[0,0],[s.shape[1]-1,s.shape[0]-1])
    rgb=s[xy[:,1],xy[:,0]]
    counts={k:int(np.all(rgb==v,axis=1).sum()) for k,v in colors.items()}
    areas=tri_area(pos,raw); stress={}
    ds={name:acc(j,b,t['POSITION']) for name,t in zip(names,prim['targets'])}
    states={'neutral':[],**{n:[n] for n in names},'all-pos':[n for n in names if n.endswith('_pos') and not n.startswith('neck')],'all-neg':[n for n in names if n.endswith('_neg') and not n.startswith('neck')]}
    for state,keys in states.items():
        v=pos.copy()
        for key in keys:v+=ds[key]
        a=tri_area(v,raw); mask=(areas>1e-10)&(area>1e-12)
        ratio=a[mask]/areas[mask]
        assert np.isfinite(ratio).all() and np.all(ratio>0)
        stress[state]={'min':float(ratio.min()),'p01':float(np.quantile(ratio,.01)),'p99':float(np.quantile(ratio,.99)),'max':float(ratio.max())}
    outj=copy.deepcopy(j); outb=bytearray(b); op=outj['meshes'][0]['primitives'][0]
    for a,i in prim['attributes'].items():
        x=acc(j,b,i)
        if a.startswith('TEXCOORD'):continue
        assert x.dtype==np.float32,(a,x.dtype)
        op['attributes'][a]=append(outj,outb,x[src].astype('<f4'),{2:'VEC2',3:'VEC3',4:'VEC4'}[x.shape[1]])
    op['attributes']['TEXCOORD_0']=append(outj,outb,tex.astype('<f4'),'VEC2')
    op['indices']=append(outj,outb,newtri.ravel().astype('<u4'),'SCALAR')
    for t,ot in zip(prim['targets'],op['targets']):
        for a,i in t.items():ot[a]=append(outj,outb,acc(j,b,i)[src].astype('<f4'),'VEC3')
    idx=put_image(outj,outb,ROOT/'checker.png')
    outj['materials']=[{'name':'UV diagnostic checker','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':idx},'metallicFactor':0,'roughnessFactor':.72}}]; op['material']=0
    dst=ROOT/f'{sex}-checker.glb';write(dst,outj,outb)
    k,z=read_glb(dst); qp=k['meshes'][0]['primitives'][0]
    assert np.array_equal(src[acc(k,z,qp['indices']).reshape(-1,3)],raw)
    for a,i in prim['attributes'].items():
        if a.startswith('TEXCOORD'):continue
        assert np.array_equal(acc(k,z,qp['attributes'][a]),acc(j,b,i)[src]),a
    for t,qt in zip(prim['targets'],qp['targets']):
        for a,i in t.items():assert np.array_equal(acc(k,z,qt[a]),acc(j,b,i)[src]),a
    np.savez_compressed(ROOT/f'{sex}-uv-map.npz',source_vertex=src,source_uv=uidx,corner_uv=mapped,raw_faces=raw,export_faces=newtri,uv=tex)
    report['sexes'][sex]={'source_sha':pin,'source_attributes':list(prim['attributes']),'vertices_before':len(pos),'vertices_after':len(src),'triangles':len(raw),'degenerate_uv_triangles':deg,'covered_pixels':int((coverage>0).sum()),'overlap_pixels':int((coverage>1).sum()),'region_counts':counts,'unclassified_faces':len(raw)-sum(counts.values()),'stress_area_ratio':stress,'corner_mapping_sha':sha(mapped.astype('<i4').tobytes()),'all_original_fields_exact_after_remap':True,'checker_sha':sha(dst.read_bytes())}
    save_report()
    # Real Blender evidence from the exported diagnostic GLB, not a generated illustration.
    bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=str(dst.resolve()))
    scene=bpy.context.scene
    meshes=[o for o in scene.objects if o.type=='MESH']
    assert len(meshes)==1 and len(meshes[0].data.shape_keys.key_blocks)==16 and len(meshes[0].data.uv_layers)>0
    obj=meshes[0]; scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.28,.28,1)
    center=Vector((0,0,NAMES[sex]['center']))
    for offset,power in [((-2,-4,1.8),1),((3,-3,.8),.45),((2,3,2),.3)]:
        bpy.ops.object.light_add(type='SUN',location=center+Vector(offset)); l=bpy.context.object;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler();l.data.energy=power;l.data.angle=0
    bpy.ops.object.camera_add(); cam=bpy.context.object; scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.44;cam.data.clip_end=10
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True
    scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=math.log2(.85)
    for label in ('neutral','all-pos','all-neg','blink','smile','jawopen'):
        for key in obj.data.shape_keys.key_blocks[1:]:key.value=float(key.name in states[label])
        bpy.context.view_layer.update()
        for angle in (0,45,90) if label in ('neutral','all-pos','all-neg') else (0,):
            r=math.radians(angle);cam.location=center+Vector((math.sin(r)*1.9,-math.cos(r)*1.9,0));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str((ROOT/f'{sex}-{label}-{angle}-checker.png').resolve());bpy.ops.render.render(write_still=True)
    for key in obj.data.shape_keys.key_blocks[1:]:key.value=0
    bpy.ops.wm.save_as_mainfile(filepath=str((ROOT/f'{sex}-checker.blend').resolve()))
report['same_corner_mapping']=report['sexes']['male']['corner_mapping_sha']==report['sexes']['female']['corner_mapping_sha']
assert report['same_corner_mapping'];report['status']='UV correspondence exact; visual checker, overlap and donor review OPEN';save_report()
print(json.dumps(report))
