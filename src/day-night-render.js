/** W1-A.2 PlayCanvas adapter. Reuses four Color buffers and existing lights.
 * No scene entities, light shadow maps, material edits or per-frame GL resources.
 * Import-free of PlayCanvas so a fake graphics harness can regression-test it.
 */
import {sampleWorldLighting} from './day-night-cycle.js';

export function createDayNightRenderer({scene,sun,fill,camera,Color}){
  if(!scene||!sun?.light||!fill?.light||!camera?.camera||typeof Color!=='function')
    throw new TypeError('Expected existing scene, Sun, Fill, camera, and Color constructor');
  const ambient=new Color(),sunColor=new Color(),fillColor=new Color(),sky=new Color();
  const setColor=(target,rgb)=>target.set(rgb[0],rgb[1],rgb[2]);
  let lastMinutes=null,lastAnchor=null,snapshot=null,updates=0;
  function update(calendar,minutes){
    // A saved date can be edited without a game tick, so the anchor participates
    // in memoization. All other old game state stays completely untouched.
    if(minutes===lastMinutes&&calendar?.startCivilDate===lastAnchor)return snapshot;
    const next=sampleWorldLighting(calendar,minutes);
    setColor(ambient,next.ambientColor);
    setColor(sunColor,next.sunlightColor);
    setColor(fillColor,next.fillColor);
    setColor(sky,next.backdropColor);

    scene.ambientLight=ambient;
    sun.light.color=sunColor;
    sun.light.intensity=next.sunlightIntensity;
    sun.setEulerAngles(next.sunPitch,next.sunYaw,0);
    fill.light.color=fillColor;
    fill.light.intensity=next.fillIntensity;
    camera.camera.clearColor=sky;
    // Do not mutate floor-lamp on/off states or special romantic-scene lights.
    snapshot=next;lastMinutes=minutes;lastAnchor=calendar.startCivilDate;updates++;
    return snapshot;
  }
  return Object.freeze({update,getSnapshot:()=>snapshot,getUpdateCount:()=>updates});
}
