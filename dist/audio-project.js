/**
 * Browser-only project audio helpers.
 *
 * This module deliberately works with the small AudioBuffer interface instead
 * of a specific decoder so decoded MP3/WAV/FLAC files and the bundled WAV can
 * share the exact same export timeline.
 */

export const AUDIO_FILE_ACCEPT='audio/*,.mp3,.wav,.wave,.flac,.m4a,.aac,.ogg,.opus,.webm';
export const MAX_LOCAL_AUDIO_BYTES=128*1024*1024;
export const MAX_DECODED_AUDIO_BYTES=512*1024*1024;
export const DEFAULT_AUDIO_CLIP=Object.freeze({
  volume:1,
  muted:false,
  trimStart:0,
  trimEnd:null,
  timelineStart:0,
  timelineEnd:null,
  loop:false,
  fadeIn:0,
  fadeOut:0
});

const AUDIO_EXTENSIONS=new Set(['mp3','wav','wave','flac','m4a','aac','ogg','oga','opus','webm']);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

function abortError(){
  const error=new Error('音频处理已取消。');
  error.name='AbortError';
  return error;
}

function throwIfAborted(signal){if(signal?.aborted)throw abortError();}

function assertAudioBuffer(audioBuffer){
  if(!audioBuffer||!Number.isInteger(audioBuffer.length)||audioBuffer.length<0||
    !Number.isInteger(audioBuffer.numberOfChannels)||audioBuffer.numberOfChannels<1||
    !Number.isFinite(audioBuffer.sampleRate)||audioBuffer.sampleRate<=0||
    typeof audioBuffer.getChannelData!=='function')throw new Error('音频数据不是有效的 AudioBuffer。');
  for(let channel=0;channel<audioBuffer.numberOfChannels;channel++){
    const data=audioBuffer.getChannelData(channel);
    if(!data||data.length<audioBuffer.length)throw new Error('AudioBuffer 声道数据不完整。');
  }
  if(audioBuffer.length*audioBuffer.numberOfChannels*4>MAX_DECODED_AUDIO_BYTES)throw new Error('解码后的音频超过 512 MiB，请缩短音轨或使用更低采样率/声道数。');
  return audioBuffer;
}

function secondsToFrame(seconds,sampleRate){return Math.round(seconds*sampleRate);}

/** Validate and normalize an imported browser audio file before decoding it. */
export function inspectBrowserAudioFile(file){
  if(!file||typeof file.arrayBuffer!=='function')throw new Error('请选择有效的音频文件。');
  const name=String(file.name||'未命名音频'),type=String(file.type||'').toLowerCase();
  const extension=name.includes('.')?name.split('.').pop().toLowerCase():'';
  const recognizedType=type.startsWith('audio/')||type==='application/ogg'||type==='application/x-flac';
  if(!recognizedType&&!AUDIO_EXTENSIONS.has(extension)){
    throw new Error('请选择浏览器可解码的音频文件（例如 MP3、WAV 或 FLAC）。');
  }
  if(Number.isFinite(file.size)&&file.size<=0)throw new Error('所选音频文件为空。');
  if(Number.isFinite(file.size)&&file.size>MAX_LOCAL_AUDIO_BYTES)throw new Error('单个音频文件不能超过 128 MiB。');
  return Object.freeze({name,type:type||'application/octet-stream',extension,size:Number(file.size)||0});
}

function createAudioContext(AudioContextClass){
  const Context=AudioContextClass||globalThis.AudioContext||globalThis.webkitAudioContext;
  if(typeof Context!=='function')throw new Error('当前浏览器缺少 Web Audio 解码能力，无法导入自定义音乐。');
  return new Context();
}

async function decodeWithContext(context,arrayBuffer){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const done=value=>{if(!settled){settled=true;resolve(value);}};
    const fail=error=>{if(!settled){settled=true;reject(error);}};
    try{
      const result=context.decodeAudioData(arrayBuffer.slice(0),done,fail);
      if(result&&typeof result.then==='function')result.then(done,fail);
    }catch(error){fail(error);}
  });
}

/**
 * Decode a user-selected audio file and close the temporary decoder context.
 * The returned AudioBuffer remains usable by a different AudioContext and by
 * the browser-side AAC encoder after the decoding context has closed.
 */
export async function decodeBrowserAudioFile(file,{AudioContextClass,signal}={}){
  const metadata=inspectBrowserAudioFile(file);
  throwIfAborted(signal);
  const context=createAudioContext(AudioContextClass);
  try{
    const encoded=await file.arrayBuffer();
    throwIfAborted(signal);
    let audioBuffer;
    try{audioBuffer=await decodeWithContext(context,encoded);}
    catch(error){throw new Error(`无法解码“${metadata.name}”。该格式可能不受当前浏览器支持，或文件已经损坏。`,{cause:error});}
    throwIfAborted(signal);
    assertAudioBuffer(audioBuffer);
    return Object.freeze({audioBuffer,metadata,duration:audioBuffer.duration??audioBuffer.length/audioBuffer.sampleRate});
  }finally{
    if(typeof context.close==='function')await Promise.resolve(context.close()).catch(()=>{});
  }
}

/**
 * Load a file for preview and export. dispose() revokes the preview URL and
 * closes the owned decoding context; it is idempotent.
 */
export async function createManagedAudioAsset(file,{AudioContextClass,audioContext,URLApi=globalThis.URL,signal}={}){
  const metadata=inspectBrowserAudioFile(file);
  throwIfAborted(signal);
  const context=audioContext||createAudioContext(AudioContextClass),ownsContext=!audioContext;
  let objectUrl=null,disposed=false;
  try{
    if(URLApi&&typeof URLApi.createObjectURL==='function')objectUrl=URLApi.createObjectURL(file);
    const encoded=await file.arrayBuffer();
    throwIfAborted(signal);
    let audioBuffer;
    try{audioBuffer=await decodeWithContext(context,encoded);}
    catch(error){throw new Error(`无法解码“${metadata.name}”。该格式可能不受当前浏览器支持，或文件已经损坏。`,{cause:error});}
    throwIfAborted(signal);
    assertAudioBuffer(audioBuffer);
    const dispose=async()=>{
      if(disposed)return;
      disposed=true;
      if(objectUrl&&URLApi&&typeof URLApi.revokeObjectURL==='function')URLApi.revokeObjectURL(objectUrl);
      objectUrl=null;
      if(ownsContext&&typeof context.close==='function')await Promise.resolve(context.close()).catch(()=>{});
    };
    return{audioBuffer,metadata,objectUrl,duration:audioBuffer.duration??audioBuffer.length/audioBuffer.sampleRate,dispose,get disposed(){return disposed;}};
  }catch(error){
    if(objectUrl&&URLApi&&typeof URLApi.revokeObjectURL==='function')URLApi.revokeObjectURL(objectUrl);
    if(ownsContext&&typeof context.close==='function')await Promise.resolve(context.close()).catch(()=>{});
    throw error;
  }
}

/** Normalize clip settings while preserving a sample-exact source boundary. */
export function normalizeAudioClip(settings={}, {sourceDuration=Infinity,projectDuration=Infinity}={}){
  const sourceLength=finite(sourceDuration,Infinity);
  if(sourceLength<=0)throw new Error('音轨时长必须大于 0 秒。');
  const trimStart=finite(hasOwn(settings,'trimStart')?settings.trimStart:settings.cropStart,DEFAULT_AUDIO_CLIP.trimStart);
  const rawTrimEnd=hasOwn(settings,'trimEnd')?settings.trimEnd:settings.cropEnd;
  const trimEnd=rawTrimEnd===null||rawTrimEnd===undefined||rawTrimEnd===''?sourceLength:finite(rawTrimEnd,NaN);
  const timelineStart=finite(hasOwn(settings,'timelineStart')?settings.timelineStart:settings.startTime,0);
  const rawTimelineEnd=hasOwn(settings,'timelineEnd')?settings.timelineEnd:settings.endTime;
  const timelineEnd=rawTimelineEnd===null||rawTimelineEnd===undefined||rawTimelineEnd===''?null:finite(rawTimelineEnd,NaN);
  const volume=finite(settings.volume,1),fadeIn=finite(settings.fadeIn,0),fadeOut=finite(settings.fadeOut,0);
  if(!Number.isFinite(trimStart)||trimStart<0||!Number.isFinite(trimEnd)||trimEnd<=trimStart||trimEnd>sourceLength+1e-9)
    throw new Error(`音轨裁剪范围需在 0–${Number.isFinite(sourceLength)?sourceLength.toFixed(3):'音轨末尾'} 秒内，且结束时间晚于开始时间。`);
  if(!Number.isFinite(timelineStart)||timelineStart<0)throw new Error('音轨在项目中的开始时间不能小于 0 秒。');
  if(timelineEnd!==null&&(!Number.isFinite(timelineEnd)||timelineEnd<=timelineStart))throw new Error('音轨在项目中的结束时间必须晚于开始时间。');
  if(Number.isFinite(projectDuration)&&(timelineStart>projectDuration+1e-9||(timelineEnd!==null&&timelineEnd>projectDuration+1e-9)))
    throw new Error('音轨时间范围超出了项目总时长。');
  if(!Number.isFinite(volume)||volume<0||volume>4)throw new Error('音量需在 0–400% 之间。');
  if(!Number.isFinite(fadeIn)||fadeIn<0||!Number.isFinite(fadeOut)||fadeOut<0)throw new Error('淡入淡出时长不能小于 0 秒。');
  return Object.freeze({
    volume,
    muted:Boolean(settings.muted),
    trimStart,
    trimEnd,
    timelineStart,
    timelineEnd,
    loop:Boolean(settings.loop),
    fadeIn,
    fadeOut
  });
}

function getFrameClipPlan(audioBuffer,settings,projectDuration){
  const source=assertAudioBuffer(audioBuffer),sampleRate=source.sampleRate;
  const clip=normalizeAudioClip(settings,{sourceDuration:source.length/sampleRate,projectDuration});
  const trimStartFrame=clamp(secondsToFrame(clip.trimStart,sampleRate),0,source.length);
  const trimEndFrame=clamp(secondsToFrame(clip.trimEnd,sampleRate),trimStartFrame,source.length);
  const clipFrameCount=trimEndFrame-trimStartFrame;
  if(clipFrameCount<1)throw new Error('音轨裁剪后没有可用采样。');
  const timelineStartFrame=secondsToFrame(clip.timelineStart,sampleRate);
  const naturalEndFrame=timelineStartFrame+clipFrameCount;
  let timelineEndFrame=clip.timelineEnd===null?null:secondsToFrame(clip.timelineEnd,sampleRate);
  if(timelineEndFrame===null&&!clip.loop)timelineEndFrame=naturalEndFrame;
  if(timelineEndFrame===null&&Number.isFinite(projectDuration))timelineEndFrame=secondsToFrame(projectDuration,sampleRate);
  if(!clip.loop&&timelineEndFrame!==null)timelineEndFrame=Math.min(timelineEndFrame,naturalEndFrame);
  return{source,sampleRate,clip,trimStartFrame,trimEndFrame,clipFrameCount,timelineStartFrame,timelineEndFrame,
    fadeInFrames:secondsToFrame(clip.fadeIn,sampleRate),fadeOutFrames:secondsToFrame(clip.fadeOut,sampleRate)};
}

function frameGain(plan,globalFrame){
  const {clip,timelineStartFrame,timelineEndFrame,fadeInFrames,fadeOutFrames}=plan;
  if(clip.muted||clip.volume===0)return 0;
  let gain=clip.volume;
  const localFrame=globalFrame-timelineStartFrame;
  if(fadeInFrames>0&&localFrame<fadeInFrames){
    gain*=fadeInFrames===1?0:clamp(localFrame/(fadeInFrames-1),0,1);
  }
  if(fadeOutFrames>0&&timelineEndFrame!==null){
    const remaining=timelineEndFrame-1-globalFrame;
    if(remaining<fadeOutFrames)gain*=fadeOutFrames===1?0:clamp(remaining/(fadeOutFrames-1),0,1);
  }
  return gain;
}

/**
 * Resolve project time to source time and gain. Preview playback uses this
 * exact mapping; export uses the integer-frame version below.
 */
export function getAudioPlaybackState(audioBuffer,projectTime,settings={}, {projectDuration=Infinity}={}){
  if(!Number.isFinite(projectTime)||projectTime<0)throw new Error('项目播放时间无效。');
  const plan=getFrameClipPlan(audioBuffer,settings,projectDuration),globalFrame=secondsToFrame(projectTime,plan.sampleRate);
  const localFrame=globalFrame-plan.timelineStartFrame;
  if(localFrame<0||(plan.timelineEndFrame!==null&&globalFrame>=plan.timelineEndFrame)||(!plan.clip.loop&&localFrame>=plan.clipFrameCount))
    return Object.freeze({active:false,sourceTime:null,gain:0});
  const sourceFrame=plan.trimStartFrame+(plan.clip.loop?localFrame%plan.clipFrameCount:localFrame);
  return Object.freeze({active:true,sourceTime:sourceFrame/plan.sampleRate,gain:frameGain(plan,globalFrame)});
}

/**
 * Render an exact PCM segment for an export interval. The output length is
 * round(end*sampleRate)-round(start*sampleRate), so independently rendered
 * adjacent ranges meet on the same sample without overlaps or gaps.
 */
export function renderAudioProjectSegment(audioBuffer,{
  start=0,end,settings={},projectDuration=end,AudioBufferClass=globalThis.AudioBuffer,signal,onProgress=()=>{}
}={}){
  const source=assertAudioBuffer(audioBuffer);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error('导出音频的结束时间必须晚于开始时间。');
  if(Number.isFinite(projectDuration)&&end>projectDuration+1e-9)throw new Error('导出音频范围超出了项目总时长。');
  if(typeof AudioBufferClass!=='function')throw new Error('当前浏览器缺少 AudioBuffer，无法生成导出音轨。');
  throwIfAborted(signal);
  const plan=getFrameClipPlan(source,settings,projectDuration);
  const startFrame=secondsToFrame(start,plan.sampleRate),endFrame=secondsToFrame(end,plan.sampleRate),frameCount=endFrame-startFrame;
  if(frameCount<1)throw new Error('导出音频范围不足一个采样。');
  const output=new AudioBufferClass({length:frameCount,numberOfChannels:source.numberOfChannels,sampleRate:plan.sampleRate});
  const sourceChannels=Array.from({length:source.numberOfChannels},(_,channel)=>source.getChannelData(channel));
  const outputChannels=Array.from({length:source.numberOfChannels},(_,channel)=>output.getChannelData(channel));
  const chunkSize=16384;
  for(let outputFrame=0;outputFrame<frameCount;outputFrame++){
    if(outputFrame%chunkSize===0){throwIfAborted(signal);onProgress(outputFrame/frameCount);}
    const globalFrame=startFrame+outputFrame,localFrame=globalFrame-plan.timelineStartFrame;
    if(localFrame<0||(plan.timelineEndFrame!==null&&globalFrame>=plan.timelineEndFrame)||(!plan.clip.loop&&localFrame>=plan.clipFrameCount))continue;
    const sourceFrame=plan.trimStartFrame+(plan.clip.loop?localFrame%plan.clipFrameCount:localFrame),gain=frameGain(plan,globalFrame);
    if(gain===0)continue;
    for(let channel=0;channel<source.numberOfChannels;channel++){
      outputChannels[channel][outputFrame]=clamp(sourceChannels[channel][sourceFrame]*gain,-1,1);
    }
  }
  throwIfAborted(signal);onProgress(1);
  return Object.freeze({
    audioBuffer:output,
    startFrame,
    endFrame,
    frameCount,
    sampleRate:plan.sampleRate,
    numberOfChannels:source.numberOfChannels,
    duration:frameCount/plan.sampleRate,
    clip:plan.clip
  });
}

