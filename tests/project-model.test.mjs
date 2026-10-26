import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS} from '../dist/default-settings.js';
import {
  DEFAULT_STAGE_DURATIONS,ORIGINAL_SIGNAL_DURATION,PROJECT_VERSION,SIGNAL_REFERENCE_STAGE_BOUNDARIES,STAGE_KEYS,
  beatStateAtTime,createDefaultProject,evaluateProjectAtTime,getTimelineStage,mapProjectTimeToSignalTime,
  mapSignalTimeToProjectTime,normalizeProject,normalizeTimeline,parseProject,sanitizeProjectForShare,serializeProject
} from '../dist/project-model.js';
import {
  addKeyframe,applyKeyframes,copyKeyframe,easingValue,evaluateKeyframes,interpolateKeyframeTrack,
  isSupportedKeyframePath,moveKeyframe,normalizeKeyframes,removeKeyframe
} from '../dist/keyframes.js';
import {
  BUILT_IN_TEMPLATES,addCustomTemplate,applyTemplate,createTemplateFromProject,deleteCustomTemplate,
  duplicateTemplate,exportTemplate,importTemplate,parseCustomTemplates,serializeCustomTemplates,updateCustomTemplate
} from '../dist/templates.js';
import {createShareUrl,decodeShareFragment,encodeShareFragment,inspectShareLength} from '../dist/share-config.js';

test('v1 and legacy option arrays migrate to complete v2 projects without mutating input',()=>{
  const legacy=structuredClone(DEFAULT_SETTINGS),snapshot=structuredClone(legacy),project=normalizeProject(legacy);
  assert.equal(project.version,PROJECT_VERSION);assert.equal(project.format,'signal-studio');
  assert.deepEqual(project.options,legacy.options);assert.deepEqual(project.design,legacy.design);
  assert.deepEqual(project.preview,{...legacy.preview,framing:'crop'});
  assert.equal(project.timeline.duration,ORIGINAL_SIGNAL_DURATION);assert.equal(project.audio.source,'original');
  assert.equal(project.layout.mode,'focus');assert.deepEqual(legacy,snapshot);
  const arrayProject=normalizeProject([{label:'ZERO',value:'００７'}]);
  assert.deepEqual(arrayProject.options,[{id:'option-1',label:'ZERO',value:'007'}]);
  assert.throws(()=>normalizeProject({...legacy,version:99}),/不支持/);
});

test('partial legacy imports inherit every missing Studio field from the current project',()=>{
  const current=createDefaultProject({
    meta:{name:'保留项目'},timeline:{duration:23,zoom:4},audio:{source:'none',volume:.25},
    beat:{enabled:true,bpm:168},theme:{preset:'custom',colors:{number:'#00ffff'}},
    typography:{number:{family:'Local Digits',weight:777}},layout:{mode:'paged',grid:'2x2',page:1},
    export:{quality:'4k',aspect:'9:16',fps:120},batch:{fileNameTemplate:'keep-{index}'}
  }),before=structuredClone(current);
  const imported=normalizeProject([{id:'only',label:'NEW',value:'42'}],{fallback:current});
  assert.deepEqual(imported.options,[{id:'only',label:'NEW',value:'42'}]);
  assert.equal(imported.meta.name,'保留项目');assert.equal(imported.timeline.duration,23);assert.equal(imported.timeline.zoom,4);
  assert.equal(imported.audio.source,'none');assert.equal(imported.audio.volume,.25);assert.equal(imported.beat.bpm,168);
  assert.equal(imported.theme.colors.number,'#00ffff');assert.equal(imported.typography.number.family,'Local Digits');
  assert.equal(imported.layout.grid,'2x2');assert.equal(imported.export.quality,'4k');assert.equal(imported.batch.fileNameTemplate,'keep-{index}');
  assert.deepEqual(current,before,'迁移不能修改作为 fallback 的现有项目');
});

test('project JSON normalization is deterministic and validates deep feature settings',()=>{
  const project=createDefaultProject({
    meta:{name:'演示项目'},preview:{view:'carousel',aspect:'9:16',fitMode:'contain'},
    layout:{mode:'carousel',grid:'4x4',spacing:30,carouselInterval:1.5},
    audio:{source:'custom',name:'mix.flac',mimeType:'audio/flac',volume:.7,trimStart:1,trimEnd:8,loop:true,fadeIn:.5,fadeOut:1},
    beat:{enabled:true,bpm:172,offset:.25,analysis:'web-audio',intensity:.9},
    theme:{preset:'custom',colors:{number:'#f0f',text:'rgb(1, 2, 3)',glow:'rgba(2,3,4,.8)',background:'linear-gradient(#000,#102030)',scanline:'#222',glitch:'#0ff'}},
    typography:{number:{family:'My Number',weight:800},text:{family:'My Text',weight:500},fonts:[{id:'font-a',family:'My Number',name:'number.woff2',mimeType:'font/woff2'}]},
    layers:[{id:'title',type:'text',name:'标题',text:'HELLO',position:{x:500,y:200},zIndex:2},{id:'logo',type:'image',name:'Logo',fileName:'logo.webp',mimeType:'image/webp',position:{x:960,y:540},zIndex:1}],
    export:{quality:'4k',aspect:'9:16',fps:165,bitrateMode:'custom',qualityPreset:'maximum',videoBitrate:80000000},
    batch:{fileNameTemplate:'render-{index}',concurrency:8,tasks:[{id:'one',name:'第一项',overrides:{options:[]}}]}
  });
  assert.equal(project.preview.aspect,'9:16');assert.equal(project.layout.mode,'carousel');assert.equal(project.audio.trimStart,1);
  assert.deepEqual(project.layers.map(layer=>layer.id),['title','logo']);assert.equal(project.export.videoBitrate,80000000);
  assert.equal(project.batch.concurrency,1,'浏览器批量编码固定串行以保护内存');
  assert.deepEqual(parseProject(serializeProject(project)),project);
  assert.throws(()=>createDefaultProject({theme:{colors:{number:'url(https://bad.test/x)'}}}),/格式无效/);
  assert.throws(()=>createDefaultProject({layers:[{id:'x',type:'video'}]}),/图层类型/);
  assert.throws(()=>createDefaultProject({timeline:{duration:3},audio:{timelineEnd:4}}),/音轨时间范围.*项目总时长/);
});

test('custom stage durations map continuously to and from the original SIGNAL clock',()=>{
  const original=normalizeTimeline();
  assert.equal(original.duration,ORIGINAL_SIGNAL_DURATION);
  for(let time=0;time<=ORIGINAL_SIGNAL_DURATION;time+=.137)assert.ok(Math.abs(mapProjectTimeToSignalTime(time,original)-time)<1e-9);
  const stages={intro:1,select:2,roll:3,stable:4,glitch:5,exit:6},timeline=normalizeTimeline({stages});
  assert.equal(timeline.duration,21);assert.deepEqual(timeline.stages,stages);
  let cursor=0;
  for(const key of STAGE_KEYS){
    assert.equal(getTimelineStage(cursor+Math.min(.001,timeline.stages[key]/2),timeline).key,key);
    const [referenceStart,referenceEnd]=SIGNAL_REFERENCE_STAGE_BOUNDARIES[key];
    assert.ok(Math.abs(mapProjectTimeToSignalTime(cursor,timeline)-referenceStart)<1e-9);
    assert.ok(Math.abs(mapSignalTimeToProjectTime(referenceEnd,timeline)-(cursor+timeline.stages[key]))<1e-8);
    cursor+=timeline.stages[key];
  }
  const scaled=normalizeTimeline({duration:35});assert.ok(Math.abs(scaled.duration-35)<1e-9);
  for(const key of STAGE_KEYS)assert.ok(Math.abs(scaled.stages[key]/DEFAULT_STAGE_DURATIONS[key]-35/ORIGINAL_SIGNAL_DURATION)<1e-9);
});

test('keyframe CRUD keeps stable ids, sorted time and strict timeline bounds',()=>{
  let frames=[];
  frames=addKeyframe(frames,{id:'late',path:'options.ez.value',time:2,value:'20',easing:'Ease In Out'},{duration:4});
  frames=addKeyframe(frames,{id:'early',path:'options.ez.value',time:0,value:'10',easing:'Linear'},{duration:4});
  assert.deepEqual(frames.map(frame=>frame.id),['early','late']);assert.equal(frames[1].easing,'ease-in-out');
  frames=moveKeyframe(frames,'late',1,{duration:4});assert.equal(frames[1].time,1);
  frames=copyKeyframe(frames,'late',{newId:'copy',time:3,timeOffset:0},{duration:4});assert.deepEqual(frames.map(frame=>frame.time),[0,1,3]);
  frames=removeKeyframe(frames,'late',{duration:4});assert.deepEqual(frames.map(frame=>frame.id),['early','copy']);
  assert.throws(()=>moveKeyframe(frames,'copy',5,{duration:4}),/0–4/);
  assert.throws(()=>addKeyframe(frames,{id:'bad',path:'options.x.__proto__.polluted',time:0,value:1}),/不支持/);
  assert.equal(isSupportedKeyframePath('options.ez.position'),true);assert.equal(isSupportedKeyframePath('layers.logo.effects.glow'),true);
});

test('numeric, position and effect tracks interpolate while text tracks switch discretely',()=>{
  assert.equal(easingValue('linear',.25),.25);assert.equal(easingValue('ease-in',.5),.25);assert.equal(easingValue('ease-out',.5),.75);assert.equal(easingValue('ease-in-out',.25),.125);
  const scaleTrack=[{id:'a',path:'options.ez.scale',time:0,value:1,easing:'linear'},{id:'b',path:'options.ez.scale',time:2,value:3,easing:'ease-in'}];
  assert.equal(interpolateKeyframeTrack(scaleTrack,1),1.5);
  const frames=normalizeKeyframes([
    ...scaleTrack,
    {id:'p0',path:'options.ez.position',time:0,value:{x:0,y:10},easing:'linear'},
    {id:'p1',path:'options.ez.position',time:2,value:{x:100,y:30},easing:'linear'},
    {id:'l0',path:'options.ez.label',time:0,value:'EZ',easing:'linear'},
    {id:'l1',path:'options.ez.label',time:2,value:'HARD',easing:'linear'},
    {id:'g0',path:'effects.glitchStrength',time:0,value:0,easing:'linear'},
    {id:'g1',path:'effects.glitchStrength',time:2,value:1,easing:'linear'}
  ],{duration:3});
  const overrides=evaluateKeyframes(frames,1);
  assert.equal(overrides.options.ez.scale,1.5);assert.deepEqual(overrides.options.ez.position,{x:50,y:20});assert.equal(overrides.options.ez.label,'EZ');assert.equal(overrides.effects.glitchStrength,.5);
  const base=createDefaultProject(),applied=applyKeyframes(base,frames,2);
  assert.equal(applied.options.find(option=>option.id==='ez').scale,3);assert.equal(applied.options.find(option=>option.id==='ez').label,'HARD');
});

test('evaluating a project returns one deterministic project clock and reference clock',()=>{
  const project=createDefaultProject({timeline:{duration:10,keyframes:[{id:'opacity',path:'options.at.opacity',time:5,value:0,easing:'linear'},{id:'opacity-end',path:'options.at.opacity',time:10,value:1,easing:'linear'}]}}),evaluated=evaluateProjectAtTime(project,7.5);
  assert.equal(evaluated.projectTime,7.5);assert.equal(evaluated.project.options.find(option=>option.id==='at').opacity,.5);
  assert.ok(evaluated.signalTime>0&&evaluated.signalTime<ORIGINAL_SIGNAL_DURATION);assert.ok(STAGE_KEYS.includes(evaluated.stage.key));
  assert.deepEqual(beatStateAtTime(1,{enabled:false}),{active:false,index:-1,phase:1,strength:0});
  const beat=beatStateAtTime(.5,{enabled:true,bpm:120,offset:.5,intensity:.8});assert.equal(beat.index,0);assert.equal(beat.phase,0);assert.equal(beat.strength,.8);
});

test('share fragments round-trip Unicode but remove local binary references and private paths',()=>{
  const project=createDefaultProject({
    meta:{name:'中文 SIGNAL'},audio:{source:'custom',name:'/Users/alice/私密音乐.flac',mimeType:'audio/flac',assetId:'audio-secret'},
    typography:{fonts:[{id:'private-font',family:'Local Font',name:'C:\\Users\\alice\\font.woff2',mimeType:'font/woff2',assetId:'font-secret'}]},
    layers:[{id:'logo',type:'image',name:'Logo',fileName:'/Users/alice/logo.webp',mimeType:'image/webp',assetId:'image-secret'}],
    timeline:{keyframes:[{id:'logo-x',path:'layers.logo.x',time:1,value:100,easing:'linear'}]}
  });
  project.audio.fileData='DO-NOT-SHARE';project.audio.path='/Users/alice/private.flac';project.layers[0].src='blob:private';
  const safe=sanitizeProjectForShare(project),fragment=encodeShareFragment(project),decoded=decodeShareFragment(fragment);
  assert.equal(decoded.meta.name,'中文 SIGNAL');assert.equal(decoded.audio.name,'私密音乐.flac');assert.equal(decoded.audio.assetId,null);
  assert.equal(decoded.typography.fonts[0].name,'font.woff2');assert.equal(decoded.typography.fonts[0].assetId,null);
  assert.equal(decoded.layers[0].fileName,'logo.webp');assert.equal(decoded.layers[0].assetId,null);
  assert.equal(decoded.timeline.keyframes[0].path,'layers.logo.x');
  assert.equal(JSON.stringify(safe).includes('/Users/alice'),false);assert.equal(JSON.stringify(decoded).includes('DO-NOT-SHARE'),false);
  const short=inspectShareLength(project,{maxLength:100});assert.equal(short.tooLong,true);assert.match(short.message,/JSON/);
  const link=createShareUrl(project,'https://example.test/studio#old',{maxLength:10000});assert.ok(link.url.startsWith('https://example.test/studio#signal=v2.'));
  assert.deepEqual(decodeShareFragment(link.url),decoded);
  assert.throws(()=>decodeShareFragment('#signal=v3.bad'),/不支持/);
});

test('five built-in templates and custom template CRUD are independently reusable',()=>{
  assert.deepEqual(BUILT_IN_TEMPLATES.map(template=>template.name),['原版 SIGNAL','音游成绩','系统启动','身份认证','数字倒计时']);
  assert.equal(BUILT_IN_TEMPLATES.length,5);assert.equal(applyTemplate(BUILT_IN_TEMPLATES[4]).preview.aspect,'9:16');
  const custom=createTemplateFromProject(createDefaultProject(),{id:'mine',name:'我的模板'});
  let list=addCustomTemplate([],custom);assert.equal(list.length,1);
  list=updateCustomTemplate(list,'mine',{name:'改名模板'});assert.equal(list[0].name,'改名模板');
  list=duplicateTemplate(list,'original-signal',{newId:'original-copy',name:'原版副本'});assert.equal(list.length,2);
  const stored=serializeCustomTemplates(list);assert.deepEqual(parseCustomTemplates(stored),list);
  const exported=exportTemplate(list[0]),imported=importTemplate(exported);assert.equal(imported.id,'mine');assert.equal(imported.builtin,false);
  list=deleteCustomTemplate(list,'mine');assert.deepEqual(list.map(template=>template.id),['original-copy']);
  assert.throws(()=>addCustomTemplate(list,{...custom,id:'original-signal'}),/内置|已存在/);
});
