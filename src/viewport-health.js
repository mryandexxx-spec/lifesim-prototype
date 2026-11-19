/**
 * Local-only Safari/PlayCanvas viewport health. No browser APIs, network or
 * persistence: callers supply monotonic timestamps and context/pause state.
 * The simulation may be paused while WebGL should still render normally.
 */
const age=(now,then)=>then===null?null:Math.max(0,Math.round(now-then));
const safeNow=n=>Number.isFinite(n)&&n>=0?n:0;

export const VIEWPORT_STALL_MS=7500;
export const VIEWPORT_WARMUP_MS=14000;

export function createViewportHealth({
  stallMs=VIEWPORT_STALL_MS,warmupMs=VIEWPORT_WARMUP_MS,maxEvents=12
}={}){
  let startedAt=null,lastUpdate=null,lastRender=null,lastInput=null;
  let lastResume=null,contextLost=false,frames=0,updates=0;
  let avgRenderGap=null,previousRender=null;
  const events=[];
  const note=(type,now)=>{
    events.push({type,at:Math.round(safeNow(now))});
    if(events.length>maxEvents)events.shift();
  };
  const begin=(now)=>{
    const t=safeNow(now);
    if(startedAt===null){startedAt=t;lastResume=t;}
  };
  const markUpdate=now=>{
    const t=safeNow(now);begin(t);
    lastUpdate=t;updates++;
  };
  const markRender=now=>{
    const t=safeNow(now);begin(t);
    if(previousRender!==null){
      const gap=t-previousRender;
      // Ignore background resume gaps and bogus duplicate timestamps.
      if(gap>0&&gap<1500)
        avgRenderGap=avgRenderGap===null?gap:avgRenderGap*.9+gap*.1;
    }
    previousRender=t;lastRender=t;frames++;
  };
  const markInput=now=>{const t=safeNow(now);begin(t);lastInput=t;};
  const loseContext=now=>{const t=safeNow(now);begin(t);contextLost=true;note('webgl-lost',t);};
  const restoreContext=now=>{
    const t=safeNow(now);begin(t);contextLost=false;
    lastUpdate=t;lastRender=t;lastResume=t;previousRender=null;
    avgRenderGap=null;note('webgl-restored',t);
  };
  const resume=now=>{
    const t=safeNow(now);begin(t);
    lastUpdate=t;lastRender=t;lastResume=t;previousRender=null;
    avgRenderGap=null;note('foreground',t);
  };
  const markError=(code,now)=>{
    const label=String(code||'runtime-error').slice(0,60);
    note(label,safeNow(now));
  };
  function inspect(now,{
    hidden=false,paused=false,mode='play',pointers=0,
    canvasWidth=0,canvasHeight=0,dpr=1,outdoorFeatures=0,furniture=0
  }={}){
    const t=safeNow(now);
    const sinceStart=age(t,startedAt);
    const updateAge=age(t,lastUpdate);
    const renderAge=age(t,lastRender);
    let status='healthy';
    if(hidden)status='background';
    else if(contextLost)status='webgl-lost';
    else if(startedAt===null ||
      (lastResume!==null&&t-lastResume<warmupMs))status='starting';
    else if(updateAge===null||updateAge>stallMs)status='update-stall';
    else if(renderAge===null||renderAge>stallMs)status='render-stall';
    return {
      status,paused:Boolean(paused),mode:String(mode).slice(0,24),
      pointers:Math.max(0,Math.min(10,Number(pointers)||0)),
      updateAge,renderAge,inputAge:age(t,lastInput),sinceStart,
      fps:avgRenderGap&&avgRenderGap>0?Math.round(1000/avgRenderGap):null,
      updates,frames,contextLost,
      canvas:`${Math.max(0,Math.round(canvasWidth))}×${Math.max(0,Math.round(canvasHeight))}`,
      dpr:Number.isFinite(dpr)?Math.round(dpr*100)/100:1,
      outdoorFeatures:Math.max(0,Math.floor(outdoorFeatures)),
      furniture:Math.max(0,Math.floor(furniture)),
      events:events.slice()
    };
  }
  return {begin,markUpdate,markRender,markInput,loseContext,restoreContext,
    resume,markError,inspect};
}

export const viewportHealthLabel=status=>({
  healthy:'Кадры 3D обновляются',
  starting:'3D запускается или восстанавливается',
  background:'Игра скрыта — проверка приостановлена',
  'webgl-lost':'Safari потерял соединение с 3D-графикой',
  'update-stall':'3D-движок перестал обновляться',
  'render-stall':'3D-движок обновляется, но не выдаёт кадры'
}[status]||'Состояние 3D неизвестно');

/** A compact report that the player can voluntarily copy, never uploaded. */
export function viewportHealthReport(snapshot){
  if(!snapshot)return '3D: нет данных';
  const ageText=v=>v===null?'—':`${(v/1000).toFixed(1)}с`;
  return [
    `3D: ${snapshot.status}`,
    `Цикл: ${ageText(snapshot.updateAge)} · кадр: ${ageText(snapshot.renderAge)}`,
    `FPS ≈ ${snapshot.fps??'—'} · обновлений ${snapshot.updates} · кадров ${snapshot.frames}`,
    `Режим: ${snapshot.mode} · пауза: ${snapshot.paused?'да':'нет'}`,
    `Касания: ${snapshot.pointers} · последний ввод: ${ageText(snapshot.inputAge)}`,
    `Экран: ${snapshot.canvas} · DPR: ${snapshot.dpr}`,
    `Предметов: ${snapshot.furniture} · участок: ${snapshot.outdoorFeatures}`,
    `Контекст потерян: ${snapshot.contextLost?'да':'нет'}`,
    `События: ${snapshot.events.map(e=>e.type).join(' / ')||'нет'}`
  ].join('\n');
}
