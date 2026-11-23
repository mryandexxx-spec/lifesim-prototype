#!/usr/bin/env python3
"""Source-only G1 facial landmark scene builder.

Requires bpy 4.5.x (for example Blender's own Python runtime). Run:
    python3.11 art-review/cas-02-2-b/blender-g1-landmark-scene.py --output /tmp/cas-b-g1
Never edits the pinned source GLBs. Marker empties are candidate reference points,
not sculpted vertices or automatically approved anatomical masks.
"""
import argparse
import hashlib
import json
import pathlib
import sys

def build(manifest, root, target):
    import bpy
    from mathutils import Vector
    results=[]
    for kind, family in manifest["families"].items():
        raw=(root / family["source"]).read_bytes()
        digest=hashlib.sha256(raw).hexdigest()
        if digest!=family["sha256"]:
            raise RuntimeError("Refusing unverified original "+kind)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str((root/family["source"]).resolve()))
        meshes=[ob for ob in bpy.data.objects if ob.type=='MESH'
                and len(ob.data.vertices)==family["expectedVertices"]]
        if len(meshes)!=1:
            raise RuntimeError("Unexpected original source vertex topology "+kind)
        mesh=meshes[0]
        original_count=len(mesh.data.vertices)
        original_faces=len(mesh.data.polygons)
        scene=bpy.context.scene
        dg=bpy.context.evaluated_depsgraph_get()
        evaluated=mesh.evaluated_get(dg)
        emesh=evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=dg)
        if len(emesh.vertices)!=original_count:
            raise RuntimeError("Evaluated source indices changed "+kind)
        group=bpy.data.collections.new("G1 source-verified candidate points")
        scene.collection.children.link(group)
        positions=[]
        for name,entry in family["points"].items():
            vid,px,py=entry
            if vid<0 or vid>=len(emesh.vertices):
                raise RuntimeError("Invalid candidate ID "+kind+":"+name)
            # A tiny Blender EMPTY is a visual annotation and never part of GLB.
            place=mesh.matrix_world @ emesh.vertices[vid].co
            ob=bpy.data.objects.new("candidate_"+name,None)
            group.objects.link(ob)
            ob.empty_display_type='SPHERE'
            ob.empty_display_size=.003
            ob.location=place
            positions.append({
              "feature":name,"sourceVertex":vid,"screenPixel":[px,py],
              "evaluatedWorld":list(round(x,6) for x in place)
            })
        evaluated.to_mesh_clear()
        # Source model, rig, animation and image remain unedited in the file.
        if len(mesh.data.vertices)!=original_count or len(mesh.data.polygons)!=original_faces:
            raise RuntimeError("Source mesh changed while annotating")
        # Create reproducible camera/reference lighting, but not a cosmetic art preview.
        bpy.ops.object.camera_add(location=(0,-1.2,1.55))
        cam=bpy.context.object
        cam.name="G1_source_reference_camera"
        cam.rotation_euler=(Vector((0,0,1.55))-cam.location).to_track_quat('-Z','Y').to_euler()
        cam.data.type='ORTHO'
        cam.data.ortho_scale=manifest["render"]["orthographicScale"]
        scene.camera=cam
        bpy.ops.object.light_add(type='AREA',location=(-.5,-.4,2.0))
        bpy.context.object.data.energy=230
        bpy.context.object.data.size=2.5
        output=target/(kind+"-source-landmarks.blend")
        bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        results.append({
          "kind":kind,"sourceSha256":digest,"sourceVertices":original_count,
          "sourceTriangles":original_faces,"candidates":positions,
          "blenderVersion":bpy.app.version_string,"blendFile":output.name,
          "sourceModified":False,"meshSculptApproved":False,
          "atlasCorrected":False,"newResidentsCreated":0
        })
    target.joinpath("source-landmark-receipt.json").write_text(
       json.dumps(results,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return results

def main():
    args=argparse.ArgumentParser()
    args.add_argument("--output",required=True)
    opts=args.parse_args()
    root=pathlib.Path(__file__).resolve().parents[2]
    manifest_path=pathlib.Path(__file__).with_name("G1-LANDMARK-CANDIDATES.json")
    m=json.loads(manifest_path.read_text(encoding="utf-8"))
    if m["productionReady"] or m["ownerArtApproved"]:
        raise RuntimeError("Unapproved candidates must never claim art-ready")
    output=pathlib.Path(opts.output).resolve()
    output.mkdir(parents=True,exist_ok=True)
    result=build(m,root,output)
    for row in result:
        print("CAS_B_G1_BLENDER_CANDIDATES "+json.dumps({
          "kind":row["kind"],"sourceVertices":row["sourceVertices"],
          "candidateCount":len(row["candidates"]),
          "blender":row["blenderVersion"],
          "sourceModified":False,"artistSculptApproved":False
        }))
if __name__=="__main__":
    main()
