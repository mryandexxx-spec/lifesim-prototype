/** Screen-space placement independent of renderer, safe in portrait/landscape.
 * Coordinates are CSS pixels in the app shell; never touch resident state.
 */
const finite=(n,fallback)=>Number.isFinite(n)?n:fallback;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(n,hi));
export function contextualPlacement({
  anchorX,anchorY,viewportWidth,viewportHeight,panelWidth,panelHeight,
  topInset=88,bottomInset=164,edge=12,gap=14
}={}){
  const vw=Math.max(1,finite(viewportWidth,390));
  const vh=Math.max(1,finite(viewportHeight,844));
  const leftEdge=Math.min(edge,vw/4);
  const availableWidth=Math.max(1,vw-leftEdge*2);
  const width=clamp(finite(panelWidth,340),1,availableWidth);
  const topEdge=clamp(finite(topInset,88),0,Math.max(0,vh-36));
  const roomBottom=Math.max(topEdge+44,vh-Math.max(0,finite(bottomInset,164)));
  const availableHeight=Math.max(44,Math.min(vh-topEdge-8,roomBottom-topEdge));
  const height=Math.min(Math.max(1,finite(panelHeight,260)),availableHeight);
  const targetX=clamp(finite(anchorX,vw/2),0,vw);
  const targetY=clamp(finite(anchorY,vh/2),0,vh);
  const right=targetX+gap;
  const left=targetX-gap-width;
  // Prefer a side of the tapped sim; on iPhone centre within the view.
  const x=right+width<=vw-leftEdge?right:
    left>=leftEdge?left:clamp(targetX-width/2,leftEdge,vw-leftEdge-width);
  const y=clamp(targetY-height*.36,topEdge,Math.max(topEdge,roomBottom-height));
  return {x:Math.round(x),y:Math.round(y),
    maxHeight:Math.round(availableHeight),side:right+width<=vw-leftEdge?'right':
      left>=leftEdge?'left':'center'};
}
/** Position the secondary view menu beside its toggle without crossing the HUD. */
export function viewMenuPlacement({
  buttonLeft,buttonTop,viewportWidth,viewportHeight,menuWidth=226,menuHeight=120,
  edge=12
}={}){
  const w=Math.max(1,finite(viewportWidth,390));
  const h=Math.max(1,finite(viewportHeight,844));
  const width=Math.min(Math.max(1,finite(menuWidth,226)),Math.max(1,w-edge*2));
  const x=clamp(finite(buttonLeft,w-58)-width-10,edge,Math.max(edge,w-width-edge));
  const y=clamp(finite(buttonTop,130)-10,edge,Math.max(edge,h-finite(menuHeight,120)-edge));
  return {x:Math.round(x),y:Math.round(y)};
}
