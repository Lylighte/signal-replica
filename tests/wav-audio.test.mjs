import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {APP_CONFIG} from '../dist/config.js';
import {createWavAudioBufferSlice,parsePcm16Wav} from '../dist/wav-audio.js';

const audioPath=fileURLToPath(new URL('../dist/assets/audio.wav',import.meta.url));

class FakeAudioBuffer{
  constructor({length,numberOfChannels,sampleRate}){
    this.length=length;this.numberOfChannels=numberOfChannels;this.sampleRate=sampleRate;
    this.duration=length/sampleRate;this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));
  }
  getChannelData(channel){return this.channels[channel];}
}

test('bundled soundtrack is stereo 44.1 kHz PCM16 and matches the animation duration',async()=>{
  const bytes=new Uint8Array(await readFile(audioPath)),info=parsePcm16Wav(bytes);
  assert.equal(info.audioFormat,1);assert.equal(info.bitsPerSample,16);
  assert.equal(info.sampleRate,44100);assert.equal(info.numberOfChannels,2);
  assert.equal(info.blockAlign,4);assert.equal(info.byteRate,176400);
  assert.equal(info.totalFrames,772096);assert.equal(info.dataSize,3088384);
  assert.equal(info.totalFrames/info.sampleRate,APP_CONFIG.duration);
});

test('WAV slicing crops non-zero ranges at sample precision and preserves both channels',async()=>{
  const bytes=new Uint8Array(await readFile(audioPath)),info=parsePcm16Wav(bytes),start=.1234,end=.2345;
  const result=createWavAudioBufferSlice(bytes,{start,end,AudioBufferClass:FakeAudioBuffer});
  const expectedStart=Math.round(start*info.sampleRate),expectedEnd=Math.round(end*info.sampleRate),expectedLength=expectedEnd-expectedStart;
  assert.equal(result.startFrame,expectedStart);assert.equal(result.endFrame,expectedEnd);assert.equal(result.frameCount,expectedLength);
  assert.equal(result.audioBuffer.length,expectedLength);assert.equal(result.audioBuffer.numberOfChannels,2);assert.equal(result.audioBuffer.sampleRate,44100);
  assert.equal(result.audioBuffer.duration,expectedLength/44100);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(const channel of [0,1])for(const outputFrame of [0,Math.floor(expectedLength/2),expectedLength-1]){
    const sourceFrame=expectedStart+outputFrame,offset=info.dataOffset+(sourceFrame*2+channel)*2;
    const expected=Math.fround(view.getInt16(offset,true)/32768);
    assert.equal(result.audioBuffer.getChannelData(channel)[outputFrame],expected);
  }
});
