/** W1-B.1: original, pure-data job families. Rank 0 is playable entry contract data.
 * All timings are GAME minutes; weekday 0=Monday ... 6=Sunday.
 * W2-A.1 extends the original 0..2 ranks with append-only 3..4 leadership roles.
 */
const families=[
  {id:'city-services',title:'Городские сервисы',description:'Доставка и организация городских поручений',
   days:[0,1,2,3,4],start:480,duration:480,ranks:[['Курьер',15],['Координатор',34],['Руководитель службы',73],['Директор городских сервисов',91],['Куратор городской сети',111]]},
  {id:'kitchen-studio',title:'Кулинарная мастерская',description:'От заготовок до авторских блюд',
   days:[1,2,3,4,5],start:600,duration:480,ranks:[['Помощник кухни',16],['Повар',38],['Шеф мастерской',82],['Шеф сети мастерских',101],['Кулинарный директор',123]]},
  {id:'art-studio',title:'Арт-студия',description:'Выставки, оформление и творческие проекты',
   days:[0,1,2,3,4],start:660,duration:420,ranks:[['Ассистент галереи',17],['Оформитель',36],['Арт-директор',77],['Директор сети арт-студий',95],['Руководитель творческих проектов',116]]},
  {id:'editorial',title:'Редакция',description:'Городские истории и работа над текстами',
   days:[0,1,2,3,4],start:540,duration:480,ranks:[['Стажёр редакции',14],['Обозреватель',35],['Редактор',79],['Главный редактор',97],['Руководитель издательских проектов',118]]},
  {id:'business-center',title:'Деловой центр',description:'Исследование процессов и планирование',
   days:[0,1,2,3,4],start:540,duration:480,ranks:[['Делопроизводитель',18],['Аналитик',42],['Управляющий',89],['Директор делового центра',104],['Руководитель деловой сети',125]]},
  {id:'civic-service',title:'Общественная служба',description:'Поддержка горожан и вечерние дежурства',
   days:[2,3,4,5,6],start:1200,duration:480,ranks:[['Помощник службы',19],['Инспектор',43],['Координатор службы',85],['Руководитель общественных программ',100],['Директор общественных инициатив',122]]}
];
export function validCareerSchedule(schedule){
  return !!schedule&&Array.isArray(schedule.weekdays)&&schedule.weekdays.length>0&&
    schedule.weekdays.length<=7&&new Set(schedule.weekdays).size===schedule.weekdays.length&&
    schedule.weekdays.every(d=>Number.isInteger(d)&&d>=0&&d<=6)&&
    Number.isInteger(schedule.startMinute)&&schedule.startMinute>=0&&schedule.startMinute<1440&&
    Number.isInteger(schedule.duration)&&schedule.duration>=60&&schedule.duration<=720&&
    ['observe','ignore'].includes(schedule.holidayPolicy);
}
export const CAREER_CATALOG=Object.freeze(families.map(f=>{
  const schedule=Object.freeze({weekdays:Object.freeze([...f.days]),startMinute:f.start,
    duration:f.duration,holidayPolicy:'observe'});
  if(!validCareerSchedule(schedule))throw new Error('Invalid career schedule '+f.id);
  return Object.freeze({id:f.id,title:f.title,description:f.description,
    schedule,ranks:Object.freeze(f.ranks.map(([title,hourlyCredits],index)=>
      Object.freeze({index,title,hourlyCredits})))});
}));
export function careerDefinition(id){
  return CAREER_CATALOG.find(c=>c.id===id)??null;
}
