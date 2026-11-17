/** F5-C.2 · Authoritative, rendering-free exterior profiles. */
export const BUILD_WALL_HEIGHTS=Object.freeze({
  low:Object.freeze({label:'Низкие · 2,6 м',value:2.6}),
  normal:Object.freeze({label:'Обычные · 2,9 м',value:2.9}),
  tall:Object.freeze({label:'Высокие · 3,4 м',value:3.4})
});
export const BUILD_FACADE_FINISHES=Object.freeze({
  'facade.default':Object.freeze({label:'Без облицовки',color:'#f1ebdf'}),
  'facade.stucco':Object.freeze({label:'Штукатурка',color:'#e9d8bb'}),
  'facade.brick':Object.freeze({label:'Красный кирпич',color:'#b8745c',pattern:'brick'}),
  'facade.stone':Object.freeze({label:'Светлый камень',color:'#aeb8b2',pattern:'stone'}),
  'facade.timber':Object.freeze({label:'Деревянный фасад',color:'#ad8965',pattern:'timber'}),
  'facade.clapboard':Object.freeze({label:'Горизонтальная обшивка',color:'#b4c6b8',pattern:'clapboard'})
});
export const BUILD_PORCH_FINISHES=Object.freeze({
  'porch.stone':Object.freeze({label:'Каменное крыльцо',color:'#b9b9b0'}),
  'porch.wood':Object.freeze({label:'Деревянное крыльцо',color:'#b18b67'}),
  'porch.brick':Object.freeze({label:'Кирпичное крыльцо',color:'#a87963'})
});
const floorsFor=world=>new Set(world.floorCells||[]);
const edgeKey=w=>w.axis+':'+w.i+','+w.j;
const occupied=(floors,i,j)=>floors.has(i+','+j);
const outsideDirection=(w,floors)=>{
  const a=w.axis==='v'?occupied(floors,w.i-1,w.j):occupied(floors,w.i,w.j-1),
    b=occupied(floors,w.i,w.j);
  return a===b?null:a?1:-1;
};
/** Only true external segments; old south/east cutaway stays a facade VISUAL,
 * not a new path barrier, until that side is explicitly constructed. */
export function exteriorWallSegments(world,segments){
  const floors=floorsFor(world),solid=new Set(world.starterSolidSides||[]);
  const dedup=new Map(),structural=new Set((world.wallEdges||[]).map(edgeKey));
  for(const w of segments){
    const actual=edgeKey(w);
    if(w.starterSide==='east'||w.starterSide==='south'){
      if(!solid.has(w.starterSide)&&!structural.has(actual))continue;
    }
    const outside=outsideDirection(w,floors);
    if(outside===null||dedup.has(actual))continue;
    dedup.set(actual,{...w,outward:outside,
      materialKey:w.starterSide?w.id:w.id});
  }
  return [...dedup.values()];
}
export function porchFootprint(world,opening,segments,depthSections=3){
  if(!opening||opening.type!=='door'||![2,3,4].includes(depthSections))return null;
  const all=new Map(segments.map(w=>[w.id,w]));
  const parts=opening.edgeIds.map(id=>all.get(id));
  if(!parts.length||parts.some(w=>!w)||new Set(parts.map(w=>w.axis)).size!==1)return null;
  const axis=parts[0].axis,position=axis==='h'?parts[0].j:parts[0].i;
  if(parts.some(w=>(axis==='h'?w.j:w.i)!==position))return null;
  const floors=floorsFor(world);
  const dirs=parts.map(w=>outsideDirection(w,floors));
  const dir=dirs[0];
  if(dir===null||dirs.some(x=>x!==dir))return null;
  const indexes=parts.map(w=>axis==='h'?w.i:w.j);
  const lo=Math.min(...indexes)-1,hi=Math.max(...indexes)+2;
  const rect=axis==='h'
    ?{i0:lo,i1:hi,j0:dir===1?position:position-depthSections,
      j1:dir===1?position+depthSections:position}
    :{i0:dir===1?position:position-depthSections,
      i1:dir===1?position+depthSections:position,j0:lo,j1:hi};
  if(rect.i0< -18||rect.i1>46||rect.j0< -24||rect.j1>24)return null;
  const cells=[];
  for(let i=rect.i0;i<rect.i1;i++)for(let j=rect.j0;j<rect.j1;j++){
    if(occupied(floors,i,j))return null;
    cells.push(i+','+j);
  }
  return {...rect,axis,outward:dir,cells,depthSections,doorId:opening.id};
}
export function porchFootprints(world,segments){
  const byId=new Map((world.openings||[]).map(o=>[o.id,o]));
  return (world.porches||[]).map(p=>({
    ...p,footprint:porchFootprint(world,byId.get(p.openingId),segments,p.depthSections)
  }));
}
