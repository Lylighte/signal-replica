import {createMp4ExportPlan,throwIfExportCancelled,ExportCancelledError} from './export-plan.js';
import {createExportRenderer} from './render-export.js';
import {createWavAudioBufferSlice} from './wav-audio.js';
import {trimMp4Presentation,validateSignalMp4} from './mp4-inspect.js';
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

const videoBitrate=fps=>fps===60?18_000_000:12_000_000;
const videoEncodingConfig=fps=>Object.freeze({
  codec:'avc',bitrate:videoBitrate(fps),keyFrameInterval:2,
  latencyMode:'quality',hardwareAcceleration:'no-preference',
  // Keep the encoder's rate-control hint without forcing the MP4 track to use
  // a coarse 30/60 Hz timescale; a fine muxer timescale is needed to express
  // arbitrary user-selected end times in the video edit list.
  onEncoderConfig:config=>{config.framerate=fps;}
});

function ensureAacEncoder(){
  if(!aacEncoderRegistered){registerAacEncoder();aacEncoderRegistered=true;}
}

function cancelled(error,signal){return signal?.aborted||error?.name==='AbortError';}
function yieldToBrowser(){return new Promise(resolve=>setTimeout(resolve,0));}

export async function checkMp4ExportSupport({start=0,end=1,fps,aspect,includeAudio=true}={}){
  const plan=createMp4ExportPlan({start,end,fps,aspect});
  if(globalThis.isSecureContext===false)throw new Error('MP4 导出需要 HTTPS 或 localhost 安全环境。');
  if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')throw new Error('当前浏览器缺少 WebCodecs H.264 编码接口。请使用最新版 Chrome、Edge 或 Safari。');
  if(typeof document==='undefined')throw new Error('MP4 导出只能在浏览器页面中运行。');
  const videoConfig=videoEncodingConfig(fps);
  let videoSupported=false;
  try{videoSupported=await canEncodeVideo('avc',{width:plan.width,height:plan.height,frameRate:fps,bitrate:videoConfig.bitrate,latencyMode:videoConfig.latencyMode,hardwareAcceleration:videoConfig.hardwareAcceleration});}catch{}
  if(!videoSupported)throw new Error(`当前浏览器或系统无法编码 ${plan.width} × ${plan.height}、${fps} FPS 的 H.264 视频。请尝试最新版 Chrome、Edge 或 Safari，或改用 30 FPS。`);
  if(includeAudio){
    if(typeof Worker==='undefined'||typeof WebAssembly==='undefined'||typeof AudioBuffer==='undefined')throw new Error('当前浏览器缺少生成 AAC 音轨所需的 Worker、WebAssembly 或 Web Audio 支持。可取消“包含原版音轨”后导出静音 MP4。');
    ensureAacEncoder();
    let audioSupported=false;
    try{audioSupported=await canEncodeAudio('aac',{numberOfChannels:2,sampleRate:44100,bitrate:AAC_BITRATE});}catch{}
    if(!audioSupported)throw new Error('当前浏览器无法编码 AAC 音轨。可取消“包含原版音轨”后导出静音 MP4。');
  }
  return Object.freeze({supported:true,width:plan.width,height:plan.height,fps,includeAudio});
}

async function loadAudioSlice({start,end,signal}){
  throwIfExportCancelled(signal);
  const response=await fetch(AUDIO_URL,{signal,cache:'force-cache'});
  if(!response.ok)throw new Error(`原版音轨加载失败（HTTP ${response.status}）。`);
  const bytes=await response.arrayBuffer();
  throwIfExportCancelled(signal);
  return createWavAudioBufferSlice(bytes,{start,end});
}

export async function exportMp4Video({
  options,design,view,selectedId,aspect,start,end,fps,includeAudio=true,
  signal,onProgress=()=>{}
}){
  const plan=createMp4ExportPlan({start,end,fps,aspect});
  onProgress(0,'正在检查 H.264 / AAC 编码兼容性…');
  await checkMp4ExportSupport({start,end,fps,aspect,includeAudio});
  throwIfExportCancelled(signal);

  let audioClip=null;
  if(includeAudio){
    onProgress(2,'正在读取并裁剪原版音轨…');
    audioClip=await loadAudioSlice({start,end,signal});
  }
  throwIfExportCancelled(signal);

  let target=null,output=null,frameRenderer=null,videoSource=null,audioSource=null,cancelPromise=null;
  const cancelOutput=()=>{if(output)cancelPromise??=output.cancel().catch(()=>{});};
  try{
    target=new BufferTarget();output=new Output({format:new Mp4OutputFormat({fastStart:false}),target});
    frameRenderer=createExportRenderer({design,aspect});
    videoSource=new CanvasSource(frameRenderer.canvas,videoEncodingConfig(fps));
    output.addVideoTrack(videoSource);
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

    const buffer=trimMp4Presentation(target.buffer,plan.duration,{copy:false});
    const inspection=validateSignalMp4(buffer,{width:plan.width,height:plan.height,fps:plan.fps,duration:plan.duration,includeAudio});
    if(audioClip){
      const audioTrack=inspection.tracks.find(track=>track.type==='audio');
      if(audioTrack?.timescale!==audioClip.sampleRate)throw new Error(`AAC 音轨采样率不正确：预期 ${audioClip.sampleRate} Hz，实际 ${audioTrack?.timescale??'未知'} Hz。`);
    }
    onProgress(100,'MP4 已通过容器、轨道和时长检查。');
    return{
      blob:new Blob([buffer],{type:'video/mp4'}),frameCount:plan.frameCount,width:plan.width,height:plan.height,
      fps:plan.fps,duration:plan.duration,includeAudio,inspection
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
