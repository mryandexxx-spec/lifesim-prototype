/** Q3a read-only audit harness. Run: node scripts/q3a-diagnostics.mjs
 * Uses the production household/career/action kernels. Movement and the
 * browser's social-intent UI are NOT simulated: a fixed six-minute travel
 * surrogate is used; social need therefore is a lower-bound stress test.
 * One tick = one in-game minute. No production parameters are changed.
 */
import {newHousehold,loadHousehold,tickHousehold,residentAutonomousChoice,chooseResidentAction} from '../src/household.js';
import {ACTIONS,NEEDS,arrive} from '../src/simulation.js';
import {hireCareer} from '../src/career-state.js';
import {arriveCareerPortal,finishCareerReturn,residentWorkPhase} from '../src/career-work.js';
import {NEED_DECAY_PER_MINUTE} from '../src/need-balance.js';
import {socialNeedDecayRate} from '../src/social-need.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const IDs=['alex','mira'],get=(r,id)=>id==='alex'?r:r.otherSim;
const round=n=>Math.round(n*100)/100;
const needStats=()=>Object.fromEntries(NEEDS.map(k=>[k,{min:Infinity,max:-Infinity,sum:0,critical:0}]));
function run(name,{days=1,autonomy=false,work=null,init=90,travel=6,
  lowEnergy=false,heavy=false,serialReload=false}={}){
  let root=newHousehold('2026-11-16');
  for(const id of IDs){
    const a=get(root,id);
    for(const n of NEEDS)a.needs[n]=init;
    a.autonomy.enabled=autonomy;
  }
  root.autonomy.enabled=autonomy;
  if(lowEnergy)root.needs.energy=15;
  if(work){
    for(const [id,careerId] of Object.entries(work))
      root.careerSystem=hireCareer(root.careerSystem,id,careerId,root.minutes);
  }
  const stats={alex:needStats(),mira:needStats()},actions={alex:{},mira:{}};
  const minutesBy={alex:{bed:0,work:0,food:0,bladder:0,hygiene:0,fun:0,free:0,travel:0},mira:{bed:0,work:0,food:0,bladder:0,hygiene:0,fun:0,free:0,travel:0}};
  const last={alex:null,mira:null},walk={alex:0,mira:0},wait={alex:0,mira:0},shiftWalk={alex:0,mira:0};
  const hourly=[],total=days*1440;
  for(let t=0;t<total;t++){
    for(const id of IDs){
      const actor=get(root,id),phase=residentWorkPhase(root,id),act=actor.action;
      if(phase==='departing'){
        if(++shiftWalk[id]>=travel){arriveCareerPortal(root,id,root.minutes);shiftWalk[id]=0;}
      }else if(phase==='returning'){
        if(++shiftWalk[id]>=travel){finishCareerReturn(root,id);shiftWalk[id]=0;}
      }else shiftWalk[id]=0;
      if(actor.action?.phase==='walking'){
        if(++walk[id]>=travel){arrive(actor);walk[id]=0;}
      }else walk[id]=0;
      // Renderer actually runs the 12-real-second autonomy wait at 1x:
      // 36 game minutes. This harness uses the same derived game-time delay.
      const available=!actor.action&&!['departing','working','returning'].includes(phase);
      if(autonomy&&available){
        wait[id]++;
        if(wait[id]>=36){
          const suggested=residentAutonomousChoice(root,id);
          const target=heavy&&root.minutes%1440>=12*60&&root.minutes%1440<=22*60
            ?(Math.floor(root.minutes/70)%2?'sofa':'fridge'):suggested;
          if(target&&chooseResidentAction(root,target,true,id)){
            actions[id][target]=(actions[id][target]||0)+1;
            wait[id]=0;
          }
        }
      }else wait[id]=0;
      if(actor.action!==last[id]&&actor.action&&!actor.action.automatic){
        const key=actor.action.id;actions[id][key]=(actions[id][key]||0)+1;
      }
      last[id]=actor.action;
      const kind=actor.action?.phase==='walking'?'travel':
        actor.action?.phase==='using'?(actor.action.id==='bed'?'bed':
          ['fridge','dining'].includes(actor.action.id)?'food':
          actor.action.id==='toilet'?'bladder':
          actor.action.id==='shower'?'hygiene':'fun'):
        ['departing','working','returning'].includes(phase)?'work':'free';
      minutesBy[id][kind]++;
    }
    tickHousehold(root,1);
    for(const id of IDs){
      const actor=get(root,id);
      for(const need of NEEDS){
        const s=stats[id][need],v=actor.needs[need];
        if(!Number.isFinite(v))throw new Error('Non-finite '+name+' '+id+' '+need);
        s.min=Math.min(s.min,v);s.max=Math.max(s.max,v);s.sum+=v;
        if(v<24)s.critical++;
      }
    }
    if(days===1&&(t+1)%60===0){
      hourly.push({hour:(8+Math.floor((t+1)/60))%24,
        alex:Object.fromEntries(NEEDS.map(n=>[n,round(root.needs[n])])),
        mira:Object.fromEntries(NEEDS.map(n=>[n,round(root.otherSim.needs[n])]))});
    }
    if(serialReload&&t===Math.floor(total/2))
      root=loadHousehold(clone(root),'2026-11-16');
  }
  const residents=Object.fromEntries(IDs.map(id=>[id,{
    metrics:Object.fromEntries(NEEDS.map(n=>[n,{
      start:lowEnergy&&n==='energy'&&id==='alex'?15:init,
      end:round(get(root,id).needs[n]),min:round(stats[id][n].min),max:round(stats[id][n].max),
      avg:round(stats[id][n].sum/total),criticalHours:round(stats[id][n].critical/60),
      actions:actions[id][({hunger:'fridge',energy:'bed',hygiene:'shower',
        fun:'sofa',bladder:'toilet',social:'social'})[n]]||0
    }])),
    actions:actions[id],hours:Object.fromEntries(Object.entries(minutesBy[id])
      .map(([k,v])=>[k,round(v/60)])),
    workShifts:get(root,id).careerSystem?.byResident?.[id]?.workedShifts||
      root.careerSystem?.byResident?.[id]?.workedShifts||0,
    phase:residentWorkPhase(root,id)
  }]));
  return {scenario:name,days,method:'production tickHousehold 1min, browser travel proxy 6min, no spontaneous social UI',
    residents,hourly:days===1?hourly:undefined};
}
function workShiftProbe(mode,careerId,initialEnergy=90){
  const r=newHousehold('2026-11-16');
  r.careerSystem=hireCareer(r.careerSystem,'alex',careerId,r.minutes);
  r.needs.energy=initialEnergy;
  const shift=r.careerSystem.byResident.alex;
  shift.workMode=mode;
  // Let the canonical scheduler start the next job (cross-midnight included).
  for(let m=0;m<8*1440;m++){
    tickHousehold(r,1);
    const phase=residentWorkPhase(r,'alex');
    if(phase==='departing')arriveCareerPortal(r,'alex',r.minutes);
    if(phase==='returning'){
      return {careerId,mode,initialEnergy,energyEnd:round(r.needs.energy),
        hungerEnd:round(r.needs.hunger),bladderEnd:round(r.needs.bladder),
        socialEnd:round(r.needs.social),
        report:r.careerSystem.byResident.alex.lastShift?.workReport,
        worked:r.careerSystem.byResident.alex.lastShift?.workedMinutes};
    }
  }
  throw new Error('Shift never finished '+careerId);
}
const scenarios=[
  ['no-care-24',{days:1}],
  ['no-care-7',{days:7}],
  ['no-care-30',{days:30}],
  ['auto-24',{days:1,autonomy:true}],
  ['auto-7',{days:7,autonomy:true}],
  ['auto-30',{days:30,autonomy:true}],
  ['home-24',{days:1,autonomy:true,init:70}],
  ['high-activity-24',{days:1,autonomy:true,heavy:true}],
  ['two-residents-compete-24',{days:1,autonomy:true,init:28}],
  ['low-energy-before-work-7',{days:7,autonomy:true,work:{alex:'editorial'},lowEnergy:true}],
  ['work-morning-7',{days:7,autonomy:true,work:{alex:'city-services'}}],
  ['work-day-7',{days:7,autonomy:true,work:{alex:'editorial'}}],
  ['work-evening-7',{days:7,autonomy:true,work:{mira:'civic-service'}}],
  ['two-workers-7',{days:7,autonomy:true,work:{alex:'editorial',mira:'business-center'}}],
  ['sleep-debt-7',{days:7,autonomy:true,init:32}],
  ['save-reload-7',{days:7,autonomy:true,serialReload:true}]
];
console.log('Q3A_BASELINE '+JSON.stringify({
  decayPerMinute:NEED_DECAY_PER_MINUTE,
  initialAlex:newHousehold().needs,initialMira:newHousehold().otherSim.needs,
  socialAlex:socialNeedDecayRate(newHousehold().personality),
  socialMira:socialNeedDecayRate(newHousehold().otherSim.personality),
  actions:Object.fromEntries(['bed','fridge','shower','sofa','toilet','dining']
    .map(id=>[id,{duration:ACTIONS[id].duration,gainPerMinute:ACTIONS[id].benefitPerMinute}]))
}));
for(const [name,opts] of scenarios){
  const r=run(name,opts);
  console.log('Q3A_SCENARIO '+JSON.stringify(r));
}
for(const [career,mode] of [['city-services','normal'],['editorial','normal'],
  ['civic-service','normal'],['editorial','effort'],
  ['editorial','network'],['editorial','conserve']]){
  console.log('Q3A_SHIFT '+JSON.stringify(workShiftProbe(mode,career)));
}
console.log('Q3A_COMPLETE '+scenarios.length+' scenarios; no production changes.');
