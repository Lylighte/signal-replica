import {APP_CONFIG} from './config.js';
import {SignalRenderer,WIDTH,HEIGHT} from './engine.js';
import {previewIssue} from './editor-data.js';
import {sampleColors,buildPalette,indexColors} from './gif-palette.js';
import {createGifEncoder} from './gif-encoder.js';
import {gifSettings} from './gif-options.js';
export {lzwEncode} from './gif-encoder.js';

export const GIF_FPS=gifSettings().fps;
const MAX_FRAMES=5000;
function frameDelay(index,fps){return Math.round((index+1)*100/fps)-Math.round(index*100/fps);}

export async function exportGif({options,design,view,selectedId,aspect,start,end,size,compression,onProgress=()=>{},isCancelled=()=>false}){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||end>APP_CONFIG.duration)throw new Error(`时间范围需在 0–${APP_CONFIG.duration.toFixed(2)} 秒内，并且起点不晚于终点。`);
  const {height,fps,colors:colorCount}=gifSettings(compression,size);
  if(!['16:9','4:3'].includes(aspect))throw new Error('画面比例无效。');
  const issue=previewIssue(design);if(issue)throw new Error(issue);
  const frameCount=Math.floor((end-start)*fps+1e-9)+1;
  if(frameCount>MAX_FRAMES)throw new Error(`单次导出最多 ${MAX_FRAMES} 帧，请缩短时间范围。`);
  const width=Math.round(height*(aspect==='4:3'?4/3:16/9));
  if(width>65535||height>65535)throw new Error('GIF 画面尺寸超出格式支持范围。');
  const source=document.createElement('canvas');source.width=WIDTH;source.height=HEIGHT;
  const renderer=new SignalRenderer(source);renderer.setDesign(design);
  const output=document.createElement('canvas');output.width=width;output.height=height;
  const context=output.getContext('2d',{alpha:false,willReadFrequently:true});
  if(!context)throw new Error('无法创建 GIF 画布。');
  const renderPixels=time=>{
    renderer.render(time,options,view,selectedId);
    if(design.screenCurve==='curved'&&!renderer.curvatureSupported)throw new Error('当前浏览器未能渲染曲面效果，已停止导出。');
    context.fillStyle='#000';context.fillRect(0,0,width,height);
    if(aspect==='4:3')context.drawImage(source,240,0,1440,1080,0,0,width,height);
    else context.drawImage(source,0,0,1920,1080,0,0,width,height);
    return context.getImageData(0,0,width,height).data;
  };
  try{
    const histogram=new Map();
    for(let index=0;index<frameCount;index++){
      if(isCancelled())return null;
      const time=Math.min(end,start+index/fps);
      sampleColors(histogram,renderPixels(time));onProgress(index+1,frameCount,time,'palette');
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    const colors=buildPalette(histogram,colorCount),cache=new Map(),encoder=createGifEncoder(width,height,colors.palette);
    for(let index=0;index<frameCount;index++){
      if(isCancelled())return null;
      const time=Math.min(end,start+index/fps);
      const indices=indexColors(renderPixels(time),colors,cache);
      encoder.add(indices,frameDelay(index,fps));
      onProgress(index+1,frameCount,time,'encode');
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    return{...encoder.finish(),frameCount,width,height,fps,colorCount};
  }finally{source.width=1;source.height=1;output.width=1;output.height=1;}
}
