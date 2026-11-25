import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {buyMarketItem} from '../src/furniture-shop.js';
import {FURNITURE_PRODUCT_BY_ID} from '../src/furniture-products.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {OF_INTERIOR_ENTRIES} from '../src/of-interior-assets.js';
mkdirSync('artifacts/of-a',{recursive:true});
const seed=newHousehold('2026-11-25');seed.paused=true;seed.otherSim.paused=true;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const sconce=buyMarketItem(seed.world.furniture,seed.shop,'sconce.leaf',{x:.25,z:-3.65,yaw:0},{construction:seed.world.construction});assert.equal(sconce.ok,true);seed.world.furniture=sconce.world;seed.shop=sconce.shop;
const ids={'sconce.leaf':sconce.instanceId};
for(const [i,e] of OF_INTERIOR_ENTRIES.filter(e=>e.sku!=='sconce.leaf').entries()){const id='shop-of-a-'+(i+1);ids[e.sku]=id;seed.world.furniture.instances.push({instanceId:id,prefabId:e.prefabId,itemDefinitionId:e.sku,purchasePriceCredits:FURNITURE_PRODUCT_BY_ID[e.sku].price,x:5.8+(i%4)*2,z:-7+Math.floor(i/4)*3,yaw:(i%4)*90,location:'home'});}
// Capture the actual PlayCanvas framebuffer on postrender, not just a DOM-ready page.
// Sample the decoded pixels to reject an empty/black frame.
async function renderedFrame(page,focus=null){
 const data=await page.evaluate(async focus=>{
  const {Application,Vec3}=await import('playcanvas');
  const app=Application.getApplication(),camera=app.root.findByName('Camera');
  const oldPos=camera.getPosition().clone(),oldRot=camera.getRotation().clone();
  try{
   if(focus){
    const node=app.root.findByName('F2 purchased / '+focus.id);
    const [lo,hi]=focus.bounds;
    const local=new Vec3((lo[0]+hi[0])/2,(lo[2]+hi[2])/2,-(lo[1]+hi[1])/2);
    const center=node.getWorldTransform().transformPoint(local);
    const span=Math.max(...hi.map((v,i)=>v-lo[i]));
    const dir=node.getRotation().transformVector(new Vec3(.76,.54,-1)).normalize().mulScalar(Math.max(1.7,span*2.9));
    camera.setPosition(center.clone().add(dir));camera.lookAt(center);
   }
   const png=await new Promise(resolve=>app.once('postrender',()=>app.once('postrender',()=>resolve(app.graphicsDevice.canvas.toDataURL('image/png')))));
   const bitmap=await createImageBitmap(await (await fetch(png)).blob());
   const probe=document.createElement('canvas');probe.width=64;probe.height=64;
   const ctx=probe.getContext('2d');ctx.drawImage(bitmap,0,0,64,64);bitmap.close();
   const bytes=ctx.getImageData(0,0,64,64).data,colors=new Set();
   for(let i=0;i<bytes.length;i+=4)colors.add((bytes[i]>>4)*256+(bytes[i+1]>>4)*16+(bytes[i+2]>>4));
   return {png,colors:colors.size};
  }finally{if(focus){camera.setPosition(oldPos);camera.setRotation(oldRot);}}
 },focus);
 assert.ok(data.colors>=8,'actual rendered frame has insufficient color diversity: '+data.colors);
 return Buffer.from(data.png.split(',')[1],'base64');
}
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]]){
 const ctx=await b.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await ctx.addInitScript(({key,tour,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');},{key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY,seed});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
 const inspect=async()=>{await page.waitForFunction(async ids=>{const {Application}=await import('playcanvas');const root=Application.getApplication()?.root;return root&&Object.entries(ids).every(([sku,id])=>!!root.findByName('F2 purchased / '+id)?.findByName('Meshy furniture '+sku));},ids,{timeout:100000});const result=await page.evaluate(async ids=>{const {Application}=await import('playcanvas');const root=Application.getApplication().root;return Object.entries(ids).map(([sku,id])=>{const node=root.findByName('F2 purchased / '+id);const pivot=node.findByName('Meshy furniture '+sku);const p=pivot.getLocalPosition();return {sku,enabled:pivot.enabled,meshes:pivot.findComponents('render').reduce((n,c)=>n+c.meshInstances.length,0),offset:[p.x,p.y,p.z],nodeY:node.getPosition().y};});},ids);for(const v of result){assert.ok(v.enabled&&v.meshes>0,v.sku);assert.deepEqual(v.offset,[0,0,0]);if(v.sku==='sconce.leaf')assert.ok(v.nodeY>1.5);}assert.equal((await page.evaluate(()=>window.__LifeSimMeshyFurnitureStats())).failures,0);};
 await page.goto('http://127.0.0.1:8765/?furniture=qa',{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await inspect();await renderedFrame(page);await page.screenshot({path:'artifacts/of-a/'+name+'-'+width+'-home.png'});
 if(width===390){for(const e of OF_INTERIOR_ENTRIES){const png=await renderedFrame(page,{id:ids[e.sku],bounds:e.boundsBlender});writeFileSync('artifacts/of-a/'+name+'-detail-'+e.sku+'.png',png);}}console.log(name,width,'all 20 GLB attachments and mount verified');
 await page.locator('#home-open').tap();await page.locator('#home-furnish').tap();
 await page.locator('[data-parcel-action="group:shop"]').tap();
 await page.locator('#furnish-shop').waitFor({state:'visible'});
 assert.equal(await page.locator('#parcel-editor').getAttribute('data-stage'),'list');
 for(const e of OF_INTERIOR_ENTRIES){const img=page.locator('#furnish-stock button[data-item-id="'+e.sku+'"] img.furnish-meshy-thumb');assert.equal(await img.count(),1,e.sku);assert.ok((await img.getAttribute('src')).endsWith('/of-r2/thumbnails/'+e.sku+'.png'),e.sku);await img.evaluate(n=>{n.loading='eager'});await img.evaluate(n=>new Promise((resolve,reject)=>{if(n.complete)return n.naturalWidth?resolve():reject(Error('empty thumbnail'));n.addEventListener('load',resolve,{once:true});n.addEventListener('error',()=>reject(Error('bad thumbnail')),{once:true});}));}
 await renderedFrame(page);await page.screenshot({path:'artifacts/of-a/'+name+'-'+width+'-shop.png'});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden',timeout:100000});await inspect();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);assert.equal(saved.version,1);for(const [sku,id] of Object.entries(ids)){const item=saved.world.furniture.instances.find(x=>x.instanceId===id);assert.equal(item?.itemDefinitionId,sku);assert.equal(item.purchasePriceCredits,FURNITURE_PRODUCT_BY_ID[sku].price);}assert.deepEqual(errors,[]);await ctx.close();console.log(name,width,'20 real native GLB pivots, thumbnail and save reload PASS');
 }}finally{await b.close();}}
