/** UI7: short original iPhone onboarding. No game state, timer, DOM, engine. */
export const UI_TOUR_STORAGE_KEY='blins.ui.tour.v1';
export const UI_TOUR_STEPS=Object.freeze([
 Object.freeze({title:'Осмотри квартиру',body:'Проведи одним пальцем по комнате, чтобы переместить камеру. Двумя пальцами вращай обзор, сведение и разведение меняют масштаб. Кнопка ⟳ включает вращение одним пальцем.',hint:'Камера не отдаёт персонажу команд.'}),
 Object.freeze({title:'Выбери действие',body:'Коротко коснись мебели, другого жителя или земли. Сначала откроется меню действий. На земле выбери «Идти сюда» — только тогда команда добавится в очередь.',hint:'Если предмет трудно выбрать, открой «Меню» → «Подписи предметов».'}),
 Object.freeze({title:'Управляй жизнью',body:'Выбери Алекса или Миру внизу. Нажми на план вверху, чтобы увидеть очередь. У настроения нажми «Почему?», чтобы узнать причины. Через «Дом» открываются обстановка, стройка и участок.',hint:'Новая команда встанет в очередь, не отменяя текущую. Часы вверху открывают «Сегодня», а «Меню» — сохранение и помощь.'})
]);
export function createUITour(){
 let index=0;
 return {
   current:()=>UI_TOUR_STEPS[index],
   index:()=>index,
   length:UI_TOUR_STEPS.length,
   next(){if(index<UI_TOUR_STEPS.length-1){index++;return true;}return false;},
   reset(){index=0;},
   progress:()=>String(index+1)+' из '+UI_TOUR_STEPS.length
 };
}
export function shouldShowTour(pref){
 return pref!=='done';
}
