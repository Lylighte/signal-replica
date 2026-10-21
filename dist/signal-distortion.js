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

export class SignalDistortion{
  constructor(width,height){
    this.width=width;this.height=height;
    this.buffers=Array.from({length:4},()=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;});
  }
  apply(canvas,ctx,time,design,entry){
    const pulse=shakeEnvelope(time,design),entryActive=entry!=='none'&&entry!=='wash'&&design.glitchStrength>0;
    const alpha=Math.max(0,Math.min(1,design.chromaticStrength))*(entryActive?1:pulse);
    const lift=pulse*Math.max(0,design.shakeAmplitude);
    if(!alpha&&!lift)return;
    const [source,first,second,mixed]=this.buffers,w=this.width,h=this.height;
    const copy=source.getContext('2d');copy.clearRect(0,0,w,h);copy.drawImage(canvas,0,0);
    if(alpha&&design.chromaticOffset){
      const tint=(target,color)=>{
        const c=target.getContext('2d');c.globalCompositeOperation='copy';c.drawImage(source,0,0);
        c.globalCompositeOperation='multiply';c.fillStyle=color;c.fillRect(0,0,w,h);c.globalCompositeOperation='source-over';
      };
      // Complementary channel groups preserve neutral brightness where they overlap.
      tint(first,entryActive?'#ff00ff':'#ff0000');tint(second,entryActive?'#00ff00':'#00ffff');
      const offset=design.chromaticOffset,mix=mixed.getContext('2d');
      mix.globalCompositeOperation='source-over';mix.fillStyle='#000';mix.fillRect(0,0,w,h);
      mix.globalCompositeOperation='lighter';mix.drawImage(first,0,-offset);mix.drawImage(second,0,offset);mix.globalCompositeOperation='source-over';
      ctx.save();
      if(entryActive){
        ctx.beginPath();const seed=Math.floor(time*30),band=Math.max(1,design.chromaticBandHeight);
        for(let i=0;i<12;i++){const n=Math.sin(seed*61+i*127.1)*43758.5453;ctx.rect(0,(n-Math.floor(n))*h,w,band);}
        ctx.clip();
      }
      ctx.globalAlpha=alpha;ctx.drawImage(mixed,0,0);ctx.restore();
    }
    if(lift){
      copy.clearRect(0,0,w,h);copy.drawImage(canvas,0,0);
      ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.drawImage(source,0,-lift);ctx.restore();
    }
  }
}
