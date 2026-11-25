import bpy, torch, anny, numpy as np, pathlib, json, struct, hashlib, itertools, shutil, math
from scipy.spatial import cKDTree
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
R=pathlib.Path('body-c-continuous-out'); L=R/'lab'; F=L/'comparison'; F.mkdir(parents=True,exist_ok=True)
SRC=pathlib.Path('pinned-skin'); RAW=pathlib.Path('pinned-vis')
PINS={'male':('36abba2916a5938ecc32a94fb2582101875fe9183ec6a764fc9eeb3df89931c5','4ce29a6ffce21817f92bb2c7df8c27afe630d0dd88e373a05e2ceca591fdcbb8'),'female':('d7c697af0cfab84f536f94e0b51e4385ffd653f0587245fad61c2a962b4f40c7','f4973254fb39f2ff962f429725e66c17a478d7e4110ed556679babb400c7d85e')}
AXES={'height':'height','fullness':'weight','muscle':'muscle','proportions':'proportions'}
# Moderate initial bracket, not a production range or clinical measurement.
AMPL={'height':.125,'fullness':.25,'muscle':.25,'proportions':.25}
FACE={'jaw':['chin-width-incr'],'cheeks':['l-cheek-volume-incr','r-cheek-volume-incr'],'nose':['nose-scale-depth-incr'],'mouth':['mouth-scale-horiz-incr'],'eyes':['l-eye-trans-out','r-eye-trans-out']}
NAMES=[a+'_'+s for a in FACE for s in ('neg','pos')]+['blink','smile','jawopen','neck_neg','neck_pos']
BODY=[a+'_'+s for a in AXES for s in ('neg','pos')]
def sha(x):return hashlib.sha256(x).hexdigest()
def read(p):
    b=p.read_bytes();assert b[:4]==b'glTF' and struct.unpack_from('<I',b,8)[0]==len(b)
    n,t=struct.unpack_from('<II',b,12);assert t==0x4e4f534a
    j=json.loads(b[20:20+n]);m,t=struct.unpack_from('<II',b,20+n);assert t==0x004e4942
    return j,bytearray(b[28+n:28+n+m])
def acc(j,b,i):
    a=j['accessors'][i];d=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    def view(s,n,dt,k):
        v=j['bufferViews'][s['bufferView']]
        return np.ndarray((n,k),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+s.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*k),dt.itemsize)).copy()
    x=view(a,a['count'],d,w) if 'bufferView' in a else np.zeros((a['count'],w),d)
    if 'sparse' in a:
        s=a['sparse'];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4'}[s['indices']['componentType']])
        x[view(s['indices'],s['count'],dt,1).ravel()]=view(s['values'],s['count'],d,w)
    return x
def append(j,b,x):
    x=np.ascontiguousarray(x,dtype='<f4');b.extend(b'\0'*((-len(b))%4));v=len(j['bufferViews'])
    j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=x.nbytes));b.extend(x.tobytes())
    i=len(j['accessors']);j['accessors'].append(dict(bufferView=v,componentType=5126,count=len(x),type='VEC3',min=x.min(0).tolist(),max=x.max(0).tolist()));return i
def write(p,j,b):
    b.extend(b'\0'*((-len(b))%4));j['buffers'][0]['byteLength']=len(b);s=json.dumps(j,separators=(',',':')).encode();s+=b' '*((-len(s))%4)
    p.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(s)+len(b))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(b),0x004e4942)+b)
def cross(v,t):
    a,b,c=v[t[:,0]],v[t[:,1]],v[t[:,2]];return np.cross(b-a,c-a)
def normals(v,t):
    c=cross(v,t);n=np.zeros_like(v)
    for k in range(3):np.add.at(n,t[:,k],c)
    return n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-20)
def smooth(x):
    x=np.clip(x,0,1);return x*x*(3-2*x)
def components(n,t):
    parent=np.arange(n)
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for a,b,c in t:
        a,b,c=map(find,(a,b,c));parent[b]=a;parent[c]=a
    ids=np.array([find(int(i)) for i in range(n)])
    _,count=np.unique(ids,return_counts=True)
    return ids==np.unique(ids)[count.argmax()]
# Actual horizontal mesh section loops. Discard open chains and side loops;
# report central cross section rather than a guessed clinical circumference.
def section(v,t,y):
    # Identify crossings by mesh edge, not rounded floating coordinates:
    # the same edge interpolated in reverse can land in adjacent rounding bins.
    # Canonicalize exact coincident seam vertices before joining the loops.
    _,canonical=np.unique(v,axis=0,return_inverse=True)
    canonical=canonical.reshape(-1)
    tv=v[t];ys=tv[:,:,1]-y
    chosen=t[(ys.min(1)<0)&(ys.max(1)>0)]
    edges={};points={}
    for f in chosen:
        hits=[]
        for i,k in ((0,1),(1,2),(2,0)):
            ia,ib=int(f[i]),int(f[k]);a,b=v[ia],v[ib]
            if (a[1]<y)!=(b[1]<y):
                key=tuple(sorted((int(canonical[ia]),int(canonical[ib]))))
                if key not in points:
                    q=a.astype(np.float64)+(b.astype(np.float64)-a)*((y-a[1])/(b[1]-a[1]))
                    points[key]=q[[0,2]]
                hits.append(key)
        if len(hits)==2 and hits[0]!=hits[1]:
            a,b=hits;edges.setdefault(a,set()).add(b);edges.setdefault(b,set()).add(a)
    pending=set(edges);loops=[]
    while pending:
        q=pending.pop();stack=[q];group={q}
        while stack:
            for a in edges[stack.pop()]:
                if a not in group:group.add(a);pending.discard(a);stack.append(a)
        if not all(len(edges[a])==2 for a in group):continue
        x=np.array([points[q] for q in group]);width=float(np.ptp(x[:,0]))
        if x[:,0].min()<0<x[:,0].max():
            circ=sum(np.linalg.norm(points[a]-points[b]) for a in group for b in edges[a])/2
            loops.append((float(circ),width,float(np.ptp(x[:,1]))))
    return max(loops,default=(None,None,None),key=lambda q:q[0] if q[0] is not None else -1)
def measures(v,t):
    lo=float(v[:,1].min());hi=float(v[:,1].max());h=hi-lo
    result={'height':h,'ground':lo}
    for name,f in [('hip',.52),('waist',.61),('chest',.73)]:
        result[name],result[name+'_width'],result[name+'_depth']=section(v,t,lo+h*f+1e-5)
    # Explicit diagnostic proxies, not anatomical landmarks certified for D.
    result['span']=float(np.ptp(v[:,0]))
    result['upper_body_depth']=float(np.ptp(v[(v[:,1]>lo+h*.67)&(v[:,1]<lo+h*.79)&(abs(v[:,0])<.15),2]))
    return result
def contact_pairs(v,t):
    tree=BVHTree.FromPolygons(v.tolist(),t.tolist(),all_triangles=True,epsilon=0)
    pairs=np.array(tree.overlap(tree),dtype=np.int32).reshape(-1,2)
    pairs=pairs[pairs[:,0]<pairs[:,1]]
    if not len(pairs):return set()
    a,b=t[pairs[:,0]],t[pairs[:,1]]
    pairs=pairs[~(a[:,:,None]==b[:,None,:]).any(axis=(1,2))]
    return {tuple(x) for x in pairs.tolist()}
torch.set_num_threads(2)
model=anny.Anny(topology='anny',rig='anny',local_changes='default',facial_actions='all').to(device='cpu',dtype=torch.float32)
pose=torch.eye(4)[None,None].repeat(1,model.bone_count,1,1)
assert set(AXES.values())<=set(model.phenotype_labels)
def native(profile,changes=None):
    with torch.no_grad():
        o=model(pose_parameters=pose,phenotype_kwargs=profile,local_changes_kwargs=changes or {},facial_actions={})
    v=o['vertices'].squeeze(0).detach().cpu().numpy()
    assert v.shape==(13718,3) and np.isfinite(v).all()
    return v,o
def orient(profile,raw_face):
    b,_=native(profile);X=[];Y=[]
    for a,ls in FACE.items():
        for s,label in [(-1,'neg'),(1,'pos')]:
            amp=.65 if a=='nose' and s<0 else 1.
            v,_=native(profile,{k:s*amp for k in ls});x=v-b;y=raw_face[a+'_'+label]
            if np.linalg.norm(x)>0 and np.linalg.norm(y)>0:
                nx,ny=np.linalg.norm(x,axis=1),np.linalg.norm(y,axis=1)
                if np.dot(nx,ny)/(np.linalg.norm(nx)*np.linalg.norm(ny))>.995:X.append(x);Y.append(y)
    assert len(X)>=6,len(X)
    x,y=np.concatenate(X),np.concatenate(Y);candidates=[]
    for perm in itertools.permutations(range(3)):
        for signs in itertools.product([-1,1],repeat=3):
            T=np.zeros((3,3),np.float32)
            for k,i in enumerate(perm):T[i,k]=signs[k]
            e=float(np.linalg.norm(x@T-y)/np.linalg.norm(y));candidates.append((e,T))
    e,T=min(candidates,key=lambda a:a[0]);assert e<.12,(e,T)
    return T,e,b
def rigid_head(raw,d,cut,axis):
    y=raw[:,1];a=smooth((y-(cut-.12))/.12)[:,None]
    trans=np.median(d[y>=cut],axis=0)
    if axis!='height':trans[1]=0
    out=d*(1-a)+trans*a
    ground=(raw+out)[:,1].min()-y.min()
    if axis=='height':
        # Grounding is a WORLD translation, not an extra neck deformation.
        # The former fade injected the entire floor displacement into 9 cm
        # of neck, visibly swallowing/elongating it at the height endpoints.
        out[:,1]-=ground
        trans[1]-=ground
    else:
        # Preserve vertical head position for non-height fields; distribute
        # the normally tiny grounding adjustment below the knees only.
        anchor=1-smooth((y-y.min())/.45)
        out[:,1]-=ground*anchor
    assert np.max(np.abs(out[y>=cut]-trans))<1e-6
    assert abs(float((raw+out)[:,1].min()-y.min()))<2e-5
    return out.astype('<f4')
def map_positions(base,raw,fields):
    # Exact accepted positions identify seam duplicates; reject ambiguous
    # native deltas instead of approximating nearest anatomical correspondence.
    buckets={}
    for i,v in enumerate(raw):buckets.setdefault(v.tobytes(),[]).append(i)
    mapped=[]
    for v in base:
        ids=buckets.get(v.tobytes(),[])
        assert ids,'not an exact source position'
        assert all(np.array_equal(d[ids],np.broadcast_to(d[ids[0]],(len(ids),3))) for d in fields.values()),'ambiguous same-position source IDs'
        mapped.append(ids[0])
    return np.asarray(mapped,dtype=np.int32)
def render(sex,path,states,cut):
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.shape_keys]
    assert len(objs)>=1 and all(len(o.data.shape_keys.key_blocks)==len(NAMES)+len(BODY)+1 for o in objs)
    scene=bpy.context.scene;center=Vector((0,0,.94))
    scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.28,.28,1)
    for offset,power in [((-2,-4,1.8),1),((3,-3,.8),.45),((2,3,2),.3)]:
        bpy.ops.object.light_add(type='SUN',location=center+Vector(offset));l=bpy.context.object;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler();l.data.energy=power
    bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.20
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
    roots=[o for o in scene.objects if o.parent is None and o.type not in ('LIGHT','CAMERA')]
    transforms={o.name:o.matrix_world.copy() for o in roots}
    for label,weights in states.items():
        s=weights.get('__scale',1.)
        pivot=Vector((0,0,cut)) # cut is actual floor in this comparison
        for o in roots:o.matrix_world=Matrix.Translation(pivot) @ Matrix.Scale(s,4) @ Matrix.Translation(-pivot) @ transforms[o.name]
        for o in objs:
            for k in o.data.shape_keys.key_blocks:
                if k.name!='Basis':k.value=weights.get(k.name,0)
        for angle in (0,45,90):
            a=math.radians(angle);cam.location=center+Vector((math.sin(a)*3,-math.cos(a)*3,0));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str((F/f'{sex}-{label}-{angle}-blender.png').resolve());bpy.ops.render.render(write_still=True)
    # Save neutral editable artifact, packed skin images.
    for o in objs:
        for k in o.data.shape_keys.key_blocks:
            if k.name!='Basis':k.value=0
    for o in roots:o.matrix_world=transforms[o.name]
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str((R/f'{sex}-body-c-continuous.blend').resolve()))

# RESET: discrete jointly evaluated phenotype presets, NOT additive sliders.
# Height is a uniform world transform independent of native shape evaluation.
# No claims of independent stature/proportions or adaptive rig.
PRESETS={
 'slender':{'weight':.15,'muscle':.35},
 'full':{'weight':.85,'muscle':.40},
 'athletic':{'weight':.40,'muscle':.90},
 'proportion_low':{'proportions':.12},
 'proportion_high':{'proportions':.88},
 'combined':{'weight':.82,'muscle':.80,'proportions':.20},
 'combined_native_control':{'weight':.82,'muscle':.80,'proportions':.20},
}
PRESET_NAMES=list(PRESETS)
# Joint native grid: accepted preset targets stay separate and byte-comparable.
GRID={f'grid_{i}{j}{k}':{'weight':(.15,.5,.85)[i],'muscle':(.10,.5,.90)[j],'proportions':(.12,.5,.88)[k]}
      for i,j,k in itertools.product(range(3),repeat=3) if (i,j,k)!=(1,1,1)}
BODY=PRESET_NAMES+list(GRID)
def calibrate_contact_regions(raw,d,sex):
    # Preserve foot-local shape while translating the foot with the native leg.
    # Original accepted discrete presets are NEVER modified.
    out=d.copy()
    if sex=='male':
        floor=float(raw[:,1].min())
        for sign in (-1,1):
            side=raw[:,0]*sign>0
            core=side&(raw[:,1]<floor+.055)
            blend=(1-smooth((raw[:,1]-floor-.055)/.12))*side
            trans=np.median(d[core],axis=0);trans[1]=0
            out=out*(1-blend[:,None])+trans*blend[:,None]
    else:
        # Two measured inward pelvis triangles reverse only at full/low-muscle.
        # Keep a tiny local rest surface, transition over surrounding 2.5 cm.
        radius=np.linalg.norm(raw-np.array([0,.842,-.039]),axis=1)
        core=radius<.013;assert core.any()
        blend=1-smooth((radius-.013)/.025)
        trans=np.median(d[core],axis=0)
        out=out*(1-blend[:,None])+trans*blend[:,None]
    return out.astype('<f4')
def interp(q,fields,raw):
    x=np.clip(np.array(q,dtype=np.float64),-1,1)+1
    lo=np.minimum(np.floor(x).astype(int),1); f=x-lo
    out=np.zeros_like(raw)
    for bits in itertools.product(range(2),repeat=3):
        idx=lo+bits; w=float(np.prod(np.where(bits,f,1-f)))
        key='grid_'+''.join(map(str,idx))
        if key!='grid_111' and w:out+=fields[key]*w
    return out
states={'neutral':{},'short':{'__scale':.90},'tall':{'__scale':1.10},
        **{k:{k:1} for k in PRESET_NAMES},'tall_athletic':{'athletic':1,'__scale':1.10},
        'face_mixed':{'full':1,'smile':1,'jaw_pos':1},'grid_full':{'grid_211':1},'grid_muscle':{'grid_121':1},'grid_proportion':{'grid_112':1},'grid_slender':{'grid_011':1},'grid_low_muscle':{'grid_101':1},'grid_low_proportion':{'grid_110':1},'grid_full_low_muscle_low_prop':{'grid_200':1},'grid_full_low_muscle_mid_prop':{'grid_201':1},'grid_full_low_muscle_high_prop':{'grid_202':1},'grid_mix':{'grid_222':.125,'grid_221':.125,'grid_212':.125,'grid_122':.125,'grid_211':.125,'grid_121':.125,'grid_112':.125,'__scale':1.05}}
report={'classification':'diagnostic; no acceptance','profiles':PRESETS,'sexes':{},
 'limitations':['Diagnostic joint native lattice with trilinear interpolation, not production memory or performance proof.',
 'Uniform height scale also scales head, feet and hands; normalized head shape is unchanged.',
 'Native control deliberately does NOT protect accepted face; comparison only, never production.',
 'Head region is preserved for candidate profiles, but neck transition and topology require visual/contact review.',
 'BVH and normal reversals are candidates, not classified contacts. No rig/physical Safari proof.']}
def save(): (R/'body-report.json').write_text(json.dumps(report,indent=2,allow_nan=False))
models=json.loads((SRC/'models.json').read_text())
for sex,(pin,rpin) in PINS.items():
    src=SRC/(sex+'-mobile.glb');rp=RAW/(sex+'-candidate.glb')
    assert sha(src.read_bytes())==pin and sha(rp.read_bytes())==rpin
    j,b=read(src);r,rb=read(rp);rm=r['meshes'][0];rawp=rm['primitives'][0]
    raw=acc(r,rb,rawp['attributes']['POSITION']);tri=acc(r,rb,rawp['indices']).reshape(-1,3).astype(np.int32)
    assert raw.shape==(13718,3) and tri.shape==(27420,3)
    assert sha(tri.astype('<i8').tobytes())=='72a1d21fc87e04b194835769265008a4bcac5fdb5a1b1be4846d850960c5bca1'
    assert rm['extras']['targetNames']==NAMES
    face={n:acc(r,rb,t['POSITION']) for n,t in zip(NAMES,rawp['targets'])}
    profile={k:.5 for k in model.phenotype_labels};profile['gender']=1. if sex=='male' else 0.
    T,e,donor=orient(profile,face)
    floor=float(raw[:,1].min());cut=float(raw[:,1].max()-.265)
    # Zero head displacement, fade over neck/clavicle band, no injected head translation.
    mask=(1-smooth((raw[:,1]-(cut-.12))/.12))[:,None]
    fields={};metrics={};n0=normals(raw,tri)
    a0=np.linalg.norm(cross(raw,tri),axis=1);c0=cross(raw,tri);valid=a0>2e-10
    baseline_pairs=contact_pairs(raw,tri)
    for name,params in {**PRESETS,**GRID}.items():
        v,_=native({**profile,**params});d=(v-donor)@T
        # Unmasked control is deliberately isolated and clearly labeled.
        out=d.copy() if name.endswith('_control') else d*mask
        ground=float((raw+out)[:,1].min()-floor)
        if name.endswith('_control'):out[:,1]-=ground
        else:
            out[:,1]-=ground*(1-smooth((raw[:,1]-floor)/.45))
            assert np.max(np.abs(out[raw[:,1]>=cut]))<1e-7
        before=out.astype('<f4');out=calibrate_contact_regions(raw,before,sex) if name in GRID else before
        fields[name]=out
        vv=raw+out;assert np.isfinite(vv).all()
        c=cross(vv,tri);a=np.linalg.norm(c,axis=1)
        metrics[name]={'parameters':params,'measurements':measures(vv,tri),
            'calibration_max_mm':float(np.linalg.norm(out-before,axis=1).max()*1000),
            'max_displacement_mm':float(np.linalg.norm(out,axis=1).max()*1000),
            'head_max_displacement_mm':float(np.linalg.norm(out[raw[:,1]>=cut],axis=1).max()*1000),
            'new_degenerate':int((valid&(a<2e-10)).sum()),
            'normal_reversal_candidates':int((valid&(np.sum(c*c0,axis=1)<0)).sum()),
            'new_bvh_candidates':len(contact_pairs(vv,tri)-baseline_pairs)}
        assert metrics[name]['max_displacement_mm']>2
    assert np.linalg.norm(fields['combined']-fields['combined_native_control'])>0
    # Evaluate every 3^4 combination, plus held-out native comparisons.
    # Uniform scale preserves topology/contact relationships for positive scales.
    factorial=[]
    for q in itertools.product((-1,0,1),repeat=3):
        d=interp(q,fields,raw); vv=raw+d; c=cross(vv,tri);a=np.linalg.norm(c,axis=1)
        pairs=contact_pairs(vv,tri)-baseline_pairs
        # Classify candidates by location, not automatic acceptance. Seam adjacency
        # uses exact neutral positions; all other contacts remain unresolved.
        _,weld=np.unique(raw,axis=0,return_inverse=True);weld=weld.reshape(-1)
        seam=[];unresolved=[]
        for i,k in sorted(pairs):
            if set(weld[tri[i]]) & set(weld[tri[k]]):seam.append([i,k])
            else:unresolved.append({'triangles':[i,k],'center_m':vv[tri[[i,k]]].mean(axis=(0,1)).tolist()})
        assert np.max(np.abs(d[raw[:,1]>=cut]))<1e-7
        assert not (valid&(a<2e-10)).any()
        for scale in (.9,1.,1.1):
            vscaled=(vv-np.array([0,floor,0]))*scale+np.array([0,floor,0])
            factorial.append({'parameters':{'height':scale,'fullness':q[0],'muscle':q[1],'proportions':q[2]},
                'measurements':measures(vscaled,tri),'new_degenerate':int((valid&(a<2e-10)).sum()),
                'normal_reversal_candidates':int((valid&(np.sum(c*c0,axis=1)<0)).sum()),
                'seam_adjacent_candidates':seam,'unresolved_candidates':unresolved})
    random=[];rng=np.random.default_rng(20261125)
    for q in rng.uniform(-1,1,(12,3)):
        params={k:float(np.interp(x,[-1,0,1],ends)) for k,x,ends in zip(('weight','muscle','proportions'),q,((.15,.5,.85),(.10,.5,.90),(.12,.5,.88)))}
        v,_=native({**profile,**params});direct=((v-donor)@T)*mask
        direct[:,1]-=float((raw+direct)[:,1].min()-floor)*(1-smooth((raw[:,1]-floor)/.45))
        native_raw=direct.copy();direct=calibrate_contact_regions(raw,direct,sex)
        approx=interp(q,fields,raw);err=approx-direct
        vv=raw+approx;c=cross(vv,tri);a=np.linalg.norm(c,axis=1)
        random.append({'q':q.tolist(),'raw_native_max_mm':float(np.linalg.norm(approx-native_raw,axis=1).max()*1000),'calibration_max_mm':float(np.linalg.norm(direct-native_raw,axis=1).max()*1000),'rms_mm':float(np.sqrt(np.mean(np.sum(err**2,axis=1)))*1000),
            'max_mm':float(np.linalg.norm(err,axis=1).max()*1000),'new_degenerate':int((valid&(a<2e-10)).sum()),
            'normal_reversal_candidates':int((valid&(np.sum(c*c0,axis=1)<0)).sum()),
            'new_bvh_candidates':len(contact_pairs(vv,tri)-baseline_pairs),'measurements':measures(vv,tri)})
    assert len(factorial)==81 and len(random)==12
    # Measure low-rank opportunity without changing the runtime representation.
    X=np.stack([fields[k].reshape(-1) for k in GRID]);u,s,vt=np.linalg.svd(X,full_matrices=False)
    rank_study={}
    for rank in (6,8,10,12,16):
        err=(X-(u[:,:rank]*s[:rank])@vt[:rank]).reshape(len(X),-1,3)
        rank_study[str(rank)]={'rms_mm':float(np.sqrt(np.mean(np.sum(err**2,axis=2)))*1000),'max_mm':float(np.linalg.norm(err,axis=2).max()*1000)}
    # This is position-only diagnostic evidence, not a tested compressed GLB.
    # Preserve original exact published preset fields by independent pinned binary comparison.
    accepted=pathlib.Path('pinned-reset')/(sex+'-body.glb')
    aj,ab=read(accepted)
    assert aj['meshes'][0]['extras']['targetNames']==NAMES+PRESET_NAMES
    # Direct combined phenotype vs sum of independent native differences, before protection.
    cv,_=native({**profile,**PRESETS['combined']})
    additive=np.zeros_like(donor)
    for k,v in PRESETS['combined'].items():
        sv,_=native({**profile,k:v});additive+=sv-donor
    err=(cv-donor)-additive
    m=j['meshes'][0];assert m['extras']['targetNames']==NAMES
    old=[]
    for p in m['primitives']:
        pos=acc(j,b,p['attributes']['POSITION']);mp=map_positions(pos,raw,fields)
        assert np.array_equal(pos,raw[mp])
        old.append({'attributes':{k:acc(j,b,i) for k,i in p['attributes'].items()},'indices':acc(j,b,p['indices']),'targets':[{k:acc(j,b,i) for k,i in t.items()} for t in p['targets']]})
        for name,t in zip(NAMES,p['targets']):assert np.array_equal(acc(j,b,t['POSITION']),face[name][mp])
        for k in BODY:p['targets'].append({'POSITION':append(j,b,fields[k][mp]),'NORMAL':append(j,b,(normals(raw+fields[k],tri)-n0)[mp])})
    m['extras']['targetNames']=NAMES+BODY;m['weights']=[0]*len(NAMES+BODY)
    for node in j['nodes']:
        if 'weights' in node:node['weights']=[0]*len(NAMES+BODY)
    out=L/(sex+'-body.glb');write(out,j,b)
    z,zb=read(out);j0,b0=read(src)
    for p,o in zip(z['meshes'][0]['primitives'],old):
        assert np.array_equal(acc(z,zb,p['indices']),o['indices'])
        for k,i in p['attributes'].items():assert np.array_equal(acc(z,zb,i),o['attributes'][k])
        for t,ot in zip(p['targets'][:15],o['targets']):
            for k,i in t.items():assert np.array_equal(acc(z,zb,i),ot[k])
    for p,ap in zip(z['meshes'][0]['primitives'],aj['meshes'][0]['primitives']):
        for key in ('POSITION','NORMAL'):
            for t,at in zip(p['targets'][:len(NAMES)+len(PRESET_NAMES)],ap['targets']):
                if key in at:assert np.array_equal(acc(z,zb,t[key]),acc(aj,ab,at[key])),(sex,key)
    assert z['images']==j0['images'] and z['materials']==j0['materials'] and z['textures']==j0['textures']
    for im in z['images']:
        vv=z['bufferViews'][im['bufferView']];i=vv.get('byteOffset',0)
        assert zb[i:i+vv['byteLength']]==b0[i:i+vv['byteLength']]
    neutral=measures(raw,tri)
    report['sexes'][sex]={'source_sha':pin,'glb_sha':sha(out.read_bytes()),'exact_existing_attributes_targets_textures':True,
      'factorial':factorial,'heldout_native':random,'position_only_rank_study':rank_study,'glb_bytes':out.stat().st_size,'rig_rest':'OPEN: no production rest/bind proof', 'native_mapping_error':e,'head_cut_m':cut,'neutral':neutral,'profiles':metrics,
      'height_scale_endpoints_m':[neutral['height']*.90,neutral['height']*1.10],
      'combined_vs_additive_rms_mm':float(np.sqrt(np.mean(np.sum(err**2,axis=1)))*1000),
      'combined_vs_additive_max_mm':float(np.linalg.norm(err,axis=1).max()*1000)}
    models[sex]['targets']=NAMES+BODY;models[sex]['floor']=floor
    save();render(sex,out,states,floor);report['sexes'][sex]['blender_reimport']=True;save()
for n in ('playcanvas.min.mjs','NOTICE.txt','anny-README.md','anny-LICENSE','mpfb-LICENSE.md'):
    shutil.copy2(SRC/n,L/n)
for n in ('index.html','lab.js','interpolate.mjs'):shutil.copy2(pathlib.Path(__file__).parent/n,L/n)
(L/'models.json').write_text(json.dumps(models,indent=2))
(L/'states.json').write_text(json.dumps(states,indent=2))
save()
assert all(not s['normal_reversal_candidates'] and not s['new_degenerate'] for x in report['sexes'].values() for s in x['factorial']+x['heldout_native']), 'New lattice orientation/area defect'
print('C continuous joint lattice diagnostic generated; TECH/ART remain OPEN until review',flush=True)
