import {createHash} from 'node:crypto';
import {parseLegacyGlb, sourceAccessor} from './cas-source-asset-audit.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function pad(bytes, fill = 0) {
  return Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, fill)]);
}

export function encodeGlb(gltf, binary) {
  gltf.buffers[0].byteLength = binary.length;
  const json = pad(Buffer.from(JSON.stringify(gltf)), 32);
  const bin = pad(binary);
  const output = Buffer.alloc(28 + json.length + bin.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  const binAt = 20 + json.length;
  output.writeUInt32LE(bin.length, binAt);
  output.writeUInt32LE(0x004e4942, binAt + 4);
  bin.copy(output, binAt + 8);
  return output;
}

export function editGlb(bytes) {
  const source = parseLegacyGlb(bytes);
  const gltf = structuredClone(source.gltf);
  const chunks = [pad(source.bin)];
  let byteOffset = chunks[0].length;

  function append(values, type, componentType, target, bounds = false) {
    const width = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16}[type];
    const [size, setter] = {5121: [1, 'writeUInt8'], 5123: [2, 'writeUInt16LE'],
      5125: [4, 'writeUInt32LE'], 5126: [4, 'writeFloatLE']}[componentType];
    const entries = type === 'SCALAR' ? values.map(v => [v]) : values;
    const data = Buffer.alloc(entries.length * width * size);
    const min = Array(width).fill(Infinity);
    const max = Array(width).fill(-Infinity);
    entries.forEach((row, i) => {
      if (row.length !== width) throw new Error('Invalid GLB accessor shape');
      row.forEach((value, axis) => {
        if (!Number.isFinite(value)) throw new Error('Non-finite accessor');
        data[setter](value, (i * width + axis) * size);
        const encoded = componentType === 5126 ? Math.fround(value) : value;
        min[axis] = Math.min(min[axis], encoded);
        max[axis] = Math.max(max[axis], encoded);
      });
    });
    const bufferView = gltf.bufferViews.length;
    gltf.bufferViews.push({buffer: 0, byteOffset, byteLength: data.length, ...(target && {target})});
    const padded = pad(data);
    chunks.push(padded);
    byteOffset += padded.length;
    return gltf.accessors.push({bufferView, componentType, count: entries.length, type,
      ...(bounds && {min, max})}) - 1;
  }

  function read(index) {
    const {values, componentCount} = sourceAccessor(source, index);
    return Array.from({length: values.length / componentCount},
      (_, i) => values.slice(i * componentCount, (i + 1) * componentCount));
  }

  return {source, gltf, append, read,
    finish: () => encodeGlb(gltf, Buffer.concat(chunks))};
}

export function primitive(editor, vertices, faces, material) {
  return {
    attributes: {
      POSITION: editor.append(vertices.map(v => v.position), 'VEC3', 5126, 34962, true),
      NORMAL: editor.append(vertices.map(v => v.normal), 'VEC3', 5126, 34962),
      TEXCOORD_0: editor.append(vertices.map(v => v.uv), 'VEC2', 5126, 34962),
      JOINTS_0: editor.append(vertices.map(v => v.joints), 'VEC4', 5121, 34962),
      WEIGHTS_0: editor.append(vertices.map(v => v.weights), 'VEC4', 5126, 34962)
    },
    indices: editor.append(faces.flat(), 'SCALAR', vertices.length > 65535 ? 5125 : 5123, 34963, true),
    material
  };
}
