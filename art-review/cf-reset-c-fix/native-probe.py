import bpy, numpy as np, torch, anny, pathlib, urllib.request, hashlib, json, itertools, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=pathlib.Path.cwd()/'reset-fix'
root.mkdir(exist_ok=True)
base='https://lifesim-cf-body-reset-c-lab.vercel.app/'
pins={'male':'5873589a1a97b6fdccbe460b3aaf739b2539ce6a1f75520c5d12845ee6598eb3','female':'fc8c47af2e9dfa0935bac0a2ad1384cf6b1a3926e255dd8728f145cf5bc5bf9f'}
axes={'jaw':['chin-width-incr'],'cheeks':['l-cheek-volume-incr','r-cheek-volume-incr'],'nose':['nose-scale-depth-incr'],'mouth':['mouth-scale-horiz-incr'],'eyes':['l-eye-trans-out','r-eye-trans-out']}
amplitudes={'jaw':.30,'cheeks':.30,'nose':.35,'mouth':.35,'eyes':.35}
names=[a+'_'+s for a in axes for s in ['neg','pos']]
torch.set_num_threads(2)
model=anny.Anny(topology='anny',rig='anny',local_changes='default',facial_actions='all').to(device='cpu',dtype=torch.float32)
pose=torch.eye(4)[None,None].repeat(1,model.bone_count,1,1)
phenotype={k:.5 for k in model.phenotype_labels}
def native(changes):
    with torch.no_grad():
        return model(pose_parameters=pose,phenotype_kwargs=phenotype,local_changes_kwargs=changes,facial_actions={})['vertices'].squeeze(0).detach().numpy()
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
    scene.render.resolution_x=320
    scene.render.resolution_y=320
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    return scene,cam,center
report={}
for sex,pin in pins.items():
    source=root/(sex+'-original.glb')
    source.write_bytes(urllib.request.urlopen(base+sex+'.glb',timeout=30).read())
    assert hashlib.sha256(source.read_bytes()).hexdigest()==pin
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    keys=obj.data.shape_keys.key_blocks
    b=coords(keys[0])
    assert b.shape==(13718,3)
    assert all(k in keys for k in names)
    tri=np.array([p.vertices[:] for p in obj.data.polygons],dtype=np.int32)
    assert tri.shape==(27420,3)
    area=metrics(b,tri)
    old={k.name:coords(k) for k in keys}
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
            for i,j in enumerate(perm): T[j,i]=signs[i]
            err=float(np.linalg.norm(X@T-Y)/np.linalg.norm(Y))
            candidates.append((err,T))
    err,T=min(candidates,key=lambda x:x[0])
    # Mouth negative was near-correspondent but not exact, use only exact matches
    # to validate the transform and then independently report all endpoint errors.
    exact=[k for k in matched if axis_report[k]['native_support_cosine']>.9999]
    assert len(exact)>=6
    for k in exact:
        p=native_deltas[k][0]@T
        q=old[k]-b
        e=float(np.linalg.norm(p-q)/np.linalg.norm(q))
        assert e<.005,(sex,k,e,T)
    print(sex,'native coordinate transform',T.tolist(), 'all support residual',err)
    # Use actual signed native fields, NOT a scaled copy of the old positive/negative
    # pair. Neutral and expression/neck keys are untouched.
    for k in names:
        p,full=native_deltas[k]
        target=b+full@T
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
        for view in (['front','profile'] if label in ('neutral','nose_neg','nose_pos','all_neg','all_pos') else ['front']):
            offset=Vector((0,-1,0) if view=='front' else (1,0,0))
            cam.location=center+offset
            cam.rotation_euler=(-offset).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(root/f'{sex}-{label}-{view}.png')
            bpy.ops.render.render(write_still=True)
    for k in keys:k.value=0
    bpy.ops.wm.save_as_mainfile(filepath=str(root/(sex+'-candidate.blend')))
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(root/(sex+'-candidate.glb')),export_format='GLB',use_selection=True,export_morph=True,export_morph_normal=True)
    # Verify the reimported candidate, including all preserved key coordinates.
    saved={k.name:coords(k) for k in keys}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/(sex+'-candidate.glb')))
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    keys=obj.data.shape_keys.key_blocks
    assert len(obj.data.vertices)==13718 and len(obj.data.polygons)==27420
    assert set(saved)==set(k.name for k in keys)
    for k in keys:
        assert np.allclose(coords(k),saved[k.name],atol=1e-6,rtol=0),(sex,k.name)
    report[sex]=dict(status='candidate only',coordinate_transform=T.tolist(),glb_reimport='PASS',axes=axis_report,neutral_sha=sha(b),expression_sha={k:sha(old[k]) for k in ['blink','smile','jawopen','neck_neg','neck_pos']},tested_identity_combinations=243,min_triangle_area=min_area,contact_classification='OPEN; BVH counts recorded, not penetration classification')
(root/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
