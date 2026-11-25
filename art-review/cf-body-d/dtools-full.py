"""D-TOOLS/2: held-out actual accepted morphology and full 104-joint skin."""
import sys, json, pathlib, copy
import numpy as np
from scipy.spatial.transform import Rotation, Slerp
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'cf-body-c-opt'))
from repack import read,decode,write,sha
ROOT=pathlib.Path('full-input'); ROOT.mkdir(exist_ok=True)
OUT=pathlib.Path('full-out'); OUT.mkdir(exist_ok=True)
CONTRACT=pathlib.Path('d1/rig-contract.json')
assert sha(CONTRACT.read_bytes())=='07b5bd794cb601615f3c23df23692f88bccbbcbf27eae0f13bc8cf1d695e0da6'
contract=json.loads(CONTRACT.read_text());names=contract['labels'];parents=contract['parents']
assert len(names)==104 and len(set(names))==104
PINS={'male':'b54b0ad210d30ea27a93bdc90abe0656d1cc1af683322001a94a8ce6cfa22966','female':'5c275fe82f3bae7174f91bb27cdc47efbb3507b84731c5fac2b6df02c0b7b214'}
CPINS={'male':'fe0963efd05debe860e79d6b889d59a1f8ec1444616c572638f47dbca9dd83ab','female':'94bb796fbe3e4baf16633d24fbeb0a84d7d50db6a2cfb90af9e8e9e9bdb6e430'}
GRIDS={'male':'grid_021','female':'grid_201'}
CLIPS=['reach_target','seat_hands_refined']
def acc(j,b,x,typ):
    a=np.ascontiguousarray(x,dtype='<f4');b.extend(b'\0'*((-len(b))%4));k=len(j['bufferViews'])
    j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=a.nbytes));b.extend(a.tobytes())
    i=len(j['accessors']);d=dict(bufferView=k,componentType=5126,count=len(a),type=typ)
    if typ in ('SCALAR','VEC3'):d.update(min=np.atleast_1d(a.min(0)).tolist(),max=np.atleast_1d(a.max(0)).tolist())
    j['accessors'].append(d);return i
def local(w):return np.array([a if p<0 else np.linalg.inv(w[p])@a for a,p in zip(w,parents)])
def world(l):
    w=[]
    for a,p in zip(l,parents):w.append(a if p<0 else w[p]@a)
    return np.array(w)
def transforms(m):return [{'p':a[:3,3].tolist(),'r':Rotation.from_matrix(a[:3,:3]).as_quat().tolist()} for a in m]
def node_local(j,nodes):
    l=np.repeat(np.eye(4)[None],len(nodes),axis=0)
    for i,k in enumerate(nodes):
        n=j['nodes'][k];assert 'matrix' not in n and np.allclose(n.get('scale',[1,1,1]),1)
        l[i,:3,3]=n.get('translation',[0,0,0]);l[i,:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()
    return l
def source_frames(j,b,nodes,rest,clip):
    a=next(a for a in j['animations'] if a['name']==clip);t=np.linspace(0,1,17);ls=np.repeat(rest[None],len(t),axis=0)
    for ch in a['channels']:
        i=nodes.index(ch['target']['node']);s=a['samplers'][ch['sampler']]
        assert s.get('interpolation','LINEAR')=='LINEAR'
        x=decode(j,b,s['input']).ravel();y=decode(j,b,s['output']);ts=x[0]+t*(x[-1]-x[0])
        if ch['target']['path']=='rotation':ls[:,i,:3,:3]=Slerp(x,Rotation.from_quat(y))(ts).as_matrix()
        else:
            assert ch['target']['path']=='translation'
            ls[:,i,:3,3]=np.stack([np.interp(ts,x,y[:,k]) for k in range(3)],axis=1)
    assert np.max(abs(ls[0]-rest))<1e-5
    return [transforms(l) for l in ls]
def prepare():
    data={'labels':names,'parents':parents,'sources':{},'targets':[]}
    for sex in ('female','male'):
        path=pathlib.Path('r1/d4-candidates')/(sex+'-grid_111.glb')
        assert sha(path.read_bytes())==PINS[sex]
        j0,b0=read(path);nodes=j0['skins'][0]['joints'];assert [j0['nodes'][i]['name'] for i in nodes]==names
        l0=node_local(j0,nodes);w0=world(l0)
        inv=decode(j0,b0,j0['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
        assert np.max(abs(w0@inv-np.eye(4)))<1e-5
        data['sources'][sex]={'rest':transforms(l0),'clips':{c:source_frames(j0,b0,nodes,l0,c) for c in CLIPS}}
        cpath=pathlib.Path('reviewed/lab')/(sex+'-body.glb');assert sha(cpath.read_bytes())==CPINS[sex]
        cj,cb=read(cpath);cm=cj['meshes'][0];grid=GRIDS[sex];ci=cm['extras']['targetNames'].index(grid)
        assert len(cm['primitives'])==len(j0['meshes'][0]['primitives'])
        for profile in contract['sexes'][sex]['samples']:
            if profile['grid']!=grid:continue
            scale=profile['parameters']['height_scale'];key=sex+'-'+grid+'-'+str(round(scale*100))
            j=copy.deepcopy(j0);b=bytearray(b0);m=j['meshes'][0];assert m['extras']['targetNames'][-1]=='body_baked'
            p0=m['primitives'][0];raw=decode(j0,b0,p0['attributes']['POSITION'])
            delta=decode(cj,cb,cm['primitives'][0]['targets'][ci]['POSITION'])
            assert np.array_equal(raw,decode(cj,cb,cm['primitives'][0]['attributes']['POSITION']))
            floor=float((raw+delta)[:,1].min());ground=np.array([0.,floor,0.])
            for i,(p,cp) in enumerate(zip(m['primitives'],cm['primitives'])):
                raw=decode(j0,b0,p['attributes']['POSITION']);cr=decode(cj,cb,cp['attributes']['POSITION'])
                assert np.array_equal(raw,cr) and np.array_equal(decode(j0,b0,p['indices']),decode(cj,cb,cp['indices']))
                p['attributes']['POSITION']=acc(j,b,(raw-ground)*scale+ground,'VEC3')
                for k,t in enumerate(p['targets'][:-1]):
                    assert np.array_equal(decode(j0,b0,t['POSITION']),decode(cj,cb,cp['targets'][k]['POSITION']))
                    t['POSITION']=acc(j,b,decode(j0,b0,t['POSITION'])*scale,'VEC3')
                p['targets'][-1]={'POSITION':acc(j,b,decode(cj,cb,cp['targets'][ci]['POSITION'])*scale,'VEC3'),'NORMAL':acc(j,b,decode(cj,cb,cp['targets'][ci]['NORMAL']),'VEC3')}
                assert np.max(abs(decode(j,b,p['attributes']['POSITION'])+decode(j,b,p['targets'][-1]['POSITION'])-((raw+decode(cj,cb,cp['targets'][ci]['POSITION'])-ground)*scale+ground)))<1e-6
            w=np.array(profile['rest_world']);l=local(w)
            assert np.max(abs(world(l)-w))<1e-7
            for idx,t in zip(nodes,transforms(l)):
                j['nodes'][idx]['translation']=t['p'];j['nodes'][idx]['rotation']=t['r']
            j['skins'][0]['inverseBindMatrices']=acc(j,b,np.linalg.inv(w).transpose(0,2,1).reshape(-1,16),'MAT4')
            assert np.max(abs(w@decode(j,b,j['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)-np.eye(4)))<1e-5
            j['animations']=[];dst=ROOT/(key+'.glb');write(dst,j,b)
            data['targets'].append({'key':key,'sex':sex,'grid':grid,'scale':scale,'floor':floor,'rest':transforms(l),'sha256':sha(dst.read_bytes())})
    assert len(data['targets'])==6
    (ROOT/'poses.json').write_text(json.dumps(data,separators=(',',':')))
def bake():
    data=json.loads((ROOT/'poses.json').read_text());results=json.loads((OUT/'solved.json').read_text())
    assert set(results)=={p['key'] for p in data['targets']}
    manifest={}
    for p in data['targets']:
        src=ROOT/(p['key']+'.glb');assert sha(src.read_bytes())==p['sha256'];j,ob=read(src);b=bytearray(ob)
        nodes=j['skins'][0]['joints'];time=acc(j,b,np.linspace(0,1,17),'SCALAR')
        for clip,frames in results[p['key']]['clips'].items():
            assert len(frames)==17
            channels=[];samplers=[]
            for i,node in enumerate(nodes):
                for prop,key,typ in [('rotation','r','VEC4'),('translation','p','VEC3')]:
                    a=np.array([f[i][key] for f in frames])
                    assert np.isfinite(a).all()
                    if prop=='rotation':
                        assert np.max(abs(np.linalg.norm(a,axis=1)-1))<1e-5
                        for k in range(1,len(a)):
                            if np.dot(a[k],a[k-1])<0:a[k]*=-1
                    if np.max(abs(a-a[0]))<1e-7:continue
                    out=acc(j,b,a,typ);channels.append({'sampler':len(samplers),'target':{'node':node,'path':prop}})
                    samplers.append({'input':time,'output':out,'interpolation':'LINEAR'})
            assert channels
            j['animations'].append({'name':clip,'channels':channels,'samplers':samplers})
        dst=OUT/(p['key']+'.glb');write(dst,j,b)
        z,zb=read(dst);a,ab=read(src)
        assert zb[:len(ab)]==ab
        for k in ('meshes','skins','nodes','materials','textures','images'):assert z.get(k)==a.get(k)
        manifest[p['key']]={**p,'candidate_sha256':sha(dst.read_bytes()),'metrics':results[p['key']]['metrics']}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
if __name__=='__main__':
    {'prepare':prepare,'bake':bake}[sys.argv[1]]()
