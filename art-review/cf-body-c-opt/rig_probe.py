"""Native rest joint feasibility only; does not construct a production rig."""
import pathlib,json,itertools,hashlib
import numpy as np
import torch,anny
from repack import read,decode
R=pathlib.Path('rig-out');R.mkdir(exist_ok=True)
model=anny.Anny(topology='anny',rig='anny',local_changes='default',facial_actions='all').to(device='cpu',dtype=torch.float32)
pose=torch.eye(4)[None,None].repeat(1,model.bone_count,1,1)
labels=list(model.bone_labels)
assert len(labels)==model.bone_count and len(set(labels))==len(labels)
def native(p,changes=None):
    with torch.no_grad():o=model(pose_parameters=pose,phenotype_kwargs=p,local_changes_kwargs=changes or {},facial_actions={})
    v=o['vertices'].squeeze(0).detach().cpu().numpy()
    assert v.shape==(13718,3) and np.isfinite(v).all()
    return v,o
def matrices(o,profile):
    # Prefer explicit rest transforms. If only pose transforms exist, require
    # verified identity-pose rest vertex equality before treating as rest.
    rv=o['rest_vertices'].squeeze(0).detach().cpu().numpy()
    v=o['vertices'].squeeze(0).detach().cpu().numpy()
    assert rv.shape==v.shape and np.isfinite(rv).all()
    gap=float(np.linalg.norm(rv-v,axis=1).max())
    with torch.no_grad():
        replay=model(pose_parameters=o['bone_poses'].clone(),pose_parameterization='world',phenotype_kwargs=profile,local_changes_kwargs={},facial_actions={})
    err=float(np.linalg.norm(replay['vertices'].squeeze(0).detach().cpu().numpy()-v,axis=1).max())
    print('reference/rest gap m',gap,'world replay max m',err,'keys',list(o.keys()),flush=True)
    assert err<1e-5,('world replay mismatch',err)
    with torch.no_grad():
        bind=model(pose_parameters=o['rest_bone_poses'].clone(),pose_parameterization='world',phenotype_kwargs=profile,local_changes_kwargs={},facial_actions={})
    bind_err=float(np.linalg.norm(bind['vertices'].squeeze(0).detach().cpu().numpy()-rv,axis=1).max())
    assert bind_err<1e-5,('bind replay mismatch',bind_err)
    key='bone_poses'
    assert key, list(o.keys())
    m=o[key].detach().cpu().numpy().reshape(-1,4,4).astype(np.float64)
    assert m.shape==(len(labels),4,4) and np.isfinite(m).all()
    assert np.allclose(m[:,3,:],[0,0,0,1],atol=1e-5)
    assert np.max(np.abs(m[:,:3,:3].transpose(0,2,1)@m[:,:3,:3]-np.eye(3)))<1e-3
    assert np.max(np.abs(np.linalg.det(m[:,:3,:3])-1))<1e-3
    assert np.max(np.abs(m@np.linalg.inv(m)-np.eye(4)))<1e-8
    return m,key,{'reference_rest_gap_m':gap,'world_replay_max_m':err,'bind_replay_max_m':bind_err}
FACE={'jaw':['chin-width-incr'],'cheeks':['l-cheek-volume-incr','r-cheek-volume-incr'],'nose':['nose-scale-depth-incr'],'mouth':['mouth-scale-horiz-incr'],'eyes':['l-eye-trans-out','r-eye-trans-out']}
def orient(p,base,face):
    X=[];Y=[]
    for axis,ls in FACE.items():
        for sign,label in [(-1,'neg'),(1,'pos')]:
            amp=.65 if axis=='nose' and sign<0 else 1.
            v,_=native(p,{k:sign*amp for k in ls})
            x=v-base;y=face[axis+'_'+label]
            nx,ny=np.linalg.norm(x,axis=1),np.linalg.norm(y,axis=1)
            if np.linalg.norm(nx)>0 and np.linalg.norm(ny)>0 and np.dot(nx,ny)/(np.linalg.norm(nx)*np.linalg.norm(ny))>.995:X.append(x);Y.append(y)
    assert len(X)>=6
    x,y=np.concatenate(X),np.concatenate(Y);candidates=[]
    for perm in itertools.permutations(range(3)):
        for signs in itertools.product([-1,1],repeat=3):
            T=np.zeros((3,3))
            for k,i in enumerate(perm):T[i,k]=signs[k]
            candidates.append((float(np.linalg.norm(x@T-y)/np.linalg.norm(y)),T))
    e,T=min(candidates,key=lambda a:a[0]);assert e<.12
    return e,T
def accepted_fields(sex,raw):
    path=pathlib.Path('reviewed/lab')/(sex+'-body.glb')
    expected={'male':'fe0963efd05debe860e79d6b889d59a1f8ec1444616c572638f47dbca9dd83ab','female':'94bb796fbe3e4baf16633d24fbeb0a84d7d50db6a2cfb90af9e8e9e9bdb6e430'}[sex]
    assert hashlib.sha256(path.read_bytes()).hexdigest()==expected
    j,b=read(path);m=j['meshes'][0];names=m['extras']['targetNames']
    buckets={}
    for i,x in enumerate(raw):buckets.setdefault(x.tobytes(),[]).append(i)
    fields={k:np.full(raw.shape,np.nan,np.float32) for k in names if k.startswith('grid_')}
    for pr in m['primitives']:
        v=decode(j,b,pr['attributes']['POSITION'])
        for k,field in fields.items():
            d=decode(j,b,pr['targets'][names.index(k)]['POSITION'])
            for pos,delta in zip(v,d):
                for idx in buckets[pos.tobytes()]:
                    if np.isfinite(field[idx]).all():assert np.array_equal(field[idx],delta)
                    field[idx]=delta
    for field in fields.values():assert np.isfinite(field).all(),'unmapped accepted vertices'
    return fields
def local_fit(src,dst,joints,k=96):
    out=[];quality=[]
    for q in joints:
        dist=np.linalg.norm(src-q,axis=1)
        idx=np.argsort(dist,kind='stable')[:k]
        rad=max(float(dist[idx[-1]]),1e-6)
        A=np.column_stack([np.ones(k),(src[idx]-q)/rad])
        y=dst[idx]-src[idx];weights=np.exp(-2*(dist[idx]/rad)**2)
        test=np.arange(k)%5==0
        def fit(mask):
            w=np.sqrt(weights[mask,None])
            return np.linalg.lstsq(A[mask]*w,y[mask]*w,rcond=1e-7)[0]
        coef=fit(~test);err=np.linalg.norm(A[test]@coef-y[test],axis=1)
        full=fit(np.ones(k,dtype=bool));pos=q+full[0];cond=float(np.linalg.cond(A))
        assert np.isfinite(pos).all() and np.isfinite(cond)
        out.append(pos);quality.append({'heldout_rms_m':float(np.sqrt(np.mean(err**2))),'heldout_max_m':float(err.max()),'radius_m':rad,'condition':cond,'shift_m':float(np.linalg.norm(full[0]))})
    return np.array(out),quality
report={'bone_labels':labels,'classification':'native reference pose feasibility; not production rest rig or pose/contact certification','sexes':{}}
for sex in ('male','female'):
    j,b=read(pathlib.Path('pinned-vis')/(sex+'-candidate.glb'));m=j['meshes'][0];pr=m['primitives'][0]
    raw=decode(j,b,pr['attributes']['POSITION']);assert raw.shape==(13718,3)
    face={n:decode(j,b,t['POSITION']) for n,t in zip(m['extras']['targetNames'],pr['targets'])}
    p={k:.5 for k in model.phenotype_labels};p['gender']=1. if sex=='male' else 0.
    base,o=native(p);rest,key,neutral_info=matrices(o,p);e,T=orient(p,base,face)
    offset=np.median(raw-base@T,axis=0)
    residual=np.linalg.norm(raw-(base@T+offset),axis=1)
    # Report native-to-accepted residual rather than assume exact donor anatomy.
    neutral=rest[:,:3,3]@T+offset
    fields=accepted_fields(sex,raw)
    neutral_fit,neutral_quality=local_fit(base@T+offset,raw,neutral)
    rows=[]
    for i,k,l in itertools.product(range(3),repeat=3):
        params={'weight':(.15,.5,.85)[i],'muscle':(.10,.5,.90)[k],'proportions':(.12,.5,.88)[l]}
        v,o=native({**p,**params});mat,used,info=matrices(o,{**p,**params});assert used==key
        joints=mat[:,:3,3]@T+offset
        assert np.isfinite(joints).all()
        keygrid=f'grid_{i}{k}{l}'
        target=raw if keygrid=='grid_111' else raw+fields[keygrid]
        fitted,quality=local_fit(v@T+offset,target,joints)
        alternative,_=local_fit(v@T+offset,target,joints,k=144)
        sensitivity=np.linalg.norm(fitted-alternative,axis=1)
        for scale in (.9,1.,1.1):
            floor=float(raw[:,1].min());ground=np.array([0,floor,0])
            pos=(joints-ground)*scale+ground
            rows.append({'parameters':{**params,'height':scale},'pose_diagnostics':info,'joint_positions_m':pos.tolist(),'adapted_joint_positions_m':((fitted-ground)*scale+ground).tolist(),'local_fit_quality':quality,'neighborhood_sensitivity_max_m':float(sensitivity.max()*scale),'max_joint_delta_m':float(np.linalg.norm(pos-neutral,axis=1).max())})
    assert len(rows)==81
    report['sexes'][sex]={'native_output_keys':list(o.keys()),'reference_matrix_key':key,'neutral_pose_diagnostics':neutral_info,'mapping_error':e,'neutral_alignment_rms_m':float(np.sqrt(np.mean(residual**2))),'neutral_alignment_max_m':float(residual.max()),'samples':rows,'neutral_joints_m':neutral.tolist(),'adapted_neutral_joints_m':neutral_fit.tolist(),'neutral_local_fit_quality':neutral_quality}
    print(sex,'adapted heldout RMS max m',max(q['heldout_rms_m'] for row in rows for q in row['local_fit_quality']),'sensitivity max m',max(row['neighborhood_sensitivity_max_m'] for row in rows),flush=True)
    print(sex,'native joints',len(labels),'rest samples',len(rows),'alignment RMS m',report['sexes'][sex]['neutral_alignment_rms_m'],flush=True)
(R/'native-rest-report.json').write_text(json.dumps(report,indent=2))
print('Native rest feasibility computed. Accepted calibrated mesh/skin binding and pose certification remain open.',flush=True)
