/** Q5: read-only canonical career graph for both household residents.
 * Rank indices are 0..4 (shared) and 5..7 per track. Never persist map state.
 */
import {careerDefinition} from './career-catalog.js';
import {careerPromotionRule,promotionReadiness} from './career-progression.js';
import {specializationReadiness} from './career-specializations.js';
import {seniorRank} from './career-seniority.js';
import {professionalGoalsView} from './career-goals.js';
import {currentSkillLevel} from './skills-engine.js';
import {HOBBY_SKILLS} from './hobby-reading.js';
import {workScenario} from './career-incidents.js';

const IDS=['alex','mira'];
const STATUS=Object.freeze({passed:'Пройдено',current:'Текущая должность',
  available:'Доступно',locked:'Закрыто'});
const whole=n=>Number.isFinite(n)?Math.max(0,Math.round(n)):0;
const actorFor=(root,id)=>id==='mira'?root?.otherSim:root;

function ruleOf(careerId,rank,track){
  if(rank.index===0)return null;
  if(rank.index<5)return careerPromotionRule(careerId,rank.index-1);
  if(rank.index===5)return track?.requirements||null;
  return seniorRank(careerId,track?.id,rank.index)?.requirements||null;
}
function requirementRows(rule,careerId,actor,contract,immediate,readiness){
  if(!rule)return [];
  // The canonical readiness owns every LIVE next-promotion comparison and proof.
  if(immediate&&readiness?.requirements?.length)
    return readiness.requirements.map(item=>({...item,scope:'live'}));
  // At future ranks the per-rank shift counter and proof ledger will be reset:
  // never misrepresent today's counts as progress earned at that future rank.
  const historical=contract.level>=0;
  const rows=[
    {label:'Результативность',target:rule.performance,
      current:whole(contract.performance),met:null,scope:'reference'},
    {label:'Смен на должности',target:rule.shifts,current:null,met:null,
      scope:historical?'rank-bound':'reference'}
  ];
  if(rule.skill)rows.push({label:HOBBY_SKILLS.skills[rule.skill]?.label||rule.skill,
    target:rule.level,current:currentSkillLevel(actor?.skills,HOBBY_SKILLS,rule.skill),
    met:null,scope:'reference'});
  const cases=rankScenes(rule);
  for(const caseId of cases)rows.push({
    label:'Успешная ситуация «'+(workScenario(careerId,caseId)?.title||caseId)+'»',
    target:1,current:null,met:null,scope:'rank-bound'
  });
  return rows;
}
function rankScenes(rule){
  return Array.isArray(rule.scenes)?rule.scenes:
    rule.scenarioId?[rule.scenarioId]:[];
}
function buildNode(root,id,career,contract,branch,readiness,rank,track=null){
  const selected=branch?.selected?.id||null;
  const isCurrent=rank.index===contract.level&&
    (rank.index<5||selected===track?.id);
  const isPassed=rank.index<contract.level&&
    (rank.index<5||selected===track?.id);
  const isNext=rank.index===contract.level+1&&
    (rank.index<5||selected===track?.id);
  const alternative=!!track&&selected!==null&&selected!==track.id;
  const canChoose=!!track&&rank.index===5&&branch?.unlocked&&
    selected!==track.id&&branch.canSwitch;
  const ready=!!isNext&&readiness?.ready&&!contract.currentShift;
  const status=isPassed?'passed':isCurrent?'current':
    ready||canChoose?'available':'locked';
  const immediate=!!isNext&&status!=='passed'&&
    !(rank.index===5&&!selected);
  const rule=ruleOf(career.id,rank,track);
  const adjusted=rank.index===5&&track?
    {...rule,scenarioId:track.scenarioId}:rule;
  const rows=requirementRows(adjusted,career.id,actorFor(root,id),contract,
    immediate,readiness);
  // A selected rank 6 with no selection cannot claim progress.
  const requirements=rows;
  return {id:track?track.id+'-'+rank.index:'common-'+rank.index,
    level:rank.index+1,title:rank.title,hourlyCredits:rank.hourlyCredits,
    branchId:track?.id||null,branchTitle:track?.title||null,
    status,statusLabel:STATUS[status],alternative,selectedBranch:!!track&&selected===track.id,
    canChoose,immediate,ready,requirements,requirementScope:
      immediate?'Действующий прогресс до повышения':
      isPassed?'Исторические требования (показатели на момент повышения не хранятся)':
      'Условия должности. Текущие показатели справочно; смены и доказательства засчитываются только на соответствующей ступени.'};
}
export function careerMapView(root,residentId){
  if(!IDS.includes(residentId))return null;
  const contract=root?.careerSystem?.byResident?.[residentId];
  const career=careerDefinition(contract?.careerId);
  if(!contract||!career||!Number.isInteger(contract.level)||
    contract.level<0||contract.level>7)return null;
  const branch=specializationReadiness(root,residentId);
  const readiness=promotionReadiness(root,residentId);
  const common=career.ranks.map(rank=>
    buildNode(root,residentId,career,contract,branch,readiness,rank));
  const tracks=(branch?.tracks||[]).map(track=>{
    const ranks=[track.rank,seniorRank(career.id,track.id,6),
      seniorRank(career.id,track.id,7)];
    if(ranks.some(rank=>!rank))return null;
    return {id:track.id,title:track.title,description:track.description,
      selected:branch.selected?.id===track.id,
      nodes:ranks.map(rank=>buildNode(root,residentId,career,contract,
        branch,readiness,rank,track))};
  }).filter(Boolean);
  return {residentId,careerId:career.id,careerTitle:career.title,
    currentLevel:contract.level+1,selectedTrackId:branch?.selected?.id||null,
    common,tracks,all:[...common,...tracks.flatMap(t=>t.nodes)],
    goals:professionalGoalsView(root,residentId)?.goals||[]};
}
