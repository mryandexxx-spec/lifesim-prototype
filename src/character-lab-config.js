/** Meshy Character Lab - engine-independent GLB metadata and preview policy. */
export const CHARACTER_FILE_NAME = 'Meshy_AI_Casual_Animated_Young_Man_20261114_animated_mixamo_All_animation.glb';
export const KNOWN_CLIPS = Object.freeze([
  'Running', 'Walking', 'Call_Gesture', 'Idle_3', 'Idle_4',
  'Listening_Gesture', 'Run_02', 'Sit_to_Stand_Transition_M',
  'Stand_Talking_Angry', 'Wave_One_Hand'
]);
export const ONE_SHOT_CLIPS = Object.freeze(new Set([
  'Sit_to_Stand_Transition_M', 'Wave_One_Hand', 'Call_Gesture',
  'Sit_to_Stand_Transition_F', 'Step_to_Sit_Transition', 'Look_Back_and_Sit',
  'Lie_Down_Hands_Spread', 'Hand_on_Hip_Gesture', 'Wave_for_Help_1'
]));
// The female preview is separate from the production Mira renderer and Alex configuration.
export const MIRA_KNOWN_CLIPS = Object.freeze([
  'Running', 'Walking', 'Hand_on_Hip_Gesture', 'Idle_7',
  'Lie_Down_Hands_Spread', 'Listening_Gesture', 'Look_Back_and_Sit',
  'Sit_Cross_Legged', 'Sit_to_Stand_Transition_F', 'Step_to_Sit_Transition',
  'Walking_Woman', 'Wave_for_Help_1', 'sleep'
]);
export const CHARACTER_LAB_MODELS = Object.freeze({
  alex:Object.freeze({
    key:'alex',label:'Алекс',assetUrl:'./assets/characters/meshy-casual-v1.glb',
    fileName:'meshy-casual-v1.glb',bytes:2278456,triangles:25847,joints:66,
    morphTargets:0,targetHeight:1.78
  }),
  alexpilot:Object.freeze({
    key:'alexpilot',label:'Алекс — исходный GLB со сменной обувью',
    assetUrl:'./assets/characters/cas-alex-footwear-lab-v1.glb?cas-02-1-d',
    fileName:'cas-alex-footwear-lab-v1.glb',bytes:0,triangles:null,joints:66,
    morphTargets:0,targetHeight:2.05
  }),
  alexstyles:Object.freeze({
    key:'alexstyles',label:'Алекс — настоящие сменные стили обуви',
    assetUrl:'./assets/characters/cas-alex-footwear-v2.glb?cas-02-1-e',
    fileName:'cas-alex-footwear-v2.glb',bytes:0,triangles:null,joints:66,
    morphTargets:0,targetHeight:2.05
  }),
  mirastyles:Object.freeze({
    key:'mirastyles',label:'Мира — настоящие сменные стили обуви',
    assetUrl:'./assets/characters/cas-mira-footwear-v2.glb?cas-02-1-e',
    fileName:'cas-mira-footwear-v2.glb',bytes:0,triangles:null,joints:66,
    morphTargets:0,targetHeight:2.05
  }),
  casproto:Object.freeze({
    key:'casproto',label:'CAS-02.1-B original modular prototype',
    assetUrl:'./assets/characters/cas-modular-mannequin-v1.glb?cas-02-1-c',
    fileName:'cas-modular-mannequin-v1.glb',bytes:152564,triangles:3936,joints:18,
    morphTargets:0,targetHeight:1.78
  }),
  cas022alex:Object.freeze({
    key:'cas022alex',label:'Алекс — CAS-02.2 геометрический прототип',
    assetUrl:'./assets/characters/cas-02-2-alex-morphs.glb?cas-02-2-a',
    fileName:'cas-02-2-alex-morphs.glb',bytes:0,triangles:25847,joints:66,
    morphTargets:2,targetHeight:2.05
  }),
  cas022mira:Object.freeze({
    key:'cas022mira',label:'Мира — CAS-02.2 геометрический прототип',
    assetUrl:'./assets/characters/cas-02-2-mira-morphs.glb?cas-02-2-a',
    fileName:'cas-02-2-mira-morphs.glb',bytes:0,triangles:23245,joints:66,
    morphTargets:2,targetHeight:2.05
  }),
  mira:Object.freeze({
    key:'mira',label:'Мира',assetUrl:'./assets/characters/meshy-mira-mobile-v1.glb',
    fileName:'meshy-mira-mobile-v1.glb',bytes:2235708,triangles:23245,joints:66,
    morphTargets:0,targetHeight:1.78
  })
});
export function characterLabModel(character='alex') {
  return CHARACTER_LAB_MODELS[character] ?? CHARACTER_LAB_MODELS.alex;
}
export const TARGET_HEIGHT_M = 1.78;
export const MIN_GLB_SIZE = 20;
export const GLB_MAGIC = 0x46546c67;

export function chooseIdleClip(names) {
  return names.find(name => /^idle(?:_|$)/i.test(name)) ?? names[0] ?? null;
}

export function isOneShotClip(name) {
  return ONE_SHOT_CLIPS.has(name);
}

export function parseGlbHeader(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < 12) {
    throw new Error('Файл слишком короткий для GLB.');
  }
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Это не GLB-файл.');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Неподдерживаемая версия glTF: ${version}.`);
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== arrayBuffer.byteLength) {
    throw new Error('Размер файла не совпадает с заголовком GLB.');
  }
  if (declaredLength < MIN_GLB_SIZE) throw new Error('GLB содержит неполный заголовок.');
  return {version, bytes:declaredLength};
}

export function characterFit(bounds, targetHeight = TARGET_HEIGHT_M) {
  const {min, max} = bounds || {};
  if (!min || !max) throw new Error('Границы модели недоступны.');
  const height = max.y - min.y;
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new Error('Некорректные размеры модели.');
  }
  const scale = targetHeight / height;
  return {
    scale,
    x: -(min.x + max.x) * .5 * scale,
    y: -min.y * scale,
    z: -(min.z + max.z) * .5 * scale,
    height:targetHeight
  };
}

export function summarizeClips(names) {
  const seen = new Set();
  const list = [];
  for (const name of names) {
    if (typeof name === 'string' && name.trim() && !seen.has(name)) {
      list.push({name, loop:!isOneShotClip(name)});
      seen.add(name);
    }
  }
  return list;
}

/** Static metadata only: does not decode meshes or execute animations. */
export function inspectGltf(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.meshes)) {
    throw new Error('Некорректная структура glTF.');
  }
  let triangles=0, morphTargets=0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives||[]) {
    if ((primitive.mode??4)===4) {
      const accessorIndex=primitive.indices??primitive.attributes?.POSITION;
      const count=json.accessors?.[accessorIndex]?.count;
      if (Number.isInteger(count) && count>=0) triangles+=Math.floor(count/3);
    }
    morphTargets+=primitive.targets?.length||0;
  }
  return {
    triangles,
    joints:Math.max(0,...(json.skins||[]).map(s=>s.joints?.length||0)),
    clips:json.animations?.length||0,
    materials:json.materials?.length||0,
    morphTargets
  };
}

export function formatAssetBytes(bytes) {
  return Number.isFinite(bytes)&&bytes>0 ? `${(bytes/1_000_000).toFixed(2)} МБ` : '—';
}