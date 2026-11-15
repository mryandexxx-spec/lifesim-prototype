import test from 'node:test';
import assert from 'node:assert/strict';
import {UI_TOUR_STORAGE_KEY,UI_TOUR_STEPS,createUITour,shouldShowTour} from '../src/ui-onboarding.js';
test('UI7 concise, immutable original walkthrough and independent key',()=>{
 assert.equal(UI_TOUR_STORAGE_KEY,'blins.ui.tour.v1');
 assert.equal(UI_TOUR_STEPS.length,3);
 assert.ok(UI_TOUR_STEPS.every(step=>step.title&&step.body&&step.hint));
 assert.ok(UI_TOUR_STEPS.every(Object.isFrozen));
 assert.match(UI_TOUR_STEPS[0].body,/одним пальцем/);
 assert.match(UI_TOUR_STEPS[1].body,/коснись/);
 assert.match(UI_TOUR_STEPS[2].body,/очередь/);
});
test('UI7 replay is voluntary and returning visitors do not auto-repeat',()=>{
 const a=createUITour(),b=createUITour();
 assert.equal(shouldShowTour(null),true);
 assert.equal(shouldShowTour('done'),false);
 assert.equal(a.progress(),'1 из 3');
 assert.equal(a.next(),true);assert.equal(a.progress(),'2 из 3');
 assert.equal(a.next(),true);assert.equal(a.progress(),'3 из 3');
 assert.equal(a.next(),false);assert.equal(a.index(),2);
 assert.equal(b.index(),0);
 a.reset();assert.equal(a.index(),0);
});
