"""D4/R2: sampled motion/skin-contact diagnostic, not production animation certification."""
import collections, json, pathlib, math
import numpy as np
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from contact_audit import PINS, slab
from hashlib import sha256

root=pathlib.Path('r1');out=pathlib.Path('d4-motion');out.mkdir(exist_ok=True)
pins={
'female-grid_000.glb':'1b6d3eba1157b7a0aff44b33cab181f0c4604452e6bef70bd7b90fc33f467070',
'female-grid_111.glb':'5c275fe82f3bae7174f91bb27cdc47efbb3507b84731c5fac2b6df02c0b7b214',
'female-grid_222.glb':'2f961d3cf45facb8e22eba0d2c1a9f329d2689ef1c5784b18d7166395131d82d',
'male-grid_000.glb':'e31b4af244b110be4a50a41a1a34e5024048a308581399f639d69d3ffd874889',
'male-grid_111.glb':'b54b0ad210d30ea27a93bdc90abe0656d1cc1af683322001a94a8ce6cfa22966',
'male-grid_222.glb':'4a0a3cc777c98733fca49ad1cbbb7cb4c7595d2c3cceda7a15139f80ebe3cb51'}
# Exact D3 fixture centers, unchanged in R1 (world Blender Y = -GLB Z).
centers={'male-grid_000.glb':.027172600701451305,'male-grid_111.glb':.02839272035285831,'male-grid_222.glb':.02570769920945168,'female-grid_000.glb':.055414996892213825,'female-grid_111.glb':.054499393180012706,'female-grid_222.glb':.05462840743362904}
assert bpy.app.version==(4,5,0)
assert json.loads((root/'d4/summary.json').read_text())['strict_contact_pass']
old=json.loads((root/'d4/contact-audit.json').read_text())
assert set(old)==set(pins)==set(PINS)==set(centers)
def region(n):
    side=n[-2:] if n.endswith(('.L','.R')) else ''
    if n.startswith(('finger','metacarpal','wrist')):return 'hand'+side
    if n.startswith('lowerarm'):return 'forearm'+side
    if n.startswith('upperarm'):return 'upperarm'+side
    if n.startswith(('clavicle','shoulder')):return 'shoulder'+side
    if n.startswith('upperleg'):return 'thigh'+side
    if n.startswith('lowerleg'):return 'shin'+side
    if n.startswith(('toe','foot')):return 'foot'+side
    if n.startswith(('head','eye','neck')):return 'head_neck'
    return 'torso_pelvis'
def bvh_pairs(v,f,weld):
    tree=BVHTree.FromPolygons(v.tolist(),f.tolist(),all_triangles=True,epsilon=0.0)
    wf=weld[f]
    # Exclude actual shared geometric vertices, including split UV seams.
    pairs=set()
    for a,b in tree.overlap(tree):
        if a>=b:continue
        if np.any(wf[a,:,None]==wf[b,None,:]):continue
        pairs.add((a,b))
    return pairs
# Verify actual crossing is detected and welded adjacency is excluded.
tv=np.array([[-1.,0.,0.],[1.,0.,0.],[0.,1.,0.],[0.,.2,-1.],[0.,.2,1.],[0.,.8,.1]])
tf=np.array([[0,1,2],[3,4,5]])
assert (0,1) in bvh_pairs(tv,tf,np.arange(6))
assert not bvh_pairs(tv,tf,np.array([0,1,2,0,4,5]))
def reset(arm,action=None,t=0.):
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data.action=None
            for tr in o.animation_data.nla_tracks:tr.mute=True
    for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
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
        v=np.array([tuple(o.matrix_world@x.co) for x in m.vertices])
        m.calc_loop_triangles();f=np.array([tuple(t.vertices) for t in m.loop_triangles],dtype=int)
        assert np.isfinite(v).all() and len(f)>1000
        return v,f
    finally:o.to_mesh_clear()
def fixture(name,center,dims,color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.dimensions=dims
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);o.data.materials.append(m);return o
report={}
for name,pin in sorted(pins.items()):
    path=root/'d4-candidates'/name
    assert sha256(path.read_bytes()).hexdigest()==pin==old[name]['candidate_sha256']
    assert old[name]['source_sha256']==PINS[name]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];assert len(arms)==1
    arm=arms[0];assert len(arm.data.bones)==104
    body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
    reset(arm);v0,f=sample(body)
    assert len(v0)==len(body.data.vertices)
    _,weld=np.unique(np.rint(v0/1e-6).astype(np.int64),axis=0,return_inverse=True)
    labels=[]
    for v in body.data.vertices:
        weights=[g for g in v.groups if g.weight>0]
        labels.append(region(body.vertex_groups[max(weights,key=lambda g:g.weight).group].name) if weights else 'unweighted')
    assert 'unweighted' not in labels
    fl=[collections.Counter(labels[i] for i in face).most_common(1)[0][0] for face in f]
    def classify(pairs):
        return dict(collections.Counter(' / '.join(sorted((fl[a],fl[b]))) for a,b in sorted(pairs)))
    baseline=bvh_pairs(v0,f,weld)
    cy=centers[name];lo=[-.26,cy-.21,.39];hi=[.26,cy+.21,.43]
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=12;s.cycles.use_denoising=True
    s.render.resolution_x=540;s.render.resolution_y=720;s.render.resolution_percentage=100
    s.world=bpy.data.worlds.new('Motion world');s.world.use_nodes=True
    s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.22,.22,.22,1)
    s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
    fixture('floor',(0,0,-.025),(8,8,.05),(.42,.44,.47))
    seat=fixture('seat',(0,cy,.41),(.52,.42,.04),(.22,.34,.45))
    bpy.ops.object.camera_add(location=(3,-4,1.35));s.camera=bpy.context.object;s.camera.data.type='ORTHO';s.camera.data.ortho_scale=2.25
    s.camera.rotation_euler=(Vector((0,0,.92))-s.camera.location).to_track_quat('-Z','Y').to_euler()
    for loc,power,size in [((3,-4,5),500,4),((-3,-2,3),250,3),((0,3,4),350,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
    row={'candidate_sha256':pin,'neutral_nonadjacent_candidates':len(baseline),'neutral_classes':classify(baseline),'skin_triangles':len(f),'poses':{}}
    for clip in ('elbow','reach_target','seat_contact_refined','seat_hands_refined'):
        action=bpy.data.actions[clip];is_seat=clip.startswith('seat')
        seat.hide_render=not is_seat
        frames=[]
        for i in range(9):
            t=i/8;reset(arm,action,t);v,g=sample(body);assert np.array_equal(g,f)
            pairs=bvh_pairs(v,f,weld);new=pairs-baseline
            if i==0:assert np.linalg.norm(v-v0,axis=1).max()<.0001
            rowframe={'t':t,'floor_min_m':float(v[:,2].min()),'nonadjacent_candidates':len(pairs),'new_pairs':len(new),'new_classes':classify(new),'example_pairs':[list(x) for x in sorted(new)[:20]]}
            if is_seat:
                rowframe['seat']=slab(v,f,lo,hi)
                if i==8:
                    prior=old[name]['poses'][clip]
                    assert abs(rowframe['floor_min_m']-prior['floor_min_m'])<.00001 and rowframe['seat']['intersecting_triangles']==0
            frames.append(rowframe)
            if clip in ('reach_target','seat_hands_refined') and i in (4,8):
                s.render.filepath=str((out/(path.stem+'-'+clip+'-'+str(i)+'.png')).resolve());bpy.ops.render.render(write_still=True)
        row['poses'][clip]=frames
    reset(arm);v,g=sample(body);assert np.linalg.norm(v-v0,axis=1).max()<.0001
    report[name]=row
    (out/'motion.json').write_text(json.dumps(report,indent=2))
    print(name,json.dumps({k:{'max_new_pairs':max(f['new_pairs'] for f in frames),'floor_min_m':min(f['floor_min_m'] for f in frames),'max_seat_triangles':max(f.get('seat',{}).get('intersecting_triangles',0) for f in frames)} for k,frames in row['poses'].items()}),flush=True)
assert len(report)==6 and len(list(out.glob('*.png')))==24
frames=[f for r in report.values() for fs in r['poses'].values() for f in fs]
assert len(frames)==216
summary={'evidence_complete':True,'samples':len(frames),'new_pair_candidates_max':max(f['new_pairs'] for f in frames),'floor_min_m':min(f['floor_min_m'] for f in frames),'seat_intersecting_triangles_max':max(f.get('seat',{}).get('intersecting_triangles',0) for f in frames),'sampled_no_new_contacts':all(f['new_pairs']==0 and f['floor_min_m']>=-.001 and f.get('seat',{}).get('intersecting_triangles',0)==0 for f in frames),'note':'BVH skin candidates classified by dominant region; neutral pairs retained separately. Not continuous collision detection or production animation certification. Eyes excluded, reach target has no object fixture.'}
(out/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
