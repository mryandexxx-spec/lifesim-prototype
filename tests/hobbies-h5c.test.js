import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PAINT_ACTIVITY_ID,PAINT_CONTENT_IDS,PAINT_SUBJECTS,PAINT_SKILL_ID,
  PAINT_CANVAS_BOUNDS,PAINT_COMPOSITION_SHAPES,canPaintContent,
  compositionForArtwork,paintingSeedFromSession,restoreCreatedWorks} from '../src/painting.js';
import {HOBBY_SKILLS,HOBBY_CONTENT} from '../src/hobby-reading.js';
import {getHobbyContent} from '../src/hobby-content.js';
import {skillProfileRows} from '../src/skill-presentation.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {newHousehold,loadHousehold,chooseResidentAction,tickHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {arrive,SAVE_KEY} from '../src/simulation.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const file=x=>readFileSync(new URL(x,import.meta.url),'utf8');
function studio(){
  const root=newHousehold();
  const placement=findMarketPlacement(root.world.furniture,root.shop,'easel.starter');
  assert.ok(placement);
  const tx=buyMarketItem(root.world.furniture,root.shop,'easel.starter',placement);
  assert.equal(tx.ok,true,tx.reason);
  root.world.furniture=tx.world;root.shop=tx.shop;
  return {root,id:tx.instanceId};
}
test('H5c: 13 original authored themes; 10 ordered level unlocks, three legacy themes free',()=>{
  assert.equal(PAINT_CONTENT_IDS.length,13);
  assert.equal(new Set(PAINT_CONTENT_IDS).size,13);
  assert.deepEqual(PAINT_CONTENT_IDS.slice(0,3),[
    'painting.hills','painting.garden','painting.city']);
  const labels=new Set(),unlocks=HOBBY_SKILLS.skills.painting.unlocks;
  assert.equal(unlocks.length,10);
  assert.deepEqual(unlocks.map(u=>u.minLevel),[1,2,3,4,5,6,7,8,9,10]);
  for(const id of PAINT_CONTENT_IDS){
    const theme=PAINT_SUBJECTS[id];
    assert.equal(typeof theme.label,'string');
    assert.equal(labels.has(theme.label),false,'same label: '+id);
    labels.add(theme.label);
    assert.equal(theme.palette.length,5);
    assert.equal(getHobbyContent(HOBBY_CONTENT,id)?.kind,'painting');
    assert.equal(getHobbyContent(HOBBY_CONTENT,id)?.label,theme.label);
    assert.equal(getHobbyContent(HOBBY_CONTENT,id)?.difficulty,Math.max(1,theme.minLevel));
  }
  const rows=skillProfileRows({schema:1,xpById:{}},HOBBY_SKILLS);
  assert.equal(rows.find(s=>s.id==='painting').unlocks.length,10);
  assert.match(rows.find(s=>s.id==='painting').unlocks[0].label,/Морской бриз/);
});
test('H5c: same skill-level gate across UI domain and real physical action start',()=>{
  const {root,id}=studio(),defs=HOBBY_SKILLS.skills.painting;
  for(const themeId of PAINT_CONTENT_IDS){
    const need=PAINT_SUBJECTS[themeId].minLevel;
    if(need===0){
      assert.equal(canPaintContent(root.skills,HOBBY_SKILLS,themeId),true);
      continue;
    }
    root.skills.xpById.painting=need===1?0:defs.xpThresholds[need-2];
    assert.equal(currentSkillLevel(root.skills,HOBBY_SKILLS,PAINT_SKILL_ID),need-1);
    assert.equal(canPaintContent(root.skills,HOBBY_SKILLS,themeId),false);
    assert.equal(chooseResidentAction(root,'paint',false,'alex',id,
      PAINT_ACTIVITY_ID,themeId),false,'locked '+themeId);
    assert.equal(root.action,null);
    root.skills.xpById.painting=defs.xpThresholds[need-1];
    assert.equal(canPaintContent(root.skills,HOBBY_SKILLS,themeId),true);
  }
  assert.equal(canPaintContent(root.skills,HOBBY_SKILLS,'painting.fake'),false);
  assert.equal(canPaintContent(root.otherSim.skills,HOBBY_SKILLS,'painting.aurora'),false,
    'resident skill progress must stay personal');
});
test('H5c: all baseline and generated shapes stay within the inner canvas',()=>{
  assert.equal(Object.keys(PAINT_COMPOSITION_SHAPES).length,PAINT_CONTENT_IDS.length);
  const bounds=PAINT_CANVAS_BOUNDS;
  for(const id of PAINT_CONTENT_IDS){
    const baseline=PAINT_COMPOSITION_SHAPES[id];
    assert.equal(baseline.length,6);
    const variants=[baseline];
    for(const seed of [0,1,2,17,252,93215,2147483647]){
      for(const quality of [1,50,100])
        variants.push(compositionForArtwork(id,seed,1,quality));
    }
    for(const parts of variants)for(const [kind,x,y,w,h,palette] of parts){
      assert.ok(['sphere','box'].includes(kind),id);
      assert.ok([x,y,w,h].every(Number.isFinite),id);
      assert.ok(w>0&&h>0,id);
      assert.ok(Number.isInteger(palette)&&palette>=0&&palette<5,id);
      assert.ok(x-w/2>=bounds.minX-0.00006,id+' left');
      assert.ok(x+w/2<=bounds.maxX+0.00006,id+' right');
      assert.ok(y-h/2>=bounds.minY-0.00006,id+' below frame');
      assert.ok(y+h/2<=bounds.maxY+0.00006,id+' above frame');
    }
    assert.deepEqual(compositionForArtwork(id,31,0),baseline,
      'pre-H5c work stays identical');
    assert.deepEqual(compositionForArtwork(id,31,1),
      compositionForArtwork(id,31,1),'same seed stable');
    assert.notDeepEqual(compositionForArtwork(id,31,1),
      compositionForArtwork(id,32,1),'new works differ '+id);
  }
  assert.deepEqual(compositionForArtwork('painting.bad',11,1),[]);
});
test('H5c: successive paintings preserve author, seed, variant and H5b storage on v1 reload',()=>{
  const {root,id}=studio();
  root.skills.xpById.painting=HOBBY_SKILLS.skills.painting.xpThresholds[9];
  assert.equal(chooseResidentAction(root,'paint',false,'alex',id,
    PAINT_ACTIVITY_ID,'painting.aurora'),true);
  root.position={...furnitureActionApproach(root.world,'paint',id)};
  arrive(root);
  const sessionId=root.activitySession.sessionId;
  tickHousehold(root,45);
  assert.equal(root.createdWorks.length,1);
  const work=root.createdWorks[0];
  assert.equal(work.renderVersion,1);
  assert.equal(work.contentId,'painting.aurora');
  assert.equal(work.seed,paintingSeedFromSession(sessionId));
  assert.equal(work.ownerId,'alex');
  assert.equal(work.location,'studio');
  assert.equal(root.otherSim.createdWorks.length,0);
  const stored=loadHousehold(clone(root));
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.deepEqual(stored.createdWorks,root.createdWorks);
  assert.deepEqual(compositionForArtwork(work.contentId,work.seed,1),
    compositionForArtwork(stored.createdWorks[0].contentId,stored.createdWorks[0].seed,
      stored.createdWorks[0].renderVersion));
});
test('H5c: old works preserve exact legacy geometry and reject invalid variant metadata',()=>{
  const old={id:'work:painting:alex:1:480000',ownerId:'alex',
    easelInstanceId:'shop-easel-1',contentId:'painting.hills',seed:175,quality:47,
    createdAt:485,kind:'artwork',location:'inventory'};
  assert.deepEqual(restoreCreatedWorks([old],'alex'),[old]);
  assert.deepEqual(compositionForArtwork(old.contentId,old.seed,old.renderVersion),
    PAINT_COMPOSITION_SHAPES[old.contentId]);
  const invalid={...old,renderVersion:'malicious'};
  assert.deepEqual(restoreCreatedWorks([invalid],'alex'),[old]);
  const newer={...old,contentId:'painting.stilllife',renderVersion:1};
  assert.deepEqual(restoreCreatedWorks([newer],'alex'),[newer]);
  assert.equal(restoreCreatedWorks([{...newer,contentId:'painting.invalid'}],'alex').length,0);
});
test('H5c: loading an active high-level painting with invalidated XP fails closed',()=>{
  const {root,id}=studio();
  root.skills.xpById.painting=HOBBY_SKILLS.skills.painting.xpThresholds[4];
  assert.equal(chooseResidentAction(root,'paint',false,'alex',id,
    PAINT_ACTIVITY_ID,'painting.harbor'),true);
  root.skills.xpById.painting=0;
  const loaded=loadHousehold(clone(root));
  assert.equal(loaded.action,null);
  assert.equal(loaded.activitySession,null);
  assert.equal(loaded.createdWorks.length,0);
  assert.equal(loaded.world.furniture.instances.some(item=>item.instanceId===id),true);
});
test('H5c: real Safari UI uses catalog and safe deterministic 3D renderer',()=>{
  const game=file('../src/game.js'),html=file('../index.html'),
    source=file('../src/painting.js'),workflow=file('../.github/workflows/pages.yml');
  assert.match(game,/for\(const contentId of PAINT_CONTENT_IDS\)/);
  assert.match(game,/option.disabled=!allowed/);
  assert.match(game,/canPaintContent\(selectedActor\(\).skills,HOBBY_SKILLS/);
  assert.match(game,/paintingSeedFromSession\(painter.activitySession.sessionId\)/);
  assert.match(game,/createPaintSurface\(pc,app.graphicsDevice,surface\)\(work.contentId,work.seed,6\)/);
  assert.match(source,/renderVersion===1/);
  assert.match(html,/1\.2u\.17 · F4G\.2 \/ H5c/);
  assert.match(html,/painting.js\?v=1\.2u\.16-h5c/);
  assert.match(workflow,/cp src\/painting.js site\/src\//);
});
