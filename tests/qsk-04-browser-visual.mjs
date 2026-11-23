/** QSK-04 real PlayCanvas Chromium/WebGL source-preserving Alex/Mira control frames.
 * Not a CAS-B art approval and not physical iPhone Safari acceptance.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const OUTPUT='artifacts/qsk-04';mkdirSync(OUTPUT,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const cases=[],SAVE_KEY='lifesim.room01.v1',sentinel='{"qsk04":"read-only-origin-qa"}';
let success=false;
try{
  for(const [kind,route,expectedClips] of [
    ['alex','character-lab.html',10],['mira','character-lab-mira.html',13]
  ])for(const [width,height] of [[390,844],[320,568]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,val})=>localStorage.setItem(key,val),{key:SAVE_KEY,val:sentinel});
    try{
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('crash',()=>errors.push('renderer crashed'));
      await page.route('https://cdn.jsdelivr.net/npm/playcanvas@2.24.1/build/playcanvas.mjs',route=>
        route.fulfill({status:200,contentType:'text/javascript',path:'vendor/playcanvas.mjs'}));
      const response=await page.goto('http://127.0.0.1:8765/'+route,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200);
      await page.waitForFunction(()=>document.querySelector('#lab-status')?.textContent?.startsWith('Загружено:'),null,{timeout:60000});
      const clips=await page.locator('#clip-select option').count();
      assert.equal(clips,expectedClips,kind+' source clip count');
      await page.locator('#pause-animation').click();
      const probe=async()=>page.evaluate(async()=>{
        const {Application}=await import('playcanvas'),app=Application.getApplication();
        const camera=app.root.findByName('Lab camera');
        const renders=app.root.findComponents('render');
        return {hasWebGL:Boolean(app.graphicsDevice?.gl),meshInstances:renders.reduce((n,c)=>n+(c.meshInstances?.length??0),0),
          camera:camera?.getPosition()?.toArray(),canvas:[app.graphicsDevice.canvas.width,app.graphicsDevice.canvas.height]};
      });
      const initial=await probe();
      assert.ok(initial.hasWebGL&&initial.meshInstances>1,kind+' actual scene must have meshes and WebGL');
      const angles=['initial','orbit-45','orbit-90'],frames=[];let lastCamera=initial.camera;
      for(const [index,angle] of angles.entries()){
        if(index>0){
          const bounds=await page.locator('#lab-canvas').boundingBox();
          const from={x:Math.round(width*.30),y:Math.round(Math.max(height*.73,bounds.y+height*.65))};
          const to={x:Math.min(width-20,from.x+Math.round(width*.37)),y:from.y};
          await page.mouse.move(from.x,from.y);await page.mouse.down();
          await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
          await page.waitForTimeout(180);
          const next=await probe();
          assert.ok(next.camera&&Math.hypot(...next.camera.map((x,i)=>x-lastCamera[i]))>.05,
            kind+' '+angle+' must rotate actual PlayCanvas camera');
          lastCamera=next.camera;
        }
        const filepath=OUTPUT+'/'+kind+'-'+width+'x'+height+'-'+angle+'.png';
        const png=await page.screenshot({path:filepath});
        assert.ok(png.length>7000,kind+' '+angle+' image too small / blank');
        frames.push({angle,path:filepath,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex'),camera:lastCamera});
      }
      assert.equal(new Set(frames.map(x=>x.sha256)).size,3,kind+' orbit screenshots must differ');
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY),sentinel,'never overwrite v1 save');
      assert.deepEqual(errors,[],'no page errors / PlayCanvas crashes');
      cases.push({character:kind,viewport:width+'x'+height,clips,hasWebGL:initial.hasWebGL,meshInstances:initial.meshInstances,
        source:'canonical existing original GLB, not proposed CAS-02.2-B art',frames,errors:errors.length});
      console.log('QSK-04 real PlayCanvas visual reference PASS',kind,width,height,frames.length);
    }finally{await context.close();}
  }
  success=true;
}finally{
  await browser.close();
  writeFileSync(OUTPUT+'/visual-report.json',JSON.stringify({stage:'QSK-04',success,
    engine:'PlayCanvas 2.24.1',device:'Chromium SwiftShader, not physical iPhone Safari',
    ownerArtApproved:false,referenceOnly:true,images:cases.length*3,cases},null,2)+'\n');
}
assert.equal(cases.length,4);
