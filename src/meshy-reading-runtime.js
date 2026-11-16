import {solveTwoBoneTargets} from './interaction-anchors.js';

/** H1 visual-only: an open book held in both Meshy hands. No action/XP/save writes. */
const clamp01=n=>Math.min(1,Math.max(0,n));
export function readingMotion(frame=null){
  // Inactive residents, pause/reset and first-frame startup pass null.
  // Destructuring null crashed the entire Safari render loop after GLB load.
  if(!frame||typeof frame!=='object')return null;
  const {active=false,elapsed=0}=frame;
  if(!active||!Number.isFinite(elapsed)||elapsed<0)return null;
  // Simulation minutes make page turns deterministic across 1x/3x and reload.
  const cycle=elapsed%7;
  const pageTurn=cycle>=5.4&&cycle<6.4
    ?Math.sin(Math.PI*(cycle-5.4)):0;
  return {weight:clamp01(elapsed/1.2),pageTurn};
}
export function createMeshyReadingController({pc,model,avatar,resident='Alex'}={}){
  const unavailable={ready:false,setFrame(){},apply(){return false;}};
  if(!pc?.Entity||!pc?.Vec3||!pc?.Quat||!pc?.StandardMaterial||
    !pc?.Color||!model?.findByName||!model?.getWorldTransform||
    !avatar?.getWorldTransform)return unavailable;
  const arms=['Left','Right'].map(side=>({
    sign:side==='Left'?1:-1,
    upper:model.findByName('mixamorig:'+side+'Arm'),
    fore:model.findByName('mixamorig:'+side+'ForeArm'),
    hand:model.findByName('mixamorig:'+side+'Hand')
  }));
  if(arms.some(a=>!a.upper?.getPosition||!a.upper?.getRotation||
    !a.upper?.setRotation||!a.fore?.getPosition||
    !a.fore?.getRotation||!a.fore?.setRotation||!a.hand?.getPosition))
    return unavailable;
  const neck=model.findByName('mixamorig:Neck');
  const book=new pc.Entity('Meshy '+resident+' open reading book');
  model.addChild(book);
  book.setLocalPosition(0,1.12,.36);
  book.setLocalEulerAngles(-14,0,0);
  function material(r,g,b){
    const mat=new pc.StandardMaterial();
    mat.diffuse=new pc.Color(r,g,b);
    mat.update();
    return mat;
  }
  const cover=material(.23,.48,.36),paper=material(.96,.91,.77),
    ink=material(.72,.73,.62);
  function piece(name,x,y,z,w,h,d,mat){
    const e=new pc.Entity(name);
    book.addChild(e);
    e.addComponent('render',{type:'box',material:mat});
    e.setLocalPosition(x,y,z);
    e.setLocalScale(w,h,d);
    return e;
  }
  // Stable original prop, separate from the hidden procedural elbow.
  piece('green reading cover',0,-.028,0,.47,.022,.29,cover);
  const leftPage=piece('left story pages',-.115,-.010,0,.22,.020,.267,paper);
  const rightPage=piece('right story pages',.115,-.010,0,.22,.020,.267,paper);
  piece('book spine',0,0,0,.018,.027,.274,ink);
  book.enabled=false;
  const from=new pc.Vec3(),to=new pc.Vec3(),swing=new pc.Quat(),
    desired=new pc.Quat(),blended=new pc.Quat(),point=new pc.Vec3(),
    poleDirection=new pc.Vec3(),poleWorld=new pc.Vec3(),
    neckTilt=new pc.Quat(),neckPose=new pc.Quat();
  const xyz=v=>({x:v.x,y:v.y,z:v.z});
  let current=null,paused=false;
  const heldStages=new Set(['taking','toSeat','sitting','opening','reading',
    'closing','standing','returnShelf','returning']);
  const readingStages=new Set(['opening','reading','closing']);
  const atHand=new pc.Vec3();
  // A closed volume stays attached to the REAL animated right wrist while
  // walking; an opened spread rests above the thighs when seated.
  function bookPose(stage,stepElapsed=0){
    if(!heldStages.has(stage))return false;
    const opening=readingStages.has(stage);
    leftPage.enabled=opening;
    rightPage.enabled=opening;
    if(stage==='taking'||stage==='returning'){
      const progress=Math.min(1,Math.max(0,stepElapsed/2.4));
      book.setLocalScale(stage==='taking'?Math.max(.01,progress):Math.max(.01,1-progress),
        1,1);
    }else book.setLocalScale(1,1,1);
    return opening;
  }
  function rotateToward(bone,oldEnd,newEnd,weight,maxDegrees){
    const origin=bone.getPosition();
    from.set(oldEnd.x-origin.x,oldEnd.y-origin.y,oldEnd.z-origin.z);
    to.set(newEnd.x-origin.x,newEnd.y-origin.y,newEnd.z-origin.z);
    if(from.length()<1e-5||to.length()<1e-5)return false;
    from.normalize();to.normalize();
    const cosine=Math.max(-1,Math.min(1,from.dot(to)));
    if(cosine>.99999)return false;
    const limit=Math.min(1,maxDegrees*Math.PI/180/Math.acos(cosine));
    swing.setFromDirections(from,to);
    const original=bone.getRotation();
    desired.mul2(swing,original);
    blended.slerp(original,desired,Math.min(.92,weight*limit));
    bone.setRotation(blended);
    return true;
  }
  function apply(){
    const intent=readingMotion(current);
    // Frozen Anim does not reset bones. Never compound rotation during pause.
    if(paused||!intent||!book.enabled)return false;
    const stage=current?.stage||'reading';
    if(stage==='reading'&&intent.weight<.005)return false;
    const open=bookPose(stage,current?.stepElapsed||0);
    if(!open){
      // PlayCanvas child book node uses world placement so it follows the
      // animated Mixamo hand without needing a second skeleton attachment.
      const wrist=arms[1].hand.getPosition();
      atHand.set(wrist.x,wrist.y-.06,wrist.z+.035);
      book.setPosition(atHand.x,atHand.y,atHand.z);
      book.setEulerAngles(0,0,0);
      return true;
    }
    book.setLocalPosition(0,.84,.38);
    book.setLocalEulerAngles(-19,0,0);
    let moved=false;
    for(let index=0;index<arms.length;index++){
      const arm=arms[index],shoulder=xyz(arm.upper.getPosition()),
        elbow=xyz(arm.fore.getPosition()),wrist=xyz(arm.hand.getPosition());
      const x=arm.sign*.17-(index===1?intent.pageTurn*.045:0);
      book.getWorldTransform().transformPoint(
        new pc.Vec3(x,.025,.025+(index===1?intent.pageTurn*.035:0)),point);
      poleDirection.set(arm.sign*.42,-.14,.18);
      avatar.getWorldTransform().transformVector(poleDirection,poleWorld);
      const upperLength=Math.hypot(elbow.x-shoulder.x,elbow.y-shoulder.y,elbow.z-shoulder.z);
      const lowerLength=Math.hypot(wrist.x-elbow.x,wrist.y-elbow.y,wrist.z-elbow.z);
      if(upperLength<.06||lowerLength<.06)continue;
      let solved;
      try{
        solved=solveTwoBoneTargets({
          hip:shoulder,knee:elbow,ankle:wrist,target:xyz(point),
          pole:{x:shoulder.x+poleWorld.x,y:shoulder.y+poleWorld.y,
            z:shoulder.z+poleWorld.z},maxStretch:.98
        });
      }catch{continue;}
      moved=rotateToward(arm.upper,elbow,solved.knee,Math.max(.35,intent.weight)*.88,75)||moved;
      moved=rotateToward(arm.fore,xyz(arm.hand.getPosition()),
        solved.ankle,Math.max(.35,intent.weight)*.88,105)||moved;
    }
    if(neck?.getLocalRotation&&neck?.setLocalRotation){
      neckTilt.setFromEulerAngles(7*Math.max(.35,intent.weight),0,0);
      neckPose.mul2(neck.getLocalRotation(),neckTilt);
      neck.setLocalRotation(neckPose);
      moved=true;
    }
    return moved;
  }
  return {
    ready:true,
    setFrame(frame,freeze=false){
      current=readingMotion(frame)?frame:null;
      paused=Boolean(freeze);
      const stage=current?.stage||'reading';
      book.enabled=Boolean(current&&heldStages.has(stage));
      if(book.enabled)bookPose(stage,current?.stepElapsed||0);
      else {leftPage.enabled=false;rightPage.enabled=false;}
    },
    apply
  };
}
