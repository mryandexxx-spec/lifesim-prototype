"""Fixed-body runtime diagnostic: preserve facial targets, replace body bank with one constant delta."""
import pathlib,sys,json,shutil,copy,itertools,gzip
import numpy as np
from repack import read,decode,write,optimize,sha
R=pathlib.Path('opt-out'); source=pathlib.Path('reviewed/lab'); served=pathlib.Path('served')
states=json.loads((source/'states.json').read_text())
profiles=['grid_mix','grid_full_low_muscle_low_prop','combined']
assert all(s in states for s in profiles)
def append(j,b,x):
    x=np.ascontiguousarray(x,dtype='<f4');b.extend(b'\0'*((-len(b))%4));v=len(j['bufferViews'])
    j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=x.nbytes));b.extend(x.tobytes())
    i=len(j['accessors']);j['accessors'].append(dict(bufferView=v,componentType=5126,count=len(x),type='VEC3',min=x.min(0).tolist(),max=x.max(0).tolist()));return i
def bake(src,dst,weights):
    orig,ob=read(src);j=copy.deepcopy(orig);b=bytearray(ob)
    assert len(j['meshes'])==1 and not j.get('skins') and not j.get('animations')
    m=j['meshes'][0];names=m['extras']['targetNames'];assert len(names)==48 and names[14]=='neck_pos'
    assert set(weights)<=set(names[15:]) and all(0<=w<=1 for w in weights.values()) and sum(weights.values())<=1.00001
    refs=[];err={'POSITION':0.,'NORMAL':0.}
    for p in m['primitives']:
        new={}
        for k in ('POSITION','NORMAL'):
            fields=[(float(w),decode(orig,ob,p['targets'][names.index(n)][k])) for n,w in weights.items() if w]
            shape=decode(orig,ob,p['attributes'][k]).shape
            exact=sum((w*x.astype(np.float64) for w,x in fields),np.zeros(shape,np.float64))
            x=exact.astype('<f4');err[k]=max(err[k],float(np.linalg.norm(exact-x,axis=1).max()))
            new[k]=append(j,b,x)
        p['targets']=p['targets'][:15]+[new]
        refs.extend((p['attributes'],k) for k in p['attributes'])
        refs.append((p,'indices'))
        for t in p['targets']:refs.extend((t,k) for k in t)
    m['extras']['targetNames']=names[:15]+['body_baked'];m['weights']=[0]*15+[1]
    for node in j['nodes']:
        if 'weights' in node:node['weights']=[0]*15+[1]
    used=sorted({o[k] for o,k in refs});mp={i:n for n,i in enumerate(used)}
    for o,k in refs:o[k]=mp[o[k]]
    j['accessors']=[j['accessors'][i] for i in used]
    temp=dst.with_suffix('.tmp.glb');write(temp,j,b);report=optimize(temp,dst);temp.unlink()
    z,zb=read(dst)
    for p,q in zip(orig['meshes'][0]['primitives'],z['meshes'][0]['primitives']):
        for key in p['attributes']:assert decode(orig,ob,p['attributes'][key]).tobytes()==decode(z,zb,q['attributes'][key]).tobytes()
        assert decode(orig,ob,p['indices']).tobytes()==decode(z,zb,q['indices']).tobytes()
        for old,new in zip(p['targets'][:15],q['targets'][:15]):
            for k in old:assert decode(orig,ob,old[k]).tobytes()==decode(z,zb,new[k]).tobytes()
        for k in ('POSITION','NORMAL'):
            actual=decode(z,zb,q['targets'][-1][k]);exact=sum((w*decode(orig,ob,p['targets'][names.index(n)][k]).astype(np.float64) for n,w in weights.items()),np.zeros(actual.shape,np.float64))
            assert np.linalg.norm(actual-exact,axis=1).max()<1e-6
    assert err['POSITION']<1e-6 and err['NORMAL']<1e-6
    report.update({'original_bytes':src.stat().st_size,'original_gzip_bytes':len(gzip.compress(src.read_bytes(),mtime=0)),'original_morph_targets':48,'baked_morph_targets':16,'position_roundoff_m':err['POSITION'],'normal_roundoff':err['NORMAL'],'original_decoded_morph_bytes':17162496})
    return report
report={}
for profile in profiles:
    d=served/('baked-'+profile);d.mkdir(parents=True,exist_ok=True)
    for n in ('index.html','lab.js','interpolate.mjs','playcanvas.min.mjs','states.json','models.json'):
        shutil.copy2(source/n,d/n)
    # The diagnostic page is not a new CAS editor: body fixed, face controls still work.
    lab=(d/'lab.js').read_text()
    assert 'function update(){const w={};' in lab
    lab=lab.replace('function update(){const w={};','function update(){const w={body_baked:1};',1)
    (d/'lab.js').write_text(lab)
    meta=json.loads((d/'models.json').read_text())
    weights={k:float(v) for k,v in states[profile].items() if k!='__scale'}
    assert states[profile].get('__scale',1)==1
    report[profile]={}
    for sex in ('male','female'):
        report[profile][sex]=bake(source/(sex+'-body.glb'),d/(sex+'-body.glb'),weights)
        meta[sex]['targets']=meta[sex]['targets'][:15]+['body_baked']
    (d/'models.json').write_text(json.dumps(meta))
(R/'bake-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2),flush=True)
