"""Original CC0-region-mask layered skin study, no geometry edits."""
import pathlib,json,struct,hashlib,math,copy,shutil,io,urllib.request,urllib.parse,zipfile,re
from html.parser import HTMLParser
import numpy as np
from PIL import Image,ImageFilter
from scipy.ndimage import gaussian_filter
import bpy
from mathutils import Vector
R=pathlib.Path("skin-lookdev"); L=R/"lab"; F=L/"comparison";F.mkdir(parents=True,exist_ok=True)
UV=pathlib.Path("verified-uv");SRC=pathlib.Path("pinned-vis")
PINS={'male':'1f9f6f7b814f834bea7b094c11015870f489591034bae94751e9edac4c2d6283','female':'5b372c1baf7d0dcb248bf9b66cd9862e64c849574b91f126472983db4f2d04aa'}
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
    r=p.read_bytes();assert r[:4]==b'glTF' and struct.unpack_from('<I',r,8)[0]==len(r)
    n,t=struct.unpack_from('<II',r,12);assert t==0x4e4f534a
    j=json.loads(r[20:20+n]);m,t=struct.unpack_from('<II',r,20+n);assert t==0x004e4942
    return j,r[28+n:28+n+m]
def acc(j,b,i):
    a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt=np.dtype({5125:'<u4',5126:'<f4'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
    assert 'sparse' not in a
    return np.ndarray((a['count'],w),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*w),dt.itemsize)).copy()
def append(j,b,a,kind):
    a=np.ascontiguousarray(a); b.extend(b'\0'*((-len(b))%4));v=len(j['bufferViews']);j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=a.nbytes));b.extend(a.tobytes())
    i=len(j['accessors']);j['accessors'].append(dict(bufferView=v,componentType={np.dtype('<f4'):5126,np.dtype('<u4'):5125}[a.dtype],count=len(a),type=kind,min=a.min(0).reshape(-1).tolist(),max=a.max(0).reshape(-1).tolist()));return i
def addtex(j,b,p):
    data=p.read_bytes();b.extend(b'\0'*((-len(b))%4));v=len(j['bufferViews']);j['bufferViews'].append(dict(buffer=0,byteOffset=len(b),byteLength=len(data)));b.extend(data)
    j['images'].append(dict(bufferView=v,mimeType='image/png'));j['textures'].append(dict(source=len(j['images'])-1,sampler=0));return len(j['textures'])-1
def write(p,j,b):
    b.extend(b'\0'*((-len(b))%4));j['buffers'][0]['byteLength']=len(b);s=json.dumps(j,separators=(',',':')).encode();s+=b' '*((-len(s))%4)
    p.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(s)+len(b))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(b),0x004e4942)+b)
def linear(c):
    x=np.asarray(c,dtype=np.float32)/255;return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
def encode(c):
    c=np.clip(c,0,1);return np.rint(255*np.where(c<=.0031308,12.92*c,1.055*c**(1/2.4)-.055)).astype(np.uint8)
def mix(a,c,w):return a*(1-w[...,None])+linear(c)*w[...,None]
def save(a,p):Image.fromarray(encode(a),'RGB').save(p,optimize=True)
REG=np.asarray(Image.open(UV/'vendor-region-map.png').convert('RGB'))
COLORS=[[16,231,186],[16,115,231],[255,101,0],[24,170,109]]
MODEL=json.loads((SRC/'models.json').read_text()); audit=json.loads((UV/'uv-report.json').read_text())
assert audit['same_corner_mapping']
for k,v in audit['donor_masks'].items():assert sha((UV/k).read_bytes())==v['sha256']
for n in ('NOTICE.txt','anny-README.md','anny-LICENSE','mpfb-LICENSE.md'):shutil.copy2(UV/n,L/n)
for n in ('index.html','lab.js','playcanvas.min.mjs','models.json'):shutil.copy2(SRC/n,L/n)
STATES={'neutral':{},'all-pos':{k+'_pos':1 for k in ('jaw','cheeks','nose','mouth','eyes')},'all-neg':{k+'_neg':1 for k in ('jaw','cheeks','nose','mouth','eyes')},'smile':{'smile':1},'blink':{'blink':1},'jawopen':{'jawopen':1},'neck_neg':{'neck_neg':1},'neck_pos':{'neck_pos':1}}
# Bake pointwise anatomically anchored tint/brows in the ORIGINAL UV map.
def spatial(pos,uv,tri,head,centers,size):
    brow=np.zeros((size,size),np.float32);cheek=brow.copy();nose=brow.copy()
    for t in tri[head]:
        a,b,c=uv[t]*size
        lo=np.maximum(np.floor(np.minimum(np.minimum(a,b),c)).astype(int),0);hi=np.minimum(np.ceil(np.maximum(np.maximum(a,b),c)).astype(int),size)
        if np.any(hi<=lo):continue
        X,Y=np.meshgrid(np.arange(lo[0],hi[0])+.5,np.arange(lo[1],hi[1])+.5)
        det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        if abs(det)<1e-10:continue
        w1=((X-a[0])*(c[1]-a[1])-(Y-a[1])*(c[0]-a[0]))/det
        w2=((b[0]-a[0])*(Y-a[1])-(b[1]-a[1])*(X-a[0]))/det
        w0=1-w1-w2;inside=(w0>=-1e-6)&(w1>=-1e-6)&(w2>=-1e-6)
        v=w0[...,None]*pos[t[0]]+w1[...,None]*pos[t[1]]+w2[...,None]*pos[t[2]]
        x,y,z=v.transpose(2,0,1)
        for center in centers:
            cx,cy,cz=center
            side=1 if cx>0 else -1
            along=(x-cx)*side/.020
            arch=cy+.015+.004*np.maximum(0,1-(along-.12)**2)-.003*np.maximum(0,along)
            thickness=.0017*(.30+.70*np.maximum(0,1-(along/1.1)**2))
            br=np.exp(-((y-arch)/np.maximum(thickness,.0004))**2)*np.clip((1.13-abs(along))*6,0,1)*np.clip((z-(cz-.020))/.012,0,1)
            ch=np.exp(-((x-cx-side*.012)/.022)**2-((y-cy+.024)/.017)**2)*np.clip((z-(cz-.035))/.027,0,1)
            sl=np.s_[lo[1]:hi[1],lo[0]:hi[0]]
            brow[sl]=np.maximum(brow[sl],br*inside);cheek[sl]=np.maximum(cheek[sl],ch*inside)
        cy=np.mean([c[1] for c in centers])
        no=np.exp(-(x/.014)**2-((y-cy+.019)/.020)**2)*np.clip((z-.075)/.03,0,1)
        nose[sl]=np.maximum(nose[sl],no*inside)
    return [gaussian_filter(x,.55) for x in (brow,cheek,nose)]
def mask(n,size):return np.asarray(Image.open(UV/('mpfb_'+n+'.jpg')).convert('L').resize((size,size),Image.Resampling.LANCZOS),np.float32)/255
def texture(sex,size,sp):
    base=[191,139,111] if sex=='male' else [215,166,143]
    a=np.broadcast_to(linear(base),(size,size,3)).copy()
    a=mix(a,[217,157,133] if sex=='male' else [232,182,164],mask('face',size)*.18)
    a=mix(a,[175,100,91] if sex=='male' else [191,112,112],sp[1]*.23+sp[2]*.08)
    a=mix(a,[185,105,92] if sex=='male' else [202,121,116],mask('ears',size)*.30)
    a=mix(a,[122,64,57] if sex=='male' else [151,79,86],mask('lips',size)*.80)
    a=mix(a,[124,72,64],mask('eyelids',size)*.23)
    a=mix(a,[64,28,33],mask('inside-mouth',size)*.96)
    a=mix(a,[211,174,151],np.maximum(mask('fingernails',size),mask('toenails',size))*.40)
    a=mix(a,[75,49,36] if sex=='male' else [104,65,46],sp[0]*.86)
    p=R/f'{sex}-albedo-{size}.png';save(a,p)
    return p
def eye_map(sex):
    sz=256;y,x=np.mgrid[:sz,:sz];x=(x+.5-sz/2)/(sz*.44);y=(y+.5-sz/2)/(sz*.44);r=np.hypot(x,y);angle=np.arctan2(y,x)
    a=np.broadcast_to(linear([232,222,211]),(sz,sz,3)).copy()
    iris=np.clip((.46-r)*80,0,1); radial=(np.sin(angle*31+r*38)+np.sin(angle*53-r*20))*.5
    a=mix(a,[99,68,40] if sex=='male' else [75,106,101],iris)
    a=mix(a,[151,108,64] if sex=='male' else [144,158,112],iris*np.clip(.24+radial*.10,0,.45))
    a=mix(a,[42,39,31],np.clip((.46-r)*80,0,1)*np.clip((r-.39)*40,0,1))
    a=mix(a,[18,17,15],np.clip((.19-r)*90,0,1))
    p=R/f'{sex}-iris.png';save(a,p);return p
def region_labels(uv,tri):
    xy=np.clip(np.rint(uv[tri].mean(1)*[REG.shape[1],REG.shape[0]]).astype(int),[0,0],[REG.shape[1]-1,REG.shape[0]-1])
    rgb=REG[xy[:,1],xy[:,0]]
    return rgb,[np.all(rgb==c,axis=1) for c in COLORS]
def pack(sex,j,b,orig,tri,groups,uvs,maps,rough,eye,out):
    # New buffers only for referenced data; exact source vertex/target remap.
    jj=copy.deepcopy(j);jj.update(accessors=[],bufferViews=[],buffers=[{'byteLength':0}],images=[],textures=[],samplers=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}]);bb=bytearray()
    t=addtex(jj,bb,maps);rr=addtex(jj,bb,rough);ee=addtex(jj,bb,eye)
    jj['materials']=[{'name':'skin','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':t},'metallicRoughnessTexture':{'index':rr},'metallicFactor':0,'roughnessFactor':1}}, {'name':'eyes','doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':ee},'metallicFactor':0,'roughnessFactor':.26}}]
    ps=[]; mapsrc=[]
    for gi,g in enumerate(groups):
        sub=tri[g];used,inv=np.unique(sub.ravel(),return_inverse=True);subidx=inv.reshape(-1,3)
        p={'attributes':{},'targets':[],'material':gi,'mode':4}
        for n,i in orig['attributes'].items():
            a=acc(j,b,i)[used];a=uvs[gi][used] if n=='TEXCOORD_0' else a
            p['attributes'][n]=append(jj,bb,a.astype('<f4'),{2:'VEC2',3:'VEC3'}[a.shape[1]])
        p['indices']=append(jj,bb,subidx.ravel().astype('<u4'),'SCALAR')
        for t in orig['targets']:p['targets'].append({n:append(jj,bb,acc(j,b,i)[used].astype('<f4'),'VEC3') for n,i in t.items()})
        ps.append(p);mapsrc.append(used)
    jj['meshes'][0]['primitives']=ps;write(out,jj,bb)
    k,z=read(out)
    for gi,p in enumerate(k['meshes'][0]['primitives']):
        used=mapsrc[gi];assert np.array_equal(used[acc(k,z,p['indices']).ravel()].reshape(-1,3),tri[groups[gi]])
        for n,i in orig['attributes'].items():
            if n!='TEXCOORD_0':assert np.array_equal(acc(k,z,p['attributes'][n]),acc(j,b,i)[used])
        for t,ot in zip(orig['targets'],p['targets']):
            for n,i in t.items():assert np.array_equal(acc(k,z,ot[n]),acc(j,b,i)[used]),n
    assert sum(int(g.sum()) for g in groups)==len(tri)
    return out.stat().st_size
def render(sex,path,kind):
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.shape_keys]
    assert meshes and all(len(o.data.shape_keys.key_blocks)==16 for o in meshes)
    scene=bpy.context.scene;center=Vector((0,0,MODEL[sex]['center']))
    scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.28,.28,1)
    for offset,power in [((-2,-4,1.8),1),((3,-3,.8),.45),((2,3,2),.3)]:
        bpy.ops.object.light_add(type='SUN',location=center+Vector(offset));l=bpy.context.object;l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler();l.data.energy=power;l.data.angle=0
    bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.44;cam.data.clip_end=10
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.exposure=math.log2(.85)
    for label,weights in (STATES.items() if kind=='candidate' else [('neutral',{})]):
        for o in meshes:
            for key in o.data.shape_keys.key_blocks[1:]:key.value=weights.get(key.name,0)
        bpy.context.view_layer.update()
        for angle in (0,45,90) if label in ('neutral','all-pos','all-neg','smile') else (0,):
            r=math.radians(angle);cam.location=center+Vector((math.sin(r)*1.9,-math.cos(r)*1.9,0));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
            p=F/f'{sex}-{label}-{angle}-blender-{kind}.png';scene.render.filepath=str(p.resolve());bpy.ops.render.render(write_still=True)
            im=Image.open(p).convert('RGBA');bg=Image.new('RGBA',im.size,(46,59,74,255));bg.alpha_composite(im);bg.convert('RGB').save(p)
    if kind=='candidate':
        for o in meshes:
            for key in o.data.shape_keys.key_blocks[1:]:key.value=0
        bpy.ops.wm.save_as_mainfile(filepath=str((R/f'{sex}-skin.blend').resolve()))
report={'status':'candidate; art and physical Safari OPEN','sexes':{},'donor':'not verified; no third-party albedo used'}
for sex,pin in PINS.items():
    p=UV/f'{sex}-checker.glb';assert sha(p.read_bytes())==pin
    j,b=read(p);o=j['meshes'][0]['primitives'][0];pos=acc(j,b,o['attributes']['POSITION']);uv=acc(j,b,o['attributes']['TEXCOORD_0']);tri=acc(j,b,o['indices']).reshape(-1,3)
    assert len(o['targets'])==15 and len(tri)==27420
    rgb,eyes=region_labels(uv,tri);eg=np.logical_or.reduce(eyes);assert eg.sum()==280
    centers=[];eyeuv=np.full_like(uv,.035)
    for front,back in zip(eyes[:2],eyes[2:]):
        idx=np.unique(tri[front|back]);fi=np.unique(tri[front]);c=(pos[idx].min(0)+pos[idx].max(0))/2;centers.append(c)
        ext=(pos[idx].max(0)-pos[idx].min(0))/2
        eyeuv[fi,0]=.5+.44*(pos[fi,0]-c[0])/ext[0];eyeuv[fi,1]=.5-.44*(pos[fi,1]-c[1])/ext[1]
    size=1024;sp=spatial(pos,uv,tri,np.all(rgb==[90,86,255],axis=1),centers,size)
    for n,a in zip(('brow','cheek','nose'),sp):Image.fromarray(np.rint(np.clip(a,0,1)*255).astype('u1')).save(R/f'{sex}-{n}-mask.png')
    albedo=texture(sex,size,sp);eye=eye_map(sex)
    rough=np.empty((512,512,3),np.uint8);rough[:,:,0]=255;rough[:,:,1]=np.rint(255*(.71-mask('lips',512)*.18)).astype('u1');rough[:,:,2]=0
    rp=R/f'{sex}-roughness.png';Image.fromarray(rough).save(rp,optimize=True)
    out=L/f'{sex}-candidate.glb';n=pack(sex,j,b,o,tri,[~eg,eg],[uv,eyeuv],albedo,rp,eye,out)
    shutil.copy2(SRC/f'{sex}-candidate.glb',L/f'{sex}-original.glb')
    assert sha((L/f'{sex}-original.glb').read_bytes())==audit['sexes'][sex]['source_sha']
    report['sexes'][sex]={'geometry_and_all_targets_exact':True,'triangles':len(tri),'eye_triangles':int(eg.sum()),'skin_maps_bytes':sum(p.stat().st_size for p in [albedo,rp,eye]),'glb_bytes':n,'sha256':sha(out.read_bytes()),'source_uv_sha':pin,'texture_memory_rgba8_mib':round((1024**2+512**2+256**2)*4*4/3/2**20,3)}
    (R/'report.json').write_text(json.dumps(report,indent=2))
    render(sex,out,'candidate');render(sex,L/f'{sex}-original.glb','original')
# Bounded donor retrieval probe: exact asset-name provenance; no unauthorized
# or unverified material use. Source comparison remains OPEN if inaccessible.
class Links(HTMLParser):
    def __init__(self):super().__init__();self.hrefs=[]
    def handle_starttag(self,t,attrs):
        if t=='a':
            h=dict(attrs).get('href','')
            if h:self.hrefs.append(h)
def donor_probe():
    result={}
    for pack in ('skins01','skins02'):
        page=f'https://static.makehumancommunity.org/assets/assetpacks/{pack}.html'
        try:
            with urllib.request.urlopen(page,timeout=15) as f:html=f.read(500000).decode('utf8',errors='replace')
            parser=Links();parser.feed(html);urls=[urllib.parse.urljoin(page,h) for h in parser.hrefs if '.zip' in h.lower()]
            result[pack]={'page':page,'archive_links':urls}
        except Exception as e:result[pack]={'page':page,'error':str(e)}
    return result
report['donor_probe']=donor_probe();(R/'report.json').write_text(json.dumps(report,indent=2))
h=(L/'index.html').read_text().replace('RESET-C-VIS','CF-SKIN/BASE').replace('Сравнение нативных морфов Anny. Нейтраль и мимика сохранены. Выбери «До» и «После» при одинаковых настройках.','Первый материал кожи и глаз. Сравнение с глиняной моделью.').replace('>До</button>','>Без текстур</button>').replace('>После</button>','>Кожа</button>').replace('Диагностическое сравнение света и камеры; художественная приёмка не завершена. Модели не изменены.','Диагностический материал; художественная приёмка не завершена. Геометрия и морфы сохранены.').replace('Согласованные кадры · Blender / PlayCanvas / исходный свет / только ось (нейтраль)','Реальные кадры · Blender и PlayCanvas').replace('<details><summary>Реальные рендеры Blender · до / после</summary><div class="grid" id="renders"></div></details>','')
(L/'index.html').write_text(h)
s=(L/'lab.js').read_text()
start=s.index('function gallery(){');end=s.index('async function load',start)
s=s[:start]+"""function gallery(){const p=$('pairs');p.replaceChildren();for(const state of ['neutral','all-pos','all-neg','smile'])for(const angle of [0,45,90]){const d=document.createElement('div');d.innerHTML='<p>'+state+' · '+angle+'°</p><div class="grid">'+['blender-candidate','chromium-candidate',...(state==='neutral'?['blender-original','chromium-original']:[])].map(k=>'<figure><img loading="lazy" src="comparison/'+sex+'-'+state+'-'+angle+'-'+k+'.png" alt="'+k+'"><figcaption>'+k+'</figcaption></figure>').join('')+'</div>';p.append(d)}}\n"""+s[end:]
s=s.replace("const a=await new Promise((resolve,reject)=>app.assets.loadFromUrl('./'+s+'-'+v+'.glb','container',(e,x)=>e?reject(e):resolve(x)));","const a=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Тайм-аут загрузки модели')),45000);app.assets.loadFromUrl('./'+s+'-'+v+'.glb','container',(e,x)=>{clearTimeout(timer);e?reject(e):resolve(x)})});")
s=s.replace("app.start();await load('male')","canvas.addEventListener('webglcontextlost',()=>{status.textContent='WebGL потерян. Перезагрузи страницу.'});app.start();await load('male')")
(L/'lab.js').write_text(s)
(L/'MATERIAL-REPORT.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
