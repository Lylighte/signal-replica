import {getAudioSampleRange} from './export-plan.js';

const fourCc=(bytes,offset)=>String.fromCharCode(bytes[offset],bytes[offset+1],bytes[offset+2],bytes[offset+3]);

export function parsePcm16Wav(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<44||fourCc(bytes,0)!=='RIFF'||fourCc(bytes,8)!=='WAVE')throw new Error('原版音轨不是有效的 WAV 文件。');
  let format=null,dataOffset=-1,dataSize=0,cursor=12;
  while(cursor+8<=bytes.length){
    const type=fourCc(bytes,cursor),size=view.getUint32(cursor+4,true),start=cursor+8,end=start+size;
    if(end>bytes.length)throw new Error(`WAV ${type} 数据不完整。`);
    if(type==='fmt '){
      if(size<16)throw new Error('WAV fmt 数据不完整。');
      format={audioFormat:view.getUint16(start,true),numberOfChannels:view.getUint16(start+2,true),sampleRate:view.getUint32(start+4,true),byteRate:view.getUint32(start+8,true),blockAlign:view.getUint16(start+12,true),bitsPerSample:view.getUint16(start+14,true)};
    }else if(type==='data'&&dataOffset<0){dataOffset=start;dataSize=size;}
    cursor=end+(size&1);
  }
  if(!format||dataOffset<0)throw new Error('WAV 缺少 fmt 或 data 区块。');
  if(format.audioFormat!==1||format.bitsPerSample!==16)throw new Error('原版音轨必须是 16-bit PCM WAV。');
  if(format.numberOfChannels<1||format.numberOfChannels>2)throw new Error('原版音轨声道数不受支持。');
  const expectedAlign=format.numberOfChannels*2;
  if(format.blockAlign!==expectedAlign||format.byteRate!==format.sampleRate*expectedAlign||dataSize%expectedAlign!==0)throw new Error('WAV 音频布局无效。');
  return Object.freeze({...format,dataOffset,dataSize,totalFrames:dataSize/expectedAlign});
}

export function createWavAudioBufferSlice(input,{start,end,AudioBufferClass=globalThis.AudioBuffer}={}){
  if(typeof AudioBufferClass!=='function')throw new Error('当前浏览器缺少 Web Audio AudioBuffer，无法加入原版音轨。');
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),info=parsePcm16Wav(bytes);
  const range=getAudioSampleRange({start,end,sampleRate:info.sampleRate,totalFrames:info.totalFrames});
  const audioBuffer=new AudioBufferClass({length:range.frameCount,numberOfChannels:info.numberOfChannels,sampleRate:info.sampleRate});
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let channel=0;channel<info.numberOfChannels;channel++){
    const output=audioBuffer.getChannelData(channel);
    let offset=info.dataOffset+(range.startFrame*info.numberOfChannels+channel)*2;
    for(let frame=0;frame<range.frameCount;frame++,offset+=info.blockAlign)output[frame]=view.getInt16(offset,true)/32768;
  }
  return Object.freeze({audioBuffer,...range,sampleRate:info.sampleRate,numberOfChannels:info.numberOfChannels,totalFrames:info.totalFrames});
}
