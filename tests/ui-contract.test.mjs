import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const studio=await readFile(new URL('../dist/studio.js',import.meta.url),'utf8');
const studioFeatures=await readFile(new URL('../dist/studio-features.js',import.meta.url),'utf8');
const styles=await readFile(new URL('../dist/styles.css',import.meta.url),'utf8');
const uiRuntime=`${studio}\n${studioFeatures}`;

const section=(start,end)=>{
  const from=html.indexOf(start),to=html.indexOf(end,from);
  assert.notEqual(from,-1,`missing section start: ${start}`);
  assert.notEqual(to,-1,`missing section end: ${end}`);
  return html.slice(from,to);
};

test('default shell restores the upstream SIGNAL interface',()=>{
  assert.match(html,/<title>SIGNAL<\/title>/);
  assert.match(html,/<span class="wordmark">SIGNAL<span class="wordmark-dot">\.<\/span><\/span>/);
  assert.match(html,/href="https:\/\/github\.com\/Lylighte\/signal-replica"/);
  assert.doesNotMatch(html,/class="studio-mark"/);

  const defaultEditor=section('<aside class="editor"','</aside>');
  for(const expected of ['aria-label="内容编辑"','id="content-panel"','id="option-list"','id="add-option"','id="design-groups"','id="reset-design"','id="advanced-open"'])assert.match(defaultEditor,new RegExp(expected));
  assert.doesNotMatch(defaultEditor,/id="studio-tabs"|data-panel=/);
});

test('advanced Studio controls are in a closed secondary dialog',()=>{
  assert.match(html,/id="advanced-open"[^>]*aria-haspopup="dialog"[^>]*aria-controls="advanced-dialog"[^>]*>高级功能<\/button>/);
  assert.match(html,/id="advanced-open"[^>]*aria-expanded="false"/);
  assert.match(html,/<dialog id="advanced-dialog" class="advanced-dialog" aria-labelledby="advanced-title">/);
  assert.doesNotMatch(html,/<dialog id="advanced-dialog"[^>]*\sopen(?:\s|>)/);

  const advanced=section('<dialog id="advanced-dialog"','<dialog id="frame-export-dialog"');
  assert.match(advanced,/id="advanced-close"/);
  assert.match(advanced,/id="studio-tabs"[^>]*aria-label="高级功能类别"/);
  assert.doesNotMatch(advanced,/data-panel="content-panel"/);
  for(const panel of ['animation','appearance','audio','layers','project'])assert.match(advanced,new RegExp(`data-panel="${panel}-panel"`));
  for(const id of ['display-mode','duration-total','keyframe-track','theme-select','number-font-file','audio-file','beat-subdivision','layers-list','template-select','share-create','batch-add-variants'])assert.match(advanced,new RegExp(`id="${id}"`));

  assert.match(uiRuntime,/advanced-open/);
  assert.match(uiRuntime,/advanced-dialog/);
  assert.match(uiRuntime,/\.show\(\)/);
  assert.doesNotMatch(uiRuntime,/advanced[^\n]*showModal\(\)/i);
  assert.match(uiRuntime,/advanced-close/);
  assert.match(uiRuntime,/event\.key==='Escape'&&advancedDialog\.open/);
  assert.match(styles,/\.advanced-dialog \.editor-heading h2\{font-size:23px;font-weight:500;margin:3px 0 0\}/);
});

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
