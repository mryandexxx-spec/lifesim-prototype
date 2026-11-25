"""Retrieve public CC0 candidates, record exact bytes and failures; no paid source."""
import urllib.request,json,pathlib,hashlib,zipfile,io,re
root=pathlib.Path('artifacts/of-01/donors');root.mkdir(parents=True,exist_ok=True)
def fetch(url):
    assert url.startswith('https://')
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'LifeSim-OF-01/1.0 (asset evaluation)'}),timeout=45) as r:return r.read()
def sha(b):return hashlib.sha256(b).hexdigest()
def put(p,b):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);return sha(b)
errors={}
try:
    d=root/'table';d.mkdir(exist_ok=True)
    data=fetch('https://api.polyhaven.com/files/painted_wooden_table');put(d/'api.json',data)
    item=json.loads(data)['gltf']['1k']['gltf'];url=item['url'];entry='table.gltf'
    hashes={entry:put(d/entry,fetch(url))}
    for name,dep in item.get('include',{}).items():
        assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts
        hashes[name]=put(d/name,fetch(dep['url']))
    (d/'source.json').write_text(json.dumps({'entry':entry,'author':'Poly Haven contributors','license':'CC0','licensePage':'https://polyhaven.com/license','assetPage':'https://polyhaven.com/a/painted_wooden_table','url':url,'sha256':hashes},indent=2))
except Exception as e:errors['table']=repr(e)
try:
    d=root/'tree';d.mkdir(exist_ok=True)
    page='https://kenney.nl/assets/nature-kit';html=fetch(page).decode()
    matches=re.findall(r'https://kenney\.nl/[^"\s<>]+nature-kit[^"\s<>]*\.zip',html,re.I)
    url=matches[0] if matches else 'https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip'
    raw=fetch(url);z=zipfile.ZipFile(io.BytesIO(raw))
    license_names=[n for n in z.namelist() if 'license' in n.lower() and n.lower().endswith('.txt')]
    assert license_names,'no license in archive'
    license_bytes=z.read(license_names[0]);assert b'cc0' in license_bytes.lower() or b'creative commons zero' in license_bytes.lower()
    put(d/'license.txt',license_bytes)
    candidates=[n for n in z.namelist() if n.lower().endswith('.glb') and re.search(r'tree[_ -]?(round|oak|default|small)',n,re.I)]
    if not candidates:candidates=[n for n in z.namelist() if n.lower().endswith('.glb') and 'tree' in n.lower() and not re.search('pine|palm|dead|snow|stump',n,re.I)]
    assert candidates,'no suitable tree GLB in free archive'
    name=sorted(candidates)[0];b=z.read(name);put(d/'tree.glb',b)
    (d/'source.json').write_text(json.dumps({'entry':'tree.glb','author':'Kenney','license':'CC0','assetPage':page,'archiveURL':url,'archiveSHA256':sha(raw),'member':name,'sha256':sha(b)},indent=2))
except Exception as e:errors['tree']=repr(e)
(root/'errors.json').write_text(json.dumps(errors,indent=2));print(errors)
