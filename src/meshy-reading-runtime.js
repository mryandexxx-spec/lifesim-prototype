import {solveTwoBoneTargets} from './interaction-anchors.js';

/** H1 visual-only: closed book while carried, open spread while seated.
 * No action/XP/save writes.
 */
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
  const hips=model.findByName('mixamorig:Hips');
  const book=new pc.Entity('Meshy '+resident+' reading book');
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
  // Two genuinely different book meshes. Merely hiding the pages of the
  // wide, flat spread leaves a green OPEN cover in the carrier's hand.
  // The smaller closed hardcover has a single front, spine and page block.
  const openCover=piece('open green cover',0,-.028,0,.47,.022,.29,cover);
  const leftPage=piece('left story pages',-.115,-.010,0,.22,.020,.267,paper);
  const rightPage=piece('right story pages',.115,-.010,0,.22,.020,.267,paper);
  const openSpine=piece('open book spine',0,0,0,.018,.027,.274,ink);
  const leaf=piece('turning leaf',0,.009,0,.216,.005,.261,paper);
  const pageTarget=new pc.Vec3(),forward=new pc.Vec3(0,0,1);
  const closedBook=new pc.Entity('closed hardcover');
  book.addChild(closedBook);
  function closedPiece(name,x,y,z,w,h,d,mat){
    const e=new pc.Entity(name);
    closedBook.addChild(e);
    e.addComponent('render',{type:'box',material:mat});
    e.setLocalPosition(x,y,z);
    e.setLocalScale(w,h,d);
    return e;
  }
  closedPiece('back green cover',0,-.038,0,.264,.012,.304,cover);
  closedPiece('closed cream pages',.009,0,.004,.238,.059,.276,paper);
  closedPiece('front green cover',0,.038,0,.264,.012,.304,cover);
  closedPiece('bound green spine',-.127,0,0,.017,.082,.304,cover);
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
  const atHand=new pc.Vec3(),lapOffset=new pc.Vec3(),
    lapLocal=new pc.Vec3(0,.14,.32);
  // A closed volume stays attached to the REAL animated right wrist while
  // walking; an opened spread rests above the thighs when seated.
  function bookPose(stage,stepElapsed=0){
    if(!heldStages.has(stage))return false;
    const opening=readingStages.has(stage);
    const open=stage==='opening'
      ?Math.min(1,Math.max(0,stepElapsed/2.4))
      :stage==='closing'
        ?1-Math.min(1,Math.max(0,stepElapsed/2.4))
        :opening?1:0;
    const spreadVisible=open>.015;
    // Keep the single closed hardcover visible during ALL travel phases
    // (taking/toSeat/standing/returnShelf/returning). Only the seated
    // opening/reading/closing sequence may display the wide two-page spread.
    closedBook.enabled=!spreadVisible;
    openCover.enabled=spreadVisible;
    openSpine.enabled=spreadVisible;
    leftPage.enabled=spreadVisible;
    rightPage.enabled=spreadVisible;
    const turn=stage==='reading'?clamp01(((current?.elapsed||0)%7-5.4)):0;
    leaf.enabled=spreadVisible&&turn>0&&turn<1;
    if(leaf.enabled){
      const angle=Math.PI*turn;
      leaf.setLocalPosition(.108*Math.cos(angle),.009+.108*Math.sin(angle),0);
      leaf.setLocalEulerAngles(0,0,turn*180);
    }
    if(spreadVisible){
      leftPage.setLocalEulerAngles(0,0,-(1-open)*65);
      rightPage.setLocalEulerAngles(0,0,(1-open)*65);
    }
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
    avatar.getWorldTransform().transformVector(forward,point);
    const yaw=Math.atan2(point.x,point.z)*180/Math.PI;
    if(!open){
      // PlayCanvas child book node uses world placement so it follows the
      // animated Mixamo hand without needing a second skeleton attachment.
      const wrist=arms[1].hand.getPosition();
      atHand.set(wrist.x,wrist.y-.085,wrist.z+.025);
      book.setPosition(atHand.x,atHand.y,atHand.z);
      // Rotate the compact closed volume like a book held by its spine,
      // rather than the flat double-width spread visible in the screenshot.
      book.setEulerAngles(67,yaw-12,18);
      return true;
    }
    if(hips?.getPosition){
      // The seat animation moves actual Mixamo pelvis bones. Attach the
      // spread above THOSE thighs, not at a fixed floating world height.
      const hip=hips.getPosition();
      avatar.getWorldTransform().transformVector(lapLocal,lapOffset);
      book.setPosition(hip.x+lapOffset.x,hip.y+lapOffset.y,
        hip.z+lapOffset.z);
      book.setEulerAngles(-19,yaw,0);
    }else{
      // Rig fallback for future skeletons without an audited hips bone.
      book.setLocalPosition(0,.72,.33);
      book.setLocalEulerAngles(-19,0,0);
    }
    let moved=false;
    for(let index=0;index<arms.length;index++){
      const arm=arms[index],shoulder=xyz(arm.upper.getPosition()),
        elbow=xyz(arm.fore.getPosition()),wrist=xyz(arm.hand.getPosition());
      const x=arm.sign*.17+(index===1?intent.pageTurn*.22:0);
      book.getWorldTransform().transformPoint(
        pageTarget.set(x,.025+(index===1?intent.pageTurn*.11:0),.025),point);
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
      neckTilt.setFromEulerAngles(9*Math.max(.35,intent.weight),
        3*Math.sin(current.elapsed*1.25),-1.2*intent.pageTurn);
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
      else {
        closedBook.enabled=false;
        openCover.enabled=false;
        openSpine.enabled=false;
        leftPage.enabled=false;
        rightPage.enabled=false;
      }
    },
    apply
  };
}
