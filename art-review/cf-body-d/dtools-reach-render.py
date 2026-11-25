"""Independent Blender actual held-out skin and fixture A/B: triangle-aware contact and sole-lock diagnostic."""
import pathlib,json,math
import numpy as np
import bpy
from mathutils import Matrix,Vector
from contact_audit import slab
from hashlib import sha256
R=pathlib.Path('reach-out');manifest=json.loads((R/'manifest.json').read_text());report={}
assert bpy.app.version==(4,5,0)
def reset(arm,action=None,t=0):
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data.action=None
            for tr in o.animation_data.nla_tracks:tr.mute=True
    for bone in arm.pose.bones:bone.matrix_basis=Matrix.Identity(4)
    bpy.context.view_layer.update()
    frame=1.
    if action:
        ad=arm.animation_data_create();ad.action=action
        slots=[s for s in action.slots if s.target_id_type=='OBJECT']
        if slots:ad.action_slot=slots[0]
        a,b=action.frame_range;frame=a+(b-a)*t
    bpy.context.scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame));bpy.context.view_layer.update()
def sample(body):
    o=body.evaluated_get(bpy.context.evaluated_depsgraph_get());m=o.to_mesh()
    try:
        v=np.array([tuple(o.matrix_world@x.co) for x in m.vertices]);m.calc_loop_triangles()
        f=np.array([tuple(t.vertices) for t in m.loop_triangles],dtype=int)
        assert np.isfinite(v).all() and len(f)>1000
        return v,f
    finally:o.to_mesh_clear()
def box(name,center,dims,color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.dimensions=dims
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);o.data.materials.append(m);return o
decisions=json.loads((R/'decisions.json').read_text());seat=json.loads(pathlib.Path('prior-seat/surface-summary.json').read_text())
assert seat['sampled_contact_pass'] is True and len(seat['endpoint_support_area_m2'])==18
# Candidate-only support area policy, NOT a biomechanical proof or universal furniture restriction.
support_floor=.005
seat_policy={'threshold_m2':support_floor,'approved_candidates':sum(x>=support_floor for x in seat['endpoint_support_area_m2']),'rejected_candidates':sum(x<support_floor for x in seat['endpoint_support_area_m2']),'scope':'Reject point-like support candidate; choose other movement/fixture or replan. Not proof of physical impossibility.'}
assert seat_policy['rejected_candidates']==1
(R/'seat-policy.json').write_text(json.dumps(seat_policy,indent=2))
for key,p in sorted(manifest.items()):
    path=R/(key+'.glb');assert sha256(path.read_bytes()).hexdigest()==p['sha256']
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];assert len(arms)==1
    arm=arms[0];assert len(arm.data.bones)==104
    body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
    reset(arm);v0,f=sample(body);floor=float(v0[:,2].min());assert abs(floor-p['floor'])<.001
    soles=[np.flatnonzero((v0[:,2]<floor+.012)&(v0[:,0]*side>0)) for side in (-1,1)]
    assert min(map(len,soles))>10
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=10;s.cycles.use_denoising=True;s.render.resolution_x=540;s.render.resolution_y=720;s.render.resolution_percentage=100
    s.world=bpy.data.worlds.new('Motion world');s.world.use_nodes=True
    s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.22,.22,.22,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
    box('floor',(0,0,floor-.025),(8,8,.05),(.42,.44,.47))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.012)
    marker=bpy.context.object;marker.name='nonphysical fixed contact marker';mat=bpy.data.materials.new('target marker');mat.diffuse_color=(.06,.7,.3,1);marker.data.materials.append(mat)
    bpy.ops.object.camera_add(location=(-3,-4,1.55));s.camera=bpy.context.object;s.camera.data.type='ORTHO';s.camera.data.ortho_scale=2.45
    s.camera.rotation_euler=(Vector((-.05,-.12,1.0))-s.camera.location).to_track_quat('-Z','Y').to_euler()
    for loc,power,size in [((3,-4,5),500,4),((-3,-2,3),250,3),((0,3,4),350,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
    row={}
    for name,d in sorted(p['clips'].items()):
        target=np.array([d['fixture'][0],-d['fixture'][2],d['fixture'][1]])
        n=np.array([d['landmark'][0],-d['landmark'][2],d['landmark'][1]])
        ix=int(np.argmin(np.linalg.norm(v0-n,axis=1)));assert np.linalg.norm(v0[ix]-n)<.0002
        marker.location=target
        action=bpy.data.actions[name];frames=[]
        for i in range(129):
            t=i/128;reset(arm,action,t);v,g=sample(body);assert np.array_equal(g,f)
            drift=max(float(np.linalg.norm(v[q]-v0[q],axis=1).max()) for q in soles)
            frames.append({'t':t,'marker_error_m':float(np.linalg.norm(v[ix]-target)),'floor_delta_m':float(v[:,2].min()-floor),'sole_drift_m':drift})
            if i in (0,64,128):
                s.render.filepath=str((R/(key+'-'+name+'-'+str(i)+'.png')).resolve());bpy.ops.render.render(write_still=True)
        row[name]=frames
    # Rejected cases must not contain an executable reach animation.
    for id,d in decisions[key].items():
        if d['status']=='reject':assert 'world_reach_'+id not in bpy.data.actions
    report[key]=row
    (R/'reach-audit.json').write_text(json.dumps(report,indent=2))
    print(key,json.dumps({k:{'hold_error':max(r['marker_error_m'] for r in rows if r['t']>=.72),'floor':min(r['floor_delta_m'] for r in rows),'sole':max(r['sole_drift_m'] for r in rows)} for k,rows in row.items()}),flush=True)
rows=[r for row in report.values() for frames in row.values() for r in frames]
count=sum(map(len,report.values()));assert len(report)==6 and count>=6 and len(rows)==count*129 and len(list(R.glob('*.png')))==count*3
summary={'accepted_candidates':count,'rejected_candidates':sum(d['status']=='reject' for row in decisions.values() for d in row.values()),'samples':len(rows),'max_hold_error_m':max(r['marker_error_m'] for r in rows if r['t']>=.72),'worst_floor_m':min(r['floor_delta_m'] for r in rows),'max_sole_drift_m':max(r['sole_drift_m'] for r in rows),'seat_policy':seat_policy}
summary['sampled_reach_pass']=summary['max_hold_error_m']<=.005 and summary['worst_floor_m']>=-.001 and summary['max_sole_drift_m']<=.005
summary['scope']='Actual fixed fingertip landmark, no solid prop/grasp, joint limits, self-collision or full-body artistic acceptance.'
(R/'reach-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
