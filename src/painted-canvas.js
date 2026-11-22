// Original small-format illustrations for the easel and framed works.
// All coordinates are in canvas space; the seed survives moving and hanging a work.
import {PAINT_SUBJECTS} from './painting.js';

const W=256,H=320;
export function drawPainting(canvas,id,seed,stage=6){
  const ctx=canvas.getContext('2d');
  const palette=PAINT_SUBJECTS[id]?.palette;
  if(!ctx||!palette)return;
  const [sky,mid,accent,light,dark]=palette,theme=id.split('.')[1];
  let state=seed>>>0;
  const rand=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
  const wash=(y,bottom,topColor,bottomColor)=>{
    const g=ctx.createLinearGradient(0,y,0,bottom);
    g.addColorStop(0,topColor);g.addColorStop(1,bottomColor);
    ctx.fillStyle=g;ctx.fillRect(0,y,W,bottom-y);
  };
  const oval=(x,y,rx,ry,angle,color)=>{
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2);ctx.fill();
  };
  const shape=(color,points)=>{
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);
    for(const p of points.slice(1))ctx.lineTo(...p);
    ctx.closePath();ctx.fill();
  };
  const line=(color,width,points)=>{
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...points[0]);
    for(const p of points.slice(1))ctx.lineTo(...p);
    ctx.stroke();
  };
  const pick=colors=>colors[Math.floor(rand()*colors.length)];
  const cx=55+rand()*144,phase=rand()*6;
  ctx.save();
  try{
    wash(0,H,sky,light);
    if(stage<2)return;
    const night=['night','aurora'].includes(theme);
    if(theme==='stilllife'){
      wash(0,211,mid,sky);wash(211,H,dark,mid);
      oval(125,250,91,14,-.04,'#52434a');
      const vase=ctx.createLinearGradient(64,0,137,0);
      vase.addColorStop(0,dark);vase.addColorStop(.37,mid);vase.addColorStop(.68,sky);vase.addColorStop(1,mid);
      ctx.fillStyle=vase;ctx.beginPath();ctx.moveTo(85,144);
      ctx.bezierCurveTo(93,174,48,202,76,241);ctx.bezierCurveTo(90,253,119,248,128,239);
      ctx.bezierCurveTo(147,201,107,174,113,144);ctx.closePath();ctx.fill();
      oval(99,144,14,3,0,dark);
      if(stage>=3)for(let i=0;i<8;i++){
        const x=45+rand()*106,y=62+rand()*57;
        line(dark,1.8,[[99,144],[(x+99)/2,y+29],[x,y]]);
        oval(x,y,4+rand()*5,12,-.8+rand(),pick([accent,light,mid]));
      }
      if(stage>=4)for(const [x,y,r] of [[158,229,19],[187,242,16],[133,253,14]]){
        oval(x+4,y+9,r+4,r*.44,.04,dark);
        const fruit=ctx.createRadialGradient(x-r*.35,y-r*.5,1,x,y,r*1.3);
        fruit.addColorStop(0,'#ffe0a0');fruit.addColorStop(.5,accent);fruit.addColorStop(1,'#885344');
        oval(x,y,r,r*.87,-.2,fruit);line(dark,2,[[x,y-r+3],[x+3,y-r-3]]);
      }
    }else if(theme==='abstract'){
      for(let i=0;i<stage*2;i++){
        const x=rand()*W,y=rand()*H;
        ctx.strokeStyle=pick([dark,accent,mid,light]);ctx.lineWidth=3+rand()*29;
        ctx.beginPath();ctx.moveTo(x-105,y+63);ctx.bezierCurveTo(x-15,y+85,x+46,y-90,x+135,y-32);ctx.stroke();
      }
    }else{
      oval(cx,59+19*Math.sin(phase),17,17,0,night?'#f8e7c1':light);
      if(night)for(let i=0;i<68;i++)oval(rand()*W,rand()*147,.5+rand(),.9,0,light);
      if(theme==='aurora')for(let x=0;x<W;x+=2){
        const y=50+24*Math.sin(x/57+phase);
        const g=ctx.createLinearGradient(x,y-35,x,y+44);
        g.addColorStop(0,'#97e1d000');g.addColorStop(.68,'#8ad6ae99');g.addColorStop(1,'#bf9fc400');
        ctx.fillStyle=g;ctx.fillRect(x,y-35,2,80);
      }
      const water=['sea','harbor','night','aurora'].includes(theme);
      for(let layer=0;layer<3;layer++){
        const y=145+layer*34,points=[[-4,H]];
        for(let x=-4;x<=W+6;x+=5){
          const wave=Math.sin(x/(54-layer*5)+phase+layer)*16+Math.cos(x/23+layer)*4;
          points.push([x,y+wave]);
        }
        points.push([W+5,H]);shape([mid,accent,dark][layer],points);
      }
      if(theme==='mountains'&&stage>=3){
        for(const [x,y,w] of [[30,112,85],[133,63,102],[228,96,91]]){
          shape(mid,[[x-w,y+110],[x,y],[x+w,y+110]]);
          shape(dark,[[x,y],[x+w,y+110],[x+12,y+77]]);
          shape('#f1eee0',[[x-30,y+34],[x,y],[x+23,y+28],[x+10,y+23],[x+5,y+32],[x-3,y+19],[x-13,y+31]]);
        }
      }
      if(water){
        wash(176,H,mid,dark);
        if(stage>=3)for(let i=0;i<132;i++){
          const y=180+rand()*138,x=rand()*W;
          ctx.globalAlpha=.18+rand()*.4;
          line(Math.abs(x-cx)<20+(y-176)*.15?light:sky,1+rand(),[[x,y],[x+3+rand()*17,y]]);
        }
        ctx.globalAlpha=1;
        if(['sea','harbor'].includes(theme)&&stage>=4){
          const x=cx<115?174:72;
          shape(dark,[[x-31,219],[x+31,218],[x+20,227],[x-20,227]]);
          line(dark,2,[[x,219],[x,159]]);
          shape('#f2e3c4',[[x-3,164],[x-4,214],[x-27,215]]);
          shape(accent,[[x+3,173],[x+25,213],[x+3,213]]);
        }
      }
      if(['city','harbor'].includes(theme)&&stage>=3){
        const base=theme==='harbor'?177:253;
        for(let x=-7;x<W;){
          const w=16+rand()*23,h=23+rand()*49,y=base-h;
          ctx.fillStyle=pick([sky,light,mid]);ctx.fillRect(x,y,w,h);
          shape(dark,[[x-2,y],[x+w*.54,y-9-rand()*8],[x+w+2,y]]);
          for(let wx=x+4;wx<x+w-3;wx+=8)for(let wy=y+7;wy<base-4;wy+=11){
            ctx.fillStyle=pick([dark,accent,mid]);ctx.fillRect(wx,wy,3,5);
          }
          x+=w+1;
        }
      }
      if(['garden','autumn','hills','meadow','night','aurora'].includes(theme)&&stage>=3){
        const trees=theme==='meadow'?4:13;
        for(let i=0;i<trees;i++){
          const x=rand()*W,y=156+rand()*58,h=12+rand()*43;
          line(dark,2,[[x,y],[x+1,y-h]]);
          for(let j=0;j<18;j++){
            const angle=rand()*Math.PI*2,r=Math.sqrt(rand())*h*.32;
            oval(x+Math.cos(angle)*r,y-h+Math.sin(angle)*r,h*.10,h*.14,-.45,pick([mid,dark,theme==='autumn'?accent:mid]));
          }
        }
      }
      if(!water&&stage>=4)for(let i=0;i<230;i++){
        const x=rand()*W,y=222+rand()*98,s=(y-209)/45;
        ctx.globalAlpha=.22+rand()*.43;
        const floral=theme==='garden'||theme==='meadow';
        if(floral)line(mid,s*.6,[[x,y],[x+2,y-5*s]]);
        oval(x+2,y-(floral?5*s:0),s*(floral?1.5:3),s*.72,-.3,pick([mid,light,accent]));
      }
    }
    if(stage>=5){
      // Broken pigment marks keep the image legible in silhouette and textured close up.
      ctx.globalAlpha=.12;
      for(let i=0;i<1450;i++){
        const x=rand()*W,y=rand()*H;
        line(i%2?'#fff4da':'#443e47',.7,[[x,y],[x+1+rand()*4,y-rand()*1.5]]);
      }
    }
    if(stage===6){
      ctx.globalAlpha=.65;ctx.strokeStyle='#ecddc0';ctx.lineWidth=3;
      ctx.strokeRect(4,4,W-8,H-8);
    }
  }finally{ctx.restore();}
}

export function createPaintSurface(pc,device,node){
  const canvas=document.createElement('canvas');
  canvas.width=W;canvas.height=H;
  const texture=new pc.Texture(device,{name:'Paint on linen',width:W,height:H,mipmaps:false,
    minFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
  const material=new pc.StandardMaterial();
  material.diffuseMap=texture;material.useMetalness=false;material.update();
  node.render.material=material;
  node.once('destroy',()=>{texture.destroy();material.destroy();});
  let last='';
  return (theme,seed,stage)=>{
    node.enabled=Boolean(theme&&stage);
    if(!node.enabled)return;
    const key=theme+'/'+seed+'/'+stage;
    if(key===last)return;
    drawPainting(canvas,theme,seed,stage);
    texture.setSource(canvas);last=key;
  };
}
