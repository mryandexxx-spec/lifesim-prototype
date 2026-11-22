/** G: one stable app registry; three routes adapt existing canonical modules. */
export const PHONE_APPS=Object.freeze([
  Object.freeze({id:'work',label:'Блин’S Hunter',caption:'Работа и карьера',icon:'💼'}),
  Object.freeze({id:'food',label:'Блин’Ставка',caption:'Доставка еды',icon:'🛵'}),
  Object.freeze({id:'finance',label:'Блин’С Банк',caption:'Финансы семьи',icon:'💳'}),
  Object.freeze({id:'calls',label:'Звонки',caption:'Разговоры с близкими',icon:'☎'})
]);
const APP_IDS=new Set(PHONE_APPS.map(x=>x.id));
export const phoneAppRoute=id=>APP_IDS.has(id)?id:'home';
