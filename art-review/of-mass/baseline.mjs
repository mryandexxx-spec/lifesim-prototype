import {proceduralFurnitureModel} from '../../src/furniture-procedural-library.js';
import {OUTDOOR_PRODUCTS} from '../../src/outdoor-catalog.js';
import {SPORTS_TEAMS} from '../../src/sports-catalog.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const ids=["diningtable.farm","diningtable.oval","floorlamp.arc","sconce.leaf","dresser.arch","mirror.oval","sculpture.balance","sculpture.spire","tree.round","tree.tall","tree.broad","shrub.small","shrub.flowering","shrub.broad","flower.daisy","flower.tulip","flower.lavender","garden.flower.calendula","garden.flower.cornflower","garden.herb.mint","garden.herb.melissa","garden.bench","garden.table","garden.grill","light.path","light.standing","fence.wood","hedge.short","pool.ladder","pool.steps","pool.board","fanflag.copper-gulls","fanflag.forest-lanterns","fanflag.sapphire-sparks","fanflag.amber-pier","fanflag.moon-foxes","fanflag.steppe-sails","fanstand.copper-gulls","fanstand.forest-lanterns","fanstand.sapphire-sparks","fanstand.amber-pier","fanstand.moon-foxes","fanstand.steppe-sails"];
const palette={"bark":"#917256","leaf":"#4d8960","lightLeaf":"#7cac69","darkLeaf":"#437956","pink":"#dc9aa7","white":"#f6eee0","yellow":"#e9c767","purple":"#8f77b6","wood":"#af8967","woodDark":"#846e54","soil":"#6e8761","gardenSoil":"#6b4e3d","wetSoil":"#544536","drySoil":"#9a7252","orange":"#e5a352","blue":"#7197d8","metal":"#606975","metalLight":"#aebbc7","coal":"#2b3035","ember":"#d56f40","meat":"#995d43","chicken":"#dbac73"};
const base={},meta={};
const put=(id,parts,name=id,extra={})=>{base[id]=parts;meta[id]={name,...extra}};
for(const def of OUTDOOR_PRODUCTS){
 const item={itemId:def.itemId}; const parts=[];
 const part=(kind,name,x,y,z,sx,sy,sz,color)=>parts.push({kind,name,x,y,z,sx,sy,sz,color:palette[color]});
 const gardenView=()=>({stage:3,waterRemaining:0,harvestedAt:null}); const game={world:{outdoors:{}},minutes:0};
      if(def.category==='garden'){
        const gardenState=gardenView(game.world.outdoors,item.instanceId,game.minutes);
        const stage=gardenState?.stage??0;
        const herb=item.itemId.startsWith('garden.herb');
        const flowerColor=item.itemId.includes('calendula')?'orange':'blue';
        part('box','garden timber frame',0,.105,0,1.00,.21,1.00,'woodDark');
        part('box','garden rich soil',0,.225,0,.86,.05,.86,
          gardenState?.waterRemaining>0?'wetSoil':'drySoil');
        const spots=[[-.25,-.24],[.24,-.23],[-.22,.23],[.23,.23]];
        if(stage===0)for(const [x,z] of spots)
          part('sphere','sown seed mound',x,.255,z,.16,.05,.16,'soil');
        if(stage>0)for(const [k,[x,z]] of spots.entries()){
          const height=stage===1?.22:stage===2?.51:herb?.72:.66;
          const harvested=herb&&gardenState?.harvestedAt!==null&&gardenState?.harvestedAt!==undefined;
          part('cylinder','green garden stem',x,.26+height/2,z,.055,height,.055,'darkLeaf');
          part('sphere','garden leaves',x-.07,.34+height*.53,z,harvested?.14:.22,
            stage===1?.14:harvested?.15:.29,harvested?.13:.21,k%2?'leaf':'lightLeaf');
          if(stage>=2&&!harvested)part('sphere','upper leaves',x+.09,.24+height,z,
            herb?.24:.18,herb?.18:.17,herb?.22:.17,'lightLeaf');
          if(stage===3&&!herb){
            part('sphere','blossom petals',x,.37+height,z,.28,.16,.28,flowerColor);
            part('sphere','flower center',x,.47+height,z,.10,.07,.10,'yellow');
          }
          if(stage===3&&herb&&!harvested)part('sphere','mature herb tips',x,.37+height,z,
            .19,.10,.19,'lightLeaf');
        }
      }else if(def.category==='tree'){
        const scale=item.itemId==='tree.tall'?1.30:item.itemId==='tree.broad'?1.12:1;
        part('cylinder','trunk',0,.70*scale,0,.28,1.40*scale,.28,'bark');
        part('sphere','canopy',0,1.65*scale,0,def.width*1.08,.94*scale,def.depth*1.08,'leaf');
        if(item.itemId!=='tree.tall'){
          part('sphere','canopy east',.38,1.43*scale,-.14,.72,.72,.72,'lightLeaf');
          part('sphere','canopy west',-.37,1.48*scale,.20,.64,.68,.66,'darkLeaf');
        }
      }else if(def.category==='shrub'){
        const flowering=item.itemId==='shrub.flowering';
        part('sphere','bush',0,.43,0,def.width*1.1,.74,def.depth*1.10,flowering?'lightLeaf':'leaf');
        if(item.itemId==='shrub.broad')part('sphere','bush side',.34,.36,-.18,.7,.57,.67,'darkLeaf');
        if(flowering)for(const [x,z] of [[-.24,0],[.22,.18],[.04,-.28]])
          part('sphere','blossom',x,.77,z,.18,.15,.18,'pink');
      }else if(def.category==='flower'){
        const color=item.itemId==='flower.lavender'?'purple':
          item.itemId==='flower.tulip'?'pink':'white';
        for(const [x,z] of [[-.16,-.12],[.17,.10],[0,.19]]){
          part('cylinder','stem',x,.18,z,.035,.36,.035,'soil');
          part('sphere','petals',x,.39,z,.16,.15,.16,color);
          if(item.itemId==='flower.daisy')
            part('sphere','heart',x,.48,z,.055,.06,.055,'yellow');
        }
      }else if(item.itemId==='garden.bench'){
        for(const x of [-.57,.57])
          for(const z of [-.20,.20])
            part('box','bench leg',x,.30,z,.12,.60,.12,'woodDark');
        for(const z of [-.23,0,.23])
          part('box','bench slat',0,.59,z,1.50,.10,.17,'wood');
        part('box','bench back',0,.91,.25,1.50,.53,.11,'wood');
      }else if(item.itemId==='garden.grill'){
        // Independent lightweight game geometry: iron frame, grate, coals,
        // handle and three visible skewers. No particle texture or sound.
        for(const x of [-.48,.48])for(const z of [-.28,.28])
          part('cylinder','grill leg',x,.36,z,.09,.72,.09,'metal');
        part('box','firebox',0,.72,0,1.22,.36,.82,'metal');
        part('box','charcoal bed',0,.91,0,1.08,.07,.68,'coal');
        for(const x of [-.35,0,.35])for(const z of [-.16,.16])
          part('sphere','warm ember',x,.965,z,.14,.06,.12,'ember');
        for(let x=-.48;x<=.49;x+=.12)
          part('box','grill grate rod',x,1.025,0,.027,.025,.74,'metalLight');
        for(const z of [-.30,.30])
          part('box','grill grate rail',0,1.038,z,1.19,.035,.04,'metal');
        part('cylinder','grill side handle',.71,.84,0,.08,.22,.08,'metalLight');

      }else if(item.itemId==='garden.table'){
        part('cylinder','table stand',0,.43,0,.20,.80,.20,'woodDark');
        part('cylinder','garden tabletop',0,.86,0,1.06,.11,1.06,'wood');
        for(const x of [-.33,.33])for(const z of [-.33,.33])
          part('box','table leg',x,.43,z,.09,.80,.09,'woodDark');
      }else if(def.category==='light'){
        const tall=item.itemId==='light.standing';
        const height=tall?2.35:1.06;
        part('cylinder','light pole',0,height/2,0,.13,height,.13,'woodDark');
        part('box','light body',0,height,0,tall?.43:.34,tall?.45:.35,tall?.43:.34,'wood');
        part('sphere','light lens',0,height+.02,0,tall?.30:.24,.24,tall?.30:.24,'yellow');
        part('box','light cap',0,height+.27,0,tall?.51:.39,.09,tall?.51:.39,'woodDark');
        // Real omni emitter, not a glowing sprite. Fully removed with the
        // owned fixture, capped at 8 and never allowed to cast shadow maps.

      }else if(item.itemId==='fence.wood'){
        for(const x of [-.20,.20])
          part('box','fence post',x,.44,0,.09,.88,.10,'woodDark');
        for(const y of [.30,.63])
          part('box','fence rail',0,y,0,.51,.095,.09,'wood');
      }else{
        part('box','hedge base',0,.23,0,.49,.20,.24,'bark');
        for(const x of [-.17,.05,.20])
          part('sphere','hedge foliage',x,.55,0,.31,.63,.44,'darkLeaf');
      }
 put(def.itemId,parts,def.name,{width:def.width,depth:def.depth,category:def.category});
}
for(const id of ids.filter(id=>!id.startsWith('pool.')&&!base[id])){
 const key=id==='sconce.leaf'?'walllight.leaf':id;
 const src=proceduralFurnitureModel(key);assert.ok(src,key);
 const team=SPORTS_TEAMS.find(t=>id.endsWith(t.id));
 put(id,src.parts,team?(id.startsWith('fanflag')?'Флаг · ':'Стенд · ')+team.name:({'diningtable.farm':'Стол Ферма','diningtable.oval':'Овальный стол','floorlamp.arc':'Торшер Арка','sconce.leaf':'Бра Лист','dresser.arch':'Комод Арка','mirror.oval':'Овальное зеркало','sculpture.balance':'Скульптура Баланс','sculpture.spire':'Скульптура Шпиль'}[id]||id),{team:team?.color||null,category:'interior'});
}
const pool=(id,fn,name)=>{const parts=[];const part=(name,x,y,z,sx,sy,sz,color)=>parts.push({kind:'box',name,x,y,z,sx,sy,sz,color:({steel:'#a6bfcb',stone:'#d1d6cf',board:'#e6d0a5'})[color]});fn(part);put(id,parts,name,{category:'pool'})};
pool('pool.ladder',p=>{for(const x of [-.18,.18]){p('socket',x,.015,-.102,.105,.04,.105,'steel');p('rail',x,.25,-.102,.055,.50,.055,'steel');p('grip',x,.49,.025,.055,.055,.31,'steel');p('wet rail',x,-.15,.15,.055,1.32,.055,'steel')}for(let i=0;i<5;i++)p('rung',0,.12-i*.2,.15,.37,.045,.06,'steel')},'Лестница бассейна');
pool('pool.steps',p=>{for(let i=0;i<3;i++){const top=-.04-i*.19,h=top+1.2;p('tread',0,-1.2+h/2,.09+i*.20,.47,h,.206,'stone')}},'Ступени бассейна');
pool('pool.board',p=>{p('base',0,.035,-.18,.40,.07,.43,'stone');p('support',0,.22,-.18,.24,.39,.27,'steel');p('board',0,.435,.12,.46,.085,.94,'board');p('lip',0,.435,.585,.46,.085,.024,'steel')},'Трамплин бассейна');
assert.deepEqual(Object.keys(base).sort(),ids.sort());assert.equal(ids.length,43);for(const [id,parts] of Object.entries(base)){assert.ok(parts.length,id);assert.ok(parts.every(p=>p.color),id)}
mkdirSync('artifacts/of-mass/lab',{recursive:true});writeFileSync('artifacts/of-mass/lab/baseline.json',JSON.stringify(base));writeFileSync('artifacts/of-mass/lab/catalog.json',JSON.stringify(meta));
