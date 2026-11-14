import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_IDS, CHARACTER_PROFILES, createCharacterRig } from '../src/characters.js';
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
    assert.equal(r.leftEye.parent,r.avatar);
    assert.equal(r.rightEye.parent,r.avatar);
    assert.equal(r.legPivot[0].position.y,.72);
    assert.equal(r.armPivot[1].position.y,1.17);
    assert.equal(r.snack.parent,r.armPivot[1]);
    assert.equal(r.book.parent,r.armPivot[1]);
    assert.equal(r.snack.enabled,false);
    assert.equal(r.book.enabled,false);
    assert.equal(r.selected.parent,r.avatar);
    assert.ok(traverse(r.avatar).some(e=>/eyebrow/.test(e.name)));
    assert.ok(traverse(r.avatar).some(e=>/smile/.test(e.name)));
    assert.ok(traverse(r.avatar).some(e=>/hair/.test(e.name)));
  }
  assert.notEqual(alex.avatar.name,mira.avatar.name);
  assert.ok(created.length>=95 && created.length<150,'Keep the static mobile geometry bounded');
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
