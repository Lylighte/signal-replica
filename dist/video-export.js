import {createMp4ExportPlan,MP4_VIDEO_TIMESCALE,throwIfExportCancelled,ExportCancelledError} from './export-plan.js';
import {assertProjectImageAssets,createExportRenderer} from './render-export.js';
import {createWavAudioBufferSlice} from './wav-audio.js';
import {renderAudioProjectSegment} from './audio-project.js';
import {waitForFontsReady} from './font-manager.js';
import {normalizeVideoTimescale,patchAvcLevel,trimMp4Presentation,validateSignalMp4} from './mp4-inspect.js';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
  registerAacEncoder
} from './vendor/mediabunny.js';

const AUDIO_URL=new URL('./assets/audio.wav',import.meta.url);
const AAC_BITRATE=192_000,AAC_PRIMING_SAMPLES=1024;
let aacEncoderRegistered=false;

const videoEncodingConfig=plan=>Object.freeze({
  codec:'avc',fullCodecString:plan.codec,bitrate:plan.bitrate,keyFrameInterval:2,
  latencyMode:'quality',hardwareAcceleration:'no-preference',
  // Mirror the requested CFR in WebCodecs. The same rate is also attached as
  // MP4 track metadata below so rates such as 165 remain exactly representable.
  onEncoderConfig:config=>{config.framerate=plan.fps;}
});

function ensureAacEncoder(){
  if(!aacEncoderRegistered){registerAacEncoder();aacEncoderRegistered=true;}
}

function cancelled(error,signal){return signal?.aborted||error?.name==='AbortError';}
function yieldToBrowser(){return new Promise(resolve=>setTimeout(resolve,0));}

export async function checkMp4ExportSupport({start=0,end=1,fps,aspect,quality='1080p',duration,qualityPreset='balanced',videoBitrate,includeAudio=true,audioBuffer,project,runtimeAssets}={}){
  const plan=createMp4ExportPlan({start,end,fps,aspect,quality,duration,qualityPreset,videoBitrate});
  if(project)assertProjectImageAssets(project,runtimeAssets);
  if(globalThis.isSecureContext===false)throw new Error('MP4 导出需要 HTTPS 或 localhost 安全环境。');
  if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw new Error('当前浏览器缺少 WebCodecs H.264 编码接口。请使用最新版 Chrome、Edge 或 Safari。');
  if(typeof document==='undefined')throw new Error('MP4 导出只能在浏览器页面中运行。');
  const videoConfig=videoEncodingConfig(plan);
  let videoSupported=false;
  try{videoSupported=await canEncodeVideo('avc',{width:plan.width,height:plan.height,frameRate:fps,bitrate:videoConfig.bitrate,fullCodecString:videoConfig.fullCodecString,latencyMode:videoConfig.latencyMode,hardwareAcceleration:videoConfig.hardwareAcceleration});}catch{}
  if(!videoSupported)throw new Error(`当前浏览器或系统无法编码 ${plan.width} × ${plan.height}、${fps} FPS 的 H.264 视频。请降低分辨率或帧率，或使用最新版 Chrome、Edge 或 Safari。`);
  if(includeAudio){
    if(typeof Worker==='undefined'||typeof WebAssembly==='undefined'||typeof AudioBuffer==='undefined')throw new Error('当前浏览器缺少生成 AAC 音轨所需的 Worker、WebAssembly 或 Web Audio 支持。可取消“包含原版音轨”后导出静音 MP4。');
    ensureAacEncoder();
    let audioSupported=false;
    const channels=audioBuffer?.numberOfChannels??2,sampleRate=audioBuffer?.sampleRate??44100;
    if(![1,2].includes(channels))throw new Error('AAC 导出仅支持单声道或双声道音轨。');
    try{audioSupported=await canEncodeAudio('aac',{numberOfChannels:channels,sampleRate,bitrate:AAC_BITRATE});}catch{}
    if(!audioSupported)throw new Error('当前浏览器无法编码 AAC 音轨。可取消“包含原版音轨”后导出静音 MP4。');
  }
  return Object.freeze({supported:true,width:plan.width,height:plan.height,quality:plan.quality,fps,includeAudio});
}

async function loadOriginalAudio({start,end,settings,projectDuration,signal}){
  throwIfExportCancelled(signal);
  const response=await fetch(AUDIO_URL,{signal,cache:'force-cache'});
  if(!response.ok)throw new Error(`原版音轨加载失败（HTTP ${response.status}）。`);
  const bytes=await response.arrayBuffer();
  throwIfExportCancelled(signal);
  const source=createWavAudioBufferSlice(bytes,{start:0,end:17.507845804988662});
  return renderAudioProjectSegment(source.audioBuffer,{start,end,settings,projectDuration,signal});
}

export async function exportMp4Video({
  options,design,view,selectedId,aspect,quality='1080p',start,end,fps,includeAudio=true,
  duration,qualityPreset='balanced',videoBitrate,framing='crop',project,runtimeAssets,
  audioSource:requestedAudioSource,audioBuffer,audioSettings,signal,onProgress=()=>{}
}){
  const projectDuration=duration??project?.timeline?.duration;
  const selectedAudioSource=requestedAudioSource??project?.audio?.source??(includeAudio?'original':'none');
  includeAudio=includeAudio&&selectedAudioSource!=='none';
  const resolvedAudioSettings=audioSettings??project?.audio??{};
  const plan=createMp4ExportPlan({start,end,fps,aspect,quality,duration:projectDuration,qualityPreset,videoBitrate});
  onProgress(0,'正在检查 H.264 / AAC 编码兼容性…');
  await checkMp4ExportSupport({start,end,fps,aspect,quality,duration:projectDuration,qualityPreset,videoBitrate,includeAudio,audioBuffer,project,runtimeAssets});
  throwIfExportCancelled(signal);

  if(project?.typography){
    onProgress(1,'正在等待项目字体加载…');
    await waitForFontsReady(document.fonts,{families:[project.typography.number?.family,project.typography.text?.family].filter(Boolean),signal});
  }

  let audioClip=null;
  if(includeAudio){
    onProgress(2,selectedAudioSource==='custom'?'正在裁剪并处理自定义音轨…':'正在读取并处理原版音轨…');
    if(selectedAudioSource==='custom'){
      if(!audioBuffer)throw new Error('自定义音轨文件尚未载入，请重新选择音频文件。');
      audioClip=renderAudioProjectSegment(audioBuffer,{start,end,settings:resolvedAudioSettings,projectDuration:projectDuration??end,signal});
    }else audioClip=await loadOriginalAudio({start,end,settings:resolvedAudioSettings,projectDuration:projectDuration??17.507845804988662,signal});
  }
  throwIfExportCancelled(signal);

  let target=null,output=null,frameRenderer=null,videoSource=null,audioSource=null,cancelPromise=null;
  const cancelOutput=()=>{if(output)cancelPromise??=output.cancel().catch(()=>{});};
  try{
    target=new BufferTarget();output=new Output({format:new Mp4OutputFormat({fastStart:false}),target});
    frameRenderer=createExportRenderer({design,aspect,quality,framing,project,runtimeAssets});
    videoSource=new CanvasSource(frameRenderer.canvas,videoEncodingConfig(plan));
    output.addVideoTrack(videoSource,{frameRate:plan.fps});
    if(audioClip){
      ensureAacEncoder();
      audioSource=new AudioBufferSource(
        {codec:'aac',bitrate:AAC_BITRATE},
        {startTimestamp:-AAC_PRIMING_SAMPLES/audioClip.sampleRate}
      );
      output.addAudioTrack(audioSource);
    }
    signal?.addEventListener('abort',cancelOutput,{once:true});
    await output.start();
    throwIfExportCancelled(signal);
    const renderStart=includeAudio?5:3,renderSpan=88;
    for(const frame of plan.frames){
      throwIfExportCancelled(signal);
      frameRenderer.render(frame.sourceTime,options,view,selectedId);
      await videoSource.add(frame.timestamp,frame.duration,{keyFrame:frame.index%Math.max(1,fps*2)===0});
      const complete=frame.index+1,percent=renderStart+complete/plan.frameCount*renderSpan;
      onProgress(percent,`正在编码视频 ${complete}/${plan.frameCount} 帧 · ${(frame.sourceTime).toFixed(2)} 秒`);
      if(complete%4===0)await yieldToBrowser();
    }
    videoSource.close();
    throwIfExportCancelled(signal);

    if(audioSource&&audioClip){
      onProgress(94,'正在编码并同步 AAC 音轨…');
      await audioSource.add(audioClip.audioBuffer);
      audioSource.close();
      throwIfExportCancelled(signal);
    }

    onProgress(97,'正在封装并检查 MP4…');
    await output.finalize();
    throwIfExportCancelled(signal);
    if(!target.buffer)throw new Error('MP4 封装没有产生文件数据。');

    const levelAdjusted=patchAvcLevel(target.buffer,plan.h264Level,{copy:false});
    const timeScaled=normalizeVideoTimescale(levelAdjusted,MP4_VIDEO_TIMESCALE,{copy:false});
    const buffer=trimMp4Presentation(timeScaled,plan.duration,{copy:false});
    const inspection=validateSignalMp4(buffer,{width:plan.width,height:plan.height,fps:plan.fps,duration:plan.duration,includeAudio,h264Level:plan.h264Level});
    if(audioClip){
      const audioTrack=inspection.tracks.find(track=>track.type==='audio');
      if(audioTrack?.timescale!==audioClip.sampleRate)throw new Error(`AAC 音轨采样率不正确：预期 ${audioClip.sampleRate} Hz，实际 ${audioTrack?.timescale??'未知'} Hz。`);
    }
    onProgress(100,'MP4 已通过容器、轨道和时长检查。');
    return{
      blob:new Blob([buffer],{type:'video/mp4'}),frameCount:plan.frameCount,width:plan.width,height:plan.height,
      fps:plan.fps,quality:plan.quality,qualityPreset:plan.qualityPreset,bitrate:plan.bitrate,duration:plan.duration,includeAudio,audioSource:includeAudio?selectedAudioSource:'none',inspection
    };
  }catch(error){
    if(output&&output.state!=='finalized')await output.cancel().catch(()=>{});
    if(cancelled(error,signal))throw new ExportCancelledError();
    throw error;
  }finally{
    signal?.removeEventListener('abort',cancelOutput);
    if(cancelPromise)await cancelPromise;
    frameRenderer?.dispose();
    audioClip=null;audioSource=null;videoSource=null;frameRenderer=null;output=null;target=null;
  }
}
