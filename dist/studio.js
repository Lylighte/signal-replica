import {APP_CONFIG,PRESETS,resolveOptionSource,validateOption,validateOptions} from './config.js';
import {SignalRenderer,getPhase,clamp} from './engine.js';
import {DEFAULT_DESIGN,DESIGN_GROUPS,DESIGN_FIELDS,validateDesign,outsideSliderRange} from './design.js';
import {ASPECTS,moveOption,previewIssue} from './editor-data.js';
import {DESIGN_STORAGE_KEY} from './default-settings.js';
import {exportFrameZip} from './frame-export.js';
import {exportGif,resolveGifResolution} from './gif-export.js';
import {GIF_PROFILES,DEFAULT_GIF_PROFILE,gifSettings} from './gif-options.js';
import {assertRasterResourceBudget,getExportResolution} from './export-plan.js';
import {createDefaultProject,normalizeProject,parseProject,serializeProject} from './project-model.js';
import {createProjectRenderState} from './project-runtime.js';
import {assertProjectImageAssets} from './render-export.js';
import {createManagedAudioAsset,getAudioPlaybackState} from './audio-project.js';
import {LocalFontManager} from './font-manager.js';
import {assertLayerImageDimensions,inspectLayerImageFile} from './layers.js';
const $=id=>document.getElementById(id),initial=resolveOptionSource(APP_CONFIG.optionSource),OPTION_STORAGE_KEY='signal-custom-options-v1',defaultCustomOptions=resolveOptionSource({mode:'custom'});
function loadDesign(){try{return validateDesign(JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY)??'{}'));}catch{return {...DEFAULT_DESIGN};}}
function loadCustomOptions(){try{const saved=localStorage.getItem(OPTION_STORAGE_KEY);return saved?validateOptions(JSON.parse(saved)):structuredClone(defaultCustomOptions);}catch{return structuredClone(defaultCustomOptions);}}
const customOptions=loadCustomOptions(),activeOptions=APP_CONFIG.optionSource.mode==='custom'?customOptions:initial;
const initialSelected=activeOptions.some(option=>option.id===APP_CONFIG.preview.selectedId)?APP_CONFIG.preview.selectedId:activeOptions[0].id;
const initialProject=createDefaultProject({options:activeOptions,design:loadDesign(),preview:{view:APP_CONFIG.preview.view,selectedId:initialSelected,aspect:APP_CONFIG.preview.aspect,framing:'crop'},layout:{mode:APP_CONFIG.preview.view==='single'?'focus':'grid',grid:'auto',aspect:APP_CONFIG.preview.aspect,framing:'crop',selectedId:initialSelected,order:activeOptions.map(option=>option.id),spacing:0}});
const state={project:initialProject,options:initialProject.options,source:{...APP_CONFIG.optionSource},design:initialProject.design,view:initialProject.preview.view,aspect:initialProject.preview.aspect,framing:initialProject.preview.framing,selectedId:initialProject.preview.selectedId,time:Math.min(APP_CONFIG.stillTime,initialProject.timeline.duration),playing:false,sound:true,ready:false};
let customDraft=structuredClone(customOptions),raf=0,clockStart=0,timeStart=0,nextId=1;
let renderer=null,renderedDesignSignature='',customAudioAsset=null;const layerImages=new Map(),fontManager=new LocalFontManager(),audio=$('soundtrack');
const projectDuration=()=>state.project.timeline.duration;
function emitProjectChange(){window.dispatchEvent(new CustomEvent('signal-project-change',{detail:{project:structuredClone(state.project)}}));}
function rebuildPreviewRenderer(){
  renderer?.dispose();renderedDesignSignature='';const {width,height}=ASPECTS[state.aspect];$('scene').width=width;$('scene').height=height;
  renderer=new SignalRenderer($('scene'),{aspect:state.aspect,framing:state.framing});if(!previewIssue(state.design))renderer.setDesign(state.design);
}
rebuildPreviewRenderer();$('timeline').max=projectDuration();$('total-time').textContent=`${projectDuration().toFixed(2)} s`;
const designControls=new Map();
function reflectDesign(){for(const [key,{range,input,hint,field}]of designControls){if(range)range.value=state.design[key];input.value=state.design[key];if(hint)hint.hidden=!outsideSliderRange(field,state.design[key]);}}
function setDesign(patch,reflect=true){
  const next=validateDesign(patch,state.design);if(!previewIssue(next))renderer.setDesign(next);state.design=next;state.project=normalizeProject({...state.project,design:next});
  try{localStorage.setItem(DESIGN_STORAGE_KEY,JSON.stringify(next));}catch{}
  if(reflect)reflectDesign();draw();emitProjectChange();return snapshot();
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
  const frame=createProjectRenderState(state.project,state.time,{images:layerImages});
  return getPhase(frame.signalTime,frame.design,Math.max(...active.map(option=>option.value.length)));
}
function draw(){
  if(!state.ready)return;
  const issue=previewIssue(state.design);$('preview-status').textContent=issue;$('preview-status').hidden=!issue;
  if(!issue){
    const frame=createProjectRenderState(state.project,state.time,{images:layerImages}),effective={...frame.design};
    if(frame.project.typography.number.size!=null)effective.numberSize=frame.project.typography.number.size;if(frame.project.typography.number.weight!=null)effective.numberWeight=frame.project.typography.number.weight;
    if(frame.project.typography.text.size!=null)effective.labelSize=frame.project.typography.text.size;if(frame.project.typography.text.weight!=null)effective.labelWeight=frame.project.typography.text.weight;
    const designSignature=JSON.stringify(effective);if(designSignature!==renderedDesignSignature){renderer.setDesign(effective);renderedDesignSignature=designSignature;}renderer.render(frame.signalTime,frame.options,frame.view,frame.selectedId,frame.scene);
    const diagnostics=[...frame.layout.diagnostics.map(item=>item.message),...frame.assetIssues].join(' ');if(diagnostics){$('preview-status').textContent=diagnostics;$('preview-status').hidden=false;}
  }
  $('curve-status').hidden=renderer.curvatureSupported;
  $('current-time').textContent=state.time.toFixed(2).padStart(5,'0');$('timeline').value=state.time;
  const progress=state.time/projectDuration()*100;
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
    const label=document.createElement('input');label.value=option.label;label.setAttribute('aria-label',`选项 ${index+1} 名称`);label.maxLength=APP_CONFIG.maxLabelLength;label.readOnly=locked;label.autocomplete='off';label.spellcheck=false;
    const value=document.createElement('input');value.value=option.value;value.className='number-input';value.inputMode='numeric';value.maxLength=4;value.setAttribute('aria-label',`选项 ${index+1} 数字`);value.readOnly=locked;value.autocomplete='off';
    const remove=document.createElement('button');remove.textContent='×';remove.className='remove-option';remove.setAttribute('aria-label',`删除选项 ${index+1}`);remove.disabled=state.options.length===1;remove.hidden=locked;
    const error=document.createElement('p');error.className='field-error';error.hidden=true;error.id=`error-${index}`;
    for(const input of [label,value]){
      input.setAttribute('aria-describedby',error.id);
      input.addEventListener('input',()=>{
        if(locked)return;
        try{state.options[index]=validateOption({...option,label:label.value,value:value.value});state.project=normalizeProject({...state.project,options:state.options});customDraft=structuredClone(state.options);saveCustomOptions(customDraft);error.hidden=true;label.removeAttribute('aria-invalid');value.removeAttribute('aria-invalid');draw();updateSelect();emitProjectChange();announce('');}
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
  const optionIds=new Set(validated.map(option=>option.id)),keyframes=state.project.timeline.keyframes.filter(frame=>{const match=/^options\.([^.]+)\./.exec(frame.path);return !match||optionIds.has(match[1]);});
  state.project=normalizeProject({...state.project,options:validated,preview:{...state.project.preview,selectedId:state.selectedId},layout:{...state.project.layout,selectedId:state.selectedId,order:validated.map(option=>option.id)},timeline:{...state.project.timeline,keyframes}});
  if(state.source.mode==='custom'){customDraft=structuredClone(validated);saveCustomOptions(customDraft);}renderEditor();draw();emitProjectChange();
}
function saveCustomOptions(options){try{localStorage.setItem(OPTION_STORAGE_KEY,JSON.stringify(options));}catch{}}
function setOptionSource(source){
  const options=resolveOptionSource(source,customDraft);
  if(state.source.mode==='custom')customDraft=structuredClone(state.options);
  state.source={mode:source.mode,...(source.mode==='preset'?{presetId:source.presetId}:{})};replaceOptions(options);announce('');return snapshot();
}
function setOptions(options){if(state.source.mode!=='custom')throw new Error('预设模式下不能修改选项，请更换预设。');replaceOptions(options);return snapshot();}
function setView(view,selectedId=state.selectedId){
  if(!['grid','single','focus','carousel','paged'].includes(view))throw new Error('画面布局无效。');
  if(!state.options.some(o=>o.id===selectedId))throw new Error('显示选项不存在。');
  state.view=view;state.selectedId=selectedId;const mode=view==='single'?'focus':view;
  state.project=normalizeProject({...state.project,preview:{...state.project.preview,view,selectedId},layout:{...state.project.layout,mode,selectedId}});
  $('view-grid').setAttribute('aria-pressed',String(view==='grid'));$('view-single').setAttribute('aria-pressed',String(view==='single'||view==='focus'));$('single-select-wrap').hidden=!['single','focus'].includes(view);updateSelect();draw();emitProjectChange();return snapshot();
}
function setAspect(aspect,framing=state.framing){
  if(!Object.hasOwn(ASPECTS,aspect))throw new Error('画面比例无效。');
  if(!['crop','fit','reflow'].includes(framing))throw new Error('画幅适配方式无效。');
  state.aspect=aspect;state.framing=framing;state.project=normalizeProject({...state.project,preview:{...state.project.preview,aspect,framing},layout:{...state.project.layout,aspect,framing}});$('stage').dataset.aspect=aspect;$('aspect-select').value=aspect;
  const {width,height}=ASPECTS[aspect];$('resolution').textContent=`${width} × ${height}`;
  $('aspect-note').textContent=`${aspect} · ${framing==='crop'?'居中裁剪':framing==='fit'?'自适应缩放':'智能重排'} · ${width} × ${height}`;$('aspect-note').hidden=aspect==='16:9'&&framing==='crop';rebuildPreviewRenderer();draw();emitProjectChange();return snapshot();
}
function applyProject(input,message='项目已更新。'){
  const next=normalizeProject(input,{fallback:state.project});pause();
  if(next.audio.source==='custom'&&customAudioAsset&&next.audio.name&&next.audio.name!==customAudioAsset.metadata.name){void customAudioAsset.dispose();customAudioAsset=null;}
  state.project=next;state.options=next.options;state.design=next.design;state.view=next.preview.view;state.aspect=next.preview.aspect;state.framing=next.preview.framing;state.selectedId=next.preview.selectedId;state.time=Math.min(state.time,next.timeline.duration);
  if(state.source.mode==='custom'){customDraft=structuredClone(next.options);saveCustomOptions(customDraft);}
  try{localStorage.setItem(DESIGN_STORAGE_KEY,JSON.stringify(next.design));}catch{}
  $('timeline').max=next.timeline.duration;$('total-time').textContent=`${next.timeline.duration.toFixed(2)} s`;
  for(const id of ['frame-start','frame-end'])if($(id))$(id).max=next.timeline.duration;
  reflectDesign();renderEditor();rebuildPreviewRenderer();$('stage').dataset.aspect=state.aspect;$('aspect-select').value=state.aspect;
  const {width,height}=ASPECTS[state.aspect];$('resolution').textContent=`${width} × ${height}`;
  $('view-grid').setAttribute('aria-pressed',String(state.view==='grid'));$('view-single').setAttribute('aria-pressed',String(['single','focus'].includes(state.view)));$('single-select-wrap').hidden=!['single','focus'].includes(state.view);
  syncProjectAudioElement();draw();updatePlayButton();emitProjectChange();announce(message);return snapshot();
}
function applyImport(text){
  if(state.source.mode!=='custom')throw new Error('预设模式下不能导入。');
  const imported=parseProject(text,{fallback:state.project}); // Fully validate before changing live state.
  return applyProject(imported,'已导入完整 SIGNAL Studio 项目。');
}
function downloadSettings(){
  const text=serializeProject(state.project),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='signal-studio-project.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  announce('已导出完整项目配置；本地音频、字体和图片文件内容不会写入 JSON。');
}
let frameExportRunning=false,frameExportController=null,frameExportSupportRevision=0,videoExporterPromise=null,frameExportCheckTimer=0;
const frameExportFieldIds=['export-format','frame-start','frame-end','frame-quality','frame-aspect','frame-framing','frame-fps','frame-zip-fps','frame-gif-compression','frame-gif-size','frame-quality-preset','frame-bitrate','frame-audio','frame-audio-source'];
const loadVideoExporter=()=>videoExporterPromise??=import('./video-export.js');
function readFrameExportSettings(){
  const number=(id,label)=>{const value=$(id).value.trim();if(value==='')throw new Error(`请输入${label}。`);return Number(value);};
  const format=$('export-format').value;if(!['mp4','zip','gif'].includes(format))throw new Error('导出格式无效。');
  const gifCompression=$('frame-gif-compression').value,gifProfile=GIF_PROFILES[gifCompression];
  if(format==='gif'&&!gifProfile)throw new Error('GIF 压缩选项无效。');
  const audioSource=$('frame-audio-source')?.value??(state.project.audio.source==='none'?'none':state.project.audio.source);
  const settings={
    format,start:number('frame-start','开始时间'),end:number('frame-end','结束时间'),
    fps:format==='gif'?gifProfile.fps:number(format==='mp4'?'frame-fps':'frame-zip-fps','帧率'),quality:$('frame-quality').value,
    aspect:$('frame-aspect').value,framing:$('frame-framing')?.value??state.framing,
    gifCompression,gifSize:$('frame-gif-size').value,
    qualityPreset:$('frame-quality-preset')?.value??'balanced',videoBitrate:($('frame-quality-preset')?.value==='custom'?number('frame-bitrate','自定义码率')*1_000_000:undefined),
    audioSource,includeAudio:format==='mp4'&&$('frame-audio').checked&&audioSource!=='none'
  };
  if(format==='mp4'&&settings.includeAudio&&settings.audioSource==='custom'&&!customAudioAsset)throw new Error('请先在“音频”面板导入自定义音轨。');
  return settings;
}
function setFrameExportFieldsDisabled(disabled){for(const id of frameExportFieldIds)if($(id))$(id).disabled=disabled;}
function updateFrameExportFormat(){
  const format=$('export-format').value,mp4=format==='mp4',zip=format==='zip',gif=format==='gif',customBitrate=mp4&&$('frame-quality-preset').value==='custom';
  $('frame-quality-row').hidden=gif;$('frame-audio-row').hidden=!mp4;$('frame-audio-source-row').hidden=!mp4;
  $('frame-quality-preset-row').hidden=!mp4;$('frame-bitrate-row').hidden=!customBitrate;
  $('frame-mp4-fps-row').hidden=!mp4;$('frame-zip-fps-row').hidden=!zip;
  $('frame-gif-compression-row').hidden=!gif;$('frame-gif-size-row').hidden=!gif;
  $('frame-export-intro').textContent=mp4?'逐帧渲染并在浏览器中生成 H.264 / AAC MP4。':zip?'逐帧渲染无损 PNG，并打包为 ZIP。':'以自适应调色板生成彩色 GIF，并合并重复帧与裁切变化区域。';
  $('frame-export-start').textContent=mp4?'生成 MP4':zip?'生成 ZIP':'生成 GIF';
  if(!mp4){$('frame-load-warning').textContent='';$('frame-load-warning').hidden=true;}
}
function validateStillExportSettings(settings){
  const duration=projectDuration();
  if(!Number.isFinite(settings.start)||!Number.isFinite(settings.end)||settings.start<0||settings.end<settings.start||settings.end>duration)throw new Error(`时间范围需在 0–${duration.toFixed(2)} 秒内，并且起点不晚于终点。`);
  if(settings.format==='zip'&&(!Number.isInteger(settings.fps)||settings.fps<1||settings.fps>165))throw new Error('PNG ZIP 帧率需为 1–165 的整数。');
  const profile=settings.format==='gif'?gifSettings(settings.gifCompression,settings.gifSize):null;
  const fps=profile?.fps??settings.fps,frameCount=Math.floor((settings.end-settings.start)*fps+1e-9)+1;
  if(frameCount>5000)throw new Error('单次导出最多 5000 帧，请缩短时间范围或降低帧率。');
  const resolution=settings.format==='gif'?resolveGifResolution(settings.aspect,profile.height):getExportResolution(settings.aspect,settings.quality);
  assertRasterResourceBudget({...resolution,frameCount,label:settings.format==='gif'?'GIF':'PNG ZIP'});
  return{...resolution,frameCount,fps,profile};
}
async function refreshFrameExportSupport({preserveStatus=false}={}){
  clearTimeout(frameExportCheckTimer);
  if(frameExportRunning)return;
  const revision=++frameExportSupportRevision,status=$('frame-export-status'),button=$('frame-export-start');
  const writeStatus=message=>{if(!preserveStatus)status.textContent=message;};
  updateFrameExportFormat();
  let settings;
  try{assertProjectImageAssets(state.project,{images:layerImages});settings=readFrameExportSettings();}
  catch(error){writeStatus(`当前项目无法导出：${error.message}`);$('frame-load-warning').hidden=true;button.disabled=true;return;}
  if(settings.format!=='mp4'){
    try{
      const plan=validateStillExportSettings(settings);
      if(settings.format==='zip')writeStatus(`PNG ZIP ${plan.width} × ${plan.height} · ${plan.fps} FPS · ${plan.frameCount} 帧；帧序列包含结束时刻画面。`);
      else writeStatus(`GIF ${plan.width} × ${plan.height} · ${plan.fps} FPS · ${plan.profile.colors} 色 · ${plan.frameCount} 帧；不包含音轨。`);
      button.disabled=false;
    }catch(error){writeStatus(`当前设置无法导出：${error.message}`);button.disabled=true;}
    return;
  }
  button.disabled=true;writeStatus('正在检查本机 H.264 / AAC 编码兼容性…');
  try{
    const {checkMp4ExportSupport}=await loadVideoExporter(),runtimeAssets={images:layerImages};
    await checkMp4ExportSupport({...settings,duration:projectDuration(),audioBuffer:settings.audioSource==='custom'?customAudioAsset?.audioBuffer:null,project:state.project,runtimeAssets});
    if(revision!==frameExportSupportRevision||frameExportRunning||!$('frame-export-dialog').open)return;
    const plan=await import('./export-plan.js').then(module=>module.createMp4ExportPlan({...settings,duration:projectDuration()}));
    writeStatus(`当前配置可用：H.264 ${settings.fps} FPS · ${(plan.bitrate/1_000_000).toFixed(1)} Mbps${settings.includeAudio?' + AAC':'（无音轨）'}。${plan.load.warning?` ${plan.load.warning}`:''}`);
    $('frame-load-warning').textContent=plan.load.warning;$('frame-load-warning').hidden=!plan.load.warning;
    button.disabled=false;
  }catch(error){
    if(revision!==frameExportSupportRevision||frameExportRunning||!$('frame-export-dialog').open)return;
    writeStatus(`当前设置无法导出 MP4：${error.message}`);$('frame-load-warning').hidden=true;button.disabled=true;
  }
}
function scheduleFrameExportSupportCheck(){clearTimeout(frameExportCheckTimer);frameExportCheckTimer=setTimeout(()=>void refreshFrameExportSupport(),150);}
function openFrameExport(){
  const duration=projectDuration();$('export-format').value='mp4';$('frame-start').value='0';$('frame-start').max=String(duration);$('frame-end').value=String(duration);$('frame-end').max=String(duration);
  $('frame-quality').value=state.project.export.quality;$('frame-fps').value=String(state.project.export.fps);$('frame-zip-fps').value='30';$('frame-aspect').value=state.aspect;
  $('frame-framing').value=state.framing;$('frame-quality-preset').value=state.project.export.bitrateMode==='custom'?'custom':state.project.export.qualityPreset;$('frame-bitrate').value=String((state.project.export.videoBitrate??12_000_000)/1_000_000);
  $('frame-audio-source').value=state.project.audio.source;$('frame-audio').checked=state.project.export.includeAudio;
  $('frame-gif-compression').value=DEFAULT_GIF_PROFILE;$('frame-gif-size').value=GIF_PROFILES[DEFAULT_GIF_PROFILE].size;
  $('frame-progress').hidden=true;$('frame-progress').value=0;$('frame-export-cancel').hidden=true;$('frame-export-start').disabled=true;$('frame-export-status').textContent='';$('frame-export-close').disabled=false;
  setFrameExportFieldsDisabled(false);updateFrameExportFormat();$('frame-export-dialog').showModal();void refreshFrameExportSupport();
}
async function runFrameExport(){
  if(frameExportRunning)return;
  const button=$('frame-export-start'),cancel=$('frame-export-cancel'),progress=$('frame-progress'),status=$('frame-export-status');
  let settings;try{settings=readFrameExportSettings();}catch(error){status.textContent=`导出失败：${error.message}`;return;}
  frameExportRunning=true;frameExportController=new AbortController();frameExportSupportRevision++;
  button.disabled=true;cancel.hidden=false;cancel.disabled=false;$('frame-export-close').disabled=true;setFrameExportFieldsDisabled(true);progress.hidden=false;progress.value=0;pause();
  try{
    const common={
      options:structuredClone(state.options),design:structuredClone(state.design),view:state.view,selectedId:state.selectedId,
      aspect:settings.aspect,quality:settings.quality,framing:settings.framing,start:settings.start,end:settings.end,fps:settings.fps,duration:projectDuration(),
      project:structuredClone(state.project),runtimeAssets:{images:layerImages},signal:frameExportController.signal,isCancelled:()=>frameExportController.signal.aborted
    };
    let result,filename,formatLabel;
    if(settings.format==='mp4'){
      const {exportMp4Video}=await loadVideoExporter();
      result=await exportMp4Video({...common,qualityPreset:settings.qualityPreset,videoBitrate:settings.videoBitrate,includeAudio:settings.includeAudio,audioSource:settings.audioSource,audioBuffer:settings.audioSource==='custom'?customAudioAsset?.audioBuffer:null,audioSettings:state.project.audio,onProgress:(percent,message)=>{progress.value=percent;status.textContent=`${Math.round(percent)}% · ${message}`;}});
      filename=`signal-${result.width}x${result.height}-${result.fps}fps.mp4`;formatLabel='MP4';
    }else if(settings.format==='zip'){
      result=await exportFrameZip({...common,onProgress:(complete,total,time)=>{const percent=complete/total*100;progress.value=percent;status.textContent=`${Math.round(percent)}% · 正在渲染 ${complete}/${total} 帧 · ${time.toFixed(2)} 秒`;}});
      filename=result&&`signal-frames-${result.width}x${result.height}-${result.fps}fps.zip`;formatLabel='ZIP';
    }else{
      result=await exportGif({...common,compression:settings.gifCompression,size:settings.gifSize,onProgress:(complete,total,time,phase)=>{const percent=phase==='palette'?complete/total*50:50+complete/total*50;progress.value=percent;status.textContent=`${Math.round(percent)}% · ${phase==='palette'?'正在采样颜色':'正在编码 GIF'} ${complete}/${total} 帧 · ${time.toFixed(2)} 秒`;}});
      filename=result&&`signal-${result.width}x${result.height}-${result.fps}fps.gif`;formatLabel='GIF';
    }
    if(!result||frameExportController.signal.aborted){status.textContent='导出已取消。';return;}
    const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);progress.value=100;
    if(settings.format==='mp4')status.textContent=`已生成 ${result.duration.toFixed(3)} 秒、${result.frameCount} 帧的 MP4（${result.width} × ${result.height}，${result.fps} FPS，${result.includeAudio?`含${result.audioSource==='custom'?'自定义':'原版'}音轨`:'无音轨'}），下载已开始。`;
    else{const bytes=result.blob.size,volume=bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`;status.textContent=`已生成 ${result.frameCount} 帧（${result.width} × ${result.height}，${result.fps} FPS），${formatLabel} ${volume} 已开始下载。`;}
  }catch(error){status.textContent=frameExportController.signal.aborted||error.name==='AbortError'?'导出已取消。':`导出失败：${error.message}`;}
  finally{
    frameExportRunning=false;frameExportController=null;setFrameExportFieldsDisabled(false);$('frame-export-close').disabled=false;cancel.hidden=true;cancel.disabled=false;
    updateFrameExportFormat();void refreshFrameExportSupport({preserveStatus:true});
  }
}
function updatePlayButton(){$('play-label').textContent=state.playing?'暂停':state.time>=projectDuration()?'再播放':'播放';document.querySelector('.play-icon').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'暂停动画':'播放动画');}
function pause(){state.playing=false;cancelAnimationFrame(raf);audio.pause();updatePlayButton();}
function seek(time){
  if(typeof time!=='number'||!Number.isFinite(time)||time<0||time>projectDuration())throw new Error(`时间需在 0–${projectDuration()} 秒之间。`);
  pause();state.time=time;syncAudioToProjectTime(time,false);draw();updatePlayButton();return snapshot();
}
function previewAudioState(time){
  const settings=state.project.audio;if(settings.source==='none'||settings.muted||settings.volume===0)return{active:false,sourceTime:null,gain:0};
  if(settings.source==='custom')return customAudioAsset?getAudioPlaybackState(customAudioAsset.audioBuffer,time,settings,{projectDuration:projectDuration()}):{active:false,sourceTime:null,gain:0};
  const sourceDuration=Number.isFinite(audio.duration)?audio.duration:APP_CONFIG.duration,trimEnd=Math.min(settings.trimEnd??sourceDuration,sourceDuration),clipDuration=Math.max(0,trimEnd-settings.trimStart),start=settings.timelineStart??0,end=settings.timelineEnd??(settings.loop?projectDuration():start+clipDuration);
  if(time<start||time>=end||clipDuration<=0)return{active:false,sourceTime:null,gain:0};
  const local=time-start;if(!settings.loop&&local>=clipDuration)return{active:false,sourceTime:null,gain:0};
  let gain=settings.volume,sourceTime=settings.trimStart+(settings.loop?local%clipDuration:local);
  if(settings.fadeIn>0)gain*=Math.min(1,local/settings.fadeIn);if(settings.fadeOut>0)gain*=Math.min(1,Math.max(0,end-time)/settings.fadeOut);
  return{active:true,sourceTime,gain};
}
function syncAudioToProjectTime(time,shouldPlay=state.playing&&state.sound){
  const mapped=previewAudioState(time);audio.volume=clamp(mapped.gain,0,1);
  if(!mapped.active){audio.pause();return;}
  if(Math.abs(audio.currentTime-mapped.sourceTime)>.06)audio.currentTime=mapped.sourceTime;
  if(shouldPlay&&audio.paused)void audio.play().catch(()=>{state.sound=false;updateSoundButton();announce('当前音轨无法播放，画面仍可预览。');});
}
function syncProjectAudioElement(){
  const source=state.project.audio.source,desired=source==='original'?'assets/audio.wav':source==='custom'?customAudioAsset?.objectUrl??null:null,current=audio.getAttribute('src');
  if(current===desired)return;
  if(desired)audio.src=desired;else audio.removeAttribute('src');audio.load();
}
function frame(now){
  if(!state.playing)return;
  state.time=clamp(timeStart+(now-clockStart)/1000,0,projectDuration());if(state.sound)syncAudioToProjectTime(state.time,true);draw();
  if(state.time>=projectDuration()){pause();return;}raf=requestAnimationFrame(frame);
}
async function play(){
  if(!state.ready||state.playing)return;if(state.time>=projectDuration())state.time=0;
  timeStart=state.time;clockStart=performance.now();state.playing=true;
  if(state.sound){syncAudioToProjectTime(state.time,false);try{if(previewAudioState(state.time).active)await audio.play();}catch{state.sound=false;updateSoundButton();announce('音频暂时无法播放，画面仍可预览。');}}
  if(!state.playing)return;updatePlayButton();cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
}
function updateSoundButton(){$('sound').textContent=state.sound?'声音开启':'声音关闭';$('sound').setAttribute('aria-pressed',String(state.sound));}
async function toggleSound(){
  state.sound=!state.sound;timeStart=state.time;clockStart=performance.now();
  if(!state.sound)audio.pause();else if(state.playing){syncAudioToProjectTime(state.time,false);try{if(previewAudioState(state.time).active)await audio.play();}catch{state.sound=false;announce('音频暂时无法播放。');}}updateSoundButton();
}
function snapshot(){return structuredClone({project:state.project,options:state.options,optionSource:state.source,design:state.design,view:state.view,aspect:state.aspect,framing:state.framing,selectedId:state.selectedId,time:state.time,phase:phaseLabel(),playing:state.playing,sound:state.sound,ready:state.ready});}
$('view-grid').onclick=()=>setView('grid');$('view-single').onclick=()=>setView('single');$('selected-option').onchange=e=>setView('single',e.target.value);
$('aspect-select').onchange=e=>setAspect(e.target.value);
$('export-settings').onclick=downloadSettings;
$('export-frames').onclick=openFrameExport;$('frame-export-start').onclick=()=>void runFrameExport();
$('frame-export-cancel').onclick=()=>{if(!frameExportController)return;$('frame-export-status').textContent='正在取消并释放编码资源…';$('frame-export-cancel').disabled=true;frameExportController.abort();};
$('frame-export-dialog').addEventListener('cancel',event=>{if(frameExportRunning){event.preventDefault();$('frame-export-status').textContent='正在取消并释放编码资源…';$('frame-export-cancel').disabled=true;frameExportController?.abort();}else frameExportSupportRevision++;});
$('export-format').addEventListener('change',()=>void refreshFrameExportSupport());
for(const id of ['frame-start','frame-end','frame-quality','frame-fps','frame-zip-fps','frame-aspect','frame-framing','frame-quality-preset','frame-bitrate','frame-audio','frame-audio-source','frame-gif-size'])$(id)?.addEventListener('change',scheduleFrameExportSupportCheck);
$('frame-gif-compression').addEventListener('change',()=>{$('frame-gif-size').value=GIF_PROFILES[$('frame-gif-compression').value].size;scheduleFrameExportSupportCheck();});
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
$('reset').onclick=()=>{if(state.source.mode==='preset')setOptionSource({mode:'preset',presetId:PRESETS[0].id});else{customDraft=structuredClone(defaultCustomOptions);replaceOptions(defaultCustomOptions);try{localStorage.removeItem(OPTION_STORAGE_KEY);}catch{}}announce('已恢复默认内容。');};
$('preset-select').replaceChildren(...PRESETS.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));$('preset-select').onchange=e=>setOptionSource({mode:'preset',presetId:e.target.value});
$('play').onclick=()=>state.playing?pause():void play();$('restart').onclick=()=>{seek(0);void play();};$('still').onclick=()=>seek(APP_CONFIG.stillTime);
$('timeline').addEventListener('input',e=>seek(Number(e.target.value)));$('sound').onclick=toggleSound;
$('fullscreen').onclick=async()=>{try{await $('stage').requestFullscreen();}catch{announce('当前浏览器未允许全屏。');}};$('exit-fullscreen').onclick=()=>document.exitFullscreen();
document.addEventListener('fullscreenchange',()=>{$('exit-fullscreen').hidden=!document.fullscreenElement;});
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea,button,[contenteditable="true"]')||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='Space'){e.preventDefault();state.playing?pause():void play();}
  if(e.code==='ArrowRight'||e.code==='ArrowLeft'){e.preventDefault();seek(clamp(state.time+(e.code==='ArrowRight'?1:-1)/30,0,projectDuration()));}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('pagehide',()=>{frameExportController?.abort();void customAudioAsset?.dispose();fontManager.disposeAll();for(const url of layerImageUrls.values())URL.revokeObjectURL(url);renderer?.dispose();},{once:true});
audio.addEventListener('ended',()=>{if(state.playing&&state.sound)syncAudioToProjectTime(state.time,true);});
audio.addEventListener('error',()=>{if(state.sound){state.sound=false;timeStart=state.time;clockStart=performance.now();updateSoundButton();announce('音频加载失败，画面仍可预览。');}});
function updateProject(patch,message='项目设置已更新。'){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('项目更新格式无效。');
  const merged={...state.project,...patch};
  for(const key of ['meta','preview','layout','timeline','audio','beat','theme','typography','export','batch'])if(patch[key])merged[key]={...state.project[key],...patch[key]};
  if(patch.timeline?.stages)merged.timeline.stages={...state.project.timeline.stages,...patch.timeline.stages};
  if(patch.theme?.colors)merged.theme.colors={...state.project.theme.colors,...patch.theme.colors};
  if(patch.typography?.number)merged.typography.number={...state.project.typography.number,...patch.typography.number};
  if(patch.typography?.text)merged.typography.text={...state.project.typography.text,...patch.typography.text};
  return applyProject(merged,message);
}
async function setCustomAudioFile(file){
  const next=await createManagedAudioAsset(file);await customAudioAsset?.dispose();customAudioAsset=next;audio.src=next.objectUrl;
  updateProject({audio:{source:'custom',name:next.metadata.name,mimeType:next.metadata.type,assetId:'local-custom-audio',trimStart:0,trimEnd:next.duration,timelineStart:0,timelineEnd:null}},`已载入自定义音轨“${next.metadata.name}”。`);return{metadata:next.metadata,duration:next.duration};
}
function setAudioSource(source){
  if(!['original','custom','none'].includes(source))throw new Error('音轨来源无效。');
  if(source==='custom'&&!customAudioAsset)throw new Error('请先选择自定义音频文件。');
  pause();return updateProject({audio:{source}},source==='none'?'已关闭项目音轨。':source==='original'?'已切换为原版音轨。':'已切换为自定义音轨。');
}
async function loadProjectFont(file,target='text'){
  if(!['number','text'].includes(target))throw new Error('字体用途无效。');
  const metadata=await fontManager.load(file),fonts=[...state.project.typography.fonts.filter(font=>font.id!==metadata.id),metadata];
  updateProject({typography:{fonts,[target]:{...state.project.typography[target],family:metadata.family}}},`已为${target==='number'?'数字':'文字'}载入字体“${metadata.family}”。`);return metadata;
}
const layerImageUrls=new Map();
async function setLayerImageFile(layerId,file){
  const metadata=inspectLayerImageFile(file);
  const url=URL.createObjectURL(file),image=new Image();image.decoding='async';
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('图片无法解码。'));image.src=url;});assertLayerImageDimensions(image);}
  catch(error){URL.revokeObjectURL(url);throw error;}
  const previous=layerImageUrls.get(layerId);if(previous)URL.revokeObjectURL(previous);layerImageUrls.set(layerId,url);layerImages.set(layerId,image);draw();return{name:metadata.name,width:image.naturalWidth,height:image.naturalHeight};
}
function releaseLayerImage(layerId){const url=layerImageUrls.get(layerId);if(url)URL.revokeObjectURL(url);layerImageUrls.delete(layerId);return layerImages.delete(layerId);}
const videoExportOptions=config=>({options:structuredClone(state.options),design:structuredClone(state.design),view:state.view,selectedId:state.selectedId,aspect:state.aspect,framing:state.framing,quality:'1080p',start:0,end:projectDuration(),duration:projectDuration(),fps:30,includeAudio:true,project:structuredClone(state.project),runtimeAssets:{images:layerImages},audioSource:state.project.audio.source,audioBuffer:customAudioAsset?.audioBuffer,audioSettings:state.project.audio,...config});
window.ReplicaApp=Object.freeze({
  getState:snapshot,getProject:()=>structuredClone(state.project),getCustomAudioBuffer:()=>customAudioAsset?.audioBuffer??null,setProject:project=>applyProject(project),updateProject,setCustomAudioFile,setAudioSource,loadProjectFont,setLayerImageFile,releaseLayerImage,setOptions,setView,setAspect,setOptionSource,setDesign,importSettings:applyImport,exportSettings:()=>serializeProject(state.project),exportFrames:config=>exportFrameZip(videoExportOptions(config)),
  exportGif:config=>exportGif(videoExportOptions(config)),
  checkVideoExport:config=>loadVideoExporter().then(module=>module.checkMp4ExportSupport(videoExportOptions(config))),
  exportVideo:config=>loadVideoExporter().then(module=>module.exportMp4Video(videoExportOptions(config))),seek,play,pause
});
function registerTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const tools=[
    {name:'configure_signal_design',title:'调整画面参数',description:'Update editor settings. Numeric input may exceed slider bounds; the editor shows a hint and preserves the entered value.',inputSchema:{type:'object',properties:Object.fromEntries(DESIGN_FIELDS.map(field=>[field.key,field.options?{type:'string',enum:field.options.map(option=>option.value)}:{type:field.step>=1?'integer':'number'}])),additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>setDesign(input)},
    {name:'set_signal_preview',title:'调整演出预览',description:'Change preview layout, framing and aspect ratio without changing animation.',inputSchema:{type:'object',properties:{aspect:{type:'string',enum:['16:9','4:3','1:1','9:16']},framing:{type:'string',enum:['crop','fit','reflow']},view:{type:'string',enum:['grid','single','focus','carousel','paged']},selectedId:{type:'string'}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(input.view||input.selectedId)setView(input.view??state.view,input.selectedId??state.selectedId);if(input.aspect||input.framing)setAspect(input.aspect??state.aspect,input.framing??state.framing);return snapshot();}},
    {name:'import_signal_settings',title:'导入演出配置',description:'Import a SIGNAL JSON configuration, or an option array. Validate the entire document before replacing settings. Unavailable in preset mode.',inputSchema:{type:'object',properties:{json:{type:'string'}},required:['json'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(state.source.mode!=='custom')throw new Error('预设模式下不能导入。');return applyImport(input.json);}},
    {name:'get_signal_scene',title:'读取数字演出',description:'Read current options, source mode, layout, time and playback state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>snapshot()},
    {name:'configure_signal_options',title:'修改演出选项',description:'Replace all custom options in one batch. Unavailable in preset mode. Updates the same scene as the visible editor.',inputSchema:{type:'object',properties:{options:{type:'array',minItems:1,maxItems:APP_CONFIG.maxOptions,items:{type:'object',properties:{id:{type:'string'},label:{type:'string'},value:{type:'string'}},required:['id','label','value'],additionalProperties:false}}},required:['options'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>setOptions(input.options)},
    {name:'seek_signal_scene',title:'查看演出帧',description:'Pause playback and seek to a project time.',inputSchema:{type:'object',properties:{time:{type:'number',minimum:0}},required:['time'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>seek(input.time)},
    {name:'set_signal_option_source',title:'切换选项来源',description:'Switch between development custom input and release preset selection. Built-in preset ids: four-difficulties, ez-zero.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['custom','preset']},presetId:{type:'string'}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>setOptionSource(input)}
  ];
  for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
try{
  renderDesignEditor();await Promise.all([document.fonts.load('900 320px Saira'),document.fonts.load('400 24px Saira')]);await document.fonts.ready;
  if(!document.fonts.check('900 320px Saira'))throw new Error('Font unavailable');
  state.ready=true;renderEditor();setView(state.view,state.selectedId);setAspect(state.aspect);$('loading').hidden=true;$('play').disabled=false;updatePlayButton();registerTools();
}catch{$('loading').textContent='Saira 字体加载失败，请刷新页面重试。';announce('字体尚未就绪。');}
if(state.ready){
  try{const {initStudioFeatures}=await import('./studio-features.js');await initStudioFeatures(window.ReplicaApp);}
  catch(error){announce(`Studio 扩展初始化失败：${error.message}`);console.error(error);}
}
