// Home-menu presentation only. Gameplay and parcel-editor capture remain in game.js.
export function createHomeMenu({element:$,document,requestFrame,canOpen,requiredDialogue,onOpen}){
  let homeOpen=false;
  function setOpen(open,{restoreFocus=false}={}){
    if(open&&!canOpen())return;
    homeOpen=Boolean(open);
    $('home-panel').hidden=!homeOpen;
    $('home-open').setAttribute('aria-expanded',String(homeOpen));
    if(homeOpen){
      onOpen();
      requestFrame(()=>$('home-furnish').focus({preventScroll:true}));
    }else if(restoreFocus)$('home-open').focus({preventScroll:true});
  }
  $('home-open').addEventListener('click',()=>setOpen(!homeOpen));
  $('home-close').addEventListener('click',()=>setOpen(false,{restoreFocus:true}));
  $('home-furnish').addEventListener('click',()=>{setOpen(false);$('furnish-toggle').click();});
  $('home-build').addEventListener('click',()=>{setOpen(false);$('build-toggle').click();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&homeOpen&&!requiredDialogue()){
      event.preventDefault();setOpen(false,{restoreFocus:true});
    }
  },true);
  return {setOpen};
}
