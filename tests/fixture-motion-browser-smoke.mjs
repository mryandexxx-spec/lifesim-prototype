// Run against a local Pages assembly with the real PlayCanvas module.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {gardenApproach} from '../src/gardening.js';
import {poolCellIndex} from '../src/pool-topology.js';
import {beginPoolSwim,arrivePoolApproach} from '../src/pool-swim-runtime.js';

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
    assert.ok(await page.evaluate(()=>sceneRoot.findByName('flush-lever joint').enabled));
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
  console.log('Animated imported fixtures, swimming and watering passed at 390×844');
}finally{await browser.close();}
