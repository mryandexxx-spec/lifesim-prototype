"""D1 adaptive semantic skin/bind experiment. Not contact or artistic certification."""
import sys,pathlib,itertools,json
import numpy as np
from scipy.spatial.transform import Rotation
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'cf-body-c-opt'))
from repack import read,decode,write,sha
from native_source import model,native,orient,accepted_fields
from bake_source import bake
out=pathlib.Path('d-out');out.mkdir(exist_ok=True)
labels=list(model.bone_labels);parents=list(map(int,model.bone_parents))
assert len(labels)==len(parents) and all(0<=p<i for i,p in enumerate(parents) if i)
print('native hierarchy',list(zip(labels,parents)),flush=True)
wi=model.vertex_bone_indices.detach().cpu().numpy().astype(int)
ww=model.vertex_bone_weights.detach().cpu().numpy().astype(float)
assert wi.shape==ww.shape and wi.shape[0]==13718 and np.isfinite(ww).all() and (ww>=0).all()
assert np.max(abs(ww.sum(1)-1))<1e-4
dense=np.zeros((len(wi),len(labels)))
for i,(inds,weights) in enumerate(zip(wi,ww)):
    for k,w in zip(inds,weights):
        if w>0:
            assert 0<=k<len(labels)
            dense[i,k]+=w
order=np.argsort(-dense,axis=1,kind='stable')[:,:4]
weights=np.take_along_axis(dense,order,axis=1)
lost=1-weights.sum(1);assert weights.sum(1).min()>0
weights/=weights.sum(1,keepdims=True)
def local(m):
    return np.array([x if i==0 else np.linalg.inv(m[parents[i]])@x for i,x in enumerate(m)])
def world(m):
    result=[]
    for i,x in enumerate(m):result.append(x if i==0 else result[parents[i]]@x)
    return np.array(result)
def fit(src,dst,m):
    result=m.copy(); quality=[]
    for i,q in enumerate(m[:,:3,3]):
        adjacent=[k for k,p in enumerate(parents) if k and p==i]
        if i:adjacent.append(parents[i])
        # Native skin semantics restrict the support; do not mix opposite limbs.
        support=dense[:,i]+.35*dense[:,adjacent].sum(1)
        dist=np.linalg.norm(src-q,axis=1)
        eligible=np.flatnonzero(support>.025)
        if len(eligible)<8:
            # Unweighted helper: inherit its parent correction; root uses global offset.
            shift=(result[parents[i],:3,3]-m[parents[i],:3,3]) if i else np.median(dst-src,axis=0)
            quality.append({'bone':labels[i],'method':'inherited','support':len(eligible)})
        else:
            idx=eligible[np.argsort(dist[eligible],kind='stable')[:96]]
            radius=max(float(dist[idx[-1]]),.015)
            w=support[idx]*np.exp(-2*(dist[idx]/radius)**2)
            delta=dst[idx]-src[idx];train=np.arange(len(idx))%5!=0
            estimate=np.average(delta[train],axis=0,weights=w[train])
            residual=np.linalg.norm(delta-estimate,axis=1)
            shift=np.average(delta,axis=0,weights=w/np.maximum(1,residual/.025))
            hold=np.linalg.norm(delta[~train]-estimate,axis=1)
            quality.append({'bone':labels[i],'method':'semantic','support':len(idx),'heldout_rms_m':float(np.sqrt(np.mean(hold**2))),'shift_m':float(np.linalg.norm(shift))})
        result[i,:3,3]+=shift
    assert np.isfinite(result).all()
    assert np.max(abs(world(local(result))-result))<1e-8
    assert np.max(abs(np.linalg.det(result[:,:3,:3])-1))<1e-3
    assert np.max(abs(result@np.linalg.inv(result)-np.eye(4)))<1e-8
    return result,quality
def lbs(v,rest,posed):
    h=np.column_stack([v,np.ones(len(v))]); t=posed@np.linalg.inv(rest)
    return (np.einsum('nkij,nj->nki',t[order],h)[:,:,:3]*weights[:,:,None]).sum(1)
def acc(j,b,x,typ,ct=5126):
    a=np.ascontiguousarray(x,dtype='<f4' if ct==5126 else '<u2')
    b.extend(b'\0'*((-len(b))%4));view=len(j['bufferViews'])
    j['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':a.nbytes});b.extend(a.tobytes())
    i=len(j['accessors']);entry={'bufferView':view,'componentType':ct,'count':len(a),'type':typ}
    if typ=='SCALAR':entry.update(min=[float(a.min())],max=[float(a.max())])
    j['accessors'].append(entry);return i
def bone(stems,side):
    matches=[i for i,n in enumerate(labels) if any(n.lower() in (s+'.'+side.lower(),s+'01.'+side.lower(),s+'_01.'+side.lower()) for s in stems)]
    assert len(matches)==1,(stems,side,matches,labels)
    return matches[0]
def poses(rest,target):
    arms=[bone(('upperarm',),s) for s in ('L','R')]
    elbows=[bone(('lowerarm','forearm'),s) for s in ('L','R')]
    wrists=[bone(('wrist','hand'),s) for s in ('L','R')]
    hips=[bone(('upperleg','thigh'),s) for s in ('L','R')]
    knees=[bone(('lowerleg','shin','calf'),s) for s in ('L','R')]
    ankles=[bone(('foot','ankle'),s) for s in ('L','R')]
    footmask=dense[:,ankles].sum(1)>.4;assert footmask.sum()>20
    forward=np.array([0.,0.,1. if target[footmask,2].mean()>rest[ankles,2,3].mean() else -1.])
    specs={'elbow':[(e,w,forward,100) for e,w in zip(elbows,wrists)],
           'reach':[(a,e,forward,65) for a,e in zip(arms,elbows)],
           'seat_probe':[(h,k,forward,80) for h,k in zip(hips,knees)]+[(k,a,-forward,85) for k,a in zip(knees,ankles)]}
    result={}
    for name,items in specs.items():
        l=local(rest)
        for i,c,d,deg in items:
            axis=np.cross(rest[c,:3,3]-rest[i,:3,3],d)
            assert np.linalg.norm(axis)>1e-5,(labels[i],labels[c])
            r=rest[i,:3,:3]; rot=Rotation.from_rotvec(axis/np.linalg.norm(axis)*np.deg2rad(deg)).as_matrix()
            l[i,:3,:3]=l[i,:3,:3]@r.T@rot@r
        result[name]=l
    return result
def export(sex,raw,rest,grid,bank):
    temp=out/(sex+'-'+grid+'.tmp.glb')
    bake(pathlib.Path('reviewed/lab')/(sex+'-body.glb'),temp,{} if grid=='grid_111' else {grid:1.})
    j,b=read(temp);b=bytearray(b);m=j['meshes'][0]
    nodes=[i for i,n in enumerate(j['nodes']) if n.get('mesh')==0];assert len(nodes)==1
    node=nodes[0];buckets={}
    for i,x in enumerate(raw):buckets.setdefault(x.tobytes(),[]).append(i)
    for pr in m['primitives']:
        v=decode(j,b,pr['attributes']['POSITION']);ix=[]
        for pos in v:
            ids=buckets[pos.tobytes()]
            assert np.max(abs(dense[ids]-dense[ids[0]]))<1e-4,('ambiguous skin correspondence',ids)
            ix.append(ids[0])
        ix=np.array(ix);pr['attributes']['JOINTS_0']=acc(j,b,order[ix],'VEC4',5123)
        pr['attributes']['WEIGHTS_0']=acc(j,b,weights[ix],'VEC4')
    ls=local(rest);start=len(j['nodes'])
    for i,l in enumerate(ls):
        n={'name':labels[i],'translation':l[:3,3].tolist(),'rotation':Rotation.from_matrix(l[:3,:3]).as_quat().tolist()}
        children=[start+k for k,p in enumerate(parents) if k and p==i]
        if children:n['children']=children
        j['nodes'].append(n)
    j['nodes'][node].setdefault('children',[]).append(start);j['nodes'][node]['skin']=0
    bind=acc(j,b,np.linalg.inv(rest).transpose(0,2,1).reshape(-1,16),'MAT4')
    j['skins']=[{'joints':list(range(start,start+len(labels))),'skeleton':start,'inverseBindMatrices':bind}]
    j['animations']=[];time=acc(j,b,[0.,1.],'SCALAR')
    for name,pl in bank.items():
        samplers=[];channels=[]
        for i,(a,c) in enumerate(zip(ls,pl)):
            if np.max(abs(a-c))<1e-8:continue
            q=Rotation.from_matrix(np.stack([a[:3,:3],c[:3,:3]])).as_quat()
            if np.dot(q[0],q[1])<0:q[1]*=-1
            v=acc(j,b,q,'VEC4');channels.append({'sampler':len(samplers),'target':{'node':start+i,'path':'rotation'}})
            samplers.append({'input':time,'output':v,'interpolation':'LINEAR'})
        assert channels
        j['animations'].append({'name':name,'samplers':samplers,'channels':channels})
    dst=out/(sex+'-'+grid+'.glb');write(dst,j,b)
    z,zb=read(dst)
    inv=decode(z,zb,bind).reshape(-1,4,4).transpose(0,2,1)
    assert np.max(abs(rest@inv-np.eye(4)))<1e-5
    assert z['meshes'][0]['extras']['targetNames'][-1]=='body_baked'
    for pr in z['meshes'][0]['primitives']:
        assert np.max(abs(decode(z,zb,pr['attributes']['WEIGHTS_0']).sum(1)-1))<1e-6
    temp.unlink()
    return {'glb':dst.name,'sha256':sha(dst.read_bytes()),'bytes':dst.stat().st_size}
report={'classification':'D1 diagnostic; not certified contacts or production','labels':labels,'parents':parents,'top4_discard_max':float(lost.max()),'top4_discard_p95':float(np.percentile(lost,95)),'sexes':{}}
for sex in ('male','female'):
    j,b=read(pathlib.Path('pinned-vis')/(sex+'-candidate.glb'));pr=j['meshes'][0]['primitives'][0]
    raw=decode(j,b,pr['attributes']['POSITION']);assert raw.shape==(13718,3)
    face={n:decode(j,b,t['POSITION']) for n,t in zip(j['meshes'][0]['extras']['targetNames'],pr['targets'])}
    p={k:.5 for k in model.phenotype_labels};p['gender']=1. if sex=='male' else 0.
    neutral,_=native(p);err,T=orient(p,neutral,face);offset=np.median(raw-neutral@T,axis=0)
    fields=accepted_fields(sex,raw);rows=[];exports=[]
    for i,k,l in itertools.product(range(3),repeat=3):
        grid=f'grid_{i}{k}{l}'
        params={'weight':(.15,.5,.85)[i],'muscle':(.10,.5,.90)[k],'proportions':(.12,.5,.88)[l]}
        v,o=native({**p,**params});m=o['bone_poses'].detach().cpu().numpy().reshape(-1,4,4).astype(float)
        m[:,:3,:3]=T.T@m[:,:3,:3]@T;m[:,:3,3]=m[:,:3,3]@T+offset
        target=raw if grid=='grid_111' else raw+fields[grid]
        rest,quality=fit(v@T+offset,target,m)
        err0=float(np.linalg.norm(lbs(target,rest,rest)-target,axis=1).max());assert err0<1e-6
        bank=poses(rest,target);floor=float(target[:,1].min());diagnostics={}
        for name,ls in bank.items():
            posed=lbs(target,rest,world(ls));assert np.isfinite(posed).all()
            movement=float(np.linalg.norm(posed-target,axis=1).max());assert movement>.03
            diagnostics[name]={'max_displacement_m':movement,'floor_min_delta_m':float(posed[:,1].min()-floor)}
        for scale in (.9,1.,1.1):
            scaled=rest.copy();ground=np.array([0,floor,0]);scaled[:,:3,3]=(rest[:,:3,3]-ground)*scale+ground
            rows.append({'grid':grid,'parameters':{**params,'height_scale':scale},'height_m':float(np.ptp(target[:,1])*scale),'rest_world':scaled.tolist(),'inverse_bind':np.linalg.inv(scaled).tolist(),'neutral_replay_max_m':err0*scale,'pose_diagnostics_unscaled':diagnostics,'semantic_fit':quality})
        if grid in ('grid_000','grid_111','grid_222'):exports.append(export(sex,raw,rest,grid,bank))
    assert len(rows)==81
    report['sexes'][sex]={'samples':rows,'exports':exports,'orientation_error':err}
    print(sex,'81 bind profiles and 3 GLBs',flush=True)
(out/'rig-contract.json').write_text(json.dumps(report,separators=(',',':')))
print('D1 diagnostic only; contact IK, art and browser gates remain open',flush=True)
