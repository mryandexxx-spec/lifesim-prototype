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
export const READING_CONTENT_IDS=Object.freeze([READING_CONTENT_ID,READING_ADVANCED_CONTENT_ID]);
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
  unlocks:[{id:READING_ADVANCED_UNLOCK_ID,minLevel:3}]
},{
  id:PAINT_SKILL_ID,label:'Живопись',group:'creative',maxLevel:10,
  xpThresholds:[35,85,155,245,360,500,675,890,1150,1460],
  practiceTags:['art.paint'],unlocks:PAINT_CONTENT_IDS.filter(id=>PAINT_SUBJECTS[id].minLevel>0)
    .map(id=>({id,minLevel:PAINT_SUBJECTS[id].minLevel}))
},{
  id:'cooking',label:'Кулинария',group:'knowledge',maxLevel:10,
  xpThresholds:[22,56,100,165,240,335,455,610,805,1040],
  practiceTags:['food.cook'],
  unlocks:[{id:'cook.pasta',minLevel:2},{id:'cook.gratin',minLevel:4}]
}]});
export const HOBBY_CONTENT=createHobbyContentCatalog({entries:[{
  id:READING_CONTENT_ID,kind:'book',label:'Истории дальних дорог',
  difficulty:1,tags:['book.fiction','books'],skillTags:[READING_SKILL_ID]
}, {
  id:READING_ADVANCED_CONTENT_ID,kind:'book',label:'Пути старых городов',
  difficulty:3,tags:['book.fiction','books','books.classics'],skillTags:[READING_SKILL_ID]
},
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

/** H4: real level-gated book content; no XP from choosing/buying a book. */
export function canReadHobbyContent(progress,contentId){
  if(contentId===READING_CONTENT_ID)return true;
  if(contentId!==READING_ADVANCED_CONTENT_ID)return false;
  const level=currentSkillLevel(progress,HOBBY_SKILLS,READING_SKILL_ID);
  return skillUnlocksAtLevel(HOBBY_SKILLS,READING_SKILL_ID,level)
    .some(unlock=>unlock.id===READING_ADVANCED_UNLOCK_ID);
}
