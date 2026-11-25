"""Pinned revision artifact -> donor study. No vendor shader/material code."""
import pathlib,hashlib,json,struct,math,io,copy
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image
import bpy
from mathutils import Vector
R=pathlib.Path('skin-lookdev');L=R/'lab';F=L/'comparison';UV=pathlib.Path('verified-uv')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):
    b=p.read_bytes();n,t=struct.unpack_from('<II',b,12)
    assert b[:4]==b'glTF' and t==0x4e4f534a and struct.unpack_from('<I',b,8)[0]==len(b)
    m,t=struct.unpack_from('<II',b,20+n);assert t==0x004e4942
    return json.loads(b[20:20+n]),b[28+n:28+n+m]
def write(p,j,b):
    b.extend(b'\0'*((-len(b))%4));j['buffers'][0]['byteLength']=len(b);s=json.dumps(j,separators=(',',':')).encode();s+=b' '*((-len(s))%4)
    p.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(s)+len(b))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(b),0x004e4942)+b)
def change_texture(src,dst,tex):
    j,b=read(src);k=copy.deepcopy(j);bb=bytearray(b);bb.extend(b'\0'*((-len(bb))%4))
    mat=k['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'];image=k['textures'][mat]['source'];v=len(k['bufferViews'])
    k['bufferViews'].append(dict(buffer=0,byteOffset=len(bb),byteLength=len(tex)));bb.extend(tex)
    k['images'][image]=dict(bufferView=v,mimeType='image/png')
    write(dst,k,bb);q,z=read(dst)
    assert z[:len(b)]==b and j['accessors']==q['accessors'] and j['meshes']==q['meshes'] and j['nodes']==q['nodes']
    return sha(dst)
def png(a):
    b=io.BytesIO();Image.fromarray(np.uint8(np.clip(np.rint(a),0,255)),'RGB').save(b,format='PNG',optimize=True);return b.getvalue()
def mask(name):
    return np.asarray(Image.open(UV/('mpfb_'+name+'.jpg')).convert('L').resize((1024,1024),Image.Resampling.LANCZOS),np.float32)/255
manifest=json.loads((L/'SHA256SUMS.json').read_text())
for n,h in manifest.items():assert sha(L/n)==h,n
source=json.loads((R/'report.json').read_text());models=json.loads((L/'models.json').read_text())
reg=np.asarray(Image.open(UV/'vendor-region-map.png').convert('RGB').resize((1024,1024),Image.Resampling.NEAREST))
report={'prior_run':45592921737,'prior_artifact':15013952135,'license_scope':'CC0 diffuse images only, not vendor mhmat/shader','art':'OPEN','sexes':{}}
for sex,pack,author,page,expected in [
    ('male','skins02','Mindfront','https://static.makehumancommunity.org/assets/assetpacks/skins02.html','268ee6d1ea9665f8050d040c7b47971884428628021418ae52f68912859f5e60'),
    ('female','skins01','callharvey3d','https://static.makehumancommunity.org/assets/assetpacks/skins01.html','dd0e953bb1ec3eee3d4956853599372c8faf5ba69982f0b4c3cc220b70cb0be0')]:
    meta=source['donor_probe'][pack]['selected'][0];assert meta['source_sha256']==expected
    original=np.asarray(Image.open(R/f'{sex}-albedo-1024.png').convert('RGB'),np.float32)
    donor=np.asarray(Image.open(R/meta['preview']).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS),np.float32)
    # Raw donor is a diagnostic; separate donor-derived candidate uses only restrained
    # detail in verified facial/skin region, suppresses donor hair and painted eyes/lips.
    face=mask('face');head=np.all(reg==[90,86,255],axis=2);body=np.all(reg==[0,0,0],axis=2)
    facial=face*head*(1-np.maximum.reduce([mask('lips'),mask('eyelids'),mask('inside-mouth')]))
    detail=donor-gaussian_filter(donor,(7,7,0))
    blend=np.clip(facial*.55+body*.20,0,.65)
    adapted=original+np.clip(detail,-22,22)*blend[...,None]
    src=L/f'{sex}-mobile.glb';assert sha(src)==source['sexes'][sex]['mobile_sha256']
    result={'author':author,'page':page,'source_texture_sha256':expected,'source_archive_sha256':source['donor_probe'][pack]['archive_sha256']}
    for kind,a in [('donor',donor),('layered',adapted)]:
        tex=png(a);(R/f'{sex}-{kind}-1024.png').write_bytes(tex);out=L/f'{sex}-{kind}.glb';h=change_texture(src,out,tex)
        result[kind]={'glb_sha256':h,'texture_bytes':len(tex),'unchanged_accessors_meshes_nodes_and_original_binary':True}
    report['sexes'][sex]=result
(R/'donor-report.json').write_text(json.dumps(report,indent=2))
# Reuse the previously verified camera/render function, without executing its pipeline.
code=pathlib.Path('art-review/cf-skin-base/lookdev.py').read_text()
start=code.index('def render(');end=code.index("report={'status':",start)
MODEL=models
exec(code[start:end],globals())
for sex in ('male','female'):
    for kind in ('donor','layered'):render(sex,L/f'{sex}-{kind}.glb',kind)
# Public lab contains only own generated GLBs and CC0 diffuse derivative,
# never the original .mhmat or vendor shader. Full-body controls diagnostic.
h=(L/'index.html').read_text()
h=h.replace('<button id="candidate"', '<button id="donor" aria-pressed="false">Донор CC0</button><button id="layered" aria-pressed="false">Донор + слои</button><button id="candidate"')
h=h.replace('<button data-angle="90">Профиль</button>','<button data-angle="90">Профиль</button><button data-angle="180">Сзади</button><button id="zoom">Портрет</button><button id="lighting">Нейтральный свет</button>')
h=h.replace('Первый материал кожи и глаз. Сравнение с глиняной моделью.','Сравнение оригинальной кожи, донорской текстуры CC0 и слоёв. Без одежды и волос: техническая лаборатория взрослых моделей.')
h=h.replace('</main>','<p>Донорские diffuse-текстуры: <a href="https://static.makehumancommunity.org/assets/assetpacks/skins01.html">callharvey3d</a> и <a href="https://static.makehumancommunity.org/assets/assetpacks/skins02.html">Mindfront</a>, CC0. Шейдеры и файлы материалов не заимствованы.</p></main>')
(L/'index.html').write_text(h)
s=(L/'lab.js').read_text()
s=s.replace("variant='candidate'","variant='mobile'",1)
s=s.replace("let visMode='matched'","let zoomMode=0,lightMode=0;let visMode='matched'",1)
s=s.replace("const r=a*Math.PI/180,z=models[sex].center;cam.setPosition", "const r=a*Math.PI/180,z=zoomMode?0.93:models[sex].center;cam.camera.orthoHeight=[.22,1.05,1.65][zoomMode];cam.setPosition")
s=s.replace("setVis(visMode);update()}","setVis(visMode);applyLight();update()}",1)
idx=s.index('function gallery(){')
s=s[:idx]+"""function applyLight(){const colors=[[1,1,1],[.92,.97,1],[1,.81,.64]];visLights.forEach((l,i)=>{l.light.color=new pc.Color(...(i===0?colors[lightMode]:[1,1,1]))});app.renderNextFrame=true}
$('zoom').onclick=()=>{zoomMode=(zoomMode+1)%3;$('zoom').textContent=['Портрет','В полный рост','Игровой масштаб'][zoomMode];rotate(angle)};
$('lighting').onclick=()=>{lightMode=(lightMode+1)%3;$('lighting').textContent=['Нейтральный свет','Дневной свет','Тёплый свет'][lightMode];applyLight()};
"""+s[idx:]
s=s.replace("['blender-original','chromium-original']","['blender-original','chromium-original','blender-donor','chromium-donor','blender-layered','chromium-layered']")
s=s.replace("if(loading)return;loading=true;","if(loading||model&&s===sex&&v===variant)return;loading=true;",1)
s=s.replace("$('mobile').disabled=true","$('mobile').disabled=$('donor').disabled=$('layered').disabled=true").replace("$('mobile').disabled=false","$('mobile').disabled=$('donor').disabled=$('layered').disabled=false")
s=s.replace("$('mobile').setAttribute('aria-pressed'", "$('donor').setAttribute('aria-pressed',String(v==='donor'));$('layered').setAttribute('aria-pressed',String(v==='layered'));$('mobile').setAttribute('aria-pressed'")
s=s.replace("$('mobile').onclick=", "$('donor').onclick=()=>load(sex,'donor',true);$('layered').onclick=()=>load(sex,'layered',true);$('mobile').onclick=")
# Diagnostic hook measures complete rendered RAF intervals with four live entities;
# separate per-resident texture allocation is NOT claimed (asset may be shared).
s += """
window.skinProbe=()=>({containers:app.assets.list().filter(a=>a.type==='container').length,renderComponents:app.root.findComponents('render').length,ready:!!model&&!loading});
window.skinBench=async()=>{if(!model||loading)throw Error('not ready');const extras=[];const a=asset;const old=cam.getPosition().clone();const oldHeight=cam.camera.orthoHeight;const oldPos=model.getPosition().clone();
try{model.setLocalPosition(-.66,0,0);for(let i=0;i<3;i++){const e=a.resource.instantiateRenderEntity();app.root.addChild(e);e.setLocalPosition(-.22+i*.44,0,0);extras.push(e)}cam.camera.orthoHeight=1.3;cam.setPosition(0,.93,3);cam.lookAt(0,.93,0);const frames=[];let previous;await new Promise(resolve=>{function tick(t){if(previous!==undefined)frames.push(t-previous);previous=t;if(frames.length>=90)resolve();else requestAnimationFrame(tick)}requestAnimationFrame(tick)});return {frames,entities:extras.length+1,sharedAsset:true};}finally{for(const e of extras)e.destroy();model.setPosition(oldPos);cam.setPosition(old);cam.camera.orthoHeight=oldHeight;rotate(angle);}};
"""
(L/'lab.js').write_text(s)
(L/'DONOR-REPORT.json').write_text(json.dumps(report,indent=2))
