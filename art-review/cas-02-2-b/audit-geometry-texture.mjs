
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
function parseGLB(buf){
 const L=buf.readUInt32LE(12),g=JSON.parse(buf.toString('utf8',20,20+L));
 const offset=20+L+8,bin=buf.subarray(offset,offset+buf.readUInt32LE(20+L));
 return{g,bin};
}
function get({g,bin},index){
 const a=g.accessors[index],v=g.bufferViews[a.bufferView];
 const comps={VEC2:2,VEC3:3,VEC4:4,SCALAR:1}[a.type],
 types={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5126:[4,'readFloatLE']}[a.componentType];
 const [size,fn]=types;
 const result=[];
 const o=(v.byteOffset||0)+(a.byteOffset||0);
 const stride=v.byteStride||size*comps;
 for(let i=0;i<a.count;i++)for(let k=0;k<comps;k++)result.push(bin[fn](o+i*stride+k*size));
 return result;
}
const hash=b=>createHash('sha256').update(b).digest('hex');
const percent=(vals,p)=>{const a=vals.slice().sort((a,b)=>a-b);return +a[Math.floor((a.length-1)*p)].toFixed(4)};
for(const kind of ['alex','mira']){
 const base=Buffer.from(await (await fetch('https://mryandexxx-spec.github.io/lifesim-prototype/assets/characters/'+(kind==='alex'?'meshy-casual-v1':'meshy-mira-mobile-v1')+'.glb')).arrayBuffer());
 const orig=parseGLB(base),der=parseGLB(readFileSync('source-variants/'+kind+'.glb'));
 const p=orig.g.meshes[0].primitives[0],q=der.g.meshes[0].primitives[0];
 const pos=get(orig,p.attributes.POSITION),uv=get(orig,p.attributes.TEXCOORD_0),norm=get(orig,p.attributes.NORMAL);
 const names=['eyes','nose','lips','chin','cheeks','body'],regions=[];
 for(let k=0;k<names.length;k++){
  const delta=get(der,q.targets[k].POSITION),pts=[];
  for(let i=0;i<pos.length/3;i++){
   const dis=Math.hypot(delta[3*i],delta[3*i+1],delta[3*i+2]);
   if(dis>.00025)pts.push({i,dis,x:pos[i*3],y:pos[i*3+1],z:pos[i*3+2],nz:norm[3*i+2],u:uv[2*i],v:uv[2*i+1]});
  }
  regions.push(pts);
  const stat=d=>[.01,.10,.50,.90,.99].map(n=>percent(pts.map(x=>x[d]),n));
  console.log('MORPH_REGION '+JSON.stringify({kind,name:names[k],count:pts.length,xyz:['x','y','z'].map(stat),uv:['u','v'].map(stat),normalZ:stat('nz'),maxDis:Math.max(...pts.map(x=>x.dis))}));
 }
 const eyes=new Set(regions[0].map(x=>x.i));
 for(const k of [1,2,3,4]){
  const shared=regions[k].filter(x=>eyes.has(x.i)).length;
  console.log('MORPH_OVERLAP '+JSON.stringify({kind,a:'eyes',b:names[k],shared,ofEyes:eyes.size,ofOther:regions[k].length}));
 }
 const image=orig.g.images[0],bv=orig.g.bufferViews[image.bufferView],embedded=orig.bin.subarray(bv.byteOffset,bv.byteOffset+bv.byteLength);
 const meta=await sharp(embedded).metadata();
 console.log('SOURCE_ATLAS '+JSON.stringify({kind,image:meta.format,w:meta.width,h:meta.height,hash:hash(embedded),sourceBytes:base.length}));
 mkdirSync('audit',{recursive:true});
 const thumb=await sharp(embedded).resize({width:700}).jpeg({quality:62}).toBuffer();
 writeFileSync('audit/'+kind+'-atlas.jpg',thumb);
 const b64=thumb.toString('base64');
 for(let i=0;i<b64.length;i+=1500)console.log('ATLAS_CHUNK '+kind+' '+(i/1500)+' '+b64.slice(i,i+1500));
}