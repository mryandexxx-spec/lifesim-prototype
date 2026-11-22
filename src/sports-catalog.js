/** FANDOM-R1: original, locally owned fantasy football content. No licensed teams or feeds. */
export const SPORTS_SCHEMA=1;
export const SPORTS_LEAGUE_ID='blins-league';
export const SPORTS_DURATION=105; // 90 played minutes + a 15 minute half-time
export const SPORTS_SEASON_DAYS=42; // 5 weeks fixtures + 1 off week
export const SPORTS_TEAMS=Object.freeze([
  Object.freeze({id:'copper-gulls',name:'Медные Чайки',short:'Чайки',color:'#B96B40',style:'attack',strength:51}),
  Object.freeze({id:'forest-lanterns',name:'Лесные Фонари',short:'Фонари',color:'#40845E',style:'defence',strength:52}),
  Object.freeze({id:'sapphire-sparks',name:'Сапфировые Искры',short:'Искры',color:'#507BCC',style:'pace',strength:54}),
  Object.freeze({id:'amber-pier',name:'Янтарный Причал',short:'Причал',color:'#BD842C',style:'control',strength:50}),
  Object.freeze({id:'moon-foxes',name:'Лунные Лисы',short:'Лисы',color:'#8C72BA',style:'counter',strength:53}),
  Object.freeze({id:'steppe-sails',name:'Степные Паруса',short:'Паруса',color:'#369A9F',style:'passing',strength:49})
]);
/** R2: declared independent leagues; more can be registered without rewriting the
 * currently saved single-league schema. There is deliberately only one active
 * league until the owner approves additional content and save migration.
 */
export const SPORTS_LEAGUES=Object.freeze([
  Object.freeze({id:SPORTS_LEAGUE_ID,name:'Лига Блин’С',sport:'football',
    teams:SPORTS_TEAMS,duration:SPORTS_DURATION,legacyFixtureIds:true})
]);
export const sportsLeague=id=>SPORTS_LEAGUES.find(league=>league.id===id)||null;
export const sportsTeam=(id,leagueId=SPORTS_LEAGUE_ID)=>
  (sportsLeague(leagueId)?.teams||[]).find(team=>team.id===id)||null;
