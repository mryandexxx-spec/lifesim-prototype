"""D3: semantic arm target IK on verified D2 GLBs; independent surface residuals."""
import pathlib,json,sys
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.optimize import least_squares
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'cf-body-c-opt'))
from repack import read,decode,write,sha
from contact import local,world,acc,idx,labels,parents
# contact.py also regenerates the six exact D2 files from pinned D1 inputs.
root=pathlib.Path('d2')
report={}
for path in sorted(root.glob('*.glb')):
    j,b=read(path);b=bytearray(b);skin=j['skins'][0];p=j['meshes'][0]['primitives'][0]
    rest=np.linalg.inv(decode(j,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float))
    ls=local(rest);v=decode(j,b,p['attributes']['POSITION']).astype(float)+decode(j,b,p['targets'][-1]['POSITION'])
    wi=decode(j,b,p['attributes']['JOINTS_0']);ww=decode(j,b,p['attributes']['WEIGHTS_0'])
    h=np.column_stack([v,np.ones(len(v))]);forward=np.sign(rest[idx('toe1-1.L'),2,3]-rest[idx('foot.L'),2,3])
    def surface(l,ids):
        w=world(l);t=w@np.linalg.inv(rest)
        return (np.einsum('nkij,nj->nki',t[wi[ids]],h[ids])[:,:,:3]*ww[ids,:,None]).sum(1)
    def endpoint(name):
        a=next(a for a in j['animations'] if a['name']==name);l=ls.copy()
        for c in a['channels']:
            i=skin['joints'].index(c['target']['node']);x=decode(j,b,a['samplers'][c['sampler']]['output'])[-1]
            if c['target']['path']=='translation':l[i,:3,3]=x
            else:l[i,:3,:3]=Rotation.from_quat(x).as_matrix()
        return l
    def add(name,l):
        time=acc(j,b,[0.,1.],'SCALAR');ch=[];sam=[]
        for i,(a,c) in enumerate(zip(ls,l)):
            for prop,aa,cc,typ in [('translation',a[:3,3],c[:3,3],'VEC3'),('rotation',Rotation.from_matrix(a[:3,:3]).as_quat(),Rotation.from_matrix(c[:3,:3]).as_quat(),'VEC4')]:
                if np.linalg.norm(aa-cc)<1e-7:continue
                if prop=='rotation' and np.dot(aa,cc)<0:cc=-cc
                k=acc(j,b,np.stack([aa,cc]),typ);ch.append({'sampler':len(sam),'target':{'node':skin['joints'][i],'path':prop}});sam.append({'input':time,'output':k,'interpolation':'LINEAR'})
        j['animations'].append({'name':name,'channels':ch,'samplers':sam})
    results={}
    for mode in ('reach_target','seat_hands'):
        l=ls.copy() if mode=='reach_target' else endpoint('seat_contact_candidate')
        targets=[]
        for side in ('L','R'):
            upper,lower,wrist=[idx(n+'.'+side) for n in ('upperarm01','lowerarm01','wrist')]
            knee=idx('lowerleg01.'+side);hip=idx('upperleg01.'+side)
            w=world(l); shoulder=w[upper,:3,3]; sign=np.sign(shoulder[0]-w[0,0,3])
            # Actual palm skin support; centroid rather than wrist proxy.
            handbones=[i for i,n in enumerate(labels) if n.endswith('.'+side) and (n.startswith('finger') or n.startswith('metacarpal') or n.startswith('wrist'))]
            mass=(ww*np.isin(wi,handbones)).sum(1)
            ids=np.flatnonzero(mass>.8)
            assert len(ids)>50
            # Proximal palm subset, excluding finger tips.
            dist=np.linalg.norm(v[ids]-rest[wrist,:3,3],axis=1)
            ids=ids[(dist>np.quantile(dist,.10))&(dist<np.quantile(dist,.45))]
            if mode=='reach_target':
                target=np.array([w[0,0,3]+sign*.19,shoulder[1]-.20,w[0,2,3]+forward*.42])
                elbow_goal=shoulder+np.array([sign*.12,-.24,forward*.12])
            else:
                target=(w[knee,:3,3]+w[hip,:3,3])*.5+np.array([0,.085,forward*.035])
                elbow_goal=shoulder+np.array([sign*.13,-.28,-forward*.015])
            base=l.copy()
            def apply(x):
                ll=base.copy()
                for i,rot in zip((upper,lower,wrist),x.reshape(3,3)):
                    ll[i,:3,:3]=ll[i,:3,:3]@Rotation.from_rotvec(rot).as_matrix()
                return ll
            def residual(x):
                ll=apply(x);wworld=world(ll);palm=surface(ll,ids).mean(0)
                return np.r_[(palm-target)*5,(wworld[lower,:3,3]-elbow_goal)*.6,x*.035]
            solution=least_squares(residual,np.zeros(9),bounds=(-1.8,1.8),max_nfev=180)
            l=apply(solution.x);err=float(np.linalg.norm(surface(l,ids).mean(0)-target))
            targets.append({'side':side,'target_m':target.tolist(),'palm_residual_m':err,'optimizer_success':bool(solution.success),'palm_vertices':len(ids)})
        # Re-evaluate both independently after solving both arms.
        results[mode]=targets;add(mode,l)
    write(path,j,b);report[path.name]={'poses':results,'sha256':sha(path.read_bytes())}
    print(path.name,json.dumps(results),flush=True)
(root/'arm-contact-report.json').write_text(json.dumps(report,indent=2))
