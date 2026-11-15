/** Camera-following, screen-space feedback, with original tiny SVG signs.
 * Render-only: this file never alters mood, scores, relationships or saves.
 */
import {SOCIAL_OUTCOMES,SOCIAL_OUTCOME_LABELS,reactionBadgePoint} from './social-feedback.js';
const glyphs=Object.freeze({
  // Dawn/spark for warmth (not an automatic romance heart).
  warm:'<circle cx="20" cy="20" r="6"/><path d="M20 4v7m0 18v7M4 20h7m18 0h7M9 9l5 5m12 12 5 5M31 9l-5 5M14 26l-5 5"/>',
  neutral:'<circle cx="20" cy="20" r="15"/><path d="M13 17h1m12 0h1M12 23q8 11 16 0"/>',
  awkward:'<circle cx="20" cy="20" r="15"/><path d="M12 16l5 2m11-2-5 2M13 26q4-4 7 0t7 0M8 23l3 2m18-2 3 2"/>',
  defensive:'<path d="M20 4 33 10v10q0 11-13 16Q7 31 7 20V10Z"/><path d="M13 21l5 5 10-12"/>',
  hostile:'<path d="M20 3 26 13 37 10 32 21 37 30 25 29 20 38 14 29 3 30 8 21 3 10 14 13Z"/><path d="M13 19l5 4m9-4-5 4M15 29h10"/>',
  refused:'<circle cx="20" cy="20" r="16"/><path d="M12 29V19m5 2V12m5 8V9m5 12v-9m-15 7q-3-4-5-1 0 12 13 14 11-1 11-12"/>'
});
const graphic=k=>'<svg viewBox="0 0 40 40" width="30" height="30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">'+glyphs[k]+'</svg>';
export const REACTION_BADGE_SECONDS=2.6;

/** One ephemeral badge per identity; new results replace old ones.
 * update() tracks animated head transforms and camera orbit every frame.
 */
export function createReactionBadges(layer){
  const badges=new Map();
  function remove(id){
    const state=badges.get(id);
    if(state)state.element.remove();
    badges.delete(id);
  }
  function show(receipts){
    for(const receipt of receipts||[]){
      if(!SOCIAL_OUTCOMES.includes(receipt?.outcome)||
        typeof receipt?.responderId!=='string')continue;
      const id=receipt.responderId;
      remove(id);
      const element=document.createElement('div');
      element.className='reaction-badge';
      element.dataset.outcome=receipt.outcome;
      element.setAttribute('aria-label',SOCIAL_OUTCOME_LABELS[receipt.outcome]);
      // This is a compile-time allowlisted SVG constant, never data from a save.
      element.innerHTML=graphic(receipt.outcome);
      const label=document.createElement('span');
      label.textContent=SOCIAL_OUTCOME_LABELS[receipt.outcome];
      element.append(label);
      layer.append(element);
      badges.set(id,{element,left:REACTION_BADGE_SECONDS});
    }
  }
  function update({dt=0,paused=false,camera,pc,canvas,rigs,visible={}}={}){
    for(const [id,state] of badges){
      if(!paused)state.left-=Math.max(0,Math.min(dt,.06));
      if(state.left<=0){remove(id);continue;}
      const rig=rigs?.[id];
      if(!rig||visible[id]===false){state.element.hidden=true;continue;}
      const entity=rig.head||rig.avatar;
      if(!entity){state.element.hidden=true;continue;}
      const position=entity.getPosition();
      // Above the measured moving head (fallback body root gets actor height).
      const headLift=rig.head?.getPosition?0.40:1.95;
      const point=new pc.Vec3(position.x,position.y+headLift,position.z);
      const screen=camera.camera.worldToScreen(point);
      const inCamera=camera.camera.viewMatrix.transformPoint(point);
      const projected=reactionBadgePoint(screen,inCamera,
        canvas.clientWidth,canvas.clientHeight);
      state.element.hidden=!projected;
      if(projected){
        state.element.style.left=projected.x+'px';
        state.element.style.top=projected.y+'px';
        state.element.style.opacity=state.left<.35?String(state.left/.35):'1';
      }
    }
  }
  function clear(){for(const id of [...badges.keys()])remove(id);}
  return {show,update,clear,count:()=>badges.size};
}
