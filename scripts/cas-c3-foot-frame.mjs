// Estimate the longitudinal axis from the unique plantar vertices in bind pose.
// Conventions: +Z forward, +Y up, and rotation about Y only.
export function plantarFrame(positions) {
  const ground = Math.min(...positions.map(p => p[1]));
  const samples = [...new Map(positions.filter(p => p[1] <= ground + .05)
    .map(p => [p.join(','), p])).values()];
  if (samples.length < 20) throw new Error('Insufficient planted sole geometry');
  const center = samples.reduce(([x, z], p) =>
    [x + p[0] / samples.length, z + p[2] / samples.length], [0, 0]);
  let xx = 0, zz = 0, xz = 0;
  for (const [x, , z] of samples) {
    const dx = x - center[0], dz = z - center[1];
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  if (zz <= xx) throw new Error('Planted sole axis is ambiguous');
  const yaw = .5 * Math.atan2(2 * xz, zz - xx);
  return {sin: Math.sin(yaw), cos: Math.cos(yaw)};
}

export const intoFootFrame = ([x, y, z], {sin, cos}) =>
  [x*cos - z*sin, y, x*sin + z*cos];

export const fromFootFrame = ([x, y, z], {sin, cos}) =>
  [x*cos + z*sin, y, -x*sin + z*cos];
