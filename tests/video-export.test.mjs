import test from 'node:test';
import assert from 'node:assert/strict';
import {createMp4ExportPlan,getAudioSampleRange,runCancellableExport} from '../dist/export-plan.js';
import {inspectMp4,trimMp4Presentation,validateSignalMp4} from '../dist/mp4-inspect.js';

const encoder=new TextEncoder();
const join=(...parts)=>{const length=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(length);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;};
const u32=value=>{const out=new Uint8Array(4);new DataView(out.buffer).setUint32(0,value,false);return out;};
const i32=value=>{const out=new Uint8Array(4);new DataView(out.buffer).setInt32(0,value,false);return out;};
const text=value=>encoder.encode(value);
const box=(type,...payload)=>{const data=join(...payload);return join(u32(data.length+8),text(type),data);};
const fullBox=(type,version,...payload)=>box(type,new Uint8Array([version,0,0,0]),...payload);
const zeros=count=>new Uint8Array(count);

function mvhd(timescale,duration){
  const body=zeros(96),view=new DataView(body.buffer);view.setUint32(8,timescale,false);view.setUint32(12,duration,false);
  return fullBox('mvhd',0,body);
}
function tkhd(trackId,duration,width=0,height=0){
  const body=zeros(80),view=new DataView(body.buffer);view.setUint32(8,trackId,false);view.setUint32(16,duration,false);
  view.setUint32(72,width*65536,false);view.setUint32(76,height*65536,false);return fullBox('tkhd',0,body);
}
function mdhd(timescale,duration){
  const body=zeros(20),view=new DataView(body.buffer);view.setUint32(8,timescale,false);view.setUint32(12,duration,false);return fullBox('mdhd',0,body);
}
const hdlr=handler=>fullBox('hdlr',0,u32(0),text(handler),zeros(12));
const stsd=codec=>fullBox('stsd',0,u32(1),box(codec,zeros(codec==='avc1'?78:28)));
const stts=entries=>fullBox('stts',0,u32(entries.length),...entries.flatMap(([count,delta])=>[u32(count),u32(delta)]));
const elst=(segmentDuration,mediaTime)=>fullBox('elst',0,u32(1),u32(segmentDuration),i32(mediaTime),u32(0x10000));
function trak({id,type,codec,movieDuration,mediaTimescale,mediaDuration,timing,width=0,height=0,edit}){
  const table=box('stbl',stsd(codec),stts(timing)),media=box('mdia',mdhd(mediaTimescale,mediaDuration),hdlr(type),box('minf',table));
  return box('trak',tkhd(id,movieDuration,width,height),edit?box('edts',elst(edit.duration,edit.mediaTime)):new Uint8Array(),media);
}
function fixture({audio=true,paddedPresentation=false}={}){
  const movieTimescale=60000,duration=2.05,target=Math.round(duration*movieTimescale),padded=Math.round(90*1024/44100*movieTimescale);
  const video=trak({id:1,type:'vide',codec:'avc1',movieDuration:target,mediaTimescale:60000,mediaDuration:123000,timing:[[61,2000],[1,1000]],width:1920,height:1080});
  const audioTrack=trak({id:2,type:'soun',codec:'mp4a',movieDuration:padded,mediaTimescale:44100,mediaDuration:90*1024,timing:[[90,1024]],edit:{duration:padded,mediaTime:1024}});
  const fileDuration=audio&&paddedPresentation?padded:target;
  return{duration,bytes:join(box('ftyp',text('isom'),u32(0),text('isom'),text('mp42')),box('mdat',new Uint8Array([1,2,3])),box('moov',mvhd(movieTimescale,fileDuration),video,...(audio?[audioTrack]:[])))};
}

test('MP4 plan supports only 30/60 FPS and both required resolutions',()=>{
  const wide=createMp4ExportPlan({start:1,end:2,fps:30,aspect:'16:9'}),classic=createMp4ExportPlan({start:0,end:.1,fps:60,aspect:'4:3'});
  assert.deepEqual([wide.width,wide.height,wide.frameCount],[1920,1080,30]);
  assert.deepEqual([classic.width,classic.height,classic.frameCount],[1440,1080,6]);
  for(const fps of [1,24,120])assert.throws(()=>createMp4ExportPlan({start:0,end:1,fps,aspect:'16:9'}),/30.*60/);
  assert.throws(()=>createMp4ExportPlan({start:1,end:1,fps:30,aspect:'16:9'}),/结束时间/);
  assert.throws(()=>createMp4ExportPlan({start:0,end:1,fps:30,aspect:'1:1'}),/比例/);
});

test('MP4 timeline is half-open and gives every encoded sample a full frame duration',()=>{
  const plan=createMp4ExportPlan({start:2,end:3.01,fps:30,aspect:'16:9'});
  assert.equal(plan.frameCount,31);assert.equal(plan.frames[0].sourceTime,2);assert.equal(plan.frames[0].timestamp,0);
  assert.ok(plan.frames.at(-1).sourceTime<3.01);
  assert.ok(plan.frames.every(frame=>Math.abs(frame.duration-1/30)<1e-12));
  assert.ok(plan.frames.at(-1).timestamp<plan.duration);
  assert.ok(plan.frames.at(-1).timestamp+plan.frames.at(-1).duration>=plan.duration);
  const exact=createMp4ExportPlan({start:0,end:1,fps:60,aspect:'16:9'});
  assert.equal(exact.frameCount,60);assert.ok(exact.frames.every(frame=>Math.abs(frame.duration-1/60)<1e-12));
  assert.ok(Math.abs(exact.frames.at(-1).timestamp+exact.frames.at(-1).duration-exact.duration)<1e-12);
});

test('MP4 plan keeps positive full-duration samples for sub-frame and fractional-frame ranges',()=>{
  for(const duration of [.01,.11,.14]){
    const plan=createMp4ExportPlan({start:0,end:duration,fps:30,aspect:'16:9'});
    assert.equal(plan.frameCount,Math.ceil(duration*30-1e-9));
    assert.ok(plan.frames.every(frame=>frame.duration>0&&Math.abs(frame.duration-1/30)<1e-12));
    const last=plan.frames.at(-1);
    assert.ok(last.timestamp<duration);
    assert.ok(last.timestamp+last.duration>=duration);
  }
});

test('audio cropping uses exact sample indices and rebases the clip to zero',()=>{
  const range=getAudioSampleRange({start:.1,end:.333,sampleRate:44100,totalFrames:772096});
  assert.equal(range.startFrame,4410);assert.equal(range.endFrame,14685);assert.equal(range.frameCount,10275);
  assert.equal(range.duration,10275/44100);
  assert.throws(()=>getAudioSampleRange({start:17,end:17.507845804988662,sampleRate:44100,totalFrames:100}),/超出/);
});

test('MP4 inspector reads H.264, AAC, nominal FPS, dimensions and edit duration',()=>{
  const {bytes,duration}=fixture(),info=inspectMp4(bytes);
  assert.deepEqual(info.topLevelBoxes,['ftyp','mdat','moov']);assert.equal(info.fragmented,false);assert.equal(info.duration,duration);
  const video=info.tracks.find(track=>track.type==='video'),audio=info.tracks.find(track=>track.type==='audio');
  assert.equal(video.codec,'avc1');assert.equal(video.nominalRate,30);assert.equal(video.sampleCount,62);assert.deepEqual([video.width,video.height],[1920,1080]);
  assert.equal(audio.codec,'mp4a');assert.equal(audio.sampleCount,90);assert.ok(audio.mediaDurationSeconds>duration);assert.ok(audio.presentationDurationSeconds>duration);
});

test('presentation trim keeps AAC padding but makes container and edit-list duration exact',()=>{
  const {bytes,duration}=fixture({paddedPresentation:true});
  assert.throws(()=>validateSignalMp4(bytes,{width:1920,height:1080,fps:30,duration,includeAudio:true}),/时长/);
  const trimmed=trimMp4Presentation(bytes,duration,{copy:false}),info=validateSignalMp4(trimmed,{width:1920,height:1080,fps:30,duration,includeAudio:true});
  const video=info.tracks.find(track=>track.type==='video'),audio=info.tracks.find(track=>track.type==='audio');
  assert.equal(trimmed.byteLength,bytes.byteLength+36);
  assert.equal(info.duration,duration);assert.equal(video.presentationDurationSeconds,duration);assert.equal(audio.presentationDurationSeconds,duration);assert.ok(audio.mediaDurationSeconds>duration);
});

test('container validation rejects a missing or unexpected audio track',()=>{
  const withAudio=fixture(),withoutAudio=fixture({audio:false});
  assert.throws(()=>validateSignalMp4(withAudio.bytes,{width:1920,height:1080,fps:30,duration:withAudio.duration,includeAudio:false}),/仍包含/);
  assert.throws(()=>validateSignalMp4(withoutAudio.bytes,{width:1920,height:1080,fps:30,duration:withoutAudio.duration,includeAudio:true}),/缺少 AAC/);
  assert.doesNotThrow(()=>validateSignalMp4(withoutAudio.bytes,{width:1920,height:1080,fps:30,duration:withoutAudio.duration,includeAudio:false}));
});

test('cancellation skips finalization and always releases resources',async()=>{
  const controller=new AbortController(),seen=[];let finalized=false,cleaned=false;
  await assert.rejects(runCancellableExport({
    items:[1,2,3],signal:controller.signal,
    onItem:async item=>{seen.push(item);controller.abort();},
    finalize:async()=>{finalized=true;},cleanup:async()=>{cleaned=true;}
  }),error=>error.name==='AbortError');
  assert.deepEqual(seen,[1]);assert.equal(finalized,false);assert.equal(cleaned,true);
});

test('successful cancellable pipeline finalizes before cleanup',async()=>{
  const order=[],result=await runCancellableExport({items:['a','b'],onItem:async item=>order.push(item),finalize:async()=>{order.push('finalize');return 42;},cleanup:async()=>order.push('cleanup')});
  assert.equal(result,42);assert.deepEqual(order,['a','b','finalize','cleanup']);
});
