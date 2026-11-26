#!/usr/bin/env python3
"""R1-C isolated exact-head release build rehearsal.
Source pack version is pinned in reviewed code; Pages is a byte mirror,
never a trust root. No PR artifact is deployed and no deployment credentials
are used. Existing Pages shell steps are preserved verbatim except C4B import.
"""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'assets/characters/cas-c3'
BASE='https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/cas-c3/'
INPUTS={
 'scripts/cas-c4-mira-sources.py':'f461f95d5d1dfa95cb59e4dfcb8e93873063c8ac517f74fa08e7a0823a15a096',
 'scripts/cas-c4-source-audit.py':'9b4912127662b2278b4b996a187032e512e113b3cdd0ea8f671ea1cb76b56703',
 'scripts/cas-c4-source-verify.mjs':'9fcbf9f6caf53de5acf7530f7d9bd4a331a00c4a76d2e0be315a516bc886db26',
 'assets/characters/cas-c3/MAKEHUMAN-CC0.txt':'f6089cba01cb570a24712b41ab8a586ccd3cc5ef53dc266ca50b95c288956d2c',
 'package-lock.json':'c462e7ee905025bf95bbd6783b5b9d96b3ef5e1dd55374e8d00455e2e947ac97',
}
FILES={
 'c4-ankle-boots.source.glb':('c2e390e73ef79c58ca8d4f7380e4f766b87557df54ed0779867c86576d707d12',1875372),
 'c4-ballet.source.glb':('6e7d8d9659d2da99d3c52dd7d9618440b0623760cecd2bd2ddbc997ae45e1d84',3713924),
 'c4-mary-jane.source.glb':('768ce0f1180d988fc14d21a9e49a8b5a690ceda2528d5cc7a79619242ec8c58c',1528480),
 'c4-source-manifest.json':('bc03983b4632c84c66e8208b97321eb5c98888aad4e7710489a618a62009c0ef',3286),
}
def sha(data): return hashlib.sha256(data).hexdigest()
def file_sha(path): 
    with path.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
def run(cmd): subprocess.run(['bash','-euo','pipefail','-c',cmd],cwd=ROOT,check=True)
def fetch(name, pins):
    digest,size=pins
    with urllib.request.urlopen(BASE+name,timeout=12) as res:
        if res.geturl()!=BASE+name: raise ValueError('redirect rejected')
        data=res.read(size+1)
    if len(data)!=size or sha(data)!=digest: raise ValueError('unapproved bytes '+name)
    return name,data
def restore():
    start=time.monotonic()
    if any(file_sha(ROOT/f)!=pin for f,pin in INPUTS.items()):
        raise RuntimeError('source recipe changed: a new audited pack is required')
    if any((FOLDER/f).exists() for f in FILES): raise RuntimeError('not a clean output folder')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        data=dict(executor.map(lambda pair:fetch(*pair),FILES.items()))
    # Do not expose partial or unverified inputs. Independent reviewed hash
    # covers the complete source manifest including raw OBJ/PNG provenance.
    if set(data)!=set(FILES): raise RuntimeError('pack inventory mismatch')
    FOLDER.mkdir(parents=True,exist_ok=True)
    for name,bytes_ in data.items(): (FOLDER/name).write_bytes(bytes_)
    run('node scripts/cas-c4-source-verify.mjs')
    print('R1C_SOURCE_REUSE seconds='+str(time.monotonic()-start),flush=True)
def prepare():
    # Missing/mismatched transport or changed source recipe is never a cache hit.
    # A cold build is permitted only with the original generator and exact
    # audited source validator. Do not mask errors or publish partial output.
    if any((FOLDER/f).exists() for f in FILES):
        raise RuntimeError('not a clean output folder')
    try:
        restore()
    except Exception as exc:
        print('R1C_SOURCE_COLD_FALLBACK '+str(exc),flush=True)
        for f in FILES:
            (FOLDER/f).unlink(missing_ok=True)
        run('python3 scripts/cas-c4-mira-sources.py')
        run('node scripts/cas-c4-source-verify.mjs')
        # When recipe is unchanged the cold result must match full reviewed
        # provenance, allowing only selection of the other approved mirror.
        if all(file_sha(ROOT/f)==pin for f,pin in INPUTS.items()):
            for f,(pin,size) in FILES.items():
                data=(FOLDER/f).read_bytes()
                if f=='c4-source-manifest.json':
                    m=json.loads(data)
                    if m.get('sourceURL')=='https://files.makehumancommunity.org/asset_packs/shoes01/shoes01_cc0.zip':
                        m['sourceURL']='https://files2.makehumancommunity.org/asset_packs/shoes01/shoes01_cc0.zip'
                        data=(json.dumps(m,indent=2)+'\n').encode()
                if len(data)!=size or sha(data)!=pin:
                    raise RuntimeError('cold output differs from accepted source pack '+f)
def release_steps():
    yaml=(ROOT/'.github/workflows/pages.yml').read_text()
    # Deliberately narrow parser for existing explicit literal shell blocks.
    # Fail closed if YAML structure or step names drift.
    blocks=dict(re.findall(r'^      - name: ([^\n]+)\n        run: \|\n((?:          [^\n]*\n)+)',yaml,re.M))
    names=['Check game rules and browser source syntax',
           'Verify optimized Meshy GLB SHA-256','Assemble static website',
           'Include optional Meshy character GLB when present',
           'Verify published F2 audit manifest and every referenced real GLB']
    if not all(n in blocks for n in names): raise RuntimeError('Pages shell inventory changed')
    for name in names:
        cmd='\n'.join(line[10:] for line in blocks[name].splitlines())
        if name==names[0]:
            if cmd.count('python3 scripts/ci-cd-r1-c-rehearsal.py --prepare')!=1 or cmd.count('npm test')!=1: raise RuntimeError('Pages import/test gate changed')
        yield name,cmd
def main():
    if len(sys.argv)>1:
        if sys.argv[1]=='--prepare': prepare()
        elif sys.argv[1]=='--restore': restore()
        elif sys.argv[1]=='--passport': passport(time.monotonic(),{})
        else: raise ValueError('unknown mode')
        return
    run('node scripts/ci-guard.mjs')
    start=time.monotonic();timing={}
    for name,cmd in release_steps():
        print('R1C_STEP '+name,flush=True)
        t=time.monotonic();run(cmd);timing[name]=time.monotonic()-t
    passport(start,timing)
def passport(start,timing):
    site=ROOT/'site'
    files={}
    for path in sorted(site.rglob('*')):
        if path.is_symlink(): raise RuntimeError('unexpected symlink '+str(path))
        if path.is_file(): files[path.relative_to(site).as_posix()]={'sha256':file_sha(path),'bytes':path.stat().st_size}
    if not files or 'index.html' not in files: raise RuntimeError('missing site')
    git=lambda *args: subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
    report={'head':git('rev-parse','HEAD'),'tree':git('rev-parse','HEAD^{tree}'),
            'workflowSha256':file_sha(ROOT/'.github/workflows/pages.yml'),
            'lockSha256':file_sha(ROOT/'package-lock.json'),'seconds':time.monotonic()-start,
            'steps':timing,'fileCount':len(files),'siteBytes':sum(f['bytes'] for f in files.values()),
            'files':files}
    out=ROOT/'artifacts/ci-cd-r1-c';out.mkdir(parents=True,exist_ok=True)
    (out/'site-passport.json').write_text(json.dumps(report,indent=2)+'\n')
    print('R1C_RESULT '+json.dumps({k:v for k,v in report.items() if k!='files'}),flush=True)
if __name__=='__main__':main()
