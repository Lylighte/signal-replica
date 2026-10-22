const decoder=new TextDecoder('latin1');

function asBytes(input){
  if(input instanceof ArrayBuffer)return new Uint8Array(input);
  if(ArrayBuffer.isView(input))return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
  throw new TypeError('MP4 数据必须是 ArrayBuffer 或 TypedArray。');
}
function typeAt(bytes,offset){return decoder.decode(bytes.subarray(offset,offset+4));}
function u64(view,offset){
  const value=view.getBigUint64(offset,false);
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('MP4 数值超出安全整数范围。');
  return Number(value);
}
function setU64(view,offset,value){view.setBigUint64(offset,BigInt(value),false);}
function boxesIn(bytes,view,start,end){
  const boxes=[];let cursor=start;
  while(cursor<end){
    if(end-cursor<8)throw new Error('MP4 box 头部不完整。');
    let size=view.getUint32(cursor,false),headerSize=8;
    const type=typeAt(bytes,cursor+4);
    if(size===1){if(end-cursor<16)throw new Error('MP4 大尺寸 box 头部不完整。');size=u64(view,cursor+8);headerSize=16;}
    else if(size===0)size=end-cursor;
    if(size<headerSize||cursor+size>end)throw new Error(`MP4 box ${type} 大小无效。`);
    boxes.push({type,start:cursor,end:cursor+size,size,headerSize,dataStart:cursor+headerSize});cursor+=size;
  }
  return boxes;
}
function childBoxes(bytes,view,box,skip=0){return boxesIn(bytes,view,box.dataStart+skip,box.end);}
const find=(boxes,type)=>boxes.find(box=>box.type===type);
function fullBoxTime(view,box){
  const version=view.getUint8(box.dataStart);
  if(version===0)return{version,timescale:view.getUint32(box.dataStart+12,false),duration:view.getUint32(box.dataStart+16,false)};
  if(version===1)return{version,timescale:view.getUint32(box.dataStart+20,false),duration:u64(view,box.dataStart+24)};
  throw new Error(`${box.type} 使用了不支持的版本 ${version}。`);
}
function movieHeader(view,box){
  const parsed=fullBoxTime(view,box);
  if(!parsed.timescale)throw new Error('MP4 movie timescale 无效。');
  return{...parsed,durationSeconds:parsed.duration/parsed.timescale};
}
function trackHeader(view,box,movieTimescale){
  const version=view.getUint8(box.dataStart);
  let duration;
  if(version===0)duration=view.getUint32(box.dataStart+20,false);
  else if(version===1)duration=u64(view,box.dataStart+28);
  else throw new Error(`tkhd 使用了不支持的版本 ${version}。`);
  return{
    version,duration,durationSeconds:duration/movieTimescale,
    width:view.getUint32(box.end-8,false)/65536,
    height:view.getUint32(box.end-4,false)/65536
  };
}
function editDuration(bytes,view,trak,movieTimescale){
  const edts=find(childBoxes(bytes,view,trak),'edts');if(!edts)return null;
  const elst=find(childBoxes(bytes,view,edts),'elst');if(!elst)return null;
  const version=view.getUint8(elst.dataStart),count=view.getUint32(elst.dataStart+4,false);
  let cursor=elst.dataStart+8,total=0;
  for(let index=0;index<count;index++){
    if(version===0){total+=view.getUint32(cursor,false);cursor+=12;}
    else if(version===1){total+=u64(view,cursor);cursor+=20;}
    else throw new Error(`elst 使用了不支持的版本 ${version}。`);
    if(cursor>elst.end)throw new Error('elst 内容不完整。');
  }
  return total/movieTimescale;
}
function sampleDescription(bytes,view,stsd){
  const count=view.getUint32(stsd.dataStart+4,false),entries=[];let cursor=stsd.dataStart+8;
  for(let index=0;index<count;index++){
    const entry=boxesIn(bytes,view,cursor,stsd.end)[0];
    if(!entry)throw new Error('stsd 样本描述不完整。');
    entries.push(entry.type);cursor=entry.end;
  }
  return entries;
}
function sampleTiming(view,stts,timescale){
  const count=view.getUint32(stts.dataStart+4,false);let cursor=stts.dataStart+8,sampleCount=0,totalUnits=0,nominalDelta=0,largestRun=-1;
  for(let index=0;index<count;index++){
    if(cursor+8>stts.end)throw new Error('stts 内容不完整。');
    const run=view.getUint32(cursor,false),delta=view.getUint32(cursor+4,false);cursor+=8;
    sampleCount+=run;totalUnits+=run*delta;
    if(run>largestRun){largestRun=run;nominalDelta=delta;}
  }
  const durationSeconds=totalUnits/timescale;
  return{sampleCount,totalUnits,durationSeconds,averageRate:durationSeconds?sampleCount/durationSeconds:0,nominalRate:nominalDelta?timescale/nominalDelta:0};
}
function videoEditList(target){
  if(target>0xffffffff)throw new Error('目标时长超出 MP4 v0 edit list 范围。');
  const bytes=new Uint8Array(36),view=new DataView(bytes.buffer);
  const type=(offset,value)=>{for(let index=0;index<4;index++)bytes[offset+index]=value.charCodeAt(index);};
  view.setUint32(0,36,false);type(4,'edts');
  view.setUint32(8,28,false);type(12,'elst');
  view.setUint32(16,0,false); // version 0 + flags
  view.setUint32(20,1,false); // entry count
  view.setUint32(24,target,false); // segment duration in movie timescale
  view.setInt32(28,0,false); // start at the first video sample
  view.setUint32(32,0x00010000,false); // media rate 1.0
  return bytes;
}
function setBoxSize(view,box,size,start=box.start){
  if(box.headerSize===8){
    if(size>0xffffffff)throw new Error(`MP4 box ${box.type} 超出 32-bit 大小范围。`);
    view.setUint32(start,size,false);
  }else setU64(view,start+8,size);
}
function addMissingVideoEditLists(bytes,target){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),topLevel=boxesIn(bytes,view,0,bytes.length);
  const moov=find(topLevel,'moov'),mdat=find(topLevel,'mdat');if(!moov||!mdat)throw new Error('MP4 缺少 moov 或 mdat。');
  const insertions=[];
  for(const trak of childBoxes(bytes,view,moov).filter(box=>box.type==='trak')){
    const children=childBoxes(bytes,view,trak),tkhd=find(children,'tkhd'),mdia=find(children,'mdia');if(!tkhd||!mdia)continue;
    const hdlr=find(childBoxes(bytes,view,mdia),'hdlr');if(!hdlr||typeAt(bytes,hdlr.dataStart+8)!=='vide')continue;
    const edts=find(children,'edts'),elst=edts&&find(childBoxes(bytes,view,edts),'elst');
    if(!elst)insertions.push({offset:tkhd.end,trak,data:videoEditList(target)});
  }
  if(!insertions.length)return bytes;
  // The app deliberately writes moov after mdat (fastStart:false), so growing
  // moov cannot invalidate media chunk offsets. Refuse an unexpected layout.
  if(moov.start<mdat.end)throw new Error('MP4 moov 位于媒体数据之前，无法安全加入精确视频 edit list。');
  insertions.sort((a,b)=>a.offset-b.offset);
  const added=insertions.reduce((sum,item)=>sum+item.data.length,0),expanded=new Uint8Array(bytes.length+added);
  let sourceOffset=0,targetOffset=0;
  for(const insertion of insertions){
    const slice=bytes.subarray(sourceOffset,insertion.offset);expanded.set(slice,targetOffset);targetOffset+=slice.length;
    expanded.set(insertion.data,targetOffset);targetOffset+=insertion.data.length;sourceOffset=insertion.offset;
  }
  expanded.set(bytes.subarray(sourceOffset),targetOffset);
  const expandedView=new DataView(expanded.buffer),shifted=offset=>offset+insertions.reduce((sum,item)=>sum+(item.offset<=offset?item.data.length:0),0);
  setBoxSize(expandedView,moov,moov.size+added,shifted(moov.start));
  for(const insertion of insertions)setBoxSize(expandedView,insertion.trak,insertion.trak.size+insertion.data.length,shifted(insertion.trak.start));
  return expanded;
}
function inspectTrack(bytes,view,trak,movieTimescale){
  const trakChildren=childBoxes(bytes,view,trak),tkhd=find(trakChildren,'tkhd'),mdia=find(trakChildren,'mdia');
  if(!tkhd||!mdia)throw new Error('MP4 track 缺少 tkhd 或 mdia。');
  const mdiaChildren=childBoxes(bytes,view,mdia),mdhd=find(mdiaChildren,'mdhd'),hdlr=find(mdiaChildren,'hdlr'),minf=find(mdiaChildren,'minf');
  if(!mdhd||!hdlr||!minf)throw new Error('MP4 track 媒体信息不完整。');
  const media=fullBoxTime(view,mdhd);if(!media.timescale)throw new Error('MP4 track timescale 无效。');
  const handler=typeAt(bytes,hdlr.dataStart+8),type=handler==='vide'?'video':handler==='soun'?'audio':handler;
  const stbl=find(childBoxes(bytes,view,minf),'stbl');if(!stbl)throw new Error('MP4 track 缺少 stbl。');
  const sampleBoxes=childBoxes(bytes,view,stbl),stsd=find(sampleBoxes,'stsd'),stts=find(sampleBoxes,'stts');
  if(!stsd||!stts)throw new Error('MP4 track 缺少 stsd 或 stts。');
  const header=trackHeader(view,tkhd,movieTimescale),timing=sampleTiming(view,stts,media.timescale),codecs=sampleDescription(bytes,view,stsd);
  return{
    type,handler,codec:codecs[0]??null,codecs,
    timescale:media.timescale,mediaDuration:media.duration,mediaDurationSeconds:media.duration/media.timescale,
    presentationDurationSeconds:editDuration(bytes,view,trak,movieTimescale)??header.durationSeconds,
    sampleCount:timing.sampleCount,sampleDurationSeconds:timing.durationSeconds,
    averageRate:timing.averageRate,nominalRate:timing.nominalRate,width:header.width,height:header.height
  };
}

export function inspectMp4(input){
  const bytes=asBytes(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),topLevel=boxesIn(bytes,view,0,bytes.length);
  const ftyp=find(topLevel,'ftyp'),moov=find(topLevel,'moov'),mdat=find(topLevel,'mdat');
  if(!ftyp||!moov||!mdat)throw new Error('文件不是完整的 MP4：需要 ftyp、moov 和 mdat box。');
  const moovChildren=childBoxes(bytes,view,moov),mvhd=find(moovChildren,'mvhd');if(!mvhd)throw new Error('MP4 缺少 mvhd。');
  const movie=movieHeader(view,mvhd),tracks=moovChildren.filter(box=>box.type==='trak').map(box=>inspectTrack(bytes,view,box,movie.timescale));
  return Object.freeze({
    byteLength:bytes.length,topLevelBoxes:Object.freeze(topLevel.map(box=>box.type)),
    fragmented:topLevel.some(box=>box.type==='moof')||moovChildren.some(box=>box.type==='mvex'),
    duration:movie.durationSeconds,movie:Object.freeze(movie),tracks:Object.freeze(tracks.map(Object.freeze))
  });
}

export function trimMp4Presentation(input,durationSeconds,{copy=true}={}){
  if(!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new Error('MP4 目标时长必须是正数。');
  const original=asBytes(input),originalView=new DataView(original.buffer,original.byteOffset,original.byteLength),originalTop=boxesIn(original,originalView,0,original.length);
  const originalMoov=find(originalTop,'moov');if(!originalMoov)throw new Error('MP4 缺少 moov。');
  const originalMvhd=find(childBoxes(original,originalView,originalMoov),'mvhd');if(!originalMvhd)throw new Error('MP4 缺少 mvhd。');
  const originalMovie=movieHeader(originalView,originalMvhd),target=Math.round(durationSeconds*originalMovie.timescale);
  let bytes=copy||original.byteOffset!==0||original.byteLength!==original.buffer.byteLength?original.slice():original;
  bytes=addMissingVideoEditLists(bytes,target);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),topLevel=boxesIn(bytes,view,0,bytes.length);
  const moov=find(topLevel,'moov');if(!moov)throw new Error('MP4 缺少 moov。');
  const moovChildren=childBoxes(bytes,view,moov),mvhd=find(moovChildren,'mvhd');if(!mvhd)throw new Error('MP4 缺少 mvhd。');
  const movie=movieHeader(view,mvhd),movieVersion=view.getUint8(mvhd.dataStart);
  if(movieVersion===0){if(target>0xffffffff)throw new Error('目标时长超出 MP4 v0 范围。');view.setUint32(mvhd.dataStart+16,target,false);}
  else setU64(view,mvhd.dataStart+24,target);
  for(const trak of moovChildren.filter(box=>box.type==='trak')){
    const trakChildren=childBoxes(bytes,view,trak),tkhd=find(trakChildren,'tkhd'),mdia=find(trakChildren,'mdia');
    if(!tkhd||!mdia)continue;
    const tkhdVersion=view.getUint8(tkhd.dataStart);
    if(tkhdVersion===0){if(target>0xffffffff)throw new Error('目标时长超出 MP4 v0 范围。');view.setUint32(tkhd.dataStart+20,target,false);}
    else if(tkhdVersion===1)setU64(view,tkhd.dataStart+28,target);
    else throw new Error(`tkhd 使用了不支持的版本 ${tkhdVersion}。`);
    const hdlr=find(childBoxes(bytes,view,mdia),'hdlr');
    if(!hdlr||!['soun','vide'].includes(typeAt(bytes,hdlr.dataStart+8)))continue;
    const edts=find(trakChildren,'edts'),elst=edts&&find(childBoxes(bytes,view,edts),'elst');
    if(!elst)throw new Error('音视频轨缺少用于精确裁剪的 edit list。');
    const version=view.getUint8(elst.dataStart),count=view.getUint32(elst.dataStart+4,false),entrySize=version===0?12:version===1?20:0;
    if(!entrySize)throw new Error(`elst 使用了不支持的版本 ${version}。`);
    let cursor=elst.dataStart+8,patched=false;
    for(let index=0;index<count;index++,cursor+=entrySize){
      if(cursor+entrySize>elst.end)throw new Error('elst 内容不完整。');
      const mediaTime=version===0?view.getInt32(cursor+4,false):view.getBigInt64(cursor+8,false);
      if(mediaTime===(version===0?-1:-1n))continue;
      if(version===0){if(target>0xffffffff)throw new Error('目标时长超出 MP4 v0 范围。');view.setUint32(cursor,target,false);}
      else setU64(view,cursor,target);
      patched=true;break;
    }
    if(!patched)throw new Error('音视频轨 edit list 缺少媒体区段。');
  }
  return bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer:bytes.slice().buffer;
}

export function validateSignalMp4(input,{width,height,fps,duration,includeAudio}){
  const result=inspectMp4(input);
  if(result.fragmented)throw new Error('导出的文件意外成为 fragmented MP4。');
  const video=result.tracks.find(track=>track.type==='video');
  if(!video||!['avc1','avc3'].includes(video.codec))throw new Error('MP4 缺少 H.264 视频轨。');
  if(video.width!==width||video.height!==height)throw new Error(`MP4 分辨率不正确：${video.width} × ${video.height}。`);
  const expectedFrames=Math.max(1,Math.ceil(duration*fps-1e-9));
  if(video.sampleCount!==expectedFrames)throw new Error(`MP4 视频帧数不正确：预期 ${expectedFrames}，实际 ${video.sampleCount}。`);
  if(Math.abs(video.nominalRate-fps)>.02)throw new Error(`MP4 帧率不正确：预期 ${fps}，实际 ${video.nominalRate.toFixed(3)}。`);
  const tolerance=Math.max(1e-4,1/(fps*100));
  if(Math.abs(video.presentationDurationSeconds-duration)>tolerance)throw new Error('MP4 视频时长不正确。');
  if(Math.abs(result.duration-duration)>tolerance)throw new Error('MP4 容器时长不正确。');
  const audio=result.tracks.find(track=>track.type==='audio');
  if(includeAudio){
    if(!audio||audio.codec!=='mp4a')throw new Error('MP4 缺少 AAC 音轨。');
    if(Math.abs(audio.presentationDurationSeconds-duration)>Math.max(tolerance,1/audio.timescale))throw new Error('MP4 音轨时长不正确。');
  }else if(audio)throw new Error('未选择音轨，但 MP4 中仍包含音频轨。');
  return result;
}
