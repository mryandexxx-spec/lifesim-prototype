"""Independent D2 GLB contact correction and evidence; fixed chair, no production retarget."""
import sys,json,pathlib,copy,itertools
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'cf-body-c-opt'))
from repack import read,decode,write,sha
src=pathlib.Path('d1');out=pathlib.Path('d2');out.mkdir(exist_ok=True)
contract=json.loads((src/'rig-contract.json').read_text());labels=contract['labels'];parents=contract['parents']
idx=labels.index
def local(m):return np.array([x if i==0 else np.linalg.inv(m[parents[i]])@x for i,x in enumerate(m)])
def world(l):
    w=[]
    for i,x in enumerate(l):w.append(x if i==0 else w[parents[i]]@x)
    return np.array(w)
def acc(j,b,x,typ):
    a=np.ascontiguousarray(x,dtype='<f4');b.extend(b'\0'*((-len(b))%4));v=len(j['bufferViews'])
    j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=a.nbytes));b.extend(a.tobytes())
    i=len(j['accessors']);d=dict(bufferView=v,componentType=5126,count=len(a),type=typ)
    if typ=='SCALAR':d.update(min=[float(a.min())],max=[float(a.max())])
    j['accessors'].append(d);return i
def solve(path,record):
    j,b=read(path);assert sha(path.read_bytes())==record['sha256']
    p=j['meshes'][0]['primitives'][0];v=decode(j,b,p['attributes']['POSITION']).astype(float)+decode(j,b,p['targets'][-1]['POSITION'])
    wi=decode(j,b,p['attributes']['JOINTS_0']);ww=decode(j,b,p['attributes']['WEIGHTS_0'])
    rest=np.linalg.inv(decode(j,b,j['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float))
    ls=local(rest);floor=v[:,1].min();root=rest[0,:3,3]
    feet=[idx('foot.'+s) for s in ('L','R')];hips=[idx('upperleg01.'+s) for s in ('L','R')];knees=[idx('lowerleg01.'+s) for s in ('L','R')]
    toes=[[i for i,n in enumerate(labels) if n.startswith('toe') and n.endswith('.'+s)] for s in ('L','R')]
    forward=np.sign(np.mean(rest[[idx('toe1-1.L'),idx('toe1-1.R')],2,3]-rest[feet,2,3]))
    assert abs(forward)==1
    def mass(ids):return (ww*np.isin(wi,ids)).sum(1)
    sole=[];foot_all=[]
    for f,t in zip(feet,toes):
        ids=np.flatnonzero(mass([f]+t)>.5);foot_all.append(ids)
        q=ids[v[ids,1]<floor+.018]
        assert len(q)>12
        z=v[q,2]*forward;lo,hi=np.quantile(z,[.3,.7])
        sole.extend([q[z<=lo],q[z>=hi]])
    # Select the rear inferior gluteal surface using the actual neutral mesh, not pelvis joint contact.
    pelvis=mass([idx('pelvis.L'),idx('pelvis.R'),idx('spine05')]+hips)
    region=np.flatnonzero((pelvis>.35)&(v[:,2]*forward<root[2]*forward-.025)&(v[:,1]<root[1]+.025)&(v[:,1]>root[1]-.24))
    assert len(region)>20
    # Fixed chair surface height and depth, centered laterally. Its front edge is a
    # fixed offset from the seat target, not moved to follow individual vertices.
    seat_y=floor+.43;seat_z=root[2]*forward-.035;halfdepth=.21;halfwidth=.26
    sampled=np.unique(np.concatenate(sole+foot_all+[region]));lookup={k:i for i,k in enumerate(sampled)}
    sgroups=[np.array([lookup[k] for k in q]) for q in sole]
    rg=np.array([lookup[k] for k in region])
    h=np.column_stack([v,np.ones(len(v))])
    def evaluate(x,all_vertices=False):
        l=ls.copy();l[0,:3,3]+=np.array([0,x[0],x[1]*forward])
        # World sagittal rotation expressed in each rest-local frame.
        for ids,angle in zip((hips,knees,feet),x[2:]):
            rot=Rotation.from_rotvec([angle*forward,0,0]).as_matrix()
            for i in ids:
                r=rest[i,:3,:3];l[i,:3,:3]=l[i,:3,:3]@r.T@rot@r
        w=world(l);t=w@np.linalg.inv(rest);ii=np.arange(len(v)) if all_vertices else sampled
        posed=(np.einsum('nkij,nj->nki',t[wi[ii]],h[ii])[:,:,:3]*ww[ii,:,None]).sum(1)
        return l,w,posed
    def residual(x):
        l,w,q=evaluate(x)
        foot=[q[g,1].mean()-floor-.007 for g in sgroups]
        minfoot=[min(0,float(q[g,1].min()-floor)) for g in sgroups]
        # Soft minimum over gluteal region; objective is contact of surface, not of the bone.
        butt=q[rg];z=butt[:,2]*forward;inside=(abs(z-seat_z)<halfdepth)&(abs(butt[:,0])<halfwidth)
        # Keep residual dimension constant, use out-of-seat penalty per vertex.
        dy=butt[:,1]-seat_y
        outside=np.maximum(abs(z-seat_z)-halfdepth,0)+np.maximum(abs(butt[:,0])-halfwidth,0)
        contact=float(np.min(dy+3*outside))
        thigh=[(w[k,1,3]-w[h,1,3]) for h,k in zip(hips,knees)]
        return np.array(foot+minfoot+[contact*2,*[a*.5 for a in thigh],(x[1]+.10)*.15,(x[2]-1.35)*.02,(x[3]+1.55)*.02,x[4]*.02])
    # Sign is set from the world anterior direction; positive hip flex rotates down-leg toward posterior,
    # so use negative hip angle in +Z-forward frame (rotation about X).
    # In RH coordinates X rotation sends -Y to -Z; use negative hip, positive knee.
    def objective(u):
        x=np.array([u[0],u[1],-u[2],u[3],u[4]])
        r=residual(x)
        # Replace regularizers with actual sign convention.
        r[-3]=(u[2]-1.35)*.02;r[-2]=(u[3]-1.55)*.02
        return r
    sol=least_squares(objective,[-.34,-.10,1.35,1.55,-.2],bounds=([- .75,-.5,.5,.5,-1.1],[-.05,.4,2.0,2.25,1.1]),max_nfev=150,diff_step=1e-4)
    x=np.array([sol.x[0],sol.x[1],-sol.x[2],sol.x[3],sol.x[4]])
    l,w,q=evaluate(x,True)
    butt=q[region];inside=(abs(butt[:,2]*forward-seat_z)<halfdepth)&(abs(butt[:,0])<halfwidth)
    # Full body penetration into the solid chair box (top 43cm, 4cm thick); keep as evidence, never waive.
    box=(abs(q[:,0])<halfwidth)&(abs(q[:,2]*forward-seat_z)<halfdepth)&(q[:,1]<seat_y)&(q[:,1]>seat_y-.04)
    metrics={'fixture':{'height_m':.43,'center_z':float(seat_z*forward),'width_m':.52,'depth_m':.42,'floor_m':float(floor)},'optimizer_success':bool(sol.success),'root_translation_m':(l[0,:3,3]-ls[0,:3,3]).tolist(),'angles_rad':x[2:].tolist(),'sole_means_m':[float(q[g,1].mean()-floor) for g in sole],'full_floor_min_m':float(q[:,1].min()-floor),'seat_gluteal_min_gap_m':float(butt[inside,1].min()-seat_y) if inside.any() else None,'seat_box_vertex_count':int(box.sum()),'cost':float(sol.cost)}
    # Candidate clip, retain original D1 probes; explicitly label non-certified.
    b=bytearray(b);time=acc(j,b,[0.,1.],'SCALAR');channels=[];samplers=[]
    for i,(a,c) in enumerate(zip(ls,l)):
        if np.max(abs(a[:3,3]-c[:3,3]))>1e-7:
            z=acc(j,b,np.stack([a[:3,3],c[:3,3]]),'VEC3')
            channels.append({'sampler':len(samplers),'target':{'node':j['skins'][0]['joints'][i],'path':'translation'}});samplers.append({'input':time,'output':z,'interpolation':'LINEAR'})
        if np.max(abs(a[:3,:3]-c[:3,:3]))>1e-7:
            quat=Rotation.from_matrix(np.stack([a[:3,:3],c[:3,:3]])).as_quat()
            if np.dot(quat[0],quat[1])<0:quat[1]*=-1
            z=acc(j,b,quat,'VEC4');channels.append({'sampler':len(samplers),'target':{'node':j['skins'][0]['joints'][i],'path':'rotation'}});samplers.append({'input':time,'output':z,'interpolation':'LINEAR'})
    j['animations'].append({'name':'seat_contact_candidate','channels':channels,'samplers':samplers})
    dst=out/path.name;write(dst,j,b);metrics['sha256']=sha(dst.read_bytes())
    print(path.name,json.dumps(metrics),flush=True);return metrics
report={}
for sex,data in contract['sexes'].items():
    for record in data['exports']:
        p=src/record['glb'];report[p.name]=solve(p,record)
(out/'seat-report.json').write_text(json.dumps(report,indent=2))
