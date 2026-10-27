import {APP_CONFIG,MOTION} from './config.js';
import {DEFAULT_DESIGN,validateDesign} from './design.js';
import {ScreenCurve} from './screen-curve.js';
import {createCanvasColorStyle} from './themes.js';
import {SignalDistortion} from './signal-distortion.js';
export const WIDTH=1920, HEIGHT=1080;
export const VIEWPORTS=Object.freeze({
  '16:9':Object.freeze({width:1920,height:1080}),
  '4:3':Object.freeze({width:1440,height:1080}),
  '1:1':Object.freeze({width:1080,height:1080}),
  '9:16':Object.freeze({width:1080,height:1920})
});
export const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export const numberSettleEnd=(count,design=DEFAULT_DESIGN)=>MOTION.numberSettle+(count-1)*design.settleStagger;
export function getPhase(t,design=DEFAULT_DESIGN,digits=2){return t<design.introDuration?'选项入场':t<MOTION.selectStart?(selectedOptionOpacity(t,design)<1?'选项按下 · 消失再显示':'难度选择'):t<MOTION.expandStart?'选项居中':entryState(t).flash?'展开 · 撕裂反色':t<MOTION.expandStart+design.expandDuration?'展开 · 数字滚入':t<numberSettleEnd(digits,design)?'缓动就位':t<MOTION.rollStart?'稳定显示':t<MOTION.sideStart?'逐渐加速':t<MOTION.sideStart+design.pushDuration?'高位渐入 · 右推':t<MOTION.exitStart?'高速滚动':'故障消隐';}
export const easeInOutQuad=t=>{t=clamp(t,0,1);return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;};
export function expansionEase(t,design=DEFAULT_DESIGN){
  t=clamp(t,0,1);
  if(t===0||t===1)return t;
  if(design.easingCurve==='quadratic')return easeInOutQuad(t);
  if(design.easingCurve==='sigmoid'){
    const logistic=x=>1/(1+Math.exp(-design.sigmoidSteepness*(x-.5)));
    const low=logistic(0),high=logistic(1);
    return (logistic(t)-low)/(high-low);
  }
  return t<.5?Math.pow(2*t,design.easingPower)/2:1-Math.pow(2*(1-t),design.easingPower)/2;
}
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const modulo=(n,m)=>((n%m)+m)%m;
const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export function preRollNoise(time){
  const burst=MOTION.noiseBursts.find(([start,end])=>time>=start&&time<end);
  return burst?.[2]??0;
}
export function reelPosition(t){
  const u=Math.max(0,t-MOTION.rollStart);
  return .52*u*u+.06*u*u*u+.035*Math.pow(Math.max(0,u-2),4);
}
export function reelSpeed(t){
  const u=Math.max(0,t-MOTION.rollStart);
  return 1.04*u+.18*u*u+.14*Math.pow(Math.max(0,u-2),3);
}
export function placeSpeedMultiplier(time,place,design=DEFAULT_DESIGN){
  const end=MOTION.rollStart+design.speedConverge,start=Math.min(end-.25,MOTION.rollStart+1.6+place*design.placeStagger);
  const p=smooth((time-start)/(end-start));
  return Math.pow(design.placeRatio,place)+(1-Math.pow(design.placeRatio,place))*p;
}
export function placeReelPosition(time,place,design=DEFAULT_DESIGN){
  if(place===0)return reelPosition(time)*design.rollSpeed;
  const end=Math.max(MOTION.rollStart,time),rampEnd=MOTION.rollStart+design.speedConverge,rampStart=Math.min(rampEnd-.25,MOTION.rollStart+1.6+place*design.placeStagger);
  // Four-point Gaussian integration is exact for each polynomial interval.
  const bounds=[MOTION.rollStart,...[MOTION.rollStart+2,rampStart,rampEnd].filter(x=>x>MOTION.rollStart&&x<end),end].sort((a,b)=>a-b);
  const nodes=[-.8611363115940526,-.3399810435848563,.3399810435848563,.8611363115940526],weights=[.3478548451374538,.6521451548625461,.6521451548625461,.3478548451374538];
  let position=0;
  for(let i=1;i<bounds.length;i++){
    const half=(bounds[i]-bounds[i-1])/2,mid=(bounds[i]+bounds[i-1])/2;
    for(let j=0;j<4;j++){const t=mid+half*nodes[j];position+=half*weights[j]*reelSpeed(t)*placeSpeedMultiplier(t,place,design);}
  }
  return position*design.rollSpeed;
}
export function optionEntrance(time,design=DEFAULT_DESIGN){
  const p=1-Math.pow(1-clamp(time/design.introDuration,0,1),2);
  return {spread:1+(design.introSpread-1)*(1-p),scale:1+(design.introSize-1)*(1-p),blur:design.introBlur*(1-p),alpha:.78+.22*p};
}
export function selectedOptionOpacity(time,design=DEFAULT_DESIGN){
  // ref2: dim at frames 61–64, remain hidden through 70, return by 73.
  const start=design.pressStart,end=Math.min(MOTION.selectStart,start+design.pressDuration);
  if(time<=start||time>=end)return 1;
  const fade=Math.min(design.pressFade,(end-start)/2);
  const visible=clamp(Math.max(1-(time-start)/fade,1-(end-time)/fade),0,1);
  return design.pressOpacity+(1-design.pressOpacity)*visible;
}
export function optionPositions(time,count,selectedIndex,design=DEFAULT_DESIGN){
  const intro=optionEntrance(time,design);
  const spacing=Math.min(design.optionGap,540/Math.max(1,count-1));
  return Array.from({length:count},(_,index)=>{
    const selected=index===selectedIndex,delay=selected?.22:Math.min(.22,.11*(count-1-Math.abs(index-selectedIndex)));
    const p=easeInOutQuad((time-MOTION.selectStart-delay)/(design.selectDuration-delay));
    const start=360+(index-(count-1)/2)*spacing*intro.spread;
    return {x:selected?start+(360-start)*p:start+(index<selectedIndex?-1:1)*820*p,y:270,selected,exitProgress:selected?0:p,exitExpand:selected?0:easeInOutQuad((time-MOTION.selectStart-delay)/design.exitExpandDuration)};
  });
}
export const expansionProgress=(time,design=DEFAULT_DESIGN)=>expansionEase((time-MOTION.expandStart)/design.expandDuration,design);
export function entryGlitch(time){
  const window=MOTION.flashes.find(([a,b])=>time>=a&&time<b);
  if(!window)return 'none';
  const frame=Math.floor((time-window[0])*30+1e-8);
  const phases=window===MOTION.flashes[0]?['wash','invert','wash','tear','tear','tear','tear','tear']:['tear','tear','tear','invert','invert','invert','invert','invert','wash'];
  return phases[Math.min(frame,phases.length-1)];
}
export function entryState(time){
  return {visible:time>=MOTION.numberAppear,flash:entryGlitch(time)!=='none'};
}
export function labelPositions(time,design=DEFAULT_DESIGN){
  const p=easeInOutQuad((time-MOTION.rollStart)/design.labelExitDuration);
  return {left:design.labelLeft-design.labelExitLeft*p,right:design.labelRight+design.labelExitRight*p};
}
export const reelPitch=(scaleY,design=DEFAULT_DESIGN)=>Math.max(design.rowPitch,270+(design.numberSize*.72+Math.max(8,design.numberGlowRadius*6))/2*scaleY+4);
function rawEntryPosition(column,time,design){
  const remaining=14/reelPitch(column.scaleY,design);
  let entrance;
  if(time<MOTION.flashEnd){
    const p=clamp((time-MOTION.flashes[0][0])/(MOTION.flashEnd-MOTION.flashes[0][0]),0,1);
    entrance=-remaining-(column.entryDistance-remaining)*Math.pow(1-p,column.entryPower);
  }else{
    const p=clamp((time-MOTION.flashEnd)/(MOTION.numberSettle-MOTION.flashEnd),0,1);
    entrance=-remaining*Math.pow(1-p,3);
  }
  return entrance;
}
function smoothEarlier(a,b,width){
  const k=Math.min(width,Math.max(Math.abs(a),Math.abs(b)));
  if(k===0)return 0;
  const h=Math.max(k-Math.abs(a-b),0)/k;
  return Math.min(a,b)-h*h*k/4;
}
function orderedEntryPosition(column,time,design){
  if(time>=MOTION.numberSettle+column.entryIndex*design.settleStagger-1e-12)return 0;
  let entrance=rawEntryPosition(column,time,design);
  if(column.primary&&column.entryIndex>0){
    const width=(14/reelPitch(column.scaleY,design))*design.settleWindow/(MOTION.numberSettle-MOTION.flashEnd);
    // Keep the original roll-in until the columns draw level. At that point
    // the right column follows a slightly delayed left trajectory and cannot pass it.
    const index=column.entryIndex-1;
    const earlier={...column,entryIndex:index,entryPower:2+index/(column.entryCount-1),entryDistance:.44+.56*index/(column.entryCount-1)};
    const previous=orderedEntryPosition(earlier,time-design.settleStagger,design);
    entrance=smoothEarlier(entrance,previous,width);
  }
  return entrance;
}
export function columnPosition(column,time,design=DEFAULT_DESIGN){
  return orderedEntryPosition(column,time,design)+placeReelPosition(time,column.place,design);
}
export function numberColumns(value,time,design=DEFAULT_DESIGN){
  const count=value.length,total=Math.max(count,design.finalColumns),progress=easeInOutQuad((time-MOTION.sideStart)/design.pushDuration);
  const leftExtra=total-count,initialScale=Math.min(1,2/count),finalScale=count===1?design.finalWidth/design.singleScale:design.finalWidth;
  const columns=[];
  for(let slot=0;slot<total;slot++){
    const source=slot-leftExtra,primary=source>=0&&source<count;
    const sourceIndex=clamp(source,0,count-1),place=total-1-slot;
    const delay=Math.min(design.pushDuration-.1,Math.max(0,leftExtra-1-slot)*design.revealStagger);
    const opacity=primary?1:smooth((time-MOTION.sideStart-delay)/(design.pushDuration-delay));
    if(!primary&&opacity<=0)continue;
    const gap=design.finalColumnGap,initialX=(sourceIndex-(count-1)/2)*design.numberGap*initialScale,finalX=(slot-(total-1)/2)*gap;
    const x=primary?initialX+(finalX-initialX)*progress:finalX-gap*(1-progress);
    columns.push({initialDigit:primary?Number(value[sourceIndex]):0,place,rate:Math.pow(design.placeRatio,place),entryPower:count===1?3:2+sourceIndex/(count-1),entryDistance:count===1?1:.44+.56*sourceIndex/(count-1),entryIndex:sourceIndex,entryCount:count,settleAhead:primary?-sourceIndex*design.settleStagger:0,x,opacity,scaleX:initialScale+(finalScale-initialScale)*progress,scaleY:count===1?design.singleScale:1,primary});
  }
  return columns;
}
export function layoutPanels(options,view,selectedId,{width=WIDTH,height=HEIGHT,columns,spacing=0,page=0,pageSize}={}){
  const active=view==='single'?[options.find(x=>x.id===selectedId)??options[0]]:options;
  const requestedColumns=Number.isInteger(columns)?clamp(columns,1,4):undefined;
  const cols=requestedColumns??(active.length===1?1:active.length<=4?2:active.length<=6?3:4);
  const effectivePageSize=pageSize??Math.max(cols,cols*4),first=Math.max(0,page)*effectivePageSize;
  const visible=active.length>effectivePageSize?active.slice(first,first+effectivePageSize):active;
  const rows=Math.max(1,Math.ceil(visible.length/cols));
  const safeWidth=Math.min(1440,width),safeLeft=(width-safeWidth)/2;
  const availableWidth=Math.max(1,safeWidth-Math.max(0,cols-1)*spacing),availableHeight=Math.max(1,height-Math.max(0,rows-1)*spacing);
  const scale=Math.min(availableWidth/(cols*720),availableHeight/(rows*540));
  const blockHeight=rows*540*scale+(rows-1)*spacing,top=(height-blockHeight)/2;
  return visible.map((option,index)=>{
    const row=Math.floor(index/cols),itemsInRow=Math.min(cols,visible.length-row*cols);
    const rowWidth=itemsInRow*720*scale+(itemsInRow-1)*spacing;
    return {option,index:first+index,scale,x:safeLeft+(safeWidth-rowWidth)/2+(index%cols)*(720*scale+spacing),y:top+row*(540*scale+spacing)};
  });
}
export const panelSelectionOptions=(options,_option)=>options;
function makeCanvas(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;}

export function createViewportMapping(pixelWidth,pixelHeight,{aspect='16:9',framing='reflow'}={}){
  if(!Object.hasOwn(VIEWPORTS,aspect))throw new Error('画面比例无效。');
  if(!['crop','fit','reflow'].includes(framing))throw new Error('画幅适配方式无效。');
  const logical=framing==='reflow'?VIEWPORTS[aspect]:VIEWPORTS['16:9'];
  const scale=(framing==='crop'?Math.max:Math.min)(pixelWidth/logical.width,pixelHeight/logical.height);
  return Object.freeze({pixelWidth,pixelHeight,logicalWidth:logical.width,logicalHeight:logical.height,scale,offsetX:(pixelWidth-logical.width*scale)/2,offsetY:(pixelHeight-logical.height*scale)/2,aspect,framing});
}

export class SignalRenderer {
  constructor(canvas,{aspect='16:9',framing='reflow'}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    if(!this.ctx)throw new Error('当前浏览器无法创建 2D 画布。');
    this.mapping=createViewportMapping(canvas.width,canvas.height,{aspect,framing});
    this.logicalWidth=this.mapping.logicalWidth;this.logicalHeight=this.mapping.logicalHeight;this.pixelScale=this.mapping.scale;
    this.screenCurve=new ScreenCurve();this.curvatureSupported=true;
    this.frame=makeCanvas(canvas.width,canvas.height);this.work=this.frame.getContext('2d',{alpha:false});
    this.glyphs=new Map();this.labels=new Map();this.supportsFilter='filter' in this.work;
    this.compressed=makeCanvas(canvas.width,Math.max(1,Math.round(54*this.pixelScale)));this.softened=makeCanvas(canvas.width,this.compressed.height);
    this.design={...DEFAULT_DESIGN};this.sceneStyle={};this.sceneStyleSignature='';this.setDesign({});
  }
  mapContext(ctx){const m=this.mapping;ctx.setTransform(m.scale,0,0,m.scale,m.offsetX,m.offsetY);return ctx;}
  pixelContext(ctx){ctx.setTransform(1,0,0,1,0,0);return ctx;}
  logicalRectToPixels(x,y,width,height){const m=this.mapping;return{x:m.offsetX+x*m.scale,y:m.offsetY+y*m.scale,width:width*m.scale,height:height*m.scale};}
  paint(ctx,value,fallback,bounds={x:0,y:0,width:this.canvas.width,height:this.canvas.height}){
    try{return createCanvasColorStyle(ctx,value??fallback,bounds);}catch{return fallback;}
  }
  setSceneStyle(style={}){
    const normalized={theme:style.theme??{},fonts:style.fonts??{}};
    const signature=JSON.stringify(normalized);
    if(signature===this.sceneStyleSignature)return false;
    this.sceneStyle=normalized;this.sceneStyleSignature=signature;this.glyphs.clear();this.labels.clear();return true;
  }
  setDesign(patch){
    this.design=validateDesign(patch,this.design);this.glyphs.clear();this.labels.clear();
    const design=this.design,grey=value=>`rgb(${Math.round(value*255)},${Math.round(value*255)},${Math.round(value*255)})`;
    if(this.vignette){this.vignette.width=1;this.vignette.height=1;}
    if(this.scanlines){this.scanlines.width=1;this.scanlines.height=1;}
    // One fixed light field across the whole canvas. Multiplication preserves black.
    this.vignette=makeCanvas(this.canvas.width,this.canvas.height);
    const light=this.mapContext(this.vignette.getContext('2d'));
    light.translate(this.logicalWidth/2,this.logicalHeight/2);light.scale(this.logicalWidth/2,this.logicalHeight/2);
    const falloff=light.createRadialGradient(0,0,0,0,0,Math.SQRT2);
    falloff.addColorStop(0,grey(design.centerBrightness));
    falloff.addColorStop(design.vignetteKnee,grey(design.centerBrightness*.75+design.edgeBrightness*.25));falloff.addColorStop(1,grey(design.edgeBrightness));
    light.fillStyle=falloff;light.fillRect(-1,-1,2,2);
    // Applied after smearing and inversion, so bright glyphs and halos retain it.
    // Black ink attenuates in proportion to the pixel's brightness; black stays black.
    this.scanlines=makeCanvas(this.canvas.width,this.canvas.height);
    const scan=this.mapContext(this.scanlines.getContext('2d'));scan.fillStyle=this.paint(scan,this.sceneStyle.theme?.scanlineColor,`rgba(0,0,0,${design.scanLineStrength})`,{x:0,y:0,width:this.logicalWidth,height:this.logicalHeight});
    for(let y=0;y<this.logicalHeight;y+=design.scanLineSpacing)scan.fillRect(0,y,this.logicalWidth,Math.min(design.scanLineWidth,design.scanLineSpacing-1));
    if(this.noiseTexture){this.noiseTexture.width=1;this.noiseTexture.height=1;}
    this.noiseTexture=null;this.noiseSeed=-1;
    this.signalDistortion??=new SignalDistortion(this.canvas.width,this.canvas.height);
  }
  glyph(digit){
    if(this.glyphs.has(digit))return this.glyphs.get(digit);
    const design=this.design,probe=this.work,family=this.sceneStyle.fonts?.numberFamily??'Saira';probe.font=`${design.numberWeight} ${design.numberSize}px ${JSON.stringify(family)}, Saira`;
    const size=probe.measureText(String(digit)),pad=Math.ceil(Math.max(4,design.numberGlowRadius*3));
    const width=Math.ceil(size.width*design.numberWidth+pad*2),height=Math.ceil(size.actualBoundingBoxAscent+size.actualBoundingBoxDescent+pad*2);
    const glyph=makeCanvas(Math.ceil(width*this.pixelScale),Math.ceil(height*this.pixelScale)),ctx=glyph.getContext('2d');
    const mask=makeCanvas(glyph.width,glyph.height),m=mask.getContext('2d');
    glyph.logicalWidth=mask.logicalWidth=width;glyph.logicalHeight=mask.logicalHeight=height;
    ctx.setTransform(this.pixelScale,0,0,this.pixelScale,0,0);m.setTransform(this.pixelScale,0,0,this.pixelScale,0,0);
    m.font=`${design.numberWeight} ${design.numberSize}px ${JSON.stringify(family)}, Saira`;if('letterSpacing'in m)m.letterSpacing=`${this.sceneStyle.fonts?.numberLetterSpacing??0}px`;m.textAlign='center';m.textBaseline='alphabetic';
    const bounds=m.measureText(String(digit));
    const baseline=height/2+(bounds.actualBoundingBoxAscent-bounds.actualBoundingBoxDescent)/2;
    m.translate(width/2,0);m.scale(design.numberWidth,1);m.fillStyle='#fff';
    const numberStroke=Number(this.sceneStyle.fonts?.numberStroke)||0;if(numberStroke>0){m.strokeStyle='#fff';m.lineWidth=numberStroke*2;m.lineJoin='round';m.strokeText(String(digit),0,baseline);}m.fillText(String(digit),0,baseline);
    const glowMask=makeCanvas(mask.width,mask.height),glowContext=glowMask.getContext('2d');glowContext.drawImage(mask,0,0);glowContext.globalCompositeOperation='source-in';
    glowContext.fillStyle=this.paint(glowContext,this.sceneStyle.theme?.glowColor,'#ffffff',{x:0,y:0,width:glowMask.width,height:glowMask.height});glowContext.fillRect(0,0,glowMask.width,glowMask.height);
    const numberShadow=Number(this.sceneStyle.fonts?.numberShadow)||0,glowRadius=design.numberGlowRadius+numberShadow;
    if(this.supportsFilter){
      ctx.filter=`blur(${glowRadius*this.pixelScale}px)`;ctx.globalAlpha=Math.min(1,.4*design.numberGlowStrength);ctx.drawImage(glowMask,0,0,width,height);
      ctx.filter=`blur(${glowRadius*.41*this.pixelScale}px)`;ctx.globalAlpha=Math.min(1,.6*design.numberGlowStrength);ctx.drawImage(glowMask,0,0,width,height);
      ctx.filter='none';ctx.globalAlpha=1;
    }else{const glowColor=this.sceneStyle.theme?.glowColor;ctx.shadowColor=typeof glowColor==='string'&&!/^linear-gradient/i.test(glowColor)?glowColor:`rgba(255,255,255,${Math.min(1,design.numberGlowStrength)})`;ctx.shadowBlur=glowRadius;ctx.drawImage(mask,0,0,width,height);ctx.shadowBlur=0;}
    m.resetTransform();m.globalCompositeOperation='source-in';
    m.fillStyle=this.paint(m,this.sceneStyle.theme?.numberColor,`rgb(${design.numberBrightness},${design.numberBrightness},${design.numberBrightness})`,{x:0,y:0,width:glyph.width,height:glyph.height});m.fillRect(0,0,glyph.width,glyph.height);m.globalCompositeOperation='source-atop';m.fillStyle=`rgba(255,255,255,${design.scanStrength})`;
    m.setTransform(this.pixelScale,0,0,this.pixelScale,0,0);for(let y=pad;y<height-pad;y+=design.scanSpacing)m.fillRect(0,y,width,noise(y)>.5?1:.5);
    ctx.drawImage(mask,0,0,width,height);this.glyphs.set(digit,glyph);return glyph;
  }
  label(text){
    if(this.labels.has(text))return this.labels.get(text);
    if(this.labels.size>80)this.labels.clear();
    const design=this.design,family=this.sceneStyle.fonts?.textFamily??'Saira',font=`${design.labelWeight} ${design.labelSize}px ${JSON.stringify(family)}, Saira, "Microsoft YaHei", sans-serif`;this.work.font=font;
    const pad=Math.max(4,design.labelGlowRadius*3),width=Math.ceil(this.work.measureText(text).width+pad*2),height=Math.ceil(design.labelSize*1.5+pad*2);
    const canvas=makeCanvas(Math.ceil(width*this.pixelScale),Math.ceil(height*this.pixelScale)),ctx=canvas.getContext('2d');canvas.logicalWidth=width;canvas.logicalHeight=height;
    const textStroke=Number(this.sceneStyle.fonts?.textStroke)||0,configure=context=>{context.setTransform(this.pixelScale,0,0,this.pixelScale,0,0);context.font=font;if('letterSpacing'in context)context.letterSpacing=`${this.sceneStyle.fonts?.textLetterSpacing??0}px`;context.textBaseline='middle';context.textAlign='center';context.lineJoin='round';};
    const glowRadius=design.labelGlowRadius+(Number(this.sceneStyle.fonts?.textShadow)||0),glowValue=this.sceneStyle.theme?.glowColor??'#ffffff';
    if(this.supportsFilter&&glowRadius>0&&design.labelGlowStrength>0){
      const mask=makeCanvas(canvas.width,canvas.height),maskContext=mask.getContext('2d');configure(maskContext);maskContext.fillStyle='#fff';
      if(textStroke>0){maskContext.strokeStyle='#fff';maskContext.lineWidth=textStroke*2;maskContext.strokeText(text,width/2,height/2);}maskContext.fillText(text,width/2,height/2);
      const coloured=makeCanvas(canvas.width,canvas.height),colourContext=coloured.getContext('2d');colourContext.drawImage(mask,0,0);colourContext.globalCompositeOperation='source-in';
      colourContext.fillStyle=this.paint(colourContext,glowValue,'#ffffff',{x:0,y:0,width:canvas.width,height:canvas.height});colourContext.fillRect(0,0,canvas.width,canvas.height);
      ctx.save();ctx.filter=`blur(${glowRadius*this.pixelScale}px)`;ctx.globalAlpha=Math.min(1,.7*design.labelGlowStrength);ctx.drawImage(coloured,0,0);if(design.labelGlowStrength>1.4)ctx.drawImage(coloured,0,0);ctx.restore();
      mask.width=1;mask.height=1;coloured.width=1;coloured.height=1;
    }
    configure(ctx);ctx.fillStyle=this.paint(ctx,this.sceneStyle.theme?.textColor,`rgb(${design.labelBrightness},${design.labelBrightness},${design.labelBrightness})`,{x:0,y:0,width,height});
    if(!this.supportsFilter){ctx.shadowColor=typeof glowValue==='string'&&!/^linear-gradient/i.test(glowValue)?glowValue:'#ffffff';ctx.shadowBlur=glowRadius;}
    if(textStroke>0){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=textStroke*2;ctx.strokeText(text,width/2,height/2);}ctx.fillText(text,width/2,height/2);
    if(design.labelGlowStrength>1)ctx.fillText(text,width/2,height/2);
    this.labels.set(text,canvas);return canvas;
  }
  drawLabel(ctx,text,x,y,maxWidth=150,alpha=1){
    ctx.save();ctx.globalAlpha*=alpha;
    const cache=this.label(text),measure=ctx.measureText(text).width,ratio=Math.min(1,maxWidth/Math.max(1,measure));
    const width=cache.logicalWidth??cache.width,height=cache.logicalHeight??cache.height;
    ctx.drawImage(cache,x-width/2*ratio,y-height/2,width*ratio,height);ctx.restore();
  }
  drawExpandedLabel(ctx,text,tracking,alpha){
    if(tracking<=0){this.drawLabel(ctx,text,0,0,Infinity,alpha);return;}
    const chars=Array.from(text),width=ctx.measureText(text).width;
    let prefix='';
    for(let i=0;i<chars.length;i++){
      const next=prefix+chars[i],before=ctx.measureText(prefix).width,after=ctx.measureText(next).width;
      this.drawLabel(ctx,chars[i],(before+after-width)/2+(i-(chars.length-1)/2)*tracking,0,Infinity,alpha);prefix=next;
    }
  }
  panel(ctx,option,allOptions,time){
    const design=this.design,family=this.sceneStyle.fonts?.textFamily??'Saira';
    ctx.font=`${design.labelWeight} ${design.labelSize}px ${JSON.stringify(family)}, Saira, "Microsoft YaHei", sans-serif`;
    if(time<MOTION.expandStart){
      const entrance=optionEntrance(time,design),selectedIndex=allOptions.findIndex(o=>o.id===option.id),positions=optionPositions(time,allOptions.length,selectedIndex,design);
      const compactLabelWidth=Math.min(94,540/allOptions.length),selectedLabelWidth=allOptions.length<=4?160:compactLabelWidth;
      allOptions.forEach((other,index)=>{
        const {x,y,selected,exitProgress,exitExpand}=positions[index];
        ctx.save();ctx.translate(x,y);ctx.scale(entrance.scale,entrance.scale);
        if(this.supportsFilter&&entrance.blur>.05)ctx.filter=`blur(${entrance.blur}px)`;
        const text='<'+other.label+'>',alpha=entrance.alpha*Math.pow(1-exitProgress,.35)*(selected?selectedOptionOpacity(time,design):1);
        if(!selected&&exitExpand>0){
          const fit=Math.min(1,compactLabelWidth/Math.max(1,ctx.measureText(text).width));ctx.scale(fit,1);
          this.drawExpandedLabel(ctx,text,design.exitLetterSpread*exitExpand,alpha);
        }else this.drawLabel(ctx,text,0,0,selected?selectedLabelWidth:compactLabelWidth,alpha);
        ctx.restore();
      });return;
    }
    const fullWidth=ctx.measureText('<'+option.label+'>').width,leftWidth=ctx.measureText('<'+option.label).width,rightWidth=ctx.measureText('>').width;
    const initialLeft=360-fullWidth/2+leftWidth/2,initialRight=360+fullWidth/2-rightWidth/2;
    const expand=expansionProgress(time,design),drift=labelPositions(time,design);
    const left=time>MOTION.rollStart?drift.left:initialLeft+(design.labelLeft-initialLeft)*expand,right=time>MOTION.rollStart?drift.right:initialRight+(design.labelRight-initialRight)*expand;
    const labelWidth=Math.min(design.labelMaxWidth,Math.max(50,ctx.measureText('<'+option.label).width+4));
    this.drawLabel(ctx,'<'+option.label,left,270,labelWidth);this.drawLabel(ctx,'>',right,270,40);
    const entry=entryState(time);if(!entry.visible)return;
    const speed=reelSpeed(time)*design.rollSpeed;
    const moving=time>MOTION.rollStart,samples=moving?Math.min(14,Math.max(4,Math.ceil(speed*.32))):1;
    const shutter=Math.min(.09,.018+speed*.003),columns=numberColumns(option.value,time,design);
    ctx.save();ctx.translate(360,270);
    ctx.globalCompositeOperation=moving?'lighter':'source-over';
    const sampleAlpha=(1+smooth((time-MOTION.exposureStart)/4)*.65)/samples;
    for(let sample=0;sample<samples;sample++){
      const sampled=Math.max(0,time-shutter*sample/Math.max(1,samples-1));
      for(const column of columns){
        const position=columnPosition(column,sampled,design),whole=Math.floor(position),fraction=position-whole;
        const {x,scaleX,scaleY,opacity}=column,pitch=reelPitch(scaleY,design);
        ctx.globalAlpha=sampleAlpha*opacity;
        for(let k=-2;k<=2;k++){
          const y=(k-fraction)*pitch;
          const digit=modulo(column.initialDigit+whole+k,10);
          const glyph=this.glyph(digit),w=(glyph.logicalWidth??glyph.width)*scaleX*scaleY,h=(glyph.logicalHeight??glyph.height)*scaleY;
          if(Math.abs(y)>270+h/2)continue;
          ctx.drawImage(glyph,x-w/2,y-h/2,w,h);
        }
      }
    }ctx.restore();
  }
  glitchIntensity(time){
    if(time>=MOTION.exitStart&&time<MOTION.exitEnd)return .5+.5*noise(Math.floor(time*30));
    if(entryState(time).flash)return .8;
    for(const [start,end,strength]of MOTION.glitchBursts)if(time>=start&&time<end)return strength;return 0;
  }
  drawPreRollNoise(output,time){
    const amount=preRollNoise(time)*this.design.noiseStrength;
    if(!amount)return;
    const seed=Math.floor(time*30),design=this.design;
    if(seed!==this.noiseSeed){
      if(!this.noiseTexture)this.noiseTexture=makeCanvas(this.canvas.width,this.canvas.height);
      const texture=this.mapContext(this.noiseTexture.getContext('2d'));texture.fillStyle='#fff';texture.fillRect(0,0,this.logicalWidth,this.logicalHeight);
      const contentWidth=Math.min(1440,this.logicalWidth),contentLeft=(this.logicalWidth-contentWidth)/2;
      for(let i=0;i<design.noiseDensity;i++){
        const key=seed*1777+i*13,x=contentLeft+noise(key)*contentWidth,y=noise(key+1)*this.logicalHeight;
        const w=design.noiseBlockSize*(.4+noise(key+2)*3),h=design.noiseBlockSize*(.25+noise(key+3)*1.5);
        texture.fillStyle=`rgba(0,0,0,${.15+noise(key+4)*.6})`;texture.fillRect(x,y,w,h);
        texture.fillStyle='rgba(0,0,0,.45)';
        for(let line=0;line<h;line+=3)texture.fillRect(x,y+line,w*noise(key+line+5),1);
      }
      for(let i=0;i<14;i++){
        const key=seed*97+i*7;texture.fillStyle=`rgba(0,0,0,${design.noiseBandStrength*(.3+noise(key))})`;
        texture.fillRect(contentLeft+noise(key+1)*contentWidth*.5,noise(key+2)*this.logicalHeight,Math.min(contentWidth,120+noise(key+3)*600),2+noise(key+4)*18);
      }
      this.noiseSeed=seed;
    }
    this.pixelContext(output);output.globalCompositeOperation='multiply';output.globalAlpha=amount;output.drawImage(this.noiseTexture,0,0);
    output.globalCompositeOperation='source-over';output.globalAlpha=1;
  }
  render(time,options,view='grid',selectedId=options[0].id,scene={}){
    if(this.setSceneStyle(scene))this.setDesign({});
    const design=this.design,ctx=this.work,output=this.ctx,t=clamp(scene.signalTime??time,0,APP_CONFIG.duration);
    const effect=scene.beatEffect??{},shake=Number(effect.shake)||0,jump=Number(effect.numberJump)||0;
    const shakeX=shake?Math.sin(time*91.73)*shake*18:0,shakeY=shake?Math.sin(time*67.19+1.7)*shake*12:0;
    const panels=scene.panels??layoutPanels(options,view,selectedId,{width:this.logicalWidth,height:this.logicalHeight,...scene.layout});
    this.pixelContext(ctx);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=this.paint(ctx,scene.theme?.backgroundColor,'#000');ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    this.mapContext(ctx);ctx.translate(shakeX,shakeY);
    if(t<MOTION.blankAt)panels.forEach(({option,x,y,scale,opacity=1,rotation=0})=>{
      const transform=scene.optionTransforms?.[option.id]??{};
      ctx.save();ctx.globalAlpha*=clamp((transform.opacity??1)*opacity,0,1);ctx.translate(x+(transform.x??0),y+(transform.y??0)-jump*28);ctx.rotate((rotation+(transform.rotation??0))*Math.PI/180);ctx.scale(scale*(transform.scale??1),scale*(transform.scale??1));ctx.beginPath();ctx.rect(0,0,720,540);ctx.clip();
      this.panel(ctx,option,panelSelectionOptions(options,option),t);ctx.restore();
    });
    this.pixelContext(output);output.globalCompositeOperation='source-over';output.globalAlpha=1;
    if(t>MOTION.rollStart+.3&&t<MOTION.fadeStart&&this.supportsFilter){
      // Work at the requested pixel dimensions so 2K/4K is rasterized natively.
      const speed=reelSpeed(t)*design.rollSpeed;
      const h=Math.max(Math.round(14*this.pixelScale),Math.round(this.canvas.height/Math.max(1,speed*1.1*design.motionBlur)));
      if(this.compressed.height!==h){this.compressed.height=h;this.softened.height=h;}
      const small=this.compressed.getContext('2d'),soft=this.softened.getContext('2d');
      small.clearRect(0,0,this.canvas.width,h);small.drawImage(this.frame,0,0,this.canvas.width,h);
      soft.clearRect(0,0,this.canvas.width,h);soft.filter=`blur(${Math.max(1,1.7*this.pixelScale)}px)`;soft.drawImage(this.compressed,0,0);soft.filter='none';
      output.fillStyle=this.paint(output,scene.theme?.backgroundColor,'#000');output.fillRect(0,0,this.canvas.width,this.canvas.height);output.drawImage(this.softened,0,0,this.canvas.width,this.canvas.height);
      this.mapContext(output);output.translate(shakeX,shakeY);
      const family=this.sceneStyle.fonts?.textFamily??'Saira';
      panels.forEach(({option,x,y,scale,opacity=1,rotation=0})=>{
        const transform=scene.optionTransforms?.[option.id]??{};
        output.save();output.globalAlpha*=clamp((transform.opacity??1)*opacity,0,1);output.translate(x+(transform.x??0),y+(transform.y??0)-jump*28);output.rotate((rotation+(transform.rotation??0))*Math.PI/180);output.scale(scale*(transform.scale??1),scale*(transform.scale??1));output.beginPath();output.rect(0,0,720,540);output.clip();output.font=`${design.labelWeight} ${design.labelSize}px ${JSON.stringify(family)}, Saira, "Microsoft YaHei", sans-serif`;
        const drift=labelPositions(t,design);this.drawLabel(output,'<'+option.label,drift.left,270,design.labelMaxWidth);this.drawLabel(output,'>',drift.right,270,40);output.restore();
      });
      this.pixelContext(output);
    }else output.drawImage(this.frame,0,0);
    output.globalCompositeOperation='multiply';output.drawImage(this.vignette,0,0);output.globalCompositeOperation='source-over';
    const strength=(this.glitchIntensity(t)+(Number(effect.glitch)||0))*design.glitchStrength,seed=Math.floor(t*30),entranceGlitch=entryGlitch(t);
    const content=this.logicalRectToPixels((this.logicalWidth-Math.min(1440,this.logicalWidth))/2,0,Math.min(1440,this.logicalWidth),this.logicalHeight);
    if(entranceGlitch==='wash'&&design.glitchStrength>0){
      output.fillStyle=scene.theme?.washColor??`rgb(${design.washBrightness},${design.washBrightness},${design.washBrightness})`;output.fillRect(0,0,this.canvas.width,this.canvas.height);
    }else if(strength){
      const entryTear=entranceGlitch!=='none',thin=entranceGlitch==='invert',strips=entryTear?(thin?130:42):Math.ceil(18*strength);
      for(let i=0;i<strips;i++){
        const y=Math.floor(content.y+noise(seed*61+i)*content.height),h=Math.max(1,(entryTear?(thin?1+Math.floor(noise(seed+i+10)*2):4+Math.floor(noise(seed+i+10)*28*design.glitchStrength)):Math.max(2,Math.floor(noise(seed*3+i+10)*55*strength)))*this.pixelScale),shift=(noise(seed*17+i+30)-.5)*(thin?18*design.glitchStrength:180*strength)*this.pixelScale;
        output.fillStyle=noise(seed+i)>.62?this.paint(output,scene.theme?.glitchLight,'#adadad',{x:content.x,y,width:content.width,height:h}):(scene.theme?.glitchDark??'#000');output.fillRect(content.x,y,content.width,h);
        output.drawImage(this.frame,content.x,y,content.width,Math.min(h,this.canvas.height-y),content.x+shift,y,content.width,Math.min(h,this.canvas.height-y));
        if(!entryTear&&noise(seed+i*4)>.6){output.globalCompositeOperation='screen';output.globalAlpha=.28*strength;output.fillStyle=i%2?(scene.theme?.glitchA??'#00a9bf'):(scene.theme?.glitchB??'#df4410');output.fillRect(content.x+shift,y+h,content.width,Math.max(1,2*this.pixelScale));output.globalCompositeOperation='source-over';output.globalAlpha=1;}
      }
      if(thin||(t>MOTION.exitStart&&noise(seed+31)>.3)){output.globalCompositeOperation='difference';output.fillStyle=thin?this.paint(output,scene.theme?.flashColor,`rgb(${design.flashBrightness},${design.flashBrightness},${design.flashBrightness})`):'rgba(255,255,255,.8)';output.fillRect(0,0,this.canvas.width,this.canvas.height);output.globalCompositeOperation='source-over';}
    }
    this.drawPreRollNoise(output,t);this.pixelContext(output);
    const rgb=clamp(Number(effect.rgbSplit)||0,0,1);
    if(rgb){output.save();output.globalCompositeOperation='screen';output.globalAlpha=.22*rgb;output.filter='sepia(1) saturate(8) hue-rotate(125deg)';output.drawImage(this.frame,Math.max(1,8*this.pixelScale*rgb),0);output.filter='sepia(1) saturate(8) hue-rotate(300deg)';output.drawImage(this.frame,-Math.max(1,8*this.pixelScale*rgb),0);output.restore();}
    output.drawImage(this.scanlines,0,0);
    if(typeof scene.drawLayers==='function')scene.drawLayers({ctx:output,time,pixelWidth:this.canvas.width,pixelHeight:this.canvas.height,mapping:this.mapping});
    const flash=clamp(Number(effect.flash)||0,0,1);if(flash){output.fillStyle=`rgba(255,255,255,${flash*.42})`;output.fillRect(0,0,this.canvas.width,this.canvas.height);}
    this.signalDistortion.apply(this.canvas,output,t,design,entranceGlitch,this.pixelScale);
    if(t>MOTION.fadeStart){output.fillStyle=`rgba(0,0,0,${smooth((t-MOTION.fadeStart)/.12)})`;output.fillRect(0,0,this.canvas.width,this.canvas.height);}
    this.curvatureSupported=design.screenCurve!=='curved'||this.screenCurve.apply(this.canvas,output,design.screenCurvature);
  }
  dispose(){
    this.screenCurve.dispose();
    this.signalDistortion?.dispose();
    for(const canvas of [this.canvas,this.frame,this.compressed,this.softened,this.vignette,this.scanlines,this.noiseTexture,...this.glyphs.values(),...this.labels.values()]){
      if(canvas){canvas.width=1;canvas.height=1;}
    }
    this.glyphs.clear();this.labels.clear();
  }
}
