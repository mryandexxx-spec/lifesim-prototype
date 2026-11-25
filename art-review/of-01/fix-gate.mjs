import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const root='artifacts/of-01/',data=JSON.parse(readFileSync(root+'lab/manifest.json'));
const expected=Object.values(data).reduce((n,v)=>n+['old','new','donor'].filter(k=>v[k]).length*3,0);
const reports=['headless','headed'].map(mode=>({mode,rows:JSON.parse(readFileSync(root+'browser-'+mode+'.json'))}));
let passed=false;
for(const {mode,rows} of reports){let ok=true;for(const width of [320,390]){
 const s=rows.filter(x=>x.name==='webkit'&&x.width===width&&x.file&&!x.night&&!x.lot);
 const night=rows.filter(x=>x.name==='webkit'&&x.width===width&&x.night);
 const raw=rows.find(x=>x.name==='webkit'&&x.width===width&&x.raw)?.raw;
 const lots=rows.filter(x=>x.name==='webkit'&&x.width===width&&x.lot);
 const valid=s.length===expected&&s.every(x=>x.valid&&x.framebuffer?.valid)&&new Set(s.map(x=>x.sha256)).size===expected&&new Set(s.map(x=>x.framebufferSHA256)).size===expected;
 const rawOK=raw?.supported&&raw.error===0&&JSON.stringify(raw.samples)==='[[255,0,0,255],[0,255,0,255]]';
 const nightOK=night.length===2&&night.every(x=>x.valid&&x.framebuffer?.valid)&&night[0].sha256!==night[1].sha256;
 const lotOK=lots.length===2&&lots.every(x=>x.metrics.instances===25&&Number.isFinite(x.metrics.p95Ms));
 console.log(JSON.stringify({mode,width,valid,rawOK,nightOK,lotOK,lots:lots.map(x=>x.metrics)}));ok&&=valid&&rawOK&&nightOK&&lotOK;
 }passed||=ok;}
assert.ok(passed,'WebKit evidence gate OPEN: neither execution mode produced valid evidence for both viewports');
console.log('Diagnostic browser gate PASS; actual game placement and physical iPhone performance remain OPEN');
