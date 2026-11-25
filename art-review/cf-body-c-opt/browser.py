"""A/B browser evidence: same accepted lab, only GLB payload differs."""
import base64, hashlib, io, json, os, pathlib, time
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

R=pathlib.Path('opt-out'); F=R/'frames'; F.mkdir(parents=True,exist_ok=True)
states=json.loads(pathlib.Path('reviewed/lab/states.json').read_text())
selected=['neutral','grid_full','grid_muscle','grid_proportion','grid_mix','grid_slender','grid_low_muscle','grid_low_proportion']
selected += [k for k in states if k in ('combined','blink','height_low','height_high','grid_full_low_muscle_low_prop')]
selected=list(dict.fromkeys(k for k in selected if k in states))
assert len(selected)>=8
records=[]; failures=[]
def rgb(data):return np.asarray(Image.open(io.BytesIO(data)).convert('RGB'),dtype=np.int16)
def valid(data):return float(rgb(data).std(axis=(0,1)).mean())>3
def digest(data):return hashlib.sha256(data).hexdigest()
def settle(page):
    page.evaluate("""() => new Promise(resolve=>{let n=0;function f(){window.requestLabFrame();if(++n<5)requestAnimationFrame(f);else requestAnimationFrame(resolve)}requestAnimationFrame(f)})""")
    page.wait_for_timeout(100)
def capture(page,state,angle):
    page.evaluate('([s,a])=>window.setBodyState(s,a)',[state,angle]);settle(page)
    weights=page.evaluate('window.actualWeights')
    assert weights and all(all(abs(m.get(k,0)-v)<1e-5 for k,v in states[state].items() if k!='__scale') for m in weights)
    assert abs(page.evaluate('window.labState.actualScale')-states[state].get('__scale',1))<1e-5
    screen=page.locator('#canvas').screenshot()
    data=page.evaluate("document.querySelector('#canvas').toDataURL('image/png')")
    assert data.startswith('data:image/png;base64,')
    direct=base64.b64decode(data.split(',',1)[1])
    return screen,direct,weights
with sync_playwright() as p:
    for engine,headed in [('chromium',False),('webkit',False),('webkit',True)]:
        label=engine+('-headed' if headed else '-headless')
        try:
            browser=getattr(p,engine).launch(headless=not headed,args=['--no-sandbox','--use-angle=swiftshader','--enable-webgl'] if engine=='chromium' else [])
            for width,height in [(390,844),(320,568)]:
                pages=[];errors=[]
                try:
                    for kind in ['reference','candidate']:
                        pg=browser.new_page(viewport={'width':width,'height':height},is_mobile=True,has_touch=True,device_scale_factor=1)
                        pages.append(pg);pg.on('pageerror',lambda e:errors.append(str(e)))
                        t=time.perf_counter();pg.goto('http://127.0.0.1:8765/'+kind+'/',wait_until='domcontentloaded')
                        pg.wait_for_function('window.labState?.ready===true',timeout=90000)
                        settle(pg)
                        records.append({'kind':'load','engine':label,'viewport':[width,height],'asset':kind,'male_load_ms':round((time.perf_counter()-t)*1000)})
                    for sex in ['male','female']:
                        if sex=='female':
                            for pg in pages:
                                t=time.perf_counter();pg.locator('#female').tap();pg.wait_for_function("window.labState?.ready&&window.labState.sex==='female'",timeout=90000)
                                records.append({'kind':'switch','engine':label,'viewport':[width,height],'female_switch_ms':round((time.perf_counter()-t)*1000),'asset':'reference' if pg==pages[0] else 'candidate'})
                        neutral={}
                        for state in selected:
                            for angle in ([0,45,90] if width==390 and state in ('neutral','grid_mix') else [0]):
                                a,ad,aw=capture(pages[0],state,angle);b,bd,bw=capture(pages[1],state,angle)
                                assert aw==bw
                                for name,data in [('reference',a),('candidate',b),('reference-direct',ad),('candidate-direct',bd)]:
                                    (F/f'{label}-{width}-{sex}-{state}-{angle}-{name}.png').write_bytes(data)
                                if state=='neutral' and angle==0:neutral={'a':digest(a),'b':digest(b),'ad':digest(ad),'bd':digest(bd)}
                                same=np.array_equal(rgb(a),rgb(b));dsame=np.array_equal(rgb(ad),rgb(bd))
                                av=valid(a) and (state=='neutral' or angle!=0 or digest(a)!=neutral['a'])
                                bv=valid(b) and (state=='neutral' or angle!=0 or digest(b)!=neutral['b'])
                                adv=valid(ad) and (state=='neutral' or angle!=0 or digest(ad)!=neutral['ad'])
                                bdv=valid(bd) and (state=='neutral' or angle!=0 or digest(bd)!=neutral['bd'])
                                records.append({'kind':'frame','engine':label,'viewport':[width,height],'sex':sex,'state':state,'angle':angle,'reference_valid':bool(av),'candidate_valid':bool(bv),'direct_reference_valid':bool(adv),'direct_candidate_valid':bool(bdv),'pixel_exact':bool(same),'direct_pixel_exact':bool(dsame),'max_pixel_delta':int(np.abs(rgb(a)-rgb(b)).max()),'weights_exact':True})
                    assert not errors,errors
                finally:
                    for pg in pages:pg.close()
            browser.close()
        except Exception as e:
            failures.append({'engine':label,'error':repr(e)})
            print(label,repr(e),flush=True)
report={'records':records,'failures':failures,'physical_safari':False,'note':'Software renderer timings are not physical FPS; invalid frames never pass.'}
(R/'browser-report.json').write_text(json.dumps(report,indent=2))
frames=[x for x in records if x['kind']=='frame']
expected=2*((len(selected)+4)+len(selected))
for engine in ['chromium-headless','webkit-headless','webkit-headed']:
    rows=[x for x in frames if x['engine']==engine]
    good=[x for x in rows if x['reference_valid'] and x['candidate_valid'] and x['pixel_exact']]
    direct=[x for x in rows if x['direct_reference_valid'] and x['direct_candidate_valid'] and x['direct_pixel_exact']]
    print(engine,'screen',len(good),'direct',len(direct),'expected',expected,flush=True)
    if engine=='chromium-headless':assert len(rows)==expected and len(good)==expected and not any(x['engine']==engine for x in failures),'Chromium A/B regression'
