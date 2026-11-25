"""Exact GLB repack. No quantization, no changes to decoded morphs or images."""
import copy, gzip, hashlib, json, pathlib, struct, sys
import numpy as np

def sha(b): return hashlib.sha256(b).hexdigest()
def read(path):
    raw=path.read_bytes()
    assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw))
    n,t=struct.unpack_from('<II',raw,12); assert t==0x4e4f534a
    j=json.loads(raw[20:20+n]); m,t=struct.unpack_from('<II',raw,20+n)
    assert t==0x004e4942 and 28+n+m==len(raw)
    assert len(j['buffers'])==1 and 'uri' not in j['buffers'][0]
    return j,raw[28+n:]

def view(j,b,i):
    v=j['bufferViews'][i]; assert v.get('buffer',0)==0
    o=v.get('byteOffset',0); return bytes(b[o:o+v['byteLength']])

def decode(j,b,i):
    a=j['accessors'][i]; d=np.dtype({5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']])
    w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    def arr(s,n,dt,k):
        v=j['bufferViews'][s['bufferView']]
        return np.ndarray((n,k),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+s.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*k),dt.itemsize)).copy()
    x=arr(a,a['count'],d,w) if 'bufferView' in a else np.zeros((a['count'],w),d)
    if 'sparse' in a:
        s=a['sparse'];dt=np.dtype({5121:'u1',5123:'<u2',5125:'<u4'}[s['indices']['componentType']])
        x[arr(s['indices'],s['count'],dt,1).ravel()]=arr(s['values'],s['count'],d,w)
    return x

def references(obj):
    if isinstance(obj,dict):
        for k,v in obj.items():
            if k=='bufferView':
                assert isinstance(v,int)
                yield obj,k
            elif k!='bufferViews': yield from references(v)
    elif isinstance(obj,list):
        for v in obj: yield from references(v)

def write(path,j,b):
    j['buffers'][0]['byteLength']=len(b)
    s=json.dumps(j,separators=(',',':'),ensure_ascii=False).encode();s+=b' '*((-len(s))%4)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(s)+len(b))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(b),0x004e4942)+b)

def optimize(src,dst):
    original,ob=read(src);j=copy.deepcopy(original);b=bytearray(ob);count=0
    def append(data):
        b.extend(b'\0'*((-len(b))%4));i=len(j['bufferViews'])
        j['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':len(data)})
        b.extend(data);return i
    targets={i for m in j['meshes'] for p in m['primitives'] for t in p.get('targets',[]) for i in t.values()}
    # No extensions that encode absolute BIN offsets or alternative compressed buffers.
    assert not any('compression' in e.lower() or 'meshopt' in e.lower() or 'draco' in e.lower() for e in j.get('extensionsUsed',[]))
    for i in sorted(targets):
        a=j['accessors'][i]
        if a['componentType']!=5126 or a['type']!='VEC3' or 'sparse' in a or 'bufferView' not in a: continue
        x=decode(original,ob,i)
        # Bitwise test preserves signed zero, not merely numeric equality.
        idx=np.flatnonzero(np.any(x.view('<u4')!=0,axis=1))
        if not len(idx): idx=np.array([0])
        dtype='<u2' if len(x)<=65536 else '<u4'; ct=5123 if dtype=='<u2' else 5125
        indices=idx.astype(dtype).tobytes();values=x[idx].tobytes()
        v=original['bufferViews'][a['bufferView']]
        if v.get('byteStride',12)!=12 or a.get('byteOffset',0)!=0 or v['byteLength']!=x.nbytes: continue
        # Ensure savings exceed added JSON and alignment overhead.
        if len(indices)+len(values)+256>=x.nbytes: continue
        a.pop('bufferView');a.pop('byteOffset',None)
        a['sparse']={'count':len(idx),'indices':{'bufferView':append(indices),'componentType':ct},'values':{'bufferView':append(values)}}
        count+=1
    refs=list(references(j));used=sorted({o[k] for o,k in refs});views=[];out=bytearray();mapping={};seen={}
    for i in used:
        v=copy.deepcopy(j['bufferViews'][i]);data=view(j,b,i)
        assert 'extensions' not in v
        v.pop('byteOffset',None)
        key=(json.dumps(v,sort_keys=True),sha(data))
        if key in seen: mapping[i]=seen[key];continue
        out.extend(b'\0'*((-len(out))%4));v['byteOffset']=len(out);out.extend(data)
        mapping[i]=seen[key]=len(views);views.append(v)
    for o,k in refs:o[k]=mapping[o[k]]
    j['bufferViews']=views;out.extend(b'\0'*((-len(out))%4));write(dst,j,out)
    z,zb=read(dst)
    assert len(z['accessors'])==len(original['accessors'])
    for i in range(len(z['accessors'])):
        assert decode(original,ob,i).tobytes()==decode(z,zb,i).tobytes(),('accessor',i)
        assert {k:v for k,v in original['accessors'][i].items() if k not in ('bufferView','byteOffset','sparse')}=={k:v for k,v in z['accessors'][i].items() if k not in ('bufferView','byteOffset','sparse')},i
    for key in ('meshes','nodes','scenes','materials','textures','samplers','skins','animations'):
        assert original.get(key)==z.get(key),key
    for a,c in zip(original.get('images',[]),z.get('images',[])):
        assert {k:v for k,v in a.items() if k!='bufferView'}=={k:v for k,v in c.items() if k!='bufferView'}
        if 'bufferView' in a: assert view(original,ob,a['bufferView'])==view(z,zb,c['bufferView'])
    raw=src.read_bytes();packed=dst.read_bytes()
    assert len(packed)<=len(raw),'repack increased size'
    # gzip is measured only, not a change to the runtime or hosting contract.
    return {'source_sha':sha(raw),'candidate_sha':sha(packed),'source_bytes':len(raw),'candidate_bytes':len(packed),'sparse_accessors':count,'accessors_exact':len(z['accessors']),'morph_targets':len(targets),'decoded_morph_bytes':sum(decode(z,zb,i).nbytes for i in targets),'source_gzip_bytes':len(gzip.compress(raw,mtime=0)),'candidate_gzip_bytes':len(gzip.compress(packed,mtime=0)),'rig_present':bool(z.get('skins'))}

if __name__=='__main__':
    root=pathlib.Path(sys.argv[1]);dest=pathlib.Path(sys.argv[2]);dest.mkdir(parents=True,exist_ok=True)
    manifest=(root/'SHA256SUMS.json').read_bytes()
    assert sha(manifest)=='31b3f6e4e5ae9fc0634b67fadf00c7d22a8b593f284daaba952ef090b655dc67'
    pins=json.loads(manifest);assert len(pins)==276
    assert set(pins)=={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p.name!='SHA256SUMS.json'}
    for name,h in pins.items():
        p=root/name;assert p.resolve().is_relative_to(root.resolve()) and not p.is_symlink() and sha(p.read_bytes())==h,name
    report={}
    for sex in ('male','female'):
        name=sex+'-body.glb'
        assert pins[name]=={'male':'fe0963efd05debe860e79d6b889d59a1f8ec1444616c572638f47dbca9dd83ab','female':'94bb796fbe3e4baf16633d24fbeb0a84d7d50db6a2cfb90af9e8e9e9bdb6e430'}[sex]
        report[sex]=optimize(root/name,dest/name)
    (dest.parent/'repack-report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
