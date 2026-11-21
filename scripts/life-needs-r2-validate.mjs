/** NEEDS-R2 production simulation acceptance gate.
 * Run only on complete Q3a diagnostic output, not mocked numbers.
 * Social conversations are unavailable in the headless browser surrogate:
 * therefore social starvation is reported, NOT silently treated as a fail.
 */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {NEEDS} from '../src/simulation.js';
import {NEED_DECAY_PER_MINUTE,minutesUntilNeedThreshold,
  NEED_MINIMUM_COMFORT_MINUTES} from '../src/need-balance.js';

const lines=readFileSync(process.argv[2]||'','utf8').split(/\r?\n/);
const payload=prefix=>lines.filter(line=>line.startsWith(prefix))
  .map(line=>JSON.parse(line.slice(prefix.length)));
assert.ok(lines.some(line=>line.startsWith('Q3A_COMPLETE ')),
  'production 16-scenario diagnostic must finish');
const samples=payload('Q3A_SCENARIO ');
const jobs=payload('Q3A_SHIFT ');
const base=payload('Q3A_BASELINE ');
assert.equal(base.length,1);
assert.equal(samples.length,16);
assert.equal(jobs.length,6);
assert.deepEqual(base[0].decayPerMinute,NEED_DECAY_PER_MINUTE);
const pick=Object.fromEntries(samples.map(s=>[s.scenario,s]));
for(const name of ['no-care-24','no-care-7','auto-24','auto-7',
 'high-activity-24','work-morning-7','work-day-7','work-evening-7',
 'two-workers-7','sleep-debt-7','save-reload-7'])
 assert.ok(pick[name],name+' scenario exists');
const physical=NEEDS.filter(x=>x!=='social');
const green=Object.fromEntries(NEEDS.map(x=>[x,{
 gameMinutes:Math.round(minutesUntilNeedThreshold(NEED_DECAY_PER_MINUTE[x])),
 realSecondsAtX1:Math.round(minutesUntilNeedThreshold(NEED_DECAY_PER_MINUTE[x])/3),
 realSecondsAtX3:Math.round(minutesUntilNeedThreshold(NEED_DECAY_PER_MINUTE[x])/9)
}]));
assert.equal(NEED_MINIMUM_COMFORT_MINUTES,450);
for(const n of NEEDS)assert.ok(green[n].gameMinutes>=450);
for(const id of ['alex','mira']){
 const uncared=pick['no-care-24'].residents[id].metrics;
 for(const n of physical){
  const expected=90-1440*NEED_DECAY_PER_MINUTE[n];
  assert.ok(Math.abs(uncared[n].end-expected)<.025,
   id+' '+n+' real production no-care outcome');
  assert.ok(uncared[n].end<75, id+' '+n+' still needs regular attention');
 }
 for(const mode of ['auto-7','work-morning-7','work-day-7',
    'work-evening-7','two-workers-7']){
  const metrics=pick[mode].residents[id].metrics;
  for(const n of physical){
   assert.ok(Number.isFinite(metrics[n].min)&&metrics[n].min>=0&&
     metrics[n].max<=100,id+' '+mode+' '+n+' bounded');
   assert.ok(metrics[n].criticalHours<=3,
     id+' '+mode+' '+n+' repetitive physical crisis: '+metrics[n].criticalHours+' hours');
  }
 }
 // Snapshot->load cannot secretly refill needs or undo legitimate actions.
 for(const n of NEEDS){
  const a=pick['auto-7'].residents[id].metrics[n];
  const b=pick['save-reload-7'].residents[id].metrics[n];
  assert.ok(Math.abs(a.end-b.end)<.05,id+' '+n+' save/reload end stable');
 }
}
for(const [s,id] of [['work-morning-7','alex'],['work-day-7','alex'],
 ['work-evening-7','mira'],['two-workers-7','alex'],['two-workers-7','mira']]){
 assert.ok(pick[s].residents[id].workShifts>=4,s+' '+id+' career still progresses');
}
for(const s of samples)for(const id of ['alex','mira']){
 for(const n of NEEDS){
  const metric=s.residents[id].metrics[n];
  assert.ok(metric.min>=0&&metric.max<=100&&
    Number.isFinite(metric.avg)&&Number.isFinite(metric.criticalHours),
    s.scenario+' '+id+' '+n+' finite/bounded');
 }
}
const result={status:'R2 PRODUCTION HEADLESS CHECK PASSED; Safari owner QA not performed',
 clock:'1x=3 game min/real sec, 3x=9 game min/real sec',
 socialLimitation:'synthetic harness does not simulate free social dialogue UI',
 decayRates:NEED_DECAY_PER_MINUTE,greenWindowFrom90:green,
 samples:samples.map(s=>({scenario:s.scenario,days:s.days,
  residents:Object.fromEntries(['alex','mira'].map(id=>[id,{
    workShifts:s.residents[id].workShifts,
    physicalCriticalHours:Object.fromEntries(physical.map(n=>[
      n,s.residents[id].metrics[n].criticalHours])),
    socialCriticalHours:s.residents[id].metrics.social.criticalHours,
    endingNeeds:Object.fromEntries(NEEDS.map(n=>[
      n,s.residents[id].metrics[n].end]))
  }]))})),
 workModes:jobs};
mkdirSync('life-needs-r2-artifacts',{recursive:true});
writeFileSync('life-needs-r2-artifacts/report.json',JSON.stringify(result,null,2)+'\n');
console.log('LIFE_NEEDS_R2_PASS: '+samples.length+' actual production scenarios, '+jobs.length+
 ' work probes, two residents, all needs, root-v1 save/reload and physical crisis bounds');
for(const n of NEEDS)console.log('LIFE_NEEDS_R2_GREEN '+n+
 ' '+green[n].realSecondsAtX1+' seconds @1x from 90; '+
 green[n].realSecondsAtX3+' seconds @3x');
