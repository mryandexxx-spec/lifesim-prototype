/** F4C — read-only sketches directly projected from the SAME sculpting data as
 * the 3D model. SVG output is UI-only and cannot affect world/save/geometry.
 * Draw commands contain validated colors and finite bounded coordinates.
 */
import {proceduralFurnitureModel} from './furniture-procedural-library.js';
const P=(name,x,y,z,sx,sy,sz,color,kind='box')=>({
  name,kind,x,y,z,sx,sy,sz,color,rotation:null
});
const cream='#dfd4c1',wood='#977a5c',salmon='#c59281',green='#70a68a';
const base={
  sofa:[P('sofa seat',0,.55,0,2.26,.38,1.04,salmon),
    P('sofa back',0,1.0,.47,2.24,.76,.22,wood),
    ...[-1.10,1.10].map(x=>P('sofa arm',x,.78,0,.22,.40,1.04,wood))],
  bed:[P('bed frame',0,.25,0,2.31,.33,2.34,wood),
    P('mattress',0,.53,0,2.12,.21,2.14,cream),
    P('bed headboard',0,.89,-1.12,2.35,.85,.18,wood)],
  plant:[P('plant pot',0,.3,0,.54,.55,.53,wood,'cylinder'),
    P('plant stem',0,.78,0,.10,.80,.10,wood,'cylinder'),
    P('leaf crown',0,1.26,0,.82,.90,.82,green,'sphere')],
  table:[P('coffee table top',0,.39,0,1.45,.14,.72,wood),
    ...[-.57,.57].flatMap(x=>[-.24,.24].map(z=>
      P('table leg',x,.18,z,.08,.35,.08,wood)))],
  nightstand:[P('side table',0,.41,0,.65,.69,.63,wood),
    P('lamp base',0,.81,0,.19,.10,.19,cream,'cylinder'),
    P('lamp shade',0,1.17,0,.39,.24,.38,salmon,'cylinder')],
  tv:[P('tv console',0,.35,0,1.3,.55,.67,wood),
    P('tv screen',0,1.19,0,1.32,.91,.10,'#53615c')],
  music:[P('music cabinet',0,.60,0,.92,1.04,.50,wood),
    P('music face',0,.65,.258,.84,.87,.025,'#405b56'),
    P('music display',0,.93,.279,.38,.18,.035,green),
    P('music dial',0,.72,.286,.12,.12,.035,cream),
    ...[-.24,.24].map(x=>P('speaker '+x,x,.49,.285,.26,.37,.04,salmon)),
    P('music shelf',0,.08,0,.97,.13,.55,cream)],
  bookcase:[P('bookcase back',0,1.04,0,1.04,1.98,.16,wood),
    P('bookcase left side',-.48,1.03,0,.08,1.95,.53,cream),
    P('bookcase right side',.48,1.03,0,.08,1.95,.53,cream),
    ...[.45,.98,1.51].map(y=>P('shelf',0,y,0,1.01,.07,.48,cream))]
};
const isColor=x=>typeof x==='string'&&/^#[0-9a-f]{6}$/.test(x);
const rounding=x=>Math.round(x*100)/100;
function point(x,y,z){
  return [rounding(46+(x-z)*15),rounding(63+(x+z)*5-y*20)];
}
function face(points,fill){return Object.freeze({points:Object.freeze(points.map(
  p=>Object.freeze(p))),fill});}
function shade(hex,amount){
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  return '#'+[r,g,b].map(v=>Math.round(Math.min(255,Math.max(0,v*amount)))
    .toString(16).padStart(2,'0')).join('');
}
export function sketchFurnitureParts(prefabId,modelKey){
  const recipe=proceduralFurnitureModel(modelKey);
  const baseline=base[prefabId]||[];
  const hide=new Set(recipe?.hideBase||[]);
  const filtered=baseline.filter(p=>!hide.has(p.name));
  return Object.freeze([...filtered,...(recipe?.parts||[])].slice(0,48));
}
export function furnitureThumbnailFaces(prefabId,modelKey){
  const parts=sketchFurnitureParts(prefabId,modelKey)
    .filter(p=>isColor(p.color)&&[p.x,p.y,p.z,p.sx,p.sy,p.sz].every(Number.isFinite))
    .sort((a,b)=>(a.x+a.z)-(b.x+b.z));
  const faces=[];
  for(const p of parts){
    const xl=p.x-p.sx/2,xr=p.x+p.sx/2,zf=p.z-p.sz/2,zb=p.z+p.sz/2;
    const bottom=p.y-p.sy/2,top=p.y+p.sy/2;
    if(p.kind==='sphere'){
      const x=point(p.x,top,p.z),rx=rounding((p.sx+p.sz)*8),ry=rounding(p.sy*9);
      // Ellipse supports the same face type and is drawn as an ellipse in SVG.
      faces.push(Object.freeze({kind:'ellipse',x:x[0],y:x[1]+ry,
        rx:Math.max(1,rx),ry:Math.max(1,ry),fill:p.color}));
    }else{
      faces.push(face([point(xl,top,zf),point(xr,top,zf),
        point(xr,top,zb),point(xl,top,zb)],p.color));
      faces.push(face([point(xl,bottom,zf),point(xr,bottom,zf),
        point(xr,top,zf),point(xl,top,zf)],shade(p.color,.80)));
      faces.push(face([point(xr,bottom,zf),point(xr,bottom,zb),
        point(xr,top,zb),point(xr,top,zf)],shade(p.color,.68)));
    }
  }
  return Object.freeze(faces);
}
