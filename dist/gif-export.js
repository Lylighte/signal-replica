import {APP_CONFIG} from './config.js';
import {SignalRenderer,WIDTH,HEIGHT} from './engine.js';
import {previewIssue} from './editor-data.js';

export const GIF_FPS=12;
const MAX_FRAMES=5000;
const GIF_SIZES={
  '720p':{height:720},
  '540p':{height:540},
  '360p':{height:360}
};
const u16=value=>Uint8Array.of(value&255,(value>>>8)&255);

function lzwEncode(indices){
  const clear=256,end=257,bytes=[];let bitBuffer=0,bitCount=0;
  const dictionary=new Map();let nextCode=258,codeSize=9;
  const write=code=>{
    bitBuffer|=code<<bitCount;bitCount+=codeSize;
    while(bitCount>=8){bytes.push(bitBuffer&255);bitBuffer>>>=8;bitCount-=8;}
  };
  const reset=()=>{dictionary.clear();nextCode=258;codeSize=9;};
  write(clear);
  if(indices.length){
    let prefix=indices[0];
    for(let index=1;index<indices.length;index++){
      const symbol=indices[index],key=prefix*256+symbol,known=dictionary.get(key);
      if(known!==undefined){prefix=known;continue;}
      write(prefix);
      if(nextCode<4096){dictionary.set(key,nextCode++);if(nextCode===(1<<codeSize)&&codeSize<12)codeSize++;}
      else{write(clear);reset();}
      prefix=symbol;
    }
    write(prefix);
  }
  write(end);if(bitCount)bytes.push(bitBuffer&255);
  const blocks=[Uint8Array.of(8)];
  for(let offset=0;offset<bytes.length;offset+=255){const block=bytes.slice(offset,offset+255);blocks.push(Uint8Array.of(block.length),Uint8Array.from(block));}
  blocks.push(Uint8Array.of(0));return blocks;
}

function makePalette(){
  const palette=new Uint8Array(768);
  for(let value=0;value<256;value++)palette.set([value,value,value],value*3);
  return palette;
}
function graphicsControl(delay){return Uint8Array.of(0x21,0xf9,4,0,u16(delay)[0],u16(delay)[1],0,0);}
function imageDescriptor(width,height){return Uint8Array.of(0x2c,0,0,0,0,...u16(width),...u16(height),0);}
function frameDelay(index){return Math.round((index+1)*100/GIF_FPS)-Math.round(index*100/GIF_FPS);}

export async function exportGif({options,design,view,selectedId,aspect,start,end,size='720p',onProgress=()=>{},isCancelled=()=>false}){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||end>APP_CONFIG.duration)throw new Error(`时间范围需在 0–${APP_CONFIG.duration.toFixed(2)} 秒内，并且起点不晚于终点。`);
  if(!Object.hasOwn(GIF_SIZES,size))throw new Error('GIF 尺寸无效。');
  if(!['16:9','4:3'].includes(aspect))throw new Error('画面比例无效。');
  const issue=previewIssue(design);if(issue)throw new Error(issue);
  const frameCount=Math.floor((end-start)*GIF_FPS+1e-9)+1;
  if(frameCount>MAX_FRAMES)throw new Error(`单次导出最多 ${MAX_FRAMES} 帧，请缩短时间范围。`);
  const height=GIF_SIZES[size].height,width=Math.round(height*(aspect==='4:3'?4/3:16/9));
  if(width>65535||height>65535)throw new Error('GIF 画面尺寸超出格式支持范围。');
  const source=document.createElement('canvas');source.width=WIDTH;source.height=HEIGHT;
  const renderer=new SignalRenderer(source);renderer.setDesign(design);
  const output=document.createElement('canvas');output.width=width;output.height=height;
  const context=output.getContext('2d',{alpha:false,willReadFrequently:true});
  if(!context)throw new Error('无法创建 GIF 画布。');
  const chunks=[new TextEncoder().encode('GIF89a'),u16(width),u16(height),Uint8Array.of(0xf7,0,0),makePalette(),Uint8Array.of(0x21,0xff,11),new TextEncoder().encode('NETSCAPE2.0'),Uint8Array.of(3,1,0,0,0)];
  try{
    for(let index=0;index<frameCount;index++){
      if(isCancelled())return null;
      const time=Math.min(end,start+index/GIF_FPS);
      renderer.render(time,options,view,selectedId);
      if(design.screenCurve==='curved'&&!renderer.curvatureSupported)throw new Error('当前浏览器未能渲染曲面效果，已停止导出。');
      context.fillStyle='#000';context.fillRect(0,0,width,height);
      if(aspect==='4:3')context.drawImage(source,240,0,1440,1080,0,0,width,height);
      else context.drawImage(source,0,0,1920,1080,0,0,width,height);
      const rgba=context.getImageData(0,0,width,height).data,indices=new Uint8Array(width*height);
      for(let pixel=0,offset=0;pixel<indices.length;pixel++,offset+=4)indices[pixel]=Math.round(rgba[offset]*0.2126+rgba[offset+1]*0.7152+rgba[offset+2]*0.0722);
      chunks.push(graphicsControl(frameDelay(index)),imageDescriptor(width,height),...lzwEncode(indices));
      onProgress(index+1,frameCount,time);
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    chunks.push(Uint8Array.of(0x3b));
    const blob=new Blob(chunks,{type:'image/gif'});
    return{blob,frameCount,width,height,fps:GIF_FPS};
  }finally{source.width=1;source.height=1;output.width=1;output.height=1;}
}
