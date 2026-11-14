/**
 * LifeSim 0.5a: original reusable procedural character rigs.
 * No PlayCanvas import or browser access: all engine dependencies are injected.
 * Retains v0.4b pivot and hand-prop contracts for animations and all saved actions.
 */
const APPEARANCE = {
  alex: {
    name: 'Алекс', silhouette: 'short-swept-hair', bodyWidth: 0.51,
    skin: '#c79176', hair: '#47362f', hairLight: '#6d4c3c',
    top: '#468b77', highlight: '#9bcbb4', pants: '#516477',
    shoes: '#3d4845', cheeks: '#d79d8a', lip: '#8d5950',
    select: '#65b98a', accessory: '#e9bf7f'
  },
  mira: {
    name: 'Мира', silhouette: 'soft-wavy-bob', bodyWidth: 0.47,
    skin: '#d8a087', hair: '#70464c', hairLight: '#a16e70',
    top: '#bf7788', highlight: '#e8afb3', pants: '#667982',
    shoes: '#ede5d6', cheeks: '#d9918d', lip: '#985d65',
    select: '#dd8d9e', accessory: '#efd3a4'
  }
};
export const CHARACTER_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(APPEARANCE).map(([key,profile])=>[key,Object.freeze({...profile})])
));
export const CHARACTER_IDS = Object.freeze(Object.keys(CHARACTER_PROFILES));

/** This module builds geometry once, at boot, never once per frame. */
export function createCharacterRig({pc,root,ball,box,cylinder,mat,materials},id) {
  const profile=CHARACTER_PROFILES[id];
  if(!profile) throw new RangeError('Unknown resident: '+id);
  const prefix=profile.name;
  const skin=mat(profile.skin), hair=mat(profile.hair), hairLight=mat(profile.hairLight),
    top=mat(profile.top), topHighlight=mat(profile.highlight), trousers=mat(profile.pants),
    shoes=mat(profile.shoes),cheeks=mat(profile.cheeks),lip=mat(profile.lip),
    accessory=mat(profile.accessory);
  const avatar=new pc.Entity(prefix);
  root.addChild(avatar);

  // Organic, tapered-looking layered ellipsoids replace sharp cubes.
  ball(prefix+' hips',0,.68,0,.48,.31,.34,trousers,avatar);
  const torso=ball(prefix+' torso',0,.99,0,profile.bodyWidth,.66,.37,top,avatar);
  ball(prefix+' upper chest',0,1.14,.035,profile.bodyWidth*.91,.26,.36,topHighlight,avatar);
  ball(prefix+' lower jacket',0,.79,.015,profile.bodyWidth*.99,.21,.37,top,avatar);
  cylinder(prefix+' neck',0,1.30,0,.145,.22,.15,skin,avatar);
  // A small shirt collar/brooch gives a readable silhouette at game-camera scale.
  ball(prefix+' collar',0,1.22,.275,.21,.11,.10,accessory,avatar);

  const headY=id==='mira'?1.57:1.55;
  ball(prefix+' head',0,headY,0,.49,.52,.46,skin,avatar);
  // Hair volume rather than a flat helmet.
  ball(prefix+' hair volume',0,1.82,-.065,.50,.30,.46,hair,avatar);
  ball(prefix+' crown highlight',-.11,1.985,-.035,.30,.08,.34,hairLight,avatar);
  if(id==='alex') {
    ball(prefix+' swept fringe left',-.18,1.80,.25,.30,.17,.32,hair,avatar);
    ball(prefix+' swept fringe right',.19,1.80,.20,.27,.14,.27,hair,avatar);
    ball(prefix+' side sweep',.27,1.73,.07,.17,.17,.30,hairLight,avatar);
    ball(prefix+' left hairline',-.43,1.65,-.08,.15,.25,.30,hair,avatar);
  } else {
    // Asymmetric wavy side locks and a rear bob distinctly differentiate Mira.
    ball(prefix+' left lock',-.42,1.53,-.035,.21,.47,.36,hair,avatar);
    ball(prefix+' right lock',.40,1.48,-.075,.19,.51,.32,hairLight,avatar);
    ball(prefix+' back hair',0,1.47,-.31,.49,.52,.25,hair,avatar);
    ball(prefix+' side fringe',-.19,1.81,.26,.32,.18,.26,hairLight,avatar);
    ball(prefix+' front curl',.28,1.79,.29,.21,.19,.22,hair,avatar);
  }

  // Eyes are grouped under pivots, so sleeping hides the complete eye geometry.
  const eyes=[];
  for (const [side,x] of [['left',-.155],['right',.155]]) {
    const eye=new pc.Entity(prefix+' '+side+' eye');
    avatar.addChild(eye);
    eye.setLocalPosition(x,headY+.015,.398);
    ball(prefix+' '+side+' white',0,0,-.003,.145,.137,.065,materials.cream,eye);
    ball(prefix+' '+side+' iris',0,-.006,.048,.074,.090,.048,materials.black,eye);
    ball(prefix+' '+side+' glint',-.018,.025,.086,.025,.027,.015,materials.white,eye);
    const brow=ball(prefix+' '+side+' eyebrow',x,headY+.175,.395,.19,.038,.051,hair,avatar);
    brow.setLocalEulerAngles(0,0,side==='left'?-10:10);
    eyes.push(eye);
  }
  ball(prefix+' little nose',0,headY-.080,.451,.084,.10,.095,skin,avatar);
  for (const [x,y] of [[-.065,headY-.230],[0,headY-.255],[.065,headY-.230]]) {
    ball(prefix+' smile',x,y,.387,.065,.032,.034,lip,avatar);
  }
  for(const x of [-.32,.32])
    ball(prefix+' blush',x,headY-.13,.30,.13,.067,.045,cheeks,avatar);

  // Same hip/shoulder pivot positions as 0.4b: walking/sitting/reaching still work.
  const legPivot=[],armPivot=[];
  for (const [side,x] of [['left',-.15],['right',.15]]) {
    const pivot=new pc.Entity(prefix+' '+side+' hip');
    avatar.addChild(pivot);pivot.setLocalPosition(x,.72,0);
    ball(prefix+' '+side+' trouser leg',0,-.28,0,.205,.52,.22,trousers,pivot);
    ball(prefix+' '+side+' ankle',0,-.52,.01,.15,.16,.17,trousers,pivot);
    ball(prefix+' '+side+' shoe',0,-.60,.105,.265,.17,.40,shoes,pivot);
    legPivot.push(pivot);
  }
  for (const [side,x] of [['left',-.33],['right',.33]]) {
    const pivot=new pc.Entity(prefix+' '+side+' shoulder');
    avatar.addChild(pivot);pivot.setLocalPosition(x,1.17,0);
    ball(prefix+' '+side+' sleeve',0,-.080,0,.225,.26,.235,top,pivot);
    ball(prefix+' '+side+' forearm',0,-.30,.008,.177,.39,.187,skin,pivot);
    ball(prefix+' '+side+' hand',0,-.505,.015,.20,.18,.19,skin,pivot);
    armPivot.push(pivot);
  }
  const snack=ball(prefix+' apple',0,-.51,.12,.20,.17,.20,materials.yellow,armPivot[1]);
  const book=box(prefix+' book',0,-.51,.12,.28,.065,.29,materials.green,armPivot[1]);
  snack.enabled=false;book.enabled=false;
  const selected=cylinder(prefix+' selection ring',0,.018,0,.82,.025,.82,
    mat(profile.select,{opacity:.30}),avatar);
  return {
    avatar,torso,
    leftEye:eyes[0],rightEye:eyes[1],
    legPivot,armPivot,snack,book,selected
  };
}
