/** UI7: short original iPhone onboarding. No game state, timer, DOM, engine. */
export const UI_TOUR_STORAGE_KEY='blins.ui.tour.v1';
export const UI_TOUR_STEPS=Object.freeze([
 Object.freeze({title:'Осмотри квартиру',body:'Проведи одним пальцем по комнате, чтобы переместить камеру. Двумя пальцами вращай обзор, сведение и разведение меняют масштаб. Кнопка ⟳ включает вращение одним пальцем.',hint:'Камера не отдаёт персонажу команд.'}),
 Object.freeze({title:'Выбери действие',body:'Коротко коснись мебели или другого жителя. Откроется меню действий. Движение пальцем не считается выбором.',hint:'Если предмет трудно выбрать, открой «ВИД» и включи подписи.'}),
 Object.freeze({title:'Управляй жизнью',body:'Выбери Алекса или Миру внизу. Нажми на план вверху, чтобы увидеть очередь. У настроения нажми «Почему?», чтобы узнать причины.',hint:'Новая команда встанет в очередь, не отменяя текущую.'})
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
