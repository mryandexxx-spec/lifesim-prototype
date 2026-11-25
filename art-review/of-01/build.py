"""OF-01 diagnostic: independent designed models and reconstructed old meshes, not game assets."""
import bpy, math, json, hashlib, random, pathlib, traceback
from mathutils import Vector, Euler
from math import sin,cos,pi
OUT=pathlib.Path('artifacts/of-01'); LAB=OUT/'lab'; MESH=LAB/'models'; IMG=OUT/'blender'
for p in (MESH,IMG):p.mkdir(parents=True,exist_ok=True)
base=json.loads((LAB/'baseline.json').read_text())
def V(p): # game x,y,z -> Blender x,-z,y (glTF exporter inverse)
    return Vector((p[0],-p[2],p[1]))
def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def mat(name,h,rough=.65,metal=0):
    m=bpy.data.materials.get(name)
    if m:return m
    m=bpy.data.materials.new(name);m.use_nodes=True
    rgb=tuple(linear(int(h[i:i+2],16)/255) for i in (1,3,5))
    m.diffuse_color=(*rgb,1);n=m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value=(*rgb,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
    return m
def reset():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def finish(o,name,m,smooth=False):
    o.name=name;o.data.materials.append(m)
    if smooth:
        for f in o.data.polygons:f.use_smooth=True
    return o
def bevel(o,r,seg=2):
    bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=r;mod.segments=seg
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
def box(name,p,d,m,r=0,rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=V(p));o=bpy.context.object
    o.scale=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rot:o.rotation_euler=Euler((math.radians(rot[0]),-math.radians(rot[2]),math.radians(rot[1])),'XYZ')
    finish(o,name,m)
    if r:bevel(o,r)
    return o
def orb(name,p,d,m,seg=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=V(p));o=bpy.context.object;o.scale=(d[0]/2,d[2]/2,d[1]/2)
    return finish(o,name,m,True)
def cylinder(name,p,d,m,n=24,r=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=.5,depth=1,location=V(p));o=bpy.context.object;o.scale=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,m,True)
    if r:bevel(o,r)
    return o
def tube(name,pts,r,m,res=4,sides=8):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=res;c.bevel_depth=r;c.bevel_resolution=2 if sides>=12 else 1;c.use_fill_caps=True
    s=c.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
    for b,p in zip(s.bezier_points,pts):b.co=V(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.select_set(True);bpy.context.view_layer.objects.active=o;c.materials.append(m)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.ops.object.convert(target='MESH')
    for f in o.data.polygons:f.use_smooth=True
    return o
def lathe(name,center,profile,m,n=40):
    vs=[];faces=[]
    for y,r in profile:
        vs.extend([V((center[0]+r*cos(2*pi*i/n),center[1]+y,center[2]+r*sin(2*pi*i/n))) for i in range(n)])
    for j in range(len(profile)-1):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,a+n,b+n,b))
    if profile[0]==profile[-1]:
        # Close the shade shell without filling its open mouth or duplicating a cap.
        vs=vs[:-n];faces=[]
        for j in range(len(profile)-1):
            for i in range(n):
                a=j*n+i;b=j*n+(i+1)%n;k=((j+1)%(len(profile)-1))*n;faces.append((a,k+i,k+(i+1)%n,b))
    else:faces.extend([tuple(reversed(range(n))),tuple(range((len(profile)-1)*n,len(profile)*n))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,name,m,True)
def original(id):
    for p in base[id]:
        m=mat('old'+p['color'],p['color'])
        f={'box':box,'sphere':orb,'cylinder':cylinder}[p['kind']]
        args=(p['name'],(p['x'],p['y'],p['z']),(p['sx'],p['sy'],p['sz']),m)
        if p['kind']=='box':f(*args,rot=p.get('rotation'))
        else:f(*args)
def farm():
    oak=mat('Honey oak','#b88c5d');sage=mat('Painted sage','#7d9280');grain=mat('Oak end grain','#986b43')
    for i in range(5):
        z=-.50+i*.25
        box('Rounded solid oak plank '+str(i),(0,.795,z),(2.10,.13,.247),oak,.012)
    for x in (-.82,.82):
        for z in (-.43,.43):
            box('Tapered mortise leg',(x,.365,z),(.145,.73,.145),sage,.018)
            box('Leg shoulder',(x,.665,z),(.175,.085,.175),sage,.009)
        box('End apron',(x,.67,0),(.10,.14,.87),sage,.012)
    for z in (-.46,.46):box('Long apron',(0,.675,z),(1.67,.13,.105),sage,.012)
    # Central stretcher avoids dining knee space at the ends.
    box('Low longitudinal stretcher',(0,.21,0),(1.82,.085,.10),sage,.009)
    for x in (-.82,.82):
        box('End stretcher',(x,.21,0),(.10,.09,.9),sage,.009)
        for z in (-.43,.43):
            cylinder('Joinery peg',(x,.73,z),(.038,.009,.038),grain,12)
def lamp():
    ink=mat('Graphite cast iron','#434b48',.52,.35);brass=mat('Brushed aged brass','#c5a56a',.37,.65);cream=mat('Ivory enamel','#e8dfc7',.43)
    lathe('Weighted spun foot',(0,0,0),[(.0,.24),(.015,.255),(.048,.255),(.065,.23),(.08,.19)],ink)
    tube('Continuous bent brass stem',[(-.10,.065,0),(-.10,.72,0),(-.10,1.32,0),(-.04,1.55,0),(.17,1.65,0),(.38,1.58,0),(.48,1.49,0)],.032,brass,6,12)
    # Hollow shade via continuous double-wall profile, no opaque cap over bulb.
    lathe('Spun shade',(.48,1.23,0),[(.02,.205),(.035,.21),(.09,.19),(.19,.105),(.27,.07),(.29,.055),(.27,.045),(.19,.09),(.09,.177),(.035,.195),(.02,.205)],cream)
    orb('Bulb at authoritative light anchor',(.48,1.23,0),(.12,.12,.12),mat('Warm opal bulb','#fff0c9',.35),16,8)
def sculpture():
    stone=mat('Warm limestone','#d3c7ae');bronze=mat('Patinated bronze','#7e7663',.46,.65);clay=mat('Burnished terracotta','#b97860',.48)
    lathe('Turned limestone plinth',(0,0,0),[(0,.305),(.025,.33),(.24,.33),(.285,.30)],stone)
    tube('Continuous asymmetric sculpted bronze support',[(.04,.27,0),(.13,.48,0),(.14,.70,0),(.02,.91,0),(-.18,1.04,.06)],.095,bronze,8,12)
    orb('Counterbalanced clay sphere',(-.18,1.25,.06),(.48,.48,.48),clay,28,16)
    tube('Counterweight branch',[(.12,.67,0),(.23,.76,-.04),(.26,.85,-.06)],.05,bronze,5,12)
    orb('Bronze counterweight',(.26,.94,-.06),(.24,.24,.24),bronze,20,12)
def tree():
    bark=mat('Warm bark','#806348');greens=[mat('Leaf shade','#537849'),mat('Leaf sun','#769650')]
    # Curved trunk, flared root collar, five branching stems.
    lathe('Root collar',(0,0,0),[(0,.13),(.045,.12),(.18,.09),(.28,.085)],bark,16)
    tube('Curved trunk',[(0,.09,0),(-.035,.42,0),(.015,.86,.025),(-.025,1.30,0),(.02,1.65,.02)],.085,bark,5,12)
    random.seed(1423)
    crowns=[(0,1.67,0,.50),(-.34,1.53,.10,.33),(.34,1.54,-.12,.35),(.12,1.86,.19,.29),(-.17,1.80,-.24,.31)]
    for j,(x,y,z,r) in enumerate(crowns):
        if j:tube('Fork '+str(j),[(0,.70,0),(x*.48,1.11,z*.4),(x,y-.07,z)],.041,bark,4)
        # Small smooth shaded interior volumes, concealed by distinct outer foliage.
        orb('Interior foliage '+str(j),(x,y,z),(r*1.28,r*1.10,r*1.24),greens[0],12,8)
        for k in range(3):
            a=2*pi*k/3+j
            tube('Twig %d.%d'%(j,k),[(x,y-.09,z),(x+r*.45*cos(a),y+.02,z+r*.45*sin(a)),(x+r*.77*cos(a),y+r*.10,z+r*.77*sin(a))],.014,bark,3)
    # Actual shaped, folded leaf meshes distributed across the outer crown.
    # Shared two matte leaf materials, no transparent planes or expensive textures.
    verts=[];faces=[];shade=[]
    for j,(x,y,z,r) in enumerate(crowns):
        for k in range(112):
            a=k*2.3999632297+j*.71; u=1-2*(k+.5)/112
            s=math.sqrt(1-u*u); n=Vector((s*cos(a),u,s*sin(a)))
            center=Vector((x,y,z))+Vector((n.x*r*.88,n.y*r*.77,n.z*r*.87))
            center+=n*random.uniform(-.035,.055)
            tangent=n.cross(Vector((0,1,0)))
            if tangent.length<.01:tangent=n.cross(Vector((1,0,0)))
            tangent.normalize();bit=n.cross(tangent).normalized()
            angle=random.uniform(-pi,pi);axis=tangent*cos(angle)+bit*sin(angle);side=n.cross(axis)
            length=random.uniform(.095,.155);width=length*random.uniform(.38,.57)
            v=[center-axis*length*.5,center-axis*length*.12+side*width*.5,center+axis*length*.5,center+axis*length*.12-side*width*.5,center+n*length*.16]
            offset=len(verts);verts.extend(V(p) for p in v)
            faces.extend(tuple(offset+a for a in face) for face in [(0,1,4),(1,2,4),(2,3,4),(3,0,4)])
            shade.extend([int((n.y+random.uniform(-.6,.6))>.05)]*4)
    mesh=bpy.data.meshes.new('Folded leaf crown');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('Folded leaves',mesh);bpy.context.collection.objects.link(o)
    for m in greens:o.data.materials.append(m)
    for poly,k in zip(mesh.polygons,shade):poly.material_index=k
def ladder():
    steel=mat('Brushed marine stainless','#b5c3c5',.30,.72);grip=mat('Charcoal nonslip','#455b5d',.78)
    for x in (-.18,.18):
        cylinder('Deck flange',(x,.015,-.102),(.105,.03,.105),steel,24,.005)
        tube('Continuous pool handrail',[(x,.025,-.102),(x,.32,-.102),(x,.49,-.065),(x,.49,.09),(x,.35,.15),(x,.08,.15),(x,-.81,.15)],.0275,steel,6,12)
    for i in range(5):
        y=.12-i*.2
        box('Rounded steel rung '+str(i),(0,y,.15),(.37,.045,.06),steel,.009)
        box('Recessed anti-slip tread '+str(i),(0,y+.023,.15),(.28,.008,.04),grip,.003)
models={'diningtable.farm':farm,'floorlamp.arc':lamp,'sculpture.balance':sculpture,'tree.round':tree,'pool.ladder':ladder}
centers={'diningtable.farm':(.42,3.0),'floorlamp.arc':(.84,2.5),'sculpture.balance':(.73,2.3),'tree.round':(1.05,3.0),'pool.ladder':(-.15,2.1)}
def export(id,kind):
    objs=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.context.view_layer.update()
    coords=[V((0,0,0))] if not objs else [o.matrix_world@Vector(v) for o in objs for v in o.bound_box]
    assert objs and all(math.isfinite(n) for v in coords for n in v)
    bounds=[[min(v[i] for v in coords) for i in range(3)],[max(v[i] for v in coords) for i in range(3)]]
    tri=0
    for o in objs:o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
    # Join by material? Preserve original authored components for editable source, export as one mesh with material primitives.
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    path=MESH/(id+'-'+kind+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_texcoords=True,export_normals=True)
    data=path.read_bytes();assert data[:4]==b'glTF'
    return {'file':str(path.relative_to(LAB)),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':tri,'boundsBlender':bounds,'materials':len({m.name for m in bpy.context.object.data.materials if m})}
def scene(id,kind):
    cy,scale=centers[id]
    if id=='pool.ladder':
        box('Pool deck',(0,-.04,-.75),(3,.08,1.5),mat('Deck','#d8ceba'))
        box('Pool wall',(0,-.64,-.04),(3,1.2,.08),mat('Pool wall','#729aa3'))
    else:box('Studio floor',(0,-.055,0),(200,.1,200),mat('Ground','#c5c8bd'))
    sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=12;sc.cycles.use_denoising=True
    sc.render.resolution_x=420;sc.render.resolution_y=420;sc.render.resolution_percentage=100
    sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.62,.66,.72,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    for name,p,power,size in [('Key',(3,5,3),500,4),('Fill',(-3,3,2),250,4)]:
        bpy.ops.object.light_add(type='AREA',location=V(p));o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(V((0,cy,0))-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=scale;sc.camera=cam
    sc.view_settings.view_transform='AgX'
    for label,pos in [('front',(0,cy+.25,5)),('three-quarter',(3.5,cy+2.5,4)),('profile',(5,cy+.25,0))]:
        cam.location=V(pos);cam.rotation_euler=(V((0,cy,0))-cam.location).to_track_quat('-Z','Y').to_euler()
        sc.render.filepath=str(IMG/(id+'-'+kind+'-'+label+'.png'));bpy.ops.render.render(write_still=True)
def donor(id):
    # Donor bytes are downloaded by donors.py, imported and normalized for comparison only.
    cfg=OUT/'donors'/('table' if id=='diningtable.farm' else 'tree')/'source.json'
    if not cfg.exists():return None
    meta=json.loads(cfg.read_text());src=cfg.parent/meta['entry']
    if src.suffix.lower() in ('.glb','.gltf'):bpy.ops.import_scene.gltf(filepath=str(src))
    else:raise ValueError('unsupported donor')
    objs=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert objs
    # Remove parenting while preserving world transforms.
    for o in objs:
        w=o.matrix_world.copy();o.parent=None;o.matrix_world=w
    bpy.context.view_layer.update();pts=[o.matrix_world@Vector(v) for o in objs for v in o.bound_box]
    low=Vector([min(v[i] for v in pts) for i in range(3)]);high=Vector([max(v[i] for v in pts) for i in range(3)])
    mid=(low+high)/2;origin=Vector((mid.x,mid.y,low.z));factor=(.86 if id=='diningtable.farm' else 2.12)/(high.z-low.z)
    for o in objs:
        o.location=(o.location-origin)*factor;o.scale*=factor
    for o in list(bpy.context.scene.objects):
        if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
    return meta
report={}
for id,fn in models.items():
    report[id]={}
    for kind in ('old','new','donor') if id in ('diningtable.farm','tree.round') else ('old','new'):
        reset()
        if kind=='old':original(id)
        elif kind=='new':fn()
        else:
            try:
                meta=donor(id)
                if meta is None:continue
            except Exception as e:
                report[id]['donorError']=str(e);continue
        report[id][kind]=export(id,kind)
        if kind=='donor':report[id][kind]['source']=meta
        if kind=='new':
            bpy.ops.wm.save_as_mainfile(filepath=str((OUT/(id+'.blend')).resolve()))
        scene(id,kind)
        (LAB/'manifest.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
