import {viewMenuPlacement} from './ui-layout.js';

// DOM/input-only popover. Gameplay decides whether it may open and how other
// panels close; this adapter never touches resident state, commands or saves.
export function createViewPopover({element,canvas,document,window,canOpen,requiredDialogue,onOpen,requestFrame}){
  const toggle=element('view-toggle');
  const panel=element('view-panel');
  const close=element('view-close');
  let open=false;
  const position=()=>{
    if(!open)return;
    const buttonRect=toggle.getBoundingClientRect();
    const canvasRect=canvas.getBoundingClientRect();
    const pos=viewMenuPlacement({
      buttonLeft:buttonRect.left-canvasRect.left,
      buttonTop:buttonRect.top-canvasRect.top,
      viewportWidth:canvas.clientWidth,
      viewportHeight:canvas.clientHeight,
      menuWidth:panel.offsetWidth||226,
      menuHeight:panel.offsetHeight||160
    });
    panel.style.setProperty('--view-x',pos.x+'px');
    panel.style.setProperty('--view-y',pos.y+'px');
  };
  function setOpen(next,{restoreFocus=false}={}){
    if(next&&!canOpen())return;
    open=Boolean(next);
    panel.hidden=!open;
    toggle.setAttribute('aria-expanded',String(open));
    if(open){
      onOpen();
      requestFrame(()=>{position();panel.focus({preventScroll:true});});
    }else if(restoreFocus){
      toggle.focus({preventScroll:true});
    }
  }
  toggle.addEventListener('click',()=>setOpen(!open));
  close.addEventListener('click',()=>setOpen(false,{restoreFocus:true}));
  document.addEventListener('pointerdown',event=>{
    if(!open)return;
    if(panel.contains(event.target)||toggle.contains(event.target))return;
    setOpen(false);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&open&&!requiredDialogue()){
      event.preventDefault();
      setOpen(false,{restoreFocus:true});
    }
  },true);
  window.addEventListener('resize',position);
  return {setOpen,isOpen:()=>open};
}
