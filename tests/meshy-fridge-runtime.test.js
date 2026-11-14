import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fridgeSequence,FRIDGE_LAYOUT} from '../src/fridge-interaction.js';
import {meshyFridgePose,createMeshyFridgeController}
  from '../src/meshy-fridge-runtime.js';

test('right hand follows established handle, shelf, eating and return phases',()=>{
  const handle=meshyFridgePose(fridgeSequence(26*.16,26));
  assert.ok(handle.handle>.75 && handle.shelf<.05);
  const shelf=meshyFridgePose(fridgeSequence(26*.39,26));
  assert.ok(shelf.shelf>.75 && shelf.handle<.05);
  const eat=meshyFridgePose(fridgeSequence(26*.77,26));
  assert.ok(eat.mouth>.75 && eat.food>.1);
  const end=meshyFridgePose(fridgeSequence(26,26));
  assert.equal(end.weight,0);
  assert.equal(end.food,0);
  assert.equal(meshyFridgePose(null),null);
  assert.equal(meshyFridgePose({progress:NaN}),null);
});
test('world contact is a fridge-prefab contract, not an avatar offset',()=>{
  assert.equal(FRIDGE_LAYOUT.handle.x,3.04);
  assert.equal(FRIDGE_LAYOUT.handleY,1.51);
  assert.equal(FRIDGE_LAYOUT.shelfTarget.x,3.24);
  assert.equal(FRIDGE_LAYOUT.shelfTarget.y,1.38);
});
test('missing right arm bones cannot make Meshy overwrite the old fridge pose',()=>{
  const controller=createMeshyFridgeController({
    pc:{Vec3:class{},Quat:class{}},
    model:{findByName:()=>null},
    avatar:{}
  });
  assert.equal(controller.ready,false);
  assert.equal(controller.apply(),false);
});
test('real bone targets rotate only shoulder and forearm, never game root',()=>{
  const changes=[];
  class Vec3{
    constructor(x=0,y=0,z=0){this.set(x,y,z);}
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
    length(){return Math.hypot(this.x,this.y,this.z);}
    normalize(){const n=this.length()||1;this.x/=n;this.y/=n;this.z/=n;return this;}
    dot(b){return this.x*b.x+this.y*b.y+this.z*b.z;}
  }
  class Quat{
    setFromDirections(){return this;}
    mul2(){return this;}
    slerp(){return this;}
  }
  class Entity{
    constructor(name){this.name=name;this.enabled=true;}
    addComponent(type){assert.equal(type,'render');}
    addChild(child){child.parent=this;}
    setLocalPosition(){}
    setLocalScale(){}
  }
  function bone(name,xyz){
    return {
      getPosition:()=>new Vec3(...xyz),
      getRotation:()=>new Quat(),
      setRotation:()=>{changes.push(name);}
      addChild(child){child.parent=this;}
    };
  }
  const bones={
    'mixamorig:RightArm':bone('upper',[2.62,1.46,-1.78]),
    'mixamorig:RightForeArm':bone('forearm',[2.81,1.25,-1.88]),
    'mixamorig:RightHand':bone('hand',[2.99,1.05,-1.99]),
    'mixamorig:Head':bone('head',[2.55,1.72,-1.77])
  };
  const avatar={
    getWorldTransform:()=>({
      transformVector:(v,out)=>out.set(v.x,v.y,v.z)
    }),
    setPosition(){throw Error('Must never change avatar root');}
  };
  const pc={Vec3,Quat,Entity,Color:class{},
    StandardMaterial:class{update(){}}
  };
  const controller=createMeshyFridgeController({
    pc,model:{findByName:name=>bones[name]},avatar
  });
  assert.equal(controller.ready,true);
  controller.setFrame(fridgeSequence(26*.16,26));
  assert.equal(controller.apply(),true);
  assert.ok(changes.includes('upper'));
  assert.ok(changes.includes('forearm'));
  assert.equal(controller.food.enabled,false);
  controller.setFrame(fridgeSequence(26*.77,26));
  controller.apply();
  assert.equal(controller.food.enabled,true);
  controller.setFrame(null);
  assert.equal(controller.apply(),false);
  assert.equal(controller.food.enabled,false);
});
test('actual visual bridge applies overlays only after the base Anim evaluation',()=>{
  const visual=readFileSync(new URL('../src/meshy-visual.js',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert.match(visual,/class FridgePostUpdate extends pc\.Script/);
  assert.match(visual,/postUpdate\(\)\{fridge\.apply\(\);\}/);
  assert.match(visual,/fridgeReady:Boolean\(state\.fridgeRuntime\?\.ready\)/);
  assert.match(game,/fridgeFrame:alexFridge/);
  assert.match(game,/mesh[y]?Shown&&useId==='fridge'\)snack\.enabled=false/);
  assert.match(pages,/src\/meshy-fridge-runtime\.js/);
  assert.match(pages,/node --check src\/meshy-fridge-runtime\.js/);
});
