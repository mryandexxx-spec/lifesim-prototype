/** Pure camera framing for CAS-02.2-B's Safari art-review viewer. */
export function computeReviewFraming({
  viewportHeight, panelTop, controlsBottom=108, focus='body', fovDegrees=42
}) {
  if (![viewportHeight,panelTop,controlsBottom,fovDegrees].every(Number.isFinite) ||
      viewportHeight<200 || fovDegrees<=10 || fovDegrees>=110)
    throw new Error('Invalid review viewport');
  if (!['face','body'].includes(focus)) throw new Error('Invalid review focus');
  const top=Math.max(58,Math.min(viewportHeight-100,controlsBottom+12));
  const bottom=Math.max(top+65,Math.min(viewportHeight-8,panelTop-12));
  const visible=bottom-top;
  const focusY=focus==='face'?1.55:.90;
  const objectBottom=focus==='face'?1.29:0;
  const objectTop=focus==='face'?1.81:1.81;
  const tangent=Math.tan(fovDegrees*Math.PI/360);
  const distance=Math.max(.75,Math.min(25,
    (objectTop-objectBottom)*viewportHeight/(2*tangent*Math.max(50,visible*.82))));
  const metersPerPixel=2*distance*tangent/viewportHeight;
  const desiredScreenY=(top+bottom)/2;
  // Camera looks BELOW the model when the free viewing area is above
  // the screen centre. Previous sign mistake pushed the resident UNDER the panel.
  const targetY=focusY+(desiredScreenY-viewportHeight/2)*metersPerPixel;
  const projectY=worldY=>viewportHeight/2-(worldY-targetY)/metersPerPixel;
  return Object.freeze({
    top,bottom,visible,distance,targetY,focusY,desiredScreenY,
    modelTopScreenY:projectY(objectTop),modelBottomScreenY:projectY(objectBottom),
    marginTop:projectY(objectTop)-top,marginBottom:bottom-projectY(objectBottom)
  });
}
