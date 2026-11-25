import json,io,hashlib,base64
from pathlib import Path
from PIL import Image,ImageStat
from playwright.sync_api import sync_playwright
from compare import ROOT,LAB,FRAMES,PIN,STATES,ANGLES,sha
def capture(page,path):
    data=page.locator("#canvas").evaluate("c=>({url:c.toDataURL('image/png'),width:c.width,height:c.height,rect:[c.clientWidth,c.clientHeight]})")
    assert data["width"]>0 and data["height"]>0 and abs(data["width"]-data["height"])<=2, data["rect"]
    raw=base64.b64decode(data["url"].split(",",1)[1])
    im=Image.open(io.BytesIO(raw)).convert("RGB")
    std=max(ImageStat.Stat(im).stddev)
    # Require variation inside the actual central framebuffer, not UI or overlay.
    center=im.crop((im.width//4,im.height//4,3*im.width//4,3*im.height//4))
    std=min(std,max(ImageStat.Stat(center).stddev))
    # Nonuniform frame is necessary, not sufficient for artistic success.
    im.resize((384,384),Image.Resampling.LANCZOS).save(path)
    return round(std,3)
def ready(page,sex):
    page.wait_for_function("s=>window.labState?.ready && window.labState.sex===s && window.labState.variant==='candidate'",arg=sex,timeout=60000)
def state(page,name):
    page.locator("#reset").click()
    if name.startswith("all-"):
        v=1 if name=="all-pos" else -1
        for k in ("jaw","cheeks","nose","mouth","eyes"):
            page.locator("#s-"+k).evaluate("(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))}",v)
    elif name=="smile":page.locator('[data-expr="smile"]').click()
    actual=page.evaluate("window.actualWeights")
    expected=STATES[name]
    assert actual and all(all(abs(w-expected.get(k,0))<1e-6 for k,w in a.items()) for a in actual),actual
def main():
    report={"frames":[],"mobile":[]}
    with sync_playwright() as p:
        for engine in ("chromium","webkit"):
            browser=getattr(p,engine).launch(headless=False,args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] if engine=="chromium" else [])
            page=browser.new_page(viewport={"width":900,"height":950},device_scale_factor=1)
            errors=[]
            page.on("pageerror",lambda e:errors.append(str(e)))
            page.goto("http://127.0.0.1:8765/index.html")
            ready(page,"male")
            page.add_style_tag(content=".view{width:384px!important;height:384px!important;max-width:none!important}")
            for sex in PIN:
                page.locator("#"+sex).click()
                ready(page,sex)
                for name in STATES:
                    state(page,name)
                    for angle in ANGLES:
                        page.locator(f'[data-angle="{angle}"]').click()
                        for mode in (("matched","legacy","axis-only") if name=="neutral" else ("matched","legacy")) if engine=="chromium" else ("matched",):
                            page.evaluate("m=>window.setVis(m)",mode)
                            directions=page.evaluate("window.visDirections")
                            assert len(directions)==3 and all(abs(d["dot"]-(0 if mode=="legacy" else 1))<1e-4 for d in directions),directions
                            page.wait_for_timeout(400)
                            path=FRAMES/f"{sex}-{name}-{angle}-{engine}-{mode}.png"
                            std=capture(page,path)
                            report["frames"].append(dict(sex=sex,state=name,angle=angle,engine=engine,mode=mode,std=std,valid=std>5,directions=directions))
                            if engine=="chromium":assert std>5,path
            assert not errors,errors
            for width,height in ((390,844),(320,568)):
                m=browser.new_page(viewport={"width":width,"height":height},device_scale_factor=1,has_touch=True)
                m.goto("http://127.0.0.1:8765/index.html")
                for sex in PIN:
                    m.locator("#"+sex).click()
                    ready(m,sex)
                    state(m,"all-pos")
                    m.locator('[data-angle="90"]').click()
                    assert m.evaluate("document.documentElement.scrollWidth<=innerWidth")
                    std=capture(m,ROOT/f"mobile-{engine}-{width}-{sex}.png")
                    if engine=="chromium":assert std>5
                    report["mobile"].append(dict(engine=engine,sex=sex,width=width,height=height,std=std,valid=std>5))
                m.close()
            browser.close()
    for sex,digest in PIN.items():assert sha(LAB/(sex+"-candidate.glb"))==digest
    assert len(report["frames"])==78 and len(report["mobile"])==8
    for sex in PIN:
        a=Image.open(FRAMES/f"{sex}-neutral-0-chromium-matched.png")
        b=Image.open(FRAMES/f"{sex}-neutral-90-chromium-matched.png")
        from PIL import ImageChops
        assert max(ImageStat.Stat(ImageChops.difference(a,b)).mean)>3,sex
        before=Image.open(FRAMES/f"{sex}-neutral-0-chromium-legacy.png")
        axis=Image.open(FRAMES/f"{sex}-neutral-0-chromium-axis-only.png")
        axis_delta=max(ImageStat.Stat(ImageChops.difference(before,axis)).mean)
        assert axis_delta>3,(sex,axis_delta)
        report.setdefault("axis_only_mean_rgb_delta",{})[sex]=axis_delta
    # WebKit must also show a changing framebuffer to count as visible.
    for sex in PIN:
        a=Image.open(FRAMES/f"{sex}-neutral-0-webkit-matched.png")
        b=Image.open(FRAMES/f"{sex}-neutral-90-webkit-matched.png")
        if max(ImageStat.Stat(ImageChops.difference(a,b)).mean)<=3:
            for f in report["frames"]+report["mobile"]:
                if f["engine"]=="webkit" and f["sex"]==sex:f["valid"]=False
    report["art"]="OPEN: direct human inspection required; nonblank is not approval"
    report["webkit_visual"]="PASS_NONBLANK_FRAMEBUFFER_ONLY" if all(f["valid"] for f in report["frames"] if f["engine"]=="webkit") else "OPEN_INVALID_FRAME"
    (ROOT/"report.json").write_text(json.dumps(report,indent=2))
    (LAB/"VIS-REPORT.json").write_text(json.dumps(report,indent=2))
    files={str(f.relative_to(LAB)):sha(f) for f in LAB.rglob("*") if f.is_file() and f.name!="SHA256SUMS.json"}
    (LAB/"SHA256SUMS.json").write_text(json.dumps(files,indent=2))
if __name__=="__main__":main()
