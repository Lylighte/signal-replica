import {APP_CONFIG} from './config.js';
import {sampleColors,buildPalette,indexColors} from './gif-palette.js';
import {createGifEncoder} from './gif-encoder.js';
import {gifSettings} from './gif-options.js';
import {assertRasterResourceBudget,getExportResolution} from './export-plan.js';
import {createExportRenderer,resolveRenderResolution} from './render-export.js';
import {waitForFontsReady} from './font-manager.js';
export {lzwEncode} from './gif-encoder.js';

export const GIF_FPS=gifSettings().fps;
const MAX_FRAMES=5000;
function frameDelay(index,fps){return Math.round((index+1)*100/fps)-Math.round(index*100/fps);}
const yieldToBrowser=()=>new Promise(resolve=>typeof requestAnimationFrame==='function'?requestAnimationFrame(()=>resolve()):setTimeout(resolve,0));

export function resolveGifResolution(aspect,height,resolution){
  const reference=getExportResolution(aspect,'1080p');
  const requested=resolution??{width:Math.round(height*reference.width/reference.height),height};
  return resolveRenderResolution(aspect,'1080p',requested);
}

export async function exportGif({
  options,design,view,selectedId,aspect,framing='crop',project,runtimeAssets,
  duration=project?.timeline?.duration??APP_CONFIG.duration,start,end,size,compression,resolution,
  onProgress=()=>{},isCancelled=()=>false,signal
}){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||end>duration)throw new Error(`时间范围需在 0–${duration.toFixed(2)} 秒内，并且起点不晚于终点。`);
  const {height:profileHeight,fps,colors:colorCount}=gifSettings(compression,size);
  const frameCount=Math.floor((end-start)*fps+1e-9)+1;
  if(frameCount>MAX_FRAMES)throw new Error(`单次导出最多 ${MAX_FRAMES} 帧，请缩短时间范围。`);
  const {width,height}=resolveGifResolution(aspect,profileHeight,resolution);
  if(width>65535||height>65535)throw new Error('GIF 画面尺寸超出格式支持范围。');
  assertRasterResourceBudget({width,height,frameCount,label:'GIF'});
  const cancelled=()=>signal?.aborted||isCancelled();
  if(cancelled())return null;
  if(project?.typography)await waitForFontsReady(document.fonts,{families:[project.typography.number?.family,project.typography.text?.family].filter(Boolean),signal});
  if(cancelled())return null;
  const frameRenderer=createExportRenderer({design,aspect,resolution:{width,height},framing,project,runtimeAssets});
  try{
    const context=frameRenderer.canvas.getContext('2d',{alpha:false,willReadFrequently:true});
    if(!context)throw new Error('无法创建 GIF 画布。');
    const renderPixels=time=>{frameRenderer.render(time,options,view,selectedId);return context.getImageData(0,0,width,height).data;};
    const histogram=new Map();
    for(let index=0;index<frameCount;index++){
      if(cancelled())return null;
      const time=Math.min(end,start+index/fps);
      sampleColors(histogram,renderPixels(time));onProgress(index+1,frameCount,time,'palette');
      await yieldToBrowser();
    }
    const colors=buildPalette(histogram,colorCount),cache=new Map(),encoder=createGifEncoder(width,height,colors.palette);
    for(let index=0;index<frameCount;index++){
      if(cancelled())return null;
      const time=Math.min(end,start+index/fps);
      const indices=indexColors(renderPixels(time),colors,cache);
      encoder.add(indices,frameDelay(index,fps));
      onProgress(index+1,frameCount,time,'encode');
      await yieldToBrowser();
    }
    if(cancelled())return null;
    return{...encoder.finish(),frameCount,width,height,fps,colorCount};
  }finally{frameRenderer.dispose();}
}
