"""Blender independent real skinned GLB reimport and matched pose renders."""
import bpy, pathlib, json, math
from mathutils import Vector
root=pathlib.Path('d2');renders=root/'renders';renders.mkdir(exist_ok=True)
report={}
def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
def cube(name,loc,scale,color):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale
    o.data.materials.append(material(name,color));return o
def camera_at(pos,target):
    c=bpy.context.scene.camera;c.location=pos;c.rotation_euler=(Vector(target)-c.location).to_track_quat('-Z','Y').to_euler()
def setup():
    s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=True
    s.render.resolution_x=480;s.render.resolution_y=640;s.render.resolution_percentage=100
    s.world=bpy.data.worlds.new('Diagnostic World')
    s.world.use_nodes=True
    s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.22,.22,.22,1)
    s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
    bpy.ops.object.camera_add();s.camera=bpy.context.object;s.camera.data.type='ORTHO';s.camera.data.ortho_scale=2.25
    for loc,power,size in [((3,-4,5),500,4),((-3,-2,3),250,3),((0,3,4),350,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
    cube('floor',(0,0,-.035),(8,8,.05),(.42,.44,.47))
def active_frame(arm,action,frame):
    # glTF importer uses separate NLA tracks; select exact action/slot and disable all others.
    for o in bpy.data.objects:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks:tr.mute=True
    ad=arm.animation_data_create();ad.action=action
    if hasattr(action,'slots') and len(action.slots):
        matches=[s for s in action.slots if s.target_id_type=='OBJECT']
        if matches:ad.action_slot=matches[0]
    bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
def vertices(mesh):
    dep=bpy.context.evaluated_depsgraph_get();o=mesh.evaluated_get(dep);m=o.to_mesh()
    q=[tuple(o.matrix_world@v.co) for v in m.vertices];o.to_mesh_clear();return q
seat=json.loads((root/'seat-report.json').read_text())
for path in sorted(root.glob('*.glb')):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];assert len(arms)==1
    arm=arms[0];assert len(arm.data.bones)==104
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert meshes
    body=max(meshes,key=lambda o:len(o.data.vertices))
    actions=list(bpy.data.actions)
    assert all(any(k in a.name for a in actions) for k in ('elbow','reach','seat_probe','seat_contact_candidate')),[a.name for a in actions]
    row={'blender_version':bpy.app.version_string,'bones':len(arm.data.bones),'actions':[a.name for a in actions],'mesh_vertices':len(body.data.vertices),'poses':{}}
    setup();fixture=seat[path.name]['fixture']
    # glTF +Z is Blender -Y. Chair is rendered as the fixed collision slab.
    chair=cube('seat fixture',(0,-fixture['center_z'],fixture['floor_m']+.43-.02),(.52,.42,.04),(.22,.34,.45))
    for k in ('elbow','reach','seat_probe','seat_contact_candidate'):
        action=next(a for a in actions if k in a.name);start,end=map(round,action.frame_range)
        active_frame(arm,action,start);v0=vertices(body)
        active_frame(arm,action,end);v1=vertices(body)
        move=max(math.dist(a,b) for a,b in zip(v0,v1));assert move>.02,(path.name,k,move)
        row['poses'][k]={'max_displacement_m':move,'floor_z_min_m':min(v[2] for v in v1)}
        chair.hide_render=not k.startswith('seat')
        for view,pos in [('front',(0,-4,1.05)),('profile',(4,0,1.05)),('threequarter',(3,-4,1.05))]:
            # Only the neutral and candidate seat need all angles; other poses keep profile and 3/4.
            if view=='front' and k in ('elbow','reach','seat_probe'):continue
            camera_at(pos,(0,0,.93));bpy.context.scene.render.filepath=str((renders/(path.stem+'-'+k+'-'+view+'.png')).resolve());bpy.ops.render.render(write_still=True)
    active_frame(arm,next(a for a in actions if 'elbow' in a.name),round(next(a for a in actions if 'elbow' in a.name).frame_range[0]))
    chair.hide_render=True
    for view,pos in [('front',(0,-4,1.05)),('profile',(4,0,1.05)),('threequarter',(3,-4,1.05))]:
        camera_at(pos,(0,0,.93));bpy.context.scene.render.filepath=str((renders/(path.stem+'-neutral-'+view+'.png')).resolve());bpy.ops.render.render(write_still=True)
    report[path.name]=row
    (root/'blender-report.json').write_text(json.dumps(report,indent=2))
print('actual Blender reimport and pose renders complete',flush=True)
