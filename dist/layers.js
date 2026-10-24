export const MAX_LAYERS=64;
export const LAYER_TYPES=Object.freeze(['text','image']);
export const LAYER_BLEND_MODES=Object.freeze(['source-over','lighter','screen','multiply','overlay','soft-light','hard-light','difference','exclusion']);
export const LAYER_MASKS=Object.freeze(['none','rect','rounded','circle']);
export const LAYER_ANIMATIONS=Object.freeze(['none','fade','slide-up','slide-down','slide-left','slide-right','scale']);

const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const text=(value,fallback='',limit=2000)=>String(value??fallback).slice(0,limit);
const choice=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const colour=(value,fallback)=>typeof value==='string'&&value.trim()?value.trim().slice(0,256):fallback;

function normalizeAnimation(value={},fallbackType='fade'){
  if(value===false||value==='none')return {type:'none',duration:0,offset:0,distance:0,scale:.8,easing:'easeInOut'};
  if(typeof value==='string')value={type:value};
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  return {
    type:choice(value.type,LAYER_ANIMATIONS,fallbackType),
    duration:clamp(finite(value.duration,.35),0,3600),
    offset:clamp(finite(value.offset,0),0,3600),
    at:value.at!==null&&value.at!==undefined&&Number.isFinite(Number(value.at))?Math.max(0,Number(value.at)):null,
    distance:clamp(finite(value.distance,80),0,10000),
    scale:clamp(finite(value.scale,.8),0,10),
    easing:choice(value.easing,['linear','easeIn','easeOut','easeInOut'],'easeInOut'),
  };
}

function normalizeMask(value={}){
  if(typeof value==='string')value={type:value};
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  return {type:choice(value.type,LAYER_MASKS,'none'),radius:clamp(finite(value.radius,24),0,10000),inset:clamp(finite(value.inset,0),0,10000)};
}

function normalizeGlow(value={}){
  if(value===false)return {enabled:false,color:'#ffffff',blur:0,strength:0};
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  const blur=clamp(finite(value.blur,0),0,1000),strength=clamp(finite(value.strength,blur?1:0),0,10);
  return {enabled:value.enabled??(blur>0&&strength>0),color:colour(value.color,'#ffffff'),blur,strength};
}

function normalizePaint(value,fallback){
  if(typeof value==='string')return colour(value,fallback);
  if(!value||typeof value!=='object'||Array.isArray(value)||value.type!=='linear')return fallback;
  const stops=Array.isArray(value.stops)?value.stops.slice(0,16).map((stop,index)=>({offset:clamp(finite(stop?.offset,index),0,1),color:colour(stop?.color,fallback)})).sort((a,b)=>a.offset-b.offset):[];
  return stops.length?{type:'linear',angle:finite(value.angle,0),stops}:fallback;
}

export function normalizeLayer(input,index=0){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error(`第 ${index+1} 个图层格式无效。`);
  const type=choice(input.type,LAYER_TYPES,null);
  if(!type)throw new Error(`不支持的图层类型：${input.type}`);
  const id=text(input.id,`layer-${index+1}`,128).trim();
  if(!id)throw new Error(`第 ${index+1} 个图层缺少 ID。`);
  const coordinateMode=choice(input.coordinateMode,['absolute','relative'],'absolute'),legacyPosition=input.position&&typeof input.position==='object'?input.position:{};
  const base={
    id,type,name:text(input.name,type==='text'?'文字图层':'图片图层',128),visible:input.visible!==false,
    zIndex:clamp(finite(input.zIndex,index),-10000,10000),coordinateMode,
    x:finite(input.x??legacyPosition.x,coordinateMode==='relative'?.5:960),y:finite(input.y??legacyPosition.y,coordinateMode==='relative'?.5:540),
    width:Math.max(.001,finite(input.width,coordinateMode==='relative'?.35:480)),height:Math.max(.001,finite(input.height,coordinateMode==='relative'?.18:240)),
    rotation:finite(input.rotation,0),scaleX:clamp(finite(input.scaleX,1),-100,100),scaleY:clamp(finite(input.scaleY,1),-100,100),
    opacity:clamp(finite(input.opacity,1),0,1),blendMode:choice(input.blendMode,LAYER_BLEND_MODES,'source-over'),
    mask:normalizeMask(input.mask),glow:normalizeGlow(input.glow),enter:normalizeAnimation(input.enter),exit:normalizeAnimation(input.exit),
  };
  if(type==='text')Object.assign(base,{
    text:text(input.text,'SIGNAL',10000),fontFamily:text(input.fontFamily,'Saira, sans-serif',256),fontSize:clamp(finite(input.fontSize,72),1,2000),fontWeight:text(input.fontWeight,'600',32),letterSpacing:clamp(finite(input.letterSpacing,0),-100,100),lineHeight:clamp(finite(input.lineHeight,1.15),.2,10),maxLines:Math.trunc(clamp(finite(input.maxLines,20),1,1000)),align:choice(input.align,['left','center','right'],'center'),fill:normalizePaint(input.fill,'#ffffff'),stroke:colour(input.stroke,'transparent'),strokeWidth:clamp(finite(input.strokeWidth,0),0,100),shadowColor:colour(input.shadowColor,'transparent'),shadowBlur:clamp(finite(input.shadowBlur,0),0,1000),
  });
  else Object.assign(base,{
    assetId:input.assetId==null?null:text(input.assetId,'',256),
    fileName:text(input.fileName??'', '',180).split(/[\\/]/).at(-1),
    mimeType:text(input.mimeType??'', '',96),
    src:text(input.src,'',8192),fit:choice(input.fit,['contain','cover','fill'],'contain'),smoothing:input.smoothing!==false
  });
  return base;
}

export function normalizeLayers(layers){
  if(layers===undefined||layers===null)return [];
  if(!Array.isArray(layers))throw new Error('图层列表格式无效。');
  if(layers.length>MAX_LAYERS)throw new Error(`最多支持 ${MAX_LAYERS} 个图层。`);
  const normalized=layers.map(normalizeLayer),ids=new Set();
  for(const layer of normalized){if(ids.has(layer.id))throw new Error(`图层 ID 重复：${layer.id}`);ids.add(layer.id);}
  return normalized;
}

export function sortLayers(layers){return normalizeLayers(layers).map((layer,index)=>({layer,index})).sort((a,b)=>a.layer.zIndex-b.layer.zIndex||a.index-b.index).map(entry=>entry.layer);}

function easing(name,value){
  const t=clamp(value,0,1);
  if(name==='linear')return t;
  if(name==='easeIn')return t*t;
  if(name==='easeOut')return 1-(1-t)*(1-t);
  return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
}

function animationTransform(animation,progress,reverse=false){
  let p=easing(animation.easing,progress);if(reverse)p=1-p;
  const hidden=1-p,result={opacity:animation.type==='fade'?p:1,translateX:0,translateY:0,scale:1};
  if(animation.type==='slide-up')result.translateY=animation.distance*hidden;
  if(animation.type==='slide-down')result.translateY=-animation.distance*hidden;
  if(animation.type==='slide-left')result.translateX=animation.distance*hidden;
  if(animation.type==='slide-right')result.translateX=-animation.distance*hidden;
  if(animation.type==='scale'){result.scale=animation.scale+(1-animation.scale)*p;result.opacity=p;}
  if(animation.type==='none')result.opacity=1;
  return result;
}

export function layerEnvelope(layerInput,time,duration=Infinity){
  const layer=layerInput?.type&&layerInput?.enter?layerInput:normalizeLayer(layerInput);
  const now=Math.max(0,finite(time,0));
  const enterStart=layer.enter.at??layer.enter.offset,enterProgress=layer.enter.duration?clamp((now-enterStart)/layer.enter.duration,0,1):1;
  const finiteDuration=Number.isFinite(duration)?Math.max(0,duration):Infinity;
  const exitStart=layer.exit.at??Math.max(0,finiteDuration-layer.exit.offset-layer.exit.duration);
  const exitProgress=finiteDuration===Infinity?0:(layer.exit.duration?clamp((now-exitStart)/layer.exit.duration,0,1):(now>=exitStart?1:0));
  const entrance=animationTransform(layer.enter,enterProgress),exit=animationTransform(layer.exit,exitProgress,true);
  return {opacity:entrance.opacity*exit.opacity,translateX:entrance.translateX+exit.translateX,translateY:entrance.translateY+exit.translateY,scale:entrance.scale*exit.scale,enterProgress,exitProgress};
}

export function resolveLayerAtTime(layerInput,time,duration=Infinity,keyframeEvaluator){
  const base=layerInput?.type&&layerInput?.enter?layerInput:normalizeLayer(layerInput);
  let patch={};
  if(typeof keyframeEvaluator==='function'){
    const evaluated=keyframeEvaluator(base,time);
    if(evaluated&&typeof evaluated==='object'&&!Array.isArray(evaluated))patch=evaluated;
  }
  const layer={...base,...patch};
  for(const key of ['opacity'])layer[key]=clamp(finite(layer[key],base[key]),0,1);
  for(const key of ['x','y','width','height','rotation','scaleX','scaleY'])layer[key]=finite(layer[key],base[key]);
  const envelope=layerEnvelope({...base,...layer},time,duration);
  return {...layer,envelope,opacity:layer.opacity*envelope.opacity,x:layer.x+envelope.translateX,y:layer.y+envelope.translateY,scaleX:layer.scaleX*envelope.scale,scaleY:layer.scaleY*envelope.scale};
}

export function resolveLayerGeometry(layer,viewport={x:0,y:0,width:1920,height:1080}){
  if(layer.coordinateMode!=='relative')return {x:layer.x,y:layer.y,width:layer.width,height:layer.height};
  return {x:viewport.x+layer.x*viewport.width,y:viewport.y+layer.y*viewport.height,width:layer.width*viewport.width,height:layer.height*viewport.height};
}

function roundedRect(ctx,x,y,width,height,radius){
  const r=Math.min(Math.max(0,radius),width/2,height/2);
  if(typeof ctx.roundRect==='function'){ctx.roundRect(x,y,width,height,r);return;}
  ctx.moveTo(x+r,y);ctx.lineTo(x+width-r,y);ctx.quadraticCurveTo(x+width,y,x+width,y+r);ctx.lineTo(x+width,y+height-r);ctx.quadraticCurveTo(x+width,y+height,x+width-r,y+height);ctx.lineTo(x+r,y+height);ctx.quadraticCurveTo(x,y+height,x,y+height-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
}

function applyMask(ctx,mask,width,height){
  if(mask.type==='none')return;
  const inset=Math.min(mask.inset,width/2,height/2),x=-width/2+inset,y=-height/2+inset,w=Math.max(0,width-inset*2),h=Math.max(0,height-inset*2);
  ctx.beginPath();
  if(mask.type==='circle')ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
  else if(mask.type==='rounded')roundedRect(ctx,x,y,w,h,mask.radius);
  else ctx.rect(x,y,w,h);
  ctx.clip();
}

function resolvePaint(ctx,paint,width,height){
  if(typeof paint==='string')return paint;
  const radians=paint.angle*Math.PI/180,dx=Math.cos(radians)*width/2,dy=Math.sin(radians)*height/2;
  const gradient=ctx.createLinearGradient(-dx,-dy,dx,dy);
  for(const stop of paint.stops)gradient.addColorStop(stop.offset,stop.color);
  return gradient;
}

function splitText(ctx,value,maxWidth,maxLines){
  const explicit=String(value).split(/\r?\n/),lines=[];
  for(const paragraph of explicit){
    if(!paragraph){lines.push('');continue;}
    let line='';
    for(const character of Array.from(paragraph)){
      const candidate=line+character;
      if(line&&ctx.measureText(candidate).width>maxWidth){lines.push(line);line=character;}else line=candidate;
      if(lines.length>=maxLines)break;
    }
    if(lines.length<maxLines)lines.push(line);
    if(lines.length>=maxLines)break;
  }
  return lines.slice(0,maxLines);
}

function drawTrackedText(ctx,value,x,y,letterSpacing,stroke=false){
  if(!letterSpacing){(stroke?ctx.strokeText:ctx.fillText).call(ctx,value,x,y);return;}
  const chars=Array.from(value),width=chars.reduce((sum,char)=>sum+ctx.measureText(char).width,0)+Math.max(0,chars.length-1)*letterSpacing;
  let cursor=x-width/2;
  for(const char of chars){const charWidth=ctx.measureText(char).width;(stroke?ctx.strokeText:ctx.fillText).call(ctx,char,cursor+charWidth/2,y);cursor+=charWidth+letterSpacing;}
}

function drawTextLayer(ctx,layer,width,height){
  ctx.font=`${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
  ctx.shadowColor=layer.shadowColor;ctx.shadowBlur=layer.shadowBlur;
  const lines=splitText(ctx,layer.text,width,layer.maxLines),lineHeight=layer.fontSize*layer.lineHeight,total=(lines.length-1)*lineHeight;
  ctx.fillStyle=resolvePaint(ctx,layer.fill,width,height);ctx.strokeStyle=layer.stroke;ctx.lineWidth=layer.strokeWidth;
  lines.forEach((line,index)=>{
    const y=index*lineHeight-total/2;
    if(layer.strokeWidth>0)drawTrackedText(ctx,line,0,y,layer.letterSpacing,true);
    drawTrackedText(ctx,line,0,y,layer.letterSpacing,false);
  });
}

function imageSize(image){return {width:image.naturalWidth||image.videoWidth||image.width||1,height:image.naturalHeight||image.videoHeight||image.height||1};}
function drawImageLayer(ctx,layer,image,width,height){
  ctx.imageSmoothingEnabled=layer.smoothing;
  if(layer.fit==='fill'){ctx.drawImage(image,-width/2,-height/2,width,height);return;}
  const source=imageSize(image),ratio=layer.fit==='cover'?Math.max(width/source.width,height/source.height):Math.min(width/source.width,height/source.height);
  const w=source.width*ratio,h=source.height*ratio;
  if(layer.fit==='cover'){ctx.save();ctx.beginPath();ctx.rect(-width/2,-height/2,width,height);ctx.clip();ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();}
  else ctx.drawImage(image,-w/2,-h/2,w,h);
}

export function resolveLayerImage(layer,runtime={}){
  if(typeof runtime.resolveImage==='function')return runtime.resolveImage(layer);
  if(runtime.images instanceof Map)return runtime.images.get(layer.assetId)||runtime.images.get(layer.id)||runtime.images.get(layer.src);
  return runtime.images?.[layer.assetId]||runtime.images?.[layer.id]||runtime.images?.[layer.src]||layer.image||null;
}

export function findMissingImageLayers(layers,runtime={}){
  return normalizeLayers(layers).filter(layer=>layer.visible&&layer.type==='image'&&!resolveLayerImage(layer,runtime));
}

/** Draw one normalized layer. Runtime assets stay outside serialisable project JSON. */
export function drawLayer(ctx,layerInput,runtime={}){
  const normalized=layerInput?.type&&layerInput?.enter?layerInput:normalizeLayer(layerInput);
  if(!normalized.visible)return {drawn:false,reason:'hidden',layer:normalized};
  const layer=resolveLayerAtTime(normalized,runtime.time??0,runtime.duration??Infinity,runtime.keyframeEvaluator);
  if(layer.opacity<=0)return {drawn:false,reason:'transparent',layer};
  const viewport=runtime.viewport??{x:0,y:0,width:1920,height:1080},geometry=resolveLayerGeometry(layer,viewport);
  const image=layer.type==='image'?resolveLayerImage(layer,runtime):null;
  if(layer.type==='image'&&!image)return {drawn:false,reason:'image-unavailable',layer};
  ctx.save();ctx.globalAlpha*=layer.opacity;ctx.globalCompositeOperation=layer.blendMode;
  ctx.translate(geometry.x,geometry.y);ctx.rotate(layer.rotation*Math.PI/180);ctx.scale(layer.scaleX,layer.scaleY);
  if(layer.glow.enabled){ctx.shadowColor=layer.glow.color;ctx.shadowBlur=layer.glow.blur*layer.glow.strength;}
  applyMask(ctx,layer.mask,geometry.width,geometry.height);
  if(layer.type==='text')drawTextLayer(ctx,layer,geometry.width,geometry.height);else drawImageLayer(ctx,layer,image,geometry.width,geometry.height);
  ctx.restore();return {drawn:true,reason:'',layer,geometry};
}

export function drawLayers(ctx,layers,runtime={}){return sortLayers(layers).map(layer=>drawLayer(ctx,layer,runtime));}

