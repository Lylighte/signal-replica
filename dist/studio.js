import {APP_CONFIG,PRESETS,resolveOptionSource,validateOption,validateOptions} from './config.js';
import {SignalRenderer,getPhase,clamp} from './engine.js';
import {DEFAULT_DESIGN,DESIGN_GROUPS,DESIGN_FIELDS,validateDesign,outsideSliderRange} from './design.js';
import {ASPECTS,moveOption,exportSettings,importSettings,previewIssue} from './editor-data.js';
import {DESIGN_STORAGE_KEY} from './default-settings.js';
import {exportFrameZip} from './frame-export.js';
const $=id=>document.getElementById(id),initial=resolveOptionSource(APP_CONFIG.optionSource);
function loadDesign(){try{return validateDesign(JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY)??'{}'));}catch{return {...DEFAULT_DESIGN};}}
const state={options:initial,source:{...APP_CONFIG.optionSource},design:loadDesign(),view:APP_CONFIG.preview.view,aspect:APP_CONFIG.preview.aspect,selectedId:initial.some(option=>option.id===APP_CONFIG.preview.selectedId)?APP_CONFIG.preview.selectedId:initial[0].id,time:APP_CONFIG.stillTime,playing:false,sound:false,ready:false};
let customDraft=resolveOptionSource({mode:'custom'}),raf=0,clockStart=0,timeStart=0,nextId=1;
const renderer=new SignalRenderer($('scene')),audio=$('soundtrack');
$('timeline').max=APP_CONFIG.duration;$('total-time').textContent=`${APP_CONFIG.duration.toFixed(2)} s`;
if(!previewIssue(state.design))renderer.setDesign(state.design);
const designControls=new Map();
function reflectDesign(){for(const [key,{range,input,hint,field}]of designControls){if(range)range.value=state.design[key];input.value=state.design[key];if(hint)hint.hidden=!outsideSliderRange(field,state.design[key]);}}
function setDesign(patch,reflect=true){
  const next=validateDesign(patch,state.design);if(!previewIssue(next))renderer.setDesign(next);state.design=next;
  try{localStorage.setItem(DESIGN_STORAGE_KEY,JSON.stringify(next));}catch{}
  if(reflect)reflectDesign();draw();return snapshot();
}
function renderDesignEditor(){
  $('design-groups').replaceChildren();designControls.clear();
  for(const group of DESIGN_GROUPS){
    const details=document.createElement('details');details.className='design-group';details.open=Boolean(group.open);
    const summary=document.createElement('summary');summary.textContent=group.name;details.append(summary);
    for(const field of group.fields){
      const row=document.createElement('div');row.className='design-field';
      const header=document.createElement('div');header.className='design-field-header';
      const label=document.createElement('label');label.htmlFor=`design-${field.key}`;label.textContent=field.label;
      if(field.options){
        const select=document.createElement('select');select.id=label.htmlFor;
        for(const option of field.options){const item=document.createElement('option');item.value=option.value;item.textContent=option.label;select.append(item);}
        select.value=state.design[field.key];header.append(label,select);
        const error=document.createElement('p');error.className='design-error';error.hidden=true;
        select.addEventListener('change',()=>{try{setDesign({[field.key]:select.value},false);error.hidden=true;}catch(e){error.textContent=e.message;error.hidden=false;}});
        const hint=document.createElement('p');hint.className='design-intro';hint.textContent=field.key==='easingCurve'?'仅影响选项展开。指数或陡度越大，中段展开越急。':'仅弯曲画面。扫描线、噪声和光晕仍由各自参数控制。';
        row.append(header,hint,error);details.append(row);designControls.set(field.key,{input:select,error});continue;
      }
      const value=document.createElement('div');value.className='design-value';
      const input=document.createElement('input');input.id=label.htmlFor;input.type='number';input.step=field.step>=1?'1':'any';input.value=state.design[field.key];
      const unit=document.createElement('span');unit.textContent=field.unit;value.append(input,unit);header.append(label,value);
      const range=document.createElement('input');range.type='range';range.min=field.min;range.max=field.max;range.step=field.step;range.value=state.design[field.key];range.setAttribute('aria-label',`${field.label}滑块`);
      const error=document.createElement('p');error.className='design-error';error.id=`design-error-${field.key}`;error.hidden=true;input.setAttribute('aria-describedby',error.id);
      const hint=document.createElement('p');hint.className='range-hint';hint.id=`design-hint-${field.key}`;hint.textContent=`超出滑块范围 ${field.min}–${field.max}${field.unit}，将使用输入值。`;hint.hidden=!outsideSliderRange(field,state.design[field.key]);input.setAttribute('aria-describedby',`${error.id} ${hint.id}`);
      const edit=control=>{
        try{
          if(control.value.trim()==='')throw new Error('请输入数值。');
          const numeric=Number(control.value);setDesign({[field.key]:numeric},false);
          (control===input?range:input).value=numeric;input.removeAttribute('aria-invalid');error.hidden=true;
          hint.hidden=!outsideSliderRange(field,numeric);
        }catch(e){error.textContent=e.message;error.hidden=false;input.setAttribute('aria-invalid','true');}
      };
      input.addEventListener('input',()=>edit(input));range.addEventListener('input',()=>edit(range));
      input.addEventListener('blur',()=>{if(error.hidden)input.value=state.design[field.key];});
      row.append(header,range,hint,error);details.append(row);designControls.set(field.key,{range,input,error,hint,field});
    }
    $('design-groups').append(details);
  }
}
$('reset-design').onclick=()=>{setDesign(DEFAULT_DESIGN);for(const {input,error}of designControls.values()){input.removeAttribute('aria-invalid');error.hidden=true;}announce('已恢复默认画面参数。');};
function announce(message){$('form-status').textContent=message;}
function phaseLabel(){
  const active=state.view==='single'?state.options.filter(option=>option.id===state.selectedId):state.options;
  return getPhase(state.time,state.design,Math.max(...active.map(option=>option.value.length)));
}
function draw(){
  if(!state.ready)return;
  const issue=previewIssue(state.design);$('preview-status').textContent=issue;$('preview-status').hidden=!issue;
  if(!issue)renderer.render(state.time,state.options,state.view,state.selectedId);
  $('curve-status').hidden=renderer.curvatureSupported;
  $('current-time').textContent=state.time.toFixed(2).padStart(5,'0');$('timeline').value=state.time;
  const progress=state.time/APP_CONFIG.duration*100;
  $('timeline').style.background=`linear-gradient(to right,var(--accent) 0% ${progress}%,#35373b ${progress}% 100%)`;
  $('timeline').setAttribute('aria-valuetext',`${state.time.toFixed(2)} 秒，${phaseLabel()}`);
}
function updateSelect(){
  $('selected-option').replaceChildren(...state.options.map(o=>{const el=document.createElement('option');el.value=o.id;el.textContent=`${o.label} · ${o.value}`;return el;}));
  $('selected-option').value=state.selectedId;
  const options=state.view==='single'?state.options.filter(o=>o.id===state.selectedId):state.options;
  $('scene').setAttribute('aria-label',options.map(o=>`${o.label} ${o.value}`).join('、'));
}
function renderEditor(){
  const locked=state.source.mode==='preset';$('option-list').replaceChildren();
  state.options.forEach((option,index)=>{
    const row=document.createElement('div');row.className='option-row';
    const number=document.createElement('span');number.className='row-index';number.textContent=String(index+1).padStart(2,'0');
    const label=document.createElement('input');label.value=option.label;label.setAttribute('aria-label',`选项 ${index+1} 名称`);label.maxLength=24;label.readOnly=locked;label.autocomplete='off';label.spellcheck=false;
    const value=document.createElement('input');value.value=option.value;value.className='number-input';value.inputMode='numeric';value.maxLength=4;value.setAttribute('aria-label',`选项 ${index+1} 数字`);value.readOnly=locked;value.autocomplete='off';
    const remove=document.createElement('button');remove.textContent='×';remove.className='remove-option';remove.setAttribute('aria-label',`删除选项 ${index+1}`);remove.disabled=state.options.length===1;remove.hidden=locked;
    const error=document.createElement('p');error.className='field-error';error.hidden=true;error.id=`error-${index}`;
    for(const input of [label,value]){
      input.setAttribute('aria-describedby',error.id);
      input.addEventListener('input',()=>{
        if(locked)return;
        try{state.options[index]=validateOption({...option,label:label.value,value:value.value});customDraft=structuredClone(state.options);error.hidden=true;label.removeAttribute('aria-invalid');value.removeAttribute('aria-invalid');draw();updateSelect();announce('');}
        catch(e){error.textContent=e.message;error.hidden=false;input.setAttribute('aria-invalid','true');}
      });
      input.addEventListener('blur',()=>{if(!error.hidden)return;label.value=state.options[index].label;value.value=state.options[index].value;});
    }
    remove.addEventListener('click',()=>{if(!locked&&state.options.length>1)replaceOptions(state.options.filter(o=>o.id!==option.id));});
    const actions=document.createElement('div');actions.className='option-actions';actions.hidden=locked;
    for(const [direction,text]of [[-1,'↑'],[1,'↓']]){
      const button=document.createElement('button');button.textContent=text;button.className='move-option';button.setAttribute('aria-label',`选项 ${index+1}${direction===-1?'前移':'后移'}`);button.disabled=direction===-1?index===0:index===state.options.length-1;
      button.onclick=()=>{replaceOptions(moveOption(state.options,option.id,direction));announce(`${option.label} 已${direction===-1?'前移':'后移'}。`);};actions.append(button);
    }
    actions.append(remove);row.append(number,label,value,actions,error);$('option-list').append(row);
  });
  $('option-count').textContent=`${state.options.length} 项`;$('add-option').hidden=locked;$('add-option').disabled=state.options.length>=APP_CONFIG.maxOptions;$('preset-picker').hidden=!locked;
  $('import-settings').disabled=locked;
  document.querySelector('.editor h2').textContent=locked?'选项预设':'编辑内容';
  $('preset-select').value=state.source.presetId??PRESETS[0].id;$('reset').textContent=locked?'恢复默认预设':'恢复默认内容';updateSelect();
}
function replaceOptions(options){
  const validated=validateOptions(options);state.options=validated;
  if(!state.options.some(o=>o.id===state.selectedId))state.selectedId=state.options[0].id;
  if(state.source.mode==='custom')customDraft=structuredClone(validated);renderEditor();draw();
}
function setOptionSource(source){
  const options=resolveOptionSource(source,customDraft);
  if(state.source.mode==='custom')customDraft=structuredClone(state.options);
  state.source={mode:source.mode,...(source.mode==='preset'?{presetId:source.presetId}:{})};replaceOptions(options);announce('');return snapshot();
}
function setOptions(options){if(state.source.mode!=='custom')throw new Error('预设模式下不能修改选项，请更换预设。');replaceOptions(options);return snapshot();}
function setView(view,selectedId=state.selectedId){
  if(!['grid','single'].includes(view))throw new Error('画面布局无效。');
  if(!state.options.some(o=>o.id===selectedId))throw new Error('显示选项不存在。');
  state.view=view;state.selectedId=selectedId;$('view-grid').setAttribute('aria-pressed',String(view==='grid'));$('view-single').setAttribute('aria-pressed',String(view==='single'));$('single-select-wrap').hidden=view!=='single';updateSelect();draw();return snapshot();
}
function setAspect(aspect){
  if(!Object.hasOwn(ASPECTS,aspect))throw new Error('画面比例无效。');
  state.aspect=aspect;$('stage').dataset.aspect=aspect;$('aspect-select').value=aspect;
  const {width,height}=ASPECTS[aspect];$('resolution').textContent=`${width} × ${height}`;
  $('aspect-note').hidden=aspect!=='4:3';return snapshot();
}
function applyImport(text){
  if(state.source.mode!=='custom')throw new Error('预设模式下不能导入。');
  const imported=importSettings(text,state); // Fully validate before changing live state.
  pause();setDesign(imported.design);state.selectedId=imported.selectedId;
  replaceOptions(imported.options);setView(imported.view,imported.selectedId);setAspect(imported.aspect);
  announce('已导入选项、画面参数和预览设置。');return snapshot();
}
function downloadSettings(){
  const text=exportSettings(state),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='signal-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  announce('已导出选项顺序、数字、画面参数和预览设置。');
}
let frameExportRunning=false,frameExportCancelled=false;
function openFrameExport(){
  $('frame-start').value='0';$('frame-end').value=(Math.floor(APP_CONFIG.duration*10)/10).toFixed(1);$('frame-aspect').value=state.aspect;
  $('frame-progress').hidden=true;$('frame-progress').value=0;$('frame-export-cancel').hidden=true;
  $('frame-export-start').disabled=false;$('frame-export-status').textContent='';
  $('frame-export-close').disabled=false;
  $('frame-export-dialog').showModal();
}
async function runFrameExport(){
  if(frameExportRunning)return;
  frameExportRunning=true;frameExportCancelled=false;
  const button=$('frame-export-start'),cancel=$('frame-export-cancel'),progress=$('frame-progress'),status=$('frame-export-status');
  button.disabled=true;cancel.hidden=false;$('frame-export-close').disabled=true;progress.hidden=false;progress.value=0;
  try{
    const result=await exportFrameZip({
      options:structuredClone(state.options),design:structuredClone(state.design),view:state.view,selectedId:state.selectedId,
      aspect:$('frame-aspect').value,start:Number($('frame-start').value),end:Number($('frame-end').value),fps:Number($('frame-fps').value),
      isCancelled:()=>frameExportCancelled,
      onProgress:(complete,total,time)=>{progress.value=complete/total*100;status.textContent=`正在渲染 ${complete}/${total} 帧 · ${time.toFixed(2)} 秒`;}
    });
    if(!result){status.textContent='导出已取消。';return;}
    const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=`signal-frames-${result.width}x${result.height}-${result.fps}fps.zip`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent=`已生成 ${result.frameCount} 帧（${result.width} × ${result.height}，${result.fps} FPS），ZIP 已开始下载。`;
  }catch(error){status.textContent=`导出失败：${error.message}`;}
  finally{frameExportRunning=false;button.disabled=false;$('frame-export-close').disabled=false;cancel.hidden=true;}
}
function updatePlayButton(){$('play-label').textContent=state.playing?'暂停':state.time>=APP_CONFIG.duration?'再播放':'播放';document.querySelector('.play-icon').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'暂停动画':'播放动画');}
function pause(){state.playing=false;cancelAnimationFrame(raf);audio.pause();updatePlayButton();}
function seek(time){
  if(typeof time!=='number'||!Number.isFinite(time)||time<0||time>APP_CONFIG.duration)throw new Error(`时间需在 0–${APP_CONFIG.duration} 秒之间。`);
  pause();state.time=time;audio.currentTime=time;draw();updatePlayButton();return snapshot();
}
function frame(now){
  if(!state.playing)return;
  state.time=clamp(state.sound&&!audio.paused&&!audio.seeking?audio.currentTime:timeStart+(now-clockStart)/1000,0,APP_CONFIG.duration);draw();
  if(state.time>=APP_CONFIG.duration){pause();return;}raf=requestAnimationFrame(frame);
}
async function play(){
  if(!state.ready||state.playing)return;if(state.time>=APP_CONFIG.duration)state.time=0;
  timeStart=state.time;clockStart=performance.now();state.playing=true;
  if(state.sound){audio.currentTime=state.time;try{await audio.play();}catch{state.sound=false;updateSoundButton();announce('音频暂时无法播放，画面仍可预览。');}}
  if(!state.playing)return;updatePlayButton();cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}
function updateSoundButton(){$('sound').textContent=state.sound?'声音开启':'声音关闭';$('sound').setAttribute('aria-pressed',String(state.sound));}
async function toggleSound(){
  state.sound=!state.sound;timeStart=state.time;clockStart=performance.now();
  if(!state.sound)audio.pause();else if(state.playing){audio.currentTime=state.time;try{await audio.play();}catch{state.sound=false;announce('音频暂时无法播放。');}}updateSoundButton();
}
function snapshot(){return structuredClone({options:state.options,optionSource:state.source,design:state.design,view:state.view,aspect:state.aspect,selectedId:state.selectedId,time:state.time,phase:phaseLabel(),playing:state.playing,sound:state.sound,ready:state.ready});}
$('view-grid').onclick=()=>setView('grid');$('view-single').onclick=()=>setView('single');$('selected-option').onchange=e=>setView('single',e.target.value);
$('aspect-select').onchange=e=>setAspect(e.target.value);
$('export-settings').onclick=downloadSettings;
$('export-frames').onclick=openFrameExport;$('frame-export-start').onclick=()=>void runFrameExport();
$('frame-export-cancel').onclick=()=>{$('frame-export-status').textContent='正在取消…';frameExportCancelled=true;};
$('frame-export-dialog').addEventListener('cancel',event=>{if(frameExportRunning){event.preventDefault();frameExportCancelled=true;$('frame-export-status').textContent='正在取消…';}});
$('import-settings').onclick=()=>{$('settings-file').value='';$('settings-file').click();};
$('settings-file').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{applyImport(await file.text());}catch(error){announce(`导入失败：${error.message}`);}
};
$('add-option').onclick=()=>{
  if(state.source.mode!=='custom'||state.options.length>=APP_CONFIG.maxOptions)return;
  const id=`custom-${Date.now()}-${nextId++}`;replaceOptions([...state.options,{id,label:`OP${state.options.length+1}`,value:'0'}]);
  const rows=$('option-list').querySelectorAll('.option-row');rows[rows.length-1].querySelector('input').focus();
};
$('reset').onclick=()=>{if(state.source.mode==='preset')setOptionSource({mode:'preset',presetId:PRESETS[0].id});else replaceOptions(PRESETS[0].options);announce('已恢复默认内容。');};
$('preset-select').replaceChildren(...PRESETS.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));$('preset-select').onchange=e=>setOptionSource({mode:'preset',presetId:e.target.value});
$('play').onclick=()=>state.playing?pause():void play();$('restart').onclick=()=>{seek(0);void play();};$('still').onclick=()=>seek(APP_CONFIG.stillTime);
$('timeline').addEventListener('input',e=>seek(Number(e.target.value)));$('sound').onclick=toggleSound;
$('fullscreen').onclick=async()=>{try{await $('stage').requestFullscreen();}catch{announce('当前浏览器未允许全屏。');}};$('exit-fullscreen').onclick=()=>document.exitFullscreen();
document.addEventListener('fullscreenchange',()=>{$('exit-fullscreen').hidden=!document.fullscreenElement;});
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea,button,[contenteditable="true"]')||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='Space'){e.preventDefault();state.playing?pause():void play();}
  if(e.code==='ArrowRight'||e.code==='ArrowLeft'){e.preventDefault();seek(clamp(state.time+(e.code==='ArrowRight'?1:-1)/30,0,APP_CONFIG.duration));}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
audio.addEventListener('ended',()=>{if(state.playing&&state.sound){state.time=APP_CONFIG.duration;pause();draw();}});
audio.addEventListener('error',()=>{if(state.sound){state.sound=false;timeStart=state.time;clockStart=performance.now();updateSoundButton();announce('音频加载失败，画面仍可预览。');}});
window.ReplicaApp=Object.freeze({getState:snapshot,setOptions,setView,setAspect,setOptionSource,setDesign,importSettings:applyImport,exportSettings:()=>exportSettings(state),exportFrames:exportFrameZip,seek,play,pause});
function registerTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const tools=[
    {name:'configure_signal_design',title:'调整画面参数',description:'Update editor settings. Numeric input may exceed slider bounds; the editor shows a hint and preserves the entered value.',inputSchema:{type:'object',properties:Object.fromEntries(DESIGN_FIELDS.map(field=>[field.key,field.options?{type:'string',enum:field.options.map(option=>option.value)}:{type:field.step>=1?'integer':'number'}])),additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>setDesign(input)},
    {name:'set_signal_preview',title:'调整演出预览',description:'Change preview layout and aspect ratio without changing animation.',inputSchema:{type:'object',properties:{aspect:{type:'string',enum:['16:9','4:3']},view:{type:'string',enum:['grid','single']},selectedId:{type:'string'}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(input.view||input.selectedId)setView(input.view??state.view,input.selectedId??state.selectedId);if(input.aspect)setAspect(input.aspect);return snapshot();}},
    {name:'import_signal_settings',title:'导入演出配置',description:'Import a SIGNAL JSON configuration, or an option array. Validate the entire document before replacing settings. Unavailable in preset mode.',inputSchema:{type:'object',properties:{json:{type:'string'}},required:['json'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(state.source.mode!=='custom')throw new Error('预设模式下不能导入。');return applyImport(input.json);}},
    {name:'get_signal_scene',title:'读取数字演出',description:'Read current options, source mode, layout, time and playback state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>snapshot()},
    {name:'configure_signal_options',title:'修改演出选项',description:'Replace all custom options in one batch. Unavailable in preset mode. Updates the same scene as the visible editor.',inputSchema:{type:'object',properties:{options:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{id:{type:'string'},label:{type:'string'},value:{type:'string'}},required:['id','label','value'],additionalProperties:false}}},required:['options'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>setOptions(input.options)},
    {name:'seek_signal_scene',title:'查看演出帧',description:`Pause playback and seek to a time between 0 and ${APP_CONFIG.duration} seconds.`,inputSchema:{type:'object',properties:{time:{type:'number',minimum:0,maximum:APP_CONFIG.duration}},required:['time'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>seek(input.time)},
    {name:'set_signal_option_source',title:'切换选项来源',description:'Switch between development custom input and release preset selection. Built-in preset ids: four-difficulties, ez-zero.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['custom','preset']},presetId:{type:'string'}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>setOptionSource(input)}
  ];
  for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
try{
  renderDesignEditor();await Promise.all([document.fonts.load('900 320px Saira'),document.fonts.load('400 24px Saira')]);await document.fonts.ready;
  if(!document.fonts.check('900 320px Saira'))throw new Error('Font unavailable');
  state.ready=true;renderEditor();setView(state.view,state.selectedId);setAspect(state.aspect);$('loading').hidden=true;$('play').disabled=false;updatePlayButton();registerTools();
}catch{$('loading').textContent='Saira 字体加载失败，请刷新页面重试。';announce('字体尚未就绪。');}
