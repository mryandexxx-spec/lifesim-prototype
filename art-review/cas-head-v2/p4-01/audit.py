import bpy,numpy as np,struct,json,itertools,time,sys
from pathlib import Path
from mathutils.bvhtree import BVHTree
P=Path(sys.argv[2]);P.mkdir(parents=True,exist_ok=True)
raw=Path(sys.argv[1]).read_bytes()
n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);b=raw[28+n:]
def arr(i):
 x=j['accessors'][i];v=j['bufferViews'][x['bufferView']];d=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[x['componentType']]);k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[x['type']]
 return np.ndarray((x['count'],k),dtype=d,buffer=b,offset=v.get('byteOffset',0)+x.get('byteOffset',0),strides=(v.get('byteStride',d.itemsize*k),d.itemsize)).copy().astype(float) if x['componentType']==5126 else np.ndarray((x['count'],k),dtype=d,buffer=b,offset=v.get('byteOffset',0)+x.get('byteOffset',0),strides=(v.get('byteStride',d.itemsize*k),d.itemsize)).copy()
head,eye,brow=[j['meshes'][i]['primitives'][0] for i in (1,3,4)]
h=arr(head['attributes']['POSITION']);ht=arr(head['indices']).reshape(-1,3)
e=arr(eye['attributes']['POSITION']);et=arr(eye['indices']).reshape(-1,3)
br=arr(brow['attributes']['POSITION']);bt=arr(brow['indices']).reshape(-1,3)
d=np.array([arr(t['POSITION']) for t in head['targets']])
def ramp(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def deform(v):
 x,y,z=v.T;dx=np.abs(x-.001)-.0301;dy=y-1.51635
 w=(1-ramp(.010,.023,abs(dx)))*(1-ramp(.007,.013,abs(dy)))*ramp(.026,.043,z)
 upper=(1-ramp(1.5200,1.5230,y)); strength=np.where(dy>0,.17*upper,.25)
 out=v.copy();out[:,1]+=strength*dy*w;return out
hc=deform(h);dc=np.array([deform(h+ds*(.6 if k==0 else 1))-hc for k,ds in enumerate(d)])
# identify duplicate seam vertices to exclude shared topology intersections
_,weld=np.unique(np.round(h,6),axis=0,return_inverse=True);tris=weld[ht]
region=np.flatnonzero(np.any((np.abs(h[ht][:,:,0])>.01)&(np.abs(h[ht][:,:,0])<.058)&(h[ht][:,:,1]>1.494)&(h[ht][:,:,1]<1.54)&(h[ht][:,:,2]>.026),axis=1))
region_set=set(region.tolist())
def bvh(v,t):return BVHTree.FromPolygons(v.tolist(),t.tolist(),all_triangles=True,epsilon=0.)
eye_bvh=bvh(e,et);brow_bvh=bvh(br,bt)
def pairs(v):
 tree=bvh(v,ht)
 selfpairs={(a,b) for a,b in tree.overlap(tree) if a<b and (a in region_set or b in region_set) and not set(tris[a]).intersection(tris[b])}
 eye_pairs=set(tree.overlap(eye_bvh));brow_pairs=set(tree.overlap(brow_bvh))
 return selfpairs,eye_pairs,brow_pairs
recs=[];worst=0
for w in itertools.product((0,.5,1),repeat=5):
 w=np.array(w);p=h+np.tensordot(w,d,axes=1);q=hc+np.tensordot(w,dc,axes=1)
 a=pairs(p);c=pairs(q);r={'w':w.tolist(),'self_before':len(a[0]),'self_after':len(c[0]),'self_new':len(c[0]-a[0]),'eye_before':len(a[1]),'eye_after':len(c[1]),'brow_before':len(a[2]),'brow_after':len(c[2]),'brow_new':len(c[2]-a[2])};recs.append(r)
 if r['self_new']>worst:worst=r['self_new'];print('worst new self',r,flush=True)
 if len(recs)%27==0:print('progress',len(recs),flush=True)
(P/'intersection-audit.json').write_text(json.dumps(recs,indent=2))
assert max(r['self_new'] for r in recs)==0 and max(r['brow_after'] for r in recs)==0
print('SUMMARY',json.dumps({k:[min(r[k] for r in recs),max(r[k] for r in recs)] for k in recs[0] if k!='w'}))

