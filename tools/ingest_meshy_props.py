#!/usr/bin/env python3
"""Sequential Meshy 13-GLB ingest, committed only on isolated asset branch."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

SOURCE=Path('tools/meshy-v3-import-sources.json')
TARGET=Path('assets/furniture/meshy-room-v3')

def main():
    items=json.loads(SOURCE.read_text())['items']
    if len(items)!=13:raise RuntimeError(f'Expected exactly 13 tasks, got {len(items)}')
    TARGET.mkdir(parents=True,exist_ok=True)
    manifest=[]
    for index,item in enumerate(items,1):
        sku=item['sku'];task_id=item['task_id'];url=item['url']
        if not re.fullmatch(r'[a-z0-9]+(?:[._][a-z0-9]+)*',sku):
            raise RuntimeError(f'Invalid SKU {sku}')
        if not re.fullmatch(r'[0-9a-f-]{36}',task_id):
            raise RuntimeError('Invalid Meshy task ID')
        if urlsplit(url).scheme!='https' or urlsplit(url).hostname!='assets.meshy.ai':
            raise RuntimeError('Invalid download host')
        raw=Path('/tmp')/(sku+'.raw.glb')
        dst=TARGET/(sku+'.glb')
        print(f'[{index}/13] Fetching source for {sku}',flush=True)
        subprocess.run(['curl','--fail','--show-error','--silent','--location',
                        '--retry','4','--retry-all-errors','--retry-delay','3',
                        '--connect-timeout','20','--max-time','240',
                        url,'--output',str(raw)],check=True)
        if raw.stat().st_size>40_000_000 or raw.read_bytes()[:4]!=b'glTF':
            raise RuntimeError('Not safe GLB payload for '+sku)
        result=subprocess.run(['python3','tools/optimize_meshy_prop_glb.py',
                               str(raw),str(dst),'--texture-size','1024'],
                              capture_output=True,text=True,check=True)
        report=json.loads(result.stdout)
        if report['bytes']>10_000_000:
            raise RuntimeError('Optimized GLB exceeds mobile art budget '+sku)
        print(f'[{index}/13] Validated {sku}: {report["source_bytes"]} -> {report["bytes"]} bytes '
              f'({report["saved_percent"]}% reduction)',flush=True)
        manifest.append({'sku':sku,'glb':sku+'.glb','bytes':report['bytes'],
                         'sha256':report['sha256'],'source_bytes':report['source_bytes'],
                         'saved_percent':report['saved_percent'],
                         'triangles':report['triangle_faces'],
                         'texture_changes':report['texture_changes'],
                         'status':'optimized-static-asset-not-wired'})
        raw.unlink()
    summary={'version':3,'asset_count':len(manifest),'source':'Meshy image-to-3d meshy-t2/meshy-n1',
             'status':'optimized-static-asset-not-wired',
             'scope':'visual assets staged only; runtime and shop integration separate',
             'records':manifest}
    (TARGET/'manifest.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    for item in manifest:
        data=(TARGET/item['glb']).read_bytes()
        assert len(data)==item['bytes']
        assert hashlib.sha256(data).hexdigest()==item['sha256']
    print(f'All {len(manifest)} GLBs verified, ready for branch commit',flush=True)

if __name__=='__main__':
    main()
