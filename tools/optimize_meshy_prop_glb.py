#!/usr/bin/env python3
"""Optimize static Meshy GLBs for LifeSim without touching triangle geometry.

Conservatively re-encodes embedded color textures at <=1024px. Verifies all
non-image bufferViews bit-for-bit and leaves accessors, indices and transforms
unchanged. Unknown compressed/model extensions are kept as opaque data.
"""
import argparse
import copy
import hashlib
import io
import json
import struct
from pathlib import Path
from PIL import Image

def chunks(path):
    raw=Path(path).read_bytes()
    if len(raw)<20: raise ValueError('Too short for GLB')
    magic,version,total=struct.unpack_from('<4sII',raw,0)
    if magic!=b'glTF' or version!=2 or total!=len(raw):
        raise ValueError('Bad GLB header')
    p=12; j=None; binary=None
    while p<len(raw):
        if p+8>len(raw):raise ValueError('Truncated chunk header')
        size,tag=struct.unpack_from('<I4s',raw,p);p+=8
        if p+size>len(raw):raise ValueError('Truncated GLB chunk')
        value=raw[p:p+size];p+=size
        if tag==b'JSON':j=json.loads(value)
        elif tag==b'BIN\x00':binary=value
        else:raise ValueError('Unknown GLB chunk '+repr(tag))
    if j is None or binary is None:raise ValueError('Expected JSON and BIN')
    if len(j.get('buffers',[]))!=1:raise ValueError('Only single-buffer GLB is supported')
    return j,binary

def read_view(blob,v):
    p=v.get('byteOffset',0); n=v['byteLength']
    if p<0 or n<0 or p+n>len(blob):raise ValueError('Invalid bufferView range')
    if v.get('buffer',0)!=0:raise ValueError('External buffer')
    return bytes(blob[p:p+n])

def optimize(inp,out,limit=1024,quality=82):
    original,blob=chunks(inp)
    info=copy.deepcopy(original)
    image_views={}
    for i,img in enumerate(info.get('images',[])):
        if 'bufferView' in img:
            image_views.setdefault(img['bufferView'],[]).append(i)
        elif 'uri' in img:
            raise ValueError('External/data-uri image unsupported; inspect source')
    rebuilt=bytearray()
    changed=[]; preserved=0
    old_views=original.get('bufferViews',[])
    for i,v in enumerate(info.get('bufferViews',[])):
        b=read_view(blob,old_views[i])
        if i in image_views:
            source_img=Image.open(io.BytesIO(b));source_img.load()
            mime=original['images'][image_views[i][0]].get('mimeType','')
            resized=source_img.copy()
            resized.thumbnail((limit,limit),Image.Resampling.LANCZOS)
            has_alpha=('A' in resized.getbands() and resized.getchannel('A').getextrema()[0]<255)
            bf=io.BytesIO()
            if has_alpha:
                resized.save(bf,format='PNG',optimize=True)
                proposed_mime='image/png'
            else:
                resized.convert('RGB').save(bf,format='JPEG',quality=quality,
                                            optimize=True,subsampling=0)
                proposed_mime='image/jpeg'
            nb=bf.getvalue()
            if len(nb)<len(b):
                b=nb
                for idx in image_views[i]:
                    info['images'][idx]['mimeType']=proposed_mime
                changed.append({'image_view':i,'old_bytes':old_views[i]['byteLength'],
                               'new_bytes':len(nb),'from_mime':mime,'to_mime':proposed_mime})
            else:
                preserved+=1
        while len(rebuilt)%4:rebuilt.append(0)
        v['byteOffset']=len(rebuilt)
        v['byteLength']=len(b)
        rebuilt+=b
    while len(rebuilt)%4:rebuilt.append(0)
    info['buffers'][0]['byteLength']=len(rebuilt)
    info['extras']={**info.get('extras',{}),'LifeSimTextureOptimization':'static-2026-11-20-v1'}
    js=json.dumps(info,separators=(',',':'),ensure_ascii=False).encode()
    js+=b' '*((-len(js))%4)
    length=12+8+len(js)+8+len(rebuilt)
    encoded=(struct.pack('<4sII',b'glTF',2,length)+
             struct.pack('<I4s',len(js),b'JSON')+js+
             struct.pack('<I4s',len(rebuilt),b'BIN\x00')+rebuilt)
    Path(out).parent.mkdir(parents=True,exist_ok=True)
    Path(out).write_bytes(encoded)
    got,bin2=chunks(out)
    assert len(got['bufferViews'])==len(old_views)
    assert got.get('accessors')==original.get('accessors')
    assert got.get('meshes')==original.get('meshes')
    assert got.get('nodes')==original.get('nodes')
    assert got.get('skins')==original.get('skins')
    assert got.get('animations')==original.get('animations')
    for i,v in enumerate(old_views):
        b1=read_view(blob,v);b2=read_view(bin2,got['bufferViews'][i])
        if i not in image_views and b1!=b2:raise ValueError('Geometry/buffer mismatch')
    for i,img in enumerate(got.get('images',[])):
        v=got['bufferViews'][img['bufferView']]
        Image.open(io.BytesIO(read_view(bin2,v))).verify()
    n0=Path(inp).stat().st_size;n=Path(out).stat().st_size
    return {'source_bytes':n0,'bytes':n,'saved_percent':round((1-n/n0)*100,2),
            'sha256':hashlib.sha256(encoded).hexdigest(),'texture_changes':changed,
            'images_kept':preserved,'mesh_count':len(got.get('meshes',[])),
            'triangle_faces':sum(p['indices'] in range(len(got.get('accessors',[]))) and got['accessors'][p['indices']]['count']//3 or 0 for m in got.get('meshes',[]) for p in m.get('primitives',[]) if 'indices' in p)}

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('input');p.add_argument('output')
    p.add_argument('--texture-size',type=int,default=1024)
    a=p.parse_args()
    print(json.dumps(optimize(a.input,a.output,a.texture_size),ensure_ascii=False,indent=2))
