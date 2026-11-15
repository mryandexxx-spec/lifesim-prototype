import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIONS} from '../src/simulation.js';
import {toiletSequence,createToiletTransition,advanceToiletTransition,
  toiletPrivacyInvariant} from '../src/toilet-interaction.js';
import {meshPlacement,canShowMeshy} from '../src/meshy-visual-policy.js';
import {miraMeshPlacement,canShowMiraMeshy} from '../src/meshy-mira-policy.js';
import {MESHY_SOFA_CLIP,MESHY_SOFA_SECONDS} from '../src/meshy-sofa-pose.js';
import {MIRA_SOFA_CLIP,MIRA_SOFA_DURATION} from '../src/meshy-mira-sofa.js';
import {hasToiletSitClip,meshyToiletPose} from '../src/meshy-toilet-pose.js';
const frame=p=>toiletSequence(p*ACTIONS.toilet.duration,ACTIONS.toilet.duration);
const femaleScale=miraMeshPlacement({min:{x:-.3,y:0,z:-.15},
  max:{x:.3,y:1.7,z:.15}}).scale;
test('verified resident clip and duration gate blocks incompatible skins and lets other actions work',()=>{
  assert.equal(hasToiletSitClip([{name:MESHY_SOFA_CLIP,duration:MESHY_SOFA_SECONDS}],'alex'),true);
  assert.equal(hasToiletSitClip([{name:MIRA_SOFA_CLIP,duration:MIRA_SOFA_DURATION}],'mira'),true);
  assert.equal(hasToiletSitClip([{name:MESHY_SOFA_CLIP,duration:1}],'alex'),false);
  assert.equal(hasToiletSitClip([],'mira'),false);
  assert.equal(hasToiletSitClip(null,'alex'),false);
  const base={preferred:true,ready:true};
  assert.equal(canShowMeshy({...base,actionId:'toilet'}),false);
  assert.equal(canShowMeshy({...base,actionId:'toilet',toiletReady:true}),true);
  assert.equal(canShowMeshy({...base,toiletBusy:true}),false);
  assert.equal(canShowMeshy({...base,toiletBusy:true,toiletReady:true}),true);
  assert.equal(canShowMiraMeshy({...base,actionId:'toilet'}),false);
  assert.equal(canShowMiraMeshy({...base,actionId:'toilet',toiletReady:true}),true);
  assert.equal(canShowMiraMeshy({...base,toiletBusy:true,toiletReady:true}),true);
  assert.equal(canShowMiraMeshy({...base,toiletBusy:true}),false);
  assert.equal(canShowMeshy({...base,actionId:'fridge'}),false);
});
test('both imported walkers scrub route distance; authored sit time freezes on pause',()=>{
  const walking=frame(.18),sitting=frame(.50),rising=frame(.84);
  assert.ok(toiletPrivacyInvariant(walking)&&toiletPrivacyInvariant(sitting));
  assert.ok(sitting.seated>.99);
  for(const [resident,scale,walk,rest,clip,duration] of [
    ['alex',meshPlacement().scale,'Walking','Idle_3',MESHY_SOFA_CLIP,MESHY_SOFA_SECONDS],
    ['mira',femaleScale,'Walking_Woman','Idle_7',MIRA_SOFA_CLIP,MIRA_SOFA_DURATION]
  ]){
    const w=meshyToiletPose(walking,{resident,scale,walkDuration:1.9});
    assert.equal(w.clip,walk);
    assert.ok(w.time>=0&&w.time<1.9);
    assert.deepEqual(w.offset,{x:0,y:0,z:0});
    const a=meshyToiletPose(frame(.45),{resident,scale,walkDuration:1.9});
    const b=meshyToiletPose(sitting,{resident,scale,walkDuration:1.9});
    const c=meshyToiletPose(rising,{resident,scale,walkDuration:1.9});
    assert.equal(b.clip,clip);
    assert.ok(Math.abs(b.time-(resident==='alex'?0:duration))<.001);
    assert.ok(Math.abs(b.offset.x)<.6&&Math.abs(b.offset.z)<.7);
    assert.ok(Math.abs(b.offset.z)>0.25,'source pelvis drift must be removed');
    assert.equal(b.offset.y,0,'never modify authoritative seat height');
    assert.ok(Number.isFinite(a.time)&&Number.isFinite(c.time));
    const idle=meshyToiletPose(frame(0),{resident,scale,walkDuration:1.9});
    assert.equal(idle.clip,rest);
    assert.deepEqual(idle.offset,{x:0,y:0,z:0});
  }
});
test('residents stay skinned through cancelled/reloaded exit without gameplay changes',()=>{
  const using=advanceToiletTransition(createToiletTransition(),true,
    ACTIONS.toilet.duration*.54,ACTIONS.toilet.duration,.04);
  const out=advanceToiletTransition(using,false,0,ACTIONS.toilet.duration,.04);
  assert.ok(out.active&&out.frame.privacy);
  for(const resident of ['alex','mira']){
    const scale=resident==='alex'?meshPlacement().scale:femaleScale;
    const pose=meshyToiletPose(out.frame,{resident,scale,walkDuration:1.9});
    assert.ok(pose&&pose.sitting);
    assert.equal(toiletPrivacyInvariant(out.frame),true);
    assert.equal(meshyToiletPose({...out.frame,privacy:false},{resident,scale,walkDuration:1.9}),null);
    assert.equal(meshyToiletPose({...out.frame,gaitMeters:NaN},{resident,scale,walkDuration:1.9}),null);
  }
  const latest=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.match(latest,/toiletBusy:toiletStates\.alex\.active/);
  assert.match(latest,/toiletFrame:alexToilet/);
  assert.match(latest,/toiletBusy:toiletStates\.mira\.active/);
  assert.match(latest,/toiletFrame:miraToilet/);
  assert.match(latest,/applyShowerAppearance\(alexRig,Boolean\(alexShower\?\.privacy\|\|alexToilet\?\.privacy\)/);
  assert.match(latest,/applyShowerAppearance\(miraRig,Boolean\(miraShower\?\.privacy\|\|miraToilet\?\.privacy\)/);
});
