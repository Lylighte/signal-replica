import test from 'node:test';
import assert from 'node:assert/strict';
import {drawLayer,drawLayers,findMissingImageLayers,layerEnvelope,normalizeLayer,normalizeLayers,resolveLayerAtTime,resolveLayerGeometry,sortLayers} from '../dist/layers.js';
import {assertProjectImageAssets} from '../dist/render-export.js';

test('text and image layers are normalized without retaining file objects',()=>{
  const text=normalizeLayer({id:'title',type:'text',text:'SIGNAL',opacity:2,blendMode:'screen',mask:'rounded',glow:{blur:12}});
  assert.equal(text.opacity,1);assert.equal(text.mask.type,'rounded');assert.equal(text.glow.enabled,true);assert.equal(text.fontFamily,'Saira, sans-serif');
  const image=normalizeLayer({id:'logo',type:'image',assetId:'asset-1',fit:'cover'});
  assert.equal(image.assetId,'asset-1');assert.equal(image.fit,'cover');assert.equal(Object.hasOwn(image,'file'),false);
  assert.throws(()=>normalizeLayers([{id:'same',type:'text'},{id:'same',type:'image'}]),/重复/);
});

test('layer sorting is stable and does not modify the caller array',()=>{
  const source=[{id:'front',type:'text',zIndex:2},{id:'back-a',type:'text',zIndex:-1},{id:'back-b',type:'image',zIndex:-1}];
  assert.deepEqual(sortLayers(source).map(layer=>layer.id),['back-a','back-b','front']);assert.equal(source[0].id,'front');
  const normalized=normalizeLayers(source);assert.equal(sortLayers(normalized)[0].exit.at,null);
});

test('entry and exit envelopes have deterministic transforms',()=>{
  const layer=normalizeLayer({id:'x',type:'text',enter:{type:'slide-up',duration:2,distance:100,easing:'linear'},exit:{type:'fade',duration:1,easing:'linear'}});
  assert.deepEqual(layerEnvelope(layer,0,10),{opacity:1,translateX:0,translateY:100,scale:1,enterProgress:0,exitProgress:0});
  assert.equal(layerEnvelope(layer,1,10).translateY,50);assert.equal(layerEnvelope(layer,9.5,10).opacity,.5);assert.equal(layerEnvelope(layer,10,10).opacity,0);
});

test('keyframe evaluator can inject animation values without a module dependency',()=>{
  const layer=normalizeLayer({id:'title',type:'text',x:100,y:200,enter:'none',exit:'none'});
  const resolved=resolveLayerAtTime(layer,2,10,(value,time)=>({x:value.x+time*10,rotation:45,opacity:.25}));
  assert.equal(resolved.x,120);assert.equal(resolved.y,200);assert.equal(resolved.rotation,45);assert.equal(resolved.opacity,.25);
  assert.deepEqual(resolveLayerGeometry({...resolved,coordinateMode:'relative',x:.5,y:.25,width:.2,height:.1},{x:10,y:20,width:1000,height:800}),{x:510,y:220,width:200,height:80});
});

function fakeContext(){
  const calls=[];
  const context={calls,globalAlpha:1,globalCompositeOperation:'source-over',save(){calls.push(['save']);},restore(){calls.push(['restore']);},translate(...args){calls.push(['translate',...args]);},rotate(...args){calls.push(['rotate',...args]);},scale(...args){calls.push(['scale',...args]);},beginPath(){calls.push(['beginPath']);},rect(...args){calls.push(['rect',...args]);},ellipse(...args){calls.push(['ellipse',...args]);},clip(){calls.push(['clip']);},moveTo(){},lineTo(){},quadraticCurveTo(){},measureText(value){return {width:String(value).length*10};},fillText(...args){calls.push(['fillText',...args]);},strokeText(...args){calls.push(['strokeText',...args]);},drawImage(...args){calls.push(['drawImage',...args]);},createLinearGradient(){return {stops:[],addColorStop(offset,color){this.stops.push([offset,color]);}};}};
  return context;
}

test('canvas helper draws sorted text and images and reports missing runtime assets',()=>{
  const ctx=fakeContext(),image={width:100,height:50};
  const results=drawLayers(ctx,[
    {id:'image',type:'image',assetId:'logo',zIndex:2,width:200,height:200,mask:'circle'},
    {id:'text',type:'text',zIndex:1,text:'AB',enter:'none',exit:'none',fill:{type:'linear',angle:90,stops:[{offset:0,color:'#fff'},{offset:1,color:'#000'}]}},
  ],{time:1,duration:10,images:new Map([['logo',image]])});
  assert.ok(results.every(result=>result.drawn));assert.equal(results[0].layer.id,'text');assert.ok(ctx.calls.some(call=>call[0]==='fillText'));assert.ok(ctx.calls.some(call=>call[0]==='drawImage'));assert.ok(ctx.calls.some(call=>call[0]==='ellipse'));
  assert.equal(drawLayer(ctx,{id:'missing',type:'image',assetId:'none'},{time:1}).reason,'image-unavailable');
  const layers=[{id:'shown',name:'缺图',type:'image',assetId:'none'},{id:'hidden',type:'image',visible:false},{id:'ready',type:'image',assetId:'logo'}];
  assert.deepEqual(findMissingImageLayers(layers,{images:new Map([['logo',image]])}).map(layer=>layer.id),['shown']);
  assert.throws(()=>assertProjectImageAssets({layers},{images:new Map([['logo',image]])}),/缺少本地文件.*缺图/);
  assert.equal(assertProjectImageAssets({layers:layers.filter(layer=>layer.id!=='shown')},{images:new Map([['logo',image]])}),true);
});
