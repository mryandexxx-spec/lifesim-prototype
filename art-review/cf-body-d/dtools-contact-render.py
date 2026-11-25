"""Independent Blender actual held-out skin and fixture A/B: triangle-aware contact and sole-lock diagnostic."""
import pathlib,json,math
import numpy as np
import bpy
from mathutils import Matrix,Vector
from contact_audit import slab
from hashlib import sha256
R=pathlib.Path('contact-out');manifest=json.loads((R/'manifest.json').read_text());report={}
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
for key,p in sorted(manifest.items()):
    path=R/(key+'.glb');assert sha256(path.read_bytes()).hexdigest()==p['sha256']
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];assert len(arms)==1
    arm=arms[0];assert len(arm.data.bones)==104
    body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
    reset(arm);v0,f=sample(body);floor=float(v0[:,2].min());assert abs(floor-p['floor'])<.001
    # Select neutral skin points for each sole before seeing any animation.
    sole_groups=[np.flatnonzero((v0[:,2]<floor+.012)&(v0[:,0]*side>0)) for side in (-1,1)]
    assert min(map(len,sole_groups))>10
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=10;s.cycles.use_denoising=True;s.render.resolution_x=540;s.render.resolution_y=720;s.render.resolution_percentage=100
    s.world=bpy.data.worlds.new('Motion world');s.world.use_nodes=True
    s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.22,.22,.22,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
    box('floor',(0,0,floor-.025),(8,8,.05),(.42,.44,.47));seat=box('seat',(0,.04,floor+.41),(.52,.42,.04),(.22,.34,.45))
    bpy.ops.object.camera_add(location=(3,-4,1.35));s.camera=bpy.context.object;s.camera.data.type='ORTHO';s.camera.data.ortho_scale=2.5
    s.camera.rotation_euler=(Vector((0,-.12,1.0))-s.camera.location).to_track_quat('-Z','Y').to_euler()
    for loc,power,size in [((3,-4,5),500,4),((-3,-2,3),250,3),((0,3,4),350,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
    row={}
    for clip,d in sorted(p['clips'].items()):
        top=floor+d['height'];seat.location.z=top-.02
        lo=[-.26,.04-.21,top-.04];hi=[.26,.04+.21,top]
        a=bpy.data.actions[clip];frames=[];sole_start=None
        for i in range(129):
            reset(arm,a,i/128);v,g=sample(body);assert np.array_equal(g,f)
            if sole_start is None:sole_start=v.copy()
            sole_drift=max(float(np.linalg.norm(v[g,:2]-sole_start[g,:2],axis=1).max()) for g in sole_groups)
            sole_minima=[float(v[g,2].min()-floor) for g in sole_groups]
            ankle=[]
            for side,goal in zip(('L','R'),d['anchors']):
                b=arm.pose.bones['foot.'+side];pos=arm.matrix_world@b.head
                ankle.append(float(np.linalg.norm(np.array(pos)-np.array([goal[0],-goal[2],goal[1]]))))
            hit=slab(v,f,lo,hi)
            inside=(abs(v[:,0])<=.26)&(abs(v[:,1]-.04)<=.21)&(v[:,2]>=top-.001)&(v[:,2]<top+.10)
            gap=float(v[inside,2].min()-top) if inside.any() else None
            frames.append({'t':i/64,'floor_delta_m':float(v[:,2].min()-floor),'seat':hit,'ankle_error_m':max(ankle),'seat_gap_m':gap,'sole_drift_m':sole_drift,'sole_minima_m':sole_minima})
            if i in (0,32,64,96,128) and (d['height']==.43 or i==128):
                s.render.filepath=str((R/(key+'-'+clip+'-'+str(i)+'.png')).resolve());bpy.ops.render.render(write_still=True)
        row[clip]=frames
    report[key]=row
    (R/'surface-audit.json').write_text(json.dumps(report,indent=2))
    print(key,json.dumps({k:{'floor':min(r['floor_delta_m'] for r in rows),'seat':max(r['seat']['intersecting_triangles'] for r in rows),'ankle':max(r['ankle_error_m'] for r in rows),'end_gap':rows[-1]['seat_gap_m']} for k,rows in row.items()}),flush=True)
assert len(report)==6 and len(list(R.glob('*.png')))==42
allrows=[r for row in report.values() for frames in row.values() for r in frames]
end=[frames[-1] for row in report.values() for frames in row.values()]
summary={'samples':len(allrows),'cases':len(end),'worst_floor_m':min(r['floor_delta_m'] for r in allrows),'max_seat_triangles':max(r['seat']['intersecting_triangles'] for r in allrows),'max_ankle_error_m':max(r['ankle_error_m'] for r in allrows),'endpoint_gaps_m':[r['seat_gap_m'] for r in end]}
summary['max_sole_drift_m']=max(r['sole_drift_m'] for r in allrows)
summary['max_abs_sole_minimum_m']=max(abs(m) for r in allrows for m in r['sole_minima_m'])
summary['sampled_contact_pass']=summary['max_sole_drift_m']<=.005 and summary['max_abs_sole_minimum_m']<=.005 and summary['worst_floor_m']>=-.001 and summary['max_seat_triangles']==0 and summary['max_ankle_error_m']<=.005 and all(g is not None and -.001<=g<=.01 for g in summary['endpoint_gaps_m'])
summary['scope']='Sampled floor, fixed seat and ankle anchors; not continuous collision, self-collision, reach, walk or art acceptance.'
(R/'surface-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
