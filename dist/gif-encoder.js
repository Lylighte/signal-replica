const u16=value=>Uint8Array.of(value&255,(value>>>8)&255);

export function lzwEncode(indices,minCodeSize=8){
  const clear=1<<minCodeSize,end=clear+1,bytes=[];let bitBuffer=0,bitCount=0;
  const dictionary=new Map();let nextCode=end+1,codeSize=minCodeSize+1;
  const write=code=>{
    bitBuffer|=code<<bitCount;bitCount+=codeSize;
    while(bitCount>=8){bytes.push(bitBuffer&255);bitBuffer>>>=8;bitCount-=8;}
  };
  const reset=()=>{dictionary.clear();nextCode=end+1;codeSize=minCodeSize+1;};
  write(clear);
  if(indices.length){
    let prefix=indices[0];
    for(let index=1;index<indices.length;index++){
      const symbol=indices[index],key=prefix*256+symbol,known=dictionary.get(key);
      if(known!==undefined){prefix=known;continue;}
      write(prefix);
      // GIF decoders add each dictionary entry one emitted code later.
      if(nextCode===(1<<codeSize)&&codeSize<12)codeSize++;
      if(nextCode<4096)dictionary.set(key,nextCode++);
      else{write(clear);reset();}
      prefix=symbol;
    }
    write(prefix);
    if(nextCode===(1<<codeSize)&&codeSize<12)codeSize++;
  }
  write(end);if(bitCount)bytes.push(bitBuffer&255);
  const blocks=[Uint8Array.of(minCodeSize)];
  for(let offset=0;offset<bytes.length;offset+=255){const block=Uint8Array.from(bytes.slice(offset,offset+255));blocks.push(Uint8Array.of(block.length),block);}
  blocks.push(Uint8Array.of(0));return blocks;
}

// Retain the previous canvas (disposal 1), crop changes, and extend identical holds.
export function createGifEncoder(width,height,palette){
  const bits=Math.log2(palette.length/3);
  if(!Number.isInteger(bits)||bits<1||bits>8)throw new Error('GIF 调色板无效。');
  const chunks=[new TextEncoder().encode('GIF89a'),u16(width),u16(height),Uint8Array.of(0xf0|(bits-1),0,0),palette,Uint8Array.of(0x21,0xff,11),new TextEncoder().encode('NETSCAPE2.0'),Uint8Array.of(3,1,0,0,0)];
  let previous=null,lastControl=null,encodedFrames=0;
  return{
    add(indices,delay){
      if(indices.length!==width*height)throw new Error('GIF 帧尺寸不匹配。');
      let left=width,top=height,right=-1,bottom=-1;
      if(previous){
        for(let i=0;i<indices.length;i++)if(indices[i]!==previous[i]){
          const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
      }else{left=0;top=0;right=width-1;bottom=height-1;}
      if(right<0){
        const held=lastControl[4]+lastControl[5]*256;
        if(held+delay<=65535){lastControl.set(u16(held+delay),4);return;}
        // Keep a valid hold frame if a caller exports a very long still.
        left=0;top=0;right=0;bottom=0;
      }
      const frameWidth=right-left+1,frameHeight=bottom-top+1,pixels=new Uint8Array(frameWidth*frameHeight);
      for(let row=0;row<frameHeight;row++)pixels.set(indices.subarray((top+row)*width+left,(top+row)*width+right+1),row*frameWidth);
      lastControl=Uint8Array.of(0x21,0xf9,4,4,...u16(delay),0,0);
      chunks.push(lastControl,Uint8Array.of(0x2c,...u16(left),...u16(top),...u16(frameWidth),...u16(frameHeight),0),...lzwEncode(pixels,Math.max(2,bits)));
      previous=indices.slice();encodedFrames++;
    },
    finish(){return{blob:new Blob([...chunks,Uint8Array.of(0x3b)],{type:'image/gif'}),encodedFrames};}
  };
}
