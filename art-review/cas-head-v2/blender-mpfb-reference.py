#!/usr/bin/env python3
"""Reference-only MPFB CC0 topology/morph DCC trial; never ship its raw humanoid.

Needs bpy 4.5 and the exact MPFB 2.0.18 checkout. Generates a technical DCC
.BLEND and optional GLB for *machine validation only*. It DOES NOT fit any source
hero face, transfer original rig, create resident textures or approve character art.

python3.11 blender-mpfb-reference.py --mpfb-root /tmp/mpfb2 --out /tmp/cas-head-poc
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def build(root,mpfb,out):
    import bpy
    expected=json.loads((root/'art-review/cas-head-v2/MPFB-DONOR-PIN.json').read_text())
    assert expected['gate']['productionReady'] is False
    base=mpfb/expected['donor']['sourceRelPath']
    if digest(base)!=expected['donor']['sha256']:
        raise ValueError('Unpinned MPFB donor topology')
    for channel in expected['targets']:
        path=mpfb/'src/mpfb/data/targets'/channel['path']
        if digest(path)!=channel['sha256']:
            raise ValueError('MPFB shape target digest mismatch: '+channel['channel'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=str(base))
    obj=max((o for o in bpy.data.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
    if len(obj.data.vertices)!=expected['donor']['vertexCount']:
        raise ValueError('Unsupported Blender OBJ vertex reorder')
    if len(obj.data.polygons)!=expected['donor']['quadCount']:
        raise ValueError('Unexpected imported donor face count')
    if not obj.data.uv_layers.active:
        raise ValueError('Donor UVs not imported')
    obj.name='TECHNICAL_REFERENCE_ONLY_NOT_A_RESIDENT'
    obj.shape_key_add(name='Basis',from_mix=False)
    receipt=[]
    for channel in expected['targets']:
        key=obj.shape_key_add(name='donor_'+channel['channel'],from_mix=False)
        raw=gzip.decompress((mpfb/'src/mpfb/data/targets'/channel['path']).read_bytes())
        seen=set()
        max_delta=0
        nonzero=0
        for line in raw.decode().splitlines():
            line=line.strip()
            if not line or line.startswith('#'):
                continue
            record=line.split()
            if len(record)!=4:
                raise ValueError('Invalid sparse shape target')
            i=int(record[0])
            if i in seen or not 0<=i<len(obj.data.vertices):
                raise ValueError('Out-of-range or repeated vertex in MPFB target')
            seen.add(i)
            delta=[float(a) for a in record[1:]]
            import math
            if not all(math.isfinite(a) for a in delta):
                raise ValueError('Nonfinite target delta')
            d=math.sqrt(sum(a*a for a in delta))
            if d>0:
                key.data[i].co=obj.data.vertices[i].co.copy()
                key.data[i].co.x+=delta[0]
                key.data[i].co.y+=delta[1]
                key.data[i].co.z+=delta[2]
                max_delta=max(max_delta,d)
                nonzero+=1
        if nonzero!=channel['changed']:
            raise ValueError('Morph coverage unexpectedly changed')
        if abs(max_delta-channel['maxDelta'])>.0005:
            raise ValueError('Morph amplitude unexpectedly changed')
        receipt.append({'channel':channel['channel'],'changedVertices':nonzero,
                        'maxDonorUnitDelta':round(max_delta,5),
                        'sourceSHA256':channel['sha256']})
    if len(obj.data.shape_keys.key_blocks)!=len(expected['targets'])+1:
        raise ValueError('Shape keys not generated')
    out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'cc0-donor-technical-only.blend'),compress=True)
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(out/'cc0-donor-technical-only.glb'),
        export_format='GLB',use_selection=True,export_morph=True,
        export_morph_normal=True,export_skins=False,export_animations=False)
    receipt_obj={
      'schema':'lifesim.cas-head-v2.blender-donor-receipt.v1',
      'blenderVersion':bpy.app.version_string,
      'upstreamCommit':expected['upstream']['commit'],
      'assetLicense':'CC0-1.0',
      'donorVertices':len(obj.data.vertices),
      'sourcePolygons':len(obj.data.polygons),
      'hasUV':bool(obj.data.uv_layers.active),
      'shapeKeys':receipt,
      'originalHeroesModified':False,
      'newResidentsCreated':0,
      'sourceFitted':False,
      'originalAnimationRetargeted':False,
      'texturesCorrected':False,
      'productionReady':False,
      'ownerArtApproved':False
    }
    (out/'technical-receipt.json').write_text(json.dumps(receipt_obj,indent=2)+'\n')
    print('CAS_HEAD_V2_BLENDER_DONOR '+json.dumps(receipt_obj))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--mpfb-root',required=True)
    p.add_argument('--out',required=True)
    args=p.parse_args()
    root=Path(__file__).resolve().parents[2]
    build(root,Path(args.mpfb_root),Path(args.out))
