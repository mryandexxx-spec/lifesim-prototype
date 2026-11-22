// Run against a local Pages assembly with the real PlayCanvas module.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {ACTIONS,arrive,SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenApproach} from '../src/gardening.js';
import {poolCellIndex} from '../src/pool-topology.js';
import {beginPoolSwim,arrivePoolApproach} from '../src/pool-swim-runtime.js';

import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {arriveReadingJourney} from '../src/reading-journey.js';
import {chooseMusicListeningSpot} from '../src/music-listening.js';
import {MUSIC_DANCE_ACTIVITY_ID,MUSIC_CONTENT_IDS,READING_ACTIVITY_ID,
  READING_CONTENT_ID} from '../src/hobby-reading.js';

function buy(root,sku){
  const options={residents:[root.position,root.otherSim.position]};
  const placement=findMarketPlacement(root.world.furniture,root.shop,sku,options);
  assert.ok(placement,sku);
  const result=buyMarketItem(root.world.furniture,root.shop,sku,placement,options);
  assert.ok(result.ok,result.reason);
  root.world.furniture=result.world;
  root.shop=result.shop;
  return result.instanceId;
}

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
async function scene(root,check){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try{
    await ctx.addInitScript(({root,key,tour})=>{
      localStorage.setItem(key,JSON.stringify(root));localStorage.setItem(tour,'done');
    },{root,key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY});
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/?furniture=qa',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__LifeSimMeshyFurnitureStats?.().attached>=8);
    await page.evaluate(async()=>{window.sceneRoot=(await import('playcanvas')).Application.getApplication().root;});
    await check(page);
  }finally{await ctx.close();}
}
function home(){
  const r=newHousehold();
  for(const actor of [r,r.otherSim])actor.autonomy.enabled=false;
  return r;
}
try{
  const room=home();
  for(const [actor,id,elapsed] of [['alex','fridge',5],['mira','shower',2]]){
    assert.ok(chooseResidentAction(room,id,false,actor));
    const a=actor==='alex'?room:room.otherSim;
    arrive(a);a.action.elapsed=elapsed;
  }
  await scene(room,async page=>{
    await page.waitForFunction(()=>{
      const hinge=sceneRoot.findByName('upper-door joint'),panel=sceneRoot.findByName('sliding-panel joint');
      return hinge?.enabled&&Math.abs(hinge.getLocalEulerAngles().y)>1&&panel?.getLocalPosition().x<-.01&&
        sceneRoot.findByName('Meshy furniture fixture.shower').enabled;
    });
  });

  const bathroom=home();
  const stereo=buy(bathroom,'music.starter');
  const spot=chooseMusicListeningSpot(bathroom.world,bathroom.otherSim.position,stereo);
  assert.ok(spot);
  assert.ok(chooseResidentAction(bathroom,'music',false,'mira',stereo,
    MUSIC_DANCE_ACTIVITY_ID,MUSIC_CONTENT_IDS[1],spot));
  bathroom.otherSim.position={...spot.point};
  arrive(bathroom.otherSim);
  assert.ok(chooseResidentAction(bathroom,'toilet',false,'alex'));
  arrive(bathroom);
  bathroom.action.elapsed=ACTIONS.toilet.duration*.48;
  await scene(bathroom,async page=>{
    const flush=async()=>{
      await page.waitForFunction(()=>{
        const fixture=sceneRoot.findByName('Meshy furniture fixture.toilet');
        return fixture?.enabled&&fixture.findByName('flush-lever joint')?.getLocalPosition().y<-.01;
      });
      await page.waitForFunction(()=>sceneRoot.findByName('flush-lever joint').getLocalPosition().y===0);
    };
    const dance=async()=>{
      await page.evaluate(id=>{window.danceStation=id;},stereo);
      await page.waitForFunction(()=>sceneRoot.findByName('Meshy Mira visual')?.enabled);
      const before=await page.evaluate(()=>sceneRoot.findByName('Meshy Mira visual')
        .children[0].getLocalPosition().x);
      await page.waitForFunction(x=>{
        const skin=sceneRoot.findByName('Meshy Mira visual');
        const station=sceneRoot.findByName('F2 purchased / '+window.danceStation);
        return station?.findByName('Meshy furniture music.starter')?.enabled&&skin.enabled&&Math.abs(skin.children[0].getLocalPosition().x-x)>.015;
      },before);
    };
    await Promise.all([flush(),dance()]);
  });

  const reading=home();
  const shelf=buy(reading,'bookcase.starter');
  assert.ok(chooseResidentAction(reading,'hobby',false,'alex',shelf,
    READING_ACTIVITY_ID,READING_CONTENT_ID));
  for(const [action,id] of [['hobby',shelf],['sofa',reading.action.readingSeatInstanceId]]){
    reading.position={...furnitureActionApproach(reading.world,action,id)};
    assert.ok(arriveReadingJourney(reading.action));
    tickHousehold(reading,action==='hobby'?2.4:6);
  }
  tickHousehold(reading,2.4);
  assert.equal(reading.action.readingStage,'reading');
  await scene(reading,async page=>{
    await page.waitForFunction(()=>{
      const skin=sceneRoot.findByName('Meshy Alex visual');
      const book=skin?.findByName('Meshy Alex reading book');
      const leaf=book?.findByName('turning leaf');
      return skin?.enabled&&book?.enabled&&leaf?.enabled&&leaf.getLocalPosition().y>.025;
    });
    await page.waitForFunction(()=>!sceneRoot.findByName('Meshy Alex reading book')
      .findByName('turning leaf').enabled);
  });
  const studio=home(),easel=buy(studio,'easel.starter');
  assert.ok(chooseResidentAction(studio,'paint',false,'alex',easel,
    'hobby.paint.picture','painting.hills'));
  studio.position={...furnitureActionApproach(studio.world,'paint',easel)};
  arrive(studio);tickHousehold(studio,12);
  const item=studio.world.furniture.instances.find(i=>i.instanceId===easel);
  studio.createdWorks.push({id:'work:painting:alex:paint-preview',ownerId:'alex',
    easelInstanceId:easel,contentId:'painting.garden',seed:12345,quality:65,
    createdAt:studio.minutes,renderVersion:1,kind:'artwork',location:'studio',
    origin:{x:item.x,z:item.z,yaw:item.yaw}});
  await scene(studio,async page=>{
    await page.waitForFunction(()=>{
      const brush=sceneRoot.findByName('H5a hand-held wooden brush');
      const image=node=>{
        const canvas=node?.render?.material?.diffuseMap?.getSource();
        if(!node?.enabled||canvas?.width!==256)return false;
        const pixels=canvas.getContext('2d').getImageData(56,70,128,110).data;
        const colors=new Set();
        for(let i=0;i<pixels.length;i+=32)colors.add((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]);
        return colors.size>90;
      };
      return brush?.enabled&&image(sceneRoot.findByName('H5 paint surface'))&&
        image(sceneRoot.findByName('Finished painted linen'));
    });
  });
  let lot=home();
  const p=previewOutdoorFeatureEdit(lot,{operation:'place',itemId:'garden.herb.mint',pose:{x:12,z:-7,yaw:0}});
  assert.ok(p.ok,p.reason);lot=commitOutdoorFeatureEdit(lot,p).root;
  const bed=lot.world.outdoors.features.find(f=>f.itemId==='garden.herb.mint');
  const start=poolCellIndex(7.25,-7.25);
  lot.world.outdoors.pools=[{poolId:'pool-1',cells:Array.from({length:16},(_,i)=>start+64*Math.floor(i/4)+i%4)}];
  lot.world.outdoors.poolFixtures=[{fixtureId:'fixture-1',poolId:'pool-1',edgeCell:start,side:'west',kind:'ladder',purchasePriceCredits:120}];
  const swim=beginPoolSwim(lot,'alex',{actionId:'swim',poolId:'pool-1'});
  lot.position={...swim.action.dryApproach};arrivePoolApproach(lot,'alex');
  for(let i=0;i<25&&lot.action?.stage!=='swimming';i++)tickHousehold(lot,1);
  assert.equal(lot.action.stage,'swimming');
  const goal=gardenApproach(lot.world,bed.instanceId,lot.otherSim.position).goal;
  lot.otherSim.position={...goal};
  lot.otherSim.action={id:'garden',phase:'using',automatic:false,elapsed:3,gardenActionId:'water',
    gardenGoal:goal,targetInstanceId:bed.instanceId,gardenPlantedAt:lot.world.outdoors.gardens[bed.instanceId].plantedAt};
  await scene(lot,async page=>{
    await page.waitForFunction(()=>{
      const alex=sceneRoot.findByName('Meshy Alex visual'),mira=sceneRoot.findByName('Meshy Mira visual');
      return alex?.enabled&&mira?.enabled&&mira.parent.findByName('Water stream')?.enabled&&
        mira.parent.findByName('Watering can')?.enabled;
    });
    const read=()=>page.evaluate(()=>{
      const skin=sceneRoot.findByName('Meshy Alex visual');
      return skin.findByName('mixamorig:LeftArm').getLocalRotation().toString();
    });
    const before=await read();
    await page.waitForFunction(before=>sceneRoot.findByName('Meshy Alex visual')
      .findByName('mixamorig:LeftArm').getLocalRotation().toString()!==before,before);
  });
  assert.deepEqual(errors,[]);
  console.log('Fixture motion, reading, dancing, swimming and watering passed at 390×844');
}finally{await browser.close();}
