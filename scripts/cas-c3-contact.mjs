import {editGlb} from './cas-c3-glb.mjs';
import {modelResolver, multiply} from './cas-c3-rig.mjs';

const SAMPLES_PER_SECOND = 30;
const SIDES = ['left', 'right'];
const CLIPS = [/^Idle/, /^Walking$/, /^Running$/, /^Sit_to_Stand/];

function between(a, b, t) {
  return a.map((value, i) => value + (b[i]-value)*t);
}

function rotation(a, b, t) {
  const sign = a.reduce((sum, value, i) => sum + value*b[i], 0) < 0 ? -1 : 1;
  const end = b.map(value => value*sign);
  const dot = Math.min(1, a.reduce((sum, value, i) => sum + value*end[i], 0));
  const theta = Math.acos(dot);
  const q = theta < .001 ? between(a, end, t) :
    a.map((value, i) => (value*Math.sin((1-t)*theta) + end[i]*Math.sin(t*theta))/Math.sin(theta));
  const norm = Math.hypot(...q);
  return q.map(value => value / norm);
}

function motionTracks(model, clip) {
  return clip.channels.map(({sampler, target}) => {
    const {input, output, interpolation} = clip.samplers[sampler];
    if (interpolation && interpolation !== 'LINEAR') throw new Error('Unsupported C3 animation interpolation');
    return {...target, times: model.read(input).flat(), values: model.read(output)};
  });
}

function samplePalette(model, tracks, inverse, time) {
  const pose = new Map();
  for (const {node, path, times, values} of tracks) {
    const at = times.findIndex(t => t >= time);
    let value;
    if (at <= 0) value = values[at === 0 ? 0 : values.length-1];
    else {
      const t = (time-times[at-1])/(times[at]-times[at-1]);
      const interpolate = path === 'rotation' ? rotation : between;
      value = interpolate(values[at-1], values[at], t);
    }
    if (!pose.has(node)) pose.set(node, {});
    pose.get(node)[path] = value;
  }
  const matrix = modelResolver(model.gltf, pose);
  return model.gltf.skins[0].joints.map((node, index) => multiply(matrix(node), inverse[index]));
}

function sole(model, name, keep, band) {
  const node = model.gltf.nodes.find(n => n.name === name);
  const p = model.gltf.meshes[node.mesh].primitives[0];
  const {POSITION, JOINTS_0, WEIGHTS_0} = p.attributes;
  const joints = model.read(JOINTS_0);
  const weights = model.read(WEIGHTS_0);
  const positions = model.read(POSITION);
  const eligible = [...new Set(model.read(p.indices).flat())].filter(i => keep(positions[i]));
  const min = Math.min(...eligible.map(i => positions[i][1]));
  return eligible.filter(i => positions[i][1] <= min+band)
    .map(i => ({position: positions[i], joints: joints[i], weights: weights[i]}));
}

function supportPoint(samples, palette) {
  const posed = samples.map(({position: [x,y,z], joints, weights}) => {
    const point = [0, 0, 0];
    for (let i = 0; i < weights.length; i++) {
      if (!weights[i]) continue;
      const m = palette[joints[i]];
      for (let axis = 0; axis < 3; axis++)
        point[axis] += weights[i] * (m[axis]*x + m[4+axis]*y + m[8+axis]*z + m[12+axis]);
    }
    return point;
  });
  let low = Infinity;
  for (const point of posed) low = Math.min(low, point[1]);
  let x = 0, z = 0, count = 0;
  for (const point of posed) {
    if (point[1] > low+.0025) continue;
    x += point[0];
    z += point[2];
    count++;
  }
  return [x/count, low, z/count];
}

export function supportReport(bodyBytes, originalName, outfits) {
  const body = editGlb(bodyBytes);
  const inverse = body.read(body.gltf.skins[0].inverseBindMatrices);
  const all = () => true;
  const sources = {
    original: SIDES.map((side, index) =>
      sole(body, originalName, ([x]) => (x > 0) === (index === 0), .028)),
    bare: SIDES.map(side => sole(body, 'C3 foot ' + side, all, .016))
  };
  for (const [style, bytes] of Object.entries(outfits)) {
    const asset = editGlb(bytes);
    sources[style] = SIDES.map(side => sole(asset, 'C3 shoe ' + side, all, .022));
  }
  const animations = CLIPS.map(pattern => body.gltf.animations.find(clip => pattern.test(clip.name))).filter(Boolean);
  const result = {};
  for (const animation of [null, ...animations]) {
    const tracks = animation ? motionTracks(body, animation) : [];
    const duration = tracks.reduce((max, {times}) => Math.max(max,times.at(-1)), 0);
    const count = Math.ceil(duration*SAMPLES_PER_SECOND);
    const samples = Array.from({length: count+1}, (_, i) => samplePalette(body, tracks, inverse,
      count ? i/count*duration : 0));
    const readings = Object.fromEntries(Object.entries(sources).map(([style, sides]) =>
      [style, sides.map(side => samples.map(palette => supportPoint(side, palette)))]));
    const minima = Object.fromEntries(Object.entries(readings).map(([style, sides]) =>
      [style, Math.min(...sides.flat().map(point => point[1]))]));
    const styles = Object.fromEntries(Object.entries(readings).map(([style, sides]) => {
      const support = [];
      const drift = [];
      for (const [side, poses] of sides.entries()) {
        const baseline = readings.original[side];
        let previous = null;
        for (const [i, p] of poses.entries()) {
          const [x, y, z] = p;
          const [refX, refY, refZ] = baseline[i];
          if (refY - minima.original > .008) {
            previous = null;
            continue;
          }
          support.push(y - minima[style]);
          const delta = [x-refX, z-refZ];
          if (previous) drift.push(Math.hypot(delta[0]-previous[0], delta[1]-previous[1]));
          previous = delta;
        }
      }
      return [style, {offsetY: -minima[style], sampleCount: count+1,
        sourceSupportSamples: support.length, maxLiftOnOriginalSupport: Math.max(0,...support),
        peakSupportPointDeltaPerSample: Math.max(0,...drift)}];
    }));
    result[animation?.name ?? 'bind'] = styles;
  }
  return result;
}
