import asyncio, pathlib, json, base64, numpy as np, os
from PIL import Image
from io import BytesIO
from playwright.async_api import async_playwright
root=pathlib.Path('reset-fix-smoke')
root.mkdir(exist_ok=True)
base=os.environ.get('LAB_URL','http://127.0.0.1:8765/')
def frame(data):return np.asarray(Image.open(BytesIO(base64.b64decode(data.split(',')[1]))).convert('RGB'),dtype=np.int16)
def compare(a,b):return {'mean':float(np.abs(a-b).mean()),'changed_fraction':float(np.any(np.abs(a-b)>8,axis=2).mean())}
async def run():
    report={}
    async with async_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=await getattr(p,engine).launch(headless=False,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] if engine=='chromium' else [])
            for width,height in [(390,844),(320,568)]:
                page=await browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=True,has_touch=True)
                errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                await page.goto(base,wait_until='networkidle',timeout=60000)
                await page.wait_for_function("window.labState?.ready === true",timeout=30000)
                async def loaded(sex,variant):
                    await page.wait_for_function("([s,v])=>window.labState?.ready && labState.sex===s && labState.variant===v",arg=[sex,variant],timeout=30000)
                async def capture():
                    await page.wait_for_timeout(150)
                    return frame(await page.locator('canvas').evaluate("(c)=>c.toDataURL('image/png')"))
                async def slider(k,value):
                    await page.locator('#s-'+k).evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}",str(value))
                    a=await page.evaluate('window.actualWeights')
                    assert a and all(abs(w[k+('_neg' if value<0 else '_pos')]-abs(value))<1e-6 for w in a)
                    return await capture()
                result={}
                for sex in ['male','female']:
                    await page.locator('#'+sex).tap()
                    await loaded(sex,'candidate')
                    await page.locator('#reset').tap()
                    per={}
                    for k in ['jaw','cheeks','nose','mouth','eyes']:
                        await page.locator('[data-angle="'+('90' if k=='nose' else '0')+'"]').tap()
                        a=await slider(k,-1); b=await slider(k,1)
                        await page.locator('#original').tap()
                        await loaded(sex,'original')
                        state=await page.evaluate('window.labState')
                        assert state['values'][k]==1
                        old_b=await capture()
                        old_a=await slider(k,-1)
                        await page.locator('#candidate').tap()
                        await loaded(sex,'candidate')
                        assert (await page.evaluate('window.labState'))['values'][k]==-1
                        c=await capture()
                        assert (await page.evaluate('window.actualWeights'))[0][k+'_neg']==1
                        stat={'candidate':compare(a,b),'original':compare(old_a,old_b),'before_after':compare(old_a,c),'frame_std':float(a.std(axis=(0,1)).mean())}
                        per[k]=stat
                        # Chromium must show real visible geometric differences on each axis.
                        if engine=='chromium':
                            assert stat['frame_std']>5 and stat['candidate']['changed_fraction']>.0003 and stat['before_after']['changed_fraction']>.0001,(sex,k,stat)
                        await slider(k,0)
                    for expr in ['blink','smile','jawopen','neck_neg','neck_pos','neutral']:
                        await page.locator('[data-expr="'+expr+'"]').tap()
                        state=await page.evaluate('window.labState')
                        assert state['expression']==expr
                        if expr!='neutral': assert (await page.evaluate('window.actualWeights'))[0][expr]==1
                    await page.locator('#reset').tap()
                    await page.locator('canvas').screenshot(path=str(root/f'{engine}-{width}-{sex}.png'))
                    result[sex]=per
                assert not errors,errors
                assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
                report[f'{engine}-{width}']=result
                await page.close()
            await browser.close()
    (root/'report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report))
asyncio.run(run())
