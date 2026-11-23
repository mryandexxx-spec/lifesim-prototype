/** CAS-02.2-B R2: real per-target PlayCanvas pixel and semantic locality audit. */
import {chromium as pw} from 'playwright-core';
import chrome from '@sparticuz/chromium';
import sharp from 'sharp';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,normalize,extname} from 'node:path';
const root=process.cwd(),types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html',
 '.glb':'model/gltf-binary','.json':'application/json'};
const server=createServer((req,res)=>{
 let name=decodeURIComponent(req.url.split('?')[0]);
 if(name==='/')name='/index.html';
 const path=resolve(root,'.'+normalize(name));
 if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream',
  'Cache-Control':'no-store'});res.end(readFileSync(path));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(res=>server.listen(8768,'127.0.0.1',res));
const browser=await pw.launch({headless:true,executablePath:await chrome.executablePath(),
 args:[...chrome.args,'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const targets=['eyes','nose','lips','chin','cheeks','body'];
const read=async bytes=>sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const diff=(a,b)=>{
 let count=0,bright=0,sumX=0,sumY=0,x0=1e9,y0=1e9,x1=-1,y1=-1;
 const {width,height,channels}=a.info;
 if(width!==b.info.width||height!==b.info.height)throw Error('Mismatched screenshots');
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*channels;
  const d=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+
   Math.abs(a.data[i+2]-b.data[i+2]);
  if(d<30)continue;
  count++;bright+=d;sumX+=x;sumY+=y;
  x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
 }
 return {count,meanPixelChange:count?+(bright/count).toFixed(1):0,
  centroid:count?[+(sumX/count).toFixed(1),+(sumY/count).toFixed(1)]:null,
  bounds:count?[x0,y0,x1,y1]:null};
};
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8768/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().visible,null,{timeout:60000});
 for(const kind of ['alex','mira']){
  if(kind==='mira'){
   await page.locator('#resident').selectOption('mira');
   await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().sourceFamily==='mira',null,{timeout:60000});
  }
  await page.locator('#view-face').click();
  const probe=await page.evaluate(()=>window.__LifeSimNewPeopleProbe());
  if(probe.morphCount!==6)throw Error('Missing morphs '+kind);
  await page.evaluate(()=>{window.__LifeSimMorphRegionQA.pause();window.__LifeSimMorphRegionQA.zero();});
  await page.waitForTimeout(350);
  // Only the visible face raster. Full-canvas screenshots included UI overlays,
  // especially the changing status/dock area, creating false pixel positives.
  const faceClip={x:20,y:280,width:350,height:335};
  const snapshot=()=>page.screenshot({clip:faceClip});
  const baseline=await read(await snapshot());
  await page.waitForTimeout(250);
  const negative=diff(baseline,await read(await snapshot()));
  const stats={unchanged:negative};
  if(negative.count>600)throw Error('Unstable baseline/no paused animation: '+JSON.stringify({kind,negative}));
  for(const name of targets){
   await page.evaluate(t=>window.__LifeSimMorphRegionQA.set(t,1),name);
   await page.waitForTimeout(220);
   const change=await read(await snapshot());
   stats[name]=diff(baseline,change);
   await page.evaluate(t=>window.__LifeSimMorphRegionQA.set(t,0),name);
  }
  // A target must do more than change one or two pixels at face zoom.
  // Thresholds apply ONLY to a steady, same-camera face ROI and do not claim
  // production-quality sculpting or UV corrections.
  const pixelMinimum={eyes:300,nose:100,lips:100,chin:200,cheeks:150};
  for(const [name,minimum] of Object.entries(pixelMinimum))
   if(stats[name].count<minimum)
    throw Error('Almost inert '+name+' slider in '+kind+': '+stats[name].count+'/'+minimum+' changed pixels');
  if(stats.cheeks.centroid?.[1] <= stats.eyes.centroid?.[1]+15)
   throw Error('Cheeks still change upper eye screen region; '+JSON.stringify({kind,eyes:stats.eyes,cheeks:stats.cheeks}));
  // The body slider only has a meaningful visible test in full-figure focus.
  await page.locator('#view-body').click();
  await page.evaluate(()=>{window.__LifeSimMorphRegionQA.pause();window.__LifeSimMorphRegionQA.zero();});
  await page.waitForTimeout(280);
  const bodyClip={x:0,y:220,width:390,height:490};
  const bodyBase=await read(await page.screenshot({clip:bodyClip}));
  await page.evaluate(()=>window.__LifeSimMorphRegionQA.set('body',1));
  await page.waitForTimeout(230);
  const bodyDelta=diff(bodyBase,await read(await page.screenshot({clip:bodyClip})));
  await page.evaluate(()=>window.__LifeSimMorphRegionQA.zero());
  console.log('CAS_B_EACH_SLIDER '+JSON.stringify({kind,stats,bodyFullFigure:bodyDelta,errorCount:errors.length}));
  if(bodyDelta.count<75)throw Error('Nearly inert upper-torso slider at body focus '+JSON.stringify({kind,bodyDelta}));
  if(errors.length)throw Error(JSON.stringify(errors));
 }
}finally{await browser.close();server.close();}
