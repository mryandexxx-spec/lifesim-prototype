import json,base64,io,hashlib,statistics,time
from pathlib import Path
from PIL import Image,ImageStat,ImageChops
from playwright.sync_api import sync_playwright
R=Path('skin-lookdev');L=R/'lab';F=L/'comparison';report={'frames':[],'switches':[],'bench':[],'mobile':[]}
def ready(p,s,v):
    p.wait_for_function("x=>window.labState?.ready&&window.labState.sex===x[0]&&window.labState.variant===x[1]",arg=[s,v],timeout=60000)
def capture(p,path):
    p.wait_for_timeout(300)
    data=p.locator('#canvas').evaluate("c=>c.toDataURL('image/png')")
    im=Image.open(io.BytesIO(base64.b64decode(data.split(',',1)[1]))).convert('RGB').resize((384,384))
    std=max(ImageStat.Stat(im.crop((96,96,288,288))).stddev)
    if std<=5:
        im=Image.open(io.BytesIO(p.locator('#canvas').screenshot(timeout=10000))).convert('RGB').resize((384,384));std=max(ImageStat.Stat(im.crop((96,96,288,288))).stddev)
    im.save(path);return std
def click(p,sex,v):
    p.locator('#'+v).click();ready(p,p.evaluate('window.labState.sex'),v)
    p.locator('#'+sex).click();ready(p,sex,v)
with sync_playwright() as pw:
    for engine in ('chromium','webkit'):
        b=getattr(pw,engine).launch(headless=False,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if engine=='chromium' else [])
        for width,height in [(390,844),(320,568)]:
            p=b.new_page(viewport={'width':width,'height':height},device_scale_factor=1,has_touch=True);errs=[];p.on('pageerror',lambda e:errs.append(str(e)))
            p.goto('http://127.0.0.1:8765/index.html');ready(p,'male','mobile')
            before=p.evaluate('skinProbe()')
            for n in range(20):
                sex='male' if n%2==0 else 'female';v=['original','mobile','donor','layered'][n%4];click(p,sex,v)
                assert all(x==15 for x in p.evaluate('window.labState.targets'))
                assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
                report['switches'].append({'engine':engine,'width':width,'n':n,'probe':p.evaluate('skinProbe()')})
            after=p.evaluate('skinProbe()')
            assert after['containers']<=before['containers']+1,(before,after)
            assert after['renderComponents']<=before['renderComponents']+1,(before,after)
            for sex in ('male','female'):
                for v in ('donor','layered'):
                    click(p,sex,v);p.locator('#reset').click()
                    for a in (0,45,90):
                        p.locator('[data-angle="'+str(a)+'"]').click()
                        path=F/f'{sex}-neutral-{a}-{engine}-{v}.png' if width==390 else R/f'{sex}-{a}-{engine}-{v}-{width}.png'
                        std=capture(p,path);report['frames'].append(dict(engine=engine,width=width,sex=sex,variant=v,angle=a,std=std,valid=std>5))
                        if engine=='chromium':assert std>5,path
                    paths=[F/f'{sex}-neutral-{a}-{engine}-{v}.png' if width==390 else R/f'{sex}-{a}-{engine}-{v}-{width}.png' for a in (0,90)]
                    d=max(ImageStat.Stat(ImageChops.difference(*[Image.open(x) for x in paths])).mean)
                    if engine=='chromium':assert d>3,(sex,v,d)
                    if d<=3:
                        for row in report['frames']:
                            if row['engine']==engine and row['width']==width and row['sex']==sex and row['variant']==v:row['valid']=False
                click(p,sex,'mobile');p.locator('#reset').click();p.locator('#zoom').click()
                for lighting in range(3):
                    std=capture(p,R/f'{sex}-body-{engine}-{width}-light{lighting}.png')
                    report['mobile'].append(dict(engine=engine,width=width,sex=sex,light=lighting,std=std,valid=std>5))
                    if engine=='chromium':assert std>5
                    p.locator('#lighting').click()
                p.locator('#zoom').click();capture(p,R/f'{sex}-game-{engine}-{width}.png');p.locator('#zoom').click()
            if engine=='chromium':
                for v in ('original','mobile','layered'):
                    click(p,'male',v)
                    a=p.evaluate('skinBench()');samples=sorted(a['frames']);median=statistics.median(samples)
                    report['bench'].append(dict(engine=engine,width=width,variant=v,entities=a['entities'],sharedAsset=a['sharedAsset'],median_ms=median,p95_ms=samples[int(.95*(len(samples)-1))],estimated_raf_fps=1000/median))
            assert not errs,errs;p.close()
            (R/'soak-report.json').write_text(json.dumps(report,indent=2))
        b.close()
for width in (390,320):
    a={x['variant']:x for x in report['bench'] if x['width']==width}
    for v in ('mobile','layered'):a[v]['median_regression_pct']=(a[v]['median_ms']/a['original']['median_ms']-1)*100
report['scope']='Software-rendered Chromium RAF with 4 shared-asset entities; not iPhone GPU or four independent texture sets. WebKit invalid frames are not passes.'
report['webkit_visual']='PASS_NONBLANK_ONLY' if all(x['valid'] for x in report['frames']+report['mobile'] if x['engine']=='webkit') else 'OPEN_INVALID_FRAME'
(R/'soak-report.json').write_text(json.dumps(report,indent=2));(L/'SOAK-REPORT.json').write_text(json.dumps(report,indent=2))
(L/'SHA256SUMS.json').write_text(json.dumps({str(p.relative_to(L)):hashlib.sha256(p.read_bytes()).hexdigest() for p in L.rglob('*') if p.is_file() and p.name!='SHA256SUMS.json'},indent=2))
