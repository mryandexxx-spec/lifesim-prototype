import { engine, derivatives, originals } from './config.mjs';

const $ = (id) => document.getElementById(id);
const channels = ['eyes', 'nose', 'lips', 'chin', 'cheeks'];
const families = {
  alex: { name: 'Леон', reference: 'Алекс', source: 'meshy-casual-v1.glb', sit: 'Sit_to_Stand_Transition_M', height: .121 },
  mira: { name: 'Ася', reference: 'Мира', source: 'meshy-mira-mobile-v1.glb', sit: 'Sit_Cross_Legged', height: .098 },
};
const state = { family: 'alex', variant: 'derived', degrees: 0, body: false, pose: 'neutral' };
const controls = Object.fromEntries(channels.map((key) => [key, document.querySelector(`[data-morph="${key}"]`)]));
const weights = Object.fromEntries(Object.keys(families).map((key) => [key, channels.map(() => 0)]));
const canvas = $('review-canvas');
const viewport = $('viewport');
let serial = 0;
let current;
const cache = new Map();

function status(message, error = false) {
  $('status').textContent = message;
  $('status').toggleAttribute('data-error', error);
}

try {
  const pc = await import(engine);
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: true, alpha: false } });
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(.76, .75, .74);
  app.scene.gammaCorrection = pc.GAMMA_SRGB;
  app.scene.toneMapping = pc.TONEMAP_ACES;
  const camera = new pc.Entity('Portrait camera');
  camera.addComponent('camera', { nearClip: .02, farClip: 20, clearColor: new pc.Color(.59, .56, .50) });
  app.root.addChild(camera);
  for (const [rotation, intensity, color] of [
    [[58, 18, 0], .90, [1, .96, .91]],
    [[55, -28, 0], .48, [.89, .95, 1]],
    [[28, 150, 0], .53, [1, .93, .86]],
  ]) {
    const light = new pc.Entity('Portrait light');
    light.addComponent('light', { type: 'directional', intensity, color: new pc.Color(...color) });
    light.setEulerAngles(...rotation);
    app.root.addChild(light);
  }
  const floorMat = new pc.StandardMaterial();
  floorMat.diffuse = new pc.Color(.39, .38, .35);
  floorMat.gloss = 0;
  floorMat.update();
  const floor = new pc.Entity('Floor');
  floor.addComponent('render', { type: 'box', material: floorMat });
  floor.setLocalScale(12, .015, 12);
  floor.setLocalPosition(0, -.019, 0);
  app.root.addChild(floor);
  floor.enabled = false;
  const target = new pc.Vec3();
  const scaleForFrame = () => Math.max(1, viewport.clientHeight / (viewport.clientWidth * 1.47));

  function aim() {
    if (!current) return;
    const radians = state.degrees * Math.PI / 180;
    const head = current.head.getPosition();
    const span = state.body ? 1.95 : .374;
    const distance = (span / 2 / Math.tan(20 * Math.PI / 180)) * scaleForFrame();
    if (state.body) target.set(head.x, .85, head.z);
    else target.set(head.x, head.y + families[state.family].height, head.z + .021);
    camera.camera.fov = 40;
    camera.setPosition(target.x + Math.sin(radians) * distance, target.y + .015, target.z + Math.cos(radians) * distance);
    camera.lookAt(target);
  }

  function resize() {
    if (viewport.clientWidth && viewport.clientHeight) app.resizeCanvas(viewport.clientWidth, viewport.clientHeight);
    aim();
  }
  new ResizeObserver(resize).observe(viewport);
  window.addEventListener('orientationchange', resize);
  app.on('update', aim);
  app.start();

  function seek(record, pose) {
    const layer = record.model.anim.baseLayer;
    if (pose === 'neutral') {
      layer.reset();
      for (const item of record.bind) {
        item.node.setLocalPosition(item.position);
        item.node.setLocalRotation(item.rotation);
        item.node.setLocalScale(item.scale);
      }
      return;
    }
    const clip = { idle: record.clips.find((c) => /^Idle/.test(c)), walk: 'Walking', sit: families[record.family].sit }[pose];
    if (!record.clips.includes(clip)) throw new Error(`Клип ${clip} отсутствует`);
    layer.play(clip);
  }

  function apply() {
    if (!current?.morph || current.family !== state.family || state.variant !== 'derived') return;
    weights[state.family].forEach((weight, index) => current.morph.setWeight(index, weight));
  }

  function updatePanel() {
    for (const key of ['family', 'variant']) {
      document.querySelectorAll(`[data-${key}]`).forEach((el) => el.setAttribute('aria-pressed', String(el.dataset[key] === state[key])));
    }
    $('rotate').querySelector('span').textContent = `${state.degrees}°`;
    $('frame').setAttribute('aria-pressed', String(state.body));
    $('frame').textContent = state.body ? 'Крупный план' : 'В полный рост';
    const disallowMorph = state.variant === 'original';
    for (const [index, name] of channels.entries()) {
      const input = controls[name];
      input.value = String(Math.round(weights[state.family][index] * 100));
      input.nextElementSibling.value = `${input.value}%`;
      input.disabled = disallowMorph;
    }
    $('min').disabled = $('max').disabled = disallowMorph;
  }

  function instance(family, variant) {
    const key = `${family}:${variant}`;
    if (!cache.has(key)) {
      const task = (async () => {
        const file = variant === 'original' ? originals + families[family].source : `${derivatives}${family}-p3.glb`;
        const asset = new pc.Asset(key, 'container', { url: file });
        app.assets.add(asset);
        try {
          await new Promise((resolve, reject) => {
            asset.ready(resolve);
            asset.once('error', reject);
            app.assets.load(asset);
          });
          const model = asset.resource.instantiateRenderEntity();
          const head = model.findByName('mixamorig:Head');
          const morphs = model.findComponents('render').flatMap((component) => component.meshInstances)
            .map((mesh) => mesh.morphInstance).filter(Boolean);
          if (!head || (variant === 'derived' && (morphs.length !== 1 || morphs[0].morph.targets.length !== channels.length))) {
            model.destroy();
            throw new Error('Риг или набор морфов не совпадает с моделью');
          }
          const bind = [];
          model.forEach((node) => bind.push({ node, position: node.getLocalPosition().clone(),
            rotation: node.getLocalRotation().clone(), scale: node.getLocalScale().clone() }));
          model.addComponent('anim', { activate: true });
          const clips = [];
          for (const clip of asset.resource.animations) {
            const track = clip.resource;
            model.anim.assignAnimation(track.name, track);
            clips.push(track.name);
          }
          model.enabled = false;
          app.root.addChild(model);
          return { family, variant, model, head, morph: morphs[0], clips, bind };
        } catch (error) {
          app.assets.remove(asset);
          asset.unload();
          throw error;
        }
      })().catch((error) => { cache.delete(key); throw error; });
      cache.set(key, task);
    }
    return cache.get(key);
  }

  async function switchModel() {
    const ticket = ++serial;
    const { family, variant } = state;
    updatePanel();
    status('Загрузка модели…');
    try {
      const record = await instance(family, variant);
      if (ticket !== serial) return;
      if (current && current !== record) current.model.enabled = false;
      current = record;
      current.model.enabled = true;
      apply();
      seek(current, state.pose);
      $('scene-label').textContent = variant === 'derived' ? families[family].name : families[family].reference;
      $('review-canvas').dataset.model = `${family}:${variant}`;
      status(variant === 'derived' ? 'Кандидат для оценки' : 'Исходная модель');
      aim();
    } catch (error) {
      if (ticket !== serial) return;
      status(`Модель не загрузилась. ${error?.message ?? error}`, true);
    }
  }

  for (const key of ['family', 'variant']) {
    document.querySelectorAll(`[data-${key}]`).forEach((el) => el.addEventListener('click', () => {
      state[key] = el.dataset[key];
      switchModel();
    }));
  }
  for (const [index, name] of channels.entries()) {
    const input = controls[name];
    input.addEventListener('input', () => {
      weights[state.family][index] = Number(input.value) / 100;
      input.nextElementSibling.value = `${input.value}%`;
      apply();
    });
  }
  for (const [id, value] of [['min', 0], ['max', 1]]) {
    $(id).addEventListener('click', () => {
      weights[state.family].fill(value);
      updatePanel();
      apply();
    });
  }
  $('rotate').addEventListener('click', () => {
    state.degrees = (state.degrees + 45) % 360;
    updatePanel();
    aim();
  });
  $('frame').addEventListener('click', () => {
    state.body = !state.body;
    floor.enabled = state.body;
    updatePanel();
    aim();
  });
  $('pose').addEventListener('change', (event) => {
    state.pose = event.target.value;
    if (current) seek(current, state.pose);
  });
  canvas.addEventListener('webglcontextlost', () => status('WebGL приостановлен. Обновите страницу.', true));
  canvas.addEventListener('webglcontextrestored', switchModel);
  resize();
  switchModel();
} catch (error) {
  status(`Не удалось запустить трёхмерный просмотр. ${error?.message ?? error}`, true);
}
