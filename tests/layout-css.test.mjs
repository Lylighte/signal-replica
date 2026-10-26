import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../dist/layout.css',import.meta.url),'utf8');

function declarations(selector){
  const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=css.match(new RegExp(`${escaped}\\{([^}]*)\\}`));
  assert.ok(match,`missing CSS rule for ${selector}`);
  return Object.fromEntries(match[1].split(';').filter(Boolean).map(declaration=>{
    const separator=declaration.indexOf(':');
    return[declaration.slice(0,separator).trim(),declaration.slice(separator+1).trim()];
  }));
}

test('preview container sizes every supported aspect from both container axes',()=>{
  const contracts=[
    ['.preview-surface .stage','min(100cqw,calc(100cqh * 16 / 9),1280px)','16/9'],
    ['.preview-surface .stage[data-aspect="4:3"]','min(100cqw,calc(100cqh * 4 / 3),1280px)','4/3'],
    ['.preview-surface .stage[data-aspect="1:1"]','min(100cqw,100cqh,1280px)','1/1'],
    ['.preview-surface .stage[data-aspect="9:16"]','min(100cqw,calc(100cqh * 9 / 16),1280px)','9/16']
  ];
  for(const [selector,width,aspectRatio] of contracts){
    const rule=declarations(selector);
    assert.equal(rule.width,width,`${selector} width must be container-bounded`);
    assert.equal(rule['aspect-ratio'],aspectRatio,`${selector} must preserve its aspect ratio`);
  }
});
