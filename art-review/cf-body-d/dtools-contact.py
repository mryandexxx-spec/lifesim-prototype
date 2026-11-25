"""D-TOOLS/3 contact-window experiment. Reuse exact D-TOOLS/2 meshes, never change skin."""
import sys,json,pathlib
import numpy as np
from scipy.spatial.transform import Rotation
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'cf-body-c-opt'))
from repack import read,decode,write,sha
I=pathlib.Path('prior-full'); O=pathlib.Path('contact-out'); O.mkdir(exist_ok=True)
manifest=json.loads((I/'manifest.json').read_text())
prior=json.loads((I/'solved.json').read_text())
def acc(j,b,x,typ):
    a=np.ascontiguousarray(x,dtype='<f4');b.extend(b'\0'*((-len(b))%4));k=len(j['bufferViews'])
    j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=a.nbytes));b.extend(a.tobytes())
    i=len(j['accessors']);d=dict(bufferView=k,componentType=5126,count=len(a),type=typ)
    if typ in ('SCALAR','VEC3'):d.update(min=np.atleast_1d(a.min(0)).tolist(),max=np.atleast_1d(a.max(0)).tolist())
    j['accessors'].append(d);return i
def prepare():
    records=[];labels=None;parents=None
    for key,p in sorted(manifest.items()):
        path=I/(key+'.glb');assert sha(path.read_bytes())==p['candidate_sha256']
        j,b=read(path);nodes=j['skins'][0]['joints'];ls=[j['nodes'][i]['name'] for i in nodes]
        par={c:i for i,n in enumerate(j['nodes']) for c in n.get('children',[])}
        ps=[nodes.index(par[n]) if par.get(n) in nodes else -1 for n in nodes]
        assert len(ls)==104 and ps[0]==-1
        if labels is None:labels,parents=ls,ps
        assert ls==labels and ps==parents
        pr=j['meshes'][0]['primitives'][0]
        v=decode(j,b,pr['attributes']['POSITION']).astype(float)+decode(j,b,pr['targets'][-1]['POSITION'])
        wi=decode(j,b,pr['attributes']['JOINTS_0']);ww=decode(j,b,pr['attributes']['WEIGHTS_0'])
        inv=decode(j,b,j['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
        assert np.max(abs(ww.sum(1)-1))<1e-5
        # Precompute bind-local weighted skin positions for real lower body surface.
        ids=np.flatnonzero(v[:,1]<p['rest'][0]['p'][1]+.15)
        h=np.column_stack([v[ids],np.ones(len(ids))])
        local=np.einsum('nkij,nj->nki',inv[wi[ids]],h)[:,:,:3]
        skin={'v':v[ids].tolist(),'wi':wi[ids].tolist(),'ww':ww[ids].tolist(),'local':local.tolist()}
        records.append({'key':key,'rest':p['rest'],'floor':p['floor'],'skin':skin,'source':prior[key]['clips']['base_seat_hands_refined']})
    pathlib.Path('contact-input.json').write_text(json.dumps({'labels':labels,'parents':parents,'targets':records},separators=(',',':')))
def bake():
    solved=json.loads((O/'solved.json').read_text());report={}
    for key,p in sorted(manifest.items()):
        path=I/(key+'.glb');assert sha(path.read_bytes())==p['candidate_sha256']
        j,ob=read(path);b=bytearray(ob);nodes=j['skins'][0]['joints']
        for clip,d in solved[key].items():
            frames=d['frames'];assert len(frames)==33
            time=acc(j,b,np.linspace(0,2,33),'SCALAR');channels=[];samplers=[]
            for i,node in enumerate(nodes):
                for prop,k,typ in [('rotation','r','VEC4'),('translation','p','VEC3')]:
                    a=np.array([f[i][k] for f in frames]);assert np.isfinite(a).all()
                    rest=np.array(p['rest'][i][k])
                    if prop=='rotation':
                        assert np.max(abs(np.linalg.norm(a,axis=1)-1))<1e-5
                        if np.dot(a[0],rest)<0:a[0]*=-1
                        for n in range(1,len(a)):
                            if np.dot(a[n],a[n-1])<0:a[n]*=-1
                    # Constant non-rest values (initial stance offset) must be exported.
                    if np.max(abs(a-rest))<1e-7:continue
                    out=acc(j,b,a,typ);channels.append({'sampler':len(samplers),'target':{'node':node,'path':prop}})
                    samplers.append({'input':time,'output':out,'interpolation':'LINEAR'})
            j['animations'].append({'name':clip,'channels':channels,'samplers':samplers})
        dst=O/(key+'.glb');write(dst,j,b);z,zb=read(dst);a,ab=read(path)
        assert zb[:len(ab)]==ab and z['animations'][:len(a['animations'])]==a['animations']
        for k in ('meshes','skins','nodes','materials','textures','images'):assert z.get(k)==a.get(k)
        report[key]={'floor':p['floor'],'sha256':sha(dst.read_bytes()),'source_sha256':p['candidate_sha256'],'clips':{k:{a:b for a,b in d.items() if a!='frames'} for k,d in solved[key].items()}}
    (O/'manifest.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':{'prepare':prepare,'bake':bake}[sys.argv[1]]()
