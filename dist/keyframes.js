export const KEYFRAME_EASINGS=Object.freeze(['linear','ease-in','ease-out','ease-in-out']);

const EASING_ALIASES=Object.freeze({
  linear:'linear',Linear:'linear',
  'ease-in':'ease-in','Ease In':'ease-in',easeIn:'ease-in',
  'ease-out':'ease-out','Ease Out':'ease-out',easeOut:'ease-out',
  'ease-in-out':'ease-in-out','Ease In Out':'ease-in-out',easeInOut:'ease-in-out'
});
const BLOCKED_SEGMENTS=new Set(['__proto__','prototype','constructor']);
const OPTION_PROPERTIES=new Set(['value','label','position','scale','opacity']);
const LAYER_PROPERTIES=new Set(['position','x','y','scale','scaleX','scaleY','rotation','opacity','text','effects']);

const clone=value=>{
  if(value===undefined)return undefined;
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};
const finite=(value,label)=>{
  const number=Number(value);
  if(!Number.isFinite(number))throw new Error(`${label}需为有效数值。`);
  return number;
};
const createId=(prefix='kf')=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;

export function parseKeyframePath(path){
  const segments=Array.isArray(path)?path.map(String):String(path??'').startsWith('/')
    ?String(path).slice(1).split('/').map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'))
    :String(path??'').split('.');
  if(!segments.length||segments.some(segment=>!segment||BLOCKED_SEGMENTS.has(segment)))throw new Error('关键帧参数路径无效。');
  return segments;
}

export function isSupportedKeyframePath(path){
  let parts;
  try{parts=parseKeyframePath(path);}catch{return false;}
  if(parts[0]==='design')return parts.length===2&&/^[\w-]+$/u.test(parts[1]);
  if(parts[0]==='effects')return parts.length===2&&/^[\w-]+$/u.test(parts[1]);
  if(parts[0]==='options'){
    if(parts.length<3||!parts[1])return false;
    if(parts[2]==='effects')return parts.length===4&&/^[\w-]+$/u.test(parts[3]);
    if(parts[2]==='position')return parts.length===3||(parts.length===4&&['x','y'].includes(parts[3]));
    return parts.length===3&&OPTION_PROPERTIES.has(parts[2]);
  }
  if(parts[0]==='layers'){
    if(parts.length<3||!parts[1])return false;
    if(parts[2]==='effects')return parts.length===4&&/^[\w-]+$/u.test(parts[3]);
    if(parts[2]==='position')return parts.length===3||(parts.length===4&&['x','y'].includes(parts[3]));
    return parts.length===3&&LAYER_PROPERTIES.has(parts[2]);
  }
  return false;
}

export function easingValue(name,progress){
  const easing=EASING_ALIASES[name];
  if(!easing)throw new Error('关键帧缓动类型无效。');
  const t=Math.max(0,Math.min(1,finite(progress,'缓动进度')));
  if(easing==='ease-in')return t*t;
  if(easing==='ease-out')return 1-(1-t)*(1-t);
  if(easing==='ease-in-out')return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  return t;
}

function normalizeValue(value,path){
  const parts=parseKeyframePath(path),property=parts.at(-1);
  if(property==='position'){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('位置关键帧需包含 x、y。');
    return{x:finite(value.x,'位置 x'),y:finite(value.y,'位置 y')};
  }
  if(['label','value','text'].includes(property)){
    if(typeof value!=='string')throw new Error('文字关键帧的值需为字符串。');
    if(Array.from(value).length>256)throw new Error('文字关键帧不能超过 256 个字符。');
    return value;
  }
  if(typeof value==='boolean')return value;
  return finite(value,'关键帧值');
}

export function normalizeKeyframe(keyframe,{duration=Infinity}={}){
  if(!keyframe||typeof keyframe!=='object'||Array.isArray(keyframe))throw new Error('关键帧格式无效。');
  const id=String(keyframe.id??'').trim();
  if(!id||id.length>96)throw new Error('关键帧缺少有效标识。');
  const path=String(keyframe.path??'').trim();
  if(!isSupportedKeyframePath(path))throw new Error(`不支持的关键帧参数路径：${path||'（空）'}。`);
  const time=finite(keyframe.time,'关键帧时间');
  if(time<0||time>duration+1e-9)throw new Error(`关键帧时间需在 0–${Number.isFinite(duration)?duration:'动画时长'} 秒内。`);
  const easing=EASING_ALIASES[keyframe.easing??'linear'];
  if(!easing)throw new Error('关键帧缓动类型无效。');
  return{id,path,time,value:normalizeValue(keyframe.value,path),easing};
}

export function normalizeKeyframes(keyframes,{duration=Infinity}={}){
  if(!Array.isArray(keyframes))throw new Error('关键帧列表格式无效。');
  const normalized=keyframes.map(keyframe=>normalizeKeyframe(keyframe,{duration}));
  if(new Set(normalized.map(keyframe=>keyframe.id)).size!==normalized.length)throw new Error('关键帧标识不能重复。');
  return normalized.sort((a,b)=>a.time-b.time||a.path.localeCompare(b.path)||a.id.localeCompare(b.id));
}

export function addKeyframe(keyframes,keyframe,{duration=Infinity}={}){
  const current=normalizeKeyframes(keyframes,{duration}),next=normalizeKeyframe({...keyframe,id:keyframe?.id??createId()},{duration});
  if(current.some(item=>item.id===next.id))throw new Error('关键帧标识不能重复。');
  return normalizeKeyframes([...current,next],{duration});
}

export function removeKeyframe(keyframes,id,{duration=Infinity}={}){
  const current=normalizeKeyframes(keyframes,{duration}),index=current.findIndex(item=>item.id===id);
  if(index<0)throw new Error('未找到该关键帧。');
  return current.filter((_,itemIndex)=>itemIndex!==index);
}

export function moveKeyframe(keyframes,id,time,{duration=Infinity}={}){
  const current=normalizeKeyframes(keyframes,{duration}),index=current.findIndex(item=>item.id===id);
  if(index<0)throw new Error('未找到该关键帧。');
  current[index]={...current[index],time:finite(time,'关键帧时间')};
  return normalizeKeyframes(current,{duration});
}

export function copyKeyframe(keyframes,id,{newId=createId('kf-copy'),timeOffset=.1,time}={},options={}){
  const duration=options.duration??Infinity,current=normalizeKeyframes(keyframes,{duration}),source=current.find(item=>item.id===id);
  if(!source)throw new Error('未找到要复制的关键帧。');
  const nextTime=time??Math.min(Number.isFinite(duration)?duration:Infinity,source.time+finite(timeOffset,'关键帧时间偏移'));
  return addKeyframe(current,{...source,id:newId,time:nextTime},{duration});
}

function interpolateValue(from,to,t){
  if(typeof from==='number'&&typeof to==='number')return from+(to-from)*t;
  if(from&&to&&typeof from==='object'&&typeof to==='object'&&!Array.isArray(from)&&!Array.isArray(to)){
    const keys=new Set([...Object.keys(from),...Object.keys(to)]),result={};
    for(const key of keys)result[key]=typeof from[key]==='number'&&typeof to[key]==='number'?from[key]+(to[key]-from[key])*t:clone(t<1?from[key]:to[key]);
    return result;
  }
  return clone(t<1?from:to);
}

export function interpolateKeyframeTrack(track,time,{baseValue}={}){
  const points=normalizeKeyframes(track),at=finite(time,'预览时间');
  if(!points.length)return clone(baseValue);
  if(at<points[0].time)return clone(baseValue===undefined?points[0].value:baseValue);
  if(at>=points.at(-1).time)return clone(points.at(-1).value);
  let rightIndex=points.findIndex(point=>point.time>at);
  if(rightIndex<0)return clone(points.at(-1).value);
  const left=points[rightIndex-1],right=points[rightIndex];
  if(right.time===left.time)return clone(right.value);
  const progress=easingValue(right.easing,(at-left.time)/(right.time-left.time));
  return interpolateValue(left.value,right.value,progress);
}

function readProjectPath(project,parts){
  let current=project;
  for(let index=0;index<parts.length;index++){
    if((parts[0]==='options'||parts[0]==='layers')&&index===1&&Array.isArray(current))current=current.find(item=>item?.id===parts[index]);
    else current=current?.[parts[index]];
    if(current===undefined)return undefined;
  }
  return current;
}

function setNested(target,parts,value){
  let current=target;
  for(let index=0;index<parts.length-1;index++)current=current[parts[index]]??=(Object.create(null));
  current[parts.at(-1)]=clone(value);
}

function setProjectPath(project,parts,value){
  let current=project;
  for(let index=0;index<parts.length-1;index++){
    if((parts[0]==='options'||parts[0]==='layers')&&index===1&&Array.isArray(current)){
      const item=current.find(candidate=>candidate?.id===parts[index]);
      if(!item)return false;
      current=item;
    }else current=current[parts[index]]??=(Object.create(null));
  }
  current[parts.at(-1)]=clone(value);return true;
}

export function evaluateKeyframes(keyframes,time,{base={}}={}){
  const normalized=normalizeKeyframes(keyframes),groups=new Map(),result={};
  for(const keyframe of normalized){
    const list=groups.get(keyframe.path)??[];list.push(keyframe);groups.set(keyframe.path,list);
  }
  for(const [path,track]of groups){
    const parts=parseKeyframePath(path),baseValue=readProjectPath(base,parts);
    setNested(result,parts,interpolateKeyframeTrack(track,time,{baseValue}));
  }
  return result;
}

export function applyKeyframes(project,keyframes,time){
  const result=clone(project),normalized=normalizeKeyframes(keyframes);
  for(const path of new Set(normalized.map(keyframe=>keyframe.path))){
    const parts=parseKeyframePath(path),track=normalized.filter(keyframe=>keyframe.path===path);
    setProjectPath(result,parts,interpolateKeyframeTrack(track,time,{baseValue:readProjectPath(result,parts)}));
  }
  return result;
}
