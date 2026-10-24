const REFERENCE_WIDTH=1920;
const REFERENCE_HEIGHT=1080;
const PANEL_WIDTH=720;
const PANEL_HEIGHT=540;

export const MAX_STUDIO_OPTIONS=16;
export const ASPECT_VIEWPORTS=Object.freeze({
  '16:9':Object.freeze({width:1920,height:1080}),
  '4:3':Object.freeze({width:1440,height:1080}),
  '1:1':Object.freeze({width:1080,height:1080}),
  '9:16':Object.freeze({width:1080,height:1920}),
});
export const LAYOUT_GRIDS=Object.freeze({
  auto:null,
  '2x2':Object.freeze({columns:2,rows:2}),
  '3x3':Object.freeze({columns:3,rows:3}),
  '4x4':Object.freeze({columns:4,rows:4}),
});
export const LAYOUT_MODES=Object.freeze(['grid','single','focus','carousel','paged']);
export const FRAMING_MODES=Object.freeze(['crop','fit','reflow']);

const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const integer=(value,fallback,min,max)=>clamp(Math.trunc(finite(value,fallback)),min,max);

function assertChoice(value,choices,label){
  if(!choices.includes(value))throw new Error(`${label}无效：${value}`);
  return value;
}

/**
 * Return the logical coordinate spaces needed by preview and export.  Crop and
 * fit keep the original 1920x1080 renderer coordinate space; reflow lays out
 * directly in the selected aspect ratio.  No raster size is silently changed.
 */
export function getAspectViewport(aspect='16:9',framing='reflow'){
  const target=ASPECT_VIEWPORTS[aspect];
  if(!target)throw new Error(`不支持的画幅：${aspect}`);
  assertChoice(framing,FRAMING_MODES,'画幅适配方式');
  const targetRatio=target.width/target.height,referenceRatio=REFERENCE_WIDTH/REFERENCE_HEIGHT;
  let sourceRect={x:0,y:0,width:REFERENCE_WIDTH,height:REFERENCE_HEIGHT};
  let contentRect={x:0,y:0,width:target.width,height:target.height};
  let layoutRect;
  let coordinateSpace;
  if(framing==='crop'){
    if(targetRatio<referenceRatio){
      sourceRect.width=REFERENCE_HEIGHT*targetRatio;
      sourceRect.x=(REFERENCE_WIDTH-sourceRect.width)/2;
    }else if(targetRatio>referenceRatio){
      sourceRect.height=REFERENCE_WIDTH/targetRatio;
      sourceRect.y=(REFERENCE_HEIGHT-sourceRect.height)/2;
    }
    layoutRect={...sourceRect};coordinateSpace='source';
  }else if(framing==='fit'){
    const scale=Math.min(target.width/REFERENCE_WIDTH,target.height/REFERENCE_HEIGHT);
    contentRect={x:(target.width-REFERENCE_WIDTH*scale)/2,y:(target.height-REFERENCE_HEIGHT*scale)/2,width:REFERENCE_WIDTH*scale,height:REFERENCE_HEIGHT*scale};
    layoutRect={x:0,y:0,width:REFERENCE_WIDTH,height:REFERENCE_HEIGHT};coordinateSpace='source';
  }else{
    sourceRect=null;layoutRect={x:0,y:0,width:target.width,height:target.height};coordinateSpace='target';
  }
  return Object.freeze({aspect,framing,width:target.width,height:target.height,coordinateSpace,sourceRect:sourceRect&&Object.freeze(sourceRect),contentRect:Object.freeze(contentRect),layoutRect:Object.freeze(layoutRect)});
}

export function normalizeLayoutConfig(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('布局设置格式无效。');
  const mode=input.mode==='auto'?'grid':input.mode??'grid';
  assertChoice(mode,LAYOUT_MODES,'布局模式');
  const grid=input.grid??'auto';
  if(!Object.hasOwn(LAYOUT_GRIDS,grid))throw new Error(`网格规格无效：${grid}`);
  const aspect=input.aspect??'16:9',framing=input.framing??'reflow';
  if(!Object.hasOwn(ASPECT_VIEWPORTS,aspect))throw new Error(`不支持的画幅：${aspect}`);
  assertChoice(framing,FRAMING_MODES,'画幅适配方式');
  const order=Array.isArray(input.order)?[...new Set(input.order.filter(id=>typeof id==='string'&&id))]:[];
  return {
    mode,grid,aspect,framing,order,
    selectedId:typeof input.selectedId==='string'?input.selectedId:'',
    page:integer(input.page,0,0,9999),
    spacing:clamp(finite(input.spacing,0),0,240),
    safeMargin:clamp(finite(input.safeMargin,aspect==='16:9'?0:.04),0,.2),
    minimumScale:clamp(finite(input.minimumScale,.4),.1,2),
    carouselIndex:integer(input.carouselIndex,0,0,9999),
    carouselDuration:clamp(finite(input.carouselDuration,2),.05,3600),
    time:Math.max(0,finite(input.time,0)),
    labelFontSize:clamp(finite(input.labelFontSize,28),1,1000),
    numberFontSize:clamp(finite(input.numberFontSize,180),1,2000),
    minimumLabelPixels:clamp(finite(input.minimumLabelPixels,12),4,200),
    minimumNumberPixels:clamp(finite(input.minimumNumberPixels,48),8,1000),
  };
}

function orderedOptions(options,order){
  if(!Array.isArray(options)||options.length<1)throw new Error('至少需要一个选项。');
  if(options.length>MAX_STUDIO_OPTIONS)throw new Error(`最多支持 ${MAX_STUDIO_OPTIONS} 个选项。`);
  const ids=new Set(),byId=new Map();
  for(const [index,option] of options.entries()){
    if(!option||typeof option!=='object')throw new Error(`第 ${index+1} 个选项格式无效。`);
    const id=String(option.id??`option-${index+1}`);
    if(ids.has(id))throw new Error(`选项 ID 重复：${id}`);
    ids.add(id);byId.set(id,{option,id,sourceIndex:index});
  }
  const result=[];
  for(const id of order){const entry=byId.get(id);if(entry){result.push(entry);byId.delete(id);}}
  result.push(...byId.values());
  return result;
}

function autoGrid(count){
  if(count<=1)return {columns:1,rows:1};
  if(count<=4)return {columns:2,rows:2};
  if(count<=6)return {columns:3,rows:2};
  return {columns:4,rows:Math.ceil(count/4)};
}

function insetRect(rect,margin){
  const inset=Math.min(rect.width,rect.height)*margin;
  return {x:rect.x+inset,y:rect.y+inset,width:Math.max(1,rect.width-inset*2),height:Math.max(1,rect.height-inset*2)};
}

function safeLayoutRect(viewport,config){
  const rect=viewport.layoutRect;
  // Preserve the original renderer's exact 1440x1080 content rectangle.
  if(viewport.aspect==='16:9'&&rect.x===0&&rect.y===0&&rect.width===REFERENCE_WIDTH&&rect.height===REFERENCE_HEIGHT&&config.safeMargin===0)
    return {x:240,y:0,width:1440,height:1080};
  return insetRect(rect,config.safeMargin);
}

function gridScale(rect,columns,rows,spacing){
  return Math.min((rect.width-Math.max(0,columns-1)*spacing)/(columns*PANEL_WIDTH),(rect.height-Math.max(0,rows-1)*spacing)/(rows*PANEL_HEIGHT));
}

function outputScale(viewport){
  if(viewport.framing==='fit')return viewport.contentRect.width/REFERENCE_WIDTH;
  if(viewport.framing==='crop')return viewport.width/viewport.sourceRect.width;
  return 1;
}

function chooseSmartGrid(count,rect,config,viewport){
  const initial=autoGrid(count);
  if(config.grid!=='auto')return {...LAYOUT_GRIDS[config.grid],autoPaginated:false};
  const candidates=[];
  if(count>9)candidates.push({columns:4,rows:4,capacity:16});
  if(count>4)candidates.push({columns:3,rows:3,capacity:9});
  if(count>1)candidates.push({columns:2,rows:2,capacity:4});
  candidates.push({columns:1,rows:1,capacity:1});
  const pixelScale=outputScale(viewport);
  for(const candidate of candidates){
    const rows=Math.min(candidate.rows,Math.ceil(Math.min(count,candidate.capacity)/candidate.columns));
    if(gridScale(rect,candidate.columns,Math.max(1,rows),config.spacing)*pixelScale>=config.minimumScale)
      return {columns:candidate.columns,rows:Math.max(1,rows),autoPaginated:candidate.capacity<count};
  }
  return {...initial,autoPaginated:false};
}

function makeDiagnostic(code,message,severity='warning',details={}){return {code,message,severity,...details};}

/**
 * Pure panel planner used by preview and export.  Coordinates are in the
 * viewport's declared coordinateSpace and can therefore be rendered at any
 * native output resolution without first rasterising a 1080p frame.
 */
export function planStudioLayout(options,input={}){
  const config=normalizeLayoutConfig(input),viewport=getAspectViewport(config.aspect,config.framing);
  const ordered=orderedOptions(options,config.order),diagnostics=[];
  const focusIndex=Math.max(0,ordered.findIndex(entry=>entry.id===config.selectedId));
  let visible=ordered,columns=1,rows=1,pageIndex=0,pageCount=1,autoPaginated=false;
  const oneOnly=['single','focus','carousel'].includes(config.mode);
  if(oneOnly){
    const carousel=config.mode==='carousel'?((config.carouselIndex+Math.floor(config.time/config.carouselDuration))%ordered.length):focusIndex;
    visible=[ordered[carousel]];
  }
  const rect=safeLayoutRect(viewport,config);
  if(!oneOnly){
    const chosen=chooseSmartGrid(ordered.length,rect,config,viewport);columns=chosen.columns;rows=chosen.rows;autoPaginated=chosen.autoPaginated;
    let capacity=columns*rows;
    if(config.mode==='paged'||config.grid!=='auto'||autoPaginated){
      pageCount=Math.max(1,Math.ceil(ordered.length/capacity));pageIndex=clamp(config.page,0,pageCount-1);
      visible=ordered.slice(pageIndex*capacity,(pageIndex+1)*capacity);
      rows=Math.max(1,Math.min(rows,Math.ceil(visible.length/columns)));
    }else rows=Math.max(1,Math.ceil(visible.length/columns));
  }
  const scale=Math.max(0,gridScale(rect,columns,rows,config.spacing));
  const effectiveScale=scale*outputScale(viewport);
  if(autoPaginated)diagnostics.push(makeDiagnostic('auto-paginated',`当前画幅会自动分页，以保证文字和数字清晰；共 ${pageCount} 页。`,'info',{pageCount}));
  if(effectiveScale<config.minimumScale)diagnostics.push(makeDiagnostic('panel-too-small','当前显式网格在所选画幅中过密，建议减少同页项目或使用自动布局。','warning',{effectiveScale,minimumScale:config.minimumScale}));
  if(config.labelFontSize*effectiveScale<config.minimumLabelPixels)diagnostics.push(makeDiagnostic('label-too-small','标签预计小于安全字号，建议分页、减少列数或提高输出分辨率。','warning',{pixelSize:config.labelFontSize*effectiveScale}));
  if(config.numberFontSize*effectiveScale<config.minimumNumberPixels)diagnostics.push(makeDiagnostic('number-too-small','数字预计小于安全字号，建议分页、减少列数或提高输出分辨率。','warning',{pixelSize:config.numberFontSize*effectiveScale}));
  const totalWidth=columns*PANEL_WIDTH*scale+Math.max(0,columns-1)*config.spacing;
  const totalHeight=rows*PANEL_HEIGHT*scale+Math.max(0,rows-1)*config.spacing;
  const top=rect.y+(rect.height-totalHeight)/2;
  const panels=visible.map((entry,index)=>{
    const row=Math.floor(index/columns),itemsInRow=Math.min(columns,visible.length-row*columns);
    const rowWidth=itemsInRow*PANEL_WIDTH*scale+Math.max(0,itemsInRow-1)*config.spacing;
    const rowLeft=rect.x+(rect.width-rowWidth)/2,col=index%columns;
    const x=rowLeft+col*(PANEL_WIDTH*scale+config.spacing),y=top+row*(PANEL_HEIGHT*scale+config.spacing);
    const label=String(entry.option.label??'');
    const estimatedNaturalWidth=Math.max(config.labelFontSize,label.length*config.labelFontSize*.62);
    const displayMaxWidth=Math.max(1,PANEL_WIDTH*.42*effectiveScale);
    const fittedLabelPixels=config.labelFontSize*effectiveScale*Math.min(1,displayMaxWidth/(estimatedNaturalWidth*effectiveScale||1));
    return Object.freeze({option:entry.option,id:entry.id,sourceIndex:entry.sourceIndex,index,pageIndex,row,col,x,y,width:PANEL_WIDTH*scale,height:PANEL_HEIGHT*scale,scale,effectiveScale,text:Object.freeze({labelMaxWidth:PANEL_WIDTH*.42*scale,estimatedLabelPixels:fittedLabelPixels,readable:fittedLabelPixels>=config.minimumLabelPixels})});
  });
  if(panels.some(panel=>!panel.text.readable)&&!diagnostics.some(item=>item.code==='label-too-small'))diagnostics.push(makeDiagnostic('label-overflow','至少一个长标签需缩小到安全字号以下；建议缩短标签或使用分页。'));
  return Object.freeze({config:Object.freeze(config),viewport,layoutRect:Object.freeze(rect),panels:Object.freeze(panels),columns,rows,scale,effectiveScale,pageIndex,pageNumber:pageIndex+1,pageCount,visibleCount:panels.length,hiddenCount:ordered.length-panels.length,totalCount:ordered.length,diagnostics:Object.freeze(diagnostics)});
}

