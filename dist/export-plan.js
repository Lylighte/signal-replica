import {APP_CONFIG} from './config.js';

export const EXPORT_RESOLUTIONS=Object.freeze({
  '1080p':Object.freeze({
    '16:9':Object.freeze({width:1920,height:1080}),
    '4:3':Object.freeze({width:1440,height:1080}),
    '1:1':Object.freeze({width:1080,height:1080}),
    '9:16':Object.freeze({width:1080,height:1920})
  }),
  '2k':Object.freeze({
    '16:9':Object.freeze({width:2560,height:1440}),
    '4:3':Object.freeze({width:1920,height:1440}),
    '1:1':Object.freeze({width:1440,height:1440}),
    '9:16':Object.freeze({width:1440,height:2560})
  }),
  '4k':Object.freeze({
    '16:9':Object.freeze({width:3840,height:2160}),
    '4:3':Object.freeze({width:2880,height:2160}),
    '1:1':Object.freeze({width:2160,height:2160}),
    '9:16':Object.freeze({width:2160,height:3840})
  })
});
export const MP4_FRAME_RATES=Object.freeze([30,60,90,120,144,165]);
export const MP4_VIDEO_TIMESCALE=633600; // LCM of 57,600 and every supported FPS.
export const MAX_MP4_EXPORT_FRAMES=120_000;
export const MAX_BUFFERED_EXPORT_BYTES=1024*1024*1024;
export const MAX_RASTER_PIXEL_FRAMES=5_000_000_000;
export const VIDEO_QUALITY_PRESETS=Object.freeze({
  compact:Object.freeze({label:'节省空间',factor:.65}),
  balanced:Object.freeze({label:'均衡',factor:1}),
  high:Object.freeze({label:'高画质',factor:1.45}),
  maximum:Object.freeze({label:'最高画质',factor:2})
});

const AVC_LEVELS=Object.freeze([
  Object.freeze({code:'28',maxFrameMacroblocks:8192,maxMacroblocksPerSecond:245760,maxBitrate:25_000_000}),
  Object.freeze({code:'29',maxFrameMacroblocks:8192,maxMacroblocksPerSecond:245760,maxBitrate:62_500_000}),
  Object.freeze({code:'2a',maxFrameMacroblocks:8704,maxMacroblocksPerSecond:522240,maxBitrate:62_500_000}),
  Object.freeze({code:'32',maxFrameMacroblocks:22080,maxMacroblocksPerSecond:589824,maxBitrate:168_750_000}),
  Object.freeze({code:'33',maxFrameMacroblocks:36864,maxMacroblocksPerSecond:983040,maxBitrate:300_000_000}),
  Object.freeze({code:'34',maxFrameMacroblocks:36864,maxMacroblocksPerSecond:2073600,maxBitrate:300_000_000}),
  Object.freeze({code:'3c',maxFrameMacroblocks:139264,maxMacroblocksPerSecond:4177920,maxBitrate:300_000_000}),
  Object.freeze({code:'3d',maxFrameMacroblocks:139264,maxMacroblocksPerSecond:8355840,maxBitrate:600_000_000}),
  Object.freeze({code:'3e',maxFrameMacroblocks:139264,maxMacroblocksPerSecond:16711680,maxBitrate:1_000_000_000})
]);

export function getExportResolution(aspect,quality='1080p'){
  const tier=EXPORT_RESOLUTIONS[quality];
  if(!tier)throw new Error('导出分辨率无效。');
  const resolution=tier[aspect];
  if(!resolution)throw new Error('画面比例无效。');
  return resolution;
}

export function getMp4VideoEncoding({width,height,fps,qualityPreset='balanced',videoBitrate}){
  if(!Object.hasOwn(VIDEO_QUALITY_PRESETS,qualityPreset)&&qualityPreset!=='custom')throw new Error('视频画质预设无效。');
  const pixelScale=width*height/(1920*1080),rateScale=Math.sqrt(fps/30);
  const automatic=12_000_000*pixelScale*rateScale*(VIDEO_QUALITY_PRESETS[qualityPreset]?.factor??1);
  const bitrate=qualityPreset==='custom'?Number(videoBitrate):Math.round(Math.min(300_000_000,automatic));
  if(!Number.isInteger(bitrate)||bitrate<1_000_000||bitrate>1_000_000_000)throw new Error('自定义视频码率需为 1–1000 Mbps 的整数。');
  const frameMacroblocks=Math.ceil(width/16)*Math.ceil(height/16),macroblocksPerSecond=frameMacroblocks*fps;
  const level=AVC_LEVELS.find(item=>frameMacroblocks<=item.maxFrameMacroblocks&&macroblocksPerSecond<=item.maxMacroblocksPerSecond&&bitrate<=item.maxBitrate);
  if(!level)throw new Error('当前分辨率与帧率超出了 H.264 Level 6.2 的范围。');
  return Object.freeze({bitrate,qualityPreset,codec:`avc1.6400${level.code}`,h264Level:Number.parseInt(level.code,16)});
}

export function estimateExportLoad({width,height,fps,duration,bitrate}){
  const frameCount=Math.max(1,Math.ceil(duration*fps-1e-9));
  // Renderer, curve/effect scratch canvases and encoder input can coexist.
  const workingSetBytes=width*height*4*8;
  const estimatedFileBytes=Math.ceil(duration*bitrate/8);
  const estimatedResidentBytes=workingSetBytes+estimatedFileBytes;
  const score=width*height*fps;
  const warning=score>3840*2160*60
    ?'这是超高负载组合。导出会严格使用所选规格，可能耗时很久或因设备内存、显存及编码器限制而失败。'
    :score>2560*1440*60?'这是高负载组合，请确保设备有足够内存并避免同时运行其他图形任务。':'';
  return Object.freeze({frameCount,workingSetBytes,estimatedFileBytes,estimatedResidentBytes,score,warning});
}

export function assertMp4ResourceBudget(load){
  if(!load||!Number.isFinite(load.frameCount)||!Number.isFinite(load.estimatedResidentBytes))throw new Error('无法估算 MP4 导出资源。');
  if(load.frameCount>MAX_MP4_EXPORT_FRAMES)throw new Error(`MP4 单次最多编码 ${MAX_MP4_EXPORT_FRAMES} 帧，请缩短时间范围或降低帧率。`);
  if(load.estimatedResidentBytes>MAX_BUFFERED_EXPORT_BYTES)throw new Error('预计 MP4 导出会占用超过 1 GiB 浏览器内存，请缩短时间范围、降低分辨率/帧率或码率。');
  return load;
}

export function assertRasterResourceBudget({width,height,frameCount,label='图像序列'}){
  if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1||!Number.isInteger(frameCount)||frameCount<1)throw new Error(`${label}资源参数无效。`);
  const pixelFrames=width*height*frameCount;
  if(pixelFrames>MAX_RASTER_PIXEL_FRAMES)throw new Error(`${label}像素总量过高，请缩短时间范围、降低帧率或降低分辨率。`);
  return Object.freeze({width,height,frameCount,pixelFrames});
}

export class ExportCancelledError extends Error{
  constructor(message='导出已取消。'){super(message);this.name='AbortError';}
}

export function throwIfExportCancelled(signal){
  if(signal?.aborted)throw new ExportCancelledError();
}

export function validateExportRange({start,end,allowStill=false,duration=APP_CONFIG.duration}){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||end>duration)
    throw new Error(`时间范围需在 0–${duration.toFixed(2)} 秒内，并且起点不晚于终点。`);
  if(!allowStill&&end===start)throw new Error('MP4 导出的结束时间必须晚于开始时间。');
  return{start,end,duration:end-start};
}

export function createMp4ExportPlan({start,end,fps,aspect,quality='1080p',duration=APP_CONFIG.duration,qualityPreset='balanced',videoBitrate}){
  const range=validateExportRange({start,end,duration});
  if(!MP4_FRAME_RATES.includes(fps))throw new Error(`MP4 帧率仅支持 ${MP4_FRAME_RATES.join('、')} FPS。`);
  const resolution=getExportResolution(aspect,quality),encoding=getMp4VideoEncoding({...resolution,fps,qualityPreset,videoBitrate});
  const frameCount=Math.max(1,Math.ceil(range.duration*fps-1e-9));
  const load=assertMp4ResourceBudget(estimateExportLoad({...resolution,fps,duration:range.duration,bitrate:encoding.bitrate}));
  const frames=Array.from({length:frameCount},(_,index)=>{
    const timestamp=index/fps;
    // Keep encoded samples on a complete CFR grid. The MP4 presentation/edit
    // duration is trimmed to the exact requested end later; shortening the
    // final encoded sample can quantize it to zero in WebCodecs/muxers.
    return{index,sourceTime:start+timestamp,timestamp,duration:1/fps};
  });
  return Object.freeze({
    ...range,...resolution,...encoding,aspect,quality,fps,frameCount,
    load,
    frames:Object.freeze(frames.map(Object.freeze))
  });
}

export function getAudioSampleRange({start,end,sampleRate,totalFrames,duration=APP_CONFIG.duration}){
  validateExportRange({start,end,duration});
  if(!Number.isInteger(sampleRate)||sampleRate<=0)throw new Error('音频采样率无效。');
  const startFrame=Math.round(start*sampleRate),endFrame=Math.round(end*sampleRate);
  if(totalFrames!==undefined){
    if(!Number.isInteger(totalFrames)||totalFrames<0)throw new Error('音频样本总数无效。');
    if(startFrame>totalFrames||endFrame>totalFrames)throw new Error('导出时间超出了原版音轨范围。');
  }
  return Object.freeze({startFrame,endFrame,frameCount:endFrame-startFrame,duration:(endFrame-startFrame)/sampleRate});
}

export async function runCancellableExport({items,onItem,finalize,cleanup=()=>{},signal}){
  try{
    throwIfExportCancelled(signal);
    let index=0;
    for(const item of items){
      throwIfExportCancelled(signal);
      await onItem(item,index++);
      throwIfExportCancelled(signal);
    }
    return await finalize();
  }finally{
    await cleanup();
  }
}
