import test from 'node:test';
import assert from 'node:assert/strict';
import {BatchExportQueue,buildStoreZip,formatBatchFileName} from '../dist/batch-export.js';
import {FONT_FORMATS,LocalFontManager,inspectFontFile,normalizeTypographyStyles,sanitizeFontMetadata} from '../dist/font-manager.js';
import {createDefaultProject} from '../dist/project-model.js';
import {createProjectRenderState} from '../dist/project-runtime.js';
import {BUILTIN_THEMES,createCanvasColorStyle,importCustomTheme,parseLinearGradient,serializeCustomTheme,validateColorValue} from '../dist/themes.js';

test('theme parser accepts required solid and gradient formats and rejects unsafe paint',()=>{
  assert.equal(BUILTIN_THEMES.length,7);
  assert.equal(validateColorValue('rgba(2,3,4,.8)'),'rgba(2, 3, 4, 0.8)');
  const parsed=parseLinearGradient('linear-gradient(90deg, #000 0%, rgb(1, 2, 3) 100%)');
  assert.equal(parsed.angle,90);assert.deepEqual(parsed.stops.map(stop=>stop.position),[0,1]);
  const calls=[],context={createLinearGradient(...args){calls.push(args);return{addColorStop(offset,color){calls.push([offset,color]);}};}};
  const paint=createCanvasColorStyle(context,'linear-gradient(to right, #000, #fff)',{x:0,y:0,width:100,height:50});
  assert.ok(paint);assert.equal(calls.length,3);
  assert.throws(()=>validateColorValue('url(https://bad.test/x)'),/格式无效/);
  const encoded=serializeCustomTheme({id:'mine',name:'我的主题',colors:BUILTIN_THEMES[0].colors});
  assert.equal(importCustomTheme(encoded).name,'我的主题');
});

test('font helpers validate local formats, sanitize metadata and release loaded faces',async()=>{
  const file={name:'Custom.woff2',type:'font/woff2',size:8,arrayBuffer:async()=>new ArrayBuffer(8)};
  assert.deepEqual(inspectFontFile(file),{name:'Custom.woff2',extension:'woff2',mimeType:FONT_FORMATS.woff2,size:8});
  assert.throws(()=>inspectFontFile({...file,name:'bad.exe'}),/仅支持/);
  assert.equal(normalizeTypographyStyles({number:{weight:800,letterSpacing:2}}).number.weight,800);
  assert.equal(sanitizeFontMetadata([{id:'a',family:'Local',name:'/Users/me/Local.woff2'}])[0].name,'Local.woff2');
  const faces=new Set(),fontSet={add:face=>faces.add(face),delete:face=>faces.delete(face),load:async()=>[{}],ready:Promise.resolve()};
  class FakeFontFace{constructor(family,bytes,options){this.family=family;this.bytes=bytes;this.options=options;}async load(){return this;}}
  const manager=new LocalFontManager({FontFaceClass:FakeFontFace,fontSet}),metadata=await manager.load(file,{family:'Local Number'});
  assert.equal(metadata.family,'Local Number');assert.equal(faces.size,1);await manager.ready();assert.equal(manager.dispose(metadata.id),true);assert.equal(faces.size,0);
});

test('project runtime applies layer, option-effect and disabled beat trigger keyframes deterministically',()=>{
  const project=createDefaultProject({
    layers:[{id:'title',type:'text',text:'SIGNAL',x:0,y:100}],
    beat:{enabled:true,bpm:120,offset:0,intensity:1,attack:.01,decay:.2,flash:false,numberJump:false,rgbSplit:false,shake:false},
    timeline:{duration:2,keyframes:[
      {id:'x0',path:'layers.title.x',time:0,value:0,easing:'linear'},
      {id:'x1',path:'layers.title.x',time:2,value:200,easing:'linear'},
      {id:'g0',path:'effects.glitchStrength',time:0,value:0,easing:'linear'},
      {id:'g1',path:'effects.glitchStrength',time:2,value:1,easing:'linear'}
    ]}
  });
  const frame=createProjectRenderState(project,1);
  assert.equal(frame.project.layers[0].x,100);assert.equal(frame.design.glitchStrength,.5);
  assert.deepEqual({flash:frame.scene.beatEffect.flash,jump:frame.scene.beatEffect.numberJump,rgb:frame.scene.beatEffect.rgbSplit,shake:frame.scene.beatEffect.shake},{flash:0,jump:0,rgb:0,shake:0});
});

test('batch queue formats names, retries failures, packages completed outputs and cancels active work',async()=>{
  assert.equal(formatBatchFileName('signal-{index}-{label}',{index:2,label:'A/B'},{extension:'mp4'}),'signal-2-A-B.mp4');
  let attempts=0;
  const queue=new BatchExportQueue({exporter:async(input,{onProgress})=>{attempts++;onProgress(1,2);if(input.fail&&attempts===1)throw new Error('一次性失败');return{blob:new Blob([input.text??'ok'])};}});
  const failed=queue.addTask({fail:true},{id:'retry',label:'重试'});await queue.run();assert.equal(queue.get(failed.id).status,'failed');
  queue.retryTask(failed.id);await queue.run();assert.equal(queue.get(failed.id).status,'completed');
  const zip=await queue.createZip(),bytes=new Uint8Array(await zip.arrayBuffer());assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  const direct=await buildStoreZip([{name:'a.txt',data:'a'},{name:'a.txt',data:'b'}]);assert.deepEqual(direct.entries.map(entry=>entry.name),['a.txt','a-2.txt']);queue.dispose();

  let announceStart;
  const started=new Promise(resolve=>{announceStart=resolve;});
  const cancellable=new BatchExportQueue({exporter:(_input,{signal})=>new Promise((resolve,reject)=>{announceStart();signal.addEventListener('abort',()=>{const error=new Error('cancel');error.name='AbortError';reject(error);},{once:true});})});
  const task=cancellable.addTask({},{id:'cancel'}),run=cancellable.run();await started;cancellable.cancelTask(task.id);await run;assert.equal(cancellable.get(task.id).status,'cancelled');cancellable.dispose();
});
