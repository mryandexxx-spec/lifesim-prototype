import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_IDS, CHARACTER_PROFILES, HEAD_DIMENSIONS, faceSurfaceDepth, createCharacterRig } from '../src/characters.js';
import { newHousehold,loadHousehold } from '../src/household.js';

class Entity {
  constructor(name) {this.name=name;this.children=[];this.enabled=true;}
  addChild(child) {this.children.push(child);child.parent=this;}
  setLocalPosition(x,y,z) {this.position={x,y,z};}
  setLocalEulerAngles(x,y,z) {this.rotation={x,y,z};}
}
function rigScene() {
  const root=new Entity('root'),created=[];
  const shape=(type)=>(name,x,y,z,sx,sy,sz,material,parent=root)=>{
    assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
    assert.ok(sx>0&&sy>0&&sz>0);
    const child=new Entity(name);
    child.type=type;child.scale={x:sx,y:sy,z:sz};child.material=material;
    child.setLocalPosition(x,y,z);parent.addChild(child);
    created.push(child);
    return child;
  };
  return {ctx:{
    pc:{Entity},root,ball:shape('sphere'),box:shape('box'),
    cylinder:shape('cylinder'),mat:(color,options={})=>({color,...options}),
    materials:{black:{color:'black'},cream:{color:'cream'},white:{color:'white'},
      yellow:{color:'yellow'},green:{color:'green'}}
  },created,root};
}
function traverse(entity) {
  return [entity,...entity.children.flatMap(traverse)];
}
test('two fixed original silhouettes have distinct clothing and hairstyles',()=>{
  assert.deepEqual(CHARACTER_IDS,['alex','mira']);
  assert.notEqual(CHARACTER_PROFILES.alex.hair,CHARACTER_PROFILES.mira.hair);
  assert.notEqual(CHARACTER_PROFILES.alex.silhouette,CHARACTER_PROFILES.mira.silhouette);
  assert.ok(CHARACTER_PROFILES.alex.bodyWidth>CHARACTER_PROFILES.mira.bodyWidth);
  assert.ok(Object.isFrozen(CHARACTER_PROFILES.alex));
});
test('constructor builds both rig contracts once with correct animated pivot geometry',()=>{
  const {ctx,root,created}=rigScene();
  const alex=createCharacterRig(ctx,'alex'),mira=createCharacterRig(ctx,'mira');
  assert.equal(root.children.length,2);
  for(const r of [alex,mira]) {
    assert.equal(r.legPivot.length,2);
    assert.equal(r.armPivot.length,2);
    assert.equal(r.elbowPivot.length,2);
    assert.equal(r.upperBody.parent,r.avatar);
    assert.equal(r.leftEye.parent,r.upperBody);
    assert.equal(r.rightEye.parent,r.upperBody);
    assert.equal(r.legPivot[0].position.y,.72);
    assert.equal(r.upperBody.position.y,.73);
    assert.equal(r.upperBody.position.y+r.armPivot[1].position.y,1.17);
    assert.equal(r.armPivot[1].parent,r.upperBody);
    assert.equal(r.elbowPivot[1].parent,r.armPivot[1]);
    assert.equal(r.snack.parent,r.elbowPivot[1]);
    assert.equal(r.book.parent,r.elbowPivot[1]);
    assert.equal(r.snack.enabled,false);
    assert.equal(r.book.enabled,false);
    assert.equal(r.selected.parent,r.avatar);
    assert.ok(traverse(r.avatar).some(e=>/eyebrow/.test(e.name)));
    assert.ok(traverse(r.avatar).some(e=>/smile/.test(e.name)));
    assert.ok(traverse(r.avatar).some(e=>/hair/.test(e.name)));
  }
  assert.notEqual(alex.avatar.name,mira.avatar.name);
  assert.ok(created.length>=48 && created.length<80,'Keep the static mobile geometry bounded');
});
test('rig only uses round geometry for person except the existing held book',()=>{
  const {ctx,created}=rigScene();
  createCharacterRig(ctx,'alex');
  createCharacterRig(ctx,'mira');
  const boxes=created.filter(e=>e.type==='box');
  assert.equal(boxes.length,2);
  assert.ok(boxes.every(e=>/book/.test(e.name)));
});
test('visual refresh does not change resident IDs or existing game save schema',()=>{
  const state=newHousehold();
  const initial=JSON.stringify(state);
  const {ctx}=rigScene();
  createCharacterRig(ctx,'alex');
  createCharacterRig(ctx,'mira');
  assert.equal(JSON.stringify(state),initial);
  const loaded=loadHousehold(JSON.parse(initial));
  assert.equal(loaded.version,1);
  assert.equal(loaded.selectedSim,'alex');
  assert.ok(loaded.otherSim);
});
test('invalid resident ID is explicitly rejected before constructing geometry',()=>{
  const {ctx,root}=rigScene();
  assert.throws(()=>createCharacterRig(ctx,'unknown'),RangeError);
  assert.equal(root.children.length,0);
});

test('facial details sit on head surface rather than floating in front of it',()=>{
  const {ctx,root}=rigScene();
  for(const id of CHARACTER_IDS){
    const rig=createCharacterRig(ctx,id);
    const body=traverse(rig.avatar);
    const head=body.find(e=>e.name.endsWith(' head'));
    assert.ok(head);
    assert.deepEqual(head.scale,{x:HEAD_DIMENSIONS.width,y:HEAD_DIMENSIONS.height,z:HEAD_DIMENSIONS.depth});
    for(const eye of [rig.leftEye,rig.rightEye]){
      assert.ok(eye.position.z>=.15 && eye.position.z<.225,
        'eye pivot should rest near the ellipsoid face, not 0.4 units away');
      const children=traverse(eye);
      assert.equal(children.filter(x=>/pupil$/.test(x.name)).length,1);
      assert.equal(children.filter(x=>/catchlight$/.test(x.name)).length,1);
      assert.ok(!children.some(x=>/white$|iris$|glint$/.test(x.name)));
    }
    const nose=body.find(x=>x.name.endsWith(' subtle nose'));
    const mouth=body.find(x=>x.name.endsWith(' little smile'));
    assert.ok(nose.position.z<.24 && mouth.position.z<.23);
    assert.ok(nose.scale.x<.05 && mouth.scale.y<.03);
  }
  assert.ok(faceSurfaceDepth(0,0)>.2 && faceSurfaceDepth(.10,.035)<faceSurfaceDepth(0,0));
});
test('hair volumes stay adjacent to the head, not as detached side clusters',()=>{
  const {ctx}=rigScene();
  for(const id of CHARACTER_IDS){
    const rig=createCharacterRig(ctx,id);
    for(const node of traverse(rig.avatar).filter(x=>/hair|bob|fringe|side part/.test(x.name))){
      if(!node.position)continue;
      assert.ok(Math.abs(node.position.x)<=.24);
      assert.ok(node.position.z<.17);
      assert.ok(node.scale.x<.55);
    }
  }
});

/** Signed x coordinates are in avatar space; spheres use full diameters. */
function ellipseRadiusXAtY(shape,atY) {
  const ry=shape.scale.y/2,rx=shape.scale.x/2;
  const offset=(atY-shape.position.y)/ry;
  return Math.abs(offset)<=1?rx*Math.sqrt(1-offset*offset):0;
}
test('sleeves connect inside the torso instead of bulging into detached shoulder balls',()=>{
  const {ctx}=rigScene();
  for(const id of CHARACTER_IDS) {
    const rig=createCharacterRig(ctx,id);
    const shapes=traverse(rig.avatar);
    const shirt=shapes.find(x=>x.name.endsWith(' torso'));
    assert.ok(shirt.scale.x>=.55);
    for(const [i,side] of ['left','right'].entries()){
      const pivot=rig.armPivot[i];
      const sleeve=traverse(pivot).find(x=>x.name.endsWith(' '+side+' shirt sleeve'));
      const arm=traverse(pivot).find(x=>x.name.endsWith(' '+side+' forearm'));
      const hand=traverse(pivot).find(x=>x.name.endsWith(' '+side+' hand'));
      assert.ok(sleeve&&arm&&hand);
      assert.ok(sleeve.scale.y>.35 && sleeve.scale.x<.17,
        'Long tapered-look sleeve should not be a shoulder bead');
      assert.ok(Math.abs(sleeve.position.x)>=.05,
        'Sleeve must be tucked inward toward the torso under the shoulder');
      const sleeveGlobalX=pivot.position.x+sleeve.position.x;
      const torsoEdge=ellipseRadiusXAtY(shirt,pivot.position.y);
      const sleeveEdge=Math.abs(sleeveGlobalX)-
        ellipseRadiusXAtY(sleeve,pivot.position.y-pivot.position.y);
      // Sample at the pivot shoulder height: the torso must overlap the sleeve.
      assert.ok(torsoEdge-sleeveEdge>.02,
        'Shirt and sleeve should intersect sufficiently to hide the visible joint');
      assert.ok(rig.elbowPivot[i].position.y+arm.position.y+arm.scale.y/2 >
        sleeve.position.y-sleeve.scale.y/2,
        'Skin forearm must begin inside the bottom of the sleeve');
      assert.ok(hand.position.y+hand.scale.y/2 > arm.position.y-arm.scale.y/2,
        'Hand must meet the forearm rather than hang detached');
    }
  }
});
test('upper legs are embedded in pelvis and animation pivot contract is unchanged',()=>{
  const {ctx}=rigScene();
  for(const id of CHARACTER_IDS) {
    const rig=createCharacterRig(ctx,id);
    const pelvis=traverse(rig.avatar).find(x=>x.name.endsWith(' pelvis'));
    assert.ok(pelvis && pelvis.scale.x>=.45);
    for(const [i,side] of ['left','right'].entries()){
      const pivot=rig.legPivot[i];
      assert.equal(pivot.position.y,.72);
      const leg=traverse(pivot).find(x=>x.name.endsWith(' '+side+' trouser leg'));
      const shoe=traverse(pivot).find(x=>x.name.endsWith(' '+side+' shoe'));
      assert.ok(leg && shoe);
      const legTop=pivot.position.y+leg.position.y+leg.scale.y/2;
      const pelvisBottom=pelvis.position.y-pelvis.scale.y/2;
      assert.ok(legTop-pelvisBottom>.10,
        'Leg top should extend inside pelvis, not meet it at a single edge');
      assert.ok(shoe.position.y+shoe.scale.y/2 > leg.position.y-leg.scale.y/2,
        'Shoe must overlap trouser leg at the ankle');
    }
  }
});
