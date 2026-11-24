import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const root=resolve(process.env.P4_SITE||new URL('./site',import.meta.url).pathname);
const out=resolve(process.env.P4_ARTIFACTS||'/tmp/p4-mobile');await mkdir(out,{recursive:true});
const types={'.mjs':'text/javascript','.html':'text/html','.css':'text/css','.glb':'model/gltf-binary','.json':'application/json'};
const server=createServer(async(req,res)=>{try{let p=new URL(req.url,'http://localhost').pathname;if(p==='/')p='/index.html';const f=resolve(root,'.'+p);assert.ok(f.startsWith(root+'/'));const b=await readFile(f);res.writeHead(200,{'Content-Type':types[extname(f)]||'application/octet-stream'});res.end(b)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=process.env.P4_URL||'http://127.0.0.1:'+server.address().port+'/';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});const report=[];
const pin={p3:'ef4f26db3842d30d6124b665fd51e0ebff27cd94bdd49f08a312d5cd99da8a2c',p4:'4f0068503afdea25284c50c5972843c63ac395aa50cdd4f12b885bdf22a7175c'};
try{for(const [width,height] of [[390,844],[320,568]]){
 const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});const wait=(f,v='derived')=>page.waitForFunction(([f,v])=>document.querySelector('canvas').dataset.model===f+':'+v&&!document.querySelector('[data-error]'),[f,v],{timeout:30000});
 await wait('p4');assert.equal(await page.locator('[data-family]').count(),2);
 const canvas=page.locator('canvas');const shot=async name=>{await page.waitForTimeout(350);const b=await canvas.screenshot();await writeFile(join(out,width+'-'+name+'.png'),b);return b};
 const diff=async(a,b)=>page.evaluate(async ([a,b])=>{async function read(data){const i=await createImageBitmap(await (await fetch('data:image/png;base64,'+data)).blob());const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data}const x=await read(a),y=await read(b);let n=0;for(let i=0;i<x.length;i+=4)if(Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2])>=15)n++;return n},[a.toString('base64'),b.toString('base64')]);
 const verified={};for(const f of ['p3','p4']){const response=await context.request.get(new URL('assets/'+f+'-p3.glb',url).href);assert.ok(response.ok());verified[f]=createHash('sha256').update(await response.body()).digest('hex');assert.equal(verified[f],pin[f]);}
 const result={width,height,verified,morphs:{},animations:{}};const after=await shot('p4-neutral');
 for(const name of ['eyes','nose','lips','chin','cheeks']){const slider=page.locator('[data-morph="'+name+'"]');await slider.fill('100');const d=await diff(after,await shot('p4-'+name+'100'));assert.ok(d>=8,name+' changed '+d);result.morphs[name]=d;await slider.fill('0');}
 await page.locator('[data-morph="eyes"]').fill('50');await shot('p4-eyes50');await page.locator('[data-family="p3"]').tap();await wait('p3');assert.equal(await page.locator('[data-morph="eyes"]').inputValue(),'50');
 await page.locator('[data-morph="eyes"]').fill('0');const before=await shot('p3-neutral');result.beforeAfter=await diff(before,after);assert.ok(result.beforeAfter>=8);
 await page.locator('[data-family="p4"]').tap();await wait('p4');await page.locator('#rotate').tap();await shot('p4-45');await page.locator('#rotate').tap();await shot('p4-90');
 await page.locator('#max').tap();await shot('p4-all-max');await page.locator('#min').tap();
 for(const pose of ['idle','walk','sit']){await page.locator('#pose').selectOption(pose);const x=await shot(pose+'-a');await page.waitForTimeout(500);const y=await shot(pose+'-b');result.animations[pose]=await diff(x,y);assert.ok(result.animations[pose]>=8,pose+' stationary')}
 await page.locator('#pose').selectOption('neutral');await page.locator('[data-variant="original"]').tap();await wait('p4','original');assert.equal(await page.locator('[data-morph]:disabled').count(),5);await shot('mira-original');assert.deepEqual(errors,[]);report.push(result);await context.close();
} }finally{await writeFile(join(out,'report.json'),JSON.stringify({report,physicalIphoneVerified:false},null,2));await browser.close();server.close();}
console.log(JSON.stringify(report));
