import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const studio=await readFile(new URL('../dist/studio.js',import.meta.url),'utf8');

test('export dialog exposes all requested resolutions and MP4 frame rates',()=>{
  for(const quality of ['1080p','2k','4k'])assert.match(html,new RegExp(`<option value="${quality}"`));
  for(const fps of [30,60,90,120,144,165])assert.match(html,new RegExp(`<option value="${fps}"[^>]*>${fps} FPS</option>`));
  assert.match(html,/id="frame-zip-fps"[^>]*max="165"/);
  for(const aspect of ['16:9','4:3','1:1','9:16'])assert.match(html,new RegExp(`<option value="${aspect.replace(':','\\:')}"`));
  for(const format of ['mp4','zip','gif'])assert.match(html,new RegExp(`<option value="${format}"`));
  for(const id of ['frame-gif-compression','frame-gif-size'])assert.match(html,new RegExp(`id="${id}"`));
});

test('combined export dialog has unique controls and one event state machine',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]),duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);
  assert.deepEqual(duplicates,[]);
  assert.equal((studio.match(/function updateFrameExportFormat\(/g)??[]).length,1);
  assert.equal((studio.match(/function updatePlayButton\(/g)??[]).length,1);
  assert.equal((studio.match(/frame-export-cancel'\)\.onclick/g)??[]).length,1);
  assert.doesNotMatch(studio,/frameExportCancelled|frame-format|updateFrameFormat/);
  assert.match(studio,/exportGif\(\{\.\.\.common,compression:settings\.gifCompression,size:settings\.gifSize/);
  assert.match(studio,/project:structuredClone\(state\.project\),runtimeAssets:\{images:layerImages\}/);
});

test('studio routes export quality and derives the tool option limit from app config',()=>{
  assert.match(studio,/quality:\$\('frame-quality'\)\.value/);
  assert.match(studio,/maxItems:APP_CONFIG\.maxOptions/);
});

test('studio exposes functional editors for all project feature groups',()=>{
  for(const id of ['studio-tabs','display-mode','layout-mode','duration-total','keyframe-track','theme-select','number-font-file','audio-file','beat-subdivision','layers-list','template-select','share-create','batch-add-variants'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/layers\.selected\.x/);assert.match(html,/effects\.glitchStrength/);
});

test('preview audio starts enabled while retaining an explicit mute control',()=>{
  assert.match(html,/id="sound"[^>]*aria-pressed="true"[^>]*>声音开启<\/button>/);
  assert.match(html,/<audio id="soundtrack" src="assets\/audio\.wav"/);
  assert.match(studio,/playing:false,sound:true,ready:false/);
  assert.match(studio,/if\(state\.sound\)\{syncAudioToProjectTime/);
});
