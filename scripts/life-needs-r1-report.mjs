/** LIFE NEEDS-R1: deterministic read-only synthesis of existing Q3a full-run
 * production-household diagnostic output. Generates evidence, never new rates.
 *
 * Invoke: node scripts/q3a-diagnostics.mjs > life-needs-r1-artifacts/raw.log
 *         node scripts/life-needs-r1-report.mjs life-needs-r1-artifacts/raw.log
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {NEEDS} from '../src/simulation.js';
import {NEED_DECAY_PER_MINUTE} from '../src/need-balance.js';

const path=process.argv[2];
if(!path)throw new Error('Pass raw Q3a output path');
const lines=readFileSync(path,'utf8').split(/\r?\n/);
const read=(prefix)=>lines.filter(x=>x.startsWith(prefix))
  .map(x=>JSON.parse(x.slice(prefix.length)));
const bases=read('Q3A_BASELINE ');
const scenes=read('Q3A_SCENARIO ');
const shifts=read('Q3A_SHIFT ');
assert.equal(bases.length,1,'one exact baseline');
assert.ok(lines.some(x=>x.startsWith('Q3A_COMPLETE ')),'full diagnostic finished');
assert.ok(scenes.length>=12,'24-hour, 7-day, 30-day and recovery scenarios');
const byName=new Map(scenes.map(s=>[s.scenario,s]));
const required=['no-care-24','auto-24','auto-7','high-activity-24',
  'work-morning-7','work-day-7','work-evening-7','two-workers-7',
  'sleep-debt-7','save-reload-7'];
for(const name of required)assert.ok(byName.has(name),'Missing '+name);
assert.ok(shifts.length>=6,'workplace mode probes');

const round=x=>Math.round(x*100)/100;
const thresholdFrom90=Object.fromEntries(NEEDS.map(id=>{
  const rate=NEED_DECAY_PER_MINUTE[id];
  assert.ok(Number.isFinite(rate)&&rate>0,id+' rate');
  return [id, {decayPerGameMinute:rate,
    timeToGreenBoundaryGameMinutes:round(15/rate),
    timeToGreenBoundaryRealSecondsX1:round(15/rate/3),
    timeToGreenBoundaryRealSecondsX3:round(15/rate/9),
    rawUncaredLossPerGameDay:round(rate*1440)}];
}));
const selected=required.map(name=>{
  const s=byName.get(name);
  assert.ok([1,7].includes(s.days),'measured period '+name);
  return {name,days:s.days,residents:Object.fromEntries(['alex','mira'].map(id=>{
    const resident=s.residents?.[id];assert.ok(resident,id+' '+name);
    const needs=Object.fromEntries(NEEDS.map(need=>{
      const v=resident.metrics?.[need];
      assert.ok(v&&['end','min','max','avg','criticalHours'].every(k=>
        Number.isFinite(v[k])),name+' '+id+' '+need+' finite metric');
      assert.ok(v.min>=0&&v.max<=100,name+' '+id+' '+need+' bounded');
      return [need,{end:v.end,min:v.min,average:v.avg,
        criticalHours:v.criticalHours}];
    }));
    return [id,{hours:resident.hours,actions:resident.actions,
      workedShifts:resident.workShifts,needs}];
  }))};
});
const output={source:'scripts/q3a-diagnostics.mjs, actual household & career rules',
 status:'DIAGNOSTIC ONLY - rates unchanged and owner iPhone QA unverified',
 approvedTarget:'moderate regular upkeep, no uninterrupted crises',
 clock:{gameMinutesPerRealSecondAtX1:3,atX3:9,
  realMinutesPerGameDayX1:8,realMinutesPerGameDayX3:8/3},
 baselineCommit:'bfcb56b24a3ad9822d73713877496633783a34d2',
 thresholdFrom90,selected,shiftProbes:shifts,
 remainingScenarios:scenes.map(x=>x.scenario).filter(x=>!required.includes(x))};
mkdirSync('life-needs-r1-artifacts',{recursive:true});
writeFileSync('life-needs-r1-artifacts/report.json',JSON.stringify(output,null,2)+'\n');
const md=['# LifeSim NEEDS-R1 — измеренный Q3b baseline',
 '', 'Owner target: умеренная сложность, регулярный уход без постоянных кризисов.',
 '', 'Показатели ниже **из реальной симуляции**, но без 3D-маршрутов/диалогов.',
 '', '| Потребность | Потеря за игровые сутки без ухода | До выхода из зелёного 90→75 при 1×, реальных секунд | При 3× |',
 '|---|---:|---:|---:|'];
for(const id of NEEDS){
  const t=thresholdFrom90[id];
  md.push('| '+id+' | '+t.rawUncaredLossPerGameDay+
    ' | '+t.timeToGreenBoundaryRealSecondsX1+
    ' | '+t.timeToGreenBoundaryRealSecondsX3+' |');
}
for(const r of selected){
  md.push('', '## '+r.name+' ('+r.days+' игровых дней)');
  for(const id of ['alex','mira']){
    const row=r.residents[id];
    const critical=NEEDS.map(n=>n+': '+row.needs[n].criticalHours+'ч').join('; ');
    md.push('- '+id+': work '+row.workedShifts+
      ' shifts; critical hours (need < 24): '+critical);
  }
}
md.push('', '**Не выводить из этих результатов реальные Safari FPS/жесты.**',
 'Следующий шаг: выбрать небольшие изменения нужд только после аудита 24ч/7д,',
 'затем полноценная регрессия, x1/x3, сохранения и Pages на конкретном SHA.',
 '');
writeFileSync('life-needs-r1-artifacts/summary.md',md.join('\n'));
console.log('NEEDS_R1_PASS: '+scenes.length+' scenarios, '+shifts.length+
  ' work probes, '+required.length+' focused datasets, six needs, 2 residents');
for(const id of NEEDS){
 const t=thresholdFrom90[id];
 console.log('NEEDS_R1_GREEN '+id+' '+t.timeToGreenBoundaryRealSecondsX1+
   's @1x; '+t.timeToGreenBoundaryRealSecondsX3+'s @3x from 90');
}
