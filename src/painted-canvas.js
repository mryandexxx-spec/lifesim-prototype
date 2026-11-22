// Original illustrations. Load a subject on its first visible use only.
import {PAINT_SUBJECTS,compositionForArtwork} from './painting.js';

const W=256,H=320,images=new Map();
function paintingImage(theme){
  if(!images.has(theme)){
    const image=new Image();
    const ready=new Promise(resolve=>{
      image.onload=()=>resolve(image);
      image.onerror=()=>{images.delete(theme);resolve(null);};
    });
    const name=theme.slice('painting.'.length);
    image.src=new URL('../assets/paintings/'+name+'.webp',import.meta.url).href;
    images.set(theme,ready);
  }
  return images.get(theme);
}

function baseCoat(ctx,theme,seed){
  const palette=PAINT_SUBJECTS[theme].palette;
  ctx.fillStyle='#ecdfc9';ctx.fillRect(0,0,W,H);
  for(const [shape,x,y,w,h,index] of compositionForArtwork(theme,seed,1)){
    ctx.fillStyle=palette[index];
    const cx=(.5+x/.76)*W,cy=(.5-(y-1.37)/.96)*H,dx=w/.76*W,dy=h/.96*H;
    if(shape==='box')ctx.fillRect(cx-dx/2,cy-dy/2,dx,dy);
    else{
      ctx.beginPath();ctx.ellipse(cx,cy,dx/2,dy/2,0,0,Math.PI*2);ctx.fill();
    }
  }
}

// Work from large colour masses to local detail. A given saved seed keeps its
// framing, handedness and glaze on the easel, in the studio and on the wall.
export function paintLayer(canvas,image,theme,seed,stage){
  const ctx=canvas.getContext('2d');
  if(!image){baseCoat(ctx,theme,seed);return;}
  const variant=seed>>>0;
  const crop=.015+((variant>>>8)%9)/100;
  const w=image.width*(1-crop),h=image.height*(1-crop);
  const x=(image.width-w)*((variant&255)/255);
  const y=(image.height-h)*(((variant>>>16)&255)/255);
  const pass=document.createElement('canvas');
  pass.width=[0,8,16,36,75,154,W][stage];pass.height=Math.round(pass.width*H/W);
  const pigment=pass.getContext('2d');
  pigment.drawImage(image,x,y,w,h,0,0,pass.width,pass.height);
  ctx.save();
  if(variant&1){ctx.translate(W,0);ctx.scale(-1,1);}
  ctx.fillStyle='#ecdfc9';ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=.5+stage/12;
  ctx.drawImage(pass,0,0,W,H);
  // A thin warm/cool wash distinguishes editions without changing the subject.
  ctx.fillStyle=variant&8?'#d8a865':'#6490a5';
  ctx.globalAlpha=((variant>>>12)%9)/100;
  ctx.fillRect(0,0,W,H);
  ctx.restore();
}

export function createPaintSurface(pc,device,node){
  const canvas=document.createElement('canvas');
  canvas.width=W;canvas.height=H;
  const texture=new pc.Texture(device,{name:'Paint on linen',width:W,height:H,mipmaps:false,
    minFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
  const material=new pc.StandardMaterial();
  material.diffuseMap=texture;material.update();
  node.render.material=material;
  let last='',alive=true;
  node.once('destroy',()=>{alive=false;texture.destroy();material.destroy();});
  return (theme,seed,stage)=>{
    node.enabled=Boolean(PAINT_SUBJECTS[theme]&&stage);
    if(!node.enabled){last='';return;}
    const key=theme+'/'+seed+'/'+stage;
    if(key===last)return;
    last=key;
    const render=image=>{
      if(!alive||key!==last)return;
      paintLayer(canvas,image,theme,seed,stage);
      texture.setSource(canvas);
    };
    render(null);
    paintingImage(theme).then(image=>{if(image)render(image);});
  };
}
