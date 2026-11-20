/** LOT-D1b: pure pool editor/finance adapter. D1c will attach this to the
 * existing outdoor editor; there is no second wallet or speculative swimming.
 * Proposals are immutable; each Apply re-plans against the current root.
 */
import {restoreOutdoorsWorld} from './lot-surface.js';
import {poolCellBounds,poolComponents,poolWaterPrice,
  reconcilePoolComponents,POOL_MAX_CELLS,POOL_MAX_COMPONENTS,validPoolId}
  from './pool-topology.js';
import {POOL_FIXTURE_PRICES,POOL_FIXTURE_LIMIT,poolFixtureSite,
  validPoolFixture,validPoolFixtureId,poolHasExit}
  from './pool-equipment.js';
import {constructionContains} from './construction.js';
import {outdoorFeatureRect,outdoorRectsOverlap} from './outdoor-catalog.js';
import {furnitureObstacles} from './furniture-catalog.js';
import {findPath,isWalkable,ACTOR_RADIUS} from './navigation.js';
import {recordFinanceChange} from './finance-ledger.js';
import {keepsExistingRoutes} from './outdoor-proposals.js';

const fail=reason=>({ok:false,reason});
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const clone=v=>JSON.parse(JSON.stringify(v));
const residents=root=>[root?.position,root?.otherSim?.position].filter(p=>
  Number.isFinite(p?.x)&&Number.isFinite(p?.z));
const flat=pools=>pools.flatMap(p=>p.cells);
const waterPrice=pools=>poolWaterPrice(pools.length,flat(pools).length);
function context(root){
  if(root?.version!==1||root.world?.construction?.schema!==1||
     root.shop?.schema!==1||!integer(root.shop.credits)||
     !root.world?.furniture)return null;
  return restoreOutdoorsWorld(root.world.outdoors,root.world.construction);
}
function busy(root){
  if([root,root?.otherSim].some(p=>['pool','swim'].includes(p?.action?.id)))
    return true;
  return ['alex','mira'].some(id=>
    (root?.actionQueues?.byResident?.[id]||[]).some(q=>q.type==='pool'));
}
function numberSuffix(s,prefix){return Number(s.slice(prefix.length));}
function intersectsBuilding(root,cells,oldCells){
  const construction=root.world.construction,
    features=(root.world.outdoors?.features||[]).map(outdoorFeatureRect).filter(Boolean),
    furniture=furnitureObstacles(root.world.furniture),
    old=new Set(oldCells);
  for(const cell of cells)if(!old.has(cell)){
    const b=poolCellBounds(cell);
    if(!b)return 'invalid-cells';
    if(features.some(rect=>outdoorRectsOverlap(b,rect)))return 'overlap-outdoor';
    if(furniture.some(rect=>outdoorRectsOverlap(b,rect)))return 'overlap-furniture';
    const q=.02,pts=[[b.minX+q,b.minZ+q],[b.maxX-q,b.minZ+q],
      [b.minX+q,b.maxZ-q],[b.maxX-q,b.maxZ-q],
      [(b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2]];
    if(pts.some(([x,z])=>constructionContains(construction,x,z)))
      return 'overlap-construction';
    if(residents(root).some(p=>p.x>=b.minX-ACTOR_RADIUS&&
      p.x<=b.maxX+ACTOR_RADIUS&&p.z>=b.minZ-ACTOR_RADIUS&&
      p.z<=b.maxZ+ACTOR_RADIUS))
      return 'resident-blocked';
  }
  return null;
}
function priceChange(oldValue,newValue){
  return newValue>=oldValue?newValue-oldValue:
    -Math.floor((oldValue-newValue)*.7);
}
function totalCost(current,pools,fixtures){
  let cost=priceChange(waterPrice(current.pools||[]),waterPrice(pools));
  const old=new Map((current.poolFixtures||[]).map(f=>[f.fixtureId,f]));
  const newer=new Map(fixtures.map(f=>[f.fixtureId,f]));
  for(const f of fixtures){
    const prev=old.get(f.fixtureId);
    if(!prev)cost+=POOL_FIXTURE_PRICES[f.kind];
    else if(f.kind!==prev.kind||f.purchasePriceCredits!==prev.purchasePriceCredits)
      return null;
  }
  for(const f of old.values())if(!newer.has(f.fixtureId))
    cost-=Math.floor(f.purchasePriceCredits*.7);
  return cost;
}
function verifyFixtures(root,world,fixtures){
  if(fixtures.length>POOL_FIXTURE_LIMIT)return 'fixture-limit';
  const seen=new Set(),edges=new Set();
  const furniture=furnitureObstacles(root.world.furniture);
  const features=world.features.map(outdoorFeatureRect).filter(Boolean);
  const w={...root.world,outdoors:world};
  for(const f of fixtures){
    if(!validPoolFixture(f,world.pools))return 'invalid-fixture-anchor';
    if(seen.has(f.fixtureId))return 'duplicate-fixture';
    seen.add(f.fixtureId);
    const key=f.edgeCell+':'+f.side;
    if(edges.has(key))return 'occupied-rim';
    edges.add(key);
    const pool=world.pools.find(p=>p.poolId===f.poolId);
    const point=poolFixtureSite(pool,f.edgeCell,f.side,f.kind).dryApproach;
    const rect={minX:point.x-ACTOR_RADIUS,maxX:point.x+ACTOR_RADIUS,
      minZ:point.z-ACTOR_RADIUS,maxZ:point.z+ACTOR_RADIUS};
    if(constructionContains(root.world.construction,point.x,point.z)||
       furniture.some(r=>outdoorRectsOverlap(r,rect))||
       features.some(r=>outdoorRectsOverlap(r,rect)))
      return 'blocked-dry-approach';
    if(!isWalkable(point.x,point.z,w))return 'unwalkable-dry-approach';
    if(!residents(root).every(actor=>Boolean(findPath(actor,point,w))))
      return 'unreachable-exit';
  }
  return null;
}
export function poolEditorSnapshot(root){
  const current=context(root);
  return current?{pools:clone(current.pools||[]),
    poolFixtures:clone(current.poolFixtures||[])}:null;
}
function plan(root,intent){
  const current=context(root);
  if(!current)return fail('invalid-state');
  if(current.revision>=100000000||current.poolTxnSeq>=100000000)
    return fail('revision-limit');
  if(busy(root))return fail('reserved-pool');
  let pools=clone(current.pools||[]),
    fixtures=clone(current.poolFixtures||[]),
    nextPoolId=current.nextPoolId||1,
    nextFixtureId=current.nextFixtureId||1;
  const oldCells=flat(pools);
  if(intent.operation==='paint'||intent.operation==='erase'){
    if(!Array.isArray(intent.cells)||intent.cells.length<1||
       intent.cells.length>POOL_MAX_CELLS)return fail('invalid-cells');
    const select=new Set();
    for(const cell of intent.cells){
      if(!poolCellBounds(cell))return fail('invalid-cells');
      select.add(cell);
    }
    if(select.size!==intent.cells.length)return fail('duplicate-cells');
    const next=new Set(oldCells);
    for(const cell of select)
      if(intent.operation==='paint')next.add(cell);else next.delete(cell);
    if(next.size>POOL_MAX_CELLS)return fail('pool-limit');
    if(next.size===oldCells.length&&[...next].every(c=>oldCells.includes(c)))
      return fail('unchanged');
    const reconciled=reconcilePoolComponents(pools,[...next],nextPoolId);
    if(!reconciled)return fail('pool-component-limit');
    pools=reconciled.pools;nextPoolId=reconciled.nextPoolId;
    // A split/merge must not silently delete or sell an installed fixture.
    fixtures=fixtures.map(f=>{
      const host=pools.find(p=>p.cells.includes(f.edgeCell));
      return host?{...f,poolId:host.poolId}:f;
    });
  }else if(intent.operation==='fixture-add'||intent.operation==='fixture-move'){
    const {kind,edgeCell,side}=intent;
    if(!Object.hasOwn(POOL_FIXTURE_PRICES,kind)||!poolCellBounds(edgeCell))
      return fail('invalid-fixture');
    const pool=pools.find(p=>p.cells.includes(edgeCell));
    if(!pool)return fail('no-water-edge');
    const site=poolFixtureSite(pool,edgeCell,side,kind);
    if(!site)return fail('unsafe-rim-or-landing');
    if(intent.operation==='fixture-add'){
      if(nextFixtureId>9999999||fixtures.length>=POOL_FIXTURE_LIMIT)
        return fail('fixture-limit');
      fixtures.push({fixtureId:'fixture-'+nextFixtureId++,poolId:pool.poolId,
        kind,edgeCell,side,purchasePriceCredits:POOL_FIXTURE_PRICES[kind]});
    }else{
      const old=fixtures.find(f=>f.fixtureId===intent.fixtureId);
      if(!old)return fail('missing-fixture');
      if(old.kind!==kind)return fail('fixture-kind-immutable');
      if(old.poolId===pool.poolId&&old.edgeCell===edgeCell&&old.side===side)
        return fail('unchanged');
      fixtures=fixtures.map(f=>f.fixtureId===old.fixtureId
        ?{...f,poolId:pool.poolId,edgeCell,side}:f);
    }
  }else if(intent.operation==='fixture-remove'){
    if(!validPoolFixtureId(intent.fixtureId))return fail('invalid-fixture');
    if(!fixtures.some(f=>f.fixtureId===intent.fixtureId))return fail('missing-fixture');
    fixtures=fixtures.filter(f=>f.fixtureId!==intent.fixtureId);
  }else if(intent.operation==='history'){
    // The outdoor history stores topology/fixtures only, NEVER an old salary,
    // wallet or finance journal. Inverse operations receive a fresh quote.
    const snapshot=intent.snapshot;
    if(!Array.isArray(snapshot?.pools)||!Array.isArray(snapshot.poolFixtures))
      return fail('invalid-history');
    if(snapshot.pools.length>POOL_MAX_COMPONENTS||
       snapshot.poolFixtures.length>POOL_FIXTURE_LIMIT)return fail('invalid-history');
    pools=clone(snapshot.pools);fixtures=clone(snapshot.poolFixtures);
    const all=flat(pools);
    if(all.length>POOL_MAX_CELLS||poolComponents(all)?.length!==pools.length)
      return fail('invalid-history');
    const ids=new Set(),occupied=new Set();
    for(const p of pools){
      if(!validPoolId(p.poolId)||ids.has(p.poolId)||poolComponents(p.cells)?.length!==1)
        return fail('invalid-history');
      ids.add(p.poolId);
      for(const cell of p.cells){if(occupied.has(cell))return fail('invalid-history');occupied.add(cell);}
      nextPoolId=Math.max(nextPoolId,numberSuffix(p.poolId,'pool-')+1);
    }
    const fixtureIds=new Set();
    for(const f of fixtures){
      if(!validPoolFixtureId(f.fixtureId)||fixtureIds.has(f.fixtureId))
        return fail('invalid-history');
      fixtureIds.add(f.fixtureId);
      nextFixtureId=Math.max(nextFixtureId,numberSuffix(f.fixtureId,'fixture-')+1);
    }
  }else return fail('unknown-operation');
  if(JSON.stringify({pools,fixtures})===
     JSON.stringify({pools:current.pools||[],fixtures:current.poolFixtures||[]}))
    return fail('unchanged');
  const overlap=intersectsBuilding(root,flat(pools),oldCells);
  if(overlap)return fail(overlap);
  const next={...current,revision:current.revision+1,pools,
    nextPoolId,poolTxnSeq:(current.poolTxnSeq||0)+1,poolFixtures:fixtures,nextFixtureId};
  const restored=restoreOutdoorsWorld(next,root.world.construction,root.minutes);
  if(JSON.stringify(restored)!==JSON.stringify(next))
    return fail('invalid-topology-or-fixture');
  const fError=verifyFixtures(root,next,fixtures);
  if(fError)return fail(fError);
  if(!keepsExistingRoutes(root,next))return fail('would-block-route');
  const cost=totalCost(current,pools,fixtures);
  if(cost===null)return fail('invalid-value');
  if(root.shop.credits<cost)return fail('insufficient-credits');
  const balance=root.shop.credits-cost;
  if(!integer(balance)||balance>1000000000)return fail('wallet-limit');
  const result={ok:true,operation:intent.operation,sourceId:'pool-txn-'+next.poolTxnSeq,
    intent:clone(intent),fromRevision:current.revision,
    fromPoolTxnSeq:current.poolTxnSeq||0,fromBalance:root.shop.credits,
    outdoors:next,cost,balance,waterCells:flat(pools).length,
    basins:pools.length,areaSquareMetres:flat(pools).length/4,
    exits:fixtures.filter(f=>f.kind==='ladder'||f.kind==='steps').length,
    swimReady:pools.some(p=>poolHasExit(next,p.poolId)),
    waterPrice:waterPrice(pools)};
  return result;
}
/** One-finger brush or eraser; D1c decides where touch points map to cells. */
export function previewPoolTiles(root,{operation,cells}={}){
  return plan(root,{operation,cells});
}
export function previewPoolFixture(root,{operation,kind,edgeCell,side,fixtureId}={}){
  return plan(root,{operation,kind,edgeCell,side,fixtureId});
}
export function previewPoolHistory(root,snapshot){
  return plan(root,{operation:'history',snapshot});
}
/** Not a saved undo ledger: snapshots are captured by existing editor timeline. */
export function commitPoolPreview(root,draft){
  if(!draft?.ok||!draft.intent||!integer(draft.fromRevision))
    return fail('invalid-preview');
  const current=context(root);
  if(!current||current.revision!==draft.fromRevision||
     (current.poolTxnSeq||0)!==draft.fromPoolTxnSeq||
     root.shop.credits!==draft.fromBalance)return fail('stale-preview');
  const recalculated=plan(root,draft.intent);
  if(!recalculated.ok)return recalculated;
  for(const key of ['sourceId','cost','balance','fromRevision','fromPoolTxnSeq'])
    if(draft[key]!==recalculated[key])return fail('tampered-preview');
  if(JSON.stringify(draft.outdoors)!==JSON.stringify(recalculated.outdoors))
    return fail('tampered-preview');
  const nextShop={...root.shop,credits:recalculated.balance};
  const receipt=recordFinanceChange(root,nextShop,{
    kind:recalculated.cost<0?'sale':'purchase',
    sourceId:recalculated.sourceId,atGameMinute:Math.floor(root.minutes||0)
  });
  if(!receipt.ok)return fail(receipt.reason);
  return {ok:true,root:{...root,world:{...root.world,outdoors:recalculated.outdoors},
    shop:receipt.shop,financialHistory:receipt.financialHistory},
    cost:recalculated.cost,recorded:receipt.recorded,sourceId:recalculated.sourceId};
}
/** The caller supplies the existing one-root snapshot persistence function.
 * A rejected/throwing setItem leaves the original root and wallet untouched.
 */
export function commitPoolPreviewPersisted(root,draft,persistRoot){
  if(typeof persistRoot!=='function')return fail('missing-persistence');
  const committed=commitPoolPreview(root,draft);
  if(!committed.ok)return committed;
  try{
    if(persistRoot(committed.root)!==true)return fail('save-failed');
  }catch{return fail('save-failed');}
  return committed;
}
