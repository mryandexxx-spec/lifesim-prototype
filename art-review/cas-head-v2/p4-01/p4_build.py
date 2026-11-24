"""P4-01 Asya-only: deterministic exact-rig GLB assembly and Blender source verification."""
import hashlib, itertools, json, struct, sys
from pathlib import Path
import numpy as np
PIN='26a65437db84024a6bc0a2cb33fddd9935c60f1f88a3a55c76a53c63b3e0de71'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def ramp(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def deform(v):
 x,y,z=v.T;dx=np.abs(x-.001)-.0301;dy=y-1.51635
 w=(1-ramp(.010,.023,abs(dx)))*(1-ramp(.007,.013,abs(dy)))*ramp(.026,.043,z)
 strength=np.where(dy>0,.17*(1-ramp(1.5200,1.5230,y)),.25)
 out=v.copy();out[:,1]+=strength*dy*w;return out
def eye_color(v,c):
 x,y,z=v.T;side=x>.001;cx=np.where(side,.031098,-.029098);cy=np.where(side,1.51685,1.51585)
 dx=x-cx;dy=(y-cy)*(.0154/.0138);r=np.hypot(dx,dy);angle=np.arctan2(dy,dx)
 def mix(a,b,w):return np.asarray(a)*(1-w[:,None])+np.asarray(b)*w[:,None]
 iris=np.array([.155,.072,.030])[None,:]*(.88+.12*np.cos(19*angle)+.055*np.cos(31*angle))[:,None]
 out=mix([.008,.006,.005],iris,ramp(.0026,.0035,r))
 out=mix(out,[.039,.025,.018],ramp(.0053,.0061,r))
 out=mix(out,[.76,.72,.66],ramp(.0062,.0076,r))
 out=mix(out,[.53,.44,.38],ramp(.0115,.0154,r))
 # Subtle warm occlusion along the upper sphere, not a painted eyelash.
 shade=1-.16*ramp(.001,.008,dy)
 out*=shade[:,None]
 return mix(c,out,ramp(.043,.046,z))
def normals(v,n):
 J=np.broadcast_to(np.eye(3),(len(v),3,3)).copy();eps=1e-5
 for k in range(3):
  d=np.zeros(3);d[k]=eps;J[:,1,k]=(deform(v+d)[:,1]-deform(v-d)[:,1])/(2*eps)
 out=np.linalg.solve(J.transpose(0,2,1),n[:,:,None])[:,:,0];out/=np.maximum(np.linalg.norm(out,axis=1,keepdims=True),1e-12)
 unchanged=np.max(abs(J-np.eye(3)),axis=(1,2))<1e-10;out[unchanged]=n[unchanged]
 return out
def load(path):
 raw=Path(path).read_bytes();assert hashlib.sha256(raw).hexdigest()==PIN
 assert raw[:4]==b'glTF'
 n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);b=bytearray(raw[28+n:])
 return j,b
def view(j,b,i):
 x=j['accessors'][i];v=j['bufferViews'][x['bufferView']];d=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[x['componentType']]);k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[x['type']]
 return np.ndarray((x['count'],k),dtype=d,buffer=b,offset=v.get('byteOffset',0)+x.get('byteOffset',0),strides=(v.get('byteStride',d.itemsize*k),d.itemsize))
def arrays(j,b):
 head,eye=[j['meshes'][i]['primitives'][0] for i in (1,3)]
 h=view(j,b,head['attributes']['POSITION']).astype(float);n=view(j,b,head['attributes']['NORMAL']).astype(float)
 d=[view(j,b,t['POSITION']).astype(float) for t in head['targets']]
 dn=[view(j,b,t['NORMAL']).astype(float) for t in head['targets']]
 e=view(j,b,eye['attributes']['POSITION']).astype(float);c=view(j,b,eye['attributes']['COLOR_0']).astype(float)
 hc=deform(h);nc=normals(h,n);dc=[];dnc=[]
 for k,(p,q) in enumerate(zip(d,dn)):
  scale=.6 if k==0 else 1.
  dc.append(deform(h+p*scale)-hc)
  dnc.append(normals(h+p*scale,n+q*scale)-nc)
 return head,eye,h,n,d,dn,e,c,hc,nc,dc,dnc,eye_color(e,c)
def build(src,dst):
 j,b=load(src);original=bytes(b);original_doc=json.loads(json.dumps(j));head,eye,h,n,d,dn,e,c,hc,nc,dc,dnc,cc=arrays(j,b)
 ht=view(j,b,head['indices']).reshape(-1,3)
 minratio=1.;flips=0
 for w in itertools.product((0,.5,1),repeat=5):
  p=(h+sum(a*v for a,v in zip(w,d)))[ht];q=(hc+sum(a*v for a,v in zip(w,dc)))[ht]
  aa=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);bb=np.cross(q[:,1]-q[:,0],q[:,2]-q[:,0]);ar=np.linalg.norm(aa,axis=1);valid=ar>1e-9
  flips+=int((np.sum(aa*bb,axis=1)[valid]<0).sum());minratio=min(minratio,float((np.linalg.norm(bb,axis=1)[valid]/ar[valid]).min()))
 assert flips==0,(flips,minratio)
 allowed=set()
 def write(i,v):
  a=j['accessors'][i];allowed.add(a['bufferView']);t=view(j,b,i);t[:]=v
  if 'min' in a:a['min']=t.min(0).astype(float).tolist()
  if 'max' in a:a['max']=t.max(0).astype(float).tolist()
 write(head['attributes']['POSITION'],hc);write(head['attributes']['NORMAL'],nc);write(eye['attributes']['COLOR_0'],cc)
 for k,t in enumerate(head['targets']):write(t['POSITION'],dc[k]);write(t['NORMAL'],dnc[k])
 for i,v in enumerate(j['bufferViews']):
  s=v.get('byteOffset',0);l=v['byteLength']
  if i not in allowed:assert b[s:s+l]==original[s:s+l],i
 assert all(j[k]==original_doc[k] for k in j if k!='accessors')
 assert len(j['animations'])==13 and len(j['skins'][0]['joints'])==66
 jb=json.dumps(j,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*(-len(jb)%4);b+=b'\0'*(-len(b)%4)
 out=struct.pack('<4sII',b'glTF',2,12+8+len(jb)+8+len(b))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(b),b'BIN\0')+b
 Path(dst).write_bytes(out)
 return {'source_sha256':PIN,'candidate_sha256':sha(dst),'combinations':243,'relative_triangle_flips':flips,'min_area_ratio':minratio,'max_neutral_displacement_mm':float(np.linalg.norm(hc-h,axis=1).max()*1000),'unchanged_buffer_views':len(j['bufferViews'])-len(allowed),'allowed_buffer_views':len(allowed),'joints':66,'clips':13,'morphs':5}
if __name__=='__main__':
 print(json.dumps(build(*sys.argv[1:3]),indent=2))

