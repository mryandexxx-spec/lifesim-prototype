import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {createFurnitureEditor} from '../src/furniture-editor.js';
import {quoteOwnedPlacement,findOwnedPlacement} from '../src/furniture-owned-preview.js';
import {buyMarketItem,findMarketPlacement,storeMarketItem,sellMarketItem} from '../src/furniture-shop.js';
import {recordFinanceChange} from '../src/finance-ledger.js';

const residents=[{x:-.8,z:2.95},{x:-.25,z:.35}];
const opts={residents};
const copy=value=>JSON.parse(JSON.stringify(value));
const latest=(world,id)=>world.instances.find(item=>item.instanceId===id);
test('UX-02b staging an owned item is pure; cancel preserves old root-v1 and credits',()=>{
 const root=newHousehold(),original=copy(root);
 const id='home-plant-1',pose=findOwnedPlacement(root.world.furniture,root.shop,'move',id,opts);
 assert.ok(pose,'canonical navigation finds a safe new cell');
 const quote=quoteOwnedPlacement(root.world.furniture,root.shop,'move',id,pose,opts);
 assert.equal(quote.ok,true,quote.reason);
 assert.notDeepEqual(latest(quote.world,id),latest(root.world.furniture,id));
 assert.deepEqual(root,original,'preview and cancellation never change the original save');
 assert.equal(loadHousehold(copy(root)).version,1);
});
test('UX-02b confirm move is one reversible F1 edit and preserves both residents',()=>{
 const root=newHousehold(),id='home-plant-1';
 const before=copy(root.world.furniture);
 const editor=createFurnitureEditor(root.world.furniture,root.shop);
 const pose=findOwnedPlacement(before,root.shop,'move',id,opts);
 assert.ok(pose);
 const moved=editor.commit(id,pose,opts);
 assert.equal(moved.ok,true,moved.reason);
 assert.equal(moved.shop.credits,root.shop.credits);
 assert.deepEqual(editor.undo().world.instances.map(x=>({...x,})).map(x=>({id:x.instanceId,x:x.x,z:x.z,yaw:x.yaw})),
   before.instances.map(x=>({id:x.instanceId,x:x.x,z:x.z,yaw:x.yaw})));
 assert.equal(editor.redo().world.instances.find(x=>x.instanceId===id).x,pose.x);
 assert.deepEqual(root.world.furniture,before);
 assert.equal(root.version,1);
 assert.ok(root.otherSim&&root.actionQueues,'two resident and FIFO models are not edited by staging');
});
test('UX-02b stored item keeps instanceId, stays stored until accepted and is free after reload',()=>{
 const root=newHousehold(),id='home-plant-1';
 const stored=storeMarketItem(root.world.furniture,root.shop,id,opts);
 assert.equal(stored.ok,true,stored.reason);
 const frozen=copy(stored);
 const pose=findOwnedPlacement(stored.world,stored.shop,'restore',id,opts);
 assert.ok(pose);
 const preview=quoteOwnedPlacement(stored.world,stored.shop,'restore',id,pose,opts);
 assert.equal(preview.ok,true,preview.reason);
 assert.equal(latest(preview.world,id).location,'home');
 assert.equal(latest(preview.world,id).instanceId,id);
 assert.equal(preview.amount,0);
 assert.equal(preview.shop.credits,stored.shop.credits);
 assert.deepEqual(stored,frozen,'cancel restores no state and no financial entry');
 root.world.furniture=preview.world;root.shop=preview.shop;
 const reloaded=loadHousehold(copy(root));
 assert.equal(latest(reloaded.world.furniture,id).instanceId,id);
 assert.equal(latest(reloaded.world.furniture,id).location,'home');
 assert.equal(reloaded.shop.credits,5000);
});
test('UX-02b last essentials, active and queued reservations cannot be sold or stored',()=>{
 const root=newHousehold(),id='home-plant-1';
 for(const prefab of ['bed','fridge','shower','toilet']){
   const item=root.world.furniture.instances.find(i=>i.prefabId===prefab);
   assert.equal(sellMarketItem(root.world.furniture,root.shop,item.instanceId,opts).reason,'last-essential');
   assert.equal(storeMarketItem(root.world.furniture,root.shop,item.instanceId,opts).reason,'last-essential');
 }
 const lock={...opts,lockedInstanceIds:[id]};
 assert.equal(sellMarketItem(root.world.furniture,root.shop,id,lock).reason,'reserved');
 assert.equal(storeMarketItem(root.world.furniture,root.shop,id,lock).reason,'reserved');
 assert.equal(quoteOwnedPlacement(root.world.furniture,root.shop,'move',id,
   {x:0,z:0,yaw:0},lock).reason,'reserved');
});
test('UX-02b resale amount 30% starter and 70% historical purchase, ledger once',()=>{
 const root=newHousehold(),id='home-plant-1';
 const original=sellMarketItem(root.world.furniture,root.shop,id,opts);
 assert.equal(original.ok,true);
 assert.equal(original.amount,39);
 const ledger=recordFinanceChange(root,original.shop,
  {kind:'sale',sourceId:id,atGameMinute:Math.floor(root.minutes)});
 assert.equal(ledger.ok,true);
 assert.equal(ledger.financialHistory.entries.filter(x=>x.kind==='sale').length,1);
 root.shop=ledger.shop;root.financialHistory=ledger.financialHistory;
 root.world.furniture=original.world;
 assert.equal(sellMarketItem(root.world.furniture,root.shop,id,opts).ok,false,
  'a second confirmation cannot resell the same instance');
 const pose=findMarketPlacement(root.world.furniture,root.shop,'chair.loft',opts);
 assert.ok(pose);
 const bought=buyMarketItem(root.world.furniture,root.shop,'chair.loft',pose,opts);
 assert.equal(bought.ok,true,bought.reason);
 assert.equal(latest(bought.world,bought.instanceId).purchasePriceCredits,110);
 const purchased=sellMarketItem(bought.world,bought.shop,bought.instanceId,opts);
 assert.equal(purchased.ok,true,purchased.reason);
 assert.equal(purchased.amount,77);
 const soldLedger=recordFinanceChange({...root,shop:bought.shop},purchased.shop,
   {kind:'sale',sourceId:bought.instanceId,atGameMinute:Math.floor(root.minutes)});
 assert.equal(soldLedger.financialHistory.entries.filter(x=>x.kind==='sale').length,2);
});
test('UX-02b mobile DOM contract: no auto-drop commit, explicit visible controls and reasons',()=>{
 const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(game,/const beginOwnedPlacement=/);
 assert.match(game,/const endEditorDrag=event=>[\s\S]*?Releasing the touch NEVER mutates a save/);
 assert.match(game,/\$\('furnish-owned-confirm'\)\.addEventListener/);
 assert.match(game,/if\(ownedPlacement\)cancelOwnedPlacement\(false\)/);
 assert.match(game,/const saleQuote=tradable\?sellMarketItem/);
 assert.match(game,/\$\('furnish-trade-status'\)\.textContent/);
 assert.match(html,/id="furnish-protected-shop"/);
 assert.match(game,/Одна кровать в доме/);
 assert.match(css,/left:auto;right:0;/);
 for(const id of ['furnish-move','furnish-owned-preview','furnish-owned-auto',
   'furnish-owned-turn','furnish-owned-confirm','furnish-owned-cancel'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(css,/\.furnish-owned-preview button\{min-width:0;min-height:44px/);
});

test('UX-02b mounted-light preview uses exported mount lookup; invalid draft never falls back to saved anchor',()=>{
 const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 assert.match(source,/import \{MOUNTED_LIGHTS,lightingMountPose,mountedAnchorAt/);
 assert.match(source,/previewing\?mount:item\.mount/);
 assert.doesNotMatch(source,/mount\|\|item\.mount/);
});
