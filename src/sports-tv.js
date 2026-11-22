/** FANDOM-R1: original offline match image for an already-used physical TV.
 * Read-only canvas 2D; no network, football footage, generated reward or time tick.
 */
import {sportsTeam} from './sports-catalog.js';
import {sportsFixtures,matchAt} from './sports-league.js';
import {tvScreenFrame} from './tv-interaction.js';
const homeTv=(root,id)=>typeof id==='string'&&root?.world?.furniture?.instances?.some(
 item=>item.instanceId===id&&item.prefabId==='tv'&&item.location==='home');
const liveMatch=(root,now=root?.minutes)=>sportsFixtures(root?.sportsWorld).find(
 m=>m.kickoff<=now&&now<m.end)||null;

/** A broadcast opportunity is not an action: the existing physical A* + FIFO
 * system still decides whether someone can actually watch. */
export function sportsWatchOpportunity(root){
 if(!root||root.paused||!Number.isFinite(root.minutes))return null;
 const match=liveMatch(root),tv=root?.world?.furniture?.instances?.find(
  x=>x.prefabId==='tv'&&x.location==='home');
 if(!match||!tv)return null;
 return {matchId:match.id,tvId:tv.instanceId,
  home:sportsTeam(match.home)?.name,away:sportsTeam(match.away)?.name,
  remaining:Math.max(0,match.end-root.minutes)};
}
export function sportsTvFrame(root,tvId,now=root?.minutes){
 if(!root?.sportsWorld||!Number.isFinite(now)||!homeTv(root,tvId))return null;
 const frame=tvScreenFrame([root,root.otherSim],tvId,0,root.socialAction);
 if(!frame.on)return null;
 const match=liveMatch(root,now);
 if(!match)return null;
 const view=matchAt(root.sportsWorld,match.id,now);
 if(!view||view.state!=='live')return null;
 return {matchId:match.id,state:'live',minute:view.minute,elapsed:now-match.kickoff,
   home:sportsTeam(match.home),away:sportsTeam(match.away),
   score:view.score,events:view.events};
}
const line=(ctx,x,y,X,Y)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(X,Y);ctx.stroke();};
/** Uses only standard CanvasRenderingContext2D primitives; all canvas color
 * values are original palette or constants. Composes a real 2D game image.
 * Renderers may upload the result to an existing TV mesh as a texture. */
export function paintSportsTv(ctx,frame,width=512,height=312){
 if(!ctx||!frame?.home||!frame?.away||frame.state!=='live')return false;
 const w=Math.max(100,width),h=Math.max(60,height),pad=12,top=h*.25;
 const rect=[pad,top,w-2*pad,h-top-18],scale=v=>v;
 ctx.save();
 ctx.fillStyle='#102923';ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#152e29';ctx.fillRect(0,0,w,top);
 ctx.fillStyle='#f2f5e8';ctx.font=`${Math.round(h*.075)}px sans-serif`;
 ctx.textAlign='center';
 ctx.fillText(frame.home.short+'  '+frame.score[0]+' : '+frame.score[1]+'  '+frame.away.short,
  w/2,top*.57);
 ctx.font=`${Math.round(h*.044)}px sans-serif`;
 ctx.fillText('ЛИГА БЛИН’С · '+frame.minute+"′",w/2,top*.88);
 ctx.fillStyle='#245642';ctx.fillRect(...rect);
 const [x,y,fw,fh]=rect;
 ctx.fillStyle='#2c694e';
 for(let i=0;i<6;i+=2)ctx.fillRect(x+i*fw/6,y,fw/6,fh);
 ctx.lineWidth=Math.max(1,w*.003);
 ctx.strokeStyle='#d8eadc';ctx.strokeRect(x+4,y+4,fw-8,fh-8);
 line(ctx,x+fw/2,y+4,x+fw/2,y+fh-4);
 ctx.beginPath();ctx.arc(x+fw/2,y+fh/2,fh*.18,0,Math.PI*2);ctx.stroke();
 ctx.strokeRect(x+4,y+fh*.25,fw*.16,fh*.5);
 ctx.strokeRect(x+fw-4-fw*.16,y+fh*.25,fw*.16,fh*.5);
 const phase=(frame.elapsed+frame.events.length*7)%100;
 const ballX=x+fw*(.12+.76*phase/100),ballY=y+fh*(.28+.38*Math.sin(phase*.07)**2);
 for(const [team,side] of [[frame.home,0],[frame.away,1]]){
   ctx.fillStyle=team.color;
   for(let n=0;n<5;n++){
     const u=.12+(side?.55:.03)+n*.07;
     const v=.16+(n%3)*.28;
     ctx.beginPath();ctx.arc(x+fw*u,y+fh*v,Math.max(4,w*.012),0,Math.PI*2);ctx.fill();
   }
 }
 ctx.beginPath();ctx.fillStyle='#ffffff';ctx.arc(ballX,ballY,Math.max(3,w*.007),0,Math.PI*2);ctx.fill();
 const latest=frame.events.at(-1);
 if(latest){ctx.fillStyle='#ededd8';ctx.font=`${Math.round(h*.039)}px sans-serif`;
   ctx.fillText(latest.label,w/2,h-5);}
 ctx.restore();
 return true;
}
