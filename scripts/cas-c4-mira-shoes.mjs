import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {digest, editGlb} from './cas-c3-glb.mjs';
import {buildWearableFromGeometry} from './cas-c3-shoes.mjs';
import {supportReport} from './cas-c3-contact.mjs';
import {intoFootFrame} from './cas-c3-foot-frame.mjs';
import {fitOpenUpper} from './cas-c4-open-upper.mjs';

export const FEMALE_STYLES = Object.freeze(['ballet', 'mary-jane', 'ankle-boots']);
const folder = new URL('../assets/characters/cas-c3/', import.meta.url);
// One source-wide MakeHuman body-to-meter conversion. The C3 fit resolver
// performs uniform scaling to Mira's existing foot; no per-shoe CSS/px shims.
const MH_UNIT = 0.145;
const stiffness = Object.freeze({
  ballet: {flex: .65, shell: 'low', fitOpenUpper},
  'mary-jane': {flex: .52, shell: 'low', fitOpenUpper},
  'ankle-boots': {flex: .32, shell: 'high'}
});

const percentile = (values, rank) => {
  if (!values.length) throw new Error('C4 missing actual collar vertices');
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1, Math.floor(rank*(sorted.length-1)))];
};
const pointKey = p => p.map(n=>Math.round(n*1e5)).join(':');

function sourcePrimitive(editor) {
  const {gltf} = editor;
  if (gltf.meshes?.length !== 1 || gltf.meshes[0].primitives?.length !== 1 ||
      gltf.skins?.length || gltf.animations?.length) throw new Error('C4 expected one static authored shoe pair');
  const p = gltf.meshes[0].primitives[0];
  const pos = editor.read(p.attributes.POSITION);
  const norm = editor.read(p.attributes.NORMAL);
  const uv = editor.read(p.attributes.TEXCOORD_0);
  const indices = editor.read(p.indices).flat();
  if (indices.length % 3 || pos.length !== norm.length || pos.length !== uv.length)
    throw new Error('C4 authored shoe topology is inconsistent');
  return {material:p.material,vertices:pos.map((position,i)=>({position,normal:norm[i],uv:uv[i]})),
    faces:Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3))};
}

function heelAnkleFraction(target) {
  if (!target?.ankle || !target?.heel || !target?.toe || !target?.axis)
    throw new Error('C4 missing true recipient heel/ankle/toe footprint');
  const origin = [target.ankle[0], 0, target.ankle[2]];
  const project = point => intoFootFrame([point[0]-origin[0], 0, point[2]-origin[2]], target.axis)[2];
  // Derive the canonical source-last anchor from the same measured C3 foot
  // profile and existing C3 .006m heel/.009m toe clearance allowances.
  // It is one semantic rule applied to every shoe and every source last.
  const rear = .006 - project(target.heel);
  const front = .009 + project(target.toe);
  const fraction = rear / (rear + front);
  if (!Number.isFinite(fraction) || fraction < .1 || fraction > .3)
    throw new Error('C4 invalid foot heel-to-ankle proportion');
  return fraction;
}

function normalizeHalf(source, faceIds, side, target) {
  const faces = faceIds.map(i=>source.faces[i]);
  const used = [...new Set(faces.flat())];
  const remap = new Map(used.map((v,i)=>[v,i]));
  const raw = used.map(i=>source.vertices[i]);
  const x = raw.map(v=>v.position[0]);
  const y = raw.map(v=>v.position[1]);
  const z = raw.map(v=>v.position[2]);
  const xmin = Math.min(...x), xmax = Math.max(...x);
  const zmin = Math.min(...z), zmax = Math.max(...z);
  const ymin = Math.min(...y);
  const heelFraction = heelAnkleFraction(target);
  // Raw OBJ origin follows MakeHuman mannequin. Use the recipient's actual
  // heel-to-ankle semantic length, NOT source AABB midpoint, for socket zero.
  const centerX = (xmin+xmax)/2, centerZ = zmin + (zmax-zmin)*heelFraction;
  const width = (xmax-xmin)*MH_UNIT, length = (zmax-zmin)*MH_UNIT;
  if (width < .04 || width > .18 || length < .25 || length > .43)
    throw new Error('C4 '+side+' source last dimensions invalid ('+width+','+length+')');
  const vertices = raw.map(v=>({...v,
    position:[(v.position[0]-centerX)*MH_UNIT,
      (v.position[1]-ymin)*MH_UNIT,
      (v.position[2]-centerZ)*MH_UNIT]}));
  const localZ = vertices.map(v=>v.position[2]);
  const floorZ = Math.min(...localZ);
  // Collar height bands are measured from the shoe's own heel and toe,
  // never from the avatar's ankle coordinate or a centred AABB origin.
  // This remains valid after semantic heel-to-ankle normalization.
  const longitudinal = localZ.map(z=>(z-floorZ)/length);
  const back = vertices.filter((v,i)=>longitudinal[i] < 1/3).map(v=>v.position[1]);
  const middle = vertices.filter((v,i)=>longitudinal[i] >= 1/3 && longitudinal[i] < 2/3).map(v=>v.position[1]);
  const front = vertices.filter((v,i)=>longitudinal[i] >= 2/3).map(v=>v.position[1]);
  const roof = [back,middle,front].map(a=>percentile(a,.89));
  const openingRadiiXZ = [Math.max(width*.6,.02),Math.max(length*.36,.055)];
  return {vertices, faces: faces.map(face=>face.map(i=>remap.get(i))),
    originalKeys:new Set(used.map(i=>pointKey(source.vertices[i].position))),
    collar:roof, openingRadiiXZ, measuredSource:{width,length,roof,heelFraction}};
}

export function normalizeFemalePair(bytes, style, profile) {
  if (!FEMALE_STYLES.includes(style)) throw new Error('C4 unknown female shoe style');
  const editor = editGlb(bytes);
  const source = sourcePrimitive(editor);
  const sides = {left:[],right:[]};
  source.faces.forEach((face,index)=>{
    const coords = face.map(v=>source.vertices[v].position[0]);
    if (Math.min(...coords) < -.15 && Math.max(...coords) > .15)
      throw new Error('C4 source triangles cross both source shoes');
    sides[coords.reduce((a,b)=>a+b,0)>0?'left':'right'].push(index);
  });
  if (sides.left.length < 25 || sides.right.length < 25) throw new Error('C4 missing one authored shoe');
  if (profile?.resident !== 'mira' || !profile.sides?.left || !profile.sides?.right)
    throw new Error('C4 requires original independent Mira rig profile');
  const left = normalizeHalf(source,sides.left,'left',profile.sides.left);
  const right = normalizeHalf(source,sides.right,'right',profile.sides.right);
  if (left.faces.length + right.faces.length !== source.faces.length ||
      [...left.originalKeys].some(key=>right.originalKeys.has(key)))
    throw new Error('C4 original authored halves are not independent');
  const symmetry = [left.measuredSource, right.measuredSource];
  if (Math.abs(symmetry[0].length-symmetry[1].length)>.012 ||
      Math.abs(symmetry[0].width-symmetry[1].width)>.012)
    throw new Error('C4 asymmetric source last is not normalized');
  return {editor, material:source.material, ...stiffness[style],sides:{left,right}};
}

export function buildMiraFootwear() {
  const base = readFileSync(new URL('mira.glb',folder));
  const profile = JSON.parse(readFileSync(new URL('mira.profile.json',folder)));
  if (profile.resident !== 'mira') throw new Error('C4 refuses non-Mira body');
  const sources = JSON.parse(readFileSync(new URL('c4-source-manifest.json',folder)));
  const old = JSON.parse(readFileSync(new URL('manifest.json',folder)));
  const original = old.wearers.mira;
  if (digest(base) !== original.bodySha256 || profile.inverseBindSha256 !== original.inverseBindSha256)
    throw new Error('C4 baseline body or Mira bind moved');
  const styles = {};
  const outfits = {};
  for (const style of FEMALE_STYLES) {
    const sourceFile = sources.styles[style];
    const input = readFileSync(new URL(sourceFile.file,folder));
    if (digest(input) !== sourceFile.sha256) throw new Error('C4 imported source SHA changed');
    const geometry = normalizeFemalePair(input,style,profile);
    for (const side of ['left','right']) {
      const {width,length,roof,heelFraction} = geometry.sides[side].measuredSource;
      const foot = profile.sides[side];
      console.log('C4B canonical source-last',style,side,JSON.stringify({width,length,roof,heelFraction,
        targetFootLength:foot.footLength,targetFootWidth:foot.footWidth,
        ankle:foot.ankle,heel:foot.heel,toe:foot.toe}));
    }
    const result = buildWearableFromGeometry(base,profile,geometry);
    const name = 'mira-c4-'+style+'.glb';
    writeFileSync(new URL(name,folder),result.glb);
    outfits[style]=result.glb;
    styles[style]={file:name,sha256:digest(result.glb),sides:result.stats,
      sourceFile:sourceFile.file,sourceSha256:sourceFile.sha256,
      license:sourceFile.license, sourceID:sourceFile.sourceID};
    console.log('C4B wearer',style,styles[style].sha256,JSON.stringify(result.stats));
  }
  const wearer = {body:original.body,bodySha256:original.bodySha256,
    originalRender:original.originalRender,inverseBindSha256:original.inverseBindSha256,
    styles,contact:supportReport(base,profile.originalRender,outfits)};
  const manifest={version:1,stage:'CAS-02.1-F2-C4B',resident:'mira',
    maleBaselineSha256:old.wearers.alex.bodySha256,wearers:{mira:wearer}};
  writeFileSync(new URL('c4-manifest.json',folder),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildMiraFootwear();
