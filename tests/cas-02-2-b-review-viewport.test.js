import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeReviewFraming} from '../art-review/cas-02-2-b/camera-layout.js';

for(const [label,h,panelTop,topButtons] of [
  ['iPhone regular collapsed',844,765,115],
  ['iPhone compact collapsed',568,489,115],
  ['iPhone regular expanded',844,395,115],
  ['iPhone compact expanded',568,280,115]
])for(const focus of ['face','body']){
  test('CAS-B viewport '+label+' '+focus+': resident entirely above tools',()=>{
    const camera=computeReviewFraming({viewportHeight:h,panelTop,controlsBottom:topButtons,focus});
    assert.ok(camera.marginTop>=-1,'top is clipped: '+JSON.stringify(camera));
    assert.ok(camera.marginBottom>=-1,'bottom is under panel: '+JSON.stringify(camera));
    assert.ok(camera.modelBottomScreenY<panelTop,'resident behind panel');
    assert.ok(Math.abs(camera.desiredScreenY-(camera.top+camera.bottom)/2)<.01);
  });
}
test('CAS-B invalid view and focus are rejected',()=>{
  assert.throws(()=>computeReviewFraming({viewportHeight:0,panelTop:50}));
  assert.throws(()=>computeReviewFraming({viewportHeight:568,panelTop:480,focus:'invalid'}));
});
test('CAS-B defaults to compact controls, live viewport buttons, accessible toggle',()=>{
  const html=readFileSync(new URL('../art-review/cas-02-2-b/index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../art-review/cas-02-2-b/main.js',import.meta.url),'utf8');
  assert.match(html,/#panel:not\(\.expanded\) #tools\{display:none\}/);
  assert.match(html,/id="tools-toggle"[^>]*aria-expanded="false"/);
  assert.match(html,/id="view-face"/);
  assert.match(html,/id="view-body"/);
  assert.match(js,/new ResizeObserver/);
  assert.match(js,/computeReviewFraming/);
  assert.doesNotMatch(js,/localStorage/);
  assert.doesNotMatch(js,/THREE\.|GLTFLoader/);
  assert.match(js,/document\.documentElement\.style\.setProperty\('--panel-height'/);
  assert.match(js,/status\.hidden=true/);
});

test('CAS-B review only loads exact original Alex and Mira or source-preserving approved pilot morphs',()=>{
 const html=readFileSync(new URL('../art-review/cas-02-2-b/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../art-review/cas-02-2-b/main.js',import.meta.url),'utf8');
 assert.match(js,/meshy-casual-v1\.glb/);
 assert.match(js,/meshy-mira-mobile-v1\.glb/);
 assert.match(js,/cas-02-2-alex-morphs\.glb/);
 assert.match(js,/cas-02-2-mira-morphs\.glb/);
 assert.doesNotMatch(js,/MakeHuman|base_body\.glb|CharacterCreator|gender_female|face_nose_width/);
 assert.match(html,/id="morph-head"[^>]*disabled/);
 assert.match(html,/id="morph-torso"[^>]*disabled/);
 assert.doesNotMatch(html,/id="nose"|id="eyes"|id="lips"|id="chin"|id="skin-tone"/);
 assert.match(js,/morphs\.length!==1\|\|morphs\[0\]\.morph\?\.targets\?\.length!==2/);
 assert.match(js,/viewMode==='morph'/);
 assert.match(html,/Никакого MakeHuman/);
 assert.doesNotMatch(js,/localStorage/);
});
