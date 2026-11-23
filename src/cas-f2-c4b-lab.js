import * as pc from 'playcanvas';

const $ = id => document.getElementById(id);
const base = new URL('../assets/characters/cas-c3/', import.meta.url);
const canvas = $('canvas');
const app = new pc.Application(canvas, {graphicsDeviceOptions: {alpha: false, antialias: true}});
app.graphicsDevice.maxPixelRatio = Math.min(devicePixelRatio || 1, 1.5);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(.62, .66, .62);

const sockMaterial = new pc.StandardMaterial();
sockMaterial.diffuse = new pc.Color(.84, .85, .83);
sockMaterial.gloss = .09;
const knit = new pc.Texture(app.graphicsDevice, {name: 'Sock knit', width: 64, height: 64,
  format: pc.PIXELFORMAT_RGBA8, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
  minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR});
const texels = knit.lock();
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 64; x++) {
    const rib = Math.cos(x * Math.PI / 4) * 7;
    const stitch = Math.cos(y * Math.PI / 4 + Math.cos(x * Math.PI / 8)) * 5;
    const offset = (y * 64 + x) * 4;
    texels[offset] = texels[offset + 1] = texels[offset + 2] = 218 + rib + stitch;
    texels[offset + 3] = 255;
  }
}
knit.unlock();
sockMaterial.diffuseMap = knit;
sockMaterial.diffuseMapTiling.set(3, 3);
sockMaterial.update();
function fabric(entity) {
  if (entity?.name.includes(' sock ')) {
    for (const mesh of entity.render.meshInstances) mesh.material = sockMaterial;
  }
}
const camera = new pc.Entity('Camera');
camera.addComponent('camera', {fov: 42, nearClip: .02, farClip: 30,
  clearColor: new pc.Color(.9, .92, .89)});
app.root.addChild(camera);
for (const [angle, color, intensity] of [[[-44, 34, 0], [1, .96, .89], 1.8], [[38, -135, 0], [.84, .90, 1], 1]]) {
  const lamp = new pc.Entity('Light');
  lamp.addComponent('light', {type: 'directional', color: new pc.Color(...color), intensity});
  lamp.setEulerAngles(...angle);
  app.root.addChild(lamp);
}
const floorMat = new pc.StandardMaterial();
floorMat.diffuse = new pc.Color(.72, .77, .73);
floorMat.update();
const floor = new pc.Entity('Floor');
floor.addComponent('render', {type: 'box', material: floorMat});
floor.setLocalScale(12, .04, 12);
floor.setLocalPosition(0, -.021, 0);
app.root.addChild(floor);

let manifest, actors = [], epoch = 0, active = null, originalFallback = false;
const loaded = new Map();
const view = {yaw: 24, pitch: 16, zoom: 1, wide: false};
const soloClips = {idle: /^Idle/, walk: /^Walking$/, run: /^Running$/, sit: /^Sit_to_Stand/};
const pointers = new Map();
let pinchDistance;
let paused = false;
let fps = null;
let frames = 0, elapsed = 0;

function updateCamera() {
  const height = $('controls').getBoundingClientRect().top;
  const top = Math.max(.45, Math.min(1, (height - 7) / innerHeight));
  camera.camera.rect = new pc.Vec4(0, 1 - top, 1, top);
  document.body.style.setProperty('--control-top', Math.floor(top*innerHeight) + 'px');
  const isGroup = actors.length > 1;
  const distance = (isGroup ? (view.wide ? 6.8 : 5.0) :
    (view.wide ? 2.9 : 1.14)) * view.zoom;
  const focus = new pc.Vec3(0, view.wide ? .83 : (isGroup ? .5 : .15), 0);
  const yaw = view.yaw * Math.PI / 180;
  const pitch = view.pitch * Math.PI / 180;
  camera.setPosition(Math.sin(yaw) * Math.cos(pitch) * distance,
    focus.y + Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
  camera.lookAt(focus);
}

function asset(file, checksum) {
  if (!loaded.has(file)) {
    const url = new URL(file, base);
    if (checksum) url.searchParams.set('v', checksum);
    const item = new pc.Asset(file, 'container', {url: url.href});
    const pending = new Promise((resolve, reject) => {
      item.once('load', () => resolve(item.resource));
      item.once('error', () => {
        loaded.delete(file);
        app.assets.remove(item);
        reject(new Error('Не удалось загрузить ' + file));
      });
      app.assets.add(item);
      app.assets.load(item);
    });
    loaded.set(file, pending);
  }
  return loaded.get(file);
}

async function assemble(resident, index, count) {
  const definition = manifest.wearers[resident];
  const part = await asset(definition.body, definition.bodySha256);
  const root = part.instantiateRenderEntity();
  root.enabled = false;
  root.setPosition((index - (count - 1) / 2) * .64, 0, 0);
  const original = root.findByName(definition.originalRender);
  const body = root.findByName('C3 body');
  const bootBody = root.findByName('C3 body boot');
  const layers = ['foot', 'sock'].map(layer =>
    ['left', 'right'].map(side => root.findByName('C3 ' + layer + ' ' + side)));
  if (!original?.render || !body?.render || !bootBody?.render || layers.flat().some(layer => !layer?.render)) {
    root.destroy();
    throw new Error('Модель персонажа собрана неполностью');
  }
  layers[1].forEach(fabric);
  const bind = root.find(node => node.name.startsWith('mixamorig:')).map(node =>
    [node, node.getLocalPosition().clone(), node.getLocalRotation().clone(), node.getLocalScale().clone()]);
  root.addComponent('anim', {activate: true});
  for (const {resource: clip} of part.animations)
    root.anim.assignAnimation(clip.name, clip, undefined, 1, true);
  app.root.addChild(root);
  return {root, original, body, bootBody, layers, clips: part.animations.map(a => a.resource.name),
    definition, resident, footwear: [], bind};
}

function makeShoeNodes(container, actor) {
  const temporary = container.instantiateRenderEntity();
  const moved = [];
  try {
    const parts = temporary.findComponents('render');
    if (!parts.some(render => render.entity.name === 'C3 shoe left') ||
        !parts.some(render => render.entity.name === 'C3 shoe right'))
      throw new Error('Пара обуви собрана неполностью');
    for (const render of parts) {
      const entity = render.entity;
      entity.enabled = false;
      entity.reparent(actor.root);
      moved.push(entity);
      render.rootBone = actor.root;
      fabric(entity);
      for (const mesh of render.meshInstances) {
        const skin = mesh.skinInstance;
        if (!skin || skin.bones.some((bone, index) => bone === entity ||
            bone.name !== skin.skin.boneNames[index])) throw new Error('Несовместимая привязка обуви');
      }
    }
    return moved;
  } catch (error) {
    for (const entity of moved) entity.destroy();
    throw error;
  } finally {
    temporary.destroy();
  }
}

function setLayers() {
  const socks = $('socks').value === 'on';
  for (const {body, bootBody, original, layers, footwear} of actors) {
    body.enabled = active.outfit !== 'original' && active.outfit !== 'ankle-boots';
    bootBody.enabled = active.outfit === 'ankle-boots';
    original.enabled = active.outfit === 'original';
    const bare = active.outfit === 'bare';
    layers[0].forEach(node => {node.enabled = bare && !socks;});
    layers[1].forEach(node => {node.enabled = bare && socks;});
    for (const entity of footwear)
      entity.enabled = entity.name.startsWith('C3 shoe ') ||
        entity.name.startsWith(socks ? 'C3 opening sock ' : 'C3 opening foot ');
  }
}

async function equip() {
  const nonce = ++epoch;
  const next = {resident: $('resident').value, outfit: $('outfit').value};
  const ids = next.resident === 'four' ? ['mira', 'mira', 'mira', 'mira'] :
    next.resident === 'two' ? ['mira', 'mira'] : [next.resident];
  const changed = active?.resident !== next.resident;
  const staged = [];
  const nodes = [];
  try {
    $('status').textContent = 'Загрузка…';
    if (changed) {
      const builds = await Promise.allSettled(ids.map((id, i) => assemble(id, i, ids.length)));
      for (const result of builds) if (result.status === 'fulfilled') staged.push(result.value);
      const failure = builds.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
    const targets = changed ? staged : actors;
    const wearable = next.outfit !== 'original' && next.outfit !== 'bare';
    if (wearable) {
      const resources = await Promise.all(targets.map(({definition}) => {
        const {file, sha256} = definition.styles[next.outfit];
        return asset(file, sha256);
      }));
      if (nonce !== epoch) return;
      targets.forEach((actor, i) => nodes.push(makeShoeNodes(resources[i], actor)));
    }
    if (nonce !== epoch) return;
    if (changed) {
      for (const actor of actors) actor.root.destroy();
      actors = staged.splice(0);
    }
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      for (const node of actor.footwear) node.destroy();
      actor.footwear = nodes[i] ?? [];
      actor.root.enabled = true;
    }
    nodes.length = 0;
    active = next;
    setLayers();
    if (changed) setMotion();
    else setGround();
    updateCamera();
    $('status').textContent = 'Женская примерка C4B';
  } catch (error) {
    if (nonce !== epoch) return;
    $('status').textContent = error.message;
    if (active) {
      $('resident').value = active.resident;
      $('outfit').value = active.outfit;
    }
  } finally {
    for (const actor of staged) actor.root.destroy();
    for (const group of nodes) for (const node of group) node.destroy();
  }
}

function setGround() {
  for (const actor of actors) {
    const clip = $('motion').value === 'bind' ? 'bind' : actor.root.anim.baseLayer.activeState;
    const y = actor.definition.contact?.[clip]?.[active.outfit]?.offsetY ?? 0;
    actor.root.setLocalPosition(actor.root.getLocalPosition().x, y, 0);
  }
}

function setMotion() {
  const motion = $('motion').value;
  for (const actor of actors) {
    const layer = actor.root.anim.baseLayer;
    if (motion === 'bind') {
      layer.reset();
      for (const [node, position, rotation, scale] of actor.bind) {
        node.setLocalPosition(position);
        node.setLocalRotation(rotation);
        node.setLocalScale(scale);
      }
    } else {
      const clip = actor.clips.find(name => soloClips[motion].test(name));
      if (clip) {
        layer.play(clip);
        if (paused) {layer.pause(); layer.activeStateCurrentTime = 0;}
      }
    }
    actor.root.anim.playing = motion !== 'bind' && !paused;
  }
  if (active) setGround();
  $('frames').hidden = !paused || motion === 'bind';
  $('pause').disabled = motion === 'bind';
  updateCamera();
}

function setPhase() {
  const phase = Number($('phase').value) / 100;
  for (const actor of actors) {
    const layer = actor.root.anim.baseLayer;
    layer.activeStateCurrentTime = layer.activeStateDuration * phase;
  }
  $('phase-value').value = Math.round(phase * 100) + '%';
}

$('resident').addEventListener('change', equip);
$('outfit').addEventListener('change', equip);
$('socks').addEventListener('change', () => {if (active) setLayers();});
$('motion').addEventListener('change', setMotion);
$('phase').addEventListener('input', setPhase);
$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? 'Продолжить' : 'Пауза';
  for (const actor of actors) {
    const layer = actor.root.anim.baseLayer;
    if (paused) layer.pause();
    else layer.play();
    actor.root.anim.playing = !paused;
  }
  if (paused && actors[0]) {
    const layer = actors[0].root.anim.baseLayer;
    $('phase').value = String(Math.round(100 * (layer.activeStateProgress % 1 || 0)));
    $('phase-value').value = $('phase').value + '%';
  }
  $('frames').hidden = !paused;
  updateCamera();
});
$('camera').addEventListener('click', () => {
  view.wide = !view.wide;
  view.zoom = 1;
  $('camera').textContent = view.wide ? 'Обувь крупно' : 'Весь персонаж';
  updateCamera();
});
canvas.addEventListener('pointerdown', event => {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, [event.clientX, event.clientY]);
  pinchDistance = undefined;
});
canvas.addEventListener('pointermove', event => {
  const prior = pointers.get(event.pointerId);
  if (!prior) return;
  pointers.set(event.pointerId, [event.clientX, event.clientY]);
  if (pointers.size === 1) {
    view.yaw -= (event.clientX - prior[0]) * .45;
    view.pitch = Math.max(4, Math.min(74, view.pitch + (event.clientY - prior[1]) * .35));
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a[0]-b[0], a[1]-b[1]);
    if (pinchDistance && distance > 5)
      view.zoom = Math.max(.6, Math.min(view.zoom * pinchDistance / distance, 2.3));
    pinchDistance = distance;
  }
  updateCamera();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(type, event => {pointers.delete(event.pointerId); pinchDistance = undefined;});
window.addEventListener('resize', updateCamera);

app.on('update', dt => {
  elapsed += dt;
  frames++;
  if (elapsed >= 1) {
    fps = Math.round(frames / elapsed);
    $('fps').textContent = '· ' + fps + ' FPS';
    elapsed = 0;
    frames = 0;
  }
});
window.__LifeSimCasC4B = () => ({
  active, fps, originalFallback, residents: actors.map(actor => ({
    resident: actor.resident, groundOffset: actor.root.getLocalPosition().y, activeClip: actor.root.anim.baseLayer.activeState, original: actor.original.enabled,
    lean: actor.root.findByName('mixamorig:LeftToeBase').getPosition().toArray(),
    garment: actor.footwear.filter(node => node.enabled).map(node => node.name),
    skinned: actor.footwear.every(node => node.render.rootBone === actor.root)
  })),
  assets: loaded.size
});
app.start();
updateCamera();
(async () => {
  try {
    const response = await fetch(new URL('c4-manifest.json', base), {cache: 'no-store'});
    if (!response.ok) throw new Error('Индекс женской обуви C4B отсутствует');
    manifest = await response.json();
    if (manifest.version !== 1 || manifest.stage !== 'CAS-02.1-F2-C4B' || !manifest.wearers?.mira)
      throw new Error('Неподдерживаемый индекс C4B');
    $('motion').value = 'idle';
    $('socks').value = 'off'; // Open female footwear starts without conspicuous socks.
    await equip();
    if (!active) {
      $('outfit').value = 'original';
      await equip();
    }
    if (!active) throw new Error('Женские модели C4B недоступны');
    for (const id of ['resident', 'outfit', 'motion', 'socks']) $(id).disabled = false;
  } catch (error) {
    try {
      const source = await asset('../meshy-mira-mobile-v1.glb');
      app.root.addChild(source.instantiateRenderEntity());
      originalFallback = true;
      $('status').textContent = 'Примерка недоступна. Показана исходная Мира.';
    } catch {
      $('status').textContent = error.message;
    }
  }
})();
