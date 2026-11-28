/** Блин’С character catalog: stable IDs, independent of resident identity and renderer. */
const entry=(id,facet,label,description,axisDeltas,tags=[])=>Object.freeze({
  id,facet,label,description,axisDeltas:Object.freeze(axisDeltas),tags:Object.freeze(tags)
});
export const TRAIT_CATALOG=Object.freeze({
  'temperament.cheerful':entry('temperament.cheerful','temperament','Весёлый','Легче замечает хорошее и восстанавливает настроение',{optimism:.25,resilience:.10}),
  'temperament.melancholic':entry('temperament.melancholic','temperament','Меланхолик','Тонко переживает впечатления и любит размышлять',{optimism:-.10,emotionalReactivity:.20,creativity:.08}),
  'temperament.calm':entry('temperament.calm','temperament','Спокойный','Меньше тревожится из-за мелочей',{emotionalReactivity:-.22,resilience:.16}),
  'temperament.hotheaded':entry('temperament.hotheaded','temperament','Вспыльчивый','Острее реагирует на провокации',{emotionalReactivity:.26,resilience:-.10}),
  'habits.neat':entry('habits.neat','habits','Аккуратный','Любит чистоту и порядок',{organization:.30}),
  'habits.untidy':entry('habits.untidy','habits','Неряшливый','Не слишком беспокоится о беспорядке',{organization:-.30}),
  'coordination.clumsy':entry('coordination.clumsy','coordination','Растяпа','Порой неуклюж в мелких делах',{coordination:-.30}),
  'coordination.agile':entry('coordination.agile','coordination','Ловкий','Хорошо справляется с точными движениями',{coordination:.25}),
  'social.outgoing':entry('social.outgoing','social','Общительный','Любит проводить время с людьми',{sociability:.30}),
  'social.reserved':entry('social.reserved','social','Замкнутый','Ценит личное пространство',{sociability:-.30}),
  'approach.creative':entry('approach.creative','approach','Творческий','Любит воображать и экспериментировать',{creativity:.30}),
  'approach.pragmatic':entry('approach.pragmatic','approach','Практичный','Ценит понятный результат',{practicality:.30}),
  'values.empathetic':entry('values.empathetic','values','Чуткий','Учитывает переживания других',{empathy:.30}),
  'values.independent':entry('values.independent','values','Независимый','Предпочитает принимать решения сам',{independence:.30}),
  "novelty.curious":entry("novelty.curious","novelty","Любознательный","При наличии удачного знакомого решения на работе охотнее пробует другое.",{}),
  "novelty.familiar":entry("novelty.familiar","novelty","Приверженец привычного","На работе предпочитает уже успешно испытанные решения.",{}),
  "motivation.ambitious":entry("motivation.ambitious","motivation.ambitious","Амбициозный","При хорошем запасе сил стремится к более заметным рабочим результатам.",{}),
  "motivation.balanced":entry("motivation.balanced","motivation.balanced","Ценит равновесие","При умеренной усталости выбирает более щадящий успешный рабочий подход.",{}),
  "pace.patient":entry("pace.patient","pace","Терпеливый","В некоторых рабочих ситуациях предпочитает обстоятельный подход.",{}),
  "pace.impatient":entry("pace.impatient","pace","Нетерпеливый","В некоторых рабочих ситуациях предпочитает прямой и быстрый подход.",{}),
  "communication.diplomatic":entry("communication.diplomatic","communication.diplomatic","Дипломатичный","Лучше откликается на примирительные и деликатные реплики.",{}),
  "communication.direct":entry("communication.direct","communication.direct","Прямолинейный","Ценит ясные объяснения и откровенные разговоры.",{}),
  "tone.playful":entry("tone.playful","tone","Игривый","Лучше откликается на добрые шутки и лёгкую беседу.",{}),
  "tone.serious":entry("tone.serious","tone","Серьёзный","Ценит содержательные разговоры о взглядах и деньгах.",{})
});
/** Explicit symmetric exclusions, including all historical same-facet pairs. */
export const TRAIT_CONFLICTS=Object.freeze([["temperament.cheerful","temperament.melancholic"],["temperament.cheerful","temperament.calm"],["temperament.cheerful","temperament.hotheaded"],["temperament.melancholic","temperament.calm"],["temperament.melancholic","temperament.hotheaded"],["temperament.calm","temperament.hotheaded"],["habits.neat","habits.untidy"],["coordination.clumsy","coordination.agile"],["social.outgoing","social.reserved"],["approach.creative","approach.pragmatic"],["values.empathetic","values.independent"],["novelty.curious","novelty.familiar"],["pace.patient","pace.impatient"],["tone.playful","tone.serious"]].map(Object.freeze));
export function traitsConflict(a,b,catalog=TRAIT_CATALOG){
  const x=getTrait(a,catalog),y=getTrait(b,catalog);
  return !!(x&&y&&a!==b&&(TRAIT_CONFLICTS.some(([p,q])=>(a===p&&b===q)||(a===q&&b===p))||x.facet===y.facet));
}
export const AXES=Object.freeze([
  'optimism','emotionalReactivity','resilience','organization','coordination',
  'sociability','creativity','practicality','empathy','independence'
]);
export const PREFERENCE_CATALOG=Object.freeze({
  books:'Книги',drawing:'Рисование',music:'Музыка',games:'Игры',
  calm_leisure:'Тихий досуг',socializing:'Общение',cooking:'Готовка',parties:'Вечеринки',
  gardening:'Садоводство'
});
export const PROFILE_RULES=Object.freeze({minTraits:2,maxTraits:3,schema:1});
export const DEMO_PROFILES=Object.freeze({
  first:Object.freeze({schema:1,traitIds:Object.freeze(['temperament.melancholic','habits.neat']),
    preferences:Object.freeze({likes:Object.freeze(['books','calm_leisure']),dislikes:Object.freeze(['parties'])})}),
  second:Object.freeze({schema:1,traitIds:Object.freeze(['temperament.cheerful','coordination.clumsy','social.outgoing']),
    preferences:Object.freeze({likes:Object.freeze(['music','socializing']),dislikes:Object.freeze(['calm_leisure'])})})
});
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function listTraits(catalog=TRAIT_CATALOG){
  return Object.values(catalog);
}
export function getTrait(id,catalog=TRAIT_CATALOG){
  return typeof id==='string'&&Object.hasOwn(catalog,id)?catalog[id]:null;
}
export function validateSelection(ids,{catalog=TRAIT_CATALOG,min=PROFILE_RULES.minTraits,max=PROFILE_RULES.maxTraits}={}){
  if(!Array.isArray(ids)||ids.length<min||ids.length>max)return {valid:false,error:'trait_count'};
  const seen=new Set();
  for(const id of ids){
    const def=getTrait(id,catalog);
    if(!def)return {valid:false,error:'unknown_trait'};
    if(seen.has(id))return {valid:false,error:'duplicate_trait'};
    if([...seen].some(other=>traitsConflict(other,id,catalog)))return {valid:false,error:'facet_conflict'};
    seen.add(id);
  }
  return {valid:true,error:null};
}
export function validatePreferences(raw){
  if(!isRecord(raw)||!Array.isArray(raw.likes)||!Array.isArray(raw.dislikes)||
    raw.likes.length>12||raw.dislikes.length>12)return {valid:false,error:'preference_shape'};
  const seen=new Set();
  for(const tag of [...raw.likes,...raw.dislikes]){
    if(typeof tag!=='string'||!Object.hasOwn(PREFERENCE_CATALOG,tag))return {valid:false,error:'unknown_preference'};
    if(seen.has(tag))return {valid:false,error:'duplicate_preference'};
    seen.add(tag);
  }
  return {valid:true,error:null};
}
export function createProfile(traitIds,preferences={likes:[],dislikes:[]}){
  const selection=validateSelection(traitIds),tastes=validatePreferences(preferences);
  if(!selection.valid||!tastes.valid)throw new RangeError('Invalid personality: '+(selection.error||tastes.error));
  return {schema:PROFILE_RULES.schema,traitIds:[...traitIds],
    preferences:{likes:[...preferences.likes],dislikes:[...preferences.dislikes]}};
}
/** Invalid legacy data falls back without mutating persisted objects. */
export function restoreProfile(raw,fallback=DEMO_PROFILES.first){
  const source=isRecord(raw)&&raw.schema===PROFILE_RULES.schema&&
    validateSelection(raw.traitIds).valid&&validatePreferences(raw.preferences).valid?raw:fallback;
  return createProfile(source.traitIds,source.preferences);
}
/** Axes are derived, not stored. Sort for deterministic arithmetic on any order. */
export function deriveAxes(profile){
  const axes=Object.fromEntries(AXES.map(axis=>[axis,.5]));
  if(!isRecord(profile)||!Array.isArray(profile.traitIds))return axes;
  for(const id of [...profile.traitIds].sort()){
    const def=getTrait(id);
    if(!def)continue;
    for(const [axis,delta] of Object.entries(def.axisDeltas)){
      if(Object.hasOwn(axes,axis)&&Number.isFinite(delta))axes[axis]=clamp(axes[axis]+delta,0,1);
    }
  }
  return axes;
}
export function preferenceAffinity(profile,tag){
  const prefs=profile?.preferences;
  if(!Object.hasOwn(PREFERENCE_CATALOG,tag))return 0;
  if(Array.isArray(prefs?.likes)&&prefs.likes.includes(tag))return 1;
  if(Array.isArray(prefs?.dislikes)&&prefs.dislikes.includes(tag))return -1;
  return 0;
}
export function traitLabels(profile){
  return (Array.isArray(profile?.traitIds)?profile.traitIds:[])
    .map(id=>getTrait(id)?.label).filter(Boolean);
}
export function interestLabels(profile,kind='likes'){
  return (Array.isArray(profile?.preferences?.[kind])?profile.preferences[kind]:[])
    .map(id=>PREFERENCE_CATALOG[id]).filter(Boolean);
}
