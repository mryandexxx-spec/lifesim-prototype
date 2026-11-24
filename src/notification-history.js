// PF-06: bounded, non-authoritative household presentation history.
export const NOTICE_LIMIT=100;
const kinds=new Set(['general','work','calendar','finance','delivery']);
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const resident=v=>typeof v==='string'&&/^(alex|mira|resident_[1-9]\d{0,8})$/.test(v)?v:null;
const category=(message,kind)=>kinds.has(kind)?kind:message.startsWith('💼')?'work':
  message.startsWith('📅')?'calendar':message.startsWith('🧾')?'finance':
  message.startsWith('🛵')?'delivery':'general';
export const newNotificationHistory=()=>({schema:1,nextId:1,entries:[]});
export function restoreNotificationHistory(raw,now){
  const result=newNotificationHistory();
  if(raw?.schema!==1||!Array.isArray(raw.entries)||!Number.isFinite(now))return result;
  const seen=new Set();
  for(const item of raw.entries.slice(-NOTICE_LIMIT)){
    const message=clean(item?.message,600);
    if(!message||!Number.isSafeInteger(item.id)||item.id<1||item.id>=Number.MAX_SAFE_INTEGER-1||
      seen.has(item.id)||!Number.isFinite(item.at)||item.at<0||item.at>now)continue;
    seen.add(item.id);
    const who=resident(item.incidentResidentId),incidentId=who?clean(item.incidentId,160):'';
    result.entries.push({id:item.id,at:item.at,message,category:category(message,item.category),
      read:item.read===true,repeat:Number.isInteger(item.repeat)?Math.max(1,Math.min(999,item.repeat)):1,
      incidentResidentId:incidentId?who:null,incidentId:incidentId||null});
  }
  result.entries.sort((a,b)=>a.id-b.id);
  const min=(result.entries.at(-1)?.id??0)+1;
  result.nextId=Number.isSafeInteger(raw.nextId)&&raw.nextId>=min&&raw.nextId<Number.MAX_SAFE_INTEGER-1?raw.nextId:min;
  return result;
}
export function appendNotification(root,message,{incidentResidentId=null,incidentId=null,kind}={}){
  message=clean(message,600);
  if(!root||!message||!Number.isFinite(root.minutes)||root.minutes<0)return false;
  const history=root.notificationHistory??(root.notificationHistory=newNotificationHistory());
  if(history.nextId>=Number.MAX_SAFE_INTEGER-1){
    history.entries.forEach((entry,i)=>{entry.id=i+1;});
    history.nextId=history.entries.length+1;
  }
  incidentResidentId=resident(incidentResidentId);
  incidentId=incidentResidentId?clean(incidentId,160)||null:null;
  if(!incidentId)incidentResidentId=null;
  const at=Math.floor(root.minutes),cat=category(message,kind),last=history.entries.at(-1);
  if(last&&last.message===message&&last.category===cat&&last.incidentId===incidentId&&
    last.incidentResidentId===incidentResidentId&&at>=last.at&&at-last.at<=2){
    last.at=at;last.repeat=Math.min(999,last.repeat+1);last.read=false;return true;
  }
  history.entries.push({id:history.nextId++,at,message,category:cat,read:false,repeat:1,
    incidentResidentId,incidentId});
  if(history.entries.length>NOTICE_LIMIT)history.entries.splice(0,history.entries.length-NOTICE_LIMIT);
  return true;
}
export function markNotificationsRead(history,id=null){
  let changed=false;
  for(const entry of history?.entries??[]){
    if(!entry.read&&(id===null||entry.id===id)){entry.read=true;changed=true;}
  }
  return changed;
}
export const unreadNotifications=history=>(history?.entries??[]).filter(e=>!e.read).length;
export const notificationIncidentCurrent=(entry,pending)=>Boolean(entry?.incidentId&&
  entry.incidentResidentId&&pending?.id===entry.incidentId);
