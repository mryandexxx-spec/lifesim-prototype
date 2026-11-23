/** QSK-05: actual PlayCanvas GLB animation preview at two phone-sized Chromium viewports.
 * This checks real joint motion and rendered frames only. Joint motion does NOT
 * prove shoe outsole, furniture, hand, bed, shower or social collider contact.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const output='artifacts/qsk-05';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const items=[],save='lifesim.room01.v1',sentinel='{"qsk05":"do-not-touch"}';
try {
  for(const [resident,pageName] of [['alex','character-lab.html'],['mira','character-lab-mira.html']]){
    for(const [width,height] of [[390,844],[320,568]]){
      const context=await browser.newContext({viewport:{width,height},isMobile:true,
        hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
      await context.addInitScript(({key,val})=>localStorage.setItem(key,val),{key:save,val:sentinel});
      try {
        const page=await context.newPage(),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('crash',()=>errors.push('Chromium crash'));
        await page.route('https://cdn.jsdelivr.net/npm/playcanvas@2.24.1/build/playcanvas.mjs',
          route=>route.fulfill({status:200,contentType:'text/javascript',path:'vendor/playcanvas.mjs'}));
        const response=await page.goto('http://127.0.0.1:8765/'+pageName,{waitUntil:'domcontentloaded'});
        assert.equal(response.status(),200);
        await page.waitForFunction(()=>document.querySelector('#lab-status')?.textContent?.startsWith('Загружено:'),
          null,{timeout:60000});
        // Don't let a 320px diagnostics panel obscure the actual figure in evidence.
        await page.locator('.panel').evaluate(panel=>{panel.style.display='none';});
        const options=await page.locator('#clip-select option').evaluateAll(nodes=>nodes.map(node=>node.value));
        const selected={
          idle:options.find(name=>/^Idle/.test(name)),
          walk:options.find(name=>/^Walking$/.test(name)),
          sitToStand:options.find(name=>/^Sit_to_Stand/.test(name))
        };
        assert.ok(Object.values(selected).every(Boolean),resident+' existing clip matrix');
        const probe=()=>page.evaluate(async()=>{
          const {Application}=await import('playcanvas');
          const app=Application.getApplication();
          const names=['mixamorig:LeftFoot','mixamorig:RightFoot','mixamorig:Hips','mixamorig:Head'];
          const bones=Object.fromEntries(names.map(name=>{
            const joint=app.root.findByName(name);
            return [name,joint?.getPosition()?.toArray()??null];
          }));
          return {webgl:Boolean(app.graphicsDevice?.gl),
            meshes:app.root.findComponents('render').reduce((sum,r)=>sum+(r.meshInstances?.length??0),0),
            bones};
        });
        const frames=[];
        for(const [mode,clip] of Object.entries(selected)){
          await page.locator('#clip-select').evaluate((selector,clipName)=>{
            selector.value=clipName;
            selector.dispatchEvent(new Event('change',{bubbles:true}));
          },clip);
          await page.waitForTimeout(120);
          const first=await probe();
          assert.ok(first.webgl && first.meshes>0,resident+' real PlayCanvas WebGL');
          assert.ok(Object.values(first.bones).every(v=>v&&v.every(Number.isFinite)),
            resident+' real skeleton joints visible');
          const path=output+'/'+resident+'-'+width+'x'+height+'-'+mode+'.png';
          const png=await page.screenshot({path});
          await page.waitForTimeout(420);
          const second=await probe();
          const delta=Math.max(...Object.keys(first.bones).map(name=>
            Math.hypot(...second.bones[name].map((v,i)=>v-first.bones[name][i]))));
          // Neither an animated timeline nor a still screenshot proves contact.
          if(mode!=='idle')assert.ok(delta>0.0003,
            resident+' '+mode+' must advance actual skeleton bones, not merely an animation clock: '+delta);
          assert.ok(png.length>7000,'real rendered screenshot not blank');
          frames.push({mode,clip,sha256:createHash('sha256').update(png).digest('hex'),
            bytes:png.length,jointDeltaMeters:Number(delta.toFixed(6)),path});
        }
        assert.equal(new Set(frames.map(x=>x.sha256)).size,3,'distinct clip frames');
        assert.equal(await page.evaluate(key=>localStorage.getItem(key),save),sentinel,'never modify owner v1 save');
        assert.deepEqual(errors,[],'no browser errors');
        items.push({resident,viewport:width+'x'+height,source:'original canonical GLB',
          actualWebGL:true,frames});
        console.log('QSK-05 real PlayCanvas clip QA PASS',resident,width,height,frames.map(f=>f.mode).join(','));
      } finally {await context.close();}
    }
  }
}finally{
  await browser.close();
  writeFileSync(output+'/browser-contact-report.json',JSON.stringify({
    stage:'QSK-05 independent originals only',count:items.length,
    actualEngine:'PlayCanvas 2.24.1 Chromium/SwiftShader',physicalIphoneSafari:false,
    ownerArtAccepted:false,footSoleOrFurnitureContactCertified:false,
    sourceRigFinalCASReady:false,items
  },null,2)+'\n');
}
assert.equal(items.length,4);
