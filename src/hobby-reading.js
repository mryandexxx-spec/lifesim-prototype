/** H1 pilot content/balance. Domain authored separately from prefab, gift and UI. */
import {createSkillRegistry} from './skill-registry.js';
import {createHobbyContentCatalog} from './hobby-content.js';
import {createActivityRegistry} from './activity-registry.js';
import {skillUnlocksAtLevel} from './skill-registry.js';
import {currentSkillLevel} from './skills-engine.js';

export const READING_ACTIVITY_ID='hobby.read.fiction';
export const READING_CONTENT_ID='book.first.stories';
export const READING_ADVANCED_CONTENT_ID='book.classic.pathways';
export const READING_ADVANCED_UNLOCK_ID='books.read.classics';
/** BOOK-R1: ten original fiction choices; preserve the first two canonical IDs. */
export const READING_BOOKS=Object.freeze([
  {id:READING_CONTENT_ID,label:'Истории дальних дорог',genre:'travel',minLevel:0},
  {id:READING_ADVANCED_CONTENT_ID,label:'Пути старых городов',genre:'classics',minLevel:3},
  {id:'book.river.mystery',label:'Тайна зеркальной реки',genre:'mystery',minLevel:0},
  {id:'book.orbit.scifi',label:'Сад на дальней орбите',genre:'scifi',minLevel:0},
  {id:'book.lighthouse.fantasy',label:'Маяк для облаков',genre:'fantasy',minLevel:0},
  {id:'book.dusk.romance',label:'Письма после заката',genre:'romance',minLevel:1},
  {id:'book.clock.adventure',label:'Часы у края карты',genre:'adventure',minLevel:1},
  {id:'book.market.humor',label:'Бюро потерянных зонтов',genre:'humor',minLevel:2},
  {id:'book.winter.history',label:'Зима на янтарной улице',genre:'historical',minLevel:3},
  {id:'book.silence.drama',label:'Карта тихих разговоров',genre:'drama',minLevel:5}
].map(book=>Object.freeze(book)));
export const READING_CONTENT_IDS=Object.freeze(READING_BOOKS.map(book=>book.id));
export const readingBookMinLevel=contentId=>
  READING_BOOKS.find(book=>book.id===contentId)?.minLevel??null;
export const READING_SKILL_ID='literature';
import {PAINT_ACTIVITY_ID,PAINT_SKILL_ID,PAINT_CONTENT_IDS,PAINT_SUBJECTS} from './painting.js';
export const MUSIC_ACTIVITY_ID='hobby.listen.music';
export const MUSIC_DANCE_ACTIVITY_ID='hobby.dance.music';
export const MUSIC_ACTIVITY_IDS=Object.freeze([MUSIC_ACTIVITY_ID,MUSIC_DANCE_ACTIVITY_ID]);
export const MUSIC_CONTENT_IDS=Object.freeze(['music.calm','music.rhythmic','music.dreamy']);
export const HOBBY_SKILLS=createSkillRegistry({skills:[{
  id:READING_SKILL_ID,label:'Литературная эрудиция',group:'knowledge',
  maxLevel:10,xpThresholds:[30,75,135,215,320,455,625,830,1080,1380],
  practiceTags:['book.fiction'],
  unlocks:[{id:READING_ADVANCED_UNLOCK_ID,minLevel:3},
    ...READING_BOOKS.filter(book=>book.minLevel>0&&book.id!==READING_ADVANCED_CONTENT_ID)
      .map(book=>({id:book.id,minLevel:book.minLevel}))]
},{
  id:PAINT_SKILL_ID,label:'Живопись',group:'creative',maxLevel:10,
  xpThresholds:[35,85,155,245,360,500,675,890,1150,1460],
  practiceTags:['art.paint'],unlocks:PAINT_CONTENT_IDS.filter(id=>PAINT_SUBJECTS[id].minLevel>0)
    .map(id=>({id,minLevel:PAINT_SUBJECTS[id].minLevel}))
},{
  id:'cooking',label:'Кулинария',group:'knowledge',maxLevel:10,
  xpThresholds:[22,56,100,165,240,335,455,610,805,1040],
  practiceTags:['food.cook'],
  unlocks:[{id:'cook.grain-bowl',minLevel:1},{id:'cook.pasta',minLevel:2},
    {id:'cook.herb-noodles',minLevel:3},{id:'cook.gratin',minLevel:4},
    {id:'cook.roast-tray',minLevel:5},{id:'cook.festival-pie',minLevel:7}]
}]});
export const HOBBY_CONTENT=createHobbyContentCatalog({entries:[
  ...READING_BOOKS.map(book=>({id:book.id,kind:'book',label:book.label,
    difficulty:Math.max(1,book.minLevel),
    tags:['book.fiction','books','books.'+book.genre],
    skillTags:[READING_SKILL_ID]})),
  ...PAINT_CONTENT_IDS.map(id=>({id,kind:'painting',label:PAINT_SUBJECTS[id].label,
    difficulty:Math.max(1,PAINT_SUBJECTS[id].minLevel),
    tags:['art.paint',PAINT_SUBJECTS[id].genre],skillTags:[PAINT_SKILL_ID]})),
  {id:'music.calm',kind:'musicstyle',label:'Тихий вечер',difficulty:1,tags:['music','calm_leisure'],skillTags:[]},
  {id:'music.rhythmic',kind:'musicstyle',label:'Тёплый ритм',difficulty:1,tags:['music','rhythm'],skillTags:[]},
  {id:'music.dreamy',kind:'musicstyle',label:'Звёздный свет',difficulty:1,tags:['music','dreamy'],skillTags:[]}
]});
export const HOBBY_ACTIVITIES=createActivityRegistry({
  skills:HOBBY_SKILLS,content:HOBBY_CONTENT,
  activities:[{
    id:READING_ACTIVITY_ID,label:'Читать книгу',kind:'leisure',
    source:'item',participation:'solo',
    requiredCapabilities:['books.borrow'],contentKind:'book',
    timeBudget:{minMinutes:8,targetMinutes:36},
    needEffects:[{statId:'needs.fun',perMinute:1.05}],
    skillPractice:[{skillId:READING_SKILL_ID,xpPerMinute:1}],
    poseKey:'reading.book'
  },{
    id:MUSIC_ACTIVITY_ID,label:'Слушать музыку',kind:'leisure',
    source:'item',participation:'solo',requiredCapabilities:['music.playback'],
    contentKind:'musicstyle',timeBudget:{minMinutes:8,targetMinutes:35},
    needEffects:[{statId:'needs.fun',perMinute:0.94}],
    skillPractice:[],poseKey:'music.listen',audioCue:'music.original'
  },{
    id:MUSIC_DANCE_ACTIVITY_ID,label:'Танцевать',kind:'leisure',
    source:'item',participation:'solo',requiredCapabilities:['music.playback'],
    contentKind:'musicstyle',timeBudget:{minMinutes:8,targetMinutes:30},
    needEffects:[{statId:'needs.fun',perMinute:1.23},{statId:'needs.energy',perMinute:-0.12}],
    skillPractice:[],poseKey:'music.dance',audioCue:'music.original'
  },{
    id:PAINT_ACTIVITY_ID,label:'Рисовать картину',kind:'creative',
    source:'item',participation:'solo',requiredCapabilities:['art.paint'],
    contentKind:'painting',timeBudget:{minMinutes:10,targetMinutes:45},
    needEffects:[{statId:'needs.fun',perMinute:0.82}],
    skillPractice:[{skillId:PAINT_SKILL_ID,xpPerMinute:1.2}],
    poseKey:'painting.easel'
  }]
});

/** BOOK-R1: explicit catalog allowlist and per-reader gates, fail closed on unknown IDs. */
export function canReadHobbyContent(progress,contentId){
  const minLevel=readingBookMinLevel(contentId);
  if(minLevel===null)return false;
  if(minLevel===0)return true;
  const level=currentSkillLevel(progress,HOBBY_SKILLS,READING_SKILL_ID);
  const unlockId=contentId===READING_ADVANCED_CONTENT_ID
    ?READING_ADVANCED_UNLOCK_ID:contentId;
  return skillUnlocksAtLevel(HOBBY_SKILLS,READING_SKILL_ID,level)
    .some(unlock=>unlock.id===unlockId);
}
