import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {CAMERA_INITIAL} from '../src/camera-controls.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({
  executablePath:process.env.CHROMIUM_PATH||undefined,
  args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']
});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await page.addInitScript(key=>localStorage.setItem(key,'done'),UI_TOUR_STORAGE_KEY);
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});

  // Check the projected direction of a fixed world point in the real camera.
  const screenVector=()=>page.evaluate(async view=>{
    const {Application,Vec3}=await import('playcanvas');
    const camera=Application.getApplication().root.findByName('Camera').camera;
    const center=new Vec3(view.centerX,view.centerY,view.centerZ);
    const yaw=view.yaw*Math.PI/180;
    const marker=center.clone().add(new Vec3(Math.cos(yaw),0,-Math.sin(yaw)));
    const origin=camera.worldToScreen(center),tip=camera.worldToScreen(marker);
    return {x:tip.x-origin.x,y:tip.y-origin.y};
  },CAMERA_INITIAL);

  const initial=await screenVector();
  assert.ok(initial.x>1&&Math.abs(initial.y)<.1,'landmark starts right of the target');
  const touches=await page.context().newCDPSession(page);
  const send=(type,points)=>touches.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const anchor={id:1,x:150,y:350};
  const finger=angle=>({id:2,x:anchor.x+70*Math.cos(angle),y:anchor.y+70*Math.sin(angle)});
  await send('touchStart',[anchor,finger(0)]);
  for(const sign of [1,-1]){
    for(let step=1;step<=8;step++)await send('touchMove',[anchor,finger(sign*step*Math.PI/16)]);
    const turned=await screenVector();
    assert.ok(sign*turned.y>1&&Math.abs(turned.x)<1,
      'world landmark follows the signed quarter-turn: '+JSON.stringify(turned));
    for(let step=7;step>=0;step--)await send('touchMove',[anchor,finger(sign*step*Math.PI/16)]);
    const restored=await screenVector();
    assert.ok(Math.hypot(restored.x-initial.x,restored.y-initial.y)<1);
  }
  await send('touchEnd',[]);
  console.log('Clockwise, counterclockwise and return verified on the projected 3D scene.');
}finally{
  await browser.close();
}
