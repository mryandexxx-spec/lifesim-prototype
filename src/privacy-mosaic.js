/**
 * LifeSim 0.6e.1 — original sea-glass pixel mosaic for shower privacy.
 * Pure deterministic RGBA data; no DOM, no shaders, no animation allocations.
 * All alpha bytes are 255. The whole resident rig remains disabled under it.
 */
export const MOSAIC_SIZE = 256;
export const MOSAIC_COLUMNS = 11;
export const MOSAIC_ROWS = 16;

const PALETTE = Object.freeze([
  [183,218,216], [167,206,210], [146,193,206],
  [199,214,229], [212,195,223], [185,211,203],
  [205,229,220], [178,185,215], [224,217,222],
  [159,192,201], [205,227,231], [191,221,214]
].map(rgb=>Object.freeze(rgb)));

function hashTile(x,y){
  let n=Math.imul(x+17,374761393)^Math.imul(y+29,668265263);
  n=Math.imul(n^(n>>>13),1274126177);
  return (n^(n>>>16))>>>0;
}
function clamp8(n){return Math.max(0,Math.min(255,Math.round(n)));}

/** Returns a fully opaque sRGB grid with thin frosted grout and bevels. */
export function privacyMosaicPixels(size=MOSAIC_SIZE){
  if(!Number.isInteger(size)||size<32||size>1024)
    throw new RangeError('Mosaic texture size must be a whole number from 32 to 1024');
  const rgba=new Uint8Array(size*size*4);
  const cells=Array.from({length:MOSAIC_COLUMNS*MOSAIC_ROWS},(_,id)=>{
    const x=id%MOSAIC_COLUMNS,y=Math.floor(id/MOSAIC_COLUMNS);
    const noise=hashTile(x,y);
    const wave=Math.round(2.6*Math.sin(x*.78+y*.4));
    const rgb=PALETTE[(noise%PALETTE.length+wave+PALETTE.length)%PALETTE.length];
    const light=((noise>>>8)%15)-7;
    return rgb.map(c=>clamp8(c+light));
  });
  for(let y=0;y<size;y++){
    const row=Math.min(MOSAIC_ROWS-1,Math.floor(y*MOSAIC_ROWS/size));
    const y0=Math.floor(row*size/MOSAIC_ROWS);
    const y1=Math.floor((row+1)*size/MOSAIC_ROWS);
    for(let x=0;x<size;x++){
      const col=Math.min(MOSAIC_COLUMNS-1,Math.floor(x*MOSAIC_COLUMNS/size));
      const x0=Math.floor(col*size/MOSAIC_COLUMNS);
      const x1=Math.floor((col+1)*size/MOSAIC_COLUMNS);
      const [r,g,b]=cells[row*MOSAIC_COLUMNS+col];
      const left=x-x0, top=y-y0, right=x1-x, bottom=y1-y;
      // The grout is solid; this is never a real translucency/blur effect.
      const grout=left===0||top===0||right<=1||bottom<=1;
      const bevel=left===1||top===1 ? 12 : right===2||bottom===2 ? -15: 0;
      const off=(y*size+x)*4;
      rgba[off]=grout?220:clamp8(r+bevel);
      rgba[off+1]=grout?235:clamp8(g+bevel);
      rgba[off+2]=grout?232:clamp8(b+bevel);
      rgba[off+3]=255;
    }
  }
  return rgba;
}

/** One sRGB texture uploaded once to the GPU and reused across three shells. */
export function createPrivacyMosaicMaterial(pc,graphicsDevice){
  const texture=new pc.Texture(graphicsDevice,{
    name:'LifeSim original shower pixel mosaic',
    width:MOSAIC_SIZE,height:MOSAIC_SIZE,
    format:pc.PIXELFORMAT_SRGBA8,mipmaps:true,
    minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter:pc.FILTER_NEAREST,
    addressU:pc.ADDRESS_CLAMP_TO_EDGE,
    addressV:pc.ADDRESS_CLAMP_TO_EDGE
  });
  texture.lock().set(privacyMosaicPixels());
  texture.unlock();
  const material=new pc.StandardMaterial();
  material.diffuse=new pc.Color(1,1,1);
  material.diffuseMap=texture;
  material.emissive=new pc.Color(.09,.11,.11);
  material.emissiveIntensity=.4;
  material.metalness=0;
  material.shininess=34;
  material.opacity=1;
  material.blendType=pc.BLEND_NONE;
  material.depthWrite=true;
  material.update();
  return material;
}
