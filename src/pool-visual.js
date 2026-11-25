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
  // Greedy row strips: a full 64x48 garden must not allocate 3072 quads
  // whenever one tiny basin is added. Separate runs leave exact water holes.
  for(let row=0;row<POOL_GRID_HEIGHT;row++){
    let col=0;
    while(col<POOL_GRID_WIDTH){
      if(wet.has(row*POOL_GRID_WIDTH+col)){col++;continue;}
      const first=col;
      while(col<POOL_GRID_WIDTH&&!wet.has(row*POOL_GRID_WIDTH+col))col++;
      const a=poolCellBounds(row*POOL_GRID_WIDTH+first);
      const b=poolCellBounds(row*POOL_GRID_WIDTH+col-1);
      horizontal(output.lawn,a.minX,b.maxX,a.minZ,b.maxZ,GROUND_Y);
    }
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
      const inward={west:[1,0,0],east:[-1,0,0],
        north:[0,0,1],south:[0,0,-1]};
      quad(output.walls,[lower[0],lower[1],upper[1],upper[0]],inward[side]);
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

// Exact owner-approved OF-MASS/R2 native GLBs. glTF +Z enters the water.
export const OF_POOL_SOURCE='926416f7e79d37ee2969dd41732591e770a8d43a';
export const OF_POOL_ASSETS=Object.freeze({
  "ladder": {
    "file": "models/pool.ladder-new.glb",
    "sha256": "2e7ecddd47e746964eb2954df45285caccecf54afd37f43476b6530f2853af21",
    "bytes": 99088,
    "triangles": 2824,
    "boundsBlender": [
      [
        -0.23250000178813934,
        -0.18691934645175934,
        -0.8100000023841858
      ],
      [
        0.23250000178813934,
        0.15449999272823334,
        0.5442253947257996
      ]
    ],
    "materials": 2
  },
  "steps": {
    "file": "models/pool.steps-new.glb",
    "sha256": "392aa92e1263df840dc5a9b9e7f89c0e4b00c999c5aa182b83d6d32cecc6909c",
    "bytes": 61000,
    "triangles": 1296,
    "boundsBlender": [
      [
        -0.23499999940395355,
        -0.5929999947547913,
        -1.2000000476837158
      ],
      [
        0.23499999940395355,
        0.012999996542930603,
        -0.035999998450279236
      ]
    ],
    "materials": 2
  },
  "board": {
    "file": "models/pool.board-new.glb",
    "sha256": "04155960e172980fb8de491a713a5e08176c4665457d4cad5e4573b5a855b88c",
    "bytes": 47144,
    "triangles": 972,
    "boundsBlender": [
      [
        -0.23000000417232513,
        -0.597000002861023,
        0
      ],
      [
        0.23000000417232513,
        0.39500001072883606,
        0.4819999933242798
      ]
    ],
    "materials": 4
  }
});
export function createPoolFixtureModels({pc,app,enabled=true}){
  const cache=new Map(),records=new Map();let failures=0;
  function load(kind){
    if(!cache.has(kind)){
      const pending=new Promise((resolve,reject)=>{
        const asset=new pc.Asset('OF pool '+kind,'container',{url:'./assets/furniture/of-r2/pool.'+kind+'-new.glb'});
        app.assets.add(asset);asset.ready(()=>resolve(asset));asset.once('error',e=>reject(e||Error(kind)));app.assets.load(asset);
      });
      cache.set(kind,pending);pending.catch(()=>{});
    }
    return cache.get(kind);
  }
  function attach(root,kind){
    if(!enabled||!Object.hasOwn(OF_POOL_ASSETS,kind)||records.has(root))return false;
    const r={root,kind,fallback:root.findComponents('render').filter(c=>c.enabled),pivot:null};
    records.set(root,r);root.once('destroy',()=>records.delete(root));
    load(kind).then(asset=>{
      if(records.get(root)!==r||!root.parent)return;
      const pivot=asset.resource.instantiateRenderEntity();
      try{
        if(!pivot.findComponents('render').some(c=>c.meshInstances?.length))throw Error('empty pool fixture '+kind);
        pivot.name='OF pool '+kind;root.addChild(pivot);r.pivot=pivot;
        for(const c of r.fallback)c.enabled=false;
      }catch(e){pivot.destroy();throw e;}
    }).catch(e=>{if(records.get(root)!==r)return;failures++;console.warn('OF pool legacy fallback',kind,e);});
    return true;
  }
  return {attach,stats:()=>({failures,cached:cache.size,objects:[...records.values()].map(r=>({node:r.root.name,kind:r.kind,visible:r.root.enabled,attached:!!r.pivot?.parent,meshInstances:r.pivot?.findComponents('render').reduce((n,c)=>n+c.meshInstances.length,0)||0,fallbackVisible:r.fallback.some(c=>c.enabled)}))})};
}
export function createPoolVisual({pc,app,mat,box,lotGround,fixtureModels=true}){
  const models=createPoolFixtureModels({pc,app,enabled:fixtureModels});
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
  let previewRoot=null;
  const fixtureRoots=new Map();
  function drawFixture(f){
    const p=poolFixtureVisualPose(f);
    if(!p)return null;
    const root=new pc.Entity(f.fixtureId+' '+f.kind);
    app.root.addChild(root);
    root.setPosition(p.x,GROUND_Y,p.z);
    root.setEulerAngles(0,Math.atan2(p.dx,p.dz)*180/Math.PI,0);
    // Local +Z always enters the water, local Z=0 is the actual wall.
    const part=(name,x,y,z,w,h,d,color)=>box(name,x,y,z,w,h,d,material[color],root);
    if(f.kind==='ladder'){
      for(const x of [-.18,.18]){
        part('deck socket',x,.015,-.102,.105,.04,.105,'steel');
        part('deck rail',x,.25,-.102,.055,.50,.055,'steel');
        part('grip',x,.49,.025,.055,.055,.31,'steel');
        part('wet rail',x,-.15,.15,.055,1.32,.055,'steel');
      }
      for(let i=0;i<5;i++)part('rung',0,.12-i*.20,.15,.37,.045,.06,'steel');
    }else if(f.kind==='steps'){
      for(let i=0;i<3;i++){
        const top=-.04-i*.19,height=top+1.2;
        part('tread',0,-1.2+height/2,.09+i*.20,.47,height,.206,'stone');
      }
    }else if(f.kind==='board'){
      part('anchored base',0,.035,-.18,.40,.07,.43,'stone');
      part('support',0,.22,-.18,.24,.39,.27,'steel');
      part('launch board',0,.435,.12,.46,.085,.94,'board');
      part('board lip',0,.435,.585,.46,.085,.024,'steel');
    }
    models.attach(root,f.kind);
    return root;
  }
  function previewFixture(f=null){
    previewRoot?.destroy();previewRoot=null;
    for(const node of fixtureRoots.values())node.enabled=true;
    if(!f)return;
    const previous=fixtureRoots.get(f.fixtureId);
    if(previous)previous.enabled=false;
    previewRoot=drawFixture(f);
  }
  return {
    sync(outdoors,force=false){
      const key=JSON.stringify({
        pools:outdoors?.pools||[],fixtures:outdoors?.poolFixtures||[]});
      if(!force&&signature===key)return;
      signature=key;
      previewFixture();fixtureRoots.clear();clear();
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
      for(const fixture of outdoors?.poolFixtures||[]){
        const node=drawFixture(fixture);
        if(node){nodes.push(node);fixtureRoots.set(fixture.fixtureId,node);}
      }
    },
    previewFixture,
    dispose(){previewFixture();fixtureRoots.clear();clear();signature=null;lotGround.enabled=true;},
    stats:()=>({nodeCount:nodes.length,meshCount:meshes.length,
      hasPool:!lotGround.enabled,fixtureModels:models.stats()})
  };
}
