import test from 'node:test';
import assert from 'node:assert/strict';
import {shakeEnvelope} from '../dist/signal-distortion.js';
import {DEFAULT_DESIGN,validateDesign} from '../dist/design.js';
import {sampleColors,buildPalette,indexColors} from '../dist/gif-palette.js';

test('upward pulse occupies five source frames and peaks on the third',()=>{
  const d={...DEFAULT_DESIGN,shakeStart:1,shakeRepeatStart:10};
  assert.deepEqual(Array.from({length:5},(_,i)=>shakeEnvelope(1+(i+.5)/30,d)),[.25,.7,1,.7,.25]);
  assert.equal(shakeEnvelope(.99,d),0);assert.equal(shakeEnvelope(1+5/30,d),0);
});
test('duration stretches the five steps and can disable both pulses',()=>{
  const d=validateDesign({shakeDuration:.5,shakeStart:1,shakeRepeatStart:3});
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
