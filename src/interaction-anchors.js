/**
 * LifeSim Interaction Anchors — engine-agnostic furniture interaction geometry.
 * Unit: game-world meters. No PlayCanvas import, DOM, mesh bounds or saved fields.
 *
 * Coordinate contract:
 *  - furniture.origin is the center of its seating surface in world X/Z;
 *  - yaw degrees rotates furniture's local +Z toward the FRONT of the seat;
 *  - seatHeight is the physical Y of the seat surface (not the couch root);
 *  - seat slot contact anchor is on the top of the cushion;
 *  - contactLocal is the character's ANIMATED seat contact in model space;
 *  - model scale is measured once from stable geometry, NOT per furniture.
 *
 * InteractionController applies the returned root correction as the single
 * source of seating placement. Procedural sofa root Y and imported motion must
 * not be added again, or penetration is inevitable.
 */
const finite=(n,label)=>{
  if(!Number.isFinite(n))throw new TypeError(label+' must be finite');
  return n;
};
const positive=(n,label)=>{
  finite(n,label);
  if(n<=0)throw new RangeError(label+' must be > 0');
  return n;
};
const vec=(v,name)=>{
  if(!v||typeof v!=='object')throw new TypeError(name+' must be a vector');
  return {x:finite(v.x,name+'.x'),y:finite(v.y,name+'.y'),z:finite(v.z,name+'.z')};
};
const clamp01=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
export const smoothContactWeight=w=>{
  const t=clamp01(w);
  return t*t*(3-2*t);
};
export function rotateSeatVector({x,y,z},yawDegrees){
  const a=finite(yawDegrees,'yaw')*Math.PI/180;
  const c=Math.cos(a),s=Math.sin(a);
  return {x:x*c+z*s,y,z:-x*s+z*c};
}
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(a,k)=>({x:a.x*k,y:a.y*k,z:a.z*k});

/** A furniture TYPE provides dimensions; instances supply transforms/slot count.
 * No avatar-specific constants are stored inside a seat.
 */
export function createSeatSurface({
  id,origin,yaw=0,width,depth,seatHeight,floorY=0,
  slots=1,sideMargin=.20,backClearance=.10,approachGap=.50
}={}){
  if(typeof id!=='string'||!id.trim())throw new TypeError('Furniture id required');
  const center=vec(origin,'origin');
  positive(width,'width');positive(depth,'depth');finite(seatHeight,'seatHeight');
  finite(floorY,'floorY');finite(yaw,'yaw');
  if(seatHeight<=floorY)throw new RangeError('Seat must be above floor');
  if(!Number.isInteger(slots)||slots<1)throw new RangeError('Invalid number of seats');
  if(sideMargin<0||!Number.isFinite(sideMargin)||sideMargin*2>=width)
    throw new RangeError('Invalid seat margin');
  if(backClearance<0||backClearance>=depth||!Number.isFinite(backClearance))
    throw new RangeError('Invalid back clearance');
  if(approachGap<0||!Number.isFinite(approachGap))
    throw new RangeError('Invalid approach gap');
  return Object.freeze({
    id,origin:Object.freeze(center),yaw,width,depth,seatHeight,floorY,slots,
    sideMargin,backClearance,approachGap
  });
}

/** Stable slot markers rotate with the couch; no different code for chairs. */
export function seatSlot(surface,index){
  if(!Number.isInteger(index)||index<0||index>=surface.slots)
    throw new RangeError('Seat index out of range');
  const usable=surface.width-2*surface.sideMargin;
  const localX=surface.slots===1?0:
    -usable/2+usable*index/(surface.slots-1);
  // The contact anchor lies near seat center, clear of the backrest.
  const sitZ=surface.depth/2-surface.backClearance-surface.depth/2;
  const seat=add({x:surface.origin.x,y:surface.seatHeight,z:surface.origin.z},
    rotateSeatVector({x:localX,y:0,z:sitZ},surface.yaw));
  const front=add({x:surface.origin.x,y:surface.floorY,z:surface.origin.z},
    rotateSeatVector({x:localX,y:0,z:surface.depth/2},surface.yaw));
  const approach=add({x:surface.origin.x,y:surface.floorY,z:surface.origin.z},
    rotateSeatVector({x:localX,y:0,z:surface.depth/2+surface.approachGap},surface.yaw));
  return Object.freeze({id:surface.id+':'+index,index,
    contact:Object.freeze(seat),approach:Object.freeze(approach),
    front:Object.freeze(front),yaw:surface.yaw,
    floorY:surface.floorY});
}

/** In-place placement: align pose-specific butt contact to sofa's surface.
 * This is the only positional solver; animation supplies the body pose.
 */
export function solveSeatRoot({seat,contactLocal,scale,yaw=seat?.yaw,
  clearance=.012}={}){
  if(!seat||!seat.contact)throw new TypeError('Seat contact required');
  const target=vec(seat.contact,'seat.contact');
  const contact=vec(contactLocal,'contactLocal');
  positive(scale,'scale');finite(yaw,'yaw');finite(clearance,'clearance');
  if(clearance<0)throw new RangeError('Negative clearance');
  const worldOffset=rotateSeatVector(mul(contact,scale),yaw);
  return sub({x:target.x,y:target.y+clearance,z:target.z},worldOffset);
}

/** During enter / exit, blend root toward contact-solved placement by the
 * animation contact weight. The foot IK layer is a separate second pass.
 * Avoid adding a second sofa-specific Y-offset after this function.
 */
export function blendSeatRoot({freeRoot,seatedRoot,weight}={}){
  const a=vec(freeRoot,'freeRoot'),b=vec(seatedRoot,'seatedRoot');
  const t=smoothContactWeight(weight);
  return add(mul(a,1-t),mul(b,t));
}

/** Shared stand-on-floor targets for future two-bone foot IK; directions are
 * authored relative to the furniture, not camera or per-model pixels.
 */
export function seatFootTargets({seat,halfStance=.16,forward=.42,sideSigns=[-1,1]}={}){
  if(!seat||!seat.contact)throw new TypeError('Seat contact required');
  positive(halfStance,'halfStance');positive(forward,'forward');
  if(!Array.isArray(sideSigns)||sideSigns.length!==2||
    !sideSigns.every(s=>s===1||s===-1)||sideSigns[0]===sideSigns[1])
    throw new RangeError('Invalid rig foot side mapping');
  const center={x:seat.contact.x,y:seat.floorY,z:seat.contact.z};
  const displacement=rotateSeatVector({x:0,y:0,z:forward},seat.yaw);
  return sideSigns.map(sign=>{
    const x=sign*halfStance;
    const lateral=rotateSeatVector({x,y:0,z:0},seat.yaw);
    return add(center,add(displacement,lateral));
  });
}


/** Two-bone IK target geometry (hip, knee, ankle/foot).
 * Pure and renderer-independent. The runtime rotates the upper/lower bones
 * to these directions AFTER the authored animation pose has been evaluated.
 * Unreachable targets are clamped to physical limb extension.
 */
export function solveTwoBoneTargets({hip,knee,ankle,target,pole=null,
  maxStretch=.995}={}) {
  const h=vec(hip,'hip'),k=vec(knee,'knee'),a=vec(ankle,'ankle');
  const goal=vec(target,'target');
  if(!(maxStretch>0&&maxStretch<=1))throw new RangeError('Invalid IK maxStretch');
  const length=v=>Math.hypot(v.x,v.y,v.z);
  const dot=(x,y)=>x.x*y.x+x.y*y.y+x.z*y.z;
  const lenUpper=length(sub(k,h)),lenLower=length(sub(a,k));
  if(lenUpper<.02||lenLower<.02)throw new RangeError('Degenerate leg');
  const normalize=v=>mul(v,1/Math.max(1e-9,length(v)));
  const direction=normalize(sub(goal,h));
  const requested=length(sub(goal,h));
  const low=Math.abs(lenUpper-lenLower)+.001;
  const high=(lenUpper+lenLower)*maxStretch;
  const dist=Math.min(high,Math.max(low,requested));
  const reached=add(h,mul(direction,dist));
  const along=(lenUpper*lenUpper+dist*dist-lenLower*lenLower)/(2*dist);
  const altitude=Math.sqrt(Math.max(0,lenUpper*lenUpper-along*along));
  const currentPole=pole?sub(vec(pole,'pole'),h):sub(k,h);
  let perpendicular=sub(currentPole,mul(direction,dot(currentPole,direction)));
  if(length(perpendicular)<1e-6){
    const fallback=Math.abs(direction.y)<.95?{x:0,y:1,z:0}:{x:0,y:0,z:1};
    perpendicular=sub(fallback,mul(direction,dot(fallback,direction)));
  }
  perpendicular=normalize(perpendicular);
  const middle=add(add(h,mul(direction,along)),mul(perpendicular,altitude));
  return {knee:middle,ankle:reached,reachable:requested<=high&&requested>=low,
    lengthUpper:lenUpper,lengthLower:lenLower};
}


/**
 * Guarded vertical-only seat correction.
 * The game's approach/sofa timeline remains the ONLY X/Z authority. Imported
 * glTF hip translation is neutralized by the avatar animation adapter before
 * this call. The skinned pelvis probe controls Y only. This prevents a
 * world-space seat root solve from relocating the body behind the furniture.
 */
export function solveSeatHeightCorrection({
  seat,contactWorldY,weight=0,clearance=.02,maxCorrection=.28
}={}) {
  if(!seat?.contact)throw new TypeError('Seat contact required');
  finite(seat.contact.y,'seat.contact.y');
  finite(contactWorldY,'contactWorldY');
  finite(clearance,'clearance');positive(maxCorrection,'maxCorrection');
  if(clearance<0)throw new RangeError('Negative seat clearance');
  const delta=seat.contact.y+clearance-contactWorldY;
  // A wildly mismatched contact indicates a wrong pose, clip or transform;
  // never move a visible character by arbitrary amounts to hide the error.
  if(Math.abs(delta)>maxCorrection)
    throw new RangeError('Unreliable pelvis contact: excessive height correction');
  return delta*smoothContactWeight(weight);
}

/**
 * The ankle's target should be in front of the seat's PHYSICAL FRONT EDGE,
 * not at a fixed distance from the pelvis. This prevents dangling calves
 * intersecting deep/short couches when the same rig uses different furniture.
 * footSoleDrop is calibrated once per rig from the skinned GLB toe/sole
 * vertices relative to the ankle bone at its seated pose.
 */
export function seatGroundedAnkleTargets({seat,scale,halfStance=.17,
  soleDrops=[.15,.15],frontClearance=.08,groundClearance=.008,
  sideSigns=[1,-1]}={}){
  if(!seat?.front||!seat?.contact)throw new TypeError('Seat front edge required');
  positive(scale,'scale');positive(halfStance,'halfStance');
  finite(frontClearance,'frontClearance');
  finite(groundClearance,'groundClearance');
  if(frontClearance<0||groundClearance<0)throw new RangeError('Negative clearance');
  if(!Array.isArray(soleDrops)||soleDrops.length!==2||
    !soleDrops.every(n=>Number.isFinite(n)&&n>0))
    throw new RangeError('Invalid sole markers');
  if(!Array.isArray(sideSigns)||sideSigns.length!==2||
    !sideSigns.every(n=>n===1||n===-1)||sideSigns[0]===sideSigns[1])
    throw new RangeError('Invalid foot side signs');
  return sideSigns.map((side,i)=>{
    const frontShift=rotateSeatVector({
      x:side*halfStance,y:0,z:frontClearance
    },seat.yaw);
    return {
      x:seat.front.x+frontShift.x,
      y:seat.floorY+soleDrops[i]*scale+groundClearance,
      z:seat.front.z+frontShift.z
    };
  });
}
