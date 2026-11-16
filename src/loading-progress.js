/** Tracks terminal asset readiness independently of PlayCanvas and the game save. */
export function createLoadingProgress(ids, onProgress=()=>{}) {
  if (!Array.isArray(ids) || ids.length===0 || new Set(ids).size!==ids.length)
    throw new TypeError('Loading ids must be a nonempty unique array');
  const states=new Map(ids.map(id=>[id,null]));
  const waiting=[];
  const snapshot=()=>({
    completed:[...states.values()].filter(state=>state!==null).length,
    total:states.size,
    failed:[...states.values()].filter(state=>state===false).length
  });
  const finish=(id,successful=true)=>{
    if(!states.has(id))throw new Error('Unknown asset: '+id);
    if(states.get(id)!==null)return false;
    states.set(id,Boolean(successful));
    const status=snapshot();
    onProgress(status);
    if(status.completed===status.total)for(const resolve of waiting.splice(0))
      resolve(status);
    return true;
  };
  const wait=()=> {
    const status=snapshot();
    return status.completed===status.total
      ? Promise.resolve(status)
      : new Promise(resolve=>waiting.push(resolve));
  };
  onProgress(snapshot());
  const failUnresolved=()=>{
    for(const [id,state] of states){
      if(state===null)finish(id,false);
    }
    return snapshot();
  };
  return {finish,wait,snapshot,failUnresolved};
}
