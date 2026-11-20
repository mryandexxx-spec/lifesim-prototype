import {buildGroupForTool} from '../src/build-tool-palette.js';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {proposeConstructionEdit} from '../src/construction.js';
const state=newHousehold();
const result=proposeConstructionEdit(state.world.construction,{type:'room',
  from:{x:15,z:-3},to:{x:18,z:1}});
assert.ok(result.ok,result.reason);
state.world.construction=result.world;
state.world.furniture.instances.push({instanceId:'shop-plant-a',prefabId:'plant',
  x:16,z:-2,yaw:0,location:'home',itemDefinitionId:'plant.amber',purchasePriceCredits:100});
state.world.furniture.revision++;
const originalPlant={...state.world.furniture.instances.at(-1)};
state.autonomy.enabled=false;state.otherSim.autonomy.enabled=false;
const count=result.world.floorCells.length;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'
]});
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},
  deviceScaleFactor:1,hasTouch:true,isMobile:true});
 await ctx.addInitScript(({key,value})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));
  localStorage.setItem('lifesim.uiTour.v1','done');
 },{key:SAVE_KEY,value:state});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>{
  if(r.url().includes('/src/')||r.url().includes('/vendor/'))
   errors.push(r.url()+':'+r.failure()?.errorText);
 });
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
 const clickBuild=async()=>{
    if(await page.locator('#build-toggle').isVisible())await page.locator('#build-toggle').click();
    else{await page.locator('#home-open').click();await page.locator('#home-build').click();}
  };
  const chooseBuildTool=async type=>{
    const group=buildGroupForTool(type);
    if(group==='view'){
      if(await page.locator('#build-view-panel').isHidden())
        await page.locator('#build-view-trigger').click();
    }else{
      await page.locator('[data-build-group-tab="'+group+'"]').click();
    }
    await page.locator('[data-build-tool="'+type+'"]').click();
  };
  await clickBuild();
 await chooseBuildTool('room-relocate');
 assert.ok(await page.locator('#build-room-controls').isVisible());
 const project=(x,z)=>{
  const yaw=42*Math.PI/180,pitch=64*Math.PI/180,distance=36;
  const px=14.5+Math.sin(yaw)*Math.cos(pitch)*distance;
  const py=.62+Math.sin(pitch)*distance;
  const pz=Math.cos(yaw)*Math.cos(pitch)*distance;
  const rx=x-px,ry=-py,rz=z-pz;
  const right=rx*Math.cos(yaw)-rz*Math.sin(yaw);
  const up=-rx*Math.sin(yaw)*Math.sin(pitch)+ry*Math.cos(pitch)-
   rz*Math.cos(yaw)*Math.sin(pitch);
  const forward=-rx*Math.sin(yaw)*Math.cos(pitch)-ry*Math.sin(pitch)-
   rz*Math.cos(yaw)*Math.cos(pitch);
  const size=forward*Math.tan(41*Math.PI/360);
  return {x:195+right/(size*390/844)*195,y:422-up/size*422};
 };
 const tap=async point=>{
  assert.ok(point.x>0&&point.x<390&&point.y>100&&point.y<570,
   'Touch point needs to be visible above mobile panel '+JSON.stringify(point));
  for(const [type,on] of [['pointerdown','canvas'],['pointerup','window']])
   await page.evaluate(({point,type,on})=>{
    const node=on==='canvas'?document.querySelector('#game-canvas'):window;
    node.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,
     pointerType:'touch',pointerId:81,button:0,buttons:type==='pointerup'?0:1,
     clientX:point.x,clientY:point.y}));
   },{point,type,on});
 };
 await tap(project(16,-2));
 assert.match(await page.locator('#build-room-label').innerText(),/Комната/);
 await page.locator('#build-room-turn').click();
 assert.match(await page.locator('#build-room-turn').innerText(),/90°/);
 await tap(project(20.5,0));
 assert.ok(await page.locator('#build-pending').isVisible(),
  'second touch must stage a copy that is not applied automatically');
 await page.screenshot({path:'f5d2-furnished-room-move-preview.png'});
 await page.locator('#build-apply').click();
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.equal(saved.world.construction.floorCells.length,count);
 const moved=saved.world.furniture.instances.find(i=>i.instanceId==='shop-plant-a');
 assert.ok(moved&&moved.x!==originalPlant.x&&moved.z!==originalPlant.z);
 assert.equal(moved.yaw,90);
 assert.equal(moved.purchasePriceCredits,100);
 await page.locator('#build-undo').click();
 const undone=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.deepEqual(undone.world.furniture.instances.find(i=>i.instanceId==='shop-plant-a'),originalPlant);
 await page.locator('#build-redo').click();
 const redone=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.deepEqual(redone.world.furniture.instances.find(i=>i.instanceId==='shop-plant-a'),moved);
 await page.locator('#build-room-reset').click();
 await chooseBuildTool('room-relocate');
 assert.ok(await page.locator('#build-room-controls').isVisible());
 await page.locator('#build-exit').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:25000});
 const reloaded=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.equal(reloaded.world.construction.floorCells.length,count);
 assert.deepEqual(reloaded.world.furniture.instances.find(i=>i.instanceId==='shop-plant-a'),moved);
 assert.deepEqual(reloaded.world.construction.wallEdges,saved.world.construction.wallEdges);
 assert.deepEqual(errors,[]);
 console.log('F5-D.2 mobile WebGL furnished room move/undo/redo/reload PASS');
}finally{await browser.close();}
