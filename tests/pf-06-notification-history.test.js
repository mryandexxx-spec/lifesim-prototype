import test from 'node:test';
import assert from 'node:assert/strict';
import {newHousehold,loadHousehold} from '../src/household.js';
import {appendNotification,restoreNotificationHistory,unreadNotifications,markNotificationsRead,notificationIncidentCurrent} from '../src/notification-history.js';
test('PF-06 old v1 and independent fresh household, bounded history, duplicate and read state',()=>{
 const root=newHousehold();const raw=JSON.parse(JSON.stringify(root));delete raw.notificationHistory;
 const loaded=loadHousehold(raw);assert.equal(loaded.version,1);assert.equal(unreadNotifications(loaded.notificationHistory),0);
 appendNotification(loaded,'📅 Test');appendNotification(loaded,'📅 Test');
 assert.equal(loaded.notificationHistory.entries.length,1);assert.equal(loaded.notificationHistory.entries[0].repeat,2);
 assert.equal(unreadNotifications(loaded.notificationHistory),1);
 markNotificationsRead(loaded.notificationHistory);assert.equal(unreadNotifications(loaded.notificationHistory),0);
 appendNotification(loaded,'📅 Test');assert.equal(unreadNotifications(loaded.notificationHistory),1);
 for(let i=0;i<110;i++)appendNotification(loaded,'test '+i);
 assert.equal(loaded.notificationHistory.entries.length,100);
 markNotificationsRead(loaded.notificationHistory,loaded.notificationHistory.entries.at(-1).id);
 const restored=loadHousehold(JSON.parse(JSON.stringify(loaded)));
 assert.deepEqual(restored.notificationHistory,loaded.notificationHistory);
 assert.equal(restored.shop.credits,root.shop.credits);assert.equal(newHousehold().notificationHistory.entries.length,0);
});
test('PF-06 restore ignores malformed data and prevents stale incident CTA',()=>{
 const root=newHousehold();appendNotification(root,'💼 Test',{incidentResidentId:'resident_3',incidentId:'shift#work'});
 const e=root.notificationHistory.entries[0];assert.equal(notificationIncidentCurrent(e,{id:'shift#work'}),true);
 assert.equal(notificationIncidentCurrent(e,{id:'other#work'}),false);assert.equal(notificationIncidentCurrent(e,null),false);
 const restored=restoreNotificationHistory({schema:1,entries:[null,e,e,{...e,id:2,at:Infinity},{...e,id:3,message:'',at:0}]},root.minutes);
 assert.equal(restored.entries.length,1);assert.equal(restored.nextId,2);
});
