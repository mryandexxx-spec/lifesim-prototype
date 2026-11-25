"""Package exact tested RESET-C-FIX assets; no regeneration or game changes."""
import hashlib, pathlib, urllib.request, json, shutil
from PIL import Image
root=pathlib.Path('verified-native')
site=pathlib.Path('reset-fix-site')
site.mkdir(exist_ok=True)
base='https://lifesim-cf-body-reset-c-lab.vercel.app/'
pins={
'male-candidate.glb':'4ce29a6ffce21817f92bb2c7df8c27afe630d0dd88e373a05e2ceca591fdcbb8',
'female-candidate.glb':'f4973254fb39f2ff962f429725e66c17a478d7e4110ed556679babb400c7d85e',
'male-original.glb':'5873589a1a97b6fdccbe460b3aaf739b2539ce6a1f75520c5d12845ee6598eb3',
'female-original.glb':'fc8c47af2e9dfa0935bac0a2ad1384cf6b1a3926e255dd8728f145cf5bc5bf9f',
'male-candidate.blend':'7b15d1c7092c7fd880efd1ac0e2642533a797b2d0f6caa63f4e54ffbc641294f',
'female-candidate.blend':'c5a7f71716013e441276bb342e6c4769f2e654ba1926e32d0192d7742c04cbcb'}
for name,pin in pins.items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest()==pin,name
    if name.endswith('.glb'):shutil.copyfile(root/name,site/name)
report=json.loads((root/'report.json').read_text())
assert all(report[s]['glb_reimport']=='PASS' and report[s]['tested_identity_combinations']==243 for s in ('male','female'))
for sex in ('male','female'):
    c=json.loads((root/(sex+'-contacts.json')).read_text())
    assert len(c)==52 and all(v['new_candidates'][0]==0 and all(x<=y for x,y in zip(v['new_candidates'][1:],v['baseline_candidates'][1:])) for v in c.values())
for name in ('index.html','lab.js','playcanvas.min.mjs','models.json'):
    (site/name).write_bytes(urllib.request.urlopen(base+name,timeout=30).read())
# Reuse original published renderer & manifest, preserving the camera/lighting.
# Keep old and corrected assets switchable at exactly the same slider settings.
def patch(s,a,b):
    assert s.count(a)==1,a
    return s.replace(a,b)
h=(site/'index.html').read_text()
h=h.replace('LifeSim · RESET-C','LifeSim · RESET-C-FIX')
h=h.replace('Нативная Anny · два независимых нейтральных лица. Диагностический кандидат, без волос и одежды.','Сравнение нативных морфов Anny. Нейтраль и мимика сохранены. Выбери «До» и «После» при одинаковых настройках.')
h=patch(h,'<button id="reset">Сброс</button>','<button id="reset">Сброс</button><button id="original" aria-pressed="false">До</button><button id="candidate" aria-pressed="true">После</button>')
h=h.replace('height:clamp(285px,44vh,480px)','height:clamp(285px,48vh,480px)')
h=h.replace('Реальные рендеры Blender','Реальные рендеры Blender · до / после')
h=h.replace('Морфы геометрии, не фильтры.','Диагностический кандидат. Морфы геометрии, не фильтры.')
(site/'index.html').write_text(h)
js=(site/'lab.js').read_text()
js=patch(js,"angle=0,model,asset","angle=0,variant='candidate',model,asset")
js=patch(js,"window.labState={ready:","window.actualWeights=instances.map(mi=>Object.fromEntries(mi.morph.targets.map((t,i)=>[t.name,mi.getWeight(i)])));window.labState={variant,ready:")
js=patch(js,"async function load(s){","async function load(s,v=variant,keep=false){")
js=patch(js,"$('male').disabled=$('female').disabled=true;","$('male').disabled=$('female').disabled=$('original').disabled=$('candidate').disabled=true;")
js=patch(js,"'./'+s+'.glb'","'./'+s+'-'+v+'.glb'")
js=patch(js,"model=n;asset=a;instances=ms;sex=s;values=Object.fromEntries(axes.map(([k])=>[k,0]));expression='neutral';","model=n;if(asset&&asset!==a){asset.unload();app.assets.remove(asset)}asset=a;instances=ms;sex=s;variant=v;if(!keep){values=Object.fromEntries(axes.map(([k])=>[k,0]));expression='neutral'}$('original').setAttribute('aria-pressed',String(v==='original'));$('candidate').setAttribute('aria-pressed',String(v==='candidate'));")
js=patch(js,"$('male').disabled=$('female').disabled=false;","$('male').disabled=$('female').disabled=$('original').disabled=$('candidate').disabled=false;")
js=patch(js,"$('male').onclick=()=>load('male');","$('original').onclick=()=>load(sex,'original',true);$('candidate').onclick=()=>load(sex,'candidate',true);$('male').onclick=()=>load('male');")
# Use verified renders from the exact candidate run, grouped by axis and endpoint.
a=js.index('function gallery(){');b=js.index('async function load(',a)
js=js[:a]+"""function gallery(){const g=$('renders');g.replaceChildren();for(const [k,t] of axes){for(const side of ['neg','pos']){const n=k+'_'+side+'-'+(k==='nose'?'profile':'front');for(const old of [true,false]){const f=document.createElement('figure');f.innerHTML='<img loading="lazy" src="'+sex+'-'+(old?'old-':'')+n+'.jpg" alt="'+t+'"><figcaption>'+t+' '+(side==='neg'?'−':'＋')+' · '+(old?'до':'после')+'</figcaption>';g.append(f)}}}}
"""+js[b:]
(site/'lab.js').write_text(js)
for f in root.glob('*.png'):
    Image.open(f).convert('RGB').save(site/(f.stem+'.jpg'),quality=90)
# Rights provenance of the existing published source, without copying private docs.
(site/'NOTICE.txt').write_text('LifeSim RESET-C-FIX experimental derivative of the existing public RESET-C models. Anny 0.6.2, naver/anny commit 8f35dc2df1c4062fd2fae86734f9705de50c0c2b (Apache-2.0 code); MPFB and Face Units CC0 as documented by pinned upstream. PlayCanvas engine MIT; source: https://github.com/playcanvas/engine. Original source lab: '+base+'\nNo production asset or topology approval.\n')
(site/'evidence.json').write_text(json.dumps({'source_run':45563179091,'source_head':'0329a0f956cfbb0cee7216a4c76d7a59067fa9a7','model_sha256':pins,'contact_gate':'candidate counts only; penetration classification open'},indent=2))
# Retain the upstream pinned license and README provenance with the derivative.
for name in ('LICENSE','README.md'):
    (site/('anny-'+name)).write_bytes(urllib.request.urlopen('https://raw.githubusercontent.com/naver/anny/8f35dc2df1c4062fd2fae86734f9705de50c0c2b/'+name,timeout=30).read())
manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in site.iterdir()}
(site/'SHA256SUMS.json').write_text(json.dumps(manifest,indent=2))
print('Packaged',len(manifest),'files; exact candidate pins verified.')
