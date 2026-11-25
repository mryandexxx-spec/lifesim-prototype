import bpy, numpy as np, torch, anny, pathlib, urllib.request, hashlib, json, itertools, math, struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=pathlib.Path.cwd()/'reset-fix'
root.mkdir(exist_ok=True)
base='https://lifesim-cf-body-reset-c-lab.vercel.app/'
pins={'male':'5873589a1a97b6fdccbe460b3aaf739b2539ce6a1f75520c5d12845ee6598eb3','female':'fc8c47af2e9dfa0935bac0a2ad1384cf6b1a3926e255dd8728f145cf5bc5bf9f'}
axes={'jaw':['chin-width-incr'],'cheeks':['l-cheek-volume-incr','r-cheek-volume-incr'],'nose':['nose-scale-depth-incr'],'mouth':['mouth-scale-horiz-incr'],'eyes':['l-eye-trans-out','r-eye-trans-out']}
amplitudes={'jaw':.30,'cheeks':.30,'nose':.35,'mouth':.35,'eyes':.35}
names=[a+'_'+s for a in axes for s in ['neg','pos']]
# Full signed native range is diagnostic. The first actual male render shows
# excessive flattening of the bridge at nose_neg=-1. Use bounded .65 there.
# Other endpoints retain native full range pending both-sex visual review.
range_limits={k:(.65 if k=='nose_neg' else 1.0) for k in names}
torch.set_num_threads(2)
model=anny.Anny(topology='anny',rig='anny',local_changes='default',facial_actions='all').to(device='cpu',dtype=torch.float32)
pose=torch.eye(4)[None,None].repeat(1,model.bone_count,1,1)
phenotype={k:.5 for k in model.phenotype_labels}
def native(changes,profile=None):
    with torch.no_grad():
        return model(pose_parameters=pose,phenotype_kwargs=phenotype if profile is None else profile,local_changes_kwargs=changes,facial_actions={})['vertices'].squeeze(0).detach().numpy()
neutral=native({})
assert neutral.shape==(13718,3)
labels=set(model.local_change_labels)
native_report={}
native_deltas={}
# Compare native local delta fields across distinct phenotype states.
print('phenotype labels',list(model.phenotype_labels))
for axis,ls in axes.items():
    assert set(ls)<=labels,(axis,ls,sorted(labels))
    for sign,side in [(-1,'neg'),(1,'pos')]:
        prev=native({k:sign*amplitudes[axis] for k in ls})-neutral
        full=native({k:sign for k in ls})-neutral
        factor=float(np.sum(prev*full)/np.sum(prev*prev))
        residual=float(np.linalg.norm(full-prev*factor)/np.linalg.norm(full))
        assert np.isfinite(factor) and factor>1 and residual<.01,(axis,side,factor,residual)
        key=axis+'_'+side
        native_deltas[key]=(prev,full)
        native_report[key]=dict(labels=ls,old=amplitudes[axis],new=1.0,measured_ratio=factor,relative_residual=residual,old_mm=float(np.linalg.norm(prev,axis=1).max()*1000),full_mm=float(np.linalg.norm(full,axis=1).max()*1000))
# Verify identity-independent delta fields at two independent gender profiles.
# No claim of recovering the exact original phenotype or authored local vector.
profile_fields={}
for sex,gender in [('male',1.0),('female',0.0)]:
    profile={**phenotype,'gender':gender}
    b0=native({},profile)
    fields={}
    for axis,ls in axes.items():
        for sign,side in [(-1,'neg'),(1,'pos')]:
            k=axis+'_'+side
            d=native({q:sign for q in ls},profile)-b0
            g=native_deltas[k][1]
            abs_mm=float(np.linalg.norm(d-g,axis=1).max()*1000)
            assert abs_mm<.15,(sex,k,abs_mm)
            limit=range_limits[k]
            fields[k]=d if limit==1 else native({q:sign*limit for q in ls},profile)-b0
            native_report[k]['candidate_limit']=limit
            native_report[k][sex+'_profile_max_diff_mm']=abs_mm
    profile_fields[sex]=fields
(root/'native.json').write_text(json.dumps(native_report,indent=2))
print(json.dumps(native_report))
def coords(k):
    a=np.empty(len(k.data)*3,dtype=np.float32)
    k.data.foreach_get('co',a)
    return a.reshape(-1,3)
def sha(a): return hashlib.sha256(a.tobytes()).hexdigest()
def metrics(v,tri):
    a,b,c=v[tri[:,0]],v[tri[:,1]],v[tri[:,2]]
    return np.linalg.norm(np.cross(b-a,c-a),axis=1)*.5
def setup(obj,b):
    scene=bpy.context.scene
    z=float(b[:,2].max())
    head=b[b[:,2]>z-.27]
    center=Vector(((head.max(0)+head.min(0))/2).tolist())
    center.z=z-.12
    # Blender front is -Y; choose front or profile using the same fixed camera.
    scene.world=bpy.data.worlds.new('Clay world')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.24,.24,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
    for offset,power,size in [((-.5,-.8,.5),45,.6),((.5,-.5,.25),25,.5),((.1,.5,.4),30,.4)]:
        bpy.ops.object.light_add(type='AREA',location=center+Vector(offset))
        l=bpy.context.object
        l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler()
        l.data.energy=power
        l.data.size=size
    bpy.ops.object.camera_add(location=center+Vector((0,-1,0)))
    cam=bpy.context.object
    cam.data.type='ORTHO'
    cam.data.ortho_scale=.32
    scene.camera=cam
    scene.render.engine='CYCLES'
    scene.cycles.device='CPU'
    scene.cycles.samples=8
    scene.render.threads_mode='FIXED'
    scene.render.threads=4
    scene.cycles.use_denoising=True
    scene.render.resolution_x=320
    scene.render.resolution_y=320
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    return scene,cam,center
# Read and preserve the actual published glTF indices/accessors, rather than
# assuming Blender's polygon indices are the original native triangle array.
def read_glb(path):
    raw=path.read_bytes()
    assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,8)[0]==len(raw)
    n,kind=struct.unpack_from('<II',raw,12)
    assert kind==0x4e4f534a
    j=json.loads(raw[20:20+n])
    m,kind=struct.unpack_from('<II',raw,20+n)
    assert kind==0x004e4942
    return j,bytearray(raw[28+n:28+n+m])
def accessor(j,buf,i):
    a=j['accessors'][i]
    dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
    width={'SCALAR':1,'VEC3':3}[a['type']]
    def view(spec,count,typ,w):
        v=j['bufferViews'][spec['bufferView']]
        off=v.get('byteOffset',0)+spec.get('byteOffset',0)
        return np.ndarray((count,w),dtype=typ,buffer=buf,offset=off,strides=(v.get('byteStride',typ.itemsize*w),typ.itemsize)).copy()
    arr=view(a,a['count'],dt,width) if 'bufferView' in a else np.zeros((a['count'],width),dtype=dt)
    if 'sparse' in a:
        q=a['sparse']
        typ=np.dtype({5121:'u1',5123:'<u2',5125:'<u4'}[q['indices']['componentType']])
        idx=view(q['indices'],q['count'],typ,1).ravel()
        arr[idx]=view(q['values'],q['count'],dt,width)
    return arr
def to_blender(v):
    return v[:,[0,2,1]]*np.array([1,-1,1],dtype=np.float32)
def to_gltf(v):
    return v[:,[0,2,1]]*np.array([1,1,-1],dtype=np.float32)
def canonical_faces(f):
    f=np.sort(np.asarray(f,dtype=np.int32),axis=1)
    return f[np.lexsort((f[:,2],f[:,1],f[:,0]))]
def write_glb(path,j,buf):
    j['buffers'][0]['byteLength']=len(buf)
    js=json.dumps(j,separators=(',',':')).encode()
    js+=b' '*((-len(js))%4)
    buf+=b'\0'*((-len(buf))%4)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(buf))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(buf),0x004e4942)+buf)
def append_vec(j,buf,data):
    data=np.ascontiguousarray(data,dtype='<f4')
    buf+=b'\0'*((-len(buf))%4)
    view=len(j['bufferViews'])
    j['bufferViews'].append(dict(buffer=0,byteOffset=len(buf),byteLength=data.nbytes))
    buf.extend(data.tobytes())
    idx=len(j['accessors'])
    j['accessors'].append(dict(bufferView=view,componentType=5126,count=len(data),type='VEC3',min=data.min(0).tolist(),max=data.max(0).tolist()))
    return idx
def vertex_normals(v,tri):
    a,b,c=v[tri[:,0]],v[tri[:,1]],v[tri[:,2]]
    cross=np.cross(b-a,c-a)
    n=np.zeros_like(v)
    for i in range(3): np.add.at(n,tri[:,i],cross)
    return n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-20)
report={}
for sex,pin in pins.items():
    source=root/(sex+'-original.glb')
    source.write_bytes(urllib.request.urlopen(base+sex+'.glb',timeout=30).read())
    assert hashlib.sha256(source.read_bytes()).hexdigest()==pin
    j,buf=read_glb(source)
    mesh=j['meshes'][0]
    prim=mesh['primitives'][0]
    target_names=mesh['extras']['targetNames']
    tri=accessor(j,buf,prim['indices']).reshape(-1,3).astype(np.int32)
    assert tri.shape==(27420,3)
    topology_hash=sha(tri.astype('<i8'))
    assert topology_hash=='72a1d21fc87e04b194835769265008a4bcac5fdb5a1b1be4846d850960c5bca1',(sex,topology_hash)
    vendor_faces=np.asarray(model.faces,dtype=np.int32)
    # Compare raw source indices with vendor before involving Blender. Record
    # whether the vendor face representation differs; source pin + exact local
    # displacement direction and index correspondence remain independent gates.
    vendor_hash=sha(vendor_faces.astype('<i8'))
    raw_vendor_same=bool(np.array_equal(canonical_faces(tri),canonical_faces(vendor_faces)))
    print(sex,'raw topology',topology_hash,'vendor topology',vendor_hash,'canonical same',raw_vendor_same)
    raw_base=accessor(j,buf,prim['attributes']['POSITION'])
    b=to_blender(raw_base)
    assert b.shape==(13718,3)
    old={'Basis':b.copy()}
    for k,t in zip(target_names,prim['targets']):
        old[k]=b+to_blender(accessor(j,buf,t['POSITION']))
    assert set(old)=={'Basis',*names,'blink','smile','jawopen','neck_neg','neck_pos'}
    area=metrics(b,tri)
    # Use Blender to create the editable model from the exact ordered GLB
    # coordinates and triangles, never from an implicit reordered import.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    imported_tri=np.array([p.vertices[:] for p in imported.data.polygons],dtype=np.int32)
    print(sex,'imported topology same',bool(np.array_equal(canonical_faces(imported_tri),canonical_faces(tri))))
    mats=list(imported.data.materials)
    bpy.data.objects.remove(imported,do_unlink=True)
    data=bpy.data.meshes.new(sex+' exact source index mesh')
    data.from_pydata(b.tolist(),[],tri.tolist())
    data.update()
    obj=bpy.data.objects.new(sex+' RESET-C-FIX derivative',data)
    bpy.context.collection.objects.link(obj)
    for mat in mats:data.materials.append(mat)
    for p in data.polygons:p.use_smooth=True
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    for k,v in old.items():
        key=obj.shape_key_add(name=k)
        key.data.foreach_set('co',v.ravel())
        key.value=0
    keys=obj.data.shape_keys.key_blocks
    assert np.array_equal(coords(keys[0]),b)
    # Verify spatial correspondence by comparing native and recovered displacement
    # magnitudes on the actual vertex order. If Blender reordered vertices, fail
    # closed instead of projecting the wrong anatomy or changing the neutral.
    axis_report={}
    for k in names:
        d=old[k]-b
        prev,full=native_deltas[k]
        x=np.linalg.norm(d,axis=1)
        y=np.linalg.norm(prev,axis=1)
        similarity=float(np.dot(x,y)/(np.linalg.norm(x)*np.linalg.norm(y)))
        axis_report[k]=dict(native_support_cosine=similarity,original_mm=float(x.max()*1000),native_full_mm=native_report[k]['full_mm'])
    (root/(sex+'-correspondence.json')).write_text(json.dumps(axis_report,indent=2))
    print(sex,json.dumps(axis_report))
    # Seven previously verified supports pin vertex order and coordinate basis.
    matched=[k for k in names if axis_report[k]['native_support_cosine']>.97]
    assert len(matched)>=7,(sex,matched)
    X=np.concatenate([native_deltas[k][0] for k in matched])
    Y=np.concatenate([old[k]-b for k in matched])
    # A signed orthogonal axis permutation, not a fitted deformation field.
    candidates=[]
    for perm in itertools.permutations(range(3)):
        for signs in itertools.product([-1,1],repeat=3):
            T=np.zeros((3,3),dtype=np.float32)
            for i,axis_index in enumerate(perm): T[axis_index,i]=signs[i]
            err=float(np.linalg.norm(X@T-Y)/np.linalg.norm(Y))
            candidates.append((err,T))
    err,T=min(candidates,key=lambda x:x[0])
    # With exact pinned raw source topology, validate axis orientation using six matching native supports.
    # A small relative discrepancy on a millimetre-sized field is not an index mismatch.
    exact=[k for k in matched if axis_report[k]['native_support_cosine']>.9999]
    assert len(exact)>=6
    for k in exact:
        p=native_deltas[k][0]@T
        q=old[k]-b
        e=float(np.linalg.norm(p-q)/np.linalg.norm(q))
        abs_mm=float(np.linalg.norm(p-q,axis=1).max()*1000)
        cosine=float(np.sum(p*q)/(np.linalg.norm(p)*np.linalg.norm(q)))
        axis_report[k].update(mapping_error_mm=abs_mm,mapping_vector_cosine=cosine,mapping_relative_error=e)
        print(sex,k,'mapping residual',e,'max mm',abs_mm,'vector cosine',cosine)
        assert cosine>.999 and abs_mm<.15,(sex,k,e,abs_mm,cosine,T)
    print(sex,'native coordinate transform',T.tolist(), 'all support residual',err)
    # Use actual signed native fields, NOT a scaled copy of the old positive/negative
    # pair. Neutral and expression/neck keys are untouched.
    for k in names:
        p,full=native_deltas[k]
        target=b+profile_fields[sex][k]@T
        keys[k].data.foreach_set('co',target.ravel())
        new=coords(keys[k])
        assert np.isfinite(new).all()
        axis_report[k].update(new_mm=float(np.linalg.norm(new-b,axis=1).max()*1000),old_native_residual=float(np.linalg.norm(p@T-(old[k]-b))/np.linalg.norm(old[k]-b)))
    assert np.array_equal(coords(keys[0]),b)
    for k in ['blink','smile','jawopen','neck_neg','neck_pos']:
        assert np.array_equal(coords(keys[k]),old[k])
    deltas={k:coords(keys[k])-b for k in names}
    min_area=1
    # Topological connected components (known source skin + oral + two eyes).
    parent=list(range(len(b)))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]]
            i=parent[i]
        return i
    for a,c,d in tri:
        a,c,d=map(find,(a,c,d))
        parent[c]=a
        parent[d]=a
    groups={}
    for i,t in enumerate(tri): groups.setdefault(find(int(t[0])),[]).append(i)
    comps=sorted(groups.values(),key=len,reverse=True)
    print(sex,'component triangle counts',[len(c) for c in comps])
    assert len(comps)==4,(sex,[len(c) for c in comps])
    def contacts(v):
        trees=[BVHTree.FromPolygons(v.tolist(),tri[c].tolist(),all_triangles=True,epsilon=0) for c in comps]
        return [len(trees[0].overlap(t)) for t in trees[1:]]
    expr=['blink','smile','jawopen']
    contact_report={}
    oldd={k:old[k]-b for k in names}
    samples=[('neutral',{}),*[(k,{k:1}) for k in names],('all_neg',{a+'_neg':1 for a in axes}),('all_pos',{a+'_pos':1 for a in axes})]
    for label,weights in samples:
        for e in ['neutral']+expr:
            exp=0 if e=='neutral' else old[e]-b
            v0=b+exp
            v1=b+exp
            for k,w in weights.items():
                v0=v0+oldd[k]*w
                v1=v1+deltas[k]*w
            contact_report[label+'_'+e]={'baseline_candidates':contacts(v0),'new_candidates':contacts(v1)}
    (root/(sex+'-contacts.json')).write_text(json.dumps(contact_report,indent=2))
    print(sex,'contact candidate counts',json.dumps(contact_report))
    # All 243 identity endpoint combinations; report geometry not full contact certification.
    for vals in itertools.product([-1,0,1],repeat=5):
        v=b.copy()
        for a,s in zip(axes,vals):
            if s:v+=deltas[a+('_pos' if s>0 else '_neg')]
        m=metrics(v,tri)
        assert np.isfinite(v).all() and np.isfinite(m).all()
        assert not np.any((area>1e-10)&(m<1e-10)),(sex,vals,float(m.min()))
        min_area=min(min_area,float(m.min()))
    scene,cam,center=setup(obj,b)
    # Matched original endpoint renders alongside new candidate.
    for k in names:
        candidate=coords(keys[k])
        keys[k].data.foreach_set('co',old[k].ravel())
        keys[k].value=1
        bpy.context.view_layer.update()
        for view in (['profile'] if k.startswith('nose') else ['front']):
            offset=Vector((0,-1,0) if view=='front' else (1,0,0))
            cam.location=center+offset
            cam.rotation_euler=(-offset).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(root/f'{sex}-old-{k}-{view}.png')
            bpy.ops.render.render(write_still=True)
        keys[k].value=0
        keys[k].data.foreach_set('co',candidate.ravel())
    for label,weights in [('neutral',{}),*[(k,{k:1}) for k in names],('all_neg',{a+'_neg':1 for a in axes}),('all_pos',{a+'_pos':1 for a in axes}),('blink',{'blink':1}),('jawopen',{'jawopen':1})]:
        for k in keys:k.value=0
        for k,w in weights.items():keys[k].value=w
        bpy.context.view_layer.update()
        for view in (['front','profile'] if label in ('neutral','nose_neg','nose_pos','all_neg','all_pos') else ['front']):
            offset=Vector((0,-1,0) if view=='front' else (1,0,0))
            cam.location=center+offset
            cam.rotation_euler=(-offset).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(root/f'{sex}-{label}-{view}.png')
            bpy.ops.render.render(write_still=True)
    for k in keys:k.value=0
    bpy.ops.wm.save_as_mainfile(filepath=str(root/(sex+'-candidate.blend')))
    assert isinstance(j,dict) and 'accessors' in j, 'GLB document invariant before export'
    # Preserve every original non-identity accessor and the exact triangle
    # array. Append only new identity POSITION/NORMAL targets to the source GLB.
    base_norm=vertex_normals(raw_base,tri)
    normal_src=accessor(j,buf,prim['attributes']['NORMAL'])
    normal_cos=np.sum(base_norm*normal_src,axis=1)
    assert float(np.quantile(normal_cos,.01))>.80,(sex,float(np.quantile(normal_cos,.01)))
    for k in names:
        i=target_names.index(k)
        d=to_gltf(deltas[k])
        nd=vertex_normals(raw_base+d,tri)-base_norm
        assert np.isfinite(nd).all()
        prim['targets'][i]={'POSITION':append_vec(j,buf,d),'NORMAL':append_vec(j,buf,nd)}
    out=root/(sex+'-candidate.glb')
    write_glb(out,j,buf)
    jj,bb=read_glb(out)
    jp=jj['meshes'][0]['primitives'][0]
    oj,ob=read_glb(source)
    op=oj['meshes'][0]['primitives'][0]
    for attr,i in op['attributes'].items():
        assert np.array_equal(accessor(jj,bb,jp['attributes'][attr]),accessor(oj,ob,i)),(sex,attr)
    assert np.array_equal(accessor(jj,bb,jp['indices']),accessor(oj,ob,op['indices']))
    for k in target_names:
        i=target_names.index(k)
        if k not in names:
            for attr,a in op['targets'][i].items():
                assert np.array_equal(accessor(jj,bb,jp['targets'][i][attr]),accessor(oj,ob,a)),(sex,k,attr)
        else:
            actual=to_blender(accessor(jj,bb,jp['targets'][i]['POSITION']))
            assert np.array_equal(actual,deltas[k]),(sex,k)
    saved={k.name:coords(k) for k in keys}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(out))
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    keys=obj.data.shape_keys.key_blocks
    assert len(obj.data.vertices)==13718 and len(obj.data.polygons)==27420
    assert set(saved)==set(k.name for k in keys)
    # Match imported vertex order by exact neutral coordinate keys, with
    # multiplicity-aware signatures including all target coordinates.
    expected=np.concatenate([saved[k] for k in saved],axis=1)
    actual=np.concatenate([coords(keys[k]) for k in saved],axis=1)
    if not np.allclose(expected,actual,atol=1e-6,rtol=0):
        from scipy.spatial import cKDTree
        distance,index=cKDTree(expected).query(actual,k=1)
        assert float(distance.max())<1e-5 and len(np.unique(index))==len(index),(sex,float(distance.max()),len(np.unique(index)))
    report[sex]=dict(status='candidate only',coordinate_transform=T.tolist(),canonical_topology_sha=topology_hash,vendor_topology_sha=vendor_hash,raw_vendor_canonical_same=raw_vendor_same,base_normal_cosine_p01=float(np.quantile(normal_cos,.01)),glb_reimport='PASS',axes=axis_report,neutral_sha=sha(b),expression_sha={k:sha(old[k]) for k in ['blink','smile','jawopen','neck_neg','neck_pos']},tested_identity_combinations=243,min_triangle_area=min_area,contact_classification='OPEN; BVH counts recorded, not penetration classification',range_limits=range_limits)
    (root/'report.json').write_text(json.dumps(report,indent=2))
(root/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
