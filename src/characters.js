/**
 * LifeSim 0.6b.1 — articulated upper spine and elbow pivots for a readable gait.
 *
 * IMPORTANT: PlayCanvas primitive scales are FULL diameters, NOT radii.
 * The first 0.5a release treated them as radii, producing floating eyes,
 * protruding mouths and excessive hair spheres visible in real iPhone QA.
 * Facial positions are now calculated against the ellipsoid surface.
 * No imported engine, DOM, game logic, save format or runtime mesh rebuilds.
 * Sleeve and leg ellipsoids overlap torso/pelvis at the pose pivots, rather
 * than looking like loose balls attached to the character.
 */
import {LEG_GEOMETRY} from './pose-config.js';

const APPEARANCE={
  alex:{
    name:'Алекс',silhouette:'side-part',bodyWidth:.59,
    skin:'#c79176',hair:'#493b34',top:'#438e79',
    pants:'#52697c',shoes:'#3e4c4a',mouth:'#995f5c',
    select:'#65b98a',collar:'#c4dac7'
  },
  mira:{
    name:'Мира',silhouette:'close-bob',bodyWidth:.56,
    skin:'#d7a188',hair:'#744e55',top:'#bc7c8c',
    pants:'#687b86',shoes:'#e6e3dc',mouth:'#a06870',
    select:'#dd8d9e',collar:'#ead0d1'
  }
};
export const CHARACTER_PROFILES=Object.freeze(Object.fromEntries(
  Object.entries(APPEARANCE).map(([id,profile])=>[id,Object.freeze({...profile})])
));
export const CHARACTER_IDS=Object.freeze(Object.keys(CHARACTER_PROFILES));
export const HEAD_DIMENSIONS=Object.freeze({width:.48,height:.54,depth:.43});

/** The front surface of the head ellipsoid, measured from its centre.
 * All arguments are world-units relative to the centre of the head.
 */
export function faceSurfaceDepth(x,y) {
  const rx=HEAD_DIMENSIONS.width/2;
  const ry=HEAD_DIMENSIONS.height/2;
  const rz=HEAD_DIMENSIONS.depth/2;
  return rz*Math.sqrt(Math.max(0,1-(x/rx)**2-(y/ry)**2));
}

export function createCharacterRig({pc,root,ball,box,cylinder,mat,materials},id) {
  const p=CHARACTER_PROFILES[id];
  if(!p)throw new RangeError('Unknown resident: '+id);
  const skin=mat(p.skin),hair=mat(p.hair),top=mat(p.top),
    trousers=mat(p.pants),shoes=mat(p.shoes),mouth=mat(p.mouth),collar=mat(p.collar);
  const avatar=new pc.Entity(p.name);
  root.addChild(avatar);
  const name=p.name;
  const headY=id==='mira'?1.54:1.55;
  // Spine rotates about waist instead of turning only the torso ellipsoid.
  // Original world-space body coordinates are preserved by subtracting .73.
  const upperBody=new pc.Entity(name+' waist');
  avatar.addChild(upperBody);
  upperBody.setLocalPosition(0,.73,0);
  const upperBall=(n,x,y,z,sx,sy,sz,material)=>
    ball(n,x,y-.73,z,sx,sy,sz,material,upperBody);
  const upperCylinder=(n,x,y,z,sx,sy,sz,material)=>
    cylinder(n,x,y-.73,z,sx,sy,sz,material,upperBody);

  // The pelvis overlaps both trouser legs and the lower torso. Shoulder
  // width intersects the upper sleeves at the existing animation pivots.
  const pelvis=ball(name+' pelvis',0,.73,0,.46,.30,.32,trousers,avatar);
  const torso=upperBall(name+' torso',0,.99,0,p.bodyWidth,.70,.355,top);
  const outfitMeshes=[pelvis,torso];
  outfitMeshes.push(upperBall(name+' collar',0,1.245,.164,.16,.055,.032,collar));
  upperCylinder(name+' neck',0,1.303,0,.115,.17,.116,skin);
  const head=upperBall(name+' head',0,headY,0,
    HEAD_DIMENSIONS.width,HEAD_DIMENSIONS.height,HEAD_DIMENSIONS.depth,skin);

  // Closely fitting hair masses. No protruding Mickey-ear buns or detached curls.
  upperBall(name+' hair cap',0,1.75,-.065,.49,.25,.41,hair);
  if(id==='alex'){
    upperBall(name+' short fringe',-.095,1.755,.115,.20,.085,.10,hair);
    upperBall(name+' side part',.107,1.765,.083,.18,.080,.11,hair);
  }else{
    upperBall(name+' rear bob',0,1.485,-.135,.455,.47,.285,hair);
    upperBall(name+' left bob',-.215,1.558,-.06,.092,.31,.165,hair);
    upperBall(name+' right bob',.215,1.558,-.06,.092,.31,.165,hair);
    upperBall(name+' side part',-.09,1.755,.12,.20,.075,.095,hair);
  }

  // Small, near-flush eyes. Eye pivots preserve the old sleep-blink contract.
  // Avoid separate big white/iris/glint spheres that look like googly eyes.
  const eyes=[],brows=[];
  for(const [side,x] of [['left',-.10],['right',.10]]){
    const group=new pc.Entity(name+' '+side+' eye');
    upperBody.addChild(group);
    const y=headY+.035;
    group.setLocalPosition(x,y-.73,faceSurfaceDepth(x,y-headY)+.003);
    ball(name+' '+side+' pupil',0,0,.004,.052,.060,.021,materials.black,group);
    ball(name+' '+side+' catchlight',-.012,.015,.017,.013,.014,.008,materials.cream,group);
    const brow=upperBall(name+' '+side+' eyebrow',x,headY+.135,
      faceSurfaceDepth(x,.135)+.002,.083,.017,.015,hair);
    brows.push(brow);
    eyes.push(group);
  }
  upperBall(name+' subtle nose',0,headY-.048,
    faceSurfaceDepth(0,-.048)+.002,.030,.041,.024,skin);
  const smile=upperBall(name+' little smile',0,headY-.132,
    faceSurfaceDepth(0,-.132)+.003,.095,.017,.018,mouth);

  // Exactly the same hip/shoulder pivot positions as the accepted 0.4b rigs.
  const anklePivot=[],legPivot=[],kneePivot=[],armPivot=[],elbowPivot=[],shoeMeshes=[];
  for(const [side,x] of [['left',-.15],['right',.15]]){
    const hip=new pc.Entity(name+' '+side+' hip');
    avatar.addChild(hip);
    hip.setLocalPosition(x,LEG_GEOMETRY.hipHeight,0);
    outfitMeshes.push(ball(name+' '+side+' trouser leg',0,LEG_GEOMETRY.thighCenterY,0,
      .18,LEG_GEOMETRY.thighHeight,.19,trousers,hip));
    const knee=new pc.Entity(name+' '+side+' knee');
    hip.addChild(knee);
    knee.setLocalPosition(0,LEG_GEOMETRY.kneeOffsetY,0);
    outfitMeshes.push(ball(name+' '+side+' shin',0,LEG_GEOMETRY.shinCenterY,0,
      .163,LEG_GEOMETRY.shinHeight,.185,trousers,knee));
    const ankle=new pc.Entity(name+' '+side+' ankle');
    knee.addChild(ankle);ankle.setLocalPosition(0,LEG_GEOMETRY.shoeCenterY,0);
    anklePivot.push(ankle);
    const shoe=ball(name+' '+side+' shoe',0,0,.077,
      .22,LEG_GEOMETRY.shoeHeight,.31,shoes,ankle);
    // Rotate the existing shoe for subtle toe lift, without allocating an ankle mesh.
    shoeMeshes.push(shoe);outfitMeshes.push(shoe);legPivot.push(hip);kneePivot.push(knee);
  }
  for(const [side,x] of [['left',-.33],['right',.33]]){
    const pivot=new pc.Entity(name+' '+side+' shoulder');
    upperBody.addChild(pivot);
    pivot.setLocalPosition(x,1.17-.73,0);
    // The sleeve is a slender vertical volume, not a round shoulder ball.
    // Its upper end moves inward under the torso to hide the shoulder seam;
    // the skin forearm starts inside its lower end, and the hand overlaps it.
    const towardTorso=side==='left' ? .065 : -.065;
    outfitMeshes.push(ball(name+' '+side+' shirt sleeve',towardTorso,-.150,0,.160,.385,.175,top,pivot));
    const elbow=new pc.Entity(name+' '+side+' elbow');
    pivot.addChild(elbow);
    elbow.setLocalPosition(0,-.28,0);
    // Lower arm keeps its original outline in idle, but now flexes in walk.
    ball(name+' '+side+' forearm',0,-.058,0,.122,.385,.138,skin,elbow);
    ball(name+' '+side+' hand',0,-.253,.012,.108,.129,.109,skin,elbow);
    armPivot.push(pivot);elbowPivot.push(elbow);
  }
  const snack=ball(name+' apple',0,-.23,.12,.20,.17,.20,materials.yellow,elbowPivot[1]);
  const book=box(name+' book',0,-.23,.12,.28,.065,.29,materials.green,elbowPivot[1]);
  // Visible original brush fallback when a Meshy skinned rig is unavailable.
  const paintbrush=cylinder(name+' painting brush',0,-.26,.24,.028,.31,.028,
    materials.wood||materials.dark||materials.green,elbowPivot[1]);
  paintbrush.setLocalEulerAngles(65,0,0);paintbrush.enabled=false;
  snack.enabled=false;book.enabled=false;
  // The privacy costume is an opaque, fully covering bath wrap, never a nude mesh.
  // It is only activated while the resident is hidden by the privacy enclosure.
  const showerWrap=ball(name+' modest shower wrap',0,.84,0,.70,1.48,.52,
    materials.mint||materials.cream,avatar);
  showerWrap.enabled=false;
  const selected=cylinder(name+' selected',0,.018,0,.79,.025,.79,
    mat(p.select,{opacity:.30}),avatar);
  return {
    avatar,head,torso,upperBody,pelvis,anklePivot,shoes:shoeMeshes,elbowPivot,
    leftEye:eyes[0],rightEye:eyes[1],brows,mouth:smile,
    legPivot,kneePivot,armPivot,snack,book,paintbrush,selected,outfitMeshes,showerWrap
  };
}

/** Fail-safe: no renderer frame can show a resident with clothes removed.
 * While the opaque screen is present we hide the avatar completely; the only
 * replacement is a fully covered bath wrap (also behind the screen).
 * On interruption, street clothes are restored before the avatar is revealed.
 */
export function applyShowerAppearance(rig,privacy,bathing){
  const masked=privacy===true;
  const changed=masked&&bathing===true;
  for(const item of rig.outfitMeshes)item.enabled=!changed;
  rig.showerWrap.enabled=changed;
  rig.avatar.enabled=!masked;
}
