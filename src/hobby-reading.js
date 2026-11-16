/** H1 pilot content/balance. Domain authored separately from prefab, gift and UI. */
import {createSkillRegistry} from './skill-registry.js';
import {createHobbyContentCatalog} from './hobby-content.js';
import {createActivityRegistry} from './activity-registry.js';

export const READING_ACTIVITY_ID='hobby.read.fiction';
export const READING_CONTENT_ID='book.first.stories';
export const READING_SKILL_ID='literature';
export const MUSIC_ACTIVITY_ID='hobby.listen.music';
export const MUSIC_CONTENT_IDS=Object.freeze(['music.calm','music.rhythmic','music.dreamy']);
export const HOBBY_SKILLS=createSkillRegistry({skills:[{
  id:READING_SKILL_ID,label:'Литературная эрудиция',group:'knowledge',
  maxLevel:10,xpThresholds:[30,75,135,215,320,455,625,830,1080,1380],
  practiceTags:['book.fiction'],
  unlocks:[{id:'books.discuss.classics',minLevel:3}]
}]});
export const HOBBY_CONTENT=createHobbyContentCatalog({entries:[{
  id:READING_CONTENT_ID,kind:'book',label:'Истории дальних дорог',
  difficulty:1,tags:['book.fiction','books'],skillTags:[READING_SKILL_ID]
},
  {id:'music.calm',kind:'musicStyle',label:'Тихий вечер',difficulty:1,tags:['music','calm_leisure'],skillTags:[]},
  {id:'music.rhythmic',kind:'musicStyle',label:'Тёплый ритм',difficulty:1,tags:['music','rhythm'],skillTags:[]},
  {id:'music.dreamy',kind:'musicStyle',label:'Звёздный свет',difficulty:1,tags:['music','dreamy'],skillTags:[]}
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
    contentKind:'musicStyle',timeBudget:{minMinutes:8,targetMinutes:35},
    needEffects:[{statId:'needs.fun',perMinute:0.94}],
    skillPractice:[],poseKey:'music.listen',audioCue:'music.original'
  }]
});
