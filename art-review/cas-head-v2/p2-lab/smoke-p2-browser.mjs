/** CAS-HEAD-V2-P2 real remote PlayCanvas WebGL smoke: staging only, never owner art acceptance. */
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const URL='https://lifesim-cas-head-v2-p2-lab.vercel.app/';
const OUT=resolve('artifacts/cas-head-v2-p2-browser');
mkdirSync(OUT,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage'
]});
const results=[];
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push('pageerror:'+e.message));
 page.on('crash',()=>errors.push('page crashed'));
 page.on('console',m=>{if(m.type()==='error' && !/favicon/i.test(m.text()))errors.push('console:'+m.text());});
 const checkStatus=async (wanted,contextName)=>{
  try {
   await page.waitForFunction(want=>document.getElementById('status')?.textContent?.includes(want),wanted,{timeout:90000});
  }catch{
   throw Error(contextName+': '+await page.locator('#status').textContent()+'; errors='+JSON.stringify(errors.slice(-8)));
  }
 };
 const hash=buf=>createHash('sha256').update(buf).digest('hex');
 for(const [width,height] of [[390,844],[320,568]]){
  errors.length=0;
  await page.setViewportSize({width,height});
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
  await checkStatus('5 геометрических морфов','Alex derivative');
  const vp=await page.locator('#viewport').boundingBox();
  const panel=await page.locator('#panel').boundingBox();
  const canvasBox=await page.locator('#review-canvas').boundingBox();
  if(!vp||!panel||!canvasBox||vp.height<190||vp.y+vp.height>panel.y+2||Math.abs(canvasBox.height-vp.height)>2||Math.abs(canvasBox.width-vp.width)>2)
   throw Error('Face viewport obscured or WebGL canvas letterboxed on '+width+'×'+height+': '+JSON.stringify({vp,panel,canvasBox}));
  const imgBefore=await page.locator('#review-canvas').screenshot();
  await page.screenshot({path:resolve(OUT,htName(width,height,'alex-derived-0'))});
  await page.locator('#max').click();
  const sliders=await page.locator('[data-morph]').evaluateAll(els=>els.map(el=>Number(el.value)));
  if(sliders.length!==5||sliders.some(x=>x!==100))throw Error('Five 100% controls failed '+JSON.stringify(sliders));
  await page.waitForTimeout(500);
  const imgAfter=await page.locator('#review-canvas').screenshot();
  await page.screenshot({path:resolve(OUT,htName(width,height,'alex-derived-100'))});
  if(hash(imgBefore)===hash(imgAfter))throw Error('Five real morphs did not change on-screen pixels');
  await page.locator('[data-variant="original"]').click();
  await checkStatus('Оригинал без изменений','Original Alex');
  if(await page.locator('[data-morph]:not([disabled])').count())throw Error('Source original falsely editable');
  await page.screenshot({path:resolve(OUT,htName(width,height,'alex-original'))});
  await page.locator('[data-family="mira"]').click();
  await checkStatus('Оригинал без изменений','Original Mira');
  await page.locator('[data-variant="derived"]').click();
  await checkStatus('5 геометрических морфов','Mira derivative');
  await page.locator('#min').click();
  await page.screenshot({path:resolve(OUT,htName(width,height,'mira-derived-0'))});
  await page.locator('#max').click();
  await page.screenshot({path:resolve(OUT,htName(width,height,'mira-derived-100'))});
  await page.locator('#rotate').click();
  await page.locator('[data-view="body"]').click();
  await page.locator('[data-pose="walking"]').click();
  await page.waitForTimeout(550);
  await page.screenshot({path:resolve(OUT,htName(width,height,'mira-fullbody-angle-walk'))});
  const status=await page.locator('#status').textContent();
  if(!status.includes('художественный контроль НЕ пройден'))throw Error('WIP art rejection missing from status');
  if(errors.length)throw Error('Real WebGL page JS or browser errors '+JSON.stringify(errors));
  results.push({width,height,playCanvasWebGL:true,derivedMorphs:5,sourceUnchanged:true,
   bothFamilies:true,morphPixelsDiffer:true,viewportHeight:vp.height,canvasHeight:canvasBox.height,
   panelY:panel.y,mobileChrome:true,physicalIphoneSafariAccepted:false,ownerArtApproved:false});
  console.log('CAS_HEAD_V2_P2_MOBILE_WEBGL '+JSON.stringify(results.at(-1)));
 }
}finally{
 await browser.close();
 writeFileSync(resolve(OUT,'report.json'),JSON.stringify({staging:URL,results,artGate:'REJECTED',iphoneSafariVerified:false},null,2));
}
function htName(w,h,slug){return w+'x'+h+'-'+slug+'.png';}
