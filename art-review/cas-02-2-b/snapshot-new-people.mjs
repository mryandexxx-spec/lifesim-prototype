/** Capture actual real-GLB PlayCanvas face previews from serverless Chromium for art QA. */
import {chromium as pw} from 'playwright-core';
import chrome from '@sparticuz/chromium';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {extname,resolve,normalize} from 'node:path';
const ROOT=process.cwd(),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.glb':'model/gltf-binary'};
const s=createServer((request,res)=>{
 const name=decodeURIComponent(request.url.split('?')[0])||'/index.html';
 const target=resolve(ROOT,'.'+normalize(name==='/'?'/index.html':name));
 if(!target.startsWith(ROOT+'/')){res.writeHead(403);res.end();return;}
 try{const bytes=readFileSync(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream'});res.end(bytes);}
 catch{res.writeHead(404);res.end();}
});
await new Promise(r=>s.listen(8766,'127.0.0.1',r));
const browser=await pw.launch({executablePath:await chrome.executablePath(),
 args:[...chrome.args,'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();
 page.on('pageerror',e=>console.log('QA_PAGE_ERROR '+e.message));
 await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().visible,null,{timeout:60000});
 await page.locator('#view-face').click();
 async function sample(label){
  await page.waitForTimeout(450);
  const probe=await page.evaluate(()=>window.__LifeSimNewPeopleProbe());
  const bytes=await page.screenshot({type:'jpeg',quality:56,clip:{x:20,y:158,width:350,height:380}});
  mkdirSync('screenshots',{recursive:true});
  writeFileSync('screenshots/'+label+'.jpg',bytes);
  const b64=bytes.toString('base64');
  console.log('CAS_B_FACE_BYTES '+label+' '+bytes.length);
  for(let i=0;i<b64.length;i+=1400)
   console.log('CAS_B_JPEG_CHUNK '+label+' '+(i/1400)+' '+b64.slice(i,i+1400));
  console.log('CAS_B_FACE_STATE '+label+' '+JSON.stringify({source:probe.sourceFamily,identity:probe.identity,
   morphology:probe.weights,visible:probe.visible,focus:probe.focus}));
 }
 await sample('gleb');
 await page.locator('#identity').selectOption('1');
 await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().identity?.includes('Тимур'));
 await sample('timur');
 await page.locator('#resident').selectOption('mira');
 await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().identity?.includes('Ника'),null,{timeout:60000});
 await sample('nika');
 await page.locator('#identity').selectOption('1');
 await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().identity?.includes('Ева'));
 await sample('eva');
}finally{await browser.close();s.close();}
