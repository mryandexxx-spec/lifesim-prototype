"""CF-BODY/C native phenotype differential probe; accepted skin stays immutable.
Diagnostic candidate only. D rig, production contacts, owner review and device QA are separate.
"""
import bpy, torch, anny, numpy as np, pathlib, json, struct, hashlib, itertools, shutil, math
from scipy.spatial import cKDTree
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=pathlib.Path('body-c-out'); L=R/'lab'; F=L/'comparison'; F.mkdir(parents=True,exist_ok=True)
SRC=pathlib.Path('pinned-skin'); RAW=pathlib.Path('pinned-vis')
PINS={'male':('36abba2916a5938ecc32a94fb2582101875fe9183ec6a764fc9eeb3df89931c5','4ce29a6ffce21817f92bb2c7df8c27afe630d0dd88e373a05e2ceca591fdcbb8'),'female':('d7c697af0cfab84f536f94e0b51e4385ffd653f0587245fad61c2a962b4f40c7','f4973254fb39f2ff962f429725e66c17a478d7e4110ed556679babb400c7d85e')}
AXES={'height':'height','fullness':'weight','muscle':'muscle','proportions':'proportions'}
# Moderate initial bracket, not a production range or clinical measurement.
AMPL={'height':.25,'fullness':.25,'muscle':.25,'proportions':.25}
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
    tv=v[t];ys=tv[:,:,1]-y;chosen=tv[(ys.min(1)<0)&(ys.max(1)>0)]
    edges={}
    for f in chosen:
        hits=[]
        for i,k in ((0,1),(1,2),(2,0)):
            a,b=f[i],f[k]
            if (a[1]<y)!=(b[1]<y):
                q=a+(b-a)*((y-a[1])/(b[1]-a[1]));hits.append(tuple(np.round(q[[0,2]],6)))
        if len(hits)==2 and hits[0]!=hits[1]:
            a,b=hits;edges.setdefault(a,set()).add(b);edges.setdefault(b,set()).add(a)
    pending=set(edges);loops=[]
    while pending:
        q=pending.pop();stack=[q];group={q}
        while stack:
            for a in edges[stack.pop()]:
                if a not in group:group.add(a);pending.discard(a);stack.append(a)
        if not all(len(edges[a])==2 for a in group):continue
        x=np.array(list(group));width=float(np.ptp(x[:,0]))
        if x[:,0].min()<0<x[:,0].max():
            circ=sum(np.linalg.norm(np.array(a)-np.array(b)) for a in group for b in edges[a])/2
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
    y=raw[:,1];a=smooth((y-(cut-.09))/.09)[:,None]
    trans=np.median(d[y>=cut],axis=0)
    if axis!='height':trans[1]=0
    out=d*(1-a)+trans*a
    # Floor anchor correction fades before the neck, so face stays rigid.
    ground=(raw+out)[:,1].min()-y.min()
    out[:,1]-=ground*(1-a[:,0])
    assert np.max(np.abs(out[y>=cut]-trans))<1e-6
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
    assert len(objs)>=1 and all(len(o.data.shape_keys.key_blocks)==24 for o in objs)
    scene=bpy.context.scene;center=Vector((0,0,.94))
    scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.28,.28,1)
    for offset,power in [((-2,-4,1.8),1),((3,-3,.8),.45),((2,3,2),.3)]:
        bpy.ops.object.light_add(type='SUN',location=center+Vector(offset));l=bpy.context.object;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler();l.data.energy=power
    bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.20
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=384;scene.render.resolution_y=384;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
    for label,weights in states.items():
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
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str((R/f'{sex}-body-c.blend').resolve()))
states={'neutral':{},**{k:{k:1} for k in BODY},'all-neg':{a+'_neg':1 for a in AXES},'all-pos':{a+'_pos':1 for a in AXES},'mixed':{'height_pos':1,'fullness_neg':1,'muscle_pos':1,'proportions_neg':1},'face-mixed':{'height_pos':1,'fullness_pos':1,'muscle_neg':1,'proportions_pos':1,'smile':1,'jaw_pos':1}}
report={'classification':'diagnostic only; TECH/ART open','axes':AXES,'amplitudes':AMPL,'sexes':{},'limitations':['Neutral source is authored; phenotype donor baseline is a differential reference, not a recovered authored parameter vector.','Nonadjacent BVH candidates are not certified anatomical contacts.','D adaptive skeleton/bind matrices and pose contacts not in scope.','No physical Safari or performance claims.']}
def save(): (R/'body-report.json').write_text(json.dumps(report,indent=2,allow_nan=False))
models=json.loads((SRC/'models.json').read_text())
for sex,(pin,rpin) in PINS.items():
    src=SRC/(sex+'-mobile.glb');rp=RAW/(sex+'-candidate.glb');assert sha(src.read_bytes())==pin and sha(rp.read_bytes())==rpin
    j,b=read(src);r,rb=read(rp);rm=r['meshes'][0];rawp=rm['primitives'][0]
    raw=acc(r,rb,rawp['attributes']['POSITION']);tri=acc(r,rb,rawp['indices']).reshape(-1,3).astype(np.int32)
    assert raw.shape==(13718,3) and tri.shape==(27420,3)
    assert sha(tri.astype('<i8').tobytes())=='72a1d21fc87e04b194835769265008a4bcac5fdb5a1b1be4846d850960c5bca1'
    assert rm['extras']['targetNames']==NAMES
    face={n:acc(r,rb,t['POSITION']) for n,t in zip(NAMES,rawp['targets'])}
    support=np.maximum.reduce([np.linalg.norm(face[n],axis=1) for n in NAMES[:13]])>1e-5
    # Native face fields can have small remote support; use the anatomical
    # head band, and report remote support separately instead of freezing torso.
    cut=float(raw[:,1].max()-.265)
    print(sex,'bounds',raw.min(0).tolist(),raw.max(0).tolist(),'face support min',float(raw[support,1].min()),'head cut',cut,flush=True)
    assert np.any(support & (raw[:,1]>=cut))
    assert raw[:,1].max()-.45<cut<raw[:,1].max()-.16,(sex,cut)
    profile={k:.5 for k in model.phenotype_labels};profile['gender']=1. if sex=='male' else 0.
    T,e,donor=orient(profile,face)
    # Existing native index proof and exact accepted face vector correspondence.
    fields={};native_report={}
    for a,key in AXES.items():
        for s,side in [(-1,'neg'),(1,'pos')]:
            pp={**profile,key:profile[key]+s*AMPL[a]};v,o=native(pp);d=(v-donor)@T
            k=a+'_'+side;fields[k]=rigid_head(raw,d,cut,a)
            native_report[k]={'phenotype':pp[key],'native_max_mm':float(np.linalg.norm(d,axis=1).max()*1000),'candidate_max_mm':float(np.linalg.norm(fields[k],axis=1).max()*1000),'head_translation':fields[k][raw[:,1]>=cut].mean(0).tolist(),'native_output_shapes':{k:list(q.shape) for k,q in o.items() if hasattr(q,'shape')}}
            assert native_report[k]['candidate_max_mm']>2,(sex,k)
    m=j['meshes'][0];assert m['extras']['targetNames']==NAMES
    n0=normals(raw,tri);nds={k:normals(raw+d,tri)-n0 for k,d in fields.items()}
    maps=[];old=[]
    for p in m['primitives']:
        pos=acc(j,b,p['attributes']['POSITION']);mp=map_positions(pos,raw,fields);maps.append(mp)
        assert np.array_equal(pos,raw[mp])
        for name,t in zip(NAMES,p['targets']):
            assert np.array_equal(acc(j,b,t['POSITION']),face[name][mp]),(sex,name)
        old.append({'attributes':{k:acc(j,b,i) for k,i in p['attributes'].items()},'indices':acc(j,b,p['indices']),'targets':[{k:acc(j,b,i) for k,i in t.items()} for t in p['targets']]})
        for k in BODY:p['targets'].append({'POSITION':append(j,b,fields[k][mp]),'NORMAL':append(j,b,nds[k][mp])})
    m['extras']['targetNames']=NAMES+BODY;m['weights']=[0]*23
    for node in j['nodes']:
        if 'weights' in node:node['weights']=[0]*23
    out=L/(sex+'-body.glb');write(out,j,b)
    z,zb=read(out);zp=z['meshes'][0]['primitives'];assert len(zp)==len(old)
    for p,o,mp in zip(zp,old,maps):
        assert np.array_equal(acc(z,zb,p['indices']),o['indices'])
        for k,i in p['attributes'].items():assert np.array_equal(acc(z,zb,i),o['attributes'][k]),k
        for t,ot in zip(p['targets'][:15],o['targets']):
            for k,i in t.items():assert np.array_equal(acc(z,zb,i),ot[k]),k
        for k,t in zip(BODY,p['targets'][15:]):assert np.array_equal(acc(z,zb,t['POSITION']),fields[k][mp])
    j0,b0=read(src)
    assert z['images']==j0['images'] and z['materials']==j0['materials'] and z['textures']==j0['textures']
    for im in z['images']:
        vv=z['bufferViews'][im['bufferView']];i=vv.get('byteOffset',0);assert zb[i:i+vv['byteLength']]==b0[i:i+vv['byteLength']]
    c0=cross(raw,tri);a0=np.linalg.norm(c0,axis=1);valid=a0>2e-10
    baseline_pairs=contact_pairs(raw,tri)
    samples=[];rng=np.random.default_rng(643)
    vectors=[*itertools.product((-1.,0.,1.),repeat=4),*map(tuple,rng.uniform(-1,1,(12,4)))]
    for k,vals in enumerate(vectors):
        weights={a+('_pos' if s>0 else '_neg'):abs(s) for a,s in zip(AXES,vals) if s}
        v=raw.copy()
        for a,w in weights.items():v+=fields[a]*w
        assert np.isfinite(v).all()
        c=cross(v,tri);aa=np.linalg.norm(c,axis=1);ratio=aa[valid]/a0[valid]
        deg=int((valid&(aa<2e-10)).sum());flip=int((valid&(np.sum(c*c0,axis=1)<0)).sum())
        # Rigid local face coordinates under all body combinations.
        hd=(v-raw)[raw[:,1]>=cut];head_error=float(np.linalg.norm(hd-hd.mean(0),axis=1).max())
        assert head_error<2e-6,(sex,vals,head_error)
        pairs=contact_pairs(v,tri)
        mm=measures(v,tri)
        samples.append({'parameters':dict(zip(AXES,vals)),'measurements':mm,'head_local_error_m':head_error,'degenerate_new':deg,'normal_reversal_candidates':flip,'surface_area_ratio_p01':float(np.quantile(ratio,.01)),'surface_area_ratio_p99':float(np.quantile(ratio,.99)),'surface_area_ratio_min':float(ratio.min()),'surface_area_ratio_max':float(ratio.max()),'new_nonadjacent_bvh_candidates':len(pairs-baseline_pairs),'new_pair_examples':sorted(pairs-baseline_pairs)[:20]})
        if k%20==0:print(sex,k,mm,deg,flip,flush=True)
    er={'source_sha':pin,'raw_sha':rpin,'glb_sha':sha(out.read_bytes()),'source_bytes':src.stat().st_size,'glb_bytes':out.stat().st_size,'exact_existing_attributes_targets_textures':True,'head_cut_m':cut,'native_face_mapping_error':e,'native_transform':T.tolist(),'native':native_report,'baseline_nonadjacent_bvh_candidates':len(baseline_pairs),'samples':samples,'factorial_count':81,'random_count':12}
    report['sexes'][sex]=er;save()
    # Reject degenerate results, but retain diagnostic evidence of contacts and
    # orientation candidates for ART/TECH review. Do not silently publish.
    assert not any(s['degenerate_new'] for s in samples),(sex,'new degenerate geometry')
    neutral=samples[40]['measurements'];height_neg=samples[13]['measurements'];height_pos=samples[67]['measurements']
    assert height_pos['height']-height_neg['height']>.035,(sex,height_neg,height_pos)
    models[sex]['targets']=NAMES+BODY
    render(sex,out,states,cut)
    er['blender_reimport']=True;save()
for n in ('playcanvas.min.mjs','NOTICE.txt','anny-README.md','anny-LICENSE','mpfb-LICENSE.md'):
    shutil.copy2(SRC/n,L/n)
for n in ('index.html','lab.js'):shutil.copy2(pathlib.Path(__file__).parent/n,L/n)
(L/'models.json').write_text(json.dumps(models,indent=2))
(L/'states.json').write_text(json.dumps(states,indent=2))
save()
print('Generated 162 factorial + 24 seeded mixed samples; inspect report and actual images before acceptance',flush=True)
