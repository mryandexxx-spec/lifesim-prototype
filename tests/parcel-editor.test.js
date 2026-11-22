import test from 'node:test';
import assert from 'node:assert/strict';
import {areaBuildTool,balanceQuote,outdoorSectionFor,parcelCamera,PARCEL_SECTIONS} from '../src/parcel-editor-ui.js';
import {OUTDOOR_PRODUCTS} from '../src/outdoor-catalog.js';
test('parcel editor opens all four sections and preserves position and zoom across projections',()=>{
  assert.deepEqual(Object.values(PARCEL_SECTIONS),['Дом','Мебель','Двор','Бассейн']);
  const view={centerX:4,centerZ:2,distance:35,yaw:45,pitch:38};
  assert.deepEqual(parcelCamera(view,true),{...view,yaw:0,pitch:89.9});
  assert.equal(parcelCamera(parcelCamera(view,true),false).distance,35);
  assert.equal(view.pitch,38);
});
test('display signed canonical quotes, including zero-cost moves and refunds',()=>{
  assert.equal(balanceQuote(1000,32),'Стоимость 32 кр. · остаток 968 кр.');
  assert.equal(balanceQuote(1000,-168),'Возврат 168 кр. · остаток 1168 кр.');
  assert.equal(balanceQuote(1000,0),'Стоимость 0 кр. · остаток 1000 кр.');
  assert.equal(balanceQuote(1000),'Баланс 1000 кр.');
});
test('all outdoor SKUs route back to the native catalog containing their exact instance',()=>{
  for(const item of OUTDOOR_PRODUCTS){
    const allowed={objects:['furniture','light'],plants:['tree','shrub','flower','fence'],garden:['garden']};
    assert.ok(allowed[outdoorSectionFor(item)].includes(item.category),item.itemId);
  }
  assert.equal(areaBuildTool('room'),true);assert.equal(areaBuildTool('move-wall'),false);
});
