"""Expand legal glTF sparse morph accessors to dense byte streams for strict mobile gate."""
import json,struct,sys
from pathlib import Path
CS={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
N={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def expand(path):
 data=Path(path).read_bytes();magic,ver,length=struct.unpack_from('<III',data)
 assert magic==0x46546c67 and ver==2
 pos=12;js=None;bin=None
 while pos<len(data):
  size,typ=struct.unpack_from('<I4s',data,pos);start=pos+8;payload=data[start:start+size]
  if typ==b'JSON':js=json.loads(payload)
  if typ==b'BIN\x00':bin=bytearray(payload)
  pos=start+size
 assert js and bin is not None
 def values(view,offset,count,width):
  v=js['bufferViews'][view]
  start=v.get('byteOffset',0)+offset
  return bytes(bin[start:start+count*width])
 n=0
 for a in js.get('accessors',[]):
  sp=a.get('sparse')
  if not sp:continue
  width=CS[a['componentType']]*N[a['type']]
  count=a['count']
  dense=bytearray(count*width)
  if 'bufferView' in a:
   v=js['bufferViews'][a['bufferView']]
   src=v.get('byteOffset',0)+a.get('byteOffset',0)
   stride=v.get('byteStride',width)
   for i in range(count):dense[i*width:(i+1)*width]=bin[src+i*stride:src+i*stride+width]
  si=sp['indices']; sv=sp['values']
  fmt={5121:'B',5123:'H',5125:'I'}[si['componentType']]
  iw=CS[si['componentType']]
  ids=values(si['bufferView'],si.get('byteOffset',0),sp['count'],iw)
  vals=values(sv['bufferView'],sv.get('byteOffset',0),sp['count'],width)
  for i in range(sp['count']):
   j=struct.unpack_from('<'+fmt,ids,i*iw)[0]
   assert j<count
   dense[j*width:(j+1)*width]=vals[i*width:(i+1)*width]
  while len(bin)%4:bin.append(0)
  off=len(bin);bin.extend(dense)
  js['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(dense)})
  a['bufferView']=len(js['bufferViews'])-1;a['byteOffset']=0;a.pop('sparse')
  n+=1
 while len(bin)%4:bin.append(0)
 js['buffers'][0]['byteLength']=len(bin)
 jtxt=json.dumps(js,ensure_ascii=False,separators=(',',':')).encode('utf8')
 while len(jtxt)%4:jtxt+=b' '
 result=(struct.pack('<III',0x46546c67,2,12+8+len(jtxt)+8+len(bin))
  +struct.pack('<I4s',len(jtxt),b'JSON')+jtxt
  +struct.pack('<I4s',len(bin),b'BIN\x00')+bin)
 output=Path(path).with_name(Path(path).stem.replace('-wip','-dense')+'.glb')
 output.write_bytes(result)
 print(output,n,len(result))
if __name__=='__main__':
 for p in sys.argv[1:]:expand(p)
