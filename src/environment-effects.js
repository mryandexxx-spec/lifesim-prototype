/** M5 — actual furnishing comfort, never a seventh need or a fake event.
 * Pure calculations from resident position and CURRENT F0 furniture layout.
 * On old headless callers the original room furniture is the layout fallback.
 * No DOM, PlayCanvas, storage, random weather, cleanliness, or TV noise.
 */
import {FURNITURE,ROOM} from './navigation.js';
import {furnitureObstacles} from './furniture-catalog.js';
import {deriveAxes} from './trait-catalog.js';

export const ENVIRONMENT_MOOD_LIMIT=5;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const validRect=o=>o&&typeof o.id==='string'&&
  ['bed','sofa','plant','fridge','shower','toilet','table','counter','tv','nightstand'].includes(o.id)&&
  ['minX','maxX','minZ','maxZ'].every(k=>Number.isFinite(o[k]))&&
  o.minX<=o.maxX&&o.minZ<=o.maxZ;
const distance=(p,r)=>Math.hypot(Math.max(r.minX-p.x,0,p.x-r.maxX),
  Math.max(r.minZ-p.z,0,p.z-r.maxZ));
/** Zero past 1.65m, continuous within. No flicker at boundary. */
const proximity=d=>{const t=clamp((1.65-d)/1.65,0,1);return t*t*(3-2*t);};
const TYPES=Object.freeze({
  plant:Object.freeze({title:'Приятно рядом с растением',
    detail:'В комнате действительно есть растение поблизости',symbol:'❀'}),
  sofa:Object.freeze({title:'Уютно возле дивана',
    detail:'Рядом находится место для отдыха',symbol:'♫'}),
  bed:Object.freeze({title:'Спокойно рядом с кроватью',
    detail:'Поблизости находится кровать',symbol:'☾'}),
  cramped:Object.freeze({title:'Тесно среди мебели',
    detail:'Вокруг мало свободного пространства',symbol:'▦'})
});
function currentObstacles(world){
  if(world===null||world===undefined)return FURNITURE;
  const data=world?.furniture?.instances?world.furniture:world;
  if(!Array.isArray(data?.instances))return []; // unknown != original room
  return furnitureObstacles(data);
}
/** Adds at most +/-5 points to the ONE canonical mood calculation.
 * Only nearest real instance of each ambient source counts, so duplicates
 * of decorative furniture cannot mint unlimited comfort.
 * Pass root.world for either resident; future F1 moves immediately follow
 * from the same committed furniture instances, including storage removal.
 */
export function environmentSnapshot(resident,world=resident?.world??null){
  const p=resident?.position;
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||
    p.x<ROOM.minX||p.x>ROOM.maxX||p.z<ROOM.minZ||p.z>ROOM.maxZ)
    return {delta:0,causes:[]};
  const objects=currentObstacles(world).filter(validRect);
  const axes=deriveAxes(resident?.personality);
  const modifiers={
    plant:2.7*(.8+.4*axes.creativity),
    sofa:2.5*(.8+.4*axes.optimism),
    bed:1.9*(.8+.4*axes.resilience)
  };
  const scores=[];
  for(const id of ['plant','sofa','bed']){
    let closest=Infinity;
    for(const object of objects)if(object.id===id)
      closest=Math.min(closest,distance(p,object));
    const delta=modifiers[id]*proximity(closest);
    if(delta>=.6)scores.push({id,delta,...TYPES[id]});
  }
  const crowd=new Set();
  for(const object of objects)if(object.id!=='plant'&&distance(p,object)<.95)
    crowd.add(object.instanceId||object.id);
  if(crowd.size>=3)scores.push({id:'cramped',
    delta:-Math.min(4,(crowd.size-2)*1.6),...TYPES.cramped});
  scores.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  const delta=clamp(Math.round(scores.reduce((total,c)=>total+c.delta,0)*100)/100,
    -ENVIRONMENT_MOOD_LIMIT,ENVIRONMENT_MOOD_LIMIT);
  return {delta,causes:scores.slice(0,3).map(c=>({...c,
    delta:Math.round(c.delta*100)/100}))};
}
