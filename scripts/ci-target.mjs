import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {appendFileSync,existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CORE=['tests/browser-startup-graph.test.js','tests/simulation.test.js','tests/household.test.js'];
const isCode=f=>/^(?:src\/|tests\/|scripts\/)/.test(f)||/^(?:index\.html|styles\.css|sw\.js|package(?:-lock)?\.json)$/.test(f)||f.startsWith('.github/workflows/');
const isUI=f=>/^(?:index\.html|styles\.css|sw\.js|assets\/)/.test(f)||
  // Changes to the live needs loop or SKU sleep quality require a real WebGL boot.
  /^src\/(?:simulation|need-balance|furniture-products)\.js$/.test(f)||
  /^src\/(?:game\.js|outdoor-character-motion|camera-|mobile-|viewport-|ui|ux|meshy|.*(?:visual|presentation|render|interaction|editor|view|panel|layout|picker|controls|ui)\.js)/.test(f)||
  /^tests\/.*browser.*\.mjs$/.test(f);
const normalize=f=>f.replace(/\\/g,'/').replace(/^\.\//,'');

export function planChanges(files,root=ROOT){
  const changed=[...new Set(files.map(normalize))].sort();
  const relevant=changed.some(f=>isCode(f)||f.startsWith('assets/'));
  if(!relevant)return {tests:[],browser:false,cas_inventory:false,cas_baseline:false,e5:false,integration_qa:false,fandom_tv:false,fandom_phone:false,fandom_r2a:false,fandom_r2b:false,fandom_r2c:false,changed};
  const allTests=readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.js')).map(f=>'tests/'+f);
  const selected=new Set(CORE);
  const changedSrc=changed.filter(f=>f.startsWith('src/')&&/\.(?:js|mjs)$/.test(f));
  for(const f of changed)if(allTests.includes(f))selected.add(f);
  const importsCache=new Map();
  function importsOf(file){
    if(importsCache.has(file))return importsCache.get(file);
    const output=[];
    const abs=path.join(root,file);
    if(existsSync(abs)){
      const source=readFileSync(abs,'utf8');
      const expression=/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.{1,2}\/[^'"]+)['"]/g;
      for(const match of source.matchAll(expression)){
        const item=match[1].split('?')[0];
        let dependency=path.posix.normalize(path.posix.join(path.posix.dirname(file),item));
        if(!path.posix.extname(dependency))dependency+='.js';
        if(!dependency.startsWith('../')&&existsSync(path.join(root,dependency)))output.push(dependency);
      }
    }
    importsCache.set(file,output);
    return output;
  }
  function closure(file,seen=new Set()){
    if(seen.has(file))return seen;
    seen.add(file);
    for(const dependency of importsOf(file))closure(dependency,seen);
    return seen;
  }
  for(const file of allTests){
    const deps=closure(file);
    if(changedSrc.some(source=>deps.has(source)))selected.add(file);
    for(const source of changedSrc){
      const stem=path.posix.basename(source).replace(/\.m?js$/,'').replace(/-(?:ui|visual|engine|runtime|state|core)$/,'');
      if(stem.length>=5&&file.toLowerCase().includes(stem.toLowerCase()))selected.add(file);
    }
  }
  const extra=[
    [/^src\/(?:camera-|mobile-gesture|world-interactions)/,['tests/camera-gestures.test.js','tests/ray-picking.test.js']],
    [/^src\/(?:kitchen|ready-food|dining|household)/,['tests/f4g-kitchen.test.js','tests/life-food-r1.test.js']],
    [/^src\/(?:finance-|household-bills)/,['tests/w4a-finance.test.js','tests/w4c-bills.test.js']],
    [/^src\/(?:phone-|career-phone-ui|household|social-graph|social-need)/,['tests/phone-platform-r1.test.js']],
    [/^src\/(?:action-queue|navigation|simulation)/,['tests/manual-priority-queue-stability.test.js','tests/navigation.test.js']],
    [/^src\/(?:pool-|gardening|outdoor-)/,['tests/lot-e2-overlap-recovery.test.js','tests/lot-c3c.test.js']],
    [/^(?:\.github\/workflows\/|scripts\/ci-|tests\/ci-)/,['tests/ci-target.test.js']],
    [/^\.github\/workflows\/pages\.yml$/,['tests/m4-release.test.js']]
  ];
  for(const [pattern,names] of extra)if(changed.some(f=>pattern.test(f)))
    for(const name of names)if(allTests.includes(name))selected.add(name);
  const tests=[...selected].filter(f=>allTests.includes(f)).sort();
  const micro_ux=changed.some(f=>
    /^(?:src\/(?:micro-ux|camera-controls)\.js|tests\/micro-ux-r1-browser-smoke\.mjs)$/.test(f));
  const load_truth=changed.some(f=>
    /^(?:src\/loading-progress\.js|tests\/load-truth-r1-browser-smoke\.mjs)$/.test(f));
  const fridge_ux=changed.some(f=>
    /^(?:src\/fridge-ui(?:-dom)?\.js|tests\/fridge-ux-r2-browser-smoke\.mjs)$/.test(f));
  const grill_r1=changed.some(f=>
    /^(?:src\/grill-(?:r1|catalog)\.js|tests\/grill-r1-browser-smoke\.mjs)$/.test(f));
  const phone_platform=changed.some(f=>
    /^(?:src\/(?:phone-app-registry|phone-calls|career-phone-ui)\.js|tests\/phone-platform-r1-browser-smoke\.mjs)$/.test(f));
  const fandom_tv=changed.some(f=>
    /^(?:src\/sports-tv\.js|tests\/fandom-r1-c-browser-smoke\.mjs)$/.test(f));
  const fandom_phone=changed.some(f=>
    /^(?:src\/sports-phone-model\.js|tests\/fandom-r1-d-browser-smoke\.mjs)$/.test(f));
  const fandom_r2a=changed.some(f=>
    /^(?:src\/(?:sports-catalog|sports-calendar|sports-tv|sports-phone-model|career-phone-ui)\.js|tests\/fandom-r2-a-browser-smoke\.mjs)$/.test(f));
  const fandom_r2b=changed.some(f=>
    /^(?:src\/(?:sports-identity|furniture-catalog|furniture-products|furniture-procedural-library|furniture-editor|career-phone-ui|game)\.js|tests\/fandom-r2-b-browser-smoke\.mjs)$/.test(f));
  const fandom_r2c=changed.some(f=>
    /^(?:src\/(?:sports-shared-watch|action-queue|household|sports-phone-model|career-phone-ui|game)\.js|tests\/fandom-r2-c-browser-smoke\.mjs)$/.test(f));
  const cas_hud=changed.some(f=>/^(?:src\/(?:resident-hud|career-phone-ui|game)\.js|tests\/cas-01-7-browser-smoke\.mjs)$/.test(f));
  const cas_inventory=changed.some(f=>['scripts/cas-00-dependency-inventory.mjs','tests/cas-00-dependency-inventory.test.js'].includes(f));
  const cas_baseline=changed.includes('tests/cas-00-browser-baseline.mjs');
  const career_shifts=changed.some(f=>
    /^(?:src\/career-rank-schedules\.js|tests\/career-shifts-r1-browser-smoke\.mjs)$/.test(f));
  return {tests,cas_inventory,cas_baseline,browser:changed.some(isUI)||career_shifts||phone_platform||fandom_tv||fandom_phone||fandom_r2a||fandom_r2b||fandom_r2c,micro_ux,load_truth,fridge_ux,grill_r1,career_shifts,phone_platform,
    fandom_tv,fandom_phone,fandom_r2a,fandom_r2b,fandom_r2c,
    e5:changed.includes('tests/lot-e5-browser-smoke.mjs'),
    integration_qa:changed.includes('tests/life-integration-qa-browser.mjs'),cas_hud,changed};
}

function main(){
  const base=process.env.CI_BASE_SHA||execFileSync('git',['rev-parse','HEAD^'],{encoding:'utf8'}).trim();
  const buffer=execFileSync('git',['diff','--name-only','-z',base+'...HEAD'],{encoding:'buffer'});
  const changed=buffer.toString('utf8').split('\0').filter(Boolean);
  const plan=planChanges(changed);
  console.log('CI changed files:',JSON.stringify(plan.changed));
  for(const file of plan.changed.filter(f=>/\.(?:js|mjs)$/.test(f)&&/^(?:src|tests|scripts)\//.test(f))){
    if(!existsSync(path.join(ROOT,file)))continue;
    console.log('Syntax:',file);
    const checked=spawnSync(process.execPath,['--check',file],{cwd:ROOT,stdio:'inherit'});
    assert.equal(checked.status,0,'JavaScript syntax failed: '+file);
  }
  for(const file of ['src/game.js','sw.js']){
    const checked=spawnSync(process.execPath,['--check',file],{cwd:ROOT,stdio:'inherit'});
    assert.equal(checked.status,0,'Critical startup syntax failed: '+file);
  }
  console.log('Selected Node regression files:',plan.tests.length,plan.tests.join(' '));
  if(plan.tests.length){
    const run=spawnSync(process.execPath,['--test',...plan.tests],{cwd:ROOT,stdio:'inherit'});
    assert.equal(run.status,0,'Targeted Node tests failed');
  }
  console.log('Browser smoke:',plan.browser?'required':'not needed');
  console.log('LOAD-TRUTH-R1 two-viewport stages:',plan.load_truth?'required':'not needed');
  console.log('FRIDGE-UX-R2 two-viewport touch:',plan.fridge_ux?'required':'not needed');
  console.log('GRILL-R1 two-viewport physical cooking/market:',plan.grill_r1?'required':'not needed');
  console.log('CAREER-SHIFTS-R1 two-viewport phone and calendar:',plan.career_shifts?'required':'not needed');
  console.log('PHONE-PLATFORM-R1 dual-viewport WebGL:',plan.phone_platform?'required':'not needed');
  console.log('FANDOM-R1-C live-TV/calendar real WebGL:',plan.fandom_tv?'required':'not needed');
  console.log('FANDOM-R1-D fifth-app mobile WebGL:',plan.fandom_phone?'required':'not needed');
  console.log('FANDOM-R2-A live phone and multi-league smoke:',plan.fandom_r2a?'required':'not needed');
  console.log('FANDOM-R2-B live club decor and crests:',plan.fandom_r2b?'required':'not needed');
  console.log('FANDOM-R2-C verified shared TV and mobile memories:',plan.fandom_r2c?'required':'not needed');
  console.log('CAS-00 full-source static inventory:',plan.cas_inventory?'required':'not needed');
  console.log('CAS-00 four-viewport performance baseline:',plan.cas_baseline?'required':'not needed');
  console.log('LOT-E5 four-viewport deep check:',plan.e5?'required':'not needed');
  console.log('P4 Life Systems four-viewport integration:',plan.integration_qa?'required':'not needed');
  const fixtureMotion=changed.some(f=>/^(?:src\/(?:outdoor-character-motion|meshy-furniture-visual|pool-visual)\.js|tests\/fixture-motion-browser-smoke\.mjs|assets\/furniture\/meshy-room-v2\/(?:cream_fridge|glass_shower|bathroom_toilet)\.glb)$/.test(f));
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,
    'parcel_editor='+changed.some(f=>f.includes('parcel-editor')||f.includes('parcel-journal'))+'\n'+'fixture_motion='+fixtureMotion+'\n'+'browser='+(plan.browser?'true':'false')+'\n'+
    'cas_inventory='+(plan.cas_inventory?'true':'false')+'\n'+'cas_baseline='+(plan.cas_baseline?'true':'false')+'\n'+'e5='+(plan.e5?'true':'false')+'\n'+'integration_qa='+(plan.integration_qa?'true':'false')+'\n'+
    'micro_ux='+(plan.micro_ux?'true':'false')+'\n'+
    'load_truth='+(plan.load_truth?'true':'false')+'\n'+
    'fridge_ux='+(plan.fridge_ux?'true':'false')+'\n'+
    'grill_r1='+(plan.grill_r1?'true':'false')+'\n'+
    'career_shifts='+(plan.career_shifts?'true':'false')+'\n'+
    'phone_platform='+(plan.phone_platform?'true':'false')+'\n'+
    'fandom_tv='+(plan.fandom_tv?'true':'false')+'\n'+
    'fandom_phone='+(plan.fandom_phone?'true':'false')+'\n'+
    'fandom_r2a='+(plan.fandom_r2a?'true':'false')+'\n'+
    'fandom_r2b='+(plan.fandom_r2b?'true':'false')+'\n'+
    'fandom_r2c='+(plan.fandom_r2c?'true':'false')+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
