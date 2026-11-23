import {Mat4, Quat, Vec3} from 'playcanvas';
import {motionTracks, samplePose} from './cas-c3-contact.mjs';
import {modelResolver} from './cas-c3-rig.mjs';

export const HEEL_CLIPS = Object.freeze({
  bind: 'C4C heel stance', idle: 'C4C heel idle', walk: 'C4C heel walk', sit: 'C4C heel sit to stand'
});
const REFERENCES = {idle: /^Idle/, walk: /^Walking$/, sit: /^Sit_to_Stand/};
const FRAME_RATE = 30;
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const vector = values => new Vec3(...values);
const matrix = values => new Mat4().set(values);
const position = values => vector(values.slice(12, 15));
const rotation = values => new Quat().setFromMat4(matrix(values)).normalize();
const offset = (a, b) => new Vec3().sub2(a, b);
const quaternion = (axis, radians) => new Quat().setFromAxisAngle(axis, radians * 180 / Math.PI);

function localRotation(parent, child) {
  return parent.clone().invert().mul(child).normalize().toArray();
}

function alignBone(from, to, current) {
  return new Quat().setFromDirections(from.normalize(), to.normalize()).mul(current).normalize();
}

function solveLeg(reference, hipShift, target, ankleRotation, forward) {
  const hip = reference.hip.clone().add(hipShift);
  const axis = offset(target, hip);
  const length = axis.length();
  const a = reference.upperLength, b = reference.lowerLength;
  if (length > a + b || length < Math.abs(a - b)) throw new Error('C4C ankle outside the two-bone reach');
  axis.mulScalar(1 / length);
  const kneeDirection = offset(reference.knee, reference.hip);
  // Keep the knee on the anatomical forward side through nearly straight frames.
  const pole = forward.clone().sub(axis.clone().mulScalar(forward.dot(axis)));
  const along = (a * a - b * b + length * length) / (2 * length);
  const knee = hip.clone().add(axis.mulScalar(along))
    .add(pole.normalize().mulScalar(Math.sqrt(Math.max(0, a * a - along * along))));
  const upper = alignBone(kneeDirection, offset(knee, hip), reference.upperRotation);
  const lower = alignBone(offset(reference.ankle, reference.knee), offset(target, knee), reference.lowerRotation);
  return [localRotation(reference.hipsRotation, upper), localRotation(upper, lower),
    localRotation(lower, ankleRotation)];
}

function rigSide(gltf, bind, side, shoe, profile) {
  const name = side[0].toUpperCase() + side.slice(1);
  const nodes = ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map(bone =>
    gltf.nodes.findIndex(n => n.name === 'mixamorig:' + name + bone));
  if (nodes.some(i => i < 0)) throw new Error('C4C Mira leg chain is incomplete');
  const ankle = position(bind(nodes[2]));
  const neutralAnkle = ankle.clone().add(new Vec3(0, shoe.heelRise, 0));
  const bindRotation = rotation(bind(nodes[2]));
  const forward = new Vec3(profile.axis.sin, 0, profile.axis.cos);
  const lateral = new Vec3(profile.axis.cos, 0, -profile.axis.sin);
  const neutralRotation = quaternion(lateral, shoe.pitch).mul(bindRotation);
  const inverseFoot = matrix(bind(nodes[2])).invert();
  const inverseToe = matrix(bind(nodes[3])).invert();
  const localHeel = inverseFoot.transformPoint(vector(profile.heel).set(profile.heel[0], profile.sourceSoleY, profile.heel[2]));
  const localToe = inverseToe.transformPoint(vector(profile.toe).set(profile.toe[0], profile.sourceSoleY, profile.toe[2]));
  const relativeSole = shoe.vertices.map(v => vector(v.position).sub(neutralAnkle));
  const support = [shoe.heelTip, shoe.ball].map(point => vector(point).sub(neutralAnkle));
  return {nodes, ankle, neutralAnkle, bindRotation, neutralRotation,
    forward, lateral, localHeel, localToe, relativeSole, support};
}

function referenceFor(model, hips, side) {
  const [upper, lower, ankle, toe] = side.nodes.map(model);
  const hip = position(upper), knee = position(lower), foot = position(ankle);
  return {hip, knee, ankle: foot, hipsRotation: rotation(model(hips)),
    upperRotation: rotation(upper), lowerRotation: rotation(lower), footRotation: rotation(ankle),
    upperLength: hip.distance(knee), lowerLength: knee.distance(foot),
    floor: Math.min(matrix(ankle).transformPoint(side.localHeel).y,
      matrix(toe).transformPoint(side.localToe).y)};
}

function walkingTarget(reference, side, clearance, sinceLanding) {
  const sourceDelta = reference.footRotation.clone().mul(side.bindRotation.clone().invert());
  const direction = sourceDelta.transformVector(side.forward);
  const yaw = clamp(Math.atan2(direction.x, direction.z) - Math.atan2(side.forward.x, side.forward.z), -.22, .22);
  const referencePitch = clamp(Math.atan2(-direction.y, Math.hypot(direction.x, direction.z)) * .56, -.19, .33);
  const landing = 1 - clamp(Math.min(sinceLanding / .12, (1 - sinceLanding) / .10), 0, 1);
  const strike = landing * landing * (3 - 2 * landing);
  const pitch = referencePitch + (-.16 - referencePitch) * strike;
  const roll = quaternion(Vec3.UP, yaw).mul(quaternion(side.lateral, pitch));
  const pitched = new Vec3();
  let lowest = Infinity;
  for (const point of side.relativeSole) {
    roll.transformVector(point, pitched);
    lowest = Math.min(lowest, pitched.y);
  }
  // Compensate horizontal motion introduced by rotating around the ankle.
  // Heel strike pivots on the heel tip, push-off on the forefoot.
  const pivot = new Vec3().lerp(side.support[0], side.support[1], clamp((pitch + .035) / .07, 0, 1));
  const shift = pivot.clone().sub(roll.transformVector(pivot));
  const ankle = new Vec3(reference.ankle.x + shift.x,
    clearance - lowest, side.ankle.z + (reference.ankle.z - side.ankle.z) * .8 + shift.z);
  return {ankle, orientation: roll.mul(side.neutralRotation)};
}

function fitPose(body, hips, rig, pose, mode, stanceReferences, lift, phases) {
  const gltf = body.gltf;
  const model = modelResolver(gltf, pose);
  const references = rig.map(side => referenceFor(model, hips, side));
  const floor = Math.min(...references.map(r => r.floor));
  const targets = rig.map((side, i) => {
    if (mode === 'walk') return walkingTarget(references[i], side,
      Math.max(0, references[i].floor - floor - .005), phases[i]);
    const prior = stanceReferences?.[i].ankle ?? side.ankle;
    return {ankle: new Vec3(prior.x, side.neutralAnkle.y, prior.z),
      orientation: side.neutralRotation};
  });

  // Lower the pelvis if a reference frame would otherwise overextend a knee.
  const hipY = Math.min(lift, ...targets.map(({ankle}, i) => {
    const {hip, upperLength, lowerLength} = references[i];
    const horizontal = Math.hypot(ankle.x - hip.x, ankle.z - hip.z);
    const maxLength = upperLength + lowerLength - .001;
    return ankle.y - hip.y + Math.sqrt(Math.max(0, maxLength * maxLength - horizontal * horizontal));
  }));
  const adjusted = new Map(pose);
  const hipsTransform = pose.get(hips) ?? {};
  const hipTranslation = [...(hipsTransform.translation ?? gltf.nodes[hips].translation)];
  hipTranslation[1] += hipY;
  adjusted.set(hips, {...hipsTransform, translation: hipTranslation});
  const hipShift = new Vec3(0, hipY, 0);
  for (const [i, side] of rig.entries()) {
    const target = targets[i];
    const angles = solveLeg(references[i], hipShift, target.ankle, target.orientation, side.forward);
    side.nodes.slice(0, 3).forEach((node, j) =>
      adjusted.set(node, {...pose.get(node), rotation: angles[j]}));
    const toe = side.nodes[3];
    adjusted.set(toe, {...pose.get(toe), rotation: gltf.nodes[toe].rotation});
  }
  return adjusted;
}

function landingPhases(body, rig, hips, frames) {
  const clearances = frames.slice(0, -1).map(pose => {
    const model = modelResolver(body.gltf, pose);
    const floors = rig.map(side => referenceFor(model, hips, side).floor);
    return floors.map(height => height - Math.min(...floors));
  });
  const count = clearances.length;
  const landings = rig.map((_, side) => {
    const peak = clearances.reduce((best, frame, i) => frame[side] > clearances[best][side] ? i : best, 0);
    for (let step = 1; step < count; step++) {
      const next = (peak + step) % count;
      if (clearances[next][side] <= .005) return next;
    }
    throw new Error('C4C reference gait has no landing');
  });
  return frames.map((_, i) => landings.map(start => ((i - start + count) % count) / count));
}

export function heelMotion(body, profile, shoes) {
  const {gltf} = body;
  const bind = modelResolver(gltf);
  const hips = gltf.nodes.findIndex(n => n.name === 'mixamorig:Hips');
  const rig = ['left', 'right'].map(side => rigSide(gltf, bind, side, shoes[side], profile.sides[side]));
  const lift = (shoes.left.heelRise + shoes.right.heelRise) / 2;
  const neutral = fitPose(body, hips, rig, new Map(), 'bind', null, lift);
  const clips = {};
  for (const [mode, name] of Object.entries(HEEL_CLIPS)) {
    const reference = gltf.animations.find(a => (REFERENCES[mode] ?? REFERENCES.idle).test(a.name));
    if (!reference) throw new Error('C4C Mira clip missing ' + mode);
    const tracks = motionTracks(body, reference);
    const duration = mode === 'bind' ? 1 : Math.max(...tracks.map(track => track.times.at(-1)));
    const count = mode === 'bind' ? 1 : Math.ceil(duration * FRAME_RATE);
    const timestamps = Array.from({length: count + 1}, (_, index) => index / count * duration);
    const start = modelResolver(gltf, samplePose(tracks, 0));
    const stance = rig.map(side => referenceFor(start, hips, side));
    const samples = timestamps.map(time => samplePose(tracks, time));
    const phases = mode === 'walk' ? landingPhases(body, rig, hips, samples) : [];
    const frames = mode === 'bind' ? [neutral, neutral] : samples.map((pose, i) =>
      fitPose(body, hips, rig, pose, mode, stance, lift, phases[i]));
    clips[mode] = {name, tracks, frames,
      timestamps: timestamps.map(time => mode === 'walk' ? time * 1.22 : time)};
  }
  return {neutral, clips};
}

export function exportHeelClips(editor, body, clips) {
  editor.gltf.animations = Object.values(clips).map(({name, timestamps, tracks, frames}) => {
    const input = editor.append(timestamps, 'SCALAR', 5126, undefined, true);
    const samplers = [], channels = [];
    for (const {node, path} of tracks) {
      const values = frames.map(pose => pose.get(node)?.[path] ?? body.gltf.nodes[node][path]);
      if (values.some(v => !v)) throw new Error('C4C animation is missing ' + path + ' on node ' + node);
      if (path === 'rotation') {
        for (let i = 1; i < values.length; i++) {
          const prior = values[i - 1];
          if (values[i].reduce((dot, value, j) => dot + value * prior[j], 0) < 0)
            values[i] = values[i].map(v => -v);
        }
      }
      const output = editor.append(values, path === 'rotation' ? 'VEC4' : 'VEC3', 5126);
      channels.push({target: {node, path}, sampler: samplers.length});
      samplers.push({input, output, interpolation: 'LINEAR'});
    }
    return {name, samplers, channels};
  });
}
