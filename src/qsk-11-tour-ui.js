import {createUITour} from './ui-onboarding.js';

// DOM and input only. The caller owns the dialogue gate, other panels and UI preference.
export function createTourUI({element:$,document,requiredDialogue,rememberDismissal,onReplay}){
  const uiTour=createUITour();
  let tourOpen=false;
  function closeTour({remember=true,restoreFocus=false}={}){
    if(!tourOpen)return;
    tourOpen=false;
    $('tour-panel').hidden=true;
    if(remember)rememberDismissal();
    if(restoreFocus)$('view-toggle').focus({preventScroll:true});
  }
  function renderTour(){
    const step=uiTour.current();
    $('tour-progress').textContent=uiTour.progress();
    $('tour-title').textContent=step.title;
    $('tour-body').textContent=step.body;
    $('tour-tip').textContent=step.hint;
    $('tour-next').textContent=uiTour.index()===uiTour.length-1?'Играть':'Дальше';
  }
  function openTour(){
    if(requiredDialogue())return false;
    uiTour.reset();renderTour();
    tourOpen=true;$('tour-panel').hidden=false;
    $('tour-panel').focus({preventScroll:true});
    return true;
  }
  $('tour-close').addEventListener('click',()=>closeTour({restoreFocus:true}));
  $('tour-skip').addEventListener('click',()=>closeTour({restoreFocus:true}));
  $('tour-next').addEventListener('click',()=>{
    if(uiTour.next())renderTour();
    else closeTour({restoreFocus:true});
  });
  $('tour-replay').addEventListener('click',()=>{
    onReplay();
    openTour();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&tourOpen&&!requiredDialogue()){
      event.preventDefault();closeTour({restoreFocus:true});
    }
  },true);
  document.addEventListener('pointerdown',event=>{
    if(!tourOpen)return;
    if($('tour-panel').contains(event.target)||$('tour-replay').contains(event.target))return;
    closeTour({remember:true});
  },true);
  return {openTour,closeTour};
}
