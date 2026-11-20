// Load actual v1 saves and measure the animated skeletons in the running game.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,chooseResidentAction} from '../src/household.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';
import {buyMarketItem} from '../src/furniture-shop.js';

const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
mkdirSync('meshy-starter-catalog-artifacts',{recursive:true});
try{
  for(const [index,seatSku] of [null,'sofa.loft','armchair.wing','armchair.shell'].entries()){
    const seed=newHousehold('2026-11-20');
    seed.paused=false;
    for(const actor of [seed,seed.otherSim])actor.autonomy.enabled=false;
    let seatId='home-sofa-1';
    const chair=seatSku?.startsWith('armchair');
    if(seatSku){
      const sale=buyMarketItem(seed.world.furniture,seed.shop,seatSku,{x:8,z:0,yaw:index*90});
      assert.ok(sale.ok,JSON.stringify(sale.reason));
      seatId=sale.instanceId;
      seed.world.furniture=sale.world;
      seed.shop=sale.shop;
    }
    let bedId='home-bed-1';
    if(chair){
      const bed=buyMarketItem(seed.world.furniture,seed.shop,'bed.platform',
        {x:10.75,z:0,yaw:index===2?90:270});
      assert.ok(bed.ok,bed.reason);
      bedId=bed.instanceId;
      seed.world.furniture=bed.world;
      seed.shop=bed.shop;
    }
    const bedNode=(chair?'F2 purchased / ':'F1 furniture / ')+bedId;
    const sitter=index%2?'mira':'alex',sleeper=index%2?'alex':'mira';
    assert.ok(chooseResidentAction(seed,chair?'seat':'sofa',false,sitter,seatId));
    assert.ok(chooseResidentAction(seed,'bed',false,sleeper,bedId));
    const sleepingActor=sleeper==='alex'?seed:seed.otherSim;
    sleepingActor.action.bedSlot=index%2?'right':'left';
    sleepingActor.needs.energy=5;
    arrive(seed);
    arrive(seed.otherSim);
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    try{
      await ctx.addInitScript(({seed,key})=>{
        localStorage.setItem(key,JSON.stringify(seed));
        localStorage.setItem('lifesim.uiTour.v1','done');
      },{seed,key:SAVE_KEY});
      const page=await ctx.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:8765/?furniture=qa',{waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
      await page.waitForFunction(n=>window.__LifeSimMeshyFurnitureStats?.().attached>=n,chair?5:seatSku?4:3);
      await page.evaluate(async()=>{window.roomScene=(await import('playcanvas')).Application.getApplication().root;});
      const slot=sleepingActor.action.bedSlot;
      await page.waitForFunction(({slot,bedNode})=>{
        const quilt=window.roomScene.findByName(bedNode).findByName('duvet '+slot);
        return quilt.render.enabled&&quilt.getLocalScale().z>1.448;
      },{slot,bedNode},{timeout:100000});
      const rows=await page.evaluate(({sitter,seatId,seatSku,slot,bedNode})=>{
        return ['alex','mira'].map(id=>{
          const skin=roomScene.findByName(id==='alex'?'Meshy Alex visual':'Meshy Mira visual');
          const seat=id===sitter;
          const target=roomScene.findByName(seat?(seatSku?'F2 purchased / ':'F1 furniture / ')+seatId:bedNode);
          const toLocal=target.getWorldTransform().clone().invert();
          const joint=name=>{
            const p=toLocal.transformPoint(skin.findByName('mixamorig:'+name).getPosition());
            return {x:p.x,y:p.y,z:p.z};
          };
          return {id,seat,sku:seat?(seatSku||'sofa.comfort'):'bed.platform',visible:skin.enabled,
            slot,head:joint('Head'),hip:joint('Hips'),foot:joint('LeftFoot')};
        });
      },{sitter,seatId,seatSku,slot,bedNode});
      console.log(JSON.stringify(rows));
      await page.screenshot({path:'meshy-starter-catalog-artifacts/occupied-'+index+'.png'});
      for(const row of rows){
        assert.ok(row.visible);
        if(row.seat){
          const height=chair ? .63 : .35;
          assert.ok(row.hip.y>=height+.02&&row.hip.y<height+.48,'pelvis on cushion: '+JSON.stringify(row));
          assert.ok(row.head.y>row.hip.y+.4&&row.foot.z<row.hip.z-.15,'upright seated toward approach');
        }else{
          assert.ok(Math.abs(row.head.x-(slot==='left'?-.56:.56))<.32,'correct sleeping slot');
          assert.ok(Math.abs(row.head.z+.81)<.27,'head over pillow: '+JSON.stringify(row));
          assert.ok(row.head.z<row.hip.z-.25&&row.foot.z>row.hip.z+.25,'lying toward pillows');
          assert.ok(row.head.y>.63&&row.head.y<1.08&&row.hip.y>.49&&row.hip.y<.92,'supported sleeper: '+JSON.stringify(row));
        }
      }
      assert.deepEqual(errors,[]);
    }finally{await ctx.close();}
  }
}finally{await browser.close();}
