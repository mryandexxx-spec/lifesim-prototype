import test from 'node:test';
import assert from 'node:assert/strict';
import {assertEvidence,pngEvidence} from './gq-playtest/evidence.mjs';
const sha='a'.repeat(40);
const fixture=()=>({sha,device:'OPEN: emulated browsers, not physical iPhone',game:'OPEN: scripted interaction, not human enjoyment',art:'OPEN: screenshots require visual review',cases:[{id:'chromium-390-fresh',width:390,height:844,status:'PASS',durationMs:9,errors:[],steps:['boot','tap'].map((name,i)=>({name,status:'PASS',elapsedMs:1,input:i?'touch':'observe',touchEvents:i,image:{file:name+'.png',width:390,height:844,bytes:999,sha256:'b'.repeat(64)}}))}]});
test('complete trace accepted as metadata, never human/device/art acceptance',()=>assertEvidence(fixture(),sha,['chromium-390-fresh']));
for(const [name,mutate] of [
 ['wrong build',x=>x.sha='c'.repeat(40)],['missing case',x=>x.cases=[]],
 ['failed step',x=>x.cases[0].steps[1].status='FAIL'],['missing touch',x=>x.cases[0].steps[1].touchEvents=0],
 ['missing screenshot',x=>delete x.cases[0].steps[0].image],['wrong viewport',x=>x.cases[0].steps[0].image.width=1],
 ['crash',x=>x.cases[0].errors.push('crash')],['false device pass',x=>x.device='PASS'],
 ['false fun pass',x=>x.game='PASS'],['false art pass',x=>x.art='PASS']]){
 test('negative control: '+name,()=>{const x=fixture();mutate(x);assert.throws(()=>assertEvidence(x,sha,['chromium-390-fresh']));});
}
test('non PNG rejected',()=>assert.throws(()=>pngEvidence(Buffer.alloc(64))));
