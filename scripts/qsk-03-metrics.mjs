/** QSK-03: pure, engine-independent aggregators. Missing metrics stay null. */
export const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function percentile(values, fraction) {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new RangeError('percentile fraction must be [0,1]');
  const sorted=values.filter(value => finite(value)!==null).sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const index=Math.max(0,Math.ceil(sorted.length*fraction)-1);
  return Math.round(sorted[index]*100)/100;
}

export function distribution(values) {
  const valid=values.filter(value=>finite(value)!==null);
  return {samples:valid.length,p50:percentile(valid,.5),p95:percentile(valid,.95),max:valid.length?Math.round(Math.max(...valid)*100)/100:null};
}

export function summarizeFrames(frames) {
  if (!Array.isArray(frames)) throw new TypeError('frames must be an array');
  const fields=['rafIntervalMs','frameTimeMs','cpuUpdateMs','cpuRenderMs','gpuFrameMs','drawCalls','triangles','fps','vramBytes','jsHeapBytes'];
  return Object.fromEntries(fields.map(field=>[field,distribution(frames.map(frame=>frame?.[field]))]));
}

export function summarizeAssetResources(resources) {
  const result={glb:{requests:0,decodedBytes:0,transferBytes:0},
    texture:{requests:0,decodedBytes:0,transferBytes:0},
    other:{requests:0,decodedBytes:0,transferBytes:0}};
  for(const entry of resources) {
    const url=String(entry?.name??'').split('?')[0].toLowerCase();
    const bucket=/\.glb$/.test(url)?'glb':/\.(png|jpe?g|webp|ktx2|basis|avif)$/.test(url)?'texture':'other';
    result[bucket].requests++;
    result[bucket].decodedBytes+=Math.max(0,finite(entry?.decodedBodySize)??0);
    result[bucket].transferBytes+=Math.max(0,finite(entry?.transferSize)??0);
  }
  return result;
}
