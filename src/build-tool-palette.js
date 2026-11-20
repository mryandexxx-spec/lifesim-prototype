// UX-03: presentation-only grouping. Canonical ConstructionWorld commands are unchanged.
export const BUILD_TOOL_GROUPS = Object.freeze([
  {
    "id": "room",
    "label": "Комната",
    "tools": [
      "room",
      "room-duplicate",
      "room-relocate",
      "room-join"
    ]
  },
  {
    "id": "walls",
    "label": "Стены и пол",
    "tools": [
      "move-wall",
      "floor",
      "wall",
      "wall-height",
      "erase-wall",
      "remove-floor"
    ]
  },
  {
    "id": "openings",
    "label": "Проёмы",
    "tools": [
      "door",
      "window",
      "arch",
      "change-opening",
      "remove-opening"
    ]
  },
  {
    "id": "finishes",
    "label": "Отделка",
    "tools": [
      "paint-room",
      "paint-floor",
      "paint-wall",
      "paint-facade-all",
      "paint-facade",
      "paint-ceiling-room",
      "paint-ceiling-tile",
      "sample-finish"
    ]
  },
  {
    "id": "roof",
    "label": "Крыша",
    "tools": [
      "roof-auto",
      "roof-add",
      "roof-edit",
      "roof-remove",
      "roof-clear"
    ]
  },
  {
    "id": "porch",
    "label": "Крыльцо",
    "tools": [
      "porch-add",
      "porch-remove"
    ]
  }
].map(group=>Object.freeze({
  ...group,tools:Object.freeze(group.tools)
})));
const toolGroups = new Map(BUILD_TOOL_GROUPS.flatMap(group=>
  group.tools.map(tool=>[tool,group.id])));
toolGroups.set('camera','view');
export const BUILD_TOOL_IDS = Object.freeze([...toolGroups.keys()]);
export function buildGroupForTool(tool){return toolGroups.get(tool)||null;}
export function describeBuildPreview(command){
  if(!command)return {title:'Подтвердить изменение?',action:'✓ Применить',detail:''};
  const actions={
    room:['Построить комнату?','✓ Построить комнату'],
    'room-duplicate':['Скопировать комнату?','✓ Скопировать'],
    'room-relocate':['Перенести комнату с содержимым?','✓ Перенести'],
    'room-join':['Объединить комнаты?','✓ Объединить'],
    'roof-clear':['Удалить все крыши?','✓ Удалить крыши']
  };
  const [title,action]=actions[command.type]||['Подтвердить изменение?','✓ Применить'];
  let detail='';
  if(command.type==='room'&&command.from&&command.to){
    const width=Math.round(Math.abs(command.to.x-command.from.x)*10)/10;
    const depth=Math.round(Math.abs(command.to.z-command.from.z)*10)/10;
    const area=Math.round(width*depth*100)/100;
    if(Number.isFinite(area)&&area>0)detail=`${width} × ${depth} м · ${area} м²`;
  }
  return {title,action,detail};
}
