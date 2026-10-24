import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createManagedAudioAsset,
  decodeBrowserAudioFile,
  getAudioPlaybackState,
  inspectBrowserAudioFile,
  normalizeAudioClip,
  renderAudioProjectSegment
} from '../dist/audio-project.js';
import {analyzeBeatGrid,getBeatEffectState,getBeatMarkers,normalizeBeatSync} from '../dist/beat-sync.js';

class FakeAudioBuffer{
  constructor({length,numberOfChannels,sampleRate}){
    this.length=length;this.numberOfChannels=numberOfChannels;this.sampleRate=sampleRate;this.duration=length/sampleRate;
    this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));
  }
  getChannelData(index){return this.channels[index];}
}

const makeBuffer=({length=12,channels=1,sampleRate=4}={})=>{
  const buffer=new FakeAudioBuffer({length,numberOfChannels:channels,sampleRate});
  for(let channel=0;channel<channels;channel++)for(let frame=0;frame<length;frame++)buffer.channels[channel][frame]=(frame+1+channel*20)/100;
  return buffer;
};

test('project audio crops on integer sample boundaries and keeps adjacent export ranges contiguous',()=>{
  const source=makeBuffer({length:12,channels:2,sampleRate:4}),settings={trimStart:.5,trimEnd:2.5,timelineStart:.25};
  const first=renderAudioProjectSegment(source,{start:0,end:1.25,projectDuration:3,settings,AudioBufferClass:FakeAudioBuffer});
  const second=renderAudioProjectSegment(source,{start:1.25,end:2.5,projectDuration:3,settings,AudioBufferClass:FakeAudioBuffer});
  assert.deepEqual([first.startFrame,first.endFrame,first.frameCount],[0,5,5]);
  assert.deepEqual([second.startFrame,second.endFrame,second.frameCount],[5,10,5]);
  assert.deepEqual([...first.audioBuffer.getChannelData(0)],[0,.03,.04,.05,.06].map(Math.fround));
  assert.deepEqual([...second.audioBuffer.getChannelData(0)],[.07,.08,.09,.10,0].map(Math.fround));
  assert.equal(first.endFrame,second.startFrame);
});

test('looping, explicit timeline boundaries, mute and volume are applied deterministically',()=>{
  const source=makeBuffer({length:8,sampleRate:4});
  const looped=renderAudioProjectSegment(source,{
    start:0,end:2,projectDuration:2,AudioBufferClass:FakeAudioBuffer,
    settings:{trimStart:.25,trimEnd:.75,loop:true,timelineStart:.5,timelineEnd:1.75,volume:2}
  });
  assert.deepEqual([...looped.audioBuffer.getChannelData(0)],[0,0,.04,.06,.04,.06,.04,0].map(Math.fround));
  const muted=renderAudioProjectSegment(source,{start:0,end:1,projectDuration:1,AudioBufferClass:FakeAudioBuffer,settings:{muted:true,loop:true}});
  assert.deepEqual([...muted.audioBuffer.getChannelData(0)],[0,0,0,0]);
});

test('fade envelopes reach zero at both clip edges and preview uses the same mapping',()=>{
  const source=new FakeAudioBuffer({length:8,numberOfChannels:1,sampleRate:4});source.channels[0].fill(1);
  const settings={timelineStart:.5,timelineEnd:2,loop:true,fadeIn:.5,fadeOut:.5};
  const rendered=renderAudioProjectSegment(source,{start:0,end:2,projectDuration:2,settings,AudioBufferClass:FakeAudioBuffer});
  assert.deepEqual([...rendered.audioBuffer.getChannelData(0)],[0,0,0,1,1,1,1,0]);
  assert.deepEqual(getAudioPlaybackState(source,.25,settings,{projectDuration:2}),{active:false,sourceTime:null,gain:0});
  assert.deepEqual(getAudioPlaybackState(source,.5,settings,{projectDuration:2}),{active:true,sourceTime:0,gain:0});
  assert.deepEqual(getAudioPlaybackState(source,.75,settings,{projectDuration:2}),{active:true,sourceTime:.25,gain:1});
});

test('audio settings reject invalid crop, volume and project ranges',()=>{
  assert.throws(()=>normalizeAudioClip({trimStart:2,trimEnd:1},{sourceDuration:3}),/裁剪范围/);
  assert.throws(()=>normalizeAudioClip({volume:5},{sourceDuration:3}),/0–400%/);
  assert.throws(()=>normalizeAudioClip({timelineEnd:4},{sourceDuration:3,projectDuration:2}),/项目总时长/);
  assert.throws(()=>renderAudioProjectSegment(makeBuffer(),{start:1,end:1,AudioBufferClass:FakeAudioBuffer}),/结束时间/);
});

test('audio rendering exposes an AbortError and stops before allocating when already cancelled',()=>{
  const controller=new AbortController();controller.abort();
  assert.throws(
    ()=>renderAudioProjectSegment(makeBuffer(),{start:0,end:1,projectDuration:1,signal:controller.signal,AudioBufferClass:FakeAudioBuffer}),
    error=>error.name==='AbortError'&&/已取消/.test(error.message)
  );
});

test('browser decoder reports unsupported files clearly and always closes its temporary context',async()=>{
  assert.throws(()=>inspectBrowserAudioFile({name:'notes.txt',type:'text/plain',size:3,arrayBuffer:async()=>new ArrayBuffer(3)}),/MP3、WAV 或 FLAC/);
  let closes=0;
  class FakeContext{
    decodeAudioData(_bytes,success){queueMicrotask(()=>success(makeBuffer()));}
    async close(){closes++;}
  }
  const file={name:'music.flac',type:'audio/flac',size:8,arrayBuffer:async()=>new ArrayBuffer(8)};
  const decoded=await decodeBrowserAudioFile(file,{AudioContextClass:FakeContext});
  assert.equal(decoded.audioBuffer.length,12);assert.equal(closes,1);
  class BrokenContext{decodeAudioData(_bytes,_success,failure){queueMicrotask(()=>failure(new Error('bad codec')));}async close(){closes++;}}
  await assert.rejects(()=>decodeBrowserAudioFile(file,{AudioContextClass:BrokenContext}),/该格式可能不受当前浏览器支持/);
  assert.equal(closes,2);
});

test('managed audio asset revokes preview URL and closes resources exactly once',async()=>{
  let closes=0,revoked=[];
  class FakeContext{decodeAudioData(_bytes,success){success(makeBuffer());}async close(){closes++;}}
  const URLApi={createObjectURL:()=> 'blob:music',revokeObjectURL:url=>revoked.push(url)};
  const file={name:'music.mp3',type:'audio/mpeg',size:8,arrayBuffer:async()=>new ArrayBuffer(8)};
  const asset=await createManagedAudioAsset(file,{AudioContextClass:FakeContext,URLApi});
  assert.equal(asset.objectUrl,'blob:music');assert.equal(asset.disposed,false);
  await asset.dispose();await asset.dispose();
  assert.equal(asset.disposed,true);assert.deepEqual(revoked,['blob:music']);assert.equal(closes,1);
});

test('beat markers and effect packets are deterministic at arbitrary export times',()=>{
  assert.deepEqual(getBeatMarkers({start:.7,end:2,bpm:120,offset:.25}).map(marker=>marker.time),[.75,1.25,1.75]);
  const peak=getBeatEffectState(.275,{enabled:true,bpm:120,offset:.25,attack:.025,decay:.2,intensity:.8});
  assert.equal(peak.index,0);assert.ok(Math.abs(peak.strength-.8)<1e-9);assert.equal(peak.flash,peak.strength);
  const before=getBeatEffectState(.2,{enabled:true,bpm:120,offset:.25});assert.equal(before.active,false);
  const disabled=getBeatEffectState(1,{enabled:false});assert.equal(disabled.strength,0);
  assert.throws(()=>normalizeBeatSync({bpm:500}),/20–400/);
});

test('optional beat analysis finds a stable synthetic 120 BPM pulse train',()=>{
  const sampleRate=1024,duration=8,source=new FakeAudioBuffer({length:sampleRate*duration,numberOfChannels:1,sampleRate});
  for(let time=.25;time<duration;time+=.5){const frame=Math.round(time*sampleRate);for(let i=0;i<40;i++)source.channels[0][frame+i]=1-i/40;}
  const result=analyzeBeatGrid(source,{start:0,end:duration,minBpm:100,maxBpm:140,hopSize:64});
  assert.ok(Math.abs(result.bpm-120)<=2,`detected ${result.bpm} BPM`);
  assert.ok(Math.abs(result.offset-.25)<.08,`detected offset ${result.offset}`);
  assert.ok(result.confidence>=0&&result.confidence<=1);
});
