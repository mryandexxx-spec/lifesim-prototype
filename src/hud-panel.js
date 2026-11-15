/** UI-only dock state. Independent of the household save and simulation clock. */
export const HUD_COMPACT_KEY='blins.ui.hud.compact.v1';
export function isHudCompact(value){return value==='compact';}
export function createHudPanel({panel,toggle,readPreference=()=>null,writePreference=()=>{},onChange=()=>{}}){
  let compact=false;
  try{compact=isHudCompact(readPreference());}
  catch{/* Safari may reject localStorage; default to full HUD. */}
  function render(){
    panel.dataset.collapsed=String(compact);
    toggle.setAttribute('aria-expanded',String(!compact));
    toggle.setAttribute('aria-label',compact?'Развернуть панель персонажа':'Свернуть панель персонажа');
    toggle.textContent=compact?'⌃':'⌄';
    onChange(compact);
  }
  toggle.addEventListener('click',()=>{
    compact=!compact;
    try{writePreference(compact?'compact':'full');}
    catch{/* UI preference failures must not affect play. */}
    render();
  });
  render();
  return {isCompact:()=>compact};
}
