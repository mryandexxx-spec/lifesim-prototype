#!/usr/bin/env python3
"""Conservative Meshy humanoid GLB optimizer: no mesh/skin changes, animation key reduction and JPEG texture.

Works offline with Python + NumPy + Pillow.  Does not require Blender.
Rebuilds glTF accessors and bufferViews, preserving original skin and vertex data byte-for-byte.
"""
from __future__ import annotations
import argparse
import copy
import io
import json
import math
import struct
from collections import defaultdict
from hashlib import sha256
from pathlib import Path
import numpy as np
from PIL import Image

DTYPE = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
COMP = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT2':4, 'MAT3':9, 'MAT4':16}
DEFAULT = {'translation':np.array([0,0,0]), 'rotation':np.array([0,0,0,1]),'scale':np.array([1,1,1])}


def load_glb(path):
    data=Path(path).read_bytes()
    magic,version,total=struct.unpack_from('<4sII',data)
    if magic!=b'glTF' or version!=2 or total!=len(data):
        raise ValueError('Not a glTF v2 GLB')
    pos=12
    j=None; b=None
    while pos < len(data):
        length,typ=struct.unpack_from('<I4s',data,pos);pos+=8
        chunk=data[pos:pos+length];pos+=length
        if typ==b'JSON': j=json.loads(chunk)
        elif typ==b'BIN\0': b=chunk
    if j is None or b is None: raise ValueError('Missing JSON/BIN chunk')
    return j,b


def read_accessor(j,b,i):
    a=j['accessors'][i]
    if 'sparse' in a: raise ValueError('Sparse accessors not supported')
    v=j['bufferViews'][a['bufferView']]
    if v.get('byteStride'): raise ValueError('Interleaved accessors not supported in input')
    if v.get('buffer',0)!=0: raise ValueError('External buffers not supported')
    n=COMP[a['type']]
    arr=np.frombuffer(b,dtype=np.dtype(DTYPE[a['componentType']]),count=a['count']*n,offset=v.get('byteOffset',0)+a.get('byteOffset',0))
    return arr.reshape((a['count'],n))


def slerp_many(a,b,ratios):
    """Quaternion glTF LINEAR interpolation, shortest-arc, for a single segment."""
    aa=a.astype(np.float64);bb=b.astype(np.float64)
    aa/=np.linalg.norm(aa);bb/=np.linalg.norm(bb)
    dot=float(np.dot(aa,bb))
    if dot<0: bb=-bb;dot=-dot
    dot=min(max(dot,-1.),1.)
    ratios=np.asarray(ratios,dtype=np.float64)
    if dot>0.9995:
        result=aa[None,:]*(1-ratios[:,None])+bb[None,:]*ratios[:,None]
    else:
        theta=math.acos(dot); s=math.sin(theta)
        result=np.sin((1-ratios[:,None])*theta)/s*aa[None,:]+np.sin(ratios[:,None]*theta)/s*bb[None,:]
    return result/np.linalg.norm(result,axis=1)[:,None]


def segment_errors(times,vals,lo,hi,path):
    if hi-lo<2:return np.zeros(0)
    r=(times[lo+1:hi]-times[lo])/(times[hi]-times[lo])
    if path=='rotation':
        pred=slerp_many(vals[lo],vals[hi],r)
        orig=vals[lo+1:hi].astype(np.float64)
        orig/=np.linalg.norm(orig,axis=1)[:,None]
        dots=np.minimum(1,np.abs(np.sum(pred*orig,axis=1)))
        return np.degrees(2*np.arccos(dots))
    pred=vals[lo]+r[:,None]*(vals[hi]-vals[lo])
    return np.max(np.abs(pred-vals[lo+1:hi]),axis=1)


def reduce_keys(times,vals,path,tolerance):
    if len(times)<=2:return np.arange(len(times),dtype=np.int32)
    idx={0,len(times)-1}
    stack=[(0,len(times)-1)]
    while stack:
        lo,hi=stack.pop()
        if hi-lo<=1:continue
        errors=segment_errors(times,vals,lo,hi,path)
        k=int(np.argmax(errors))+lo+1
        if errors[k-lo-1]>tolerance:
            idx.add(k);stack.append((lo,k));stack.append((k,hi))
    return np.array(sorted(idx),dtype=np.int32)


def is_default(vals,path,default):
    if path=='rotation':
        a=vals.astype(np.float64)
        a/=np.linalg.norm(a,axis=1)[:,None]
        d=np.asarray(default,dtype=np.float64);d/=np.linalg.norm(d)
        return bool(np.all(np.abs(np.sum(a*d[None,:],axis=1))>1-2e-11))
    return bool(np.max(np.abs(vals-np.array(default)))<=1e-5)

class Writer:
    def __init__(self):self.data=bytearray();self.views=[];self.cache={}
    def append(self, raw, *, target=None, stride=None, reuse=False):
        raw=bytes(raw)
        key=(sha256(raw).digest(),len(raw),target,stride)
        if reuse and key in self.cache:return self.cache[key]
        while len(self.data)%4:self.data.append(0)
        view={'buffer':0,'byteOffset':len(self.data),'byteLength':len(raw)}
        if target is not None:view['target']=target
        if stride is not None:view['byteStride']=stride
        i=len(self.views);self.views.append(view);self.data.extend(raw)
        if reuse:self.cache[key]=i
        return i


def optimize(src,output,texture_size=1024,quality=89,rot_tol=.28,pos_tol=.0007,scale_tol=.0005):
    j,orig=load_glb(src)
    if j.get('extensionsRequired') or j.get('extensionsUsed'):
        raise ValueError('Input GLB has extensions that require explicit validation')
    assert len(j['buffers'])==1
    jnew=copy.deepcopy(j)
    writer=Writer()
    oldviews=j['bufferViews']
    oldaccessors=j['accessors']
    used_accessors=set()
    for mesh in j['meshes']:
        for prim in mesh['primitives']:
            used_accessors.update(prim.get('attributes',{}).values())
            if 'indices' in prim:used_accessors.add(prim['indices'])
            for target in prim.get('targets',[]): used_accessors.update(target.values())
    for skin in j.get('skins',[]):
        if 'inverseBindMatrices' in skin:used_accessors.add(skin['inverseBindMatrices'])
    viewmap={}
    def mapview(i):
        if i not in viewmap:
            v=oldviews[i]
            raw=orig[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
            viewmap[i]=writer.append(raw,target=v.get('target'),stride=v.get('byteStride'))
        return viewmap[i]
    newacc=[];accmap={}
    for old_i in sorted(used_accessors):
        a=copy.deepcopy(oldaccessors[old_i]);a['bufferView']=mapview(a['bufferView']);
        if 'sparse' in a:raise ValueError('Sparse attributes not supported')
        accmap[old_i]=len(newacc);newacc.append(a)
    for mesh in jnew['meshes']:
        for prim in mesh['primitives']:
            prim['attributes']={k:accmap[v] for k,v in prim.get('attributes',{}).items()}
            if 'indices' in prim:prim['indices']=accmap[prim['indices']]
            for target in prim.get('targets',[]):
                for k,v in target.items():target[k]=accmap[v]
    for skin in jnew.get('skins',[]):
        if 'inverseBindMatrices' in skin:skin['inverseBindMatrices']=accmap[skin['inverseBindMatrices']]
    if len(jnew.get('images',[]))!=1 or 'bufferView' not in jnew['images'][0]:
        raise ValueError('Expected one embedded image')
    image=j['images'][0];v=oldviews[image['bufferView']]
    src_img=Image.open(io.BytesIO(orig[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]))
    if src_img.mode not in ('RGB','L'):raise ValueError('Cannot safely JPEG texture with alpha')
    orig_image_size=src_img.size
    if max(src_img.size)>texture_size:
        ratio=texture_size/max(src_img.size)
        src_img=src_img.resize((int(src_img.width*ratio),int(src_img.height*ratio)),Image.Resampling.LANCZOS)
    bio=io.BytesIO();src_img.save(bio,format='JPEG',quality=quality,subsampling=0,optimize=True)
    jnew['images'][0]['bufferView']=writer.append(bio.getvalue())
    jnew['images'][0]['mimeType']='image/jpeg'
    # Determine tracks that never change and equal the glTF rest pose in *all* clips.
    global_animated=defaultdict(bool)
    tracks=defaultdict(list)
    for an in j['animations']:
        for ch in an['channels']:
            s=an['samplers'][ch['sampler']];path=ch['target']['path'];node=ch['target']['node']
            if path not in DEFAULT: raise ValueError('Unknown animation path: '+path)
            vals=read_accessor(j,orig,s['output'])
            rest=j['nodes'][node].get(path,DEFAULT[path].tolist())
            tracks[(node,path)].append((vals,rest))
    removed_keys=set()
    for key,items in tracks.items():
        path=key[1]
        if all(is_default(vals,path,rest) for vals,rest in items):removed_keys.add(key)
    samples_before=0;samples_after=0;omitted=0;max_error={k:0 for k in DEFAULT};per_clip=[]
    def add_accessor(array, component_type=5126, kind=None, reuse=False):
        a=np.asarray(array,dtype=DTYPE[component_type]);a=np.ascontiguousarray(a)
        typ=kind if kind else {1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[a.shape[1]]
        v=writer.append(a.tobytes(),reuse=reuse)
        spec={'bufferView':v,'componentType':component_type,'count':len(a),'type':typ}
        if typ=='SCALAR':
            spec['min']=[float(a.min())];spec['max']=[float(a.max())]
        ind=len(newacc);newacc.append(spec)
        return ind
    for anim_i,an in enumerate(j['animations']):
        newan=jnew['animations'][anim_i];newan['channels']=[];newan['samplers']=[]
        stats={'name':an.get('name'),'tracks_before':len(an['channels']),'tracks_after':0,'keys_before':0,'keys_after':0,'duration':0.0}
        for ch in an['channels']:
            s=an['samplers'][ch['sampler']]
            if s.get('interpolation','LINEAR')!='LINEAR':raise ValueError('Non-linear animation interpolation')
            path=ch['target']['path'];key=(ch['target']['node'],path)
            times=read_accessor(j,orig,s['input'])[:,0].astype(np.float64)
            vals=read_accessor(j,orig,s['output']).copy()
            stats['duration']=max(stats['duration'],float(times[-1]))
            stats['keys_before']+=len(times);samples_before+=len(times)
            if key in removed_keys:
                omitted+=1;continue
            tol={'rotation':rot_tol,'translation':pos_tol,'scale':scale_tol}[path]
            kept=reduce_keys(times,vals,path,tol)
            indices=kept.tolist()
            for lo,hi in zip(indices,indices[1:]):
                errors=segment_errors(times,vals,lo,hi,path)
                if len(errors):max_error[path]=max(max_error[path],float(np.max(errors)))
            x=times[kept].astype('<f4')[:,None]
            y=vals[kept]
            if path=='rotation':
                y=y.astype(np.float64)
                y/=np.linalg.norm(y,axis=1)[:,None]
                y=y.astype('<f4')
            si=len(newan['samplers'])
            newan['samplers'].append({'input':add_accessor(x,reuse=True),'output':add_accessor(y,reuse=True),'interpolation':'LINEAR'})
            newan['channels'].append({'sampler':si,'target':copy.deepcopy(ch['target'])})
            stats['keys_after']+=len(kept);samples_after+=len(kept)
        stats['tracks_after']=len(newan['channels']);per_clip.append(stats)
        if not newan['channels']:raise ValueError('Would create empty clip '+str(stats['name']))
    jnew['accessors']=newacc;jnew['bufferViews']=writer.views
    while len(writer.data)%4:writer.data.append(0)
    jnew['buffers']=[{'byteLength':len(writer.data)}]
    jnew['extras']={**jnew.get('extras',{}),'optimizedBy':'LifeSim offline GLB optimizer: preserved original mesh and skin; animation track simplification; JPEG texture'}
    js=json.dumps(jnew,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    while len(js)%4:js+=b' '
    binary=bytes(writer.data)
    total=12+8+len(js)+8+len(binary)
    out=struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\x00')+binary
    Path(output).write_bytes(out)
    validation=validate(src,output,max_error)
    report={
       'source_file':Path(src).name,'output_file':Path(output).name,
       'bytes_original':Path(src).stat().st_size,'bytes_optimized':len(out),'saved_percent':round(100*(1-len(out)/Path(src).stat().st_size),2),
       'texture_original_px':list(orig_image_size),'texture_optimized_px':[src_img.width,src_img.height],
       'texture_original_bytes':v['byteLength'],'texture_optimized_bytes':len(bio.getvalue()),
       'animation_tracks_original':sum(len(a['channels']) for a in j['animations']),'animation_tracks_optimized':sum(len(a['channels']) for a in jnew['animations']),
       'animation_keys_original':samples_before,'animation_keys_optimized':samples_after,
       'max_deviation_at_original_samples':max_error,
       'tolerances':{'rotation_degrees':rot_tol,'translation_local_units':pos_tol,'scale':scale_tol},
       'clips':per_clip,'checks':validation,
    }
    return report


def validate(src,dst,max_deviation):
    j0,b0=load_glb(src);j,b=load_glb(dst)
    assert len(b)==j['buffers'][0]['byteLength']
    assert len(j['animations'])==len(j0['animations'])
    assert [a.get('name') for a in j['animations']]==[a.get('name') for a in j0['animations']]
    assert len(j['skins'])==len(j0['skins'])
    assert j['nodes']==j0['nodes']
    assert j['skins'][0]['joints']==j0['skins'][0]['joints']
    assert len(j['meshes'])==len(j0['meshes'])
    assert [len(x['primitives']) for x in j['meshes']]==[len(x['primitives']) for x in j0['meshes']]
    for m,m0 in zip(j['meshes'],j0['meshes']):
        for p,p0 in zip(m['primitives'],m0['primitives']):
            for sem,index in {**p.get('attributes',{}),**{'INDICES':p['indices']}}.items():
                orig_idx=p0['indices'] if sem=='INDICES' else p0['attributes'][sem]
                a0=read_accessor(j0,b0,orig_idx);a=read_accessor(j,b,index)
                assert np.array_equal(a,a0),('geometry mismatch',sem)
    orig_IBM=read_accessor(j0,b0,j0['skins'][0]['inverseBindMatrices']);IBM=read_accessor(j,b,j['skins'][0]['inverseBindMatrices']);assert np.array_equal(orig_IBM,IBM)
    image=j['images'][0];v=j['bufferViews'][image['bufferView']];img=Image.open(io.BytesIO(b[v['byteOffset']:v['byteOffset']+v['byteLength']]));img.verify()
    for a in j['accessors']:
        v=j['bufferViews'][a['bufferView']]
        assert v['byteOffset']+v['byteLength']<=len(b)
        assert a.get('byteOffset',0)+a['count']*COMP[a['type']]*np.dtype(DTYPE[a['componentType']]).itemsize<=v['byteLength']
    for an0,an in zip(j0['animations'],j['animations']):
        tmax=max(float(read_accessor(j0,b0,s['input'])[-1,0]) for s in an0['samplers'])
        nmax=max(float(read_accessor(j,b,s['input'])[-1,0]) for s in an['samplers'])
        assert abs(tmax-nmax)<1e-6,('duration',an.get('name'))
        for channel in an['channels']:
            s=an['samplers'][channel['sampler']]
            times=read_accessor(j,b,s['input']);vals=read_accessor(j,b,s['output'])
            assert times.shape[0]==vals.shape[0]
            assert np.all(np.diff(times[:,0])>0)
            if channel['target']['path']=='rotation':
                assert np.max(abs(np.linalg.norm(vals,axis=1)-1))<1e-4
    assert all(p.get('targets', [])==p0.get('targets', []) for mesh,mesh0 in zip(j['meshes'],j0['meshes']) for p,p0 in zip(mesh['primitives'],mesh0['primitives']))
    return {'original_animation_names_preserved':True,'original_skeleton_and_bind_matrices_preserved':True,'original_vertex_geometry_byte_equal':True,'animation_durations_preserved':True,'valid_embedded_image':True,'morph_target_structure_preserved':True}


def main():
    ap=argparse.ArgumentParser();ap.add_argument('input');ap.add_argument('output');ap.add_argument('--texture-size',type=int,default=1024);ap.add_argument('--quality',type=int,default=89);ap.add_argument('--rotation-tolerance',type=float,default=.28);ap.add_argument('--translation-tolerance',type=float,default=.0007)
    args=ap.parse_args();r=optimize(args.input,args.output,args.texture_size,args.quality,args.rotation_tolerance,args.translation_tolerance)
    report=Path(args.output).with_suffix('.report.json');report.write_text(json.dumps(r,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in r.items() if k not in ('clips',)},ensure_ascii=False,indent=2));print('Report:',report)
if __name__=='__main__':main()