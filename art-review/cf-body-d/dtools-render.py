"""Independent Blender actual held-out skin and fixture A/B: diagnostic, not a contact pass."""
import pathlib,json,math
import numpy as np
import bpy
from mathutils import Matrix,Vector
from contact_audit import slab
from hashlib import sha256
R=pathlib.Path('full-out');manifest=json.loads((R/'manifest.json').read_text());report={}
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
    path=R/(key+'.glb');assert sha256(path.read_bytes()).hexdigest()==p['candidate_sha256']
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];assert len(arms)==1
    arm=arms[0];assert len(arm.data.bones)==104
    body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
    reset(arm);v0,f=sample(body);floor=float(v0[:,2].min())
    assert abs(floor-p['floor'])<.001
    cy=.02839272035285831 if p['sex']=='male' else .054499393180012706
    lo=[-.26,cy-.21,floor+.39];hi=[.26,cy+.21,floor+.43]
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=10;s.cycles.use_denoising=True;s.render.resolution_x=540;s.render.resolution_y=720;s.render.resolution_percentage=100
    s.world=bpy.data.worlds.new('Motion world');s.world.use_nodes=True
    s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.22,.22,.22,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
    box('floor',(0,0,floor-.025),(8,8,.05),(.42,.44,.47));seat=box('seat',(0,cy,floor+.41),(.52,.42,.04),(.22,.34,.45))
    bpy.ops.object.camera_add(location=(3,-4,1.35));s.camera=bpy.context.object;s.camera.data.type='ORTHO';s.camera.data.ortho_scale=2.5
    s.camera.rotation_euler=(Vector((0,0,1.0))-s.camera.location).to_track_quat('-Z','Y').to_euler()
    for loc,power,size in [((3,-4,5),500,4),((-3,-2,3),250,3),((0,3,4),350,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
    row={}
    for c in ('reach_target','seat_hands_refined'):
        seat.hide_render=not c.startswith('seat')
        for method in ('base','ik'):
            clip=method+'_'+c;a=bpy.data.actions[clip];rows=[]
            for i in range(9):
                reset(arm,a,i/8);v,g=sample(body);assert np.array_equal(g,f)
                if i==0:assert np.linalg.norm(v-v0,axis=1).max()<.0002
                r={'t':i/8,'floor_delta_m':float(v[:,2].min()-floor),'max_displacement_m':float(np.linalg.norm(v-v0,axis=1).max())}
                if c.startswith('seat'):r['seat']=slab(v,f,lo,hi)
                rows.append(r)
                if i in (4,8):
                    s.render.filepath=str((R/(key+'-'+clip+'-'+str(i)+'.png')).resolve());bpy.ops.render.render(write_still=True)
            row[clip]=rows
    report[key]=row
    (R/'skin-audit.json').write_text(json.dumps(report,indent=2))
    print(key,json.dumps({k:{'floor_min':min(r['floor_delta_m'] for r in rows),'max_seat_triangles':max(r.get('seat',{}).get('intersecting_triangles',0) for r in rows)} for k,rows in row.items()}),flush=True)
assert len(report)==6 and len(list(R.glob('*.png')))==48
summary={}
for method in ('base','ik'):
    rows=[r for row in report.values() for k,rs in row.items() if k.startswith(method+'_') for r in rs]
    summary[method]={'samples':len(rows),'worst_floor_m':min(r['floor_delta_m'] for r in rows),'max_seat_triangles':max(r.get('seat',{}).get('intersecting_triangles',0) for r in rows)}
summary['scope']='Actual skin and fixed fixture A/B, not solver contact or art acceptance; no self-collision or walking check.'
(R/'skin-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
