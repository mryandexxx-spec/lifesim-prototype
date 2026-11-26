// Read-only R1-A diagnostic. No production selector or release changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,existsSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {planChanges} from '../scripts/ci-target.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const read=(r,f)=>readFileSync(path.join(r,f),'utf8');
const suites=r=>readdirSync(path.join(r,'tests')).filter(f=>f.endsWith('.test.js')).map(f=>'tests/'+f).sort();
const importPattern=/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.{1,2}\/[^'"]+)['"]/g;
function closure(r,f,seen=new Set()){
  if(seen.has(f)||!existsSync(path.join(r,f)))return seen;
  seen.add(f);
  for(const m of read(r,f).matchAll(importPattern)){
    let dep=path.posix.normalize(path.posix.join(path.posix.dirname(f),m[1].split('?')[0]));
    if(!path.posix.extname(dep))dep+='.js';
    if(/\.(?:m?js|cjs)$/.test(dep)&&!dep.startsWith('../'))closure(r,dep,seen);
  }
  return seen;
}
function inventory(r){
  return suites(r).map(file=>{
    const refs=new Set(), readers=[];
    for(const f of closure(r,file)){
      const s=read(r,f);
      const lines=s.split('\n');
      const evidence=lines.flatMap((l,i)=>/\b(?:readFileSync|readFile|readFileAsync|createReadStream|runIn(?:New|This|Context)|Script|eval)\b/.test(l)?[i+1]:[]);
      if(!evidence.length)continue;
      readers.push({file:f,lines:evidence});
      for(const m of s.matchAll(/(?:\.\.\/)*(src\/[\w./-]+\.(?:js|mjs)|scripts\/[\w./-]+\.(?:js|mjs|py)|\.github\/workflows\/[\w.-]+\.ya?ml|(?:index|[\w-]+-lab)\.html|styles\.css|sw\.js|package(?:-lock)?\.json)\b/g))refs.add(m[1]);
    }
    return {file,readers,refs:[...refs].sort()};
  }).filter(x=>x.readers.length);
}
// Shadow strategy ONLY: existing selection is a floor; all opaque reader suites
// are included for source changes. Shared/unknown source boundaries use full
// Node, as do build/release files. Provisioning generated assets is a separate
// mandatory gate before this can replace production routing.
function shadow(files,r,old,contracts){
  const all=suites(r), out=new Set(old.tests);
  const production=files.filter(f=>/^(?:src\/|scripts\/|\.github\/workflows\/|.*\.html$|styles\.css$|sw\.js$|package(?:-lock)?\.json$|assets\/)/.test(f));
  const shared=production.some(f=>/^(?:src\/game\.js|scripts\/|\.github\/workflows\/|.*\.html$|styles\.css$|sw\.js$|package(?:-lock)?\.json$|assets\/)/.test(f));
  const unknown=production.some(f=>f.startsWith('src/')&& !all.some(t=>closure(r,t).has(f)) && !contracts.some(c=>c.refs.includes(f)));
  if(shared||unknown)for(const f of all)out.add(f);
  else if(production.length)for(const c of contracts)out.add(c.file);
  return {mode:shared||unknown?'full':production.length?'reader-union':'existing',tests:[...out].sort()};
}
const incidents=[
  ['45878601643','2129d9908f6e9eef0d42b663a31dc0a1afc533b2',['tests/hud-panel.test.js']],
  ['45796021838','f7a57e042c78d19ea67bb2e41f3ed8305820604d',['tests/cas-01-population-save.test.js']],
  ['45783204841','9a62eb3358df47fed4e7f35198a2f091b5ca4c6e',['tests/dialogue-decision.test.js','tests/needs-balance.test.js']],
  ['45690494891','edc6313aa03b1a28367a8a2af1112c5187f11e0a',['tests/furniture-shop-integration.test.js']],
  ['45576498497','13a9e8679d919596c225cf26845354a74cedf698',['tests/pf-01.test.js']]
];
test('R1-A inventory: current active events, published lab list and generator dependencies',()=>{
  const workflowDir=path.join(root,'.github/workflows');
  const workflows=readdirSync(workflowDir).filter(f=>/\.ya?ml$/.test(f)).map(f=>{
    const s=read(root,'.github/workflows/'+f);
    const on=s.match(/^on:\s*\n((?:[ \t].*\n)*)/m)?.[1]||'';
    return {file:f,events:[...on.matchAll(/^  ([a-z_]+):/gm)].map(m=>m[1])};
  });
  const active=workflows.filter(w=>w.events.some(e=>['push','pull_request','workflow_run','schedule','merge_group','pull_request_target'].includes(e)));
  const pages=read(root,'.github/workflows/pages.yml');
  const commands=pages.split('\n').map(l=>l.trim());
  const builders=commands.filter(l=>/^(?:node|python3) scripts\/[^ ]+\.(?:mjs|py)$/.test(l)).map(l=>{
    const file=l.split(' ')[1];
    const deps=file.endsWith('.py')?[file]:[...closure(root,file)];
    const evidence=deps.map(f=>({file:f,io:read(root,f).split('\n').flatMap((line,i)=>/readFileSync|writeFileSync|fetch\(|https:\/\/|urllib|write_text|write_bytes|read_bytes|importlib/.test(line)?[{line:i+1,text:line.trim().slice(0,250)}]:[])}));
    return {file,deps,evidence};
  });
  const assembly=commands.filter(l=>/^cp |^mkdir -p site|^node scripts\/.*pages-verify/.test(l));
  const labs=[...new Set(assembly.flatMap(l=>l.match(/[\w-]+-lab(?:-mira)?\.html/g)||[]))].sort();
  const report={head:git('rev-parse','HEAD'),workflowCount:workflows.length,active,builders,assembly,labs};
  console.log('R1A_WORKFLOWS '+JSON.stringify({head:report.head,workflowCount:report.workflowCount,active,labs}));
  for(const x of builders)console.log('R1A_GENERATOR '+JSON.stringify(x));
  console.log('R1A_ASSEMBLY '+JSON.stringify(assembly));
  assert.ok(builders.some(b=>b.file==='scripts/cas-c4-mira-sources.py'));
  assert.ok(commands.includes('npm test'));
  assert.ok(labs.includes('cas-f2-c4b-lab.html'));
});
test('R1-A current lexical read/VM inventory and shadow selection costs',()=>{
  const contracts=inventory(root), all=suites(root);
  for(const c of contracts)console.log('R1A_READER '+JSON.stringify({file:c.file,refs:c.refs,readers:c.readers.map(r=>r.file)}));
  const paths=['src/game.js','src/kitchen.js','src/career-phone-ui.js','src/hud-panel.js','styles.css','.github/workflows/pages.yml','scripts/cas-c4-mira-sources.py','README.md'];
  const results=paths.map(f=>{const old=planChanges([f],root),next=shadow([f],root,old,contracts);
    assert.ok(old.tests.every(t=>next.tests.includes(t)));
    return {file:f,old:old.tests.length,shadow:next.tests.length,mode:next.mode,browser:old.browser};});
  console.log('R1A_CURRENT '+JSON.stringify({suiteCount:all.length,readerCount:contracts.length,results}));
  assert.equal(results.at(-1).shadow,0);
  assert.equal(results[0].shadow,all.length);
});
test('R1-A five actual failed release diffs: replay historical router and shadow on exact tree',async()=>{
  for(const [run,sha,failed] of incidents){
    const changed=git('diff','--name-only',sha+'^',sha).split('\n').filter(Boolean);
    const snapshot=mkdtempSync(path.join(tmpdir(),'r1a-'));
    try{
      // Only code is needed for routing. Never checkout or run old workflows,
      // never execute old failing suites as if they were current regression tests.
      const tracked=git('ls-tree','--name-only',sha).split('\n');
      const paths=['src','tests','scripts','.github','package.json','index.html','styles.css','sw.js',...tracked.filter(f=>f.endsWith('.html')&&f!=='index.html')].filter(f=>tracked.includes(f));
      const tar=execFileSync('git',['archive',sha,...paths],{cwd:root,maxBuffer:128*1024*1024});
      execFileSync('tar',['-xf','-','-C',snapshot],{input:tar,maxBuffer:8*1024*1024});
      const historic=await import(pathToFileURL(path.join(snapshot,'scripts/ci-target.mjs')).href);
      const old=historic.planChanges(changed,snapshot);
      const contracts=inventory(snapshot),next=shadow(changed,snapshot,old,contracts);
      const missed=failed.filter(f=>!old.tests.includes(f));
      const stillMissed=failed.filter(f=>!next.tests.includes(f));
      console.log('R1A_REPLAY '+JSON.stringify({run,sha,changed,oldCount:old.tests.length,shadowCount:next.tests.length,mode:next.mode,failed,missed,stillMissed}));
      assert.deepEqual(stillMissed,[],run+' shadow missed known failed contract');
      assert.ok(old.tests.every(f=>next.tests.includes(f)),run+' shadow weakened old selection');
    }finally{rmSync(snapshot,{recursive:true,force:true});}
  }
});
