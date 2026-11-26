#!/usr/bin/env python3
"""One-time matched cold/warm release benchmarks; never publishes."""
import importlib.util
import json
from pathlib import Path
import statistics
import sys
import time

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('release',root/'scripts/ci-cd-r1-c-rehearsal.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
def build(mode):
    release.run('node scripts/ci-guard.mjs')
    start=time.monotonic();timing={}
    for name,cmd in release.release_steps():
        if name=='Check game rules and browser source syntax':
            old='python3 scripts/ci-cd-r1-c-rehearsal.py --prepare'
            if cmd.count(old)!=1: raise RuntimeError('source mode not isolated')
            new='python3 scripts/ci-cd-r1-c-rehearsal.py --restore' if mode.startswith('warm') else 'python3 scripts/cas-c4-mira-sources.py\nnode scripts/cas-c4-source-verify.mjs'
            cmd=cmd.replace(old,new)
        t=time.monotonic();release.run(cmd);timing[name]=time.monotonic()-t
    release.passport(start,timing)
    path=root/'artifacts/ci-cd-r1-c/site-passport.json'
    result=json.loads(path.read_text())
    result['mode']=mode
    # Raw metadata retained separately to diagnose any nondeterminism, not
    # silently excluded from the comparison.
    result['sourceManifest']=json.loads((root/'site/assets/characters/cas-c3/c4-source-manifest.json').read_text())
    path.write_text(json.dumps(result,indent=2)+'\n')
    print('R1D_BUILD '+json.dumps({k:v for k,v in result.items() if k not in ('files','sourceManifest')}),flush=True)
def compare(folder):
    modes=['cold','warm-1','warm-2','warm-3']
    rows={}
    for mode in modes:
        p=folder/('r1d-'+mode)/'site-passport.json'
        rows[mode]=json.loads(p.read_text())
        if rows[mode]['mode']!=mode: raise ValueError('wrong mode')
    cold=rows['cold'];changes={}
    for mode,row in rows.items():
        for key in ['head','tree','workflowSha256','lockSha256','fileCount']:
            if row[key]!=cold[key]: raise ValueError('identity differs '+mode+' '+key)
        if set(row['files'])!=set(cold['files']): raise ValueError('file inventory differs '+mode)
        diff=[f for f in cold['files'] if cold['files'][f]!=row['files'][f]]
        changes[mode]=diff
    warm=[rows[m]['seconds'] for m in modes[1:]]
    report={'head':cold['head'],'tree':cold['tree'],'fileCount':cold['fileCount'],
            'coldSeconds':cold['seconds'],'warmSeconds':warm,'warmMedian':statistics.median(warm),
            'differences':changes,'exactParity':not any(changes.values())}
    print('R1D_COMPARE '+json.dumps(report),flush=True)
    (folder/'comparison.json').write_text(json.dumps(report,indent=2)+'\n')
    if not report['exactParity']: raise RuntimeError('staged site byte mismatch; no merge')
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='compare':compare(Path(sys.argv[2]))
    elif mode in ['cold','warm-1','warm-2','warm-3']:build(mode)
    else:raise ValueError('invalid benchmark mode')
