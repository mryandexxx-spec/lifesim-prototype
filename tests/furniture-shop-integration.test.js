import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {newHousehold,loadHousehold} from '../src/household.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';
import {newFurnitureShop,buyMarketItem,storeMarketItem,sellMarketItem,
  findMarketPlacement} from '../src/furniture-shop.js';
import {FURNITURE_CATALOG} from '../src/furniture-catalog.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const people={residents:[{x:-.8,z:2.95},{x:-.25,z:.35}]};
test('F2.1 owner-safe save migrates market once, without changing legacy key/root version',()=>{
  const root=newHousehold();
  assert.equal(root.version,1);
  assert.equal(root.shop.credits,5000);
  const old=copy(root);delete old.shop;
  const first=loadHousehold(old),again=loadHousehold(copy(first));
  assert.deepEqual(first.shop,again.shop);
  assert.deepEqual(first.world,again.world);
  assert.deepEqual(first.actionQueues,again.actionQueues);
});
test('F2.1 editor undo/redo restores both furniture and money, even across move',()=>{
  const root=newHousehold();
  const session=createFurnitureEditor(root.world.furniture,root.shop);
  const pose=findMarketPlacement(session.state().world,session.state().shop,'plant',people);
  assert.ok(pose);
  const market=buyMarketItem(session.state().world,session.state().shop,'plant',pose,people);
  assert.equal(market.ok,true);
  const bought=session.transactMarket(market);
  assert.equal(bought.ok,true);
  assert.equal(bought.shop.credits,4870);
  assert.equal(bought.world.instances.length,11);
  const undo=session.undo();
  assert.equal(undo.ok,true);
  assert.equal(undo.shop.credits,5000);
  assert.equal(undo.world.instances.length,10);
  assert.equal(session.redo().shop.credits,4870);
  assert.equal(session.undo().shop.credits,5000);
  const table=session.state().world.instances.find(i=>i.prefabId==='table');
  const step=session.commit(table.instanceId,{x:0,z:-1.35,yaw:0},people);
  assert.equal(step.ok,true);
  assert.equal(step.shop.credits,5000);
  assert.equal(session.redo().reason,'empty-history','different move clears paid redo');
});
test('F2.1 atomic storage/sale within editor and full save/reload preserve currency',()=>{
  const root=newHousehold(), editor=createFurnitureEditor(root.world.furniture,root.shop);
  const item=root.world.furniture.instances.find(i=>i.prefabId==='plant');
  const stored=editor.transactMarket(storeMarketItem(editor.state().world,
    editor.state().shop,item.instanceId));
  assert.equal(stored.ok,true);
  assert.equal(stored.world.instances.find(i=>i.instanceId===item.instanceId).location,'storage');
  const sold=editor.transactMarket(sellMarketItem(editor.state().world,
    editor.state().shop,item.instanceId));
  assert.equal(sold.ok,true);
  assert.equal(sold.shop.credits,5091);
  root.world.furniture=sold.world;root.shop=sold.shop;
  const reloaded=loadHousehold(copy(root));
  assert.equal(reloaded.shop.credits,5091);
  assert.equal(reloaded.world.furniture.instances.length,9);
  const undid=editor.undo();
  assert.equal(undid.shop.credits,5000);
  assert.equal(undid.world.instances.length,10);
});
test('F2.1 frontend owns one compatible shop for world furniture and safeguards',()=>{
  const game=source('../src/game.js'),html=source('../index.html'),css=source('../styles.css');
  const pages=source('../.github/workflows/pages.yml');
  assert.ok(pages.includes('node --check src/furniture-shop.js'));
  assert.ok(pages.includes('cp src/furniture-shop.js site/src/'));
  assert.match(game,/template\.clone\(\)/);
  assert.match(game,/decorNodes\.set\(item\.instanceId,node\)/);
  assert.match(game,/node\.enabled=item\.location==='home'/);
  assert.match(game,/editSession=createFurnitureEditor\(game\.world\.furniture,game\.shop\)/);
  assert.match(game,/applyMarketTransaction\(buyMarketItem\(/);
  assert.match(game,/applyMarketTransaction\(sellMarketItem\(/);
  assert.match(game,/applyMarketTransaction\(storeMarketItem\(/);
  assert.match(game,/applyMarketTransaction\(restoreMarketItem\(/);
  for(const id of ['furnish-shop-toggle','furnish-buy','furnish-stock','furnish-preview',
    'furnish-store','furnish-restore','furnish-sell','furnish-balance'])
    assert.ok(html.includes('id="'+id+'"'));
  assert.match(css,/\.furnish-shop\[hidden\]/);
  assert.ok(!game.includes('game.paused=true;'));
  assert.ok(FURNITURE_CATALOG.plant.price===null,
    'provisional pricing must not be presented as final prefab balance');
});

test('F2.1 PlayCanvas runtime creates, stores and removes real independent prefab copies',()=>{
  const gameSource=source('../src/game.js');
  assert.match(gameSource,/decorTemplates\.set\(prefabId,node\)/);
  const start=gameSource.indexOf('  const updateDecorNodes=(previewId=null,previewPose=null)=>{');
  const end=gameSource.indexOf('  const primitive =',start);
  assert.ok(start>0&&end>start);
  const updateCode=gameSource.slice(start,end)+'\nupdateDecorNodes();';
  const plant='home-plant-1',duplicate='shop-plant-100';
  const game={world:{furniture:{instances:[
    {instanceId:plant,prefabId:'plant',x:4.175,z:3.22,yaw:0,location:'home'},
    {instanceId:duplicate,prefabId:'plant',x:0,z:-2,yaw:90,location:'home'}
  ]}}};
  let clones=0,destroyed=0,refreshes=0;
  const fakeNode=()=>({enabled:true,setPosition(x,y,z){this.at={x,y,z};},
    setEulerAngles(x,y,z){this.yaw=y;},destroy(){destroyed++;}});
  const original=fakeNode();
  const nodes=new Map([[plant,original]]);
  const template={clone(){clones++;return fakeNode();}};
  const ctx={game,decorNodes:nodes,decorTemplates:new Map([['plant',template]]),
    SHOP_ITEMS:[{prefabId:'plant'}],app:{root:{addChild(){}}},
    refreshSofaSeat(){refreshes++;}};
  assert.doesNotThrow(()=>runInNewContext(updateCode,ctx,{timeout:1000}));
  assert.equal(clones,1);
  assert.equal(nodes.get(duplicate).at.x,0);
  assert.equal(nodes.get(duplicate).yaw,-90);
  game.world.furniture.instances[1].location='storage';
  runInNewContext(updateCode,ctx,{timeout:1000});
  assert.equal(nodes.get(duplicate).enabled,false);
  assert.equal(nodes.get(plant).enabled,true);
  game.world.furniture.instances.pop();
  runInNewContext(updateCode,ctx,{timeout:1000});
  assert.equal(nodes.has(duplicate),false);
  assert.equal(destroyed,1);
  assert.equal(refreshes,3);
});
