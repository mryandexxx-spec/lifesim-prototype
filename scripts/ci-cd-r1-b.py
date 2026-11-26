#!/usr/bin/env python3
"""Isolated C4B source pack proof. No deploy and no production cache reads.
Cold importer executes unchanged. Warm validates independent GLB pins and
a manifest hash anchored by the cold reference, not a self-signed cache.
A production trust anchor must be reviewed and committed separately.
"""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'assets/characters/cas-c3'
OUT=ROOT/'artifacts/ci-cd-r1-b'
INPUTS=['scripts/cas-c4-mira-sources.py','scripts/cas-c4-source-audit.py',
        'scripts/cas-c4-source-verify.mjs','assets/characters/cas-c3/MAKEHUMAN-CC0.txt',
        'package-lock.json']
PINS={
    'c4-ballet.source.glb':'6e7d8d9659d2da99d3c52dd7d9618440b0623760cecd2bd2ddbc997ae45e1d84',
    'c4-mary-jane.source.glb':'768ce0f1180d988fc14d21a9e49a8b5a690ceda2528d5cc7a79619242ec8c58c',
    'c4-ankle-boots.source.glb':'c2e390e73ef79c58ca8d4f7380e4f766b87557df54ed0779867c86576d707d12',
}
MANIFEST='c4-source-manifest.json'
FILES=sorted([*PINS,MANIFEST])
MIRROR='https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/cas-c3/'
URLS={f'https://{host}.makehumancommunity.org/asset_packs/shoes01/shoes01_cc0.zip' for host in ['files','files2']}
def sha(b): return hashlib.sha256(b).hexdigest()
def hashes(folder): return {f:sha((folder/f).read_bytes()) for f in FILES}
def canonical(obj): return json.dumps(obj,sort_keys=True,separators=(',',':')).encode()
def identity(inputs, runtime): return sha(canonical({'inputs':inputs,'runtime':runtime}))
def manifest_check(folder):
    m=json.loads((folder/MANIFEST).read_bytes())
    if m['version']!=1 or m['sourceURL'] not in URLS: raise ValueError('bad publisher identity')
    if set(m['styles'])!={'ballet','mary-jane','ankle-boots'}: raise ValueError('bad style inventory')
    for style,s in m['styles'].items():
        name='c4-'+style+'.source.glb'
        if s['file']!=name or s['sha256']!=PINS[name] or s['license']!='CC0 (source MHCLO declaration)':
            raise ValueError('wrong source identity')
        for field in ['sourceObjSha256','sourceTextureSha256']:
            h=s[field]
            if len(h)!=64 or any(c not in '0123456789abcdef' for c in h): raise ValueError('invalid raw pin')
        if s['bytes']!=(folder/name).stat().st_size: raise ValueError('wrong byte count')
    if hashes(folder)|PINS != hashes(folder): raise ValueError('GLB pin mismatch')
    return m
def verified_reuse(pack,target,expected_key,expected_hashes):
    # The expected hashes/key must be provided outside the untrusted pack.
    if not pack.is_dir() or any(p.is_symlink() or not p.is_file() for p in pack.iterdir()):
        raise ValueError('missing or unsafe pack')
    if {p.name for p in pack.iterdir()}!=set(FILES+['passport.json']): raise ValueError('wrong file inventory')
    meta=json.loads((pack/'passport.json').read_bytes())
    if meta!={'key':expected_key,'files':expected_hashes}: raise ValueError('untrusted passport mismatch')
    if hashes(pack)!=expected_hashes: raise ValueError('byte hash mismatch')
    manifest_check(pack)
    if target.exists(): raise ValueError('target must be fresh')
    # Only materialize after validating every input, never partially restore.
    target.mkdir()
    for f in FILES: shutil.copyfile(pack/f,target/f)
    if hashes(target)!=expected_hashes: raise ValueError('restored bytes changed')
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    inputs={f:sha((ROOT/f).read_bytes()) for f in INPUTS}
    runtime={'python':sys.version,'platform':platform.platform(),'machine':platform.machine(),
             'node':subprocess.check_output(['node','--version'],text=True).strip()}
    key=identity(inputs,runtime)
    for f in FILES:
        if (FOLDER/f).exists(): raise ValueError('cold checkout unexpectedly has '+f)
    t=time.monotonic()
    subprocess.run([sys.executable,'scripts/cas-c4-mira-sources.py'],cwd=ROOT,check=True)
    cold=time.monotonic()-t
    subprocess.run(['node','scripts/cas-c4-source-verify.mjs'],cwd=ROOT,check=True)
    manifest=manifest_check(FOLDER)
    expected=hashes(FOLDER)
    if any(expected[f]!=v for f,v in PINS.items()): raise ValueError('cold reference not approved')
    pack=OUT/'pack';pack.mkdir()
    for f in FILES: shutil.copyfile(FOLDER/f,pack/f)
    (pack/'passport.json').write_bytes(canonical({'key':key,'files':expected}))
    warm=[]; controls={}
    with tempfile.TemporaryDirectory() as td:
        tmp=Path(td)
        for i in range(3):
            start=time.monotonic()
            verified_reuse(pack,tmp/f'warm-{i}',key,expected)
            warm.append(time.monotonic()-start)
        def reject(label,alter=None,check_key=key):
            bad=tmp/('bad-'+label); dest=tmp/('target-'+label)
            if alter is not None:
                shutil.copytree(pack,bad)
                alter(bad)
            try: verified_reuse(bad,dest,check_key,expected)
            except (ValueError,OSError,KeyError,TypeError):
                if dest.exists(): raise AssertionError('partial restore '+label)
                controls[label]='REJECTED'
            else: raise AssertionError('incorrectly accepted '+label)
        reject('missing-pack')
        reject('missing-file',lambda p:(p/FILES[0]).unlink())
        reject('corrupt-glb',lambda p:(p/next(iter(PINS))).write_bytes(b'bad'))
        def forged(p):
            m=json.loads((p/MANIFEST).read_bytes()); m['sourceURL']='https://files.attacker.invalid/forged'
            (p/MANIFEST).write_bytes(canonical(m))
            (p/'passport.json').write_bytes(canonical({'key':key,'files':hashes(p)}))
        reject('forged-manifest-and-passport',forged)
        reject('changed-importer',lambda p:None,identity(inputs|{INPUTS[0]:'0'*64},runtime))
        reject('changed-runtime',lambda p:None,identity(inputs,runtime|{'python':'changed'}))
        # Missing remote source: a valid pack requires no network; invalid pack
        # fails before materialization, even with no available source.
        real_open=urllib.request.urlopen
        def unavailable(*a,**kw): raise OSError('injected offline source')
        urllib.request.urlopen=unavailable
        try:
            verified_reuse(pack,tmp/'offline-ok',key,expected)
            reject('offline-missing')
            controls['offline-valid']='PASS'
        finally: urllib.request.urlopen=real_open
    # Compare independently served prior production source pack. Never use
    # fetched bytes as the trust anchor; exact cold hashes remain authoritative.
    published={}
    for f in FILES:
        try:
            t=time.monotonic()
            with urllib.request.urlopen(MIRROR+f,timeout=30) as resp:
                data=resp.read(20_000_001)
                if len(data)>20_000_000: raise ValueError('oversized release file')
            item={'sha256':sha(data),'bytes':len(data),'seconds':time.monotonic()-t,'byteIdentical':sha(data)==expected[f]}
            if f==MANIFEST:
                prior=json.loads(data)
                item['sameExceptMirrorURL']=(prior|{'sourceURL':manifest['sourceURL']})==manifest and prior.get('sourceURL') in URLS
                if not item['byteIdentical'] and not item['sameExceptMirrorURL']: raise AssertionError('published manifest differs beyond source mirror')
            elif not item['byteIdentical']: raise AssertionError('published GLB differs '+f)
            published[f]=item
        except (OSError,ValueError) as e:
            published[f]={'unavailable':str(e)}
    report={'key':key,'inputs':inputs,'runtime':runtime,'coldSeconds':cold,
            'warmSeconds':warm,'hashes':expected,'bytes':sum((pack/f).stat().st_size for f in FILES),
            'controls':controls,'published':published,'rawSourceProvenance':manifest,
            'limitations':['cold reference anchors warm in this pilot only','local warm copy, not real Actions cache transfer',
                           'C4B source import only, not complete site or release timing']}
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('R1B_RESULT '+json.dumps(report),flush=True)
if __name__=='__main__':main()
