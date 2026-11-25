"""RESET-C-VIS: compare the exact published GLBs, not regenerated meshes."""
import hashlib,json,math,shutil,sys,struct
from pathlib import Path
ROOT=Path("vis-out")
LAB=ROOT/"lab"
FRAMES=LAB/"comparison"
PIN={"male":"4ce29a6ffce21817f92bb2c7df8c27afe630d0dd88e373a05e2ceca591fdcbb8","female":"f4973254fb39f2ff962f429725e66c17a478d7e4110ed556679babb400c7d85e"}
STATES={"neutral":{},"all-pos":{k+"_pos":1 for k in ("jaw","cheeks","nose","mouth","eyes")},"all-neg":{k+"_neg":1 for k in ("jaw","cheeks","nose","mouth","eyes")},"smile":{"smile":1}}
ANGLES=(0,45,90)
LIGHTS=[((-2,3,4),1.2),((3,2,3),.35),((2,3,-3),.55)]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def prepare(src):
    LAB.mkdir(parents=True,exist_ok=True)
    FRAMES.mkdir(exist_ok=True)
    for p in src.iterdir():
        if p.is_file():shutil.copy2(p,LAB/p.name)
    audit={}
    for sex,digest in PIN.items():
        p=LAB/(sex+"-candidate.glb")
        assert sha(p)==digest,sex
        raw=p.read_bytes()
        n=struct.unpack_from("<I",raw,12)[0]
        j=json.loads(raw[20:20+n])
        audit[sex]={"sha256":digest,"materials":j.get("materials",[]),"textures":len(j.get("textures",[])),"images":len(j.get("images",[])),"targetCounts":[len(p.get("targets",[])) for m in j["meshes"] for p in m["primitives"]]}
    (ROOT/"materials.json").write_text(json.dumps(audit,indent=2))
    s=(LAB/"lab.js").read_text()
    # Preserve all original controls and target code; only adjust review presentation.
    old="let values=Object.fromEntries"
    assert old in s
    s=s.replace(old,"let visMode='matched', visLights=[]; let values=Object.fromEntries",1)
    old="function gallery(){"
    assert old in s
    s=s.replace(old,"function gallery(){const p=$('pairs');p.replaceChildren();for(const state of ['neutral','all-pos','all-neg','smile'])for(const angle of [0,45,90]){const d=document.createElement('div');d.innerHTML='<p>'+state+' · '+angle+'°</p><div class=\"grid\">'+['blender','chromium-matched','chromium-legacy'].map(k=>'<figure><img loading=\"lazy\" src=\"comparison/'+sex+'-'+state+'-'+angle+'-'+k+'.png\" alt=\"'+k+'\"><figcaption>'+k+'</figcaption></figure>').join('')+'</div>';p.append(d)}",1)
    old="function rotate(a)"
    assert old in s
    s=s.replace(old,"function setVis(mode){visMode=mode;const legacy=mode==='legacy';app.scene.ambientLight=new pc.Color(legacy?.58:0,legacy?.58:0,legacy?.58:0);app.scene.toneMapping=legacy?pc.TONEMAP_AGX:pc.TONEMAP_LINEAR;app.scene.exposure=legacy?1.45:1;visLights.forEach((l,i)=>{l.light.intensity=(legacy?[1.2,.7,1]:[1.2,.35,.55])[i];const p=[[-2,3,4],[3,2,3],[2,3,-3]][i];const z=models[sex].center;l.setPosition(p[0],p[1]+(legacy?0:z),p[2]);l.lookAt(0,legacy?1.65:z,0)});$('vis-mode').textContent=legacy?'Свет RESET-C-FIX':'Согласованный свет';$('vis-mode').setAttribute('aria-pressed',String(!legacy))} window.setVis=setVis; function rotate(a)",1)
    s=s.replace("cam.lookAt(0,z,0);update()","cam.lookAt(0,z,0);setVis(visMode);update()",1)
    s=s.replace("app.root.addChild(l);l.setPosition","app.root.addChild(l);visLights.push(l);l.setPosition",1)
    s=s.replace("app.start();await load('male')","$('vis-mode').onclick=()=>setVis(visMode==='legacy'?'matched':'legacy');app.start();await load('male')",1)
    (LAB/"lab.js").write_text(s)
    html=(LAB/"index.html").read_text().replace("RESET-C-FIX","RESET-C-VIS")
    html=html.replace('<div class="work">','<p>Диагностическое сравнение света и камеры; художественная приёмка не завершена. Модели не изменены.</p><button id="vis-mode" aria-pressed="true">Согласованный свет</button><div class="work">',1)
    html=html.replace('</style>','.view{height:auto;aspect-ratio:1;max-width:480px}.grid{grid-template-columns:repeat(3,minmax(0,1fr))}</style>',1)
    html=html.replace('<details><summary>Реальные рендеры Blender','<details><summary>Согласованные кадры · Blender / PlayCanvas / исходный свет</summary><div id="pairs"></div></details><details><summary>Реальные рендеры Blender',1)
    (LAB/"index.html").write_text(html)
def render():
    import bpy
    from mathutils import Vector
    def cv(v):return Vector((v[0],-v[2],v[1]))
    models=json.loads((LAB/"models.json").read_text())
    for sex,digest in PIN.items():
        p=LAB/(sex+"-candidate.glb")
        assert sha(p)==digest
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(p.resolve()))
        meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and o.data.shape_keys]
        assert meshes and all(len(o.data.shape_keys.key_blocks)==16 for o in meshes)
        scene=bpy.context.scene
        center=cv((0,models[sex]["center"],0))
        scene.world=bpy.data.worlds.new("Black ambient")
        scene.world.use_nodes=True
        scene.world.node_tree.nodes["Background"].inputs[1].default_value=0
        for offset,power in LIGHTS:
            bpy.ops.object.light_add(type="SUN",location=center+cv(offset))
            l=bpy.context.object
            l.rotation_euler=(center-l.location).to_track_quat("-Z","Y").to_euler()
            l.data.energy=power
            l.data.angle=0
        bpy.ops.object.camera_add()
        cam=bpy.context.object
        cam.data.type="ORTHO"
        cam.data.ortho_scale=.44
        cam.data.clip_start=.01
        cam.data.clip_end=5
        scene.camera=cam
        scene.render.engine="CYCLES"
        scene.cycles.device="CPU"
        scene.cycles.samples=12
        scene.cycles.use_denoising=True
        scene.render.threads_mode="FIXED"
        scene.render.threads=4
        scene.render.resolution_x=scene.render.resolution_y=384
        scene.render.resolution_percentage=100
        scene.render.film_transparent=True
        scene.render.image_settings.file_format="PNG"
        scene.view_settings.view_transform="Standard"
        scene.view_settings.look="None"
        scene.view_settings.exposure=0
        scene.view_settings.gamma=1
        for state,w in STATES.items():
            for o in meshes:
                for k in o.data.shape_keys.key_blocks[1:]: k.value=w.get(k.name,0)
            for name in w:assert any(name in o.data.shape_keys.key_blocks for o in meshes),name
            bpy.context.view_layer.update()
            for angle in ANGLES:
                r=math.radians(angle)
                cam.location=center+cv((math.sin(r)*1.9,0,math.cos(r)*1.9))
                cam.rotation_euler=(center-cam.location).to_track_quat("-Z","Y").to_euler()
                scene.render.filepath=str((FRAMES/f"{sex}-{state}-{angle}-blender.png").resolve())
                bpy.ops.render.render(write_still=True)
        bpy.ops.wm.save_as_mainfile(filepath=str((ROOT/f"{sex}-vis.blend").resolve()))
    from PIL import Image
    for p in FRAMES.glob("*-blender.png"):
        im=Image.open(p).convert("RGBA")
        # PC camera clear color is authored as RGB; composite independently, not alter face pixels.
        bg=Image.new("RGBA",im.size,(46,59,74,255));bg.alpha_composite(im);bg.convert("RGB").save(p)
    assert len(list(FRAMES.glob("*-blender.png")))==24
if __name__=="__main__":
    if sys.argv[1]=="prepare":prepare(Path(sys.argv[2]))
    elif sys.argv[1]=="render":render()
    else:raise ValueError(sys.argv)
