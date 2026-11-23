import {interpolateVertex, packWeights} from './cas-c3-body.mjs';

const CLEARANCE = .002;
const EPSILON = 1e-7;
const cross = ([ax, ay], [bx, by]) => ax * by - ay * bx;
const blend = t => t * t * (3 - 2 * t);

function crossSections(fit) {
  const positions = fit.vertices.map(v => fit.footPoint(v.position));
  const triangles = fit.faces.map(face => {
    const points = face.map(i => positions[i]);
    const z = points.map(p => p[2]);
    return {points, minZ: Math.min(...z), maxZ: Math.max(...z)};
  });
  const sections = new Map();
  return z => {
    if (sections.has(z)) return sections.get(z);
    const edges = [], upper = [];
    for (const {points, minZ, maxZ} of triangles) {
      if (z < minZ || z >= maxZ) continue;
      const intersections = [];
      for (let i = 0; i < 3; i++) {
        const a = points[i], b = points[(i + 1) % 3];
        if ((a[2] > z) === (b[2] > z)) continue;
        const t = (z - a[2]) / (b[2] - a[2]);
        intersections.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      if (intersections.length !== 2) continue;
      edges.push(intersections);
      const [[ax, ay], [bx, by]] = intersections;
      if (Math.abs(bx - ax) >= Math.abs(by - ay)) upper.push(intersections);
    }
    if (!edges.length) throw new Error('C4 foot extends past the end of the flat shoe last');
    const points = edges.flat();
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    const bottom = Math.min(...ys);
    const floor = bottom - CLEARANCE + rayDistance(edges, [x, bottom - CLEARANCE], [0, 1]);
    if (!Number.isFinite(floor)) throw new Error('C4 flat shoe last lacks a continuous sole');
    const section = {edges, upper, origin: [x, floor + 2 * CLEARANCE]};
    sections.set(z, section);
    return section;
  };
}

function rayDistance(edges, origin, ray) {
  let distance = Infinity;
  for (const [a, b] of edges) {
    const edge = [b[0] - a[0], b[1] - a[1]];
    const offset = [a[0] - origin[0], a[1] - origin[1]];
    const determinant = cross(ray, edge);
    if (Math.abs(determinant) < EPSILON) continue;
    const t = cross(offset, edge) / determinant;
    const u = cross(offset, ray) / determinant;
    if (t > EPSILON && u >= -EPSILON && u <= 1 + EPSILON) distance = Math.min(t, distance);
  }
  return distance;
}

// Long triangles near the collar can bridge across a narrow strap or toe cap
// after the vertices are fitted. Split their shared edges below the cuff.
function refineFoot(layer, top, seamY) {
  const vertices = [...layer.vertices];
  const splits = new Map();
  function midpoint(a, b) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (splits.has(key)) return splits.get(key);
    const p = vertices[a].position, q = vertices[b].position;
    if (Math.min(p[1], q[1]) >= top || Math.max(p[1], q[1]) >= seamY - EPSILON ||
        Math.hypot(...p.map((v, i) => v - q[i])) < .01) return undefined;
    const index = vertices.push(interpolateVertex(vertices[a], vertices[b], .5)) - 1;
    splits.set(key, index);
    return index;
  }
  const faces = [];
  for (const face of layer.faces) {
    const mids = face.map((v, i) => midpoint(v, face[(i + 1) % 3]));
    const missing = mids.indexOf(undefined);
    if (missing < 0) {
      faces.push(mids);
      for (let i = 0; i < 3; i++) faces.push([face[i], mids[i], mids[(i + 2) % 3]]);
      continue;
    }
    // Start at the unsplit edge to preserve winding in all three cases.
    const [a, b, c] = [0, 1, 2].map(i => face[(i + missing) % 3]);
    const bc = mids[(missing + 1) % 3], ca = mids[(missing + 2) % 3];
    if (bc !== undefined && ca !== undefined) faces.push([a, b, bc], [a, bc, ca], [ca, bc, c]);
    else if (bc !== undefined) faces.push([a, b, bc], [a, bc, c]);
    else if (ca !== undefined) faces.push([a, b, ca], [ca, b, c]);
    else faces.push(face);
  }
  return {vertices, faces};
}

// A spoke from the insole hits the real upper or exits through the cutout.
// Keep the instep in the latter case and tuck the covered surface inside the
// former, including under the Mary Jane strap. Both layers use the same last.
export function fitOpenUpper(fit) {
  const sectionAt = crossSections(fit);
  const top = Math.min(fit.seamY, Math.max(...fit.vertices.map(v => v.position[1])));
  return layer => {
    const refined = refineFoot(layer, top, fit.seamY);
    return {...refined, vertices: refined.vertices.map(v => {
      const [x, y, z] = fit.footPoint(v.position);
      if (y >= fit.seamY - EPSILON) return v;
      const {edges, upper, origin} = sectionAt(z);
      const dx = x - origin[0], dy = y - origin[1];
      const length = Math.hypot(dx, dy);
      if (length < EPSILON) return v;
      const distance = rayDistance(edges, origin, [dx / length, dy / length]);
      const binding = 1 - blend(Math.max(0, (y - top) / (fit.seamY - top)));
      const shrink = binding * Math.max(0, 1 - Math.max(0, distance - CLEARANCE) / length);
      const local = [x - dx * shrink, y - dy * shrink, z];
      // The side of a curved strap can overhang the spoke underneath it.
      // Seat the dorsal surface under those projected panels as well.
      const aboveUpper = top + CLEARANCE;
      const roof = aboveUpper - rayDistance(upper, [local[0], aboveUpper], [0, -1]);
      if (roof > origin[1] + 4 * CLEARANCE)
        local[1] -= binding * Math.max(0, local[1] - roof + CLEARANCE);
      const weights = new Map(fit.influences(local).map(([joint, weight]) => [joint, weight * binding]));
      v.joints.forEach((joint, i) => weights.set(joint, (weights.get(joint) ?? 0) + v.weights[i] * (1 - binding)));
      return {...v, position: fit.modelPoint(local), ...packWeights(weights)};
    })};
  };
}
