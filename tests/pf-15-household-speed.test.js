import test from 'node:test';
import assert from 'node:assert/strict';
import {householdIdleEpisode,createHouseholdSpeedController} from '../src/sleep-acceleration.js';
const bed=()=>({id:'bed',phase:'using'});
function fixture(n=2){
  const root={version:1,speed:1,paused:false,action:null,careerSystem:{byResident:{}},
    population:{linksByResident:{alex:{dwellingId:'home'}},residentsById:{}}};
  const actors=[root],ids=['alex'];
  if(n>=2){root.otherSim={version:1,action:null};actors.push(root.otherSim);ids.push('mira');}
  for(let i=3;i<=n;i++){
    const id='resident_'+i,actor={version:1,action:null};
    root.population.residentsById[id]={id,actor};
    root.population.linksByResident[id]={dwellingId:'home'};
    actors.push(actor);ids.push(id);
  }
  return {root,actors,ids,controller:createHouseholdSpeedController()};
}
for(const n of [1,2,3,4]){
  test('PF-15 '+n+' residents sleep, wake, next episode',()=>{
    const {root,actors,controller:c}=fixture(n);
    assert.equal(c.read(root),1);
    actors.forEach(a=>a.action=bed());
    assert.equal(householdIdleEpisode(root),'sleep');assert.equal(c.read(root),3);
    assert.equal(root.speed,1);
    actors.at(-1).action=null;assert.equal(c.read(root),1);
    actors.at(-1).action=bed();assert.equal(c.read(root),3);
  });
  test('PF-15 '+n+' residents work, returning ends episode',()=>{
    const {root,ids,controller:c}=fixture(n);
    ids.forEach(id=>root.careerSystem.byResident[id]={currentShift:{phase:'working'}});
    assert.equal(c.read(root),3);
    for(const phase of ['returning','waiting','departing']){
      root.careerSystem.byResident[ids.at(-1)].currentShift.phase=phase;
      assert.equal(c.read(root),1);
    }
  });
}
test('walking to bed, mixed state and remote extra cannot trigger false acceleration',()=>{
  const {root,actors,controller:c}=fixture(3);
  actors[0].action=bed();actors[1].action=bed();actors[2].action={id:'bed',phase:'walking'};
  assert.equal(c.read(root),1);
  root.careerSystem.byResident.resident_3={currentShift:{phase:'working'}};
  assert.equal(c.read(root),1);
  root.population.linksByResident.resident_3.dwellingId='elsewhere';
  assert.equal(c.read(root),3);
});
test('manual toggle overrides this episode only; new episode restores auto',()=>{
  const {root,actors,controller:c}=fixture();
  actors.forEach(a=>a.action=bed());assert.equal(c.read(root),3);
  assert.equal(c.toggle(root),1);assert.equal(c.read(root),1);
  actors[0].action=null;assert.equal(c.read(root),1);
  actors[0].action=bed();assert.equal(c.read(root),3);
  assert.equal(root.speed,1);
  const restored=JSON.parse(JSON.stringify(root));
  assert.equal(createHouseholdSpeedController().read(restored),3);
});
test('pause, modal and unresolved work choice suspend automatic boost',()=>{
  const {root,ids,controller:c}=fixture();
  ids.forEach(id=>root.careerSystem.byResident[id]={currentShift:{phase:'working'}});
  assert.equal(c.read(root),3);root.paused=true;assert.equal(c.read(root),1);
  root.paused=false;assert.equal(c.read(root,{blocked:true}),1);
  root.careerSystem.byResident.alex.currentShift.incident={choiceId:null};
  assert.equal(c.read(root),1);
  root.careerSystem.byResident.alex.currentShift.incident.choiceId='done';
  assert.equal(c.read(root),3);
});
