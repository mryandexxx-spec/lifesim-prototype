/** CAS-02.2-B independent real PlayCanvas WebGL art-preview smoke, not game integration. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,statSync,writeFileSync} from 'node:fs';
import {extname,resolve,normalize} from 'node:path';
import {createHash} from 'node:crypto';
const ROOT=process.cwd(),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
 '.glb':'model/gltf-binary','.json':'application/json','.png':'image/png'};
const server=createServer((req,res)=>{
 let name=decodeURIComponent(req.url.split('?')[0]);
 if(name==='/')name='/index.html';
 const path=resolve(ROOT,'.'+normalize(name));
 if(!path.startsWith(ROOT+'/')){res.writeHead(403);res.end();return;}
 try{const data=readFileSync(path);
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(8765,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const results=[];
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,
   deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('crash',()=>errors.push('browser crash'));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>{
   const p=window.__LifeSimNewPeopleProbe?.();return p?.visible&&p?.identity?.includes('Глеб');
  },{timeout:90000});
  const probe=()=>page.evaluate(()=>window.__LifeSimNewPeopleProbe());
  let state=await probe();
  if(state.morphCount!==6||state.clips!==10||state.weights.length!==6)
   throw Error('Missing actual Alex derivative '+JSON.stringify(state));
  const rect=await page.locator('#panel').boundingBox();
  if(!rect||rect.height>160||rect.y<height*.68)
   throw Error('Mobile preview panel covers character '+JSON.stringify(rect));
  const hash=a=>createHash('sha256').update(a).digest('hex');
  const imageNew=hash(await page.locator('canvas').screenshot());
  await page.locator('#identity').selectOption('original');
  await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().identity==='original',{timeout:50000});
  state=await probe();
  if(state.clips!==10||state.morphCount!==0)throw Error('Original changed '+JSON.stringify(state));
  const imageOriginal=hash(await page.locator('canvas').screenshot());
  if(imageOriginal===imageNew)throw Error('Source and derivative rendered identical pixels');
  await page.locator('#identity').selectOption('1');
  await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().identity?.includes('Тимур'),{timeout:50000});
  state=await probe();
  if(!state.independentMorphInstances||state.distinctLoaded.length<3)
   throw Error('Identity instance bleed '+JSON.stringify(state));
  await page.locator('#resident').selectOption('mira');
  await page.waitForFunction(()=>window.__LifeSimNewPeopleProbe?.().identity?.includes('Ника'),{timeout:50000});
  state=await probe();
  if(state.morphCount!==6||state.clips!==13)throw Error('Mira derivative failed '+JSON.stringify(state));
  if(errors.length)throw Error('Page JS errors: '+JSON.stringify(errors));
  results.push({width,height,realWebGL:true,alexMorphs:6,miraMorphs:6,
   independentlySkinned:true,originalRestored:true,pixelsDiffer:true,
   panelTop:rect.y,drawCalls:state.drawCalls,physicalSafariAccepted:false});
  console.log('CAS_B_WEBGL '+JSON.stringify(results.at(-1)));
  await context.close();
 }
}finally{
 await browser.close();server.close();
 writeFileSync('source-variants/browser-report.json',JSON.stringify({results},null,2));
}
