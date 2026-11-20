#!/usr/bin/env python3
"""Build V3 immutable actual-GLB bounds; never guess scale or mutate mesh payloads."""
import json,struct,hashlib
from pathlib import Path

ROOT=Path('assets/furniture/meshy-room-v3')
CONFIG={
 'bed.canopy':('bed',2.28,0),
 'music.starter':('music',1.23,0),
 'plant.amber':('plant',1.42,0),
 'sofa.classic':('sofa',1.10,180),
 'table.round':('table',.72,0),
 'bookcase.open':('bookcase',2.08,0),
 'chair.cross':('chair',1.08,180),
 'stove.copper':('stove',1.04,180),
 'prep.stone':('prep',.97,180),
 'sink.steel':('sink',1.05,180),
 'easel.starter':('easel',1.88,0),
 'fixture.counter':('counter',.97,180),
 'wardrobe.open':('wardrobe',2.20,180),
}
def parse_glb(path):
 data=path.read_bytes()
 if data[:4]!=b'glTF' or int.from_bytes(data[4:8],'little')!=2 or int.from_bytes(data[8:12],'little')!=len(data):
  raise ValueError(path)
 n=int.from_bytes(data[12:16],'little')
 return data,json.loads(data[20:20+n])

manifest=json.loads((ROOT/'manifest.json').read_text())
assert len(manifest['records'])==len(CONFIG)==13
items=[]
for record in manifest['records']:
 sku=record['sku']; path=ROOT/(sku+'.glb')
 assert sku in CONFIG
 data,gltf=parse_glb(path)
 assert hashlib.sha256(data).hexdigest()==record['sha256']
 mn=[float('inf')]*3;mx=[float('-inf')]*3
 meshes=gltf.get('meshes',[])
 for mesh in meshes:
  for prim in mesh['primitives']:
   accessor=gltf['accessors'][prim['attributes']['POSITION']]
   if 'min' not in accessor or 'max' not in accessor:raise ValueError('Missing exact position bounds: '+sku)
   mn=[min(a,b) for a,b in zip(mn,accessor['min'])]
   mx=[max(a,b) for a,b in zip(mx,accessor['max'])]
 assert all(a<b and abs(a)<10 and abs(b)<10 for a,b in zip(mn,mx)),sku
 prefab,height,yaw=CONFIG[sku]
 entry={'sku':sku,'prefabId':prefab,'height':height,'rotationY':yaw,
        'orientation':'upright','mount':'floor','bounds':{'min':mn,'max':mx},
        'bytes':record['bytes'],'sha256':record['sha256']}
 items.append(entry)
js='/** Generated from the exact 13 optimized V3 GLB POSITION bounds. Visual metadata only. */\n'
js+='export const MESHY_ROOM_V3_ENTRIES=Object.freeze('+json.dumps(items,ensure_ascii=False,separators=(',',':'))+'.map(x=>Object.freeze(x)));\n'
Path('src/meshy-room-v3-data.js').write_text(js)
print('Verified v3 GLB model bounds for '+str(len(items))+' items')
for item in items:print(item['sku'],item['bounds'],item['height'])
