/** F4C — original data-only procedural furniture sculpting catalog.
 * Model identity is NOT SKU identity, geometry/prefab ID or gameplay effects.
 * Later a Meshy GLB can replace ONE modelKey without touching purchases,
 * household v1 saves, A* footprints or action/animation adapters.
 * Every piece is local to its saved object instance. No DOM/PlayCanvas here.
 */
const piece=(kind,name,x,y,z,sx,sy,sz,color,rotation=null)=>
  {kind,name,x,y,z,sx,sy,sz,color,rotation};
const b=(...args)=>piece('box',...args);
const c=(...args)=>piece('cylinder',...args);
const s=(...args)=>piece('sphere',...args);
const leg=(x,z,y=.26,h=.50,color='#655e55')=>b('leg '+x+','+z,x,y,z,.095,h,.095,color);
const palette=Object.freeze({
  oak:'#b58a6b',birch:'#e0c2a0',walnut:'#775746',ink:'#3e4c4b',
  sage:'#8ca997',cream:'#e6dfcb',terracotta:'#c58d75',blue:'#90a6b0',
  coral:'#d7ac99',brass:'#c9b07e',glass:'#b6d9d8',olive:'#617b55',
  chalk:'#f3eee0',rust:'#a96853'
});
const p=palette;
const schemes={
  'sofa.tufted':{
    parts:[b('tall tufted pillow a',-.75,.92,.46,.75,.60,.18,p.sage),
      b('tall tufted pillow b',0,.92,.46,.75,.60,.18,p.cream),
      b('tall tufted pillow c',.75,.92,.46,.75,.60,.18,p.sage),
      ...[-.75,0,.75].map((x,i)=>s('tuft '+i,x,1.02,.351,.11,.11,.06,p.brass)),
      ...[-1.1,1.1].map(x=>leg(x,.43,.12,.22,p.walnut))]},
  'sofa.loft':{
    parts:[b('low contrasting bar',0,.83,.48,2.22,.18,.17,p.ink),
      b('straight back overlay',0,1.09,.51,2.23,.48,.08,p.blue),
      ...[-1.08,1.08].map(x=>b('outer open arm '+x,x,.77,0,.11,.28,1.12,p.walnut)),
      ...[-.93,.93].flatMap(x=>[-.46,.46].map(z=>leg(x,z,.14,.28,p.ink))),
      b('loft long cushion',0,.66,-.12,2.08,.07,.68,p.cream)]},
  'sofa.classic':{
    parts:[...[-.8,0,.8].map(x=>s('arched back '+x,x,1.20,.47,.83,.73,.35,p.coral)),
      ...[-1.12,1.12].map(x=>c('rolled arm '+x,x,.81,-.05,.27,1.10,.27,p.walnut,[90,0,0])),
      ...[-.9,.9].flatMap(x=>[-.42,.42].map(z=>leg(x,z,.16,.32,p.walnut))),
      b('classic front apron',0,.38,-.59,2.12,.12,.08,p.walnut)]},
  'bed.platform':{
    parts:[b('wide lower platform',0,.18,0,2.43,.24,2.58,p.walnut),
      b('plank headboard',0,.99,-1.20,2.44,.82,.11,p.oak),
      ...[-.9,-.45,0,.45,.9].map(x=>b('headboard slat '+x,x,1.10,-1.135,.09,.53,.04,p.birch))]},
  'bed.canopy':{
    parts:[...[-1.10,1.10].flatMap(x=>[-1.14,1.14].map(z=>
      b('canopy post '+x+','+z,x,1.25,z,.10,2.50,.10,p.walnut))),
      ...[-1.14,1.14].map(z=>b('canopy crown crossbar '+z,0,2.48,z,2.29,.09,.09,p.oak)),
      ...[-1.10,1.10].map(x=>b('canopy crown long '+x,x,2.48,0,.09,.09,2.35,p.oak))]},
  'table.round':{hideBase:['coffee table top','table leg'],
    parts:[c('round low tabletop',0,.42,0,1.36,.13,1.26,p.birch),
      c('round pedestal',0,.22,0,.19,.34,.19,p.ink),
      c('round pedestal base',0,.065,0,.81,.08,.72,p.walnut)]},
  'bookcase.open':{hideBase:['bookcase back','bookcase left side','bookcase right side'],
    parts:[...[-.49,.49].map(x=>b('open rail '+x,x,1.04,0,.07,2.03,.50,p.ink)),
      ...[.37,.89,1.42,1.89].map(y=>b('open shelf '+y,0,y,0,.98,.055,.49,p.oak)),
      b('open divider left',-.20,.77,0,.065,.93,.48,p.brass),
      b('open divider right',.20,1.54,0,.065,.83,.48,p.brass)]},
  'plant.amber':{hideBase:['leaf crown','plant leaf','plant stem'],
    parts:[c('amber sculptured stem',0,.78,0,.11,.90,.11,p.walnut),
      ...[[-.23,1.10,-.06],[.30,1.25,.03],[-.08,1.50,.18],
        [.18,1.66,-.11],[-.34,1.35,.21]].map(([x,y,z],i)=>
        s('amber plume '+i,x,y,z,.48,.42,.36,i%2?p.brass:p.rust))]},
  'plant.palm':{hideBase:['leaf crown','plant leaf','plant stem'],
    parts:[c('tall palm trunk',0,.98,0,.11,1.45,.11,p.walnut),
      ...[[-.36,1.67,-.10],[.36,1.76,-.04],[0,1.92,-.36],
        [.12,1.82,.37],[-.37,1.58,.26],[.30,1.58,-.29]]
        .map(([x,y,z],i)=>s('palm frond '+i,x,y,z,.72,.19,.35,
          i%2?p.olive:p.sage,[0,i*41,18]))]},
  'nightstand.open':{hideBase:['side table','lamp base','lamp stem','lamp shade'],
    parts:[b('open-top surface',0,.63,0,.66,.10,.65,p.birch),
      b('bottom surface',0,.19,0,.62,.075,.61,p.oak),
      ...[-.25,.25].flatMap(x=>[-.23,.23].map(z=>leg(x,z,.30,.56,p.ink))),
      b('rear rail',0,.43,.23,.53,.09,.06,p.oak)]},
  'armchair.wing':{parts:[
    b('high wing back',0,1.08,.32,1.0,1.12,.22,p.sage),
    b('soft seat',0,.51,-.08,.96,.27,.95,p.cream),
    ...[-.50,.50].map(x=>b('upper wing '+x,x,1.17,.21,.18,.89,.30,p.sage)),
    ...[-.51,.51].map(x=>b('arm '+x,x,.66,-.12,.16,.35,.90,p.walnut)),
    ...[-.36,.36].flatMap(x=>[-.34,.34].map(z=>leg(x,z,.17,.32,p.walnut))),
    s('wing back center',0,1.50,.26,.78,.31,.21,p.blue)]},
  'armchair.shell':{parts:[
    c('shell oval seat',0,.49,-.07,1.03,.25,.95,p.cream),
    s('shell curved back',0,.92,.30,1.16,.97,.39,p.coral),
    s('shell inset back',0,1.02,.14,.90,.70,.28,p.cream),
    c('shell pedestal',0,.23,0,.20,.43,.20,p.brass),
    c('shell round base',0,.055,0,.67,.11,.63,p.ink)]},
  'chair.loft':{parts:[
    b('steel chair seat',0,.55,-.04,.76,.13,.73,p.walnut),
    b('straight steel back',0,1.02,.29,.72,.79,.075,p.ink),
    ...[-.30,.30].flatMap(x=>[-.30,.30].map(z=>leg(x,z,.28,.53,p.ink)))]},
  'chair.cross':{parts:[
    b('cane chair seat',0,.55,-.04,.80,.12,.76,p.birch),
    ...[-.31,.31].flatMap(x=>[-.29,.29].map(z=>leg(x,z,.27,.53,p.walnut))),
    ...[-.32,.32].map(x=>b('chair back post '+x,x,1.05,.32,.085,1.05,.08,p.walnut)),
    b('chair cross one',0,1.14,.32,.095,.71,.08,p.walnut,[0,0,42]),
    b('chair cross two',0,1.14,.32,.095,.71,.08,p.walnut,[0,0,-42])]},
  'diningtable.farm':{parts:[
    b('farm plank top',0,.79,0,2.10,.14,1.25,p.oak),
    ...[-.89,.89].flatMap(x=>[-.47,.47].map(z=>b('table solid leg',x,.37,z,.14,.71,.14,p.walnut))),
    ...[-.87,.87].map(x=>b('farm low stretcher '+x,x,.29,0,.08,.08,.87,p.walnut)),
    b('farm end brace',0,.23,0,1.83,.09,.07,p.walnut)]},
  'diningtable.oval':{parts:[
    c('long oval dining top',0,.79,0,2.12,.13,1.25,p.birch),
    b('oval center pedestal',0,.42,0,.31,.68,.26,p.walnut),
    c('oval foot',0,.10,0,1.0,.13,.63,p.brass)]},
  'floorlamp.arc':{parts:[
    c('arc heavy foot',0,.08,0,.51,.15,.49,p.ink),
    c('arc tall stem',-.10,.82,0,.075,1.53,.075,p.brass),
    b('arc horizontal arm',.18,1.58,0,.66,.065,.07,p.brass,[0,0,-14]),
    c('arc hanging bell',.48,1.40,0,.40,.28,.40,p.cream),
    s('warm arc bulb',.48,1.23,0,.20,.14,.20,p.brass)]},
  'floorlamp.tripod':{parts:[
    ...[-.22,0,.22].map((x,i)=>b('tripod '+i,x,.78,i===1?.19:-.13,.07,1.52,.07,
      p.walnut,[i===1?12:-12,0,i===0?-11:i===2?11:0])),
    c('linen cone shade',0,1.61,0,.60,.45,.60,p.cream),
    c('shade trim',0,1.39,0,.62,.045,.61,p.walnut),
    s('tripod cap',0,1.82,0,.14,.10,.14,p.brass)]},
  'rug.geo':{parts:[
    b('woven rug foundation',0,.024,0,2.35,.03,1.70,p.cream),
    b('rug central field',0,.044,0,1.91,.015,1.29,p.sage),
    ...[-.72,0,.72].map(x=>b('rug geometric diamond '+x,x,.054,0,.34,.016,.34,
      p.ink,[0,45,0])),
    ...[-.55,.55].map(z=>b('rug border '+z,0,.053,z,2.10,.02,.055,p.brass))]},
  'rug.weave':{parts:[
    c('oval woven mat',0,.027,0,2.23,.035,1.61,p.terracotta),
    ...[-.65,-.37,-.09,.19,.47].map(z=>b('woven stripe '+z,0,.053,z,1.75,.012,.08,
      p.cream)),
    ...[-.90,-.65,-.4,-.15,.1,.35,.6,.85].flatMap(x=>[-.76,.76].map(z=>
      b('braided fringe '+x+','+z,x,.030,z,.055,.026,.14,p.birch))]},
  'dresser.reed':{parts:[
    b('dresser walnut case',0,.60,0,1.70,.96,.77,p.walnut),
    ...[.31,.62,.92].map((y,i)=>[
      b('dresser drawer '+i,0,y,-.405,1.55,.24,.045,p.birch),
      b('drawer pull '+i,0,y,-.44,.30,.035,.045,p.brass)]).flat(),
    ...[-.69,.69].map(x=>leg(x,.22,.08,.16,p.ink))]},
  'dresser.arch':{parts:[
    b('arched chest body',0,.57,0,1.72,.98,.78,p.oak),
    ...[-.41,.41].map(x=>b('arched door '+x,x,.56,-.413,.73,.70,.06,p.cream)),
    ...[-.41,.41].map(x=>c('arched door arch '+x,x,.92,-.425,.75,.06,.20,
      p.cream,[90,0,0])),
    ...[-.12,.12].map(x=>s('arched brass knob '+x,x,.58,-.48,.09,.09,.08,p.brass)),
    b('open toe shelf',0,.12,-.02,1.70,.07,.76,p.walnut)]},
  'mirror.oval':{parts:[
    c('mirror circular foot',0,.07,0,.64,.12,.44,p.walnut),
    c('mirror high stand',0,.72,.01,.07,1.29,.07,p.brass),
    s('oval mirror brass trim',0,1.39,.01,.78,1.32,.11,p.brass),
    s('oval reflection surface',0,1.39,-.067,.67,1.19,.035,p.glass)]},
  'mirror.panel':{parts:[
    b('panel mirror outer frame',0,1.09,0,.83,1.92,.13,p.walnut),
    b('panel mirror reflection',0,1.10,-.078,.69,1.75,.018,p.glass),
    ...[-.31,.31].map(x=>b('mirror leg '+x,x,.18,.04,.09,.33,.15,p.brass)),
    b('mirror inset top bar',0,2.03,-.01,.91,.075,.15,p.cream)]},
  'sculpture.balance':{parts:[
    c('balance foot',0,.15,0,.66,.29,.66,p.ink),
    b('balance leaning beam',0,.79,0,.16,1.03,.17,p.brass,[0,0,32]),
    s('balance left orb',-.20,1.18,.09,.51,.51,.49,p.coral),
    s('balance right orb',.21,.88,-.07,.27,.27,.26,p.blue)]},
  'sculpture.spire':{parts:[
    c('spire stone foot',0,.14,0,.63,.28,.63,p.cream),
    b('bronze sail one',-.12,.98,0,.11,1.34,.43,p.brass,[0,0,18]),
    b('bronze sail two',.16,.91,0,.10,1.15,.45,p.ink,[0,0,-24]),
    s('spire top',-.17,1.71,0,.20,.20,.18,p.brass)]},
  'wardrobe.classic':{parts:[
    b('wardrobe tall body',0,1.21,0,1.71,2.36,.85,p.walnut),
    ...[-.41,.41].map(x=>b('carved wardrobe door '+x,x,1.13,-.47,.77,1.97,.055,p.oak)),
    ...[-.11,.11].map(x=>b('long brass handle '+x,x,1.22,-.512,.055,.40,.05,p.brass)),
    b('ornamental top crown',0,2.45,0,1.90,.19,.94,p.birch),
    b('wardrobe plinth',0,.10,0,1.82,.16,.92,p.ink)]},
  'wardrobe.open':{parts:[
    ...[-.79,.79].map(x=>b('open wardrobe wall '+x,x,1.13,0,.085,2.18,.79,p.birch)),
    b('wardrobe top plank',0,2.21,0,1.66,.09,.85,p.oak),
    b('wardrobe bottom plank',0,.12,0,1.66,.10,.85,p.walnut),
    ...[.58,1.01,1.49].map(y=>b('folded shelf '+y,.36,y,0,.77,.07,.76,p.walnut)),
    b('clothes rod',-.40,1.85,-.06,.065,.07,.68,p.brass),
    ...[-.52,-.36,-.20].map((x,i)=>b('hanging garment '+i,x,1.48,-.05,.15,.52,.29,
      [p.sage,p.coral,p.blue][i])),
    ...[.70,1.13].map((y,i)=>b('folded basket '+i,.34,y,.0,.59,.24,.51,
      i?p.terracotta:p.cream))]}
};
const ALLOWED=new Set(['box','sphere','cylinder']);
const freeze=Object.fromEntries(Object.entries(schemes).map(([id,entry])=>{
  if(!/^[a-z][a-z0-9.-]+$/.test(id)||!Array.isArray(entry.parts)||entry.parts.length>48)
    throw new Error('Invalid procedural model '+id);
  const parts=entry.parts.map(part=>{
    if(!ALLOWED.has(part.kind)||typeof part.name!=='string'||
      ![part.x,part.y,part.z,part.sx,part.sy,part.sz].every(Number.isFinite)||
      Math.min(part.sx,part.sy,part.sz)<=0||Math.max(part.sx,part.sy,part.sz)>4||
      !/^#[0-9a-f]{6}$/.test(part.color))
      throw new Error('Unsafe model part in '+id);
    return Object.freeze({...part,rotation:part.rotation
      ?Object.freeze([...part.rotation]):null});
  });
  return [id,Object.freeze({modelKey:id,
    parts:Object.freeze(parts),
    hideBase:Object.freeze([...(entry.hideBase||[])])})];
}));
export const PROCEDURAL_FURNITURE_MODELS=Object.freeze(freeze);
export function proceduralFurnitureModel(modelKey){
  return typeof modelKey==='string'&&Object.hasOwn(PROCEDURAL_FURNITURE_MODELS,modelKey)
    ?PROCEDURAL_FURNITURE_MODELS[modelKey]:null;
}
/** Does not include paints/material values: measures genuinely distinct forms. */
export function proceduralGeometrySignature(modelKey){
  const m=proceduralFurnitureModel(modelKey);
  return m?JSON.stringify(m.parts.map(part=>[
    part.kind,part.x,part.y,part.z,part.sx,part.sy,part.sz,part.rotation
  ])):null;
}
