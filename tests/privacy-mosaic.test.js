import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MOSAIC_SIZE,MOSAIC_COLUMNS,MOSAIC_ROWS,privacyMosaicPixels,
  createPrivacyMosaicMaterial} from '../src/privacy-mosaic.js';
import {SHOWER_LAYOUT,showerSequence,showerPrivacyInvariant,
  createShowerTransition,advanceShowerTransition} from '../src/shower-interaction.js';

test('mosaic is one compact, fully opaque sRGB texture, with no translucent pixels',()=>{
  assert.equal(MOSAIC_SIZE,256);
  assert.ok(MOSAIC_COLUMNS>=9&&MOSAIC_ROWS>=12);
  const bytes=privacyMosaicPixels();
  assert.equal(bytes.length,MOSAIC_SIZE*MOSAIC_SIZE*4);
  for(let i=3;i<bytes.length;i+=4)assert.equal(bytes[i],255,'no alpha allowed at '+i);
});
test('individual mosaic tiles visibly vary without random or time-dependent data',()=>{
  const p=privacyMosaicPixels();
  const center=(col,row)=>{
    const x=Math.floor((col+.5)*MOSAIC_SIZE/MOSAIC_COLUMNS);
    const y=Math.floor((row+.5)*MOSAIC_SIZE/MOSAIC_ROWS);
    const i=(y*MOSAIC_SIZE+x)*4;return [...p.slice(i,i+3)].join(',');
  };
  const colors=new Set();
  for(let y=0;y<MOSAIC_ROWS;y++)for(let x=0;x<MOSAIC_COLUMNS;x++)colors.add(center(x,y));
  assert.ok(colors.size>=14, 'must look like a mosaic, not a monochrome screen');
  assert.ok(colors.size<MOSAIC_COLUMNS*MOSAIC_ROWS);
  assert.notEqual(center(0,0),center(4,9), 'distant centers should not share the same shade');
  assert.deepEqual(privacyMosaicPixels(),p);
});
test('texture generation supports smaller sizes and rejects unbounded uploads',()=>{
  assert.equal(privacyMosaicPixels(64).length,64*64*4);
  assert.throws(()=>privacyMosaicPixels(4096),RangeError);
  assert.throws(()=>privacyMosaicPixels(0),RangeError);
  assert.throws(()=>privacyMosaicPixels(63.5),RangeError);
});
test('material is truly opaque, depth-writing, sRGB, and uploaded exactly once',()=>{
  let textureCalls=0,locked=0,unlocked=0,updated=0;
  class FakeTexture {
    constructor(device,opts){
      textureCalls++; assert.equal(device,'gpu');this.options=opts;
      this.bytes=new Uint8Array(opts.width*opts.height*4);
    }
    lock(){locked++;return this.bytes;}
    unlock(){unlocked++;}
  }
  class FakeMaterial{
    update(){updated++;}
  }
  class FakeColor{
    constructor(r,g,b){this.rgb=[r,g,b];}
  }
  const pc={Texture:FakeTexture,StandardMaterial:FakeMaterial,Color:FakeColor,
    PIXELFORMAT_SRGBA8:'srgb',BLEND_NONE:'opaque',FILTER_LINEAR_MIPMAP_LINEAR:'mipmap',
    FILTER_NEAREST:'nearest',ADDRESS_CLAMP_TO_EDGE:'clamp'};
  const m=createPrivacyMosaicMaterial(pc,'gpu');
  assert.equal(textureCalls,1);
  assert.equal(locked,1);
  assert.equal(unlocked,1);
  assert.equal(updated,1);
  assert.equal(m.opacity,1);
  assert.equal(m.blendType,'opaque');
  assert.equal(m.depthWrite,true);
  assert.equal(m.diffuseMap.options.format,'srgb');
  assert.equal(m.diffuseMap.options.mipmaps,true);
  assert.deepEqual(m.diffuseMap.bytes,privacyMosaicPixels());
});
test('game builds curved mosaic cloud with shared material instead of solid booth',()=>{
  const game=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
  assert.ok(game.includes("import {createPrivacyMosaicMaterial} from './privacy-mosaic.js';"));
  assert.ok(game.includes("cylinder('shower mosaic cloud'"));
  assert.ok(game.includes("ball('shower mosaic top'"));
  assert.ok(game.includes("ball('shower mosaic base'"));
  assert.ok(!game.includes("box('solid shower privacy'"));
  assert.ok(!game.includes('M.privacy,showerPrivacy'));
  assert.ok(game.includes('showerPrivacy.enabled=Boolean(alexShower?.privacy||miraShower?.privacy)'));
  assert.ok(game.includes('applyShowerAppearance(alexRig,Boolean(alexShower?.privacy),Boolean(alexShower?.bathing))'));
  assert.ok(game.includes('applyShowerAppearance(miraRig,Boolean(miraShower?.privacy),Boolean(miraShower?.bathing))'));
  assert.ok(SHOWER_LAYOUT.privacyHeight>2);
});
test('mosaic visual change never changes mask choreography, cancellation or saved states',()=>{
  let state=createShowerTransition();
  for(let n=0;n<=1000;n++){
    const frame=showerSequence(n*32/1000,32);
    assert.ok(showerPrivacyInvariant(frame));
    if(frame.water||frame.bathing)assert.equal(frame.privacy,true);
  }
  state=advanceShowerTransition(state,true,17,32,1/60);
  assert.equal(state.frame.privacy,true);
  state=advanceShowerTransition(state,false,0,32,1/60);
  assert.equal(state.frame.water,false);
  assert.equal(state.frame.bathing,false);
  assert.equal(state.frame.privacy,true);
});
