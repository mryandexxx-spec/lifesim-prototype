"""D4/R1: bounded calibration of six exact D3 seated endpoints.
Offsets were fit against actual weighted GLB surfaces, not a universal IK solver.
Keep all original geometry, skin, face morphs and clips byte-exact; append candidates."""
import json, pathlib, sys
import numpy as np
from scipy.spatial.transform import Rotation
from contact_audit import PINS, slab
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'cf-body-c-opt'))
from repack import read,decode,write,sha

# [root height m, root forward m, hip/knee/ankle sagittal delta rad].
# Small root-only repair for the three male endpoints; surface-fit joint
# corrections for the three female endpoints where raising alone was insufficient.
DELTAS={
 'female-grid_000.glb':[.0139797978,0,.0349298064,-.0384011189,-.0343711913],
 'female-grid_111.glb':[.00463057049,0,.0219732230,-.0415635271,-.0397422384],
 'female-grid_222.glb':[.00384936960,0,.0227094821,-.0450827505,-.0434393889],
 'male-grid_000.glb':[.00288793,0,0,0,0],
 'male-grid_111.glb':[.00288053,0,0,0,0],
 'male-grid_222.glb':[.00256887,0,0,0,0],
}
root=pathlib.Path('d3');out=pathlib.Path('d4-candidates');out.mkdir(exist_ok=True)
report=json.loads((root/'seat-report.json').read_text())
assert set(DELTAS)==set(PINS)==set(report)
manifest={}
for name,pin in sorted(PINS.items()):
    path=root/name;assert sha(path.read_bytes())==pin
    j,original=read(path);b=bytearray(original);skin=j['skins'][0];nodes=skin['joints']
    labels=[j['nodes'][i]['name'] for i in nodes];idx=labels.index
    par={c:i for i,n in enumerate(j['nodes']) for c in n.get('children',[])}
    parents=[nodes.index(par[n]) if par.get(n) in nodes else -1 for n in nodes]
    assert len(nodes)==104 and parents[0]==-1 and all(0<=p<i for i,p in enumerate(parents) if i)
    p=j['meshes'][0]['primitives'][0]
    v=decode(j,b,p['attributes']['POSITION']).astype(float)+decode(j,b,p['targets'][-1]['POSITION'])
    wi=decode(j,b,p['attributes']['JOINTS_0']);ww=decode(j,b,p['attributes']['WEIGHTS_0'])
    faces=decode(j,b,p['indices']).reshape(-1,3);hv=np.column_stack([v,np.ones(len(v))])
    inv=decode(j,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1).astype(float)
    rest=np.linalg.inv(inv)
    ls=np.array([x if i==0 else np.linalg.inv(rest[parents[i]])@x for i,x in enumerate(rest)])
    def world(l):
        w=[]
        for i,x in enumerate(l):w.append(x if i==0 else w[parents[i]]@x)
        return np.array(w)
    def surface(l):
        t=world(l)@inv
        return (np.einsum('nkij,nj->nki',t[wi],hv)[:,:,:3]*ww[:,:,None]).sum(1)
    def endpoint(clip):
        a=next(a for a in j['animations'] if a['name']==clip);l=ls.copy()
        for c in a['channels']:
            i=nodes.index(c['target']['node']);x=decode(j,b,a['samplers'][c['sampler']]['output'])[-1]
            if c['target']['path']=='translation':l[i,:3,3]=x
            elif c['target']['path']=='rotation':l[i,:3,:3]=Rotation.from_quat(x).as_matrix()
            else:raise ValueError(c)
        return l
    def acc(x,typ):
        a=np.ascontiguousarray(x,dtype='<f4');b.extend(b'\0'*((-len(b))%4));k=len(j['bufferViews'])
        j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=a.nbytes));b.extend(a.tobytes())
        i=len(j['accessors']);d=dict(bufferView=k,componentType=5126,count=len(a),type=typ)
        if typ=='SCALAR':d.update(min=[float(a.min())],max=[float(a.max())])
        j['accessors'].append(d);return i
    def add(clip,l):
        time=acc([0.,1.],'SCALAR');ch=[];sam=[]
        for i,(a,c) in enumerate(zip(ls,l)):
            for prop,aa,cc,typ in [('translation',a[:3,3],c[:3,3],'VEC3'),('rotation',Rotation.from_matrix(a[:3,:3]).as_quat(),Rotation.from_matrix(c[:3,:3]).as_quat(),'VEC4')]:
                if prop=='rotation' and np.dot(aa,cc)<0:cc=-cc
                if np.linalg.norm(aa-cc)<1e-7:continue
                k=acc(np.stack([aa,cc]),typ);ch.append({'sampler':len(sam),'target':{'node':nodes[i],'path':prop}})
                sam.append({'input':time,'output':k,'interpolation':'LINEAR'})
        j['animations'].append({'name':clip,'channels':ch,'samplers':sam})
    x=np.array(DELTAS[name]);assert np.max(abs(x[:2]))<.035 and np.max(abs(x[2:]))<.15
    fx=report[name]['fixture'];floor=fx['floor_m'];top=floor+fx['height_m'];cz=fx['center_z'];hw=fx['width_m']/2;hd=fx['depth_m']/2
    near=v[:,1]<floor+.018;groups=[]
    for side in (v[:,0]<0,v[:,0]>0):
        ids=np.flatnonzero(near&side);assert len(ids)>12
        a,c=np.quantile(v[ids,2],[.3,.7]);groups.extend([ids[v[ids,2]<=a],ids[v[ids,2]>=c]])
    row={'source_sha256':pin,'deltas':x.tolist(),'poses':{}}
    for old,new in [('seat_contact_candidate','seat_contact_refined'),('seat_hands','seat_hands_refined')]:
        l=endpoint(old);l[0,:3,3]+=np.array([0,x[0],x[1]])
        for label,angle in zip(('upperleg01','lowerleg01','foot'),x[2:]):
            rot=Rotation.from_rotvec([angle,0,0]).as_matrix()
            for side in ('L','R'):
                i=idx(label+'.'+side);rr=rest[i,:3,:3];l[i,:3,:3]=l[i,:3,:3]@rr.T@rot@rr
        q=surface(l);world_q=q[:,[0,2,1]].copy();world_q[:,1]*=-1
        seat=slab(world_q,faces,[-hw,-cz-hd,top-.04],[hw,-cz+hd,top])
        gaps=[float(q[g,1].min()-floor) for g in groups]
        inside=(abs(q[:,0])<=hw)&(abs(q[:,2]-cz)<=hd)&(q[:,1]>=top)&(q[:,1]<top+.05)
        assert inside.any()
        gap=float(q[inside,1].min()-top);fmin=float(q[:,1].min()-floor)
        row['poses'][new]={'floor_min_m':fmin,'sole_group_minima_m':gaps,'seat':seat,'seat_gap_m':gap}
        assert fmin>=-.001 and all(abs(z)<=.01 for z in gaps) and seat['intersecting_triangles']==0 and gap<=.01,(name,new,row)
        add(new,l)
    dst=out/name;write(dst,j,b);newj,newb=read(dst);oldj,oldb=read(path)
    assert newb[:len(oldb)]==oldb
    for key in ('meshes','nodes','scenes','materials','textures','skins','images'):
        assert oldj.get(key)==newj.get(key),key
    assert newj['animations'][:len(oldj['animations'])]==oldj['animations']
    assert newj['accessors'][:len(oldj['accessors'])]==oldj['accessors']
    row['candidate_sha256']=sha(dst.read_bytes());manifest[name]=row
    print(name,json.dumps(row),flush=True)
(out/'refinement.json').write_text(json.dumps(manifest,indent=2))
