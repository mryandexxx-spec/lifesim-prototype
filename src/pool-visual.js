/** LOT-D1c: renderer-only hollow pool. Authoritative tiles and fixtures live in root-v1.
 * At most five batched mesh groups, rebuilt only after an approved edit/reload.
 */
import {POOL_GRID_WIDTH,POOL_GRID_HEIGHT,poolCellBounds} from './pool-topology.js';

const GROUND_Y=-.53, WATER_Y=-.475, FLOOR_Y=GROUND_Y-1.2;
const group=()=>({vertices:[],normals:[],indices:[]});
const quad=(g,points,normal)=>{
  const base=g.vertices.length/3;
  for(const p of points){g.vertices.push(...p);g.normals.push(...normal);}
  g.indices.push(base,base+2,base+1,base,base+3,base+2);
};
const horizontal=(g,x0,x1,z0,z1,y)=>quad(g,[
  [x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]],[0,1,0]);
const validCells=outdoors=>new Set((outdoors?.pools||[]).flatMap(p=>
  Array.isArray(p.cells)?p.cells.filter(c=>poolCellBounds(c)):[]));

export function buildPoolVisualGeometry(outdoors){
  const wet=validCells(outdoors),output={
    lawn:group(),water:group(),floor:group(),walls:group(),rim:group()};
  if(!wet.size)return {active:false,groups:output,waterCells:0,boundaryEdges:0};
  // When a basin exists, replace the single solid lawn box with a lawn mesh
  // missing the excavated tiles: no buried green platform beneath the water.
  for(let cell=0;cell<POOL_GRID_WIDTH*POOL_GRID_HEIGHT;cell++){
    const b=poolCellBounds(cell);
    if(!wet.has(cell))horizontal(output.lawn,b.minX,b.maxX,b.minZ,b.maxZ,GROUND_Y);
  }
  let boundaryEdges=0;
  for(const cell of wet){
    const b=poolCellBounds(cell);
    horizontal(output.water,b.minX,b.maxX,b.minZ,b.maxZ,WATER_Y);
    horizontal(output.floor,b.minX,b.maxX,b.minZ,b.maxZ,FLOOR_Y);
    const row=Math.floor(cell/POOL_GRID_WIDTH),col=cell%POOL_GRID_WIDTH;
    const sides=[
      ['west',col>0?cell-1:-1],
      ['east',col<POOL_GRID_WIDTH-1?cell+1:-1],
      ['north',row>0?cell-POOL_GRID_WIDTH:-1],
      ['south',row<POOL_GRID_HEIGHT-1?cell+POOL_GRID_WIDTH:-1]
    ];
    for(const [side,next] of sides){
      if(wet.has(next))continue;
      boundaryEdges++;
      let lower,upper;
      if(side==='west'||side==='east'){
        const x=side==='west'?b.minX:b.maxX;
        lower=[[x,FLOOR_Y,b.minZ],[x,FLOOR_Y,b.maxZ]];
        upper=[[x,GROUND_Y,b.minZ],[x,GROUND_Y,b.maxZ]];
        horizontal(output.rim,x-.057,x+.057,b.minZ,b.maxZ,GROUND_Y+.013);
      }else{
        const z=side==='north'?b.minZ:b.maxZ;
        lower=[[b.minX,FLOOR_Y,z],[b.maxX,FLOOR_Y,z]];
        upper=[[b.minX,GROUND_Y,z],[b.maxX,GROUND_Y,z]];
        horizontal(output.rim,b.minX,b.maxX,z-.057,z+.057,GROUND_Y+.013);
      }
      quad(output.walls,[lower[0],lower[1],upper[1],upper[0]],[0,0,1]);
    }
  }
  return {active:true,groups:output,waterCells:wet.size,boundaryEdges};
}

const vectors={
  west:{x:-1,z:0},east:{x:1,z:0},
  north:{x:0,z:-1},south:{x:0,z:1}
};
export function poolFixtureVisualPose(fixture){
  const b=poolCellBounds(fixture?.edgeCell),out=vectors[fixture?.side];
  if(!b||!out)return null;
  return {x:(b.minX+b.maxX)/2+out.x*.25,
    z:(b.minZ+b.maxZ)/2+out.z*.25,
    dx:-out.x,dz:-out.z,tx:out.z,tz:-out.x};
}

export function createPoolVisual({pc,app,mat,box,lotGround}){
  const material={
    lawn:mat('#8fb78b'),water:mat('#48aec7',{opacity:.74}),
    floor:mat('#b8e3df'),walls:mat('#6eaeb2'),rim:mat('#e4d4c0'),
    steel:mat('#a6bfcb'),stone:mat('#d1d6cf'),board:mat('#e6d0a5')
  };
  // Winding is renderer-independent; use double-sided authored surfaces.
  for(const m of Object.values(material)){m.cull=pc.CULLFACE_NONE;m.update();}
  const nodes=[],meshes=[];
  let signature=null;
  const clear=()=>{
    for(const n of nodes.splice(0))n.destroy();
    for(const mesh of meshes.splice(0))mesh.destroy();
  };
  const fixtureBox=(name,x,y,z,sx,sy,sz,m)=>{
    const node=box(name,x,y,z,sx,sy,sz,m);
    nodes.push(node);
    return node;
  };
  const fixtureVisual=f=>{
    const p=poolFixtureVisualPose(f);
    if(!p)return;
    const at=(along,inward,height)=>({
      x:p.x+p.tx*along+p.dx*inward,
      z:p.z+p.tz*along+p.dz*inward,y:GROUND_Y+height});
    const add=(label,along,inward,height,sx,sy,sz,color)=>{
      const v=at(along,inward,height);
      return fixtureBox('LOT-D1c '+f.fixtureId+' '+label,v.x,v.y,v.z,
        sx,sy,sz,material[color]);
    };
    const widthAxisX=Math.abs(p.tx)>.5;
    const bar=(label,along,inward,height,width,thickness,color)=>
      add(label,along,inward,height,
        widthAxisX?width:thickness,thickness,widthAxisX?thickness:width,color);
    if(f.kind==='ladder'){
      for(const side of [-.18,.18]){
        add('rail',side,0,.30,.065,.72,.065,'steel');
        add('handle',side,.12,.68,.075,.14,.075,'steel');
      }
      for(let i=0;i<4;i++)bar('rung',0,.02,-.02+i*.15,.38,.055,'steel');
    }else if(f.kind==='steps'){
      for(let i=0;i<3;i++)
        bar('entry step',0,.12+i*.18,-.22+i*.115,.46,.14,'stone');
    }else if(f.kind==='board'){
      add('board pillar',0,-.20,.23,.22,.55,.22,'stone');
      bar('low launch board',0,.14,.55,.52,.085,'board');
      bar('board lip',0,.46,.55,.52,.055,'steel');
    }
  };
  return {
    sync(outdoors,force=false){
      const key=JSON.stringify({
        pools:outdoors?.pools||[],fixtures:outdoors?.poolFixtures||[]});
      if(!force&&signature===key)return;
      signature=key;
      clear();
      const geometry=buildPoolVisualGeometry(outdoors);
      lotGround.enabled=!geometry.active;
      if(!geometry.active)return;
      for(const [kind,data] of Object.entries(geometry.groups)){
        if(!data.indices.length)continue;
        const mesh=new pc.Mesh(app.graphicsDevice);
        mesh.setPositions(data.vertices);mesh.setNormals(data.normals);
        mesh.setIndices(data.indices);mesh.update();
        const node=new pc.Entity('LOT-D1c pool '+kind);
        node.addComponent('render',{meshInstances:[
          new pc.MeshInstance(mesh,material[kind])]});
        app.root.addChild(node);nodes.push(node);meshes.push(mesh);
      }
      for(const fixture of outdoors?.poolFixtures||[])fixtureVisual(fixture);
    },
    dispose(){clear();signature=null;lotGround.enabled=true;},
    stats:()=>({nodeCount:nodes.length,meshCount:meshes.length,
      hasPool:!lotGround.enabled})
  };
}
