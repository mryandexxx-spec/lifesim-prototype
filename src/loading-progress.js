/** Reports verified startup milestones; no simulated byte progress or game-save state. */
export function createLoadingProgress(ids,onProgress=()=>{}) {
  if(!Array.isArray(ids)||ids.length===0)
    throw new TypeError('Loading ids must be a nonempty unique array');
  const entries=ids.map(source=>typeof source==='string'
    ? {id:source,label:source,optional:true}
    : source);
  if(entries.some(item=>!item||typeof item.id!=='string'||!item.id.trim()))
    throw new TypeError('Loading stage id must be nonempty');
  if(entries.some(item=>typeof item.label!=='string'||!item.label.trim()))
    throw new TypeError('Loading stage label must be nonempty');
  if(new Set(entries.map(item=>item.id)).size!==entries.length)
    throw new TypeError('Loading ids must be a nonempty unique array');
  const states=new Map(entries.map(item=>[item.id,null]));
  const waiting=[];
  const snapshot=()=>({
    completed:[...states.values()].filter(state=>state!==null).length,
    total:states.size,
    failed:[...states.values()].filter(state=>state===false).length
  });
  const stages=()=>entries.map(({id,label,optional})=>({
    id,label,optional:optional===true,
    status:states.get(id)===null?'pending':states.get(id)===true?'ready':'fallback'
  }));
  const requiredReady=()=>entries.every(({id,optional})=>optional===true||states.get(id)===true);
  const finish=(id,successful=true)=>{
    if(!states.has(id))throw new Error('Unknown asset: '+id);
    if(states.get(id)!==null)return false;
    states.set(id,Boolean(successful));
    const status=snapshot();
    onProgress(status,stages());
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
  onProgress(snapshot(),stages());
  const failUnresolved=({onlyOptional=false}={})=>{
    for(const {id,optional} of entries){
      if(states.get(id)===null&&(!onlyOptional||optional===true))finish(id,false);
    }
    return snapshot();
  };
  return {finish,wait,snapshot,stages,requiredReady,failUnresolved};
}
