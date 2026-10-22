import {APP_CONFIG} from './config.js';

export const EXPORT_ASPECTS=Object.freeze({
  '16:9':Object.freeze({width:1920,height:1080}),
  '4:3':Object.freeze({width:1440,height:1080})
});
export const MP4_FRAME_RATES=Object.freeze([30,60]);

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

export function createMp4ExportPlan({start,end,fps,aspect,duration=APP_CONFIG.duration}){
  const range=validateExportRange({start,end,duration});
  if(!MP4_FRAME_RATES.includes(fps))throw new Error('MP4 帧率仅支持 30 或 60 FPS。');
  const resolution=EXPORT_ASPECTS[aspect];
  if(!resolution)throw new Error('画面比例无效。');
  const frameCount=Math.max(1,Math.ceil(range.duration*fps-1e-9));
  const frames=Array.from({length:frameCount},(_,index)=>{
    const timestamp=index/fps;
    // Keep encoded samples on a complete CFR grid. The MP4 presentation/edit
    // duration is trimmed to the exact requested end later; shortening the
    // final encoded sample can quantize it to zero in WebCodecs/muxers.
    return{index,sourceTime:start+timestamp,timestamp,duration:1/fps};
  });
  return Object.freeze({
    ...range,...resolution,aspect,fps,frameCount,
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
