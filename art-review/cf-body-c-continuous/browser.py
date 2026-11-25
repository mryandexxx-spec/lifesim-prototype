import pathlib,json,hashlib,io
from PIL import Image
from playwright.sync_api import sync_playwright
import numpy as np
R=pathlib.Path('body-c-continuous-out');L=R/'lab';F=L/'comparison';states=json.loads((L/'states.json').read_text());results=[]
with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser=getattr(p,engine).launch(headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-webgl'] if engine=='chromium' else [])
        for width,height in [(390,844),(320,568)]:
            page=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True,device_scale_factor=1)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto('http://127.0.0.1:8765/',wait_until='domcontentloaded')
            page.wait_for_function('window.labState?.ready===true',timeout=90000)
            for sex in ['male','female']:
                if sex!='male':page.locator('#female').tap();page.wait_for_function("window.labState?.ready&&window.labState.sex==='female'",timeout=90000)
                neutral=None
                for state,w in states.items():
                    # Actual rendering, no metadata-only PASS.
                    for angle in ([0,45,90] if width==390 else [0]):
                        page.evaluate('([s,a])=>window.setBodyState(s,a)',[state,angle])
                        page.wait_for_timeout(350)
                        weights=page.evaluate('window.actualWeights')
                        assert weights and all(all(abs(m.get(k,0)-v)<1e-5 for k,v in w.items() if k!='__scale') for m in weights),(engine,width,sex,state,weights)
                        actual=page.evaluate('window.labState')
                        assert abs(actual['actualScale']-w.get('__scale',1))<1e-5
                        active=[k for k,v in weights[0].items() if v>0 and k in ['slender','full','athletic','proportion_low','proportion_high','combined','combined_native_control']]
                        assert len(active)<=1
                        grid=[v for k,v in weights[0].items() if k.startswith('grid_') and v>0]
                        assert len(grid)<=8 and sum(grid)<=1.00001 and not (grid and active)
                        data=page.locator('#canvas').screenshot()
                        rgb=np.asarray(Image.open(io.BytesIO(data)).convert('RGB'))
                        nonflat=float(rgb.std(axis=(0,1)).mean())>3
                        digest=hashlib.sha256(data).hexdigest()
                        if state=='neutral' and angle==0:neutral=digest
                        valid=nonflat and (state=='neutral' or angle!=0 or digest!=neutral)
                        name=f'{sex}-{state}-{angle}-{engine}'
                        path=(F/(name+'.png')) if width==390 and engine=='chromium' else (R/(name+'-'+str(width)+'.png'))
                        path.write_bytes(data)
                        results.append({'engine':engine,'viewport':[width,height],'sex':sex,'state':state,'angle':angle,'valid_pixels':bool(valid),'sha256':digest,'weights_verified':True})
                page.locator('#s-fullness').evaluate("el=>{el.value='0.37';el.dispatchEvent(new Event('input',{bubbles:true}))}");assert page.evaluate("window.labState.preset==='custom' && Object.keys(window.labState.weights).some(k=>k.startsWith('grid_'))")
                page.locator('#reset').tap();assert all(v==0 for v in page.evaluate('window.labState.values').values());assert page.evaluate('window.labState.preset')=='neutral';assert page.evaluate('window.labState.heightScale')==1
            assert not errors,errors
            page.close()
        browser.close()
(R/'browser-report.json').write_text(json.dumps(results,indent=2))
assert all(x['valid_pixels'] for x in results if x['engine']=='chromium'),'Chromium blank/stale frames'
# WebKit blank/stale frames are explicitly OPEN, not reported as successful.
print('Chromium valid',sum(x['engine']=='chromium' and x['valid_pixels'] for x in results),'WebKit valid',sum(x['engine']=='webkit' and x['valid_pixels'] for x in results),'of',len(results))
(L/'SHA256SUMS.json').write_text(json.dumps({str(x.relative_to(L)):hashlib.sha256(x.read_bytes()).hexdigest() for x in sorted(L.rglob('*')) if x.is_file() and x.name!='SHA256SUMS.json'},indent=2))
