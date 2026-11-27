import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold,tickHousehold,chooseResidentAction,enableArtMarketPilot} from '../src/household.js';
import {BIOGRAPHY_DEFINITIONS,biographyRows,recordBiographyArtwork,recordBiographySale,recordBiographyDisplay,recordBiographyCareer,recordBiographySocial,biographyPairBefore,biographySkillBefore,recordBiographySkills,recordBiographyHome} from '../src/life-biography.js';
import {recordFinanceChange} from '../src/finance-ledger.js';
import {transactPainting} from '../src/painting-gallery.js';
import {hireCareer} from '../src/career-state.js';
import {HOBBY_SKILLS} from '../src/hobby-reading.js';
import {currentSkillLevel} from '../src/skills-engine.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {compatibleFurnitureProduct} from '../src/furniture-products.js';
import {writeV1Save,readV1Save} from '../src/qsk-09-save-safety.js';
import {applySocialEvent,getPair} from '../src/social-graph.js';
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){let r=newHousehold('2026-11-23');r.autonomy.enabled=r.otherSim.autonomy.enabled=false;return r;}
function work(r,id='alex'){return {id:'work:'+id+':1',ownerId:id,contentId:'painting.hills',easelInstanceId:'shop-easel-1',kind:'artwork',location:'inventory',quality:50,seed:1,createdAt:r.minutes};}
function sale(r,w){const tx=transactPainting(r,w.ownerId,w.id,'sell');assert.ok(tx.ok);const finance=recordFinanceChange(r,tx.shop,{kind:'art-sale',sourceId:w.id,actorId:w.ownerId,atGameMinute:Math.floor(r.minutes),receiptId:'art:'+w.ownerId+':'+w.id});assert.ok(finance.ok&&finance.recorded);r.createdWorks=tx.works;r.shop=finance.shop;r.financialHistory=finance.financialHistory;return finance.entry;}
test('GC08 legacy starts empty and ten definitions; optional malformed data discarded',()=>{let r=setup();assert.equal(Object.keys(BIOGRAPHY_DEFINITIONS).length,10);assert.deepEqual(biographyRows(r,'alex'),[]);r.lifeBiography={schema:1,byResident:{alex:{sale:{at:r.minutes+99,date:'2026-11-23',proof:'x',context:'y',detail:null}}},household:{}};let v=loadHousehold(copy(r));assert.equal(v.lifeBiography,undefined);assert.equal(v.shop.credits,r.shop.credits);});
test('GC08 completion and actual sale are separate personal facts, bounded and durable',()=>{let r=setup(),w=work(r);assert.equal(recordBiographyArtwork(r,'alex',w),false);r.createdWorks=[w];assert.equal(recordBiographyArtwork(r,'mira',w),false);assert.equal(recordBiographyArtwork(r,'alex',w),true);assert.equal(recordBiographyArtwork(r,'alex',w),false);let entry=sale(r,w);assert.ok(recordBiographySale(r,entry,w));assert.equal(recordBiographySale(r,entry,w),false);assert.deepEqual(biographyRows(r,'mira'),[]);let old=copy(r.lifeBiography);r.financialHistory.entries=[];let restored=loadHousehold(copy(r));assert.deepEqual(restored.lifeBiography,old);assert.equal(biographyRows(restored,'alex').length,2);});
test('GC08 actual hang is not preview or storage',()=>{let r=setup(),w=work(r);r.createdWorks=[w];assert.equal(recordBiographyDisplay(r,'alex',w),false);let tx=transactPainting(r,'alex',w.id,'hang',0);assert.ok(tx.ok);r.createdWorks=tx.works;assert.ok(recordBiographyDisplay(r,'alex',w));assert.equal(recordBiographyDisplay(r,'mira',w),false);assert.equal(recordBiographyDisplay(r,'alex',w),false);});
test('GC08 observed hiring, no retroactive or repeated award',()=>{let r=setup();r.careerSystem=hireCareer(r.careerSystem,'alex','city-services',r.minutes);assert.ok(recordBiographyCareer(r,'alex','hire'));assert.equal(recordBiographyCareer(r,'alex','hire'),false);assert.equal(recordBiographyCareer(r,'mira','hire'),false);assert.equal(recordBiographyCareer(r,'alex','promotion'),false);});
test('GC08 actual unlock crossing not restored level',()=>{let r=setup(),def=Object.values(HOBBY_SKILLS.skills).find(d=>d.unlocks.length&&d.unlocks.some(u=>u.minLevel===1));assert.ok(def);let before=biographySkillBefore(r,HOBBY_SKILLS,currentSkillLevel);r.skills.xpById[def.id]=def.xpThresholds[0];recordBiographySkills(r,before,HOBBY_SKILLS,currentSkillLevel);assert.equal(biographyRows(r,'alex')[0]?.key,'ability');assert.equal(biographyRows(r,'mira').length,0);let legacy=setup();legacy.skills.xpById[def.id]=def.xpThresholds[0];let snapshot=biographySkillBefore(legacy,HOBBY_SKILLS,currentSkillLevel);recordBiographySkills(legacy,snapshot,HOBBY_SKILLS,currentSkillLevel);assert.equal(legacy.lifeBiography,undefined);});
test('GC08 shared installed purchase once, same state and no reward',()=>{let r=setup();const pose=findMarketPlacement(r.world.furniture,r.shop,'bookcase.starter');assert.ok(pose);const tx=buyMarketItem(r.world.furniture,r.shop,'bookcase.starter',pose);assert.ok(tx.ok);const finance=recordFinanceChange(r,tx.shop,{kind:'purchase',sourceId:tx.instanceId,atGameMinute:Math.floor(r.minutes)});assert.ok(finance.ok&&finance.recorded);const item=tx.world.instances.find(i=>i.instanceId===tx.instanceId),product=compatibleFurnitureProduct(item.prefabId,item.itemDefinitionId);assert.equal(recordBiographyHome(r,item,product,finance.entry),false);r.world.furniture=tx.world;r.shop=finance.shop;r.financialHistory=finance.financialHistory;const baseline=copy(r);assert.ok(recordBiographyHome(r,item,product,finance.entry));assert.equal(recordBiographyHome(r,item,product,finance.entry),false);assert.equal(biographyRows(r,'alex')[0].owner,'household');assert.equal(biographyRows(r,'mira')[0].key,'home');const candidate=copy(r);delete candidate.lifeBiography;assert.deepEqual(candidate,baseline);});
test('GC08 one root snapshot survives storage quota failure and reload',()=>{let r=setup(),bytes=null;const storage={getItem:()=>bytes,setItem:(k,v)=>bytes=v};assert.ok(writeV1Save(storage,'save',r).ok);const old=bytes,w=work(r);r.createdWorks=[w];recordBiographyArtwork(r,'alex',w);const blocked={getItem:()=>bytes,setItem:()=>{throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});}};assert.equal(writeV1Save(blocked,'save',r).ok,false);assert.equal(bytes,old);assert.ok(writeV1Save(storage,'save',r).ok);assert.deepEqual(loadHousehold(readV1Save(storage,'save').value).lifeBiography,r.lifeBiography);});
test('GC08 cancelled and paused tick cannot create facts',()=>{let r=setup();r.paused=true;tickHousehold(r,60);assert.equal(r.lifeBiography,undefined);assert.equal(recordBiographySocial(r,null,biographyPairBefore(r,'alex','mira')),false);});
test('GC08 real social receipts only, mutual close milestone persists after loss',()=>{let r=setup();let seq=0;for(let day=0;day<8;day++){r.minutes+=1440;for(const type of ['talk','conversation.talk','friend.confide']){let before=biographyPairBefore(r,'alex','mira');let receipt=applySocialEvent(r.socialGraph,{type,actorId:'alex',targetId:'mira',at:r.minutes,token:'gc08-'+seq++});assert.ok(receipt);recordBiographySocial(r,receipt,before);}}assert.equal(getPair(r.socialGraph,'alex','mira').friendship,'close');assert.equal(biographyRows(r,'alex').find(x=>x.key==='friendship').context,'mira');assert.equal(biographyRows(r,'mira').find(x=>x.key==='friendship').context,'alex');let old=copy(r.lifeBiography);for(let i=0;i<8;i++){let before=biographyPairBefore(r,'alex','mira');let receipt=applySocialEvent(r.socialGraph,{type:'argue',actorId:'alex',targetId:'mira',at:r.minutes,token:'gc08-argue-'+i});recordBiographySocial(r,receipt,before);}assert.deepEqual(r.lifeBiography,old);});

import {arrive} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {PAINT_ACTIVITY_ID} from '../src/painting.js';
import {promoteCareer,careerPromotionRule} from '../src/career-progression.js';
import {chooseCareerSpecialization,specializationReadiness} from '../src/career-specializations.js';
test('GC08 real household painting completion, practice cannot create a work milestone',()=>{
 const r=setup(),pose=findMarketPlacement(r.world.furniture,r.shop,'easel.starter');assert.ok(pose);
 const b=buyMarketItem(r.world.furniture,r.shop,'easel.starter',pose);assert.ok(b.ok);r.world.furniture=b.world;r.shop=b.shop;assert.ok(enableArtMarketPilot(r));
 function paint(mode){assert.ok(chooseResidentAction(r,'paint',false,'alex',b.instanceId,PAINT_ACTIVITY_ID,'painting.hills',null,null,null,false,false,mode,mode==='practice'?0:20));r.position=furnitureActionApproach(r.world,'paint',b.instanceId);arrive(r);for(let i=0;i<45;i++)tickHousehold(r,1);}
 paint('practice');assert.equal(biographyRows(r,'alex').some(x=>x.key==='artwork'),false);paint('speculative');
 assert.ok(r.createdWorks.at(-1));assert.equal(biographyRows(r,'alex').find(x=>x.key==='artwork').proof,r.createdWorks.at(-1).id);assert.deepEqual(loadHousehold(copy(r)).lifeBiography,r.lifeBiography);
});
test('GC08 actual promotion and specialization transitions, not legacy rank',()=>{
 const r=setup();r.careerSystem=hireCareer(r.careerSystem,'alex','city-services',r.minutes);
 assert.equal(promoteCareer(r,'alex').ok,false);assert.equal(r.lifeBiography,undefined);
 const c=r.careerSystem.byResident.alex,rule=careerPromotionRule(c.careerId,c.level);
 c.rankShifts=rule.shifts;c.workedShifts=rule.shifts;c.performance=100;
 const promoted=promoteCareer(r,'alex');assert.ok(promoted.ok);assert.ok(biographyRows(r,'alex').some(x=>x.key==='promotion'));
 c.level=4;const choice=specializationReadiness(r,'alex').tracks[0];
 assert.ok(choice);assert.ok(chooseCareerSpecialization(r,'alex',choice.id).ok);
 assert.ok(biographyRows(r,'alex').some(x=>x.key==='specialization'));
 assert.equal(chooseCareerSpecialization(r,'alex',choice.id).ok,false);
 assert.equal(biographyRows(r,'mira').length,0);
});
