"""D4: independent Blender-evaluated triangle/fixture audit of exact D3 candidates.
Audit success means evidence generated, NOT contact acceptance. No asset mutation."""
import hashlib, json, pathlib, math
import numpy as np

PINS={
'female-grid_000.glb':'0d451d1e4a47327456f032af54346a365567a6bf5dbc5e0dbd124b520f6e1ebb',
'female-grid_111.glb':'00476da05bb6caf64c2179dd955b13d64a0cbf47a9067ae1313a34c0e4726bb4',
'female-grid_222.glb':'3ce163cca3fde91cec047a2def0e7b914b859f68405fac180acabf307ff705ea',
'male-grid_000.glb':'34f4ffee70c1b0199d36c353a6a6187c3d60d5d98f39a001f9a6d0370446388a',
'male-grid_111.glb':'d014cb0d9e6b02b5aaafbcffc57050a145b0d592396effea35b12900fca6eb31',
'male-grid_222.glb':'de0906ce2287d5e386dcc952848604b745c6b9530066b60be1c6d5081030904e'}
EPS=1e-7

def clip(poly,axis,bound,sign):
    if not len(poly):return []
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da=sign*(a[axis]-bound);db=sign*(b[axis]-bound)
        if da>=0:out.append(a)
        if (da>=0)!=(db>=0):out.append(a+(b-a)*da/(da-db))
    return out

def area(poly):
    if len(poly)<3:return 0.
    return sum(float(np.linalg.norm(np.cross(poly[i]-poly[0],poly[i+1]-poly[0])))*.5 for i in range(1,len(poly)-1))

def slab(v,faces,lo,hi):
    # Narrow phase clips complete triangles against all six solid box planes.
    # Inset epsilon excludes pure boundary contact, not genuine penetration.
    lo=np.asarray(lo)+EPS;hi=np.asarray(hi)-EPS
    tris=v[faces]
    mask=np.all(tris.max(axis=1)>=lo,axis=1)&np.all(tris.min(axis=1)<=hi,axis=1)
    count=0;surface=0.;depth=0.
    for t in tris[mask]:
        poly=list(t)
        for ax in range(3):
            poly=clip(poly,ax,lo[ax],1);poly=clip(poly,ax,hi[ax],-1)
            if not poly:break
        a=area(poly)
        if a>1e-14:
            count+=1;surface+=a;depth=max(depth,float(hi[2]-min(x[2] for x in poly)))
    return {'intersecting_triangles':count,'inside_surface_area_m2':surface,'max_inside_depth_below_top_m':depth}

def self_test():
    boxlo=[-.5,-.5,0];boxhi=[.5,.5,1];f=np.array([[0,1,2]])
    t=np.array([[-2.,0.,.5],[2.,0.,.5],[0.,2.,.5]])
    assert not np.any(np.all((t>=boxlo)&(t<=boxhi),axis=1))
    assert slab(t,f,boxlo,boxhi)['intersecting_triangles']==1
    assert abs(slab(t,f,boxlo,boxhi)['inside_surface_area_m2']-.5)<1e-5
    t[:,2]=1.;assert slab(t,f,boxlo,boxhi)['intersecting_triangles']==0
    t[:,2]=1.1;assert slab(t,f,boxlo,boxhi)['intersecting_triangles']==0

def main():
    import bpy
    from mathutils import Matrix,Vector
    assert bpy.app.version==(4,5,0)
    root=pathlib.Path('d3');out=pathlib.Path('d4');out.mkdir(exist_ok=True)
    seat=json.loads((root/'seat-report.json').read_text())
    prior=json.loads((root/'blender-report.json').read_text())
    assert set(p.name for p in root.glob('*.glb'))==set(PINS)==set(seat)==set(prior)
    refined=pathlib.Path('d4-candidates')
    refinement=json.loads((refined/'refinement.json').read_text())
    assert set(refinement)==set(PINS)
    report={}
    def reset(arm,action=None,frame=1):
        for o in bpy.data.objects:
            if o.animation_data:
                o.animation_data.action=None
                for track in o.animation_data.nla_tracks:track.mute=True
        for bone in arm.pose.bones:bone.matrix_basis=Matrix.Identity(4)
        bpy.context.view_layer.update()
        if action:
            ad=arm.animation_data_create();ad.action=action
            slots=[s for s in action.slots if s.target_id_type=='OBJECT']
            if slots:ad.action_slot=slots[0]
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
    def sample(body):
        o=body.evaluated_get(bpy.context.evaluated_depsgraph_get());m=o.to_mesh()
        try:
            v=np.array([tuple(o.matrix_world@x.co) for x in m.vertices])
            m.calc_loop_triangles()
            f=np.array([tuple(t.vertices) for t in m.loop_triangles],dtype=int)
            assert np.isfinite(v).all() and len(f)>1000
            return v,f
        finally:o.to_mesh_clear()
    def fixture(name,center,dims,color):
        bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.dimensions=dims
        m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);o.data.materials.append(m);return o
    for name,pin in sorted(PINS.items()):
        original=root/name;assert hashlib.sha256(original.read_bytes()).hexdigest()==pin
        path=refined/name;candidate_pin=refinement[name]['candidate_sha256']
        assert refinement[name]['source_sha256']==pin and hashlib.sha256(path.read_bytes()).hexdigest()==candidate_pin
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
        arms=[o for o in bpy.context.scene.objects if o.type=='ARMATURE'];assert len(arms)==1
        arm=arms[0];assert len(arm.data.bones)==104
        body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices))
        reset(arm);neutral,faces=sample(body)
        fx=seat[name]['fixture'];floor=fx['floor_m'];top=floor+fx['height_m'];cy=-fx['center_z']
        lo=[-fx['width_m']/2,cy-fx['depth_m']/2,top-.04];hi=[fx['width_m']/2,cy+fx['depth_m']/2,top]
        # Geometric sole groups chosen only once, in neutral (not tuned after posing).
        near=neutral[:,2]<floor+.018
        sides=[np.flatnonzero(near&(neutral[:,0]<0)),np.flatnonzero(near&(neutral[:,0]>0))]
        assert min(map(len,sides))>12
        groups=[]
        for ids in sides:
            y=neutral[ids,1];a,b=np.quantile(y,[.3,.7])
            groups.extend([ids[y<=a],ids[y>=b]])
        s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=True
        s.render.resolution_x=640;s.render.resolution_y=480;s.render.resolution_percentage=100
        s.world=bpy.data.worlds.new('Audit world');s.world.use_nodes=True
        s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.22,.22,.22,1)
        s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
        # Exact contact plane at z=floor (D3 floor visual top was 1cm lower).
        fixture('floor',(0,0,floor-.025),(8,8,.05),(.42,.44,.47))
        chair=fixture('seat',(0,cy,top-.02),(fx['width_m'],fx['depth_m'],.04),(.22,.34,.45))
        bpy.ops.object.camera_add();s.camera=bpy.context.object;s.camera.data.type='ORTHO';s.camera.data.ortho_scale=1.65
        for loc,power,size in [((3,-4,5),500,4),((-3,-2,3),250,3),((0,3,4),350,3)]:
            bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
        row={'source_sha256':pin,'candidate_sha256':candidate_pin,'neutral_floor_m':float(neutral[:,2].min()-floor),'poses':{}}
        for old,k in [('seat_contact_candidate','seat_contact_refined'),('seat_hands','seat_hands_refined')]:
            # Original clips preserved: replay D3 endpoint before testing appended correction.
            original_action=bpy.data.actions[old];reset(arm,original_action,round(original_action.frame_range[1]));original_v,_=sample(body)
            assert abs(float(original_v[:,2].min())-prior[name]['poses'][old]['floor_z_min_m'])<.00001
            a=bpy.data.actions[k];start,end=map(round,a.frame_range)
            reset(arm,a,start);v,f=sample(body);assert np.array_equal(f,faces)
            err=float(np.linalg.norm(v-neutral,axis=1).max());assert err<.0001
            reset(arm,a,end);v,f=sample(body);assert np.array_equal(f,faces)
            minimum=float(v[:,2].min()-floor)
            expected=refinement[name]['poses'][k]['floor_min_m']
            assert abs(minimum-expected)<.00001
            contact=slab(v,f,lo,hi)
            gaps=[float(v[g,2].min()-floor) for g in groups]
            inside=(abs(v[:,0])<=fx['width_m']/2)&(abs(v[:,1]-cy)<=fx['depth_m']/2)&(v[:,2]>=top)&(v[:,2]<top+.05)
            gap=float(v[inside,2].min()-top) if inside.any() else None
            row['poses'][k]={'neutral_error_m':err,'floor_min_m':minimum,'floor_vertices_below_1mm':int((v[:,2]<floor-.001).sum()),'sole_group_minima_m':gaps,'seat':contact,'seat_gap_m':gap,'strict_contact_pass':minimum>=-.001 and all(abs(x)<=.01 for x in gaps) and contact['intersecting_triangles']==0 and gap is not None and gap<=.01}
            for angle,pos in [('profile',(4,0,.65)),('threequarter',(3,-4,.8))]:
                s.camera.location=pos;s.camera.rotation_euler=(Vector((0,0,.55))-s.camera.location).to_track_quat('-Z','Y').to_euler()
                s.render.filepath=str((out/(path.stem+'-'+k+'-'+angle+'.png')).resolve());bpy.ops.render.render(write_still=True)
        reset(arm);v,f=sample(body);assert float(np.linalg.norm(v-neutral,axis=1).max())<.0001
        report[name]=row
        (out/'contact-audit.json').write_text(json.dumps(report,indent=2))
        print(name,json.dumps(row),flush=True)
    assert len(report)==6 and len(list(out.glob('*.png')))==24
    summary={'evidence_complete':True,'strict_contact_pass':all(p['strict_contact_pass'] for r in report.values() for p in r['poses'].values()),'note':'Endpoint triangle audit, not full motion/mesh self-collision or physical device certification.'}
    (out/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
    assert summary['strict_contact_pass'], 'Refined endpoint contact gate failed'

if __name__=='__main__':
    self_test()
    main()
