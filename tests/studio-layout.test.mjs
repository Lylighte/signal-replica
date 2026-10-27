import test from 'node:test';
import assert from 'node:assert/strict';
import {ASPECT_VIEWPORTS,getAspectViewport,normalizeLayoutConfig,planStudioLayout} from '../dist/studio-layout.js';
import {panelSelectionOptions} from '../dist/engine.js';

const options=count=>Array.from({length:count},(_,index)=>({id:`id-${index}`,label:`选项 ${index+1}`,value:String(index)}));

test('aspect viewport exposes exact crop, fit and reflow coordinate spaces',()=>{
  assert.deepEqual(Object.keys(ASPECT_VIEWPORTS),['16:9','4:3','1:1','9:16']);
  assert.deepEqual(getAspectViewport('4:3','crop').sourceRect,{x:240,y:0,width:1440,height:1080});
  assert.deepEqual(getAspectViewport('1:1','crop').sourceRect,{x:420,y:0,width:1080,height:1080});
  assert.deepEqual(getAspectViewport('9:16','crop').sourceRect,{x:656.25,y:0,width:607.5,height:1080});
  const fit=getAspectViewport('9:16','fit');
  assert.equal(fit.coordinateSpace,'source');assert.deepEqual(fit.contentRect,{x:0,y:656.25,width:1080,height:607.5});
  const reflow=getAspectViewport('9:16','reflow');assert.equal(reflow.coordinateSpace,'target');assert.deepEqual(reflow.layoutRect,{x:0,y:0,width:1080,height:1920});
});

test('default four-option layout preserves the original panel geometry exactly',()=>{
  const plan=planStudioLayout(options(4));
  assert.deepEqual(plan.panels.map(panel=>[panel.x,panel.y,panel.scale]),[[240,0,1],[960,0,1],[240,540,1],[960,540,1]]);
  assert.equal(plan.pageCount,1);assert.equal(plan.hiddenCount,0);assert.deepEqual(plan.diagnostics,[]);
});

test('all sixteen options fit 16:9 while narrow automatic layouts paginate for readability',()=>{
  const wide=planStudioLayout(options(16));
  assert.equal(wide.panels.length,16);assert.equal(wide.columns,4);assert.equal(wide.rows,4);assert.equal(wide.scale,.5);
  for(const panel of wide.panels){assert.ok(panel.x>=240);assert.ok(panel.y>=0);assert.ok(panel.x+panel.width<=1680);assert.ok(panel.y+panel.height<=1080);}
  const square=planStudioLayout(options(16),{aspect:'1:1'});assert.equal(square.columns,3);assert.equal(square.panels.length,9);assert.equal(square.pageCount,2);
  const portrait=planStudioLayout(options(16),{aspect:'9:16'});assert.equal(portrait.columns,3);assert.equal(portrait.panels.length,9);assert.equal(portrait.pageCount,2);
  assert.ok(square.diagnostics.some(item=>item.code==='auto-paginated'));assert.ok(portrait.diagnostics.some(item=>item.code==='auto-paginated'));
});

test('explicit grids, order and pages remain deterministic',()=>{
  const plan=planStudioLayout(options(10),{mode:'paged',grid:'2x2',page:1,order:['id-9','id-0','id-8'],spacing:12});
  assert.equal(plan.pageCount,3);assert.equal(plan.pageNumber,2);assert.deepEqual(plan.panels.map(panel=>panel.id),['id-2','id-3','id-4','id-5']);
  assert.ok(plan.panels[1].x-plan.panels[0].x>plan.panels[0].width);
  const last=planStudioLayout(options(10),{mode:'paged',grid:'2x2',page:99});assert.equal(last.pageNumber,3);assert.equal(last.panels.length,2);
});

test('focus and carousel select one panel without mutating source order',()=>{
  const source=options(5),focus=planStudioLayout(source,{mode:'focus',selectedId:'id-3'});
  assert.equal(focus.panels.length,1);assert.equal(focus.panels[0].id,'id-3');assert.equal(focus.scale,2);
  const carousel=planStudioLayout(source,{mode:'carousel',carouselIndex:1,carouselDuration:2,time:4.1});
  assert.equal(carousel.panels[0].id,'id-3');assert.deepEqual(source.map(option=>option.id),['id-0','id-1','id-2','id-3','id-4']);
});

test('unsafe explicit density is reported instead of silently changing the grid',()=>{
  const plan=planStudioLayout(options(16),{aspect:'9:16',grid:'4x4',minimumScale:.5});
  assert.equal(plan.panels.length,16);assert.equal(plan.columns,4);assert.ok(plan.diagnostics.some(item=>item.code==='panel-too-small'));
  assert.throws(()=>normalizeLayoutConfig({grid:'5x5'}),/网格规格无效/);
  assert.throws(()=>planStudioLayout(options(17)),/最多支持 16/);
});

test('panel selection row keeps the full option list for both sparse and dense sets',()=>{
  const original=options(4),dense=options(16);
  assert.equal(panelSelectionOptions(original,original[2]),original);
  assert.equal(panelSelectionOptions(dense,dense[12]),dense);
});
