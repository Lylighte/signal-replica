import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBatchExportInput} from '../dist/batch-export.js';
import {createDefaultProject} from '../dist/project-model.js';
import {createLayerListButton} from '../dist/studio-features.js';

test('layer list renders an untrusted name as text instead of HTML',()=>{
  const created=[];
  class FakeElement{
    constructor(tagName){this.tagName=tagName;this.children=[];this.textContent='';created.push(this);}
    set innerHTML(_value){throw new Error('unsafe innerHTML assignment');}
    replaceChildren(...children){this.children=children;}
  }
  const documentRef={createElement:tagName=>new FakeElement(tagName)};
  let clicks=0;
  const attack='<img src=x onerror="globalThis.pwned=true">';
  const button=createLayerListButton({type:'text',name:attack,zIndex:7},{selected:true,onSelect:()=>clicks++,documentRef});
  assert.deepEqual(created.map(element=>element.tagName),['button','span','span']);
  assert.equal(button.className,'layer-item is-selected');
  assert.equal(button.children[0].textContent,`T · ${attack}`);
  assert.equal(button.children[1].textContent,'7');
  button.onclick();assert.equal(clicks,1);
});

test('batch export snapshots project data and retains the audio buffer bound at enqueue time',()=>{
  const firstBuffer={id:'first-audio-buffer'};
  const source=createDefaultProject({
    audio:{source:'custom',name:'first.wav',mimeType:'audio/wav'},
    export:{includeAudio:true}
  });
  const input=createBatchExportInput(source,{audioBuffer:firstBuffer});
  source.options[0].label='CHANGED';source.audio.name='second.wav';
  assert.strictEqual(input.audioBuffer,firstBuffer);
  assert.equal(input.audioSource,'custom');
  assert.equal(input.audioSettings.name,'first.wav');
  assert.notEqual(input.options[0].label,'CHANGED');

  const original=createBatchExportInput(createDefaultProject(),{audioBuffer:firstBuffer});
  assert.equal(original.audioSource,'original');
  assert.equal(original.audioBuffer,null);
});

test('vendor build converts file URLs with fileURLToPath for Windows-safe esbuild paths',async()=>{
  const source=await readFile(new URL('../scripts/build-vendor.mjs',import.meta.url),'utf8');
  assert.match(source,/import \{fileURLToPath\} from 'node:url'/);
  assert.match(source,/resolveDir:projectRoot/);
  assert.match(source,/outfile:fileURLToPath\(/);
  assert.doesNotMatch(source,/\.pathname\b/);
});
