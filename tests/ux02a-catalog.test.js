import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
import {newFurnitureShop,MARKET_OFFERS,findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const game=read('../src/game.js'),html=read('../index.html'),css=read('../styles.css');
const residents=[{x:-.8,z:2.95},{x:-.25,z:.35}];

test('UX-02a: catalog card opens non-persistent preview through canonical Buy handler',()=>{
  assert.match(game,/button\.addEventListener\('click',\(\)=>\{\s*if\(!furnishMode\|\|!shopOpen\|\|shopPlacing\)return;\s*chooseShopProduct\(item\.itemId\);/);
  assert.match(game,/\$\('furnish-buy'\)\.click\(\);/);
  assert.match(game,/shopPlacing=true;shopPose=null;shopManualPose=false;shopSwipeRawPose=null;/);
  assert.match(game,/const ok=applyMarketTransaction\(buyMarketItem\(/);
  assert.match(game,/if\(ok\)\{\s*shopPlacing=false/);
  assert.match(game,/const visible=selectShopCatalog\(/);
  assert.match(game,/const id=chooseComparableVariant\(/);
  assert.match(html,/id="furnish-action-summary"/);
  assert.match(html,/▦ В комнате/);
  assert.match(css,/furnish-purchase-actions\{\s*position:sticky;bottom:0/);
  assert.match(css,/furnish-type-tabs button,\s*\.furniture-editor\[data-editor-view="shop"\] \.furnish-catalog-filters select/);
});

test('UX-02a: chair Loft 110 credits is quoted without mutating the world; same instance cannot be paid twice',()=>{
  const offer=MARKET_OFFERS.find(x=>x.itemId==='chair.loft');
  assert.equal(offer?.price,110);
  const world=newFurnitureWorld(),shop=newFurnitureShop();
  const options={residents},pose=findMarketPlacement(world,shop,'chair.loft',options);
  assert.ok(pose,'chair has valid placement');
  assert.equal(shop.credits,5000);
  const pending={...pose,yaw:(pose.yaw+90)%360};
  const candidate=buyMarketItem(world,shop,'chair.loft',pending,options);
  assert.equal(candidate.ok,true,candidate.reason);
  assert.equal(shop.credits,5000,'quote is side-effect-free');
  assert.equal(world.instances.length,10);
  assert.equal(candidate.shop.credits,4890);
  assert.equal(candidate.world.instances.length,11);
  assert.equal(candidate.world.instances.at(-1).itemDefinitionId,'chair.loft');
  const secondQuote=buyMarketItem(candidate.world,candidate.shop,'chair.loft',pending,options);
  assert.notEqual(secondQuote.instanceId,candidate.instanceId,'new buy requires a new confirmation');
  assert.equal(candidate.shop.credits,4890,'rendering a second quote never charges again');
});

test('UX-02a: preview cancel leaves saved root-v1 wallet and furniture unchanged',()=>{
  const world=newFurnitureWorld(),shop=newFurnitureShop();
  const baseline=JSON.stringify({version:1,world,shop});
  const pose=findMarketPlacement(world,shop,'chair.loft',{residents});
  assert.ok(pose);
  const quote=buyMarketItem(world,shop,'chair.loft',pose,{residents});
  assert.equal(quote.ok,true,quote.reason);
  assert.equal(JSON.stringify({version:1,world,shop}),baseline);
  assert.match(game,/\$\('furnish-place-cancel'\)\.addEventListener\('click'/);
  assert.match(html,/До подтверждения деньги не списываются/);
});
