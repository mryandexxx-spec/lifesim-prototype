import test from 'node:test';
import assert from 'node:assert/strict';
import {newPerspective,restorePerspective,restoreSentiments,legacySentiments,
  getPerspective,applySocialPerspective,latestSentiments,SENTIMENT_LIMIT} from '../src/social-perspective.js';
import {newGame,SAVE_KEY} from '../src/simulation.js';
import {newHousehold,loadHousehold,tickHousehold,setHouseholdAutonomy} from '../src/household.js';
import {startSocial,arriveSocial,canReconcile,loadRelationship,
  SOCIAL_ACTIONS,relationshipLabel,autonomousSocialChoice} from '../src/relationships.js';
import {createProfile} from '../src/trait-catalog.js';
const point={x:-.2,z:1.85};
const snapshot=s=>JSON.parse(JSON.stringify(s));
const finished=(root,kind='talk',id='alex')=>{
  assert.equal(startSocial(root,kind,id,point),true);
  assert.equal(arriveSocial(root),true);
  tickHousehold(root,SOCIAL_ACTIONS[kind].duration+1);
};
test('fresh household exposes two separate initial perspectives and shared affinity',()=>{
  const s=newHousehold();
  assert.notEqual(s.relationship.views.alex,s.relationship.views.mira);
  assert.equal(s.relationship.affinity,50);
  assert.equal(s.relationship.views.alex.friendship,50);
  assert.equal(s.relationship.views.mira.trust,45);
  assert.equal(s.relationship.views.alex.tension,0);
  assert.deepEqual(s.relationship.views.alex.sentiments,[]);
  assert.equal(getPerspective(s,'alien'),null);
});
test('legacy affinity maps into both views without rewriting existing score',()=>{
  const old=newHousehold();old.relationship={affinity:79,nextSocialAt:910,lastKind:'talk'};
  old.minutes=900;old.otherSim.minutes=900;
  old.mind.memories.push({id:'talk',at:880,fulfilled:false});
  old.otherSim.mind.memories.push({id:'hurt',at:870,fulfilled:false});
  const restored=loadHousehold(snapshot(old));
  assert.equal(restored.relationship.affinity,79);
  assert.equal(restored.relationship.nextSocialAt,910);
  assert.equal(restored.relationship.views.alex.friendship,79);
  assert.equal(restored.relationship.views.mira.friendship,79);
  assert.equal(restored.relationship.views.alex.sentiments.at(-1).id,'talk');
  assert.equal(restored.relationship.views.mira.sentiments.at(-1).id,'hurt');
  assert.deepEqual(restored.mind.memories,old.mind.memories);
});
test('a completed talk changes both perspectives independently but legacy affinity remains +8',()=>{
  const s=newHousehold();
  finished(s);
  assert.equal(s.relationship.affinity,58);
  assert.ok(s.relationship.views.alex.friendship>50);
  assert.ok(s.relationship.views.mira.friendship>50);
  assert.notDeepEqual(s.relationship.views.alex,s.relationship.views.mira);
  assert.equal(s.relationship.views.alex.sentiments.length,1);
  assert.equal(s.relationship.views.alex.sentiments[0].id,'talk');
  assert.equal(s.relationship.views.mira.sentiments.length,1);
});
test('a quarrel records hurt and regret differently, without erasing old memories',()=>{
  const s=newHousehold();
  finished(s,'argue','alex');
  assert.equal(s.relationship.affinity,38);
  const a=getPerspective(s,'alex'),b=getPerspective(s,'mira');
  assert.equal(a.sentiments.at(-1).id,'regret');
  assert.equal(b.sentiments.at(-1).id,'hurt');
  assert.ok(b.trust<a.trust);
  assert.ok(b.tension>a.tension);
  assert.ok(b.friendship<a.friendship);
  assert.equal(s.mind.memories.at(-1).id,'regret');
  assert.equal(s.otherSim.mind.memories.at(-1).id,'hurt');
});
test('reconciliation restores directed trust and reduces tension while remaining one event',()=>{
  const s=newHousehold();
  finished(s,'argue','mira');
  const before=snapshot(s.relationship.views);
  assert.equal(canReconcile(s),true);
  finished(s,'talk','alex');
  assert.equal(s.relationship.affinity,50);
  for(const id of ['alex','mira']){
    assert.ok(s.relationship.views[id].trust>before[id].trust);
    assert.ok(s.relationship.views[id].tension<before[id].tension);
    assert.equal(s.relationship.views[id].sentiments.at(-1).id,'reconcile');
  }
  assert.equal(canReconcile(s),false);
  tickHousehold(s,100);
  assert.equal(s.relationship.views.alex.sentiments.filter(x=>x.id==='reconcile').length,1);
});
test('a saved in-progress conversation creates directional effects only when finished',()=>{
  const s=newHousehold();
  assert.equal(startSocial(s,'talk','mira',point),true);
  arriveSocial(s);
  tickHousehold(s,7);
  const t=loadHousehold(snapshot(s));
  assert.deepEqual(t.relationship.views,s.relationship.views);
  tickHousehold(t,12);
  assert.equal(t.relationship.affinity,58);
  assert.equal(t.relationship.views.alex.sentiments.length,1);
  tickHousehold(t,50);
  assert.equal(t.relationship.views.alex.sentiments.length,1);
});
test('paused, cancelled and walking socials never create impressions',()=>{
  const s=newHousehold();
  assert.equal(startSocial(s,'talk','alex',point),true);
  tickHousehold(s,200);
  assert.deepEqual(s.relationship.views.alex.sentiments,[]);
  arriveSocial(s);s.paused=true;const saved=snapshot(s);
  tickHousehold(s,200);
  assert.deepEqual(s,saved);
  s.paused=false;s.socialAction=null;
  tickHousehold(s,50);
  assert.deepEqual(s.relationship.views.alex.sentiments,[]);
});
test('manually requested talk and argue work at 0 and 100 affinity',()=>{
  for(const affinity of [0,100]){
    const s=newHousehold();
    s.relationship.affinity=affinity;
    assert.equal(startSocial(s,'talk','alex',point),true);
    arriveSocial(s);tickHousehold(s,19);
    assert.equal(s.relationship.affinity,Math.min(100,affinity+8));
    assert.equal(startSocial(s,'argue','mira',point),true);
  }
});
test('overwriting a valid persisted directed profile never occurs on load',()=>{
  const s=newHousehold();
  s.relationship.views.alex={friendship:97,trust:15,tension:88,sentiments:[{id:'hurt',at:480}]};
  s.relationship.views.mira={friendship:3,trust:92,tension:2,sentiments:[{id:'talk',at:480}]};
  const loaded=loadHousehold(snapshot(s));
  assert.deepEqual(loaded.relationship.views,s.relationship.views);
  assert.equal(loaded.relationship.affinity,50);
  assert.equal(SAVE_KEY,'lifesim.room01.v1');
});
test('hostile saved views sanitize numeric metrics and unknown sentiment text',()=>{
  const old=newHousehold();old.minutes=700;old.otherSim.minutes=700;
  old.relationship.views={
    alex:{friendship:Infinity,trust:-100000,tension:2000,
      sentiments:[{id:'<img src=x>',at:650},{id:'hurt',at:Infinity},
        {id:'hurt',at:600},{id:'hurt',at:600},{id:'reconcile',at:800}]},
    mira:'bad data'
  };
  const next=loadHousehold(snapshot(old));
  assert.equal(next.relationship.views.alex.friendship,50);
  assert.equal(next.relationship.views.alex.trust,0);
  assert.equal(next.relationship.views.alex.tension,100);
  assert.deepEqual(next.relationship.views.alex.sentiments,[{id:'hurt',at:600}]);
  assert.equal(next.relationship.views.mira.friendship,50);
  assert.equal(next.relationship.views.mira.trust,45);
  assert.equal(latestSentiments(next.relationship.views.alex)[0].label,'Помнит обиду');
});
test('sentiments are bounded, deterministic, and never convert unknown IDs to UI strings',()=>{
  const moments=Array.from({length:30},(_,i)=>({id:i%3===0?'talk':'hurt',at:600+i}));
  moments.push({id:'<script>',at:620},{id:'talk',at:600});
  const valid=restoreSentiments(moments,800);
  assert.equal(valid.length,SENTIMENT_LIMIT);
  assert.ok(valid.every(x=>!('label' in x)));
  assert.ok(latestSentiments({sentiments:valid},2).every(s=>!s.label.includes('<')));
});
test('event receipt is idempotent for one actor at same minute',()=>{
  const view=newPerspective(50);
  const resident=newGame();
  resident.minutes=900;
  const memory={id:'talk',at:900,fulfilled:false};
  const a=applySocialPerspective(view,memory,resident,900);
  const original=snapshot(view);
  assert.equal(a,true);
  assert.equal(applySocialPerspective(view,memory,resident,900),false);
  assert.deepEqual(view,original);
  assert.equal(applySocialPerspective(view,{id:'alien',at:900},resident,900),false);
});
test('two personalities can interpret the same talk differently without name branching',()=>{
  const s=newGame(createProfile(['temperament.cheerful','social.outgoing']));
  const t=newGame(createProfile(['temperament.melancholic','social.reserved']));
  s.minutes=700;t.minutes=700;
  const p=newPerspective(),q=newPerspective();
  const mem={id:'talk',at:700,fulfilled:false};
  applySocialPerspective(p,mem,s,700);
  applySocialPerspective(q,mem,t,700);
  assert.notDeepEqual(p,q);
  assert.equal(p.sentiments[0].id,q.sentiments[0].id);
});
test('new relationship view can influence autonomy when personal tension high',()=>{
  const s=newHousehold();
  s.minutes=600;s.otherSim.minutes=600;s.relationship.nextSocialAt=480;
  s.needs.fun=24;s.needs.hunger=80;s.needs.energy=85;s.needs.hygiene=90;
  s.mind.mood.value=38;
  s.relationship.views.alex.tension=90;
  assert.equal(autonomousSocialChoice(s,'alex'),'argue');
  s.relationship.views.alex.tension=0;
  assert.equal(autonomousSocialChoice(s,'alex'),'talk');
  setHouseholdAutonomy(s,false);
  assert.equal(autonomousSocialChoice(s,'alex'),null);
});
test('all relationship metrics stay within 0..100 even after repeated talk/argue',()=>{
  const s=newHousehold();
  for(let i=0;i<30;i++)finished(s,'talk');
  for(let i=0;i<30;i++)finished(s,'argue');
  for(const id of ['alex','mira']){
    for(const key of ['friendship','trust','tension']){
      const x=s.relationship.views[id][key];
      assert.ok(x>=0&&x<=100);
    }
    assert.ok(s.relationship.views[id].sentiments.length<=SENTIMENT_LIMIT);
  }
  assert.equal(s.relationship.affinity,0);
  assert.equal(relationshipLabel(0),'Напряжённо');
});

test('selected-perspective HUD is wired to DOM and bundled into GitHub Pages',async()=>{
  const {readFileSync}=await import('node:fs');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  for(const axis of ['friendship','trust','tension']){
    assert.ok(html.includes('id="mind-relation-'+axis+'"'));
    assert.ok(html.includes('id="mind-relation-'+axis+'-bar"'));
  }
  assert.ok(html.includes('id="mind-sentiments"'));
  assert.ok(html.includes('id="mind-relation-name"'));
  assert.ok(game.includes('getPerspective(game,game.selectedSim)'));
  assert.ok(game.includes("join('\\n')"),'UI separates two sentiments using an actual newline');
  assert.ok(workflow.includes('src/social-perspective.js src/social-graph.js src/conversation-engine.js src/gifts-leisure.js src/household.js'));
  assert.ok(workflow.includes('node --check src/social-perspective.js'));
});
