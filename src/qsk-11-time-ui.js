// DOM/input only: gameplay decisions and persistence remain with the caller.
export function createTimeUI({element:$,onPause,onSpeed,onAutonomy}){
  function renderPause({blocked,paused,furnishMode,buildMode,outdoorMode}){
    const held=paused||blocked||furnishMode||buildMode||outdoorMode;
    $('pause-icon').textContent=held?'▶':'Ⅱ';
    $('pause-btn').setAttribute('aria-label',blocked
      ?'Выбери реплику: игровое время остановлено'
      :outdoorMode?'Участок: игровое время остановлено'
      :buildMode?'Строительство: игровое время остановлено'
      :furnishMode?'Обстановка: игровое время остановлено'
      :held?'Продолжить':'Пауза');
  }
  function renderSpeed(speed){
    $('speed-btn').textContent=speed+'×';
  }
  function renderAutonomy(enabled){
    $('auto-btn').setAttribute('aria-pressed',String(enabled));
    $('auto-btn').setAttribute('aria-label',enabled
      ?'Автономность включена. Нажмите, чтобы отключить'
      :'Автономность выключена. Нажмите, чтобы включить');
    $('auto-state').textContent=enabled?'ВКЛ':'ВЫКЛ';
  }
  $('pause-btn').addEventListener('click',onPause);
  $('speed-btn').addEventListener('click',onSpeed);
  $('auto-btn').addEventListener('click',onAutonomy);
  return {renderPause,renderSpeed,renderAutonomy};
}
