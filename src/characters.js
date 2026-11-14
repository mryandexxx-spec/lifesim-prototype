/**
 * LifeSim 0.5b.1 — connected shoulder and limb silhouettes.
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

  // The pelvis overlaps both trouser legs and the lower torso. Shoulder
  // width intersects the upper sleeves at the existing animation pivots.
  ball(name+' pelvis',0,.73,0,.46,.30,.32,trousers,avatar);
  const torso=ball(name+' torso',0,.99,0,p.bodyWidth,.70,.355,top,avatar);
  ball(name+' collar',0,1.245,.164,.16,.055,.032,collar,avatar);
  cylinder(name+' neck',0,1.303,0,.115,.17,.116,skin,avatar);
  ball(name+' head',0,headY,0,
    HEAD_DIMENSIONS.width,HEAD_DIMENSIONS.height,HEAD_DIMENSIONS.depth,skin,avatar);

  // Closely fitting hair masses. No protruding Mickey-ear buns or detached curls.
  ball(name+' hair cap',0,1.75,-.065,.49,.25,.41,hair,avatar);
  if(id==='alex'){
    ball(name+' short fringe',-.095,1.755,.115,.20,.085,.10,hair,avatar);
    ball(name+' side part',.107,1.765,.083,.18,.080,.11,hair,avatar);
  }else{
    ball(name+' rear bob',0,1.485,-.135,.455,.47,.285,hair,avatar);
    ball(name+' left bob',-.215,1.558,-.06,.092,.31,.165,hair,avatar);
    ball(name+' right bob',.215,1.558,-.06,.092,.31,.165,hair,avatar);
    ball(name+' side part',-.09,1.755,.12,.20,.075,.095,hair,avatar);
  }

  // Small, near-flush eyes. Eye pivots preserve the old sleep-blink contract.
  // Avoid separate big white/iris/glint spheres that look like googly eyes.
  const eyes=[],brows=[];
  for(const [side,x] of [['left',-.10],['right',.10]]){
    const group=new pc.Entity(name+' '+side+' eye');
    avatar.addChild(group);
    const y=headY+.035;
    group.setLocalPosition(x,y,faceSurfaceDepth(x,y-headY)+.003);
    ball(name+' '+side+' pupil',0,0,.004,.052,.060,.021,materials.black,group);
    ball(name+' '+side+' catchlight',-.012,.015,.017,.013,.014,.008,materials.cream,group);
    const brow=ball(name+' '+side+' eyebrow',x,headY+.135,
      faceSurfaceDepth(x,.135)+.002,.083,.017,.015,hair,avatar);
    brows.push(brow);
    eyes.push(group);
  }
  ball(name+' subtle nose',0,headY-.048,
    faceSurfaceDepth(0,-.048)+.002,.030,.041,.024,skin,avatar);
  const smile=ball(name+' little smile',0,headY-.132,
    faceSurfaceDepth(0,-.132)+.003,.095,.017,.018,mouth,avatar);

  // Exactly the same hip/shoulder pivot positions as the accepted 0.4b rigs.
  const legPivot=[],kneePivot=[],armPivot=[];
  for(const [side,x] of [['left',-.15],['right',.15]]){
    const hip=new pc.Entity(name+' '+side+' hip');
    avatar.addChild(hip);
    hip.setLocalPosition(x,LEG_GEOMETRY.hipHeight,0);
    ball(name+' '+side+' trouser leg',0,LEG_GEOMETRY.thighCenterY,0,
      .18,LEG_GEOMETRY.thighHeight,.19,trousers,hip);
    const knee=new pc.Entity(name+' '+side+' knee');
    hip.addChild(knee);
    knee.setLocalPosition(0,LEG_GEOMETRY.kneeOffsetY,0);
    ball(name+' '+side+' shin',0,LEG_GEOMETRY.shinCenterY,0,
      .163,LEG_GEOMETRY.shinHeight,.185,trousers,knee);
    ball(name+' '+side+' shoe',0,LEG_GEOMETRY.shoeCenterY,.077,
      .22,LEG_GEOMETRY.shoeHeight,.31,shoes,knee);
    legPivot.push(hip);kneePivot.push(knee);
  }
  for(const [side,x] of [['left',-.33],['right',.33]]){
    const pivot=new pc.Entity(name+' '+side+' shoulder');
    avatar.addChild(pivot);
    pivot.setLocalPosition(x,1.17,0);
    // The sleeve is a slender vertical volume, not a round shoulder ball.
    // Its upper end moves inward under the torso to hide the shoulder seam;
    // the skin forearm starts inside its lower end, and the hand overlaps it.
    const towardTorso=side==='left' ? .065 : -.065;
    ball(name+' '+side+' shirt sleeve',towardTorso,-.150,0,.160,.385,.175,top,pivot);
    ball(name+' '+side+' forearm',0,-.338,0,.122,.385,.138,skin,pivot);
    ball(name+' '+side+' hand',0,-.533,.012,.108,.129,.109,skin,pivot);
    armPivot.push(pivot);
  }
  const snack=ball(name+' apple',0,-.51,.12,.20,.17,.20,materials.yellow,armPivot[1]);
  const book=box(name+' book',0,-.51,.12,.28,.065,.29,materials.green,armPivot[1]);
  snack.enabled=false;book.enabled=false;
  const selected=cylinder(name+' selected',0,.018,0,.79,.025,.79,
    mat(p.select,{opacity:.30}),avatar);
  return {
    avatar,torso,leftEye:eyes[0],rightEye:eyes[1],brows,mouth:smile,
    legPivot,kneePivot,armPivot,snack,book,selected
  };
}
