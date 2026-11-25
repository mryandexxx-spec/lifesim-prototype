"""OF-01 diagnostic: independent designed models and reconstructed old meshes, not game assets."""
import bpy, math, json, hashlib, random, pathlib, traceback
from mathutils import Vector, Euler
from math import sin,cos,pi
OUT=pathlib.Path('artifacts/of-mass'); LAB=OUT/'lab'; MESH=LAB/'models'; IMG=OUT/'blender'
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
    if id=='sconce.leaf':
        box('Mounted wall plane',(0,-.10,.16),(4,4,.12),mat('Wall plaster','#ddd7c8'))
    elif id.startswith('pool.'):
        box('Pool deck',(0,-.04,-.75),(3,.08,1.5),mat('Deck','#d8ceba'))
        box('Pool wall',(0,-.64,-.04),(3,1.2,.08),mat('Pool wall','#729aa3'))
    else:box('Studio floor',(0,-.055,0),(200,.1,200),mat('Ground','#c5c8bd'))
    sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=8;sc.cycles.use_denoising=True
    sc.render.resolution_x=360;sc.render.resolution_y=360;sc.render.resolution_percentage=100
    sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.62,.66,.72,1);sc.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    for name,p,power,size in [('Key',(3,5,-3 if id=='sconce.leaf' else 3),500,4),('Fill',(-3,3,-2 if id=='sconce.leaf' else 2),250,4)]:
        bpy.ops.object.light_add(type='AREA',location=V(p));o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(V((0,cy,0))-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=scale;sc.camera=cam
    sc.view_settings.view_transform='AgX'
    front=-1 if id in ('sconce.leaf','dresser.arch','mirror.oval','garden.bench') or id.startswith(('fanstand.','fanflag.')) else 1
    for label,pos in [('front',(0,cy+.25,5*front)),('three-quarter',(3.5,cy+2.5,4*front)),('profile',(5,cy+.25,.08*front))]:
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
# Original authored candidates. Shared mesh grammar; no donor or paid service.
def wood():return mat('Honey oak','#b88c5d')
def dark():return mat('Dark walnut','#775746')
def brass():return mat('Aged brass','#c5a56a',.4,.55)
def iron():return mat('Graphite','#434b48',.55,.35)
def cream():return mat('Warm ivory','#e8dfc7')
def green():return mat('Sage','#7d9280')
def mesh(name,verts,faces,materials,indices=None):
    m=bpy.data.meshes.new(name);m.from_pydata([V(p) for p in verts],[],faces);m.update()
    o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o)
    for a in materials:m.materials.append(a)
    if indices is not None:
        for f,i in zip(m.polygons,indices):f.material_index=i
    return o
def ringoval(name,p,rx,ry,zdepth,m,n=48):
    vs=[];fs=[]
    for i in range(n):
        a=2*pi*i/n
        for k in range(8):
            b=2*pi*k/8;vs.append((p[0]+(rx+zdepth*cos(b))*cos(a),p[1]+(ry+zdepth*cos(b))*sin(a),p[2]+zdepth*sin(b)))
    for i in range(n):
        for k in range(8):fs.append((i*8+k,((i+1)%n)*8+k,((i+1)%n)*8+(k+1)%8,i*8+(k+1)%8))
    o=mesh(name,vs,fs,[m])
    for f in o.data.polygons:f.use_smooth=True
def oval():
    for p,d,m in [((0,.79,0),(2.12,.13,1.25),wood()),((0,.075,0),(1.0,.15,.63),dark())]:cylinder('Soft elliptical top or base',p,d,m,48,.025)
    lathe('Turned central column',(0,0,0),[(.12,.24),(.19,.20),(.32,.13),(.58,.12),(.68,.21),(.725,.27)],dark(),32)
    for i in range(12):
        a=i*2*pi/12;tube('Fluted column rib',[(.14*cos(a),.23,.14*sin(a)),(.135*cos(a),.44,.135*sin(a)),(.17*cos(a),.64,.17*sin(a))],.018,wood(),2)
def sconce():
    box('Rounded wall escutcheon',(0,0,.05),(.22,.34,.10),dark(),.035)
    tube('Curved branching brass arm',[(0,0,.01),(0,-.14,-.12),(0,-.28,-.19)],.025,brass(),5)
    for sign,m in [(-1,green()),(1,cream())]:
        tube('Leaf stem',[(0,-.25,-.15),(sign*.11,-.20,-.19),(sign*.20,-.09,-.18)],.018,brass(),4)
        o=orb('Opal leaf shade',(sign*.15,-.27,-.18),(.24,.43,.14),m,20,12)
        o.rotation_euler[1]=sign*.38
def dresser():
    box('Cabinet carcass',(0,.58,0),(1.70,.92,.76),wood(),.026)
    box('Overhanging top',(0,1.06,0),(1.76,.075,.80),dark(),.022)
    for x in [-.41,.41]:
        for z in [-.27,.27]:box('Tapered foot',(x*1.7,.075,z),(.13,.15,.13),dark(),.02)
        box('Recessed door',(x,.56,-.407),(.75,.80,.045),cream(),.019)
        pts=[(x-.28,.22,-.444),(x-.28,.65,-.444),(x-.20,.84,-.444),(x,.91,-.444),(x+.20,.84,-.444),(x+.28,.65,-.444),(x+.28,.22,-.444)]
        tube('Arched applied moulding',pts,.018,wood(),3)
        orb('Brass pull',(x+(.27 if x<0 else -.27),.57,-.47),(.075,.075,.065),brass(),16,8)
def mirror():
    cylinder('Weighted oval base',(0,.07,0),(.64,.14,.44),dark(),40,.014)
    tube('Stand',[(0,.13,0),(0,.70,.02),(0,1.34,.02)],.035,brass(),4)
    # Flat elliptical reflective-looking tinted surface, no live reflection.
    o=cylinder('Flat oval mirror glass',(0,1.39,-.038),(.68,.034,1.20),mat('Muted mirror glass','#a9c7c9',.30,.10),48);o.rotation_euler[0]=pi/2
    ringoval('Continuous brass bezel',(0,1.39,-.055),.36,.63,.024,brass())
def spire():
    lathe('Stone plinth',(0,0,0),[(0,.29),(.024,.315),(.25,.315),(.28,.28)],cream(),32)
    for sign,m in [(-1,brass()),(1,iron())]:
        vs=[];fs=[]
        for i in range(17):
            t=i/16;y=.29+1.38*t;x=sign*(.08+.22*sin(pi*t)-.13*t);w=.035+.23*sin(pi*t)
            for j in range(5):
                u=j/4*2-1;vs.append((x+sign*.09*u*u,y,u*w+.10*sin(pi*t)*u))
        for i in range(16):
            for j in range(4):
                a=i*5+j;fs.append((a,a+1,a+6,a+5))
        o=mesh('Sculpted twisted sail',vs,fs,[m]);bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Cast thickness','SOLIDIFY');mod.thickness=.035;bpy.ops.object.modifier_apply(modifier=mod.name)
        for f in o.data.polygons:f.use_smooth=True
    orb('Finial',(-.12,1.73,0),(.16,.16,.16),brass(),16,8)
def sports(id,color):
    ink=iron();gold=brass();tone=mat('Club '+id,color);white=cream()
    if id.startswith('fanflag'):
        lathe('Weighted pedestal',(0,0,0),[(0,.20),(.035,.22),(.13,.18),(.19,.11)],ink,24)
        cylinder('Brass mast',(0,1,0),(.055,1.67,.055),gold,16)
        vs=[];fs=[]
        for i in range(13):
            t=i/12;x=-.03-.55*t
            for j in range(9):
                u=j/8;y=1.20+.56*u+.10*t*(1-abs(2*u-1));vs.append((x,y,-.035+.045*sin(t*pi*2+u*.8)))
        inds=[]
        idx=['copper-gulls','forest-lanterns','sapphire-sparks','amber-pier','moon-foxes','steppe-sails'].index(id.split('.')[1])
        for i in range(12):
            for j in range(8):
                a=i*9+j;fs.append((a,a+9,a+10,a+1));motif=2<=i<10 and i%2==0 and (4<=j<=5 if idx%2==0 else 3<=j<=4) and (i-2)//2<min(4,idx+2);accent=(idx>=4 and j==6 and 4<=i<=7);inds.append(2 if motif or accent else 0 if j>=2 else 1)
        o=mesh('Woven rippled pennant with integral club motif',vs,fs,[tone,ink,white],inds);bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Fabric thickness','SOLIDIFY');mod.thickness=.008;bpy.ops.object.modifier_apply(modifier=mod.name)
        for f in o.data.polygons:f.use_smooth=True
        tube('Top brass rod',[(.02,1.80,0),(-.58,1.80,-.03)],.023,gold,3)
    else:
        box('Beveled pedestal',(0,.12,0),(.91,.24,.57),ink,.034)
        for x in [-.36,.36]:box('Frame upright',(x,.93,.14),(.075,1.48,.085),gold,.012)
        box('Frame cornice',(0,1.66,.14),(.84,.08,.12),gold,.013)
        box('Enamel team panel',(0,1.15,-.012),(.81,.88,.075),tone,.04)
        vs=[(-.24,1.43,-.08),(.24,1.43,-.08),(.21,1.08,-.08),(0,.91,-.08),(-.21,1.08,-.08)]
        o=mesh('Original shield relief',vs,[(0,1,2,3,4)],[ink]);bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Shield relief','SOLIDIFY');mod.thickness=.04;bpy.ops.object.modifier_apply(modifier=mod.name)
        index=['copper-gulls','forest-lanterns','sapphire-sparks','amber-pier','moon-foxes','steppe-sails'].index(id.split('.')[1])
        for j in range(index+2):
            a=2*pi*j/(index+2);orb('Original crest medallion',(.15*cos(a),1.22+.14*sin(a),-.12),(.075,.075,.03),white if j%2 else gold,12,6)
        box('Footboard',(0,.25,-.26),(.76,.09,.16),gold,.015)
# Opaque folded foliage: one batched mesh, two materials, no alpha overdraw.
def leaves(name,centers,count,seed=41,length=.12):
    rng=random.Random(seed);vs=[];fs=[];inds=[]
    mats=[mat('Foliage shadow','#4d7950'),mat('Foliage sun','#82a465')]
    for x,y,z,rx,ry,rz in centers:
        for k in range(count):
            a=k*2.39996323;u=1-2*(k+.5)/count;s=math.sqrt(max(0,1-u*u))
            n=Vector((s*cos(a),u,s*sin(a)));c=Vector((x+rx*n.x,y+ry*n.y,z+rz*n.z))
            t=n.cross(Vector((0,1,0)))
            if t.length<.01:t=n.cross(Vector((1,0,0)))
            t.normalize();b=n.cross(t).normalized();ang=rng.random()*2*pi;axis=t*cos(ang)+b*sin(ang);side=n.cross(axis)
            l=length*rng.uniform(.75,1.25);w=l*.32
            off=len(vs);vs.extend([c-axis*l*.5,c-axis*l*.10+side*w,c+axis*l*.5,c-axis*l*.1-side*w,c+n*l*.16])
            fs.extend([(off,off+1,off+4),(off+1,off+2,off+4),(off+2,off+3,off+4),(off+3,off,off+4)]);inds.extend([int(n.y+rng.uniform(-.7,.7)>0)]*4)
    mesh(name,vs,fs,mats,inds)
def foliage(id):
    bark=mat('Bark','#806348');deep=mat('Foliage shadow','#4d7950');sun=mat('Foliage sun','#82a465')
    if id.startswith('tree'):
        tall=id.endswith('tall');broad=id.endswith('broad');h=2.45 if tall else 2.0;w=.48 if tall else .70 if broad else .50
        lathe('Root flare',(0,0,0),[(0,.14),(.07,.12),(.22,.075)],bark,12)
        tube('Curved trunk',[(0,.1,0),(-.045,.55,.02),(.04,h*.55,0),(0,h*.81,.02)],.075,bark,4,8)
        if tall:cs=[(0,h*.68,0,w*.83,.46,w*.8),(.05,h*.87,0,w*.62,.42,w*.6),(-.12,h*.54,.03,w*.7,.29,w*.62)]
        else:cs=[(0,h*.79,0,w*.64,.32,w*.61),(-w*.57,h*.70,.10,w*.52,.28,w*.49),(w*.57,h*.72,-.08,w*.53,.30,w*.5),(.04,h*.94,.04,w*.47,.25,w*.45)]
        for i,(x,y,z,rx,ry,rz) in enumerate(cs):
            tube('Branch',[(0,h*.35,0),(x*.5,h*.61,z*.5),(x,y,z)],.033,bark,3,8)
            orb('Inner crown',(x,y,z),(rx*1.85,ry*1.85,rz*1.85),deep if i%2 else sun,10,6)
        leaves('Batched folded crown',cs,76,93,.17 if broad else .14)
    else:
        # Low overlapping branch-tip masses, not three exposed sphere cores.
        w=.30 if id.endswith('small') else .40 if id.endswith('flowering') else .49
        h=.49 if id.endswith('small') else .66 if id.endswith('flowering') else .57
        cs=[]
        if id=='hedge.short':
            w=.23;h=.75
            cs=[(x,y,z,.12,.15,.16) for x in [-.13,.13] for y,z in [(.19,0),(.38,.035),(.58,-.02),(.67,0)]]
        else:
            for i in range(7):
                ang=i*2.39996;rad=w*(.54 if i<5 else .22)
                cs.append((rad*cos(ang),h*(.35 if i<5 else .72),rad*sin(ang),w*.44,h*.30,w*.43))
        # Short stems below foliage keep the silhouette grounded.
        for i,(x,y,z,rx,ry,rz) in enumerate(cs):
            if i<5:tube('Low woody shoot',[(x*.18,.025,z*.18),(x*.7,y*.65,z*.7),(x,y,z)],.014,bark,2,8)
            orb('Irregular shaded leaf mass',(x,y,z),(rx*1.52,ry*1.55,rz*1.52),deep if i%3 else sun,8,5)
        leaves('Dense overlapping folded foliage',cs,32 if id!='hedge.short' else 24,18,.14 if id!='hedge.short' else .105)
        if id.endswith('flowering'):
            pink=mat('Rose blossom','#d99aa7')
            for i in range(8):
                x,y,z,rx,ry,rz=cs[i%len(cs)];flower_head((x,y+ry*.82,z),.065,pink,cream(),5)
def flower_head(c,r,petal,center,n=7):
    # Single petal corolla mesh, gently cupped, distinct silhouette.
    x,y,z=c;vs=[];fs=[]
    for i in range(n):
        a=2*pi*i/n;dx=cos(a);dz=sin(a);sx=-dz;sz=dx;o=len(vs)
        vs.extend([(x,y,z),(x+dx*r*.62+sx*r*.30,y+.015,z+dz*r*.62+sz*r*.30),(x+dx*r,y+.035,z+dz*r),(x+dx*r*.62-sx*r*.30,y+.015,z+dz*r*.62-sz*r*.30),(x+dx*r*.55,y+.025,z+dz*r*.55)])
        fs.extend([(o,o+1,o+4),(o+1,o+2,o+4),(o+2,o+3,o+4),(o+3,o,o+4)])
    o=mesh('Shaped petals',vs,fs,[petal]);bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Petal thickness','SOLIDIFY');mod.thickness=.003;bpy.ops.object.modifier_apply(modifier=mod.name)
    orb('Flower heart',(x,y+.026,z),(r*.65,.04,r*.65),center,12,6)
def flowers(id,stage=3,wet=False,harvested=False):
    stem=mat('Plant green','#527e46');leaf=mat('Leaf green','#78a65d');yellow=mat('Golden pollen','#e6b843')
    garden=id.startswith('garden.');herb='herb' in id;origin=.25 if garden else 0
    if garden:
        for x in [-.46,.46]:box('Cedar raised bed rail',(x,.105,0),(.08,.21,1.0),dark(),.013)
        for z in [-.46,.46]:box('Cedar end rail',(0,.105,z),(.84,.21,.08),wood(),.013)
        box('Inset soil',(0,.215,0),(.84,.07,.84),mat('Wet soil','#544536') if wet else mat('Dry soil','#795b42'),.015)
        spots=[(-.25,-.24),(.24,-.23),(-.22,.23),(.23,.23)]
    else:spots=[(-.12,-.11),(.12,.09),(0,.16),(.10,-.14)]
    if garden and stage==0:
        for x,z in spots:orb('Sown earth mound',(x,.255,z),(.13,.035,.13),mat('Seed earth','#806448'),10,5)
        return
    for i,(x,z) in enumerate(spots):
        h=((.22 if stage==1 else .51 if stage==2 else .65) if garden else .40)+.025*sin(i*2.4)
        if harvested:h=.42
        tube('Living stem',[(x,origin,z),(x+.015,origin+h*.54,z-.025),(x,origin+h,z)],.013 if garden else .009,stem,3)
        # Broad, paired foliage for herbs. Stage changes remain visually obvious.
        count=2 if stage==1 else 4 if harvested else 8 if herb else 5 if garden else 3
        for j in range(count):
            a=(j//2)*2.05+(j%2)*pi+i if herb else j*2.4+i
            y=origin+h*(.22+.64*(j//2)/max(1,(count-1)//2)) if herb else origin+h*(.25+j*.11)
            d=(.19 if 'melissa' in id else .165 if herb else .15 if garden else .085)
            if stage==1:d*=.57
            if harvested:d*=.8
            w=d*(.42 if 'melissa' in id else .31 if herb else .22)
            dx,dz=cos(a),sin(a);sx,sz=-dz,dx
            lift=d*.26
            vs=[(x,y,z),(x+d*.35*dx+w*sx,y+lift*.6,z+d*.35*dz+w*sz),(x+d*.72*dx+w*.7*sx,y+lift,z+d*.72*dz+w*.7*sz),(x+d*dx,y+lift*.65,z+d*dz),(x+d*.72*dx-w*.7*sx,y+lift,z+d*.72*dz-w*.7*sz),(x+d*.35*dx-w*sx,y+lift*.6,z+d*.35*dz-w*sz),(x+d*.49*dx,y+lift*1.5,z+d*.49*dz)]
            o=mesh('Broad folded botanical leaf',vs,[(j,(j+1)%6,6) for j in range(6)],[leaf]);bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Leaf thickness','SOLIDIFY');mod.thickness=.002;bpy.ops.object.modifier_apply(modifier=mod.name)
        if garden and (stage<3 or harvested):continue
        if herb:
            # Small paired top leaves, not spherical buds.
            for j in range(2):
                a=i+j*pi;d=.10;dx,dz=cos(a),sin(a)
                o=mesh('Herb growing tip',[(x,origin+h-.04,z),(x+d*.5*dx-.035*dz,origin+h+.02,z+d*.5*dz+.035*dx),(x+d*dx,origin+h+.05,z+d*dz),(x+d*.5*dx+.035*dz,origin+h+.02,z+d*.5*dz-.035*dx),(x+d*.5*dx,origin+h+.04,z+d*.5*dz)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],[leaf]);bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Leaf thickness','SOLIDIFY');mod.thickness=.002;bpy.ops.object.modifier_apply(modifier=mod.name)
        elif 'lavender' in id:
            purple=mat('Lavender','#8f77b6')
            # Six compact tapered flower whorls per stem, shared low-poly lathe.
            for j in range(6):
                r=.042*(1-j*.09)
                lathe('Lavender flower whorl',(x,origin+h-.09+j*.033,z),[(0,r*.50),(.011,r),(.024,r*.64),(.030,r*.28)],purple,7)
        elif 'tulip' in id:
            pink=mat('Tulip rose','#d893a2')
            for j in range(5):
                a=j*2*pi/5;o=orb('Upright cupped tulip petal',(x+.037*cos(a),origin+h+.04,z+.037*sin(a)),(.075,.13,.073),pink,8,5)
        else:
            petal=mat('Petal '+id,'#e5a352' if 'calendula' in id else '#7197d8' if 'cornflower' in id else '#f6eee0')
            flower_head((x,origin+h,z),.13 if garden else .085,petal,yellow,12 if 'calendula' in id else 8)
def bench():
    for x in [-.57,.57]:
        for z in [-.20,.20]:box('Cast frame leg',(x,.30,z),(.105,.60,.105),iron(),.014)
        tube('Curved back upright',[(x,.45,.20),(x,.68,.25),(x,1.15,.26)],.045,iron(),4)
        tube('Armrest',[(x,.58,-.24),(x,.81,-.21),(x,.85,.0),(x,.84,.25)],.031,iron(),4)
    for z in [-.23,0,.23]:box('Rounded seat slat',(0,.59,z),(1.50,.10,.17),wood(),.015)
    for y in [.81,.98,1.12]:box('Backrest slat',(0,y,.25),(1.50,.12,.07),wood(),.012)
def garden_table():
    cylinder('Round garden tabletop',(0,.86,0),(1.06,.11,1.06),wood(),48,.016)
    for i in range(4):
        a=pi/4+i*pi/2
        tube('Curved powder-coated leg',[(.39*cos(a),.025,.39*sin(a)),(.29*cos(a),.41,.29*sin(a)),(.18*cos(a),.80,.18*sin(a))],.044,iron(),4)
    lathe('Cross-brace hub',(0,0,0),[(.32,.13),(.36,.13),(.39,.10)],iron(),16)
def grill():
    for x in [-.48,.48]:
        for z in [-.28,.28]:cylinder('Tubular leg',(x,.36,z),(.09,.72,.09),iron(),12)
    box('Enamel firebox',(0,.70,0),(1.22,.30,.82),iron(),.055)
    for z in [-.375,.375]:box('Raised enamel side',(0,.89,z),(1.20,.24,.055),iron(),.014)
    for x in [-.58,.58]:box('End wall',(x,.89,0),(.055,.24,.72),iron(),.012)
    box('Coal tray',(0,.86,0),(1.08,.045,.66),mat('Coal','#2b3035'),.008)
    for i in range(9):
        x=-.48+i*.12;box('Cooking grate rod',(x,1.025,0),(.027,.025,.74),mat('Steel','#aebbc7',.4,.7),.005)
    for z in [-.30,.30]:box('Grate rail',(0,1.038,z),(1.19,.035,.04),iron(),.005)
    tube('Cool-touch side handle',[(.57,.85,-.15),(.71,.85,-.15),(.71,.85,.15),(.57,.85,.15)],.025,wood(),3)
def lantern(id):
    tall=id.endswith('standing');h=2.35 if tall else 1.06;w=.43 if tall else .34
    lathe('Flared cast foot',(0,0,0),[(0,.14 if tall else .11),(.04,.13 if tall else .10),(.12,.067)],iron(),20)
    cylinder('Fluted post',(0,h/2,0),(.105,h,.105),iron(),16)
    box('Lantern sill',(0,h-.18,0),(w,.07,w),iron(),.013)
    orb('Opal inner diffuser',(0,h+.02,0),(w*.65,.28,w*.65),mat('Warm opal','#fff0c9',.4),16,10)
    for x in [-w*.43,w*.43]:
        for z in [-w*.43,w*.43]:box('Open metal lantern frame',(x,h+.02,z),(.033,.38,.033),iron(),.005)
    lathe('Spun rain cap',(0,h+.20,0),[(0,w*.68),(.045,w*.68),(.15,w*.25),(.17,.04)],iron(),24)
    orb('Cap finial',(0,h+.39,0),(.07,.07,.07),brass(),12,6)
def fence():
    for x in [-.20,.20]:
        box('Cedar post',(x,.44,0),(.09,.88,.10),dark(),.01)
        box('Post cap',(x,.875,0),(.105,.045,.115),wood(),.009)
    for y in [.30,.63]:box('Mortised horizontal rail',(0,y,0),(.51,.095,.09),wood(),.012)
def steps():
    stone=mat('Pool ivory stone','#d1d6cf')
    for i in range(3):
        top=-.04-i*.19;h=top+1.2
        box('Soft edge submerged step',(0,-1.2+h/2,.09+i*.20),(.47,h,.206),stone,.009)
        for x in [-.15,0,.15]:box('Nonslip inset',(x,top+.002,.09+i*.20),(.12,.004,.14),mat('Nonslip ivory','#b0c3bf'),.001)
def board():
    steel=mat('Marine steel','#a6bfcb',.32,.65)
    box('Anchored foot',(0,.035,-.18),(.40,.07,.43),cream(),.01)
    box('Tapered support',(0,.22,-.18),(.24,.39,.27),steel,.03)
    box('Rounded springboard',(0,.435,.12),(.46,.085,.94),mat('Sand nonslip','#e6d0a5'),.018)
    for j in range(5):box('Nonslip raised rib',(0,.479,.12+j*.09),(.38,.006,.024),mat('Sand grip','#baa983'),.002)
    box('Protected board lip',(0,.435,.585),(.46,.085,.024),steel,.008)
from shutil import copy2
catalog=json.loads((LAB/'catalog.json').read_text())
pilot=json.loads(pathlib.Path('reviewed/lab/manifest.json').read_text())
report={}
handlers={'diningtable.oval':oval,'sconce.leaf':sconce,'dresser.arch':dresser,'mirror.oval':mirror,'sculpture.spire':spire,'garden.bench':bench,'garden.table':garden_table,'garden.grill':grill,'fence.wood':fence,'pool.steps':steps,'pool.board':board}
for id,info in catalog.items():
    print('OF-MASS',id,flush=True)
    if id in pilot:
        report[id]={k:pilot[id][k] for k in ['old','new']}
        for v in report[id].values():copy2(pathlib.Path('reviewed/lab')/v['file'],LAB/v['file'])
        for f in pathlib.Path('reviewed/blender').glob(id+'-*.png'):
            if '-donor-' not in f.name:copy2(f,IMG/f.name)
    else:
        parts=base[id];lo=min(p['y']-p['sy']/2 for p in parts);hi=max(p['y']+p['sy']/2 for p in parts);width=max(abs(p['x'])+p['sx']/2 for p in parts)*2;depth=max(abs(p['z'])+p['sz']/2 for p in parts)*2
        centers[id]=((lo+hi)/2,max(hi-lo,width,depth)*1.45+.18)
        report[id]={}
        for kind in ['old','new']:
            reset()
            if kind=='old':
                for p in parts:
                    m=mat('old'+p['color'],p['color']);f={'box':box,'sphere':orb,'cylinder':cylinder}[p['kind']]
                    o=f(p['name'],(p['x'],p['y'],p['z']),(p['sx'],p['sy'],p['sz']),m)
                    if p.get('rotation'):o.rotation_euler=Euler((math.radians(p['rotation'][0]),-math.radians(p['rotation'][2]),math.radians(p['rotation'][1])),'XYZ')
            elif id in handlers:handlers[id]()
            elif id.startswith(('fanflag.','fanstand.')):sports(id,info['team'])
            elif id.startswith(('tree.','shrub.')) or id=='hedge.short':foliage(id)
            elif id.startswith(('flower.','garden.flower.','garden.herb.')):flowers(id)
            elif id.startswith('light.'):lantern(id)
            else:raise ValueError(id)
            report[id][kind]=export(id,kind)
            if kind=='new':bpy.ops.wm.save_as_mainfile(filepath=str((OUT/(id+'.blend')).resolve()))
            scene(id,kind)
    if id=='tree.round':
        reset();foliage(id);report[id]['lod']=export(id,'lod');scene(id,'lod')
    if info['category']=='garden':
        variants=[('seed',0,False,False),('sprout',1,False,False),('growing',2,False,False),('wet',3,True,False)]
        if 'herb' in id:variants.append(('harvested',3,False,True))
        for kind,stage,wet,harvested in variants:
            reset();flowers(id,stage,wet,harvested);report[id][kind]=export(id,kind);scene(id,kind)
    info['frame']=centers[id]
    (LAB/'manifest.json').write_text(json.dumps(report,indent=2))
    (LAB/'catalog.json').write_text(json.dumps(catalog,indent=2))
assert len(report)==43
