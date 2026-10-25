import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalDistortion,shakeEnvelope} from '../dist/signal-distortion.js';
import {DEFAULT_DESIGN,validateDesign} from '../dist/design.js';
import {sampleColors,buildPalette,indexColors} from '../dist/gif-palette.js';

test('upward pulse occupies five source frames and peaks on the third',()=>{
  const d={...DEFAULT_DESIGN,shakeStart:1,shakeRepeatStart:10,shakeDuration:5/30,shakeEdge:.25,shakeShoulder:.7};
  assert.deepEqual(Array.from({length:5},(_,i)=>shakeEnvelope(1+(i+.5)/30,d)),[.25,.7,1,.7,.25]);
  assert.equal(shakeEnvelope(.99,d),0);assert.equal(shakeEnvelope(1+5/30,d),0);
});
test('duration stretches the five steps and can disable both pulses',()=>{
  const d=validateDesign({shakeDuration:.5,shakeStart:1,shakeRepeatStart:3,shakeEdge:.25,shakeShoulder:.7});
  for(const start of [1,3])assert.deepEqual(Array.from({length:5},(_,i)=>shakeEnvelope(start+(i+.5)*.1,d)),[.25,.7,1,.7,.25]);
  assert.equal(shakeEnvelope(1.5,d),0);assert.equal(shakeEnvelope(1,{...d,shakeDuration:0}),0);
});
test('adaptive palette preserves complementary colors and neutral endpoints',()=>{
  const pixels=Uint8Array.from([255,0,0,255,0,255,255,255,255,0,255,255,0,255,0,255,0,0,0,255,255,255,255,255]);
  const histogram=new Map();sampleColors(histogram,pixels,1);
  const colors=buildPalette(histogram),indices=indexColors(pixels,colors);
  for(let i=0;i<indices.length;i++)for(let c=0;c<3;c++)assert.equal(colors.palette[indices[i]*3+c],pixels[i*4+c]);
});
test('monochrome exports retain all 256 gray levels',()=>{
  const colors=buildPalette(new Map());assert.equal(colors.grayCount,256);
  for(let i=0;i<256;i++)assert.equal(colors.palette[i*3],i);
});

test('distortion lazily keeps two dynamic buffers, scales pixels and disposes once',t=>{
  class FakeContext{
    constructor(canvas){this.canvas=canvas;this.calls=[];this.globalAlpha=1;this.globalCompositeOperation='source-over';this.filter='none';}
    setTransform(...args){this.calls.push(['setTransform',...args]);}
    drawImage(...args){this.calls.push(['drawImage',...args]);}
    fillRect(...args){this.calls.push(['fillRect',...args]);}
    save(){this.calls.push(['save']);}restore(){this.calls.push(['restore']);}
    beginPath(){this.calls.push(['beginPath']);}rect(...args){this.calls.push(['rect',...args]);}clip(){this.calls.push(['clip']);}
  }
  class FakeCanvas{
    constructor(width=300,height=150){this.width=width;this.height=height;this.context=new FakeContext(this);}
    getContext(){return this.context;}
  }
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new FakeCanvas()};
  t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
  const distortion=new SignalDistortion(100,50),frame=new FakeCanvas(100,50);
  const design={...DEFAULT_DESIGN,chromaticStrength:0,shakeStart:0,shakeRepeatStart:10,shakeDuration:1,shakeAmplitude:10,shakeEdge:.2,shakeShoulder:.6};
  assert.equal(distortion.apply(frame,frame.context,2,design),false);assert.equal(distortion.buffers.length,0);
  assert.equal(distortion.apply(frame,frame.context,.5,design,'none',{pixelScale:2}),true);assert.equal(distortion.buffers.length,2);
  assert.ok(frame.context.calls.some(call=>call[0]==='drawImage'&&call[2]===0&&call[3]===-20));
  const buffers=[...distortion.buffers];frame.width=200;frame.height=80;
  assert.equal(distortion.apply(frame,frame.context,.5,design,'none',1),true);
  assert.deepEqual(distortion.buffers,buffers);assert.deepEqual(buffers.map(canvas=>[canvas.width,canvas.height]),[[200,80],[200,80]]);
  frame.context.calls=[];for(const canvas of buffers)canvas.context.calls=[];
  const chromatic={...design,chromaticStrength:1,chromaticOffset:3,chromaticBandHeight:4,shakeAmplitude:0};
  assert.equal(distortion.apply(frame,frame.context,2,chromatic,'tear',{pixelScale:2}),true);
  assert.ok(buffers[1].context.calls.some(call=>call[0]==='drawImage'&&call[3]===-6));
  assert.ok(buffers[1].context.calls.some(call=>call[0]==='drawImage'&&call[3]===6));
  assert.ok(frame.context.calls.some(call=>call[0]==='rect'&&call[4]===8));
  distortion.dispose();distortion.dispose();assert.equal(distortion.buffers.length,0);assert.deepEqual(buffers.map(canvas=>[canvas.width,canvas.height]),[[1,1],[1,1]]);
  assert.equal(distortion.apply(frame,frame.context,.5,design),false);
});
