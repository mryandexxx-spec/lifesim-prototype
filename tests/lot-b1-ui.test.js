/** LOT-B1 source contract + real-world mobile paint renderer smoke in CI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newHousehold,loadHousehold} from '../src/household.js';
import {previewOutdoorPaint,commitOutdoorPreview} from '../src/outdoor-proposals.js';
import {outdoorGroundKind} from '../src/lot-surface.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('LOT-B1: mobile lot editor is reachable from Home, without another fixed nav control',()=>{
  for(const id of ['home-outdoors','outdoor-editor','outdoor-tool-paint','outdoor-tool-camera',
    'outdoor-ground-kind','outdoor-preview-text','outdoor-balance','outdoor-apply',
    'outdoor-cancel','outdoor-undo','outdoor-redo','outdoor-exit'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="home-open"/);
  assert.match(html,/id="home-outdoors"/);
  assert.match(styles,/\.outdoor-editor\[hidden\]/);
  assert.match(styles,/min-height:44px/);
  assert.match(game,/renderOutdoorGround\(\)/);
  assert.match(game,/new pc\.Mesh\(app\.graphicsDevice\)/);
  assert.match(game,/previewOutdoorPaint\(game/);
  assert.match(game,/commitOutdoorPreview\(game/);
  assert.match(game,/if\(outdoorMode\)\{/);
  assert.match(game,/document\.hidden\)\{/);
});
test('LOT-B1: painting and local undo/redo financial deltas have no phantom credits',()=>{
  const h=newHousehold(),from={x:19,z:-9},to={x:20,z:-8};
  const priced=previewOutdoorPaint(h,{from,to,kind:'gravel'});
  assert.ok(priced.ok,priced.reason);
  const applied=commitOutdoorPreview(h,priced);
  assert.ok(applied.ok,applied.reason);
  assert.equal(applied.root.shop.credits,h.shop.credits-priced.cost);
  assert.equal(applied.root.financialHistory.entries.length,1);
  const reload=loadHousehold(JSON.parse(JSON.stringify(applied.root)));
  assert.equal(reload.shop.credits,applied.root.shop.credits);
  assert.equal(outdoorGroundKind(reload.world.outdoors,19,-9),'gravel');
  const backToLawn=previewOutdoorPaint(reload,{from,to,kind:'lawn'});
  assert.ok(backToLawn.ok,backToLawn.reason);
  assert.equal(backToLawn.cost,0,'manually repainting lawn does not refund old work');
  const reset=commitOutdoorPreview(reload,backToLawn);
  assert.equal(reset.root.shop.credits,reload.shop.credits);
});
