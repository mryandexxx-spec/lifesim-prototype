import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
import {findPath} from '../src/navigation.js';
import {newHousehold,loadHousehold,chooseResidentAction,setHouseholdAutonomy} from '../src/household.js';
import {observePairViews,applySocialEvent,getPair} from '../src/social-graph.js';
import {startBranchSocial,arriveSocial,tickSocial} from '../src/relationships.js';
import {chooseTvSofa} from '../src/tv-seating.js';
import {createAnimationState,stepAnimation} from '../src/animations.js';
import {SOFA_LAYOUT} from '../src/pose-config.js';
import {planRomanticEveningSofa,validRomanticEveningSofa,
  romanticSofaApproach,romanticSofaSeat,romanticEveningSofaFrame,
  romanticSofaSlotOffset} from '../src/romantic-sofa-stage.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const home=()=>({furniture:newFurnitureWorld()});
const a={x:-.25,z:-1.2},b={x:3.12,z:1.55};
function couple(){
  const state=newHousehold();state.minutes=8000;state.otherSim.minutes=8000;
  setHouseholdAutonomy(state,false);
  for(const id of ['alex','mira']){
    Object.assign(state.relationship.views[id],{friendship:91,trust:92,tension:0});
    const resident=id==='alex'?state:state.otherSim;
    Object.assign(resident.needs,{hunger:92,energy:90,hygiene:90,fun:50,social:50,bladder:95});
    resident.mind.mood.value=86;
  }
  assert.ok(observePairViews(state.socialGraph,'alex','mira',state.relationship.views));
  for(const [actorId,targetId,type,at] of [
    ['alex','mira','romance.flirt',900],['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500],['alex','mira','romance.tender',5000],
    ['mira','alex','romance.tender',5400]
  ])assert.ok(applySocialEvent(state.socialGraph,{actorId,targetId,type,at}),type);
  return state;
}
test('R5c: two independent reachable physical cushions on a real sofa',()=>{
  const world=home(),plan=planRomanticEveningSofa(world,a,b,findPath);
  assert.ok(plan,'original sofa must have two independently walkable entries');
  const stage=plan.stage;
  assert.equal(stage.instanceId,'home-sofa-1');
  assert.notEqual(stage.actorSlot,stage.partnerSlot);
  assert.equal(validRomanticEveningSofa(world,stage),true);
  assert.ok(Array.isArray(plan.actorRoute)&&Array.isArray(plan.partnerRoute));
  const p=romanticSofaSeat(world,stage.instanceId,stage.actorSlot),
    q=romanticSofaSeat(world,stage.instanceId,stage.partnerSlot);
  assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>1.2);
  assert.ok(Math.hypot(p.x-q.x,p.z-q.z)<SOFA_LAYOUT.seatWidth);
  assert.notDeepEqual(stage.actor,stage.partner);
  assert.deepEqual(romanticSofaApproach(world,stage.instanceId,stage.actorSlot),stage.actor);
  assert.deepEqual(romanticSofaApproach(world,stage.instanceId,stage.partnerSlot),stage.partner);
  assert.equal(Math.abs(romanticSofaSlotOffset(stage.actorSlot)),.635);
});
test('R5c: rotation, purchase, storage and blocked paths are strictly validated',()=>{
  const world=home(),sofa=world.furniture.instances.find(i=>i.instanceId==='home-sofa-1');
  sofa.yaw=90;world.furniture.revision++;
  const plan=planRomanticEveningSofa(world,a,b,findPath);
  if(plan)assert.equal(validRomanticEveningSofa(world,plan.stage),true);
  sofa.yaw=0;world.furniture.revision++;
  const normal=planRomanticEveningSofa(world,a,b,findPath);
  assert.ok(normal);
  sofa.x+=.1;world.furniture.revision++;
  assert.equal(validRomanticEveningSofa(world,normal.stage),false);
  sofa.location='storage';world.furniture.revision++;
  assert.equal(planRomanticEveningSofa(world,a,b,findPath),null);
  sofa.location='home';sofa.x-=.1;world.furniture.revision++;
  assert.equal(planRomanticEveningSofa(world,a,b,()=>null),null);
  assert.equal(planRomanticEveningSofa(world,a,b,findPath,
    {blockedIds:['home-sofa-1']}),null);
  const purchased={...sofa,instanceId:'shop-sofa-55',x:0,z:2.7,yaw:180};
  world.furniture.instances.push(purchased);
  const cloned=planRomanticEveningSofa(world,a,b,findPath,
    {blockedIds:['home-sofa-1']});
  if(cloned)assert.equal(cloned.stage.instanceId,'shop-sofa-55');
});
test('R5c: refusal, waiting and missing consent never produce a seated frame',()=>{
  const world=home(),plan=planRomanticEveningSofa(world,a,b,findPath);
  assert.ok(plan);
  const social={phase:'walking',elapsed:0,eveningSofa:plan.stage,
    branchAction:{id:'romance.evening',eveningConsent:true}};
  assert.equal(romanticEveningSofaFrame(social,world).active,false);
  social.phase='using';social.branchAction.eveningConsent=false;
  assert.equal(romanticEveningSofaFrame(social,world).active,false);
  social.branchAction.eveningConsent=true;
  assert.equal(romanticEveningSofaFrame(social,world,{eligible:false}).active,false);
  const frame=romanticEveningSofaFrame(social,world);
  assert.equal(frame.active,true);
  assert.equal(frame.sofaId,'home-sofa-1');
  assert.notEqual(frame.actorSlot,frame.partnerSlot);
  social.eveningSofa.actorSlot=social.eveningSofa.partnerSlot;
  assert.equal(romanticEveningSofaFrame(social,world).active,false);
});
test('R5c: optional v1 saved session restores and rewards only after completion',()=>{
  const state=couple();
  const plan=planRomanticEveningSofa(state.world,state.position,state.otherSim.position,findPath);
  assert.ok(plan);
  assert.ok(startBranchSocial(state,'alex',plan.stage.actor,'romance.evening'));
  state.socialAction.eveningSofa=plan.stage;
  const loaded=loadHousehold(clone(state));
  assert.equal(loaded.version,1);
  assert.deepEqual(loaded.socialAction?.eveningSofa,plan.stage);
  assert.equal(loaded.socialAction?.phase,'walking');
  assert.equal(loaded.needs.fun,50);
  assert.equal(getPair(loaded.socialGraph,'alex','mira').romance.bond.lastEveningAt,undefined);
  assert.equal(arriveSocial(loaded),true);
  assert.equal(loaded.socialAction?.branchAction?.eveningConsent,true);
  assert.equal(tickSocial(loaded,30),true);
  assert.equal(loaded.needs.fun,58);
  assert.equal(getPair(loaded.socialGraph,'alex','mira').romance.bond.lastEveningAt,8000);
  assert.equal(state.needs.fun,50,'saving and loading cannot grant rewards');
  const corrupt=clone(state);corrupt.socialAction.eveningSofa.actorSlot=5;
  assert.equal(loadHousehold(corrupt).socialAction,null);
  const dual=clone(state);dual.socialAction.eveningStage={spoof:true};
  assert.equal(loadHousehold(dual).socialAction,null);
});
test('R5c does not turn an ordinary TV or rest into a shared couch seat',()=>{
  const root=newHousehold();
  assert.ok(chooseResidentAction(root,'tv',false,'alex','home-tv-1'));
  assert.equal(root.action.watchSeatInstanceId,'home-sofa-1');
  assert.equal(chooseTvSofa(root,'mira','home-tv-1'),null);
  assert.equal(planRomanticEveningSofa(root.world,a,b,findPath,
    {blockedIds:[root.action.watchSeatInstanceId]}),null);
  const root2=newHousehold();
  assert.ok(chooseResidentAction(root2,'sofa',false,'mira','home-sofa-1'));
  assert.equal(chooseTvSofa(root2,'alex','home-tv-1'),null);
});
test('R5c gentle opposite seated glances preserve the original hip and knee bend',()=>{
  const base=createAnimationState();
  const regular=stepAnimation(base,{using:null,sofaWeight:1,social:'talk'},.06);
  const left=stepAnimation(base,{using:null,sofaWeight:1,social:'talk',
    romanticSeatTurn:-12,eveningWeight:1},.06);
  const right=stepAnimation(base,{using:null,sofaWeight:1,social:'talk',
    romanticSeatTurn:12,eveningWeight:1},.06);
  assert.ok(left.spineTwist<regular.spineTwist);
  assert.ok(right.spineTwist>regular.spineTwist);
  assert.deepEqual(left.legs,regular.legs);
  assert.deepEqual(left.knees,regular.knees);
});
test('R5c runtime uses two real seats, pending locks and still ships table and F3b',()=>{
  const src=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const rel=readFileSync(new URL('../src/relationships.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const pattern of [/planRomanticEveningSofa\(game\.world/,
    /pairPlan=sofaPlan\|\|tablePlan/,/romanticEveningSofaFrame\(/,
    /sofaVisualTargets\.alex=romanticSofa\.sofaId/,
    /sofaVisualTargets\.mira=romanticSofa\.sofaId/,
    /romanticSofaSlotOffset\(romanticSofaSlots\.alex\)/,
    /romanticSofaSlotOffset\(romanticSofaSlots\.mira\)/,
    /busy\.add\(game\.socialAction\.eveningSofa\.instanceId\)/,
    /socialWalkingFor\(residentId\)/,/tvScreenFrame\(/])
    assert.match(src,pattern);
  assert.match(rel,/validRomanticEveningSofa\(root\.world/);
  assert.match(pages,/node --check src\/romantic-sofa-stage\.js/);
  assert.match(pages,/cp src\/romantic-sofa-stage\.js site\/src\//);
});
