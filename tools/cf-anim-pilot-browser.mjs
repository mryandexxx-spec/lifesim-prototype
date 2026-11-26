import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out='pilot-out/browser';mkdirSync(out,{recursive:true});
const results=[],failures=[],report=JSON.parse(readFileSync('pilot-out/report.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function frame(page){
  return page.evaluate(async()=>{
    const {Application}=await import('./playcanvas.mjs');const app=Application.getApplication();
    for(let i=0;i<8;i++){
      const img=await new Promise(resolve=>{app.once('postrender',()=>resolve(app.graphicsDevice.canvas.toDataURL('image/png')));app.renderNextFrame=true});
      const bitmap=await createImageBitmap(await(await fetch(img)).blob());const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0,96,96);bitmap.close();
      const data=ctx.getImageData(0,0,96,96).data,colors=new Set();
      for(let j=0;j<data.length;j+=4)colors.add((data[j]>>4)*256+(data[j+1]>>4)*16+(data[j+2]>>4));
      if(colors.size>=12)return {img,colors:colors.size};
    }
    throw Error('blank actual WebGL canvas after eight postrenders');
  });
}
async function screenshotColors(page,png){
  return page.evaluate(async data=>{
    const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+data)).blob());
    const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d');
    ctx.drawImage(bitmap,0,bitmap.height*.30,bitmap.width,bitmap.height*.47,0,0,96,96);bitmap.close();
    const px=ctx.getImageData(0,0,96,96).data,colors=new Set();
    for(let j=0;j<px.length;j+=4)colors.add((px[j]>>4)*256+(px[j+1]>>4)*16+(px[j+2]>>4));
    return colors.size;
  },png.toString('base64'));
}
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  // WebKit headless compositor returned UI-only images in R2; test real headed canvas as well.
  const browser=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
  try{
   for(const [width,height] of [[390,844],[320,568]]){
    const ctx=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const page=await ctx.newPage(),errors=[],consoleMessages=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(consoleMessages.length<200)consoleMessages.push({type:m.type(),text:m.text()})});
    try{
      await page.goto('http://127.0.0.1:8765/lab.html');
      await page.waitForFunction(()=>window.pilot&&document.querySelector('#status').textContent.startsWith('Готово'),{},{timeout:60000});
      for(const sex of ['female','male']){
       if(sex==='male'){await page.locator('#profile').selectOption(sex);await page.waitForFunction(()=>window.pilot&&!document.querySelector('#profile').disabled&&document.querySelector('#status').textContent.startsWith('Готово'))}
       const samples=[];
       for(const [i,u] of [0,.25,.5,.75,.99].entries()){
        await page.evaluate(u=>window.pilot.seek(u),u);await page.waitForTimeout(160);
        const probe=await page.evaluate(()=>window.pilot.probe());assert.ok(probe.webgl&&probe.meshCount>0);assert.ok(Object.values(probe.bones).length>=100);
        const base=out+'/'+name+'-'+width+'-'+sex+'-'+i;
        const actual=await frame(page);const canvasPng=Buffer.from(actual.img.split(',')[1],'base64');writeFileSync(base+'-canvas.png',canvasPng);
        const png=await page.screenshot({path:base+'.png'}),compositeColors=await screenshotColors(page,png);
        samples.push({u,time:probe.time,sha256:hash(png),bones:probe.bones,path:base+'.png',canvasPath:base+'-canvas.png',canvasSha256:hash(canvasPng),canvasColors:actual.colors,compositeColors});
       }
       let delta=0;for(const [k,v] of Object.entries(samples[0].bones)){const w=samples[2].bones[k];if(w)delta=Math.max(delta,Math.hypot(...w.map((x,i)=>x-v[i])))}
       results.push({name,width,height,sex,delta,samples,errors:[...errors],device:await page.evaluate(()=>window.pilotDevice?.()),consoleMessages:[...consoleMessages]});
       assert.ok(delta>.01,'real bone motion');assert.deepEqual(errors,[]);assert.ok(samples.every(s=>s.compositeColors>=12),'blank actual composed scene; canvas readback retained');assert.ok(new Set(samples.map(s=>s.canvasSha256)).size>=4,'rendered scene must change');
      }
    }catch(e){const device=await page.evaluate(()=>window.pilotDevice?.()).catch(()=>null);failures.push({name,width,height,error:String(e),errors,device,consoleMessages});await page.screenshot({path:out+'/'+name+'-'+width+'-failure.png'}).catch(()=>{})}finally{await ctx.close()}
   }
  }finally{await browser.close()}
 }
}finally{writeFileSync(out+'/report.json',JSON.stringify({device:'emulated, not physical iPhone',results,failures},null,2))}
assert.deepEqual(failures,[]);assert.equal(results.length,8);