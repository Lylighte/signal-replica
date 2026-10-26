// Five time-based steps: changing duration stretches the entire upward pulse.
export function shakeEnvelope(time,design){
  if(design.shakeDuration<=0)return 0;
  let amount=0;
  for(const start of [design.shakeStart,design.shakeRepeatStart]){
    const progress=(time-start)/design.shakeDuration;
    if(progress<0||progress>=1)continue;
    const steps=[design.shakeEdge,design.shakeShoulder,1,design.shakeShoulder,design.shakeEdge];
    amount=Math.max(amount,Math.max(0,Math.min(1,steps[Math.floor(progress*5)])));
  }
  return amount;
}

const positiveScale=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):1;
const resetContext=ctx=>{
  ctx.setTransform?.(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  if('filter'in ctx)ctx.filter='none';
};

export class SignalDistortion{
  constructor(width=0,height=0){
    this.width=Number.isInteger(width)&&width>0?width:0;this.height=Number.isInteger(height)&&height>0?height:0;
    this.buffers=[];this.disposed=false;
  }
  ensureBuffers(width,height){
    if(this.disposed)return false;
    if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)throw new Error('色差效果画布尺寸无效。');
    if(!this.buffers.length){
      // One source/tint canvas and one compositing canvas are sufficient. The
      // old four-canvas implementation doubled the effect's 4K working set.
      this.buffers=Array.from({length:2},()=>document.createElement('canvas'));
    }
    if(this.width!==width||this.height!==height||this.buffers.some(canvas=>canvas.width!==width||canvas.height!==height)){
      this.width=width;this.height=height;
      for(const canvas of this.buffers){canvas.width=width;canvas.height=height;}
    }
    return true;
  }
  apply(canvas,ctx,time,design,entry='none',options={}){
    if(this.disposed)return false;
    const pulse=shakeEnvelope(time,design),entryActive=entry!=='none'&&entry!=='wash'&&Number(design.glitchStrength)>0;
    const alpha=Math.max(0,Math.min(1,Number(design.chromaticStrength)||0))*(entryActive?1:pulse);
    const scale=positiveScale(typeof options==='number'?options:options?.pixelScale);
    const lift=pulse*Math.max(0,Number(design.shakeAmplitude)||0)*scale;
    const offset=Math.max(0,Number(design.chromaticOffset)||0)*scale;
    if((!alpha||!offset)&&!lift)return false;
    const width=canvas?.width,height=canvas?.height;
    if(!this.ensureBuffers(width,height))return false;
    const [source,mixed]=this.buffers,copy=source.getContext('2d'),mix=mixed.getContext('2d');
    if(!copy||!mix)throw new Error('当前浏览器无法创建色差效果画布。');
    const copyFrame=()=>{
      resetContext(copy);copy.globalCompositeOperation='copy';copy.drawImage(canvas,0,0,width,height);copy.globalCompositeOperation='source-over';
    };
    if(alpha&&offset){
      resetContext(mix);mix.globalCompositeOperation='copy';mix.fillStyle='#000';mix.fillRect(0,0,width,height);mix.globalCompositeOperation='lighter';
      const addTint=(color,y)=>{
        copyFrame();copy.globalCompositeOperation='multiply';copy.fillStyle=color;copy.fillRect(0,0,width,height);copy.globalCompositeOperation='source-over';
        mix.drawImage(source,0,y);
      };
      // Complementary channel groups preserve neutral brightness where they overlap.
      addTint(entryActive?'#ff00ff':'#ff0000',-offset);addTint(entryActive?'#00ff00':'#00ffff',offset);
      mix.globalCompositeOperation='source-over';
      ctx.save();resetContext(ctx);
      if(entryActive){
        ctx.beginPath();const seed=Math.floor(time*30),band=Math.max(1,(Number(design.chromaticBandHeight)||1)*scale);
        for(let i=0;i<12;i++){const n=Math.sin(seed*61+i*127.1)*43758.5453;ctx.rect(0,(n-Math.floor(n))*height,width,band);}
        ctx.clip();
      }
      ctx.globalAlpha=alpha;ctx.drawImage(mixed,0,0);ctx.restore();
    }
    if(lift){
      // Capture the chromatic composite too, then move the complete frame.
      copyFrame();ctx.save();resetContext(ctx);ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);ctx.drawImage(source,0,-lift);ctx.restore();
    }
    return true;
  }
  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    for(const canvas of this.buffers){canvas.width=1;canvas.height=1;}
    this.buffers=[];this.width=0;this.height=0;
  }
}
