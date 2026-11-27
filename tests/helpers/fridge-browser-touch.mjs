/** Browser-only helper: real UI camera framing and physical touch of the saved
 * fridge. No test hooks, DOM visibility mutation or synthetic click dispatch.
 * Project actual candidate points from the known fixture, not screen pixels. */
export async function openFridgeByTouch(page,fridge,{captureFailure}={}){
 const panel=page.locator('#fridge-r2'),attempts=[];
 const project=()=>page.evaluate(async fixture=>{
  const {Application,Vec3}=await import('playcanvas');
  const camera=Application.getApplication().root.findByName('Camera').camera;
  const canvas=document.querySelector('#game-canvas'),rect=canvas.getBoundingClientRect();
  const candidates=[];
  for(const height of [1.35,1.9,.8,2.1])for(const dx of [0,-.28,.28])for(const dz of [0,.28,-.28]){
   const v=camera.worldToScreen(new Vec3(fixture.x+dx,height,fixture.z+dz));
   const x=Math.round(v.x+rect.left),y=Math.round(v.y+rect.top);
   if(document.elementFromPoint(x,y)===canvas&&!candidates.some(p=>p.x===x&&p.y===y))candidates.push({x,y});
  }
  return candidates;
 },fridge);
 for(const frame of ['current','lot']){
  if(frame==='lot'){
   await page.locator('#view-toggle').tap();
   await page.locator('#menu-lot-camera-btn').tap();
   await page.locator('#view-panel').waitFor({state:'hidden'});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  const points=await project();
  attempts.push({frame,points});
  for(const pt of points){
   // Previous candidate may have opened a different optional context.
   // Re-check that the canvas, not an overlay, actually receives this touch.
   if(!await page.evaluate(({x,y})=>document.elementFromPoint(x,y)===document.querySelector('#game-canvas'),pt))continue;
   await page.touchscreen.tap(pt.x,pt.y);
   await panel.waitFor({state:'visible',timeout:350}).catch(()=>{});
   if(await panel.isVisible())return;
   const ground=page.locator('#ground-walk-menu');
   if(await ground.isVisible())await page.locator('#ground-walk-close').tap();
   const sheet=page.locator('#action-sheet');
   if(await sheet.isVisible()){
    const close=sheet.locator('button').filter({hasText:'Закрыть'});
    if(await close.count()===1&&await close.isVisible())await close.tap();
   }
   const social=page.locator('#social-context');
   if(await social.isVisible())await page.locator('#social-context-close').tap();
  }
 }
 if(captureFailure)await captureFailure(attempts);
 throw new Error('Actual fridge touch did not open sheet: '+JSON.stringify(attempts));
}
