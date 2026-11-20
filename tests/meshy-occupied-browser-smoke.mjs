// Load actual v1 saves and measure the animated skeletons in the running game.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold,chooseResidentAction} from '../src/household.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';
import {buyMarketItem} from '../src/furniture-shop.js';

const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
mkdirSync('meshy-starter-catalog-artifacts',{recursive:true});
try{
  for(const [index,seatSku] of [null,'sofa.loft','armchair.wing','armchair.shell','sofa.comfort','chair.loft'].entries()){
    const seed=newHousehold('2026-11-20');
    seed.paused=false;
    for(const actor of [seed,seed.otherSim])actor.autonomy.enabled=false;
    let seatId='home-sofa-1';
    const chair=seatSku?.includes('chair');
    if(seatSku){
      const sale=buyMarketItem(seed.world.furniture,seed.shop,seatSku,{x:8,z:0,yaw:(index===4?1:index%4)*90});
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
      await ctx.addInitScript(({seed,key,tourKey})=>{
        localStorage.setItem(key,JSON.stringify(seed));
        localStorage.setItem(tourKey,'done');
      },{seed,key:SAVE_KEY,tourKey:UI_TOUR_STORAGE_KEY});
      const page=await ctx.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:8765/?furniture=qa',{waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
      await page.evaluate(async()=>{window.roomScene=(await import('playcanvas')).Application.getApplication().root;});
      const slot=sleepingActor.action.bedSlot;
      await page.waitForFunction(({slot,bedNode,seatNode,sku})=>{
        if(!window.roomScene.findByName(seatNode)?.findByName('Meshy furniture '+sku)?.enabled)return false;
        const quilt=window.roomScene.findByName(bedNode).findByName('Platform quilt '+slot);
        return quilt?.enabled&&quilt.getLocalScale().z>.998;
      },{slot,bedNode,seatNode:(seatSku?'F2 purchased / ':'F1 furniture / ')+seatId,
        sku:seatSku||'sofa.comfort'},{timeout:100000});
      const rows=await page.evaluate(({sitter,seatId,seatSku,slot,bedNode})=>{
        return ['alex','mira'].map(id=>{
          const skin=roomScene.findByName(id==='alex'?'Meshy Alex visual':'Meshy Mira visual');
          const seat=id===sitter;
          const target=roomScene.findByName(seat?(seatSku?'F2 purchased / ':'F1 furniture / ')+seatId:bedNode);
          const toLocal=target.getWorldTransform().clone().invert();
          const joint=name=>{
            const p=toLocal.transformPoint(skin.findByName(name==='headfront'?name:'mixamorig:'+name).getPosition());
            return {x:p.x,y:p.y,z:p.z};
          };
          return {id,seat,sku:seat?(seatSku||'sofa.comfort'):'bed.platform',visible:skin.enabled,
            slot,head:joint('Head'),hip:joint('Hips'),foot:joint('LeftFoot'),face:joint('headfront'),knee:joint('LeftLeg')};
        });
      },{sitter,seatId,seatSku,slot,bedNode});
      console.log(JSON.stringify(rows));
      // Frame the occupied item itself, including copies far from the starter
      // camera. Only the test camera moves; joints were sampled above.
      await page.locator('#pause-btn').tap();
      for(const kind of ['seat','bed']){
        await page.evaluate(async({kind,name})=>{
          const {Vec3}=await import('playcanvas');
          const target=roomScene.findByName(name).getWorldTransform();
          const camera=roomScene.findByName('Camera');
          const eye=kind==='seat'?new Vec3(2.4,2.25,-3.8):new Vec3(3.1,3.35,2.6);
          camera.setPosition(target.transformPoint(eye));
          camera.lookAt(target.transformPoint(new Vec3(0,.60,0)));
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        },{kind,name:kind==='seat'?(seatSku?'F2 purchased / ':'F1 furniture / ')+seatId:bedNode});
        await page.locator('#game-canvas').screenshot({
          path:'meshy-starter-catalog-artifacts/occupied-'+index+'-'+kind+'.png',
          style:'body * { visibility:hidden !important } #game-canvas { visibility:visible !important }'
        });
      }
      for(const row of rows){
        assert.ok(row.visible);
        if(row.seat){
          const height=chair ? .63 : .35;
          assert.ok(row.hip.y>=height+.02&&row.hip.y<height+.48,'pelvis on cushion: '+JSON.stringify(row));
          assert.ok(row.face.z<row.head.z-.02,'face points away from the backrest: '+JSON.stringify(row));
          assert.ok(row.knee.z<row.hip.z-.2&&row.foot.y>.15,'knees forward, feet above floor: '+JSON.stringify(row));
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
