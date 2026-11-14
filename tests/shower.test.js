import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {SHOWER_LAYOUT,SHOWER_WASH_START,SHOWER_WASH_END,
  showerSequence,createShowerTransition,advanceShowerTransition,
  showerPrivacyInvariant} from '../src/shower-interaction.js';
import {ACTIONS,newGame,newGame as createGame,chooseAction,arrive,tick,loadGame,SAVE_KEY} from '../src/simulation.js';
import {findPath,isWalkable,isClearLine} from '../src/navigation.js';
import {newHousehold,loadHousehold,chooseResidentAction,furnitureAvailable,
  tickHousehold,setHouseholdAutonomy} from '../src/household.js';
import {createCharacterRig,applyShowerAppearance} from '../src/characters.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';

const at=p=>showerSequence(p*ACTIONS.shower.duration,ACTIONS.shower.duration);

test('shower approach lies at reachable open entrance outside shower obstacle',()=>{
  const to=SHOWER_LAYOUT.approach;
  assert.deepEqual(ACTIONS.shower.location,[to.x,to.z]);
  assert.ok(isWalkable(to.x,to.z));
  for(const from of [{x:-.25,z:.35},{x:-.8,z:2.95},
    {x:1.35,z:.52},{x:2.54,z:-1.74}]){
    const route=findPath(from,to);
    assert.ok(route?.length,'shower approach unreachable from '+JSON.stringify(from));
    let prev=from;
    for(const next of route){assert.equal(isClearLine(prev,next),true);prev=next;}
    assert.deepEqual(prev,to);
  }
  assert.ok(SHOWER_LAYOUT.interior.x<to.x-.9);
  assert.ok(SHOWER_LAYOUT.interior.x>-4.5&&SHOWER_LAYOUT.interior.x<-2.9);
  assert.ok(SHOWER_LAYOUT.privacyWidth>1&&SHOWER_LAYOUT.privacyHeight>2);
});
test('shower choreography enters through east side and returns a finite rooted pose',()=>{
  const start=at(0),entry=at(.23),wet=at(.50);
  assert.deepEqual(start.pose.x,SHOWER_LAYOUT.approach.x);
  assert.equal(start.privacy,false);
  assert.ok(entry.pose.x<start.pose.x-1.3);
  assert.ok(Math.abs(entry.pose.x-SHOWER_LAYOUT.interior.x)<1e-8);
  assert.equal(wet.pose.y,SHOWER_LAYOUT.interior.y);
  for(let i=0;i<=1000;i++){
    const p=at(i/1000);
    assert.ok(Object.values(p.pose).every(Number.isFinite));
    assert.ok(p.pose.x<=SHOWER_LAYOUT.approach.x+.01);
    assert.ok(p.pose.x>=SHOWER_LAYOUT.interior.x-.01);
  }
});
test('no clothes change or water happens before the fully opaque privacy shield',()=>{
  for(let i=0;i<=1000;i++){
    const p=at(i/1000);
    assert.equal(showerPrivacyInvariant(p),true,'privacy leak at '+i/1000);
    if(p.bathing||p.water)assert.equal(p.privacy,true);
    if(i/1000<.23)assert.equal(p.bathing,false);
    if(i/1000>=.84)assert.equal(p.bathing,false);
    if(i/1000>=.94)assert.equal(p.privacy,false);
  }
  assert.equal(at(.29).privacy,true);
  assert.equal(at(.29).bathing,false);
  assert.equal(at(.48).privacy,true);
  assert.equal(at(.48).bathing,true);
  assert.equal(at(.90).bathing,false);
  assert.equal(at(.91).privacy,true);
});
test('water starts after privacy and stops before street clothing is restored',()=>{
  assert.equal(at(.35).water,false);
  assert.equal(at(SHOWER_WASH_START+.02).water,true);
  assert.equal(at(SHOWER_WASH_END-.02).water,true);
  assert.equal(at(SHOWER_WASH_END+.02).water,false);
  assert.equal(at(.90).privacy,true);
  assert.equal(at(.95).privacy,false);
});
test('cancellation mid-wash turns off water and restores costume while still masked',()=>{
  let state=createShowerTransition();
  state=advanceShowerTransition(state,true,16,32,.016,12);
  assert.equal(state.frame.privacy,true);
  assert.equal(state.frame.bathing,true);
  assert.equal(state.frame.water,true);
  state=advanceShowerTransition(state,false,0,32,0,12);
  assert.equal(state.active,true);
  assert.equal(state.frame.privacy,true);
  assert.equal(state.frame.bathing,false,'clothes restore before screen opens');
  assert.equal(state.frame.water,false);
  assert.equal(state.frame.pose.x,SHOWER_LAYOUT.interior.x);
  for(let i=0;i<45;i++)state=advanceShowerTransition(state,false,0,32,.016);
  assert.equal(state.frame.privacy,false);
  assert.equal(state.frame.bathing,false);
  assert.equal(state.frame.water,false);
  assert.ok(state.frame.pose.x<SHOWER_LAYOUT.interior.x);
  for(let i=0;i<25;i++)state=advanceShowerTransition(state,false,0,32,.016);
  assert.equal(state.active,false);
  assert.equal(state.frame,null);
});
test('cancellation before privacy does not unnecessarily cover fully clothed resident',()=>{
  let state=advanceShowerTransition(null,true,32*.15,32,.016);
  assert.equal(state.frame.privacy,false);
  state=advanceShowerTransition(state,false,0,32,.016);
  assert.equal(state.frame.privacy,false);
  assert.equal(state.frame.bathing,false);
  assert.equal(state.frame.water,false);
});
test('pause freezes active stage and exit transitions independent of playback speed',()=>{
  let state=advanceShowerTransition(null,true,12.8,32,.016);
  const same=advanceShowerTransition(state,true,12.8,32,0);
  assert.deepEqual(same.frame,state.frame);
  state=advanceShowerTransition(same,false,0,32,0);
  const initial=state.frame;
  const paused=advanceShowerTransition(state,false,0,32,0);
  assert.deepEqual(paused.frame,initial);
  assert.deepEqual(at(.51),showerSequence(.51*32,32));
});
test('full-body rig hidden during private bathing, always returns fully clothed',()=>{
  const root=new pc.Entity('root'),made=[];
  const shape=(name,x,y,z,sx,sy,sz,material,parent=root)=>{
    const item=new pc.Entity(name);
    item.setLocalPosition(x,y,z);item.setLocalScale(sx,sy,sz);
    parent.addChild(item);made.push(item);return item;
  };
  const materials={black:'black',cream:'cream',yellow:'yellow',green:'green',mint:'mint'};
  const ctx={pc,root,ball:shape,box:shape,cylinder:shape,
    mat:s=>s,materials};
  for(const id of ['alex','mira']){
    const rig=createCharacterRig(ctx,id);
    assert.ok(rig.outfitMeshes.length>=10);
    assert.equal(rig.avatar.enabled,true);
    assert.equal(rig.showerWrap.enabled,false);
    applyShowerAppearance(rig,true,false);
    assert.equal(rig.avatar.enabled,false);
    assert.ok(rig.outfitMeshes.every(x=>x.enabled));
    applyShowerAppearance(rig,true,true);
    assert.equal(rig.avatar.enabled,false);
    assert.ok(rig.outfitMeshes.every(x=>!x.enabled));
    assert.equal(rig.showerWrap.enabled,true);
    // Bad external signal must not make the avatar naked.
    applyShowerAppearance(rig,false,true);
    assert.equal(rig.avatar.enabled,true);
    assert.equal(rig.showerWrap.enabled,false);
    assert.ok(rig.outfitMeshes.every(x=>x.enabled));
  }
});
test('water gesture and entry walking are distinctive and remain finite',()=>{
  let walk=createAnimationState(),wash=createAnimationState(),dry=createAnimationState();
  for(let i=0;i<55;i++){
    walk=stepAnimation(walk,{using:'shower',walking:true,showerStep:1,gait:Math.PI/2},.016);
    wash=stepAnimation(wash,{using:'shower',showerWater:true},.016);
    dry=stepAnimation(dry,{using:'shower',showerWater:false},.016);
  }
  assert.ok(Math.abs(walk.legs[0])>8);
  assert.ok(Math.abs(wash.arms[0]-dry.arms[0])>5);
  assert.ok([walk,wash,dry].every(s=>[...s.arms,...s.legs,...s.knees].every(Number.isFinite)));
});
test('hygiene increases only during actual water flow; near-full hygiene waits for finish',()=>{
  const s=newHousehold();s.needs.hygiene=12;
  assert.equal(chooseResidentAction(s,'shower',false,'alex'),true);arrive(s);
  const before=s.needs.hygiene;
  tickHousehold(s,32*SHOWER_WASH_START-1);
  assert.ok(s.needs.hygiene<before);
  tickHousehold(s,9);
  assert.ok(s.needs.hygiene>before);
  tickHousehold(s,40);
  assert.equal(s.action,null);
  assert.ok(s.needs.hygiene>before+20);
  const full=newHousehold();full.needs.hygiene=99;
  assert.equal(chooseResidentAction(full,'shower',false,'mira'),true);arrive(full.otherSim);
  tickHousehold(full,31);
  assert.equal(full.otherSim.action.id,'shower');
  tickHousehold(full,1);
  assert.equal(full.otherSim.action,null);
});
test('shower remains exclusive for two residents, manual and autonomous modes work',()=>{
  const s=newHousehold();
  assert.equal(chooseResidentAction(s,'shower',false,'mira'),true);
  assert.equal(furnitureAvailable(s,'shower','alex'),false);
  assert.equal(chooseResidentAction(s,'shower',false,'alex'),false);
  assert.equal(chooseResidentAction(s,'fridge',false,'alex'),true);
  arrive(s.otherSim);tickHousehold(s,32);
  assert.equal(s.otherSim.action,null);
  assert.equal(chooseResidentAction(s,'shower',false,'alex'),true);
  assert.equal(setHouseholdAutonomy(s,false),false);
  assert.equal(s.action.id,'shower','manual action survives auto-off');
});
test('save/reload mid-shower recovers privacy before any camera or character redraw',()=>{
  const s=newHousehold();s.autonomy.enabled=false;s.otherSim.autonomy.enabled=false;
  assert.equal(chooseResidentAction(s,'shower',false,'mira'),true);
  arrive(s.otherSim);tickHousehold(s,17);
  const serialized=JSON.stringify(s),r=loadHousehold(JSON.parse(serialized));
  assert.equal(r.version,1);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
  assert.equal(r.otherSim.action.id,'shower');
  const resumed=advanceShowerTransition(null,true,r.otherSim.action.elapsed,32,0);
  assert.equal(resumed.frame.privacy,true);
  assert.equal(resumed.frame.bathing,true);
  assert.equal(resumed.frame.water,true);
  assert.equal(r.autonomy.enabled,false);
  assert.equal(loadGame({version:1,minutes:480,needs:{hunger:70,energy:70,hygiene:70,fun:70},
    position:{x:-2.18,z:2.1},action:{id:'shower',phase:'using',elapsed:18}}).action.elapsed,18);
});
test('old save, other actions and new action requests never add new persisted visual fields',()=>{
  const old=newGame(),text=JSON.stringify(old);
  assert.equal(loadGame(JSON.parse(text)).version,1);
  const t=newHousehold();
  assert.equal(chooseResidentAction(t,'shower',false,'alex'),true);
  const before=JSON.stringify(t);
  const visual=advanceShowerTransition(null,true,13,32,.016);
  assert.ok(visual.frame.privacy);
  assert.equal(JSON.stringify(t),before,'transient animations cannot mutate saved household');
  assert.equal(chooseResidentAction(t,'sofa',false,'alex'),true);
  assert.equal(t.action.id,'sofa');
  assert.equal(ACTIONS.bed.duration,60);
  assert.equal(ACTIONS.fridge.duration,26);
});
