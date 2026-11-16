import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FURNITURE_CATALOG,furnitureActionApproach,newFurnitureWorld,
  restoreFurnitureWorld,resolveActionFurniture} from '../src/furniture-catalog.js';
import {newFurnitureShop,buyMarketItem,storeMarketItem,restoreMarketItem} from '../src/furniture-shop.js';
import {findPath,isWalkable} from '../src/navigation.js';
import {newHousehold,loadHousehold,chooseResidentAction,furnitureAvailable,tickHousehold} from '../src/household.js';
import {ACTIONS,arrive,SAVE_KEY} from '../src/simulation.js';
import {UTILITY_FURNITURE,UTILITY_ACTION_IDS,furnitureUseWeight,
  switchLampAtArrival,lampIsOn} from '../src/furniture-interactions.js';
const copy=x=>JSON.parse(JSON.stringify(x));
const text=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const people={residents:[{x:-.25,z:.35},{x:-.80,z:2.95}]};
function bought(root,sku,x,z=0,yaw=0){
  const res=buyMarketItem(root.world.furniture,root.shop,sku,{x,z,yaw},people);
  assert.equal(res.ok,true,sku+' purchase: '+res.reason);
  root.world.furniture=res.world;root.shop=res.shop;
  return res.instanceId;
}
test('F4E: four independent utility capability contracts and eight SKU choices',()=>{
  const cases={lamp:'floorlamp',mirror:'mirror',dresser:'dresser',wardrobe:'wardrobe'};
  assert.deepEqual(new Set(UTILITY_ACTION_IDS),new Set(Object.keys(cases)));
  for(const [action,prefabId] of Object.entries(cases)){
    assert.equal(UTILITY_FURNITURE[action].prefabId,prefabId);
    assert.equal(FURNITURE_CATALOG[prefabId].actionId,action);
    assert.ok(FURNITURE_CATALOG[prefabId].capabilities.includes(UTILITY_FURNITURE[action].capability));
    assert.ok(FURNITURE_CATALOG[prefabId].approach);
    assert.equal(ACTIONS[action].benefitPerMinute,0);
    assert.equal(ACTIONS[action].duration,UTILITY_FURNITURE[action].duration);
  }
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(newFurnitureWorld().instances.length,10);
});
test('F4E: every object has physical A* target including 90-degree rotation',()=>{
  const root=newHousehold();
  const ids=[
    bought(root,'floorlamp.arc',6.5,-2,90),
    bought(root,'mirror.oval',8.5,-2,180),
    bought(root,'dresser.reed',10.5,2,90),
    bought(root,'wardrobe.classic',12.2,-1,180)
  ];
  for(const id of ids){
    const item=root.world.furniture.instances.find(x=>x.instanceId===id);
    const action=FURNITURE_CATALOG[item.prefabId].actionId;
    assert.equal(resolveActionFurniture(root.world,action,id)?.instanceId,id);
    const at=furnitureActionApproach(root.world,action,id);
    assert.ok(at,action);
    assert.equal(isWalkable(at.x,at.z,root.world),true);
    assert.ok(findPath(root.position,at,root.world));
  }
});
test('F4E: light never flips in a queue or while walking/paused, only after real arrival',()=>{
  const root=newHousehold();
  const id=bought(root,'floorlamp.tripod',9,0);
  assert.equal(lampIsOn(root.world,id),false);
  assert.equal(chooseResidentAction(root,'lamp',false,'alex',id),true);
  assert.equal(switchLampAtArrival(root.world,root),false);
  tickHousehold(root,1);
  assert.equal(lampIsOn(root.world,id),false);
  arrive(root);
  root.paused=true;
  tickHousehold(root,1);
  assert.equal(lampIsOn(root.world,id),false);
  root.paused=false;
  tickHousehold(root,1);
  assert.equal(lampIsOn(root.world,id),true);
  assert.equal(root.action.lampSwitched,true);
  const previousRev=root.world.furniture.revision;
  tickHousehold(root,1);
  assert.equal(root.world.furniture.revision,previousRev);
  assert.equal(lampIsOn(root.world,id),true);
});
test('F4E: both the light and the one-time receipt survive v1 reload without double-toggle',()=>{
  const root=newHousehold();
  const id=bought(root,'floorlamp.arc',9,0);
  assert.equal(chooseResidentAction(root,'lamp',false,'alex',id),true);
  arrive(root);tickHousehold(root,1);
  assert.equal(lampIsOn(root.world,id),true);
  const reloaded=loadHousehold(copy(root));
  assert.equal(reloaded.version,1);
  assert.equal(reloaded.action.lampSwitched,true);
  assert.equal(lampIsOn(reloaded.world,id),true);
  tickHousehold(reloaded,1);
  assert.equal(lampIsOn(reloaded.world,id),true);
  tickHousehold(reloaded,10);
  assert.equal(reloaded.action,null);
  assert.equal(chooseResidentAction(reloaded,'lamp',false,'alex',id),true);
  arrive(reloaded);tickHousehold(reloaded,1);
  assert.equal(lampIsOn(reloaded.world,id),false);
});
test('F4E: two residents cannot switch one lamp concurrently, different items remain free',()=>{
  const root=newHousehold();
  const one=bought(root,'floorlamp.arc',8,-2),two=bought(root,'floorlamp.tripod',11,-2);
  assert.equal(chooseResidentAction(root,'lamp',false,'alex',one),true);
  assert.equal(furnitureAvailable(root,'lamp','mira',one),false);
  assert.equal(furnitureAvailable(root,'lamp','mira',two),true);
  assert.equal(chooseResidentAction(root,'lamp',false,'mira',two),true);
  arrive(root);arrive(root.otherSim);
  tickHousehold(root,1);
  assert.equal(lampIsOn(root.world,one),true);
  assert.equal(lampIsOn(root.world,two),true);
});
test('F4E: mirror, wardrobe and dresser use independent physical instances and no fake points',()=>{
  const root=newHousehold();
  const ids=[
    ['mirror',bought(root,'mirror.panel',7,-2)],
    ['dresser',bought(root,'dresser.arch',9,-2)],
    ['wardrobe',bought(root,'wardrobe.open',11,-2)]
  ];
  root.autonomy.enabled=false;
  for(const [action,id] of ids){
    root.needs.fun=100;
    assert.equal(chooseResidentAction(root,action,false,'alex',id),true);
    assert.equal(root.action.targetInstanceId,id);
    arrive(root);tickHousehold(root,1);
    assert.equal(root.action.id,action);
    assert.ok(root.needs.fun<100,'no unearned Fun');
    assert.ok(furnitureUseWeight(root.action,id)>0);
    assert.equal(furnitureUseWeight(root.action,'wrong-item'),0);
    tickHousehold(root,ACTIONS[action].duration);
    assert.equal(root.action,null);
  }
});
test('F4E: opening envelope is deterministic, closes after cancellation/completion',()=>{
  const id='shop-wardrobe-99';
  const action={id:'wardrobe',phase:'using',targetInstanceId:id,elapsed:0};
  assert.equal(furnitureUseWeight(action,id),0);
  action.elapsed=11;
  assert.equal(furnitureUseWeight(action,id),1);
  action.elapsed=22;
  assert.equal(furnitureUseWeight(action,id),0);
  action.phase='walking';
  assert.equal(furnitureUseWeight(action,id),0);
  action.phase='using';action.id='mirror';
  assert.equal(furnitureUseWeight(action,id),0);
});
test('F4E: saved lamp state is optional, validated and survives storage/restoration',()=>{
  const root=newHousehold();const id=bought(root,'floorlamp.arc',9,0);
  const item=root.world.furniture.instances.find(x=>x.instanceId===id);
  item.lampOn=true;
  const restored=restoreFurnitureWorld(copy(root.world.furniture));
  assert.equal(restored.instances.find(x=>x.instanceId===id).lampOn,true);
  const stored=storeMarketItem(restored,root.shop,id);
  assert.equal(stored.ok,true);
  assert.equal(lampIsOn(stored.world,id),false,'stored lamps do not illuminate room');
  const replaced=restoreMarketItem(stored.world,root.shop,id,{x:9,z:0,yaw:0},people);
  assert.equal(replaced.ok,true);
  assert.equal(lampIsOn(replaced.world,id),true);
  const corrupted=copy(restored);
  corrupted.instances.find(x=>x.instanceId===id).lampOn='yes';
  const clean=restoreFurnitureWorld(corrupted);
  assert.equal(Object.hasOwn(clean.instances.find(x=>x.instanceId===id),'lampOn'),false);
});
test('F4E: impossible wall-facing fixture purchase is not accepted',()=>{
  const root=newHousehold();
  for(const sku of ['floorlamp.arc','mirror.oval','dresser.reed','wardrobe.classic']){
    const rejected=buyMarketItem(root.world.furniture,root.shop,sku,
      {x:12.2,z:-3.6,yaw:0},people);
    assert.equal(rejected.ok,false,sku);
    assert.ok(['unreachable-seat','unreachable-utility','room-bounds','collision'].includes(rejected.reason));
  }
});
test('F4E: Safari UI, both Meshy policies, real light and Pages bundle wired',()=>{
  const src=text('../src/game.js'),html=text('../index.html');
  const page=text('../.github/workflows/pages.yml');
  assert.match(src,/const light=new pc\.Entity\('F4E lamp light'\)/);
  assert.match(src,/light\.light\.enabled=on&&litUtilityCount<5/);
  assert.match(src,/furnitureUseWeight\(getActor\(game,id\)\?\.action,item\.instanceId\)/);
  assert.match(src,/new pc\.Entity\('F4E mirror highlight'\)/);
  assert.match(src,/\['sofa','seat','bed','tv','hobby','music',\.\.\.UTILITY_ACTION_IDS\]/);
  assert.match(src,/item\.prefabId==='wardrobe'\?2\.52/);
  assert.match(html,/1\.2u\.5 · F4D \/ H3 \/ F4E/);
  assert.match(html,/furniture-interactions\.js\?v=1\.2u-f4e/);
  assert.match(page,/node --check src\/furniture-interactions\.js/);
  assert.match(page,/src\/furniture-interactions\.js site\/src\//);
  assert.match(text('../src/meshy-visual-policy.js'),/\['lamp','mirror','dresser','wardrobe'\]/);
  assert.match(text('../src/meshy-mira-policy.js'),/\['lamp','mirror','dresser','wardrobe'\]/);
});
