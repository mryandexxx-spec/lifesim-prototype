import json,base64,io,hashlib
from pathlib import Path
from PIL import Image,ImageStat,ImageChops
from playwright.sync_api import sync_playwright
R=Path('skin-lookdev');L=R/'lab';F=L/'comparison'
report={'frames':[],'mobile':[]}
def ready(p,sex,v):
    p.wait_for_function("s=>window.labState?.ready&&window.labState.sex===s[0]&&window.labState.variant===s[1]",arg=[sex,v],timeout=60000)
def state(p,k):
    p.locator('#reset').click()
    if k.startswith('all-'):
        v=1 if k=='all-pos' else -1
        for a in ['jaw','cheeks','nose','mouth','eyes']:p.locator('#s-'+a).evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))}",v)
    elif k!='neutral':p.locator('[data-expr="'+k+'"]').click()
    weights=p.evaluate('window.labState.weights');actual=p.evaluate('window.actualWeights')
    assert actual and all(len(x)==15 and all(abs(w-weights.get(n,0))<1e-6 for n,w in x.items()) for x in actual)
def shot(p,path):
    data=p.locator('#canvas').evaluate("c=>c.toDataURL('image/png')")
    im=Image.open(io.BytesIO(base64.b64decode(data.split(',',1)[1]))).convert('RGB').resize((384,384))
    std=max(ImageStat.Stat(im.crop((96,96,288,288))).stddev)
    if std<=5:
        # WebKit software framebuffer readback may be blank while compositor is valid.
        im=Image.open(io.BytesIO(p.locator('#canvas').screenshot(timeout=10000))).convert('RGB').resize((384,384))
        std=max(ImageStat.Stat(im.crop((96,96,288,288))).stddev)
    im.save(path);return std
with sync_playwright() as pw:
    for engine in ['chromium','webkit']:
        b=getattr(pw,engine).launch(headless=False,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if engine=='chromium' else [])
        p=b.new_page(viewport={'width':900,'height':950},device_scale_factor=1);errs=[];p.on('pageerror',lambda e:errs.append(str(e)))
        p.goto('http://127.0.0.1:8765/index.html');ready(p,'male','candidate')
        p.add_style_tag(content='.view{width:384px!important;height:384px!important;max-width:none!important}')
        for sex in ['male','female']:
            p.locator('#candidate').click();ready(p,p.evaluate('window.labState.sex'),'candidate');p.locator('#'+sex).click();ready(p,sex,'candidate')
            for v in ['original','candidate','mobile']:
                p.locator('#'+v).click();ready(p,sex,v)
                for k in (['neutral','all-pos','all-neg','smile','blink','jawopen','neck_neg','neck_pos'] if v=='candidate' else ['neutral']):
                    state(p,k)
                    for a in ([0,45,90] if k in ['neutral','all-pos','all-neg','smile'] else [0]):
                        p.locator('[data-angle="'+str(a)+'"]').click();p.wait_for_timeout(220)
                        path=F/f'{sex}-{k}-{a}-{engine}-{v}.png';std=shot(p,path)
                        report['frames'].append(dict(sex=sex,state=k,angle=a,engine=engine,variant=v,std=std,valid=std>5))
                        if engine=='chromium':assert std>5,path
            for v in ['original','candidate','mobile']:
                a=Image.open(F/f'{sex}-neutral-0-{engine}-{v}.png');z=Image.open(F/f'{sex}-neutral-90-{engine}-{v}.png')
                d=max(ImageStat.Stat(ImageChops.difference(a,z)).mean)
                if engine=='chromium':assert d>3,(sex,v,d)
                if d<=3:
                    for x in report['frames']:
                        if x['sex']==sex and x['engine']==engine and x['variant']==v:x['valid']=False
        assert not errs,errs
        for width,height in [(390,844),(320,568)]:
            m=b.new_page(viewport={'width':width,'height':height},device_scale_factor=1,has_touch=True);m.goto('http://127.0.0.1:8765/index.html');ready(m,'male','candidate')
            for sex in ['male','female']:
                m.locator('#'+sex).click();ready(m,sex,'candidate');state(m,'all-pos')
                m.locator('[data-angle="90"]').click();m.wait_for_timeout(300);std=shot(m,R/f'mobile-{engine}-{width}-{sex}.png')
                assert m.evaluate('document.documentElement.scrollWidth<=innerWidth')
                if engine=='chromium':assert std>5
                report['mobile'].append(dict(sex=sex,engine=engine,width=width,std=std,valid=std>5))
            m.close()
        b.close()
for x in report['mobile']:
    if x['engine']=='webkit' and not all(y['valid'] for y in report['frames'] if y['engine']=='webkit' and y['sex']==x['sex']):x['valid']=False
report['webkit_visual']='PASS_NONBLANK_ONLY' if all(x['valid'] for x in report['frames'] if x['engine']=='webkit') else 'OPEN_INVALID_FRAME'
report['art']='OPEN: direct review required'
(R/'browser-report.json').write_text(json.dumps(report,indent=2));(L/'BROWSER-REPORT.json').write_text(json.dumps(report,indent=2))
files={str(p.relative_to(L)):hashlib.sha256(p.read_bytes()).hexdigest() for p in L.rglob('*') if p.is_file() and p.name!='SHA256SUMS.json'}
(L/'SHA256SUMS.json').write_text(json.dumps(files,indent=2))
