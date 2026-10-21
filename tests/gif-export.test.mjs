import test from 'node:test';
import assert from 'node:assert/strict';
import {createGifEncoder,lzwEncode} from '../dist/gif-encoder.js';
import {buildPalette,indexColors,sampleColors} from '../dist/gif-palette.js';
import {GIF_PROFILES,gifSettings} from '../dist/gif-options.js';

function decodeLzw(minSize,bytes){
  const clear=1<<minSize,end=clear+1,output=[];let offset=0,bits,table,previous;
  const reset=()=>{table=Array.from({length:clear},(_,i)=>[i]);table.push(null,null);bits=minSize+1;previous=null;};
  reset();
  for(;;){
    let code=0;for(let bit=0;bit<bits;bit++){assert.ok(offset<bytes.length*8);code|=((bytes[offset>>>3]>>>(offset&7))&1)<<bit;offset++;}
    if(code===clear){reset();continue;}if(code===end)break;
    const entry=table[code]??(code===table.length&&previous?[...previous,previous[0]]:null);
    assert.ok(entry,'valid LZW dictionary reference');output.push(...entry);
    if(previous&&table.length<4096){table.push([...previous,entry[0]]);if(table.length===(1<<bits)&&bits<12)bits++;}
    previous=entry;
  }
  return Uint8Array.from(output);
}
function decodeBlocks(blocks){return decodeLzw(blocks[0][0],Uint8Array.from(blocks.slice(1,-1).filter((_,i)=>i%2===1).flatMap(b=>Array.from(b))));}
async function readGif(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer()),u16=i=>bytes[i]|bytes[i+1]<<8,width=u16(6),height=u16(8);
  let pos=13+3*(1<<((bytes[10]&7)+1)),delay=0;const canvas=new Uint8Array(width*height),frames=[];
  while(bytes[pos]!==0x3b){
    const marker=bytes[pos++];
    if(marker===0x21){
      const label=bytes[pos++];if(label===0xf9){assert.equal(bytes[pos+1]>>2&7,1);delay=u16(pos+2);}
      while(bytes[pos])pos+=bytes[pos]+1;pos++;continue;
    }
    assert.equal(marker,0x2c);const left=u16(pos),top=u16(pos+2),w=u16(pos+4),h=u16(pos+6);pos+=9;
    const min=bytes[pos++],packed=[];while(bytes[pos]){const size=bytes[pos++];packed.push(...bytes.slice(pos,pos+size));pos+=size;}pos++;
    const pixels=decodeLzw(min,packed);assert.equal(pixels.length,w*h);
    for(let row=0;row<h;row++)canvas.set(pixels.subarray(row*w,(row+1)*w),(top+row)*width+left);
    frames.push({pixels:canvas.slice(),delay,left,top,w,h});
  }
  return frames;
}

test('LZW lower color depths roundtrip through code growth and full dictionary resets',()=>{
  for(const bits of [3,4,5,6,8]){
    let seed=761;const pixels=Uint8Array.from({length:60000},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed>>>16)%2**bits;});
    assert.deepEqual(decodeBlocks(lzwEncode(pixels,bits)),pixels);
    const repeated=new Uint8Array(40000).fill(3);assert.deepEqual(decodeBlocks(lzwEncode(repeated,bits)),repeated);
  }
});
test('cropped frames reconstruct removals and motion; identical frames retain total hold time',async()=>{
  const first=new Uint8Array(100),second=first.slice(),third=first.slice();second[23]=2;third[24]=3;
  const encoder=createGifEncoder(10,10,buildPalette(new Map(),16).palette);
  for(const [pixels,delay] of [[first,8],[first,9],[second,8],[second,8],[third,9]])encoder.add(pixels,delay);
  const result=encoder.finish(),frames=await readGif(result.blob);assert.equal(result.encodedFrames,3);
  assert.deepEqual(frames.map(f=>f.pixels),[first,second,third]);
  assert.deepEqual(frames.map(f=>f.delay),[17,16,9]);
  assert.deepEqual(frames.map(f=>[f.left,f.top,f.w,f.h]),[[0,0,10,10],[3,2,1,1],[3,2,2,1]]);
});
test('a long still is merged without overflowing the GIF delay field',async()=>{
  const encoder=createGifEncoder(1,1,buildPalette(new Map(),16).palette);
  encoder.add(Uint8Array.of(1),40000);encoder.add(Uint8Array.of(1),40000);
  const frames=await readGif(encoder.finish().blob);assert.equal(frames.reduce((sum,f)=>sum+f.delay,0),80000);
});
test('all compression palettes retain black, white and chromatic content in range',()=>{
  const rgba=Uint8Array.from([0,0,0,255,255,255,255,255,255,0,0,255,0,255,255,255]);
  const histogram=new Map();sampleColors(histogram,rgba,1);
  for(const {colors} of Object.values(GIF_PROFILES)){
    const palette=buildPalette(histogram,colors),indices=indexColors(rgba,palette);
    assert.equal(palette.palette.length,colors*3);assert.equal(indices[0],0);assert.equal(indices[1],palette.grayCount-1);
    assert.ok(indices.every(i=>i<colors));assert.notEqual(indices[2],indices[3]);
  }
});
test('default compression reduces size and extreme profile supports a 160 by 90 export',()=>{
  assert.equal(gifSettings().height,240);assert.equal(gifSettings().fps,6);assert.equal(gifSettings().colors,32);
  const extreme=gifSettings('extreme');assert.deepEqual([extreme.height,extreme.fps,extreme.colors],[90,4,16]);
  assert.equal(gifSettings('extreme','240p').height,240);
  assert.throws(()=>gifSettings('invalid'));assert.throws(()=>gifSettings('compact','invalid'));
});
