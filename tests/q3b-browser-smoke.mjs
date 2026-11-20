/** Q3b: genuine browser boots and pure balance/sleep contract in four iPhone viewports. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(w+'x'+h+': '+e.message));
    page.on('crash',()=>errors.push(w+'x'+h+': browser crash'));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const result=await page.evaluate(async()=>{
      const {newHousehold,chooseResidentAction,tickHousehold}=await import('./src/household.js');
      const {arrive}=await import('./src/simulation.js');
      const {effectiveSleepSpeed}=await import('./src/sleep-acceleration.js');
      const root=newHousehold('2026-11-16');
      root.speed=1;
      root.needs.energy=30;root.otherSim.needs.energy=32;
      const initial=root.minutes;
      const first=chooseResidentAction(root,'bed',false,'alex');
      const second=chooseResidentAction(root,'bed',false,'mira');
      if(first&&second){arrive(root);arrive(root.otherSim);}
      const multiplier=effectiveSleepSpeed(root);
      tickHousehold(root,.30*multiplier);
      return {initial,now:root.minutes,rate:multiplier,savedSpeed:root.speed,
        first,second,energy:root.needs.energy,energyMira:root.otherSim.needs.energy,
        needsDisplayed:Boolean(document.querySelector('#value-energy')),
        canvasDisplayed:Boolean(document.querySelector('#game-canvas'))};
    });
    assert.ok(result.first&&result.second,'two bed reservations');
    assert.equal(result.rate,3,'both sleepers trigger temporary 3x');
    assert.equal(result.savedSpeed,1,'player saved speed remains 1x');
    assert.ok(Math.abs(result.now-result.initial-.9)<.00001,'one canonical clock step');
    assert.ok(result.energy>30&&result.energyMira>32);
    assert.equal(result.needsDisplayed,true);assert.equal(result.canvasDisplayed,true);
    await page.screenshot({path:`q3b-mobile-${w}x${h}.png`});
    await context.close();
  }
  assert.deepEqual(errors,[],'no runtime errors across four viewports');
}finally{await browser.close();}
console.log('Q3b real Chromium mobile startup, sleeping and speed contract PASS');
