/** CAS-02.1-F1.1: measurable rigid shoe top-to-ankle fit (metres, +Y up).
 * Original vendor shoe and Alex pose are source-of-truth, not hard-coded pixels.
 * Extends only the rigid shoe's vertical presentation, never elevates its sole:
 * true toe bending / contact solver remain separate CAS-02.1-F2 work.
 */
export const ANKLE_OVERLAP_M=0.012;
export const SHOE_HEIGHT_FACTOR_RANGE=Object.freeze([1.3,2.2]);

/** A rigid prop has no foot skin weights. Fit its upper rim to just overlap
 * the actual source Mixamo ankle joint while keeping the sole grounded.
 * Caller must pass the measured vendor mesh height and source avatar scale.
 */
export function planRigidShoeAnkleFit({ankleY,soleY,sourceHeight,sourceScale,
  overlap=ANKLE_OVERLAP_M}){
 if(![ankleY,soleY,sourceHeight,sourceScale,overlap].every(Number.isFinite)||
    sourceHeight<=0||sourceScale<=0||overlap<0||overlap>.04)
  throw Error('Invalid real source shoe/ankle fit dimensions');
 const needed=(ankleY+overlap-soleY)/(sourceHeight*sourceScale);
 if(needed<SHOE_HEIGHT_FACTOR_RANGE[0]||needed>SHOE_HEIGHT_FACTOR_RANGE[1])
  throw Error('Unsafe shoe/ankle alignment: '+needed.toFixed(3));
 return Object.freeze({verticalFactor:needed,soleWorldY:soleY,
  targetCollarY:ankleY+overlap,ankleOverlap:overlap});
}
