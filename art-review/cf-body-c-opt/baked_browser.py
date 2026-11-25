"""Fixed-body reference A/B using actual PlayCanvas. Pixel differences are measured, not hidden."""
import pathlib,json,io
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
R=pathlib.Path('opt-out');F=R/'baked-frames';F.mkdir(exist_ok=True)
states=json.loads(pathlib.Path('reviewed/lab/states.json').read_text());records=[];failures=[]
def settle(page):
    page.evaluate("""() => new Promise(resolve=>{let n=0;function f(){window.requestLabFrame();if(++n<5)requestAnimationFrame(f);else requestAnimationFrame(resolve)}requestAnimationFrame(f)})""")
    page.wait_for_timeout(100)
def pixels(data):return np.asarray(Image.open(io.BytesIO(data)).convert('RGB'),dtype=np.int16)
def nonflat(a):return float(a.std(axis=(0,1)).mean())>3
with sync_playwright() as p:
    for engine in ('chromium','webkit'):
        browser=getattr(p,engine).launch(headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-webgl'] if engine=='chromium' else [])
        for profile in ('grid_mix','grid_full_low_muscle_low_prop','combined'):
            pages=[]
            try:
                errors=[]
                for path in ('reference','baked-'+profile):
                    pg=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1);pages.append(pg)
                    pg.on('pageerror',lambda e:errors.append(str(e)))
                    pg.goto('http://127.0.0.1:8765/'+path+'/',wait_until='domcontentloaded');pg.wait_for_function('window.labState?.ready===true',timeout=90000)
                for sex in ('male','female'):
                    if sex=='female':
                        for pg in pages:pg.locator('#female').tap();pg.wait_for_function("window.labState?.ready&&window.labState.sex==='female'",timeout=90000)
                    scale=states[profile].get('__scale',1)
                    for angle,expression in [(0,None),(45,None),(90,None),(45,'smile'),(45,'blink')]:
                        for i,pg in enumerate(pages):
                            pg.evaluate('([s,a])=>window.setBodyState(s,a)',[profile if i==0 else 'neutral',angle])
                            if i:pg.locator('#height').evaluate('(el,v)=>{el.value=String(v);el.dispatchEvent(new Event("input",{bubbles:true}))}',scale)
                            if expression:
                                panel=pg.locator('details').filter(has=pg.locator('#face'))
                                if not panel.evaluate('el=>el.open'):
                                    panel.locator('summary').click()
                                button=panel.locator('[data-expr="'+expression+'"]')
                                assert button.is_visible()
                                button.click(timeout=10000)
                                assert button.get_attribute('aria-pressed')=='true'
                            settle(pg)
                            actual=pg.evaluate('window.labState')
                            assert abs(actual['actualScale']-scale)<1e-5,(profile,actual)
                            w=pg.evaluate('window.actualWeights')
                            assert w
                            if expression:
                                assert actual['expression']==expression
                                assert all(abs(m.get(expression,0)-1)<1e-5 for m in w)
                            expected={'body_baked':1} if i else {k:v for k,v in states[profile].items() if k!='__scale'}
                            assert all(all(abs(m.get(k,0)-v)<1e-5 for k,v in expected.items()) for m in w)
                            assert actual['targets']==[16,16] if i else actual['targets']==[48,48],actual
                        data=[pg.locator('#canvas').screenshot() for pg in pages]
                        a,b=map(pixels,data);d=np.abs(a-b)
                        for suffix,raw in zip(('reference','baked'),data):(F/f'{engine}-{profile}-{sex}-{angle}-{expression or "neutral"}-{suffix}.png').write_bytes(raw)
                        records.append({'engine':engine,'profile':profile,'sex':sex,'angle':angle,'expression':expression,'valid':bool(nonflat(a) and nonflat(b)),'mean_abs_pixel_delta':float(d.mean()),'p99_abs_pixel_delta':float(np.percentile(d,99)),'max_abs_pixel_delta':int(d.max()),'different_pixels_gt8_pct':float((d.max(axis=2)>8).mean()*100)})
                assert not errors,errors
            except Exception as e:
                failures.append({'engine':engine,'profile':profile,'error':repr(e)});print(engine,profile,repr(e),flush=True)
            finally:
                for pg in pages:pg.close()
        browser.close()
(R/'baked-browser-report.json').write_text(json.dumps({'records':records,'failures':failures},indent=2))
for e in ('chromium','webkit'):
    rows=[x for x in records if x['engine']==e]
    print('fixed-body',e,'valid',sum(x['valid'] for x in rows),'of',len(rows),'max mean delta',max((x['mean_abs_pixel_delta'] for x in rows),default=None),'max pixels >8 %',max((x['different_pixels_gt8_pct'] for x in rows),default=None),flush=True)
    if e=='chromium':
        assert len(rows)==30 and all(x['valid'] and x['mean_abs_pixel_delta']<=1 and x['different_pixels_gt8_pct']<=1 for x in rows) and not any(x['engine']==e for x in failures),'Fixed body Chromium visual regression'
