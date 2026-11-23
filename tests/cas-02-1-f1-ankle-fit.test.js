import test from 'node:test';
import assert from 'node:assert/strict';
import {planRigidShoeAnkleFit,ANKLE_OVERLAP_M} from '../src/cas-cc0-shoe-fit-policy.js';

test('F1.1 uses source ankle and real CC0 shoe geometry, not a fixed aesthetic stretch',()=>{
 const left=planRigidShoeAnkleFit({ankleY:.17537,soleY:.0087,
  sourceHeight:.101283714,sourceScale:.984});
 const right=planRigidShoeAnkleFit({ankleY:.17123,soleY:.0052,
  sourceHeight:.101283714,sourceScale:.984});
 for(const p of [left,right]){
  assert.ok(p.verticalFactor>1.5&&p.verticalFactor<2.1);
  assert.ok(Math.abs(p.targetCollarY-p.soleWorldY-
    p.verticalFactor*.101283714*.984)<.000001,
   'measured shoe rim must overlap the real original bone');
 }
 assert.equal(left.ankleOverlap,ANKLE_OVERLAP_M);
 assert.equal(right.ankleOverlap,ANKLE_OVERLAP_M);
 assert.notEqual(left.verticalFactor,right.verticalFactor,
  'left/right feet are calibrated independently, not assumed identical');
});

test('F1.1 preserves sole/ground height as upper is fitted to ankle',()=>{
 const old={ankleY:.17537,soleY:.009,sourceHeight:.101283714,sourceScale:.984};
 const a=planRigidShoeAnkleFit(old);
 const b=planRigidShoeAnkleFit({...old,overlap:.025});
 assert.equal(a.soleWorldY,old.soleY);
 assert.equal(b.soleWorldY,old.soleY);
 assert.ok(b.verticalFactor>a.verticalFactor);
 assert.equal(a.targetCollarY,old.ankleY+.012);
});

test('F1.1 rejects implausible measurements rather than letting shoes detach',()=>{
 assert.throws(()=>planRigidShoeAnkleFit({ankleY:.7,soleY:0,sourceHeight:.1,sourceScale:1}),
  /Unsafe shoe\/ankle alignment/);
 assert.throws(()=>planRigidShoeAnkleFit({ankleY:NaN,soleY:0,sourceHeight:.1,sourceScale:1}),
  /Invalid/);
 assert.throws(()=>planRigidShoeAnkleFit({ankleY:.2,soleY:0,sourceHeight:0,sourceScale:1}),
  /Invalid/);
});
