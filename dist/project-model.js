import {APP_CONFIG,MOTION,validateOptions} from './config.js';
import {DEFAULT_SETTINGS} from './default-settings.js';
import {DEFAULT_DESIGN,validateDesign} from './design.js';
import {applyKeyframes,normalizeKeyframes} from './keyframes.js';
import {normalizeBeatSync} from './beat-sync.js';
import {normalizeLayers as normalizeStudioLayers} from './layers.js';
import {normalizeLayoutConfig} from './studio-layout.js';
import {validateColorValue} from './themes.js';

export const PROJECT_FORMAT='signal-studio';
export const PROJECT_VERSION=2;
export const ORIGINAL_SIGNAL_DURATION=APP_CONFIG.duration;
export const STAGE_KEYS=Object.freeze(['intro','select','roll','stable','glitch','exit']);
export const PROJECT_ASPECTS=Object.freeze(['16:9','4:3','1:1','9:16']);
export const PROJECT_FIT_MODES=Object.freeze(['reflow','fit','crop']);
export const PROJECT_LAYOUT_MODES=Object.freeze(['grid','focus','carousel','paged']);

export const SIGNAL_REFERENCE_STAGE_BOUNDARIES=Object.freeze({
  intro:Object.freeze([0,MOTION.selectStart]),
  select:Object.freeze([MOTION.selectStart,MOTION.numberAppear]),
  roll:Object.freeze([MOTION.numberAppear,MOTION.sideStart]),
  stable:Object.freeze([MOTION.sideStart,MOTION.sideEnd]),
  glitch:Object.freeze([MOTION.sideEnd,MOTION.exitStart]),
  exit:Object.freeze([MOTION.exitStart,APP_CONFIG.duration])
});
export const DEFAULT_STAGE_DURATIONS=Object.freeze(Object.fromEntries(STAGE_KEYS.map(key=>{
  const [start,end]=SIGNAL_REFERENCE_STAGE_BOUNDARIES[key];return[key,end-start];
})));

const AUDIO_SOURCES=new Set(['original','custom','none']);
const EXPORT_QUALITIES=new Set(['1080p','2k','4k']);
const EXPORT_FPS=new Set([30,60,90,120,144,165]);
const LOCAL_REFERENCE_KEYS=/^(?:file|fileData|data|dataUrl|bytes|arrayBuffer|handle|src|url|objectUrl|objectURL|assetId)$/i;
const LOCAL_PATH_KEYS=/^(?:path|localPath|absolutePath)$/i;

const clone=value=>{
  if(value===undefined)return undefined;
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=(value,label,{min=-Infinity,max=Infinity,integer=false}={})=>{
  const number=Number(value);
  if(!Number.isFinite(number)||(integer&&!Number.isInteger(number))||number<min||number>max)throw new Error(`${label}无效。`);
  return number;
};
const text=(value,label,{fallback='',max=256,required=false}={})=>{
  const result=String(value??fallback).trim();
  if((required&&!result)||Array.from(result).length>max)throw new Error(`${label}无效。`);
  return result;
};
const bool=(value,fallback=false)=>value===undefined?fallback:Boolean(value);
const basename=value=>String(value??'').split(/[\\/]/).at(-1).slice(0,180);
const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);
  }
  return value;
};

export const DEFAULT_PROJECT_EXTENSIONS=deepFreeze({
  meta:{name:'未命名 SIGNAL 项目',description:'',createdAt:null,updatedAt:null},
  preview:{view:'single',selectedId:'at',aspect:'16:9',framing:'crop'},
  layout:{mode:'focus',grid:'auto',aspect:'16:9',framing:'crop',order:[],selectedId:'at',page:0,spacing:0,safeMargin:0,minimumScale:.4,carouselIndex:0,carouselDuration:2,time:0,labelFontSize:28,numberFontSize:180,minimumLabelPixels:12,minimumNumberPixels:48},
  audio:{source:'original',name:'audio.wav',mimeType:'audio/wav',assetId:null,volume:1,muted:false,trimStart:0,trimEnd:null,timelineStart:0,timelineEnd:null,loop:false,fadeIn:0,fadeOut:0},
  beat:{enabled:false,bpm:120,offset:0,subdivision:1,intensity:.6,attack:.025,decay:.18,flash:true,numberJump:true,rgbSplit:true,shake:true,analysis:'manual'},
  theme:{preset:'original',colors:{number:'#ffffff',text:'#e0e0e0',glow:'rgba(255,255,255,0.85)',background:'#000000',scanline:'rgba(0,0,0,0.09)',glitch:'#ffffff'}},
  typography:{number:{family:'Saira',weight:900,size:null,letterSpacing:0,stroke:0,shadow:0},text:{family:'Saira',weight:400,size:null,letterSpacing:0,stroke:0,shadow:0},fonts:[]},
  layers:[],
  export:{quality:'1080p',aspect:'16:9',fps:30,bitrateMode:'preset',qualityPreset:'balanced',videoBitrate:null,includeAudio:true,fileName:'signal-{date}'},
  batch:{fileNameTemplate:'signal-{index}-{label}',concurrency:1,tasks:[]}
});

function normalizeMeta(raw={}){
  if(!plain(raw))throw new Error('项目元数据格式无效。');
  return{
    name:text(raw.name,'项目名称',{fallback:DEFAULT_PROJECT_EXTENSIONS.meta.name,max:96,required:true}),
    description:text(raw.description,'项目说明',{max:500}),
    createdAt:typeof raw.createdAt==='string'?raw.createdAt:null,
    updatedAt:typeof raw.updatedAt==='string'?raw.updatedAt:null
  };
}

function normalizePreview(raw={},options){
  if(!plain(raw))throw new Error('预览设置格式无效。');
  const view=raw.view??DEFAULT_PROJECT_EXTENSIONS.preview.view;
  const aspect=raw.aspect??DEFAULT_PROJECT_EXTENSIONS.preview.aspect;
  const legacyFraming={contain:'fit',cover:'crop'},framing=legacyFraming[raw.fitMode]??raw.fitMode??raw.framing??DEFAULT_PROJECT_EXTENSIONS.preview.framing;
  if(!['grid','single','focus','carousel','paged'].includes(view))throw new Error('预览布局无效。');
  if(!PROJECT_ASPECTS.includes(aspect))throw new Error('预览比例无效。');
  if(!PROJECT_FIT_MODES.includes(framing))throw new Error('画幅适配模式无效。');
  const requested=raw.selectedId??options[0].id;
  return{view,selectedId:options.some(option=>option.id===requested)?requested:options[0].id,aspect,framing};
}

function normalizeLayout(raw={},options,preview){
  if(!plain(raw))throw new Error('布局设置格式无效。');
  const ids=new Set(options.map(option=>option.id)),order=Array.isArray(raw.order)?raw.order.map(String).filter((id,index,list)=>ids.has(id)&&list.indexOf(id)===index):[];
  for(const option of options)if(!order.includes(option.id))order.push(option.id);
  const selectedId=ids.has(raw.selectedId)?raw.selectedId:ids.has(raw.focusId)?raw.focusId:preview.selectedId;
  const legacyFraming={contain:'fit',cover:'crop'},framing=legacyFraming[raw.fitMode]??raw.framing??preview.framing;
  return normalizeLayoutConfig({
    ...raw,mode:raw.mode??(preview.view==='single'?'focus':preview.view),grid:raw.grid??'auto',aspect:raw.aspect??preview.aspect,framing,
    order,selectedId,carouselDuration:raw.carouselDuration??raw.carouselInterval
  });
}

export function normalizeTimeline(raw={}){
  if(!plain(raw))throw new Error('时间轴设置格式无效。');
  const hasStages=plain(raw.stages),requestedDuration=raw.duration===undefined?null:finite(raw.duration,'动画总时长',{min:.1,max:3600});
  let stages;
  if(hasStages){
    stages=Object.fromEntries(STAGE_KEYS.map(key=>[key,finite(raw.stages[key]??DEFAULT_STAGE_DURATIONS[key],`${key} 阶段时长`,{min:0,max:3600})]));
    const sum=STAGE_KEYS.reduce((total,key)=>total+stages[key],0);
    if(sum<.1)throw new Error('各阶段总时长不能小于 0.1 秒。');
    if(requestedDuration!==null&&Math.abs(sum-requestedDuration)>1e-7){
      const ratio=requestedDuration/sum;for(const key of STAGE_KEYS)stages[key]*=ratio;
    }
  }else{
    const duration=requestedDuration??ORIGINAL_SIGNAL_DURATION,ratio=duration/ORIGINAL_SIGNAL_DURATION;
    stages=Object.fromEntries(STAGE_KEYS.map(key=>[key,DEFAULT_STAGE_DURATIONS[key]*ratio]));
  }
  const duration=STAGE_KEYS.reduce((total,key)=>total+stages[key],0);
  return{
    duration,stages,
    keyframes:normalizeKeyframes(raw.keyframes??[],{duration}),
    zoom:finite(raw.zoom??1,'时间轴缩放',{min:.1,max:100}),
    playhead:finite(raw.playhead??0,'时间轴播放头',{min:0,max:duration})
  };
}

function normalizeAudio(raw={}){
  if(!plain(raw))throw new Error('音频设置格式无效。');
  const source=raw.source??'original';if(!AUDIO_SOURCES.has(source))throw new Error('音轨来源无效。');
  const trimStart=finite(raw.trimStart??0,'音频裁剪起点',{min:0,max:86400}),trimEnd=raw.trimEnd==null?null:finite(raw.trimEnd,'音频裁剪终点',{min:0,max:86400});
  if(trimEnd!==null&&trimEnd<=trimStart)throw new Error('音频裁剪终点需晚于起点。');
  return{
    source,name:basename(raw.name??(source==='original'?'audio.wav':'')),mimeType:text(raw.mimeType,'音频类型',{max:96}),
    assetId:typeof raw.assetId==='string'&&raw.assetId.length<=128?raw.assetId:null,
    volume:finite(raw.volume??1,'音量',{min:0,max:4}),muted:bool(raw.muted),trimStart,trimEnd,
    timelineStart:finite(raw.timelineStart??raw.startTime??0,'音轨开始时间',{min:0,max:86400}),
    timelineEnd:raw.timelineEnd==null?null:finite(raw.timelineEnd,'音轨结束时间',{min:0,max:86400}),
    loop:bool(raw.loop),fadeIn:finite(raw.fadeIn??0,'淡入时长',{min:0,max:3600}),fadeOut:finite(raw.fadeOut??0,'淡出时长',{min:0,max:3600})
  };
}

function normalizeBeat(raw={}){
  if(!plain(raw))throw new Error('节拍同步设置格式无效。');
  const analysis=raw.analysis??'manual';if(!['manual','web-audio'].includes(analysis))throw new Error('节拍分析模式无效。');
  const triggers=plain(raw.triggers)?raw.triggers:{},normalized=normalizeBeatSync({...raw,flash:raw.flash??triggers.flash,numberJump:raw.numberJump??triggers.numberJump,rgbSplit:raw.rgbSplit??triggers.rgbSplit,shake:raw.shake??triggers.shake});
  return{...normalized,analysis};
}

function normalizeColor(value,label,fallback){
  const result=text(value,label,{fallback,max:256,required:true});
  return validateColorValue(result,{label});
}
function normalizeTheme(raw={}){
  if(!plain(raw))throw new Error('颜色主题格式无效。');
  const source=plain(raw.colors)?raw.colors:{},defaults=DEFAULT_PROJECT_EXTENSIONS.theme.colors;
  return{preset:text(raw.preset,'主题名称',{fallback:'custom',max:64,required:true}),colors:Object.fromEntries(Object.keys(defaults).map(key=>[key,normalizeColor(source[key],`${key} 颜色`,defaults[key])]))};
}

function normalizeFontStyle(raw,defaults,label){
  if(!plain(raw))throw new Error(`${label}字体设置格式无效。`);
  return{
    family:text(raw.family,`${label}字体`,{fallback:defaults.family,max:128,required:true}),
    weight:finite(raw.weight??defaults.weight,`${label}字重`,{min:1,max:1000,integer:true}),
    size:raw.size==null?null:finite(raw.size,`${label}字号`,{min:1,max:4096}),
    letterSpacing:finite(raw.letterSpacing??0,`${label}字距`,{min:-500,max:2000}),
    stroke:finite(raw.stroke??0,`${label}描边`,{min:0,max:500}),shadow:finite(raw.shadow??0,`${label}阴影`,{min:0,max:1000})
  };
}
function normalizeTypography(raw={}){
  if(!plain(raw))throw new Error('字体设置格式无效。');
  const fonts=Array.isArray(raw.fonts)?raw.fonts.map((font,index)=>{
    if(!plain(font))throw new Error(`第 ${index+1} 个字体信息无效。`);
    return{id:text(font.id,`第 ${index+1} 个字体标识`,{fallback:`font-${index+1}`,max:96,required:true}),family:text(font.family,'字体名称',{max:128,required:true}),name:basename(font.name),mimeType:text(font.mimeType,'字体类型',{max:96}),assetId:typeof font.assetId==='string'?font.assetId:null};
  }):[];
  return{number:normalizeFontStyle(raw.number??{},DEFAULT_PROJECT_EXTENSIONS.typography.number,'数字'),text:normalizeFontStyle(raw.text??{},DEFAULT_PROJECT_EXTENSIONS.typography.text,'文字'),fonts};
}

function normalizeExport(raw={}){
  if(!plain(raw))throw new Error('导出设置格式无效。');
  const quality=raw.quality??'1080p',aspect=raw.aspect??'16:9',fps=Number(raw.fps??30),bitrateMode=raw.bitrateMode??'preset',qualityPreset=(raw.qualityPreset==='draft'?'compact':raw.qualityPreset)??'balanced';
  if(!EXPORT_QUALITIES.has(quality))throw new Error('导出分辨率无效。');
  if(!PROJECT_ASPECTS.includes(aspect))throw new Error('导出画幅无效。');
  if(!EXPORT_FPS.has(fps))throw new Error('导出帧率无效。');
  if(!['preset','custom'].includes(bitrateMode)||!['compact','balanced','high','maximum'].includes(qualityPreset))throw new Error('导出画质设置无效。');
  return{quality,aspect,fps,bitrateMode,qualityPreset,videoBitrate:raw.videoBitrate==null?null:finite(raw.videoBitrate,'视频码率',{min:100000,max:1000000000,integer:true}),includeAudio:bool(raw.includeAudio,true),fileName:text(raw.fileName,'导出文件名',{fallback:'signal-{date}',max:180,required:true})};
}

function normalizeBatch(raw={}){
  if(!plain(raw))throw new Error('批量导出设置格式无效。');
  const tasks=Array.isArray(raw.tasks)?raw.tasks.map((task,index)=>{
    if(!plain(task))throw new Error(`第 ${index+1} 个批量任务无效。`);
    return{id:text(task.id,'批量任务标识',{fallback:`task-${index+1}`,max:96,required:true}),name:text(task.name,'批量任务名称',{fallback:`任务 ${index+1}`,max:128,required:true}),overrides:plain(task.overrides)?clone(task.overrides):{},status:['pending','running','completed','failed','cancelled'].includes(task.status)?task.status:'pending'};
  }):[];
  return{fileNameTemplate:text(raw.fileNameTemplate,'批量文件名模板',{fallback:'signal-{index}-{label}',max:180,required:true}),concurrency:1,tasks};
}

function canonicalInput(input){
  if(Array.isArray(input))return{options:input};
  if(!plain(input))throw new Error('项目配置格式无效。');
  if(input.format!==undefined&&input.format!==PROJECT_FORMAT)throw new Error('此文件不是 SIGNAL 项目。');
  if(input.version!==undefined&&!Number.isInteger(input.version))throw new Error('项目版本无效。');
  if(input.version!==undefined&&input.version>PROJECT_VERSION)throw new Error(`不支持 SIGNAL Studio v${input.version} 项目。`);
  return input;
}

export function normalizeProject(input={}, {fallback=DEFAULT_SETTINGS}={}){
  const raw=canonicalInput(input),base=canonicalInput(fallback),options=validateOptions((raw.options??base.options??DEFAULT_SETTINGS.options).map((option,index)=>({...option,id:option?.id??`option-${index+1}`})));
  const mergeField=(rawValue,baseValue)=>rawValue===undefined?(plain(baseValue)?{...baseValue}:baseValue??{}):plain(rawValue)?{...(plain(baseValue)?baseValue:{}),...rawValue}:rawValue;
  const design=validateDesign(mergeField(raw.design,base.design),DEFAULT_DESIGN);
  const preview=normalizePreview({...DEFAULT_PROJECT_EXTENSIONS.preview,...(base.preview??{}),...(raw.preview??{}),view:raw.view??raw.preview?.view??base.view??base.preview?.view,aspect:raw.aspect??raw.preview?.aspect??base.aspect??base.preview?.aspect,selectedId:raw.selectedId??raw.preview?.selectedId??base.selectedId??base.preview?.selectedId},options);
  const timelineInput=mergeField(raw.timeline,base.timeline);
  if(plain(timelineInput)){
    if(raw.duration!==undefined)timelineInput.duration=raw.duration;
    if(plain(base.timeline?.stages)||plain(raw.timeline?.stages))timelineInput.stages={...(plain(base.timeline?.stages)?base.timeline.stages:{}),...(plain(raw.timeline?.stages)?raw.timeline.stages:{})};
  }
  const themeInput=mergeField(raw.theme,base.theme);
  if(plain(themeInput)&&(plain(base.theme?.colors)||plain(raw.theme?.colors)))themeInput.colors={...(plain(base.theme?.colors)?base.theme.colors:{}),...(plain(raw.theme?.colors)?raw.theme.colors:{})};
  const typographyInput=mergeField(raw.typography,base.typography);
  if(plain(typographyInput))for(const target of ['number','text'])if(plain(base.typography?.[target])||plain(raw.typography?.[target]))typographyInput[target]={...(plain(base.typography?.[target])?base.typography[target]:{}),...(plain(raw.typography?.[target])?raw.typography[target]:{})};
  const timeline=normalizeTimeline(timelineInput);
  const audio=normalizeAudio(mergeField(raw.audio,base.audio));
  if(audio.timelineStart>timeline.duration+1e-9||audio.timelineEnd!==null&&audio.timelineEnd>timeline.duration+1e-9)throw new Error('音轨时间范围不能超出项目总时长。');
  const project={
    format:PROJECT_FORMAT,version:PROJECT_VERSION,meta:normalizeMeta(mergeField(raw.meta,base.meta)),options,design,preview,timeline,
    layout:normalizeLayout(mergeField(raw.layout,base.layout),options,preview),audio,beat:normalizeBeat(mergeField(raw.beat,base.beat)),
    theme:normalizeTheme(themeInput),typography:normalizeTypography(typographyInput),layers:normalizeStudioLayers(raw.layers??base.layers??[]),
    export:normalizeExport(mergeField(raw.export,base.export)),batch:normalizeBatch(mergeField(raw.batch,base.batch))
  };
  return project;
}

export function createDefaultProject(overrides={}){
  const base={...clone(DEFAULT_SETTINGS),...clone(DEFAULT_PROJECT_EXTENSIONS),timeline:normalizeTimeline()};
  return normalizeProject({...base,...clone(overrides)});
}

export function migrateProject(input,options){return normalizeProject(input,options);}

export function parseProject(textValue,options){
  let data;try{data=JSON.parse(String(textValue).replace(/^\uFEFF/,''));}catch{throw new Error('文件不是有效的 JSON。');}
  return normalizeProject(data,options);
}

export function serializeProject(project,{pretty=true,shareSafe=false}={}){
  const normalized=shareSafe?sanitizeProjectForShare(project):normalizeProject(project);
  return JSON.stringify(normalized,null,pretty?2:0)+(pretty?'\n':'');
}

export function getTimelineStage(time,timeline){
  const normalized=normalizeTimeline(timeline),clamped=Math.max(0,Math.min(normalized.duration,finite(time,'时间'))),boundaries=[];
  let cursor=0;
  for(const key of STAGE_KEYS){const start=cursor,end=start+normalized.stages[key];boundaries.push({key,start,end,duration:normalized.stages[key]});cursor=end;}
  return boundaries.find(stage=>clamped<stage.end-1e-12)||boundaries.at(-1);
}

export function mapProjectTimeToSignalTime(time,timeline){
  const normalized=normalizeTimeline(timeline),clamped=Math.max(0,Math.min(normalized.duration,finite(time,'时间')));
  if(clamped>=normalized.duration)return ORIGINAL_SIGNAL_DURATION;
  let projectCursor=0;
  for(const key of STAGE_KEYS){
    const duration=normalized.stages[key],[referenceStart,referenceEnd]=SIGNAL_REFERENCE_STAGE_BOUNDARIES[key],projectEnd=projectCursor+duration;
    if(clamped<projectEnd-1e-12)return duration===0?referenceEnd:referenceStart+(clamped-projectCursor)/duration*(referenceEnd-referenceStart);
    projectCursor=projectEnd;
  }
  return ORIGINAL_SIGNAL_DURATION;
}

export function mapSignalTimeToProjectTime(time,timeline){
  const normalized=normalizeTimeline(timeline),clamped=Math.max(0,Math.min(ORIGINAL_SIGNAL_DURATION,finite(time,'SIGNAL 时间')));
  if(clamped>=ORIGINAL_SIGNAL_DURATION)return normalized.duration;
  let projectCursor=0;
  for(const key of STAGE_KEYS){
    const [referenceStart,referenceEnd]=SIGNAL_REFERENCE_STAGE_BOUNDARIES[key],referenceDuration=referenceEnd-referenceStart;
    if(clamped<referenceEnd-1e-12)return projectCursor+(clamped-referenceStart)/referenceDuration*normalized.stages[key];
    projectCursor+=normalized.stages[key];
  }
  return normalized.duration;
}

export function evaluateProjectAtTime(project,time,{normalized=false}={}){
  const normalizedProject=normalized?project:normalizeProject(project),projectTime=Math.max(0,Math.min(normalizedProject.timeline.duration,finite(time,'预览时间'))),evaluated=applyKeyframes(normalizedProject,normalizedProject.timeline.keyframes,projectTime);
  return{project:evaluated,projectTime,signalTime:mapProjectTimeToSignalTime(projectTime,normalizedProject.timeline),stage:getTimelineStage(projectTime,normalizedProject.timeline)};
}

function stripLocalReferences(value,parentKey=''){
  if(Array.isArray(value))return value.map(item=>stripLocalReferences(item,parentKey));
  if(!plain(value))return value;
  const result={};
  for(const [key,child]of Object.entries(value)){
    if(LOCAL_REFERENCE_KEYS.test(key))continue;
    if(LOCAL_PATH_KEYS.test(key)&&['audio','fonts','layers'].includes(parentKey))continue;
    if((key==='name'||key==='fileName')&&['audio','fonts','layers'].includes(parentKey))result[key]=basename(child);
    else result[key]=stripLocalReferences(child,key);
  }
  return result;
}

export function sanitizeProjectForShare(project){
  const normalized=normalizeProject(project),sanitized=stripLocalReferences(normalized);
  sanitized.audio={...sanitized.audio,assetId:null};
  sanitized.typography.fonts=sanitized.typography.fonts.map(font=>({...font,assetId:null}));
  sanitized.layers=sanitized.layers.map(layer=>layer.type==='image'?{...layer,assetId:null}:layer);
  sanitized.batch={...sanitized.batch,tasks:sanitized.batch.tasks.map(task=>({...task,status:'pending'}))};
  return normalizeProject(sanitized);
}

export function beatStateAtTime(time,beat){
  const normalized=normalizeBeat(beat),at=finite(time,'节拍时间');
  if(!normalized.enabled)return{active:false,index:-1,phase:1,strength:0};
  const beatLength=60/normalized.bpm,relative=at-normalized.offset,index=Math.floor(relative/beatLength),phase=((relative%beatLength)+beatLength)%beatLength/beatLength;
  const envelope=Math.max(0,1-phase/.18);
  return{active:relative>=0&&envelope>0,index,phase,strength:envelope*normalized.intensity,triggers:{flash:normalized.flash,numberJump:normalized.numberJump,rgbSplit:normalized.rgbSplit,shake:normalized.shake}};
}
