import {APP_CONFIG} from './config.js';
import {previewIssue} from './editor-data.js';
import {createExportRenderer} from './render-export.js';
import {MAX_BUFFERED_EXPORT_BYTES,assertRasterResourceBudget,getExportResolution} from './export-plan.js';
import {waitForFontsReady} from './font-manager.js';

const MAX_FRAMES=5000;
const crcTable=(()=>{
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
  return table;
})();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function zipHeader(name,crc,size,offset=0,central=false){
  const filename=new TextEncoder().encode(name),header=new Uint8Array(central?46:30),view=new DataView(header.buffer);
  if(central){
    view.setUint32(0,0x02014b50,true);view.setUint16(4,20,true);view.setUint16(6,20,true);view.setUint16(8,0x800,true);
    view.setUint16(10,0,true);view.setUint16(12,0,true);view.setUint16(14,0x21,true);view.setUint32(16,crc,true);view.setUint32(20,size,true);view.setUint32(24,size,true);
    view.setUint16(28,filename.length,true);view.setUint32(42,offset,true);
  }else{
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(8,0,true);view.setUint16(12,0x21,true);
    view.setUint32(14,crc,true);view.setUint32(18,size,true);view.setUint32(22,size,true);view.setUint16(26,filename.length,true);
  }
  return{header,filename};
}
function zipEnd(entries,size,offset){
  if(entries>0xffff||size>0xffffffff||offset>0xffffffff)throw new Error('ZIP 文件超出浏览器支持的大小，请缩短导出时长或降低帧率。');
  const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);
  view.setUint16(8,entries,true);view.setUint16(10,entries,true);view.setUint32(12,size,true);view.setUint32(16,offset,true);return end;
}
function pngBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 编码失败。')),'image/png'));}
const frameName=index=>`frames/frame_${String(index).padStart(6,'0')}.png`;

export async function exportFrameZip({options,design,view,selectedId,aspect,quality='1080p',framing='crop',project,runtimeAssets,duration=project?.timeline?.duration??APP_CONFIG.duration,start,end,fps,onProgress=()=>{},isCancelled=()=>false,signal}){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||end>duration)throw new Error(`时间范围需在 0–${duration.toFixed(2)} 秒内，并且起点不晚于终点。`);
  if(!Number.isInteger(fps)||fps<1||fps>165)throw new Error('帧率需为 1–165 的整数。');
  const resolution=getExportResolution(aspect,quality);
  const issue=previewIssue(design);if(issue)throw new Error(issue);
  const frameCount=Math.floor((end-start)*fps+1e-9)+1;
  if(frameCount>MAX_FRAMES)throw new Error(`单次导出最多 ${MAX_FRAMES} 帧，请缩短时间范围或降低帧率。`);
  assertRasterResourceBudget({...resolution,frameCount,label:'PNG ZIP'});
  if(project?.typography)await waitForFontsReady(document.fonts,{families:[project.typography.number?.family,project.typography.text?.family].filter(Boolean),signal});
  if(isCancelled()||signal?.aborted)return null;
  const frameRenderer=createExportRenderer({design,aspect,quality,framing,project,runtimeAssets}),{canvas:output,width,height}=frameRenderer;
  const rows=[],parts=[];let localOffset=0;
  const addFile=async(name,blob)=>{
    const bytes=new Uint8Array(await blob.arrayBuffer()),crc=crc32(bytes),{header,filename}=zipHeader(name,crc,bytes.length);
    if(localOffset+header.length+filename.length+bytes.length>Math.min(0xffffffff,MAX_BUFFERED_EXPORT_BYTES))throw new Error('ZIP 预计会占用超过 1 GiB 浏览器内存，请缩短导出时长、降低帧率或降低分辨率。');
    parts.push(header,filename,blob);rows.push({name,crc,size:bytes.length,offset:localOffset});localOffset+=header.length+filename.length+bytes.length;
  };
  try{
    for(let index=0;index<frameCount;index++){
      if(isCancelled()||signal?.aborted)return null;
      const time=Math.min(end,start+index/fps);
      frameRenderer.render(time,options,view,selectedId);
      await addFile(frameName(index),await pngBlob(output));
      onProgress(index+1,frameCount,time);
      await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    }
    const manifest={format:'signal-frame-sequence',version:2,frameRate:fps,frameCount,startSeconds:start,endSeconds:Math.min(end,start+(frameCount-1)/fps),sequenceDurationSeconds:frameCount/fps,aspect,framing,quality,resolution:`${width}x${height}`,filenamePattern:'frames/frame_000000.png',project,options,design};
    await addFile('manifest.json',new Blob([JSON.stringify(manifest,null,2)+'\n'],{type:'application/json'}));
    let centralSize=0;
    for(const row of rows){const item=zipHeader(row.name,row.crc,row.size,row.offset,true);parts.push(item.header,item.filename);centralSize+=item.header.length+item.filename.length;}
    parts.push(zipEnd(rows.length,centralSize,localOffset));
    return{blob:new Blob(parts,{type:'application/zip'}),frameCount,width,height,fps,quality};
  }finally{frameRenderer.dispose();}
}
