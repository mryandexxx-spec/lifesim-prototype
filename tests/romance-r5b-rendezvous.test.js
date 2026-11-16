import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newFurnitureWorld} from '../src/furniture-catalog.js';
import {findPath} from '../src/navigation.js';
import {newHousehold,loadHousehold,setHouseholdAutonomy} from '../src/household.js';
import {observePairViews,applySocialEvent,getPair} from '../src/social-graph.js';
import {startBranchSocial,arriveSocial,tickSocial} from '../src/relationships.js';
import {planRomanticEveningTable,validRomanticEveningStage,
  romanticEveningTableFrame} from '../src/romantic-evening-stage.js';
const world=()=>({furniture:newFurnitureWorld()}),a={x:-.25,z:-1.2},b={x:3.12,z:1.55};
const pair=s=>getPair(s.socialGraph,'alex','mira');
function couple(){
  const s=newHousehold();s.minutes=8000;s.otherSim.minutes=8000;setHouseholdAutonomy(s,false);
  for(const id of ['alex','mira']){
    Object.assign(s.relationship.views[id],{friendship:91,trust:92,tension:0});
    const r=id==='alex'?s:s.otherSim;
    Object.assign(r.needs,{hunger:92,energy:90,hygiene:90,fun:50,social:50,bladder:95});
    r.mind.mood.value=86;
  }
  assert.ok(observePairViews(s.socialGraph,'alex','mira',s.relationship.views));
  for(const [actorId,targetId,type,at] of [
    ['alex','mira','romance.flirt',900],['mira','alex','romance.flirt',2400],
    ['alex','mira','romance.flirt',3900],['alex','mira','romance.confess',4200],
    ['alex','mira','romance.date',4500],['alex','mira','romance.tender',5000],
    ['mira','alex','romance.tender',5400]
  ])assert.ok(applySocialEvent(s.socialGraph,{actorId,targetId,type,at}),type);
  return s;
}
test('R5b two independently reachable A* places on actual home table',()=>{
  const w=world(),p=planRomanticEveningTable(w,a,b,findPath);
  assert.ok(p,'original room must offer two walkable table places');
  assert.equal(p.stage.instanceId,'home-table-1');
  assert.equal(validRomanticEveningStage(w,p.stage),true);
  assert.ok(p.actorRoute.length>0&&p.partnerRoute.length>0);
  assert.deepEqual(p.actorRoute.at(-1),p.stage.actor);
  assert.deepEqual(p.partnerRoute.at(-1),p.stage.partner);
  assert.ok(Math.hypot(p.stage.actor.x-p.stage.partner.x,p.stage.actor.z-p.stage.partner.z)>=1.6);
});
test('R5b changed/rotated/stored table and blocked routes never fake rendezvous',()=>{
  const w=world(),t=w.furniture.instances.find(i=>i.prefabId==='table');
  t.x=-.20;t.z=.30;t.yaw=90;
  const p=planRomanticEveningTable(w,a,b,findPath);assert.ok(p);
  assert.equal(validRomanticEveningStage(w,p.stage),true);
  t.x+=.3;assert.equal(validRomanticEveningStage(w,p.stage),false);
  t.location='storage';assert.equal(planRomanticEveningTable(w,a,b,findPath),null);
  t.location='home';
  assert.equal(planRomanticEveningTable(w,a,b,()=>null),null);
});
test('R5b setting only during explicitly consented using phase at valid table',()=>{
  const w=world(),p=planRomanticEveningTable(w,a,b,findPath);
  assert.ok(p);
  const session={phase:'walking',elapsed:0,eveningStage:p.stage,
    branchAction:{id:'romance.evening',eveningConsent:true}};
  assert.equal(romanticEveningTableFrame(session,w).active,false);
  session.phase='using';session.branchAction.eveningConsent=false;
  assert.equal(romanticEveningTableFrame(session,w).active,false);
  session.branchAction.eveningConsent=true;session.elapsed=15;
  assert.deepEqual(romanticEveningTableFrame(session,w),
    {active:true,instanceId:'home-table-1',progress:.5});
  session.eveningStage.tableX+=.2;
  assert.equal(romanticEveningTableFrame(session,w).active,false);
});
test('R5b v1 saved stage restores; never grants early or duplicate reward',()=>{
  const s=couple(),p=planRomanticEveningTable(s.world,s.position,s.otherSim.position,findPath);
  assert.ok(p,'actual household should have a reachable original table');
  assert.ok(startBranchSocial(s,'alex',p.stage.actor,'romance.evening'));
  s.socialAction.eveningStage=p.stage;
  const old=loadHousehold(JSON.parse(JSON.stringify(s)));
  assert.equal(old.version,1);assert.deepEqual(old.socialAction?.eveningStage,p.stage);
  assert.equal(old.socialAction?.phase,'walking');assert.equal(old.needs.fun,50);
  assert.equal(pair(old).romance.bond.lastEveningAt,undefined);
  assert.ok(arriveSocial(old));assert.ok(tickSocial(old,30));
  assert.equal(old.needs.fun,58);
  assert.equal(pair(old).romance.bond.lastEveningAt,8000);
  assert.equal(s.needs.fun,50);
  const damaged=JSON.parse(JSON.stringify(s));
  damaged.socialAction.eveningStage.actor.x+=.5;
  assert.equal(loadHousehold(damaged).socialAction,null);
});
test('R5b gameplay routes, table lock, candle, new module and F3b TV kept',()=>{
  const g=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const p=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const pattern of [
    /planRomanticEveningTable\(game\.world/,/pairPlan\.partnerRoute/,
    /socialWalkingFor\(residentId\)/,/const otherHere=!otherGoal/,
    /busy\.add\(game\.socialAction\.eveningStage\.instanceId\)/,
    /romanticEveningVignette\(furnishMode\?null:game\.socialAction/,
    /dateSet\.enabled/,/R5b candle/,/tvScreenFrame\(/
  ])assert.match(g,pattern);
  assert.match(p,/node --check src\/romantic-evening-stage\.js/);
  assert.match(p,/cp src\/romantic-evening-stage\.js site\/src\//);
});
