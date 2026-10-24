export const THEME_FORMAT='signal-studio-theme';
export const THEME_VERSION=1;
export const THEME_COLOR_KEYS=Object.freeze(['number','text','glow','background','scanline','glitch']);

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);for(const child of Object.values(value))freeze(child);
  }
  return value;
};

const theme=(id,name,colors)=>freeze({id,name,colors});

export const BUILTIN_THEMES=freeze([
  theme('original','原版 SIGNAL',{
    number:'#ffffff',text:'#e0e0e0',glow:'rgba(255,255,255,0.85)',background:'#000000',scanline:'rgba(0,0,0,0.09)',glitch:'#ffffff'
  }),
  theme('white','纯白',{
    number:'#ffffff',text:'#ffffff',glow:'rgba(255,255,255,0.72)',background:'#050505',scanline:'rgba(255,255,255,0.10)',glitch:'#d8d8d8'
  }),
  theme('pink','粉色',{
    number:'#ff83cc',text:'#ffd1eb',glow:'rgba(255,69,176,0.82)',background:'#090006',scanline:'rgba(255,125,207,0.12)',glitch:'#ff2eaa'
  }),
  theme('purple','紫色',{
    number:'#c39bff',text:'#eadcff',glow:'rgba(143,72,255,0.85)',background:'#05000b',scanline:'rgba(184,132,255,0.12)',glitch:'#8d4dff'
  }),
  theme('cyan','青色',{
    number:'#65f7ff',text:'#ccfcff',glow:'rgba(0,224,255,0.78)',background:'#00090b',scanline:'rgba(76,240,255,0.12)',glitch:'#00e5ff'
  }),
  theme('cyber-neon','赛博霓虹',{
    number:'linear-gradient(90deg, #00f5ff 0%, #ff35c7 100%)',text:'#f6edff',glow:'rgba(190,48,255,0.82)',background:'linear-gradient(180deg, #02000b 0%, #090019 58%, #00070b 100%)',scanline:'rgba(43,240,255,0.13)',glitch:'#ff2d9f'
  }),
  theme('rgb','RGB',{
    number:'linear-gradient(90deg, #ff204e 0%, #50ff86 50%, #38a2ff 100%)',text:'#ffffff',glow:'rgba(255,255,255,0.72)',background:'#000000',scanline:'rgba(255,255,255,0.10)',glitch:'rgb(0, 255, 255)'
  })
]);

export const BUILTIN_THEME_BY_ID=freeze(Object.fromEntries(BUILTIN_THEMES.map(item=>[item.id,item])));

const splitTopLevel=value=>{
  const parts=[];let start=0,depth=0;
  for(let index=0;index<value.length;index++){
    const character=value[index];
    if(character==='(')depth++;
    else if(character===')'){depth--;if(depth<0)throw new Error('颜色括号不匹配。');}
    else if(character===','&&depth===0){parts.push(value.slice(start,index).trim());start=index+1;}
  }
  if(depth!==0)throw new Error('颜色括号不匹配。');
  parts.push(value.slice(start).trim());
  return parts;
};

const normalizeNumber=value=>{
  const number=Number(value);
  return Object.is(number,-0)?0:number;
};

function parseSolidColor(value){
  const input=String(value??'').trim();
  const hex=input.match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
  if(hex)return{type:'solid',value:`#${hex[1].toLowerCase()}`};
  const functional=input.match(/^(rgb|rgba)\((.*)\)$/i);
  if(!functional)return null;
  const parts=splitTopLevel(functional[2]);
  const needsAlpha=functional[1].toLowerCase()==='rgba';
  if(parts.length!==(needsAlpha?4:3)||parts.some(part=>part===''))return null;
  const channels=parts.slice(0,3).map(part=>/^\d{1,3}$/.test(part)?Number(part):NaN);
  if(channels.some(channel=>!Number.isInteger(channel)||channel<0||channel>255))return null;
  if(!needsAlpha)return{type:'solid',value:`rgb(${channels.join(', ')})`,channels:[...channels,1]};
  if(!/^(?:0(?:\.\d+)?|\.\d+|1(?:\.0+)?)$/.test(parts[3]))return null;
  const alpha=normalizeNumber(parts[3]);
  if(alpha<0||alpha>1)return null;
  return{type:'solid',value:`rgba(${channels.join(', ')}, ${alpha})`,channels:[...channels,alpha]};
}

function parseDirection(value){
  const input=value.trim().toLowerCase();
  const angle=input.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))deg$/);
  if(angle)return((Number(angle[1])%360)+360)%360;
  if(!input.startsWith('to '))return null;
  const words=input.slice(3).trim().split(/\s+/),allowed=new Set(['top','right','bottom','left']);
  if(words.length<1||words.length>2||words.some(word=>!allowed.has(word))||new Set(words).size!==words.length)return null;
  if(words.includes('top')&&words.includes('bottom')||words.includes('left')&&words.includes('right'))return null;
  const vertical=words.includes('top')?-1:words.includes('bottom')?1:0;
  const horizontal=words.includes('right')?1:words.includes('left')?-1:0;
  if(vertical===0&&horizontal===0)return null;
  return((Math.atan2(horizontal,-vertical)*180/Math.PI)%360+360)%360;
}

function parseColorStop(value){
  const input=value.trim();
  let colorText,positionText='';
  if(input.startsWith('#')){
    const match=input.match(/^(#[\da-f]+)(?:\s+(.+))?$/i);if(!match)return null;
    [,colorText,positionText='']=match;
  }else{
    const open=input.indexOf('(');if(open<0)return null;
    let depth=0,close=-1;
    for(let index=open;index<input.length;index++){
      if(input[index]==='(')depth++;
      else if(input[index]===')'&&--depth===0){close=index;break;}
    }
    if(close<0)return null;
    colorText=input.slice(0,close+1);positionText=input.slice(close+1).trim();
  }
  const color=parseSolidColor(colorText);if(!color)return null;
  if(positionText&&!/^(?:100(?:\.0+)?|(?:\d{1,2})(?:\.\d+)?|\.\d+)%$/.test(positionText))return null;
  const position=positionText?Number(positionText.slice(0,-1))/100:null;
  if(position!==null&&(position<0||position>1))return null;
  return{color:color.value,position};
}

function fillStopPositions(stops){
  const result=stops.map(stop=>({...stop}));
  if(result[0].position===null)result[0].position=0;
  if(result.at(-1).position===null)result.at(-1).position=1;
  let index=0;
  while(index<result.length){
    if(result[index].position!==null){index++;continue;}
    const start=index-1;let end=index;
    while(end<result.length&&result[end].position===null)end++;
    const from=result[start].position,to=result[end].position,count=end-start;
    for(let offset=1;offset<count;offset++)result[start+offset].position=from+(to-from)*offset/count;
    index=end+1;
  }
  for(let position=1;position<result.length;position++)if(result[position].position<result[position-1].position)throw new Error('渐变色标位置必须从小到大排列。');
  return result;
}

export function parseLinearGradient(value){
  const input=String(value??'').trim(),match=input.match(/^linear-gradient\((.*)\)$/i);
  if(!match)return null;
  const parts=splitTopLevel(match[1]);
  let angle=180;
  const requestedDirection=parseDirection(parts[0]);
  if(requestedDirection!==null){angle=requestedDirection;parts.shift();}
  if(parts.length<2)throw new Error('线性渐变至少需要两个色标。');
  const stops=parts.map(parseColorStop);
  if(stops.some(stop=>!stop))throw new Error('线性渐变色标格式无效。');
  return{type:'linear-gradient',angle,stops:fillStopPositions(stops)};
}

export function validateColorValue(value,{allowGradient=true,label='颜色'}={}){
  const input=String(value??'').trim();
  if(!input||input.length>512||/[;{}]|url\s*\(/i.test(input))throw new Error(`${label}格式无效。`);
  const solid=parseSolidColor(input);if(solid)return solid.value;
  if(allowGradient){
    try{const gradient=parseLinearGradient(input);if(gradient)return input;}
    catch(error){throw new Error(`${label}格式无效：${error.message}`);}
  }
  throw new Error(`${label}仅支持 HEX、RGB、RGBA 或 linear-gradient。`);
}

export function isValidColorValue(value,options){
  try{validateColorValue(value,options);return true;}catch{return false;}
}

export function createCanvasColorStyle(context,value,{x=0,y=0,width=1,height=1}={}){
  const normalized=validateColorValue(value),parsed=parseLinearGradient(normalized);
  if(!parsed)return normalized;
  if(!context||typeof context.createLinearGradient!=='function')throw new Error('当前 Canvas 环境不支持线性渐变。');
  for(const [label,number]of Object.entries({x,y,width,height}))if(!Number.isFinite(number)||(label==='width'||label==='height')&&number<=0)throw new Error('Canvas 渐变范围无效。');
  const radians=parsed.angle*Math.PI/180,dx=Math.sin(radians),dy=-Math.cos(radians);
  const centerX=x+width/2,centerY=y+height/2,extent=Math.abs(dx)*width/2+Math.abs(dy)*height/2;
  const gradient=context.createLinearGradient(centerX-dx*extent,centerY-dy*extent,centerX+dx*extent,centerY+dy*extent);
  for(const stop of parsed.stops)gradient.addColorStop(stop.position,stop.color);
  return gradient;
}

const cleanId=value=>{
  const id=String(value??'custom').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);
  return id||'custom';
};

export function normalizeTheme(input,{fallback='original'}={}){
  if(typeof input==='string'&&BUILTIN_THEME_BY_ID[input])return structuredClone(BUILTIN_THEME_BY_ID[input]);
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('主题格式无效。');
  const base=BUILTIN_THEME_BY_ID[input.base??fallback]??BUILTIN_THEME_BY_ID.original;
  const source=input.colors&&typeof input.colors==='object'&&!Array.isArray(input.colors)?input.colors:input;
  const colors={};
  for(const key of THEME_COLOR_KEYS)colors[key]=validateColorValue(source[key]??base.colors[key],{label:`${key} 颜色`});
  return{id:cleanId(input.id??input.preset??'custom'),name:String(input.name??'自定义主题').trim().slice(0,96)||'自定义主题',colors};
}

export function serializeCustomTheme(input,{pretty=true}={}){
  const theme=normalizeTheme(input);
  return JSON.stringify({format:THEME_FORMAT,version:THEME_VERSION,theme},null,pretty?2:0)+(pretty?'\n':'');
}

export function importCustomTheme(source){
  let parsed;
  try{parsed=typeof source==='string'?JSON.parse(source):source;}
  catch{throw new Error('主题 JSON 无法解析。');}
  if(parsed?.format!==undefined&&(parsed.format!==THEME_FORMAT||parsed.version!==THEME_VERSION))throw new Error('主题文件格式或版本不受支持。');
  return normalizeTheme(parsed?.theme??parsed);
}
