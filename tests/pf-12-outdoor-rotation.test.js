import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {newHousehold} from '../src/household.js';
import {previewOutdoorFeatureEdit,commitOutdoorFeatureEdit} from '../src/outdoor-proposals.js';
import {outdoorFeatureRect} from '../src/outdoor-catalog.js';
import {outdoorBenchPose} from '../src/outdoor-interactions.js';

const source=readFileSync('src/game.js','utf8');
const region=source.slice(source.indexOf('  const setOutdoorVisualPose='),source.indexOf('  const renderOutdoorFeatures='));
const node=()=>({position:null,yaw:null,destroyed:false,setLocalPosition(x,y,z){this.position=[x,y,z]},setLocalEulerAngles(x,y,z){this.yaw=y},destroy(){this.destroyed=true}});
function harness(){
 const item={instanceId:'out-1',itemId:'garden.bench',x:18,z:8,yaw:0};
 const owned=node();owned.setLocalPosition(18,-.53,8);owned.setLocalEulerAngles(0,0,0);
 const created=[],invalidations=[];
 const sandbox={outdoorNodesById:new Map([[item.instanceId,owned]]),outdoorFeaturePreview:null,
  OUTDOOR_CATALOG:{'garden.bench':{category:'furniture'},'flower.tulip':{category:'flower'}},
  vegetation:{invalidateTransforms(n){invalidations.push(n)}},
  createOutdoorFeatureNode:(item,opts)=>{assert.equal(opts.preview,true);const n=node();created.push(n);return n}};
 vm.runInNewContext(region+'\nthis.sync=syncOutdoorFeaturePreview;this.clear=clearOutdoorFeaturePreview;',sandbox);
 return {item,owned,created,invalidations,sync:sandbox.sync,clear:sandbox.clear};
}
test('PF-12 actual editor preview adapter rotates original root and restores without mutating world',()=>{
 const h=harness(),before=JSON.stringify(h.item);
 for(const yaw of [90,180,270,0]){h.sync(h.item,{x:19,z:8,yaw},true);assert.deepEqual(h.owned.position,[19,-.53,8]);assert.ok(h.owned.yaw===-yaw);}
 assert.equal(JSON.stringify(h.item),before);assert.equal(h.created.length,0);
 h.clear();assert.deepEqual(h.owned.position,[18,-.53,8]);assert.ok(h.owned.yaw===0);
 h.clear();assert.equal(h.owned.destroyed,false);
});
test('PF-12 new placement reuses one node; switching or cancel destroys it, no owned node destroyed',()=>{
 const h=harness();h.sync(h.item,{x:18,z:8,yaw:0},false);
 h.sync(h.item,{x:18,z:8,yaw:90},false);assert.equal(h.created.length,1);assert.equal(h.created[0].yaw,-90);
 h.sync(h.item,{x:18,z:8,yaw:90},true);assert.equal(h.created[0].destroyed,true);
 h.clear();assert.equal(h.owned.destroyed,false);
 h.sync({itemId:'flower.tulip'},{x:18,z:8,yaw:0},false);h.clear();assert.equal(h.created[1].destroyed,true);
 assert.equal(h.invalidations.at(-1),undefined);
});
test('PF-12 valid rotation uses same candidate yaw for preview, footprint, persisted state and seating',()=>{
 let root=newHousehold('2026-11-26');root.shop.credits=30000;
 const placed=previewOutdoorFeatureEdit(root,{operation:'place',itemId:'garden.bench',pose:{x:18,z:8,yaw:0}});
 assert.ok(placed.ok,placed.reason);root=commitOutdoorFeatureEdit(root,placed).root;
 const original=root.world.outdoors.features.find(x=>x.instanceId===placed.instanceId);
 const before=JSON.stringify(root);const candidate={x:18,z:8,yaw:90};
 const draft=previewOutdoorFeatureEdit(root,{operation:'move',instanceId:original.instanceId,pose:candidate});
 assert.ok(draft.ok,draft.reason);assert.deepEqual(draft.pose,candidate);assert.equal(JSON.stringify(root),before);
 assert.notDeepEqual(outdoorFeatureRect(original),outdoorFeatureRect({...original,...candidate}));
 const committed=commitOutdoorFeatureEdit(root,draft);assert.ok(committed.ok,committed.reason);
 const next=committed.root;assert.equal(next.shop.credits,root.shop.credits);
 assert.equal(next.world.outdoors.features.find(x=>x.instanceId===original.instanceId).yaw,90);
 assert.notDeepEqual(outdoorBenchPose(root.world,original.instanceId,0),outdoorBenchPose(next.world,original.instanceId,0));
});
test('PF-12 candidate wiring is shared with live model factory, and clear path destroys/restores staged preview',()=>{
 assert.match(source,/syncOutdoorFeaturePreview\(chosen,pose,operation==='move'\)/);
 assert.match(source,/showOutdoorFeatureGhost\(proposal.ok\?proposal.pose:pose,proposal.ok\)/);
 assert.match(source,/const clearOutdoorPending=[\s\S]*?clearOutdoorFeaturePreview\(\)/);
 assert.match(source,/if\(!preview&&outdoorLightNodes.length<OUTDOOR_LIGHT_LIMIT\)/);
 assert.match(source,/if\(!preview\)grillAnimated.push/);
});
