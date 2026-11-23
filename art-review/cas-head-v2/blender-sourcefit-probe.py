#!/usr/bin/env python3
"""Cas-Head-V2 preliminary MPFB-to-original depth/scale correspondence probe.

This code measures *front-projection gaps*, not anatomical correspondence or
a sculpted head. Both exact original Alex/Mira GLBs are read-only. It saves
separate annotated .blend workspaces for offline inspection; these are not
resident GLBs, do not replace source characters, and must NOT be game-shipped.

Usage:
    python3.11 art-review/cas-head-v2/blender-sourcefit-probe.py \
      --mpfb-root /tmp/mpfb2 --out /tmp/cas-head-fit-probe
"""
import argparse
import hashlib
import json
import math
import statistics
from pathlib import Path

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(root,mpfb,out):
    import bpy
    from mathutils import Vector,Matrix
    from mathutils.bvhtree import BVHTree
    manifest=json.loads((root/'art-review/cas-head-v2/MPFB-DONOR-PIN.json').read_text())
    landmark=json.loads((root/'art-review/cas-02-2-b/G1-LANDMARK-CANDIDATES.json').read_text())
    donor_path=mpfb/manifest['donor']['sourceRelPath']
    if digest(donor_path)!=manifest['donor']['sha256']:
        raise RuntimeError('Unverified MPFB base')
    sources={
        'alex':'assets/characters/meshy-casual-v1.glb',
        'mira':'assets/characters/meshy-mira-mobile-v1.glb'
    }
    out.mkdir(parents=True,exist_ok=True)
    results=[]
    for family,relative in sources.items():
        original=root/relative
        if digest(original)!=manifest['originalHeroGLBSha256'][family]:
            raise RuntimeError('Original hero sha changed: '+family)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(original))
        source_mesh=next(
            x for x in bpy.data.objects
            if x.type=='MESH' and
            len(x.data.vertices)==landmark['families'][family]['expectedVertices'])
        original_morph_keys=source_mesh.data.shape_keys
        src_points={}
        for name,(vertex_id,px,py) in landmark['families'][family]['points'].items():
            src_points[name]=source_mesh.matrix_world@source_mesh.data.vertices[vertex_id].co
        bpy.ops.wm.obj_import(filepath=str(donor_path))
        donor=max((o for o in bpy.data.objects if o.type=='MESH'),key=lambda x:len(x.data.vertices))
        donor.name='TOPOLOGY_DONOR_NOT_SOURCE_FITTED'
        eye_z=(src_points['eyeLO'].z+src_points['eyeRO'].z)/2
        lip_z=(src_points['upperLip'].z+src_points['lowerLip'].z)/2
        # MPFB Y-up eye/lip positions are approximate model-dependent ranges,
        # NOT manually validated correspondent source vertices.
        scale=(eye_z-lip_z)/(7.28-6.68)
        if not .05<scale<.2:
            raise RuntimeError('Head vertical scale estimate outside safe pilot range')
        shift_z=eye_z-7.28*scale
        donor.matrix_world=(
            Matrix.Translation((0,0,shift_z))
            @ Matrix.Rotation(math.pi/2,4,'X')
            @ Matrix.Diagonal((scale,scale,scale,1))
        )
        bpy.context.view_layer.update()
        bvh=BVHTree.FromObject(donor,bpy.context.evaluated_depsgraph_get())
        gaps=[]
        unfitted=[]
        for label,point in src_points.items():
            # Only frontal projection x,z, not semantic eyelid/nose surface link.
            ray_origin=donor.matrix_world.inverted()@Vector((point.x,-2,point.z))
            ray_direction=donor.matrix_world.inverted().to_3x3()@Vector((0,1,0))
            hit,normal,face,distance=bvh.ray_cast(ray_origin,ray_direction,300)
            if hit is None:
                unfitted.append(label)
                continue
            donor_front=donor.matrix_world@hit
            gaps.append({'feature':label,'rawDepthGapMeters':round(point.y-donor_front.y,6)})
        if len(gaps)<12:
            raise RuntimeError('Source and donor too far apart for depth-only inspection')
        med=statistics.median(x['rawDepthGapMeters'] for x in gaps)
        # Translation only aligns front-surface depth; NO shape/cage fit performed.
        donor.location.y+=med
        residuals=[abs(x['rawDepthGapMeters']-med) for x in gaps]
        residuals.sort()
        p95=residuals[math.ceil(.95*len(residuals))-1]
        imported_armatures=[o for o in bpy.data.objects if o.type=='ARMATURE']
        entry={
          'family':family,
          'sourceSha256':manifest['originalHeroGLBSha256'][family],
          'sourceVertices':len(source_mesh.data.vertices),
          'sourceSkinsAndAnimationsPreserved':True,
          'sourceArmatureCount':len(imported_armatures),
          'donorVertices':len(donor.data.vertices),
          'detectedLandmarkProjectionPoints':len(gaps),
          'misses':unfitted,
          'neutralVerticalScaleEstimate':round(scale,6),
          'verticalOffsetMeters':round(shift_z,6),
          'frontDepthOffsetMeters':round(med,6),
          'depthResidualP95Meters':round(p95,6),
          'sourceSurfaceSemanticCorrespondenceVerified':False,
          'headNeckFitVerified':False,
          'sourceStyleLikenessApproved':False,
          'originalRigTransferred':False,
          'texturesCorrected':False,
          'actualNewResident':False
        }
        file=out/(family+'-preliminary-depth-alignment.blend')
        bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
        results.append(entry)
        print('CAS_HEAD_V2_SOURCE_PROJECTION '+json.dumps(entry))
    (out/'projection-receipt.json').write_text(json.dumps(results,indent=2)+'\n')
    return results

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--mpfb-root',required=True)
    p.add_argument('--out',required=True)
    o=p.parse_args()
    run(Path(__file__).resolve().parents[2],Path(o.mpfb_root),Path(o.out))
