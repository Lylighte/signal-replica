import {addKeyframe,copyKeyframe,moveKeyframe,removeKeyframe} from './keyframes.js';
import {analyzeBeatGrid,getBeatMarkers} from './beat-sync.js';
import {BUILTIN_THEMES,THEME_COLOR_KEYS,importCustomTheme,normalizeTheme,serializeCustomTheme} from './themes.js';
import {BUILT_IN_TEMPLATES,addCustomTemplate,applyTemplate,createTemplateFromProject,deleteCustomTemplate,duplicateTemplate,exportTemplate,importTemplate,loadCustomTemplates,saveCustomTemplates} from './templates.js';
import {createShareUrl,decodeShareFragment,SHARE_FRAGMENT_PREFIX} from './share-config.js';
import {normalizeLayer} from './layers.js';
import {BatchExportQueue,createBatchExportInput} from './batch-export.js';

const $=id=>document.getElementById(id);
const value=id=>$(id)?.value;
const number=id=>Number(value(id));
const download=(data,name,type='application/json')=>{
  const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
const report=message=>{for(const id of ['form-status','advanced-status'])if($(id))$(id).textContent=message;};

export function createLayerListButton(layer,{selected=false,onSelect,documentRef=globalThis.document}={}){
  if(!documentRef?.createElement)throw new Error('当前环境无法创建图层控件。');
  const button=documentRef.createElement('button'),identity=documentRef.createElement('span'),order=documentRef.createElement('span');
  button.type='button';button.className=`layer-item${selected?' is-selected':''}`;
  identity.textContent=`${layer?.type==='text'?'T':'▧'} · ${String(layer?.name??'')}`;
  order.textContent=String(layer?.zIndex??'');
  button.replaceChildren(identity,order);
  if(typeof onSelect==='function')button.onclick=onSelect;
  return button;
}

export async function initStudioFeatures(app=window.ReplicaApp){
  if(!app)throw new Error('SIGNAL Studio 主控制器尚未就绪。');
  let project=app.getProject(),selectedKeyframeId=null,selectedLayerId=null,customThemes=[];
  try{customThemes=JSON.parse(localStorage.getItem('signal-custom-themes-v1')??'[]').map(theme=>normalizeTheme(theme));}catch{customThemes=[];}
  let customTemplates=[];try{customTemplates=loadCustomTemplates();}catch{customTemplates=[];}

  const refreshProject=()=>project=app.getProject();
  const update=(patch,message)=>{app.updateProject(patch,message);refreshProject();reflect();};
  const safe=action=>{try{const result=action();if(result?.catch)result.catch(error=>report(error.message));return result;}catch(error){report(error.message);}};

  for(const button of $('studio-tabs').querySelectorAll('button'))button.addEventListener('click',()=>{
    for(const item of $('studio-tabs').querySelectorAll('button'))item.setAttribute('aria-pressed',String(item===button));
    for(const panel of document.querySelectorAll('.studio-panel')){const active=panel.id===button.dataset.panel;panel.hidden=!active;panel.classList.toggle('is-active',active);}
  });

  const updateLayout=()=>safe(()=>update({preview:{view:value('display-mode')==='focus'?'single':value('display-mode'),framing:value('framing-mode')},layout:{mode:value('display-mode'),grid:value('layout-mode'),spacing:number('layout-spacing'),page:Math.max(0,number('layout-page')-1),framing:value('framing-mode'),aspect:project.preview.aspect}},'布局已更新。'));
  for(const id of ['display-mode','layout-mode','layout-spacing','layout-page'])$(id).addEventListener('change',updateLayout);
  $('framing-mode').addEventListener('change',()=>safe(()=>app.setAspect(project.preview.aspect,value('framing-mode'))));

  const stageIds={intro:'duration-intro',select:'duration-select',roll:'duration-roll',stable:'duration-stable',glitch:'duration-glitch',exit:'duration-exit'};
  $('duration-total').addEventListener('change',()=>safe(()=>update({timeline:{duration:number('duration-total')}},'总时长已更新，各阶段按比例缩放。')));
  for(const [key,id]of Object.entries(stageIds))$(id).addEventListener('change',()=>safe(()=>{
    const stages={...project.timeline.stages,[key]:number(id)},duration=Object.values(stages).reduce((sum,item)=>sum+item,0);update({timeline:{duration,stages}},`${key} 阶段时长已更新。`);
  }));
  $('timeline-zoom').addEventListener('input',()=>safe(()=>update({timeline:{zoom:number('timeline-zoom')}},'时间轴缩放已更新。')));

  function keyframeValue(path,raw){
    if(/\.(?:label|value|text)$/.test(path))return String(raw);
    const parsed=Number(raw);if(!Number.isFinite(parsed))throw new Error('此关键帧需要数值。');return parsed;
  }
  function resolvedKeyframePath(){
    const requested=value('keyframe-property');
    if(requested.startsWith('options.selected.'))return requested.replace('options.selected.',`options.${project.preview.selectedId}.`);
    if(requested.startsWith('layers.selected.')){if(!selectedLayerId||!selectedLayer())throw new Error('请先在“图层”面板选择一个图层。');return requested.replace('layers.selected.',`layers.${selectedLayerId}.`);}
    return requested;
  }
  const editorKeyframePath=path=>String(path).replace(/^options\.[^.]+\./,'options.selected.').replace(/^layers\.[^.]+\./,'layers.selected.');
  function selectedKeyframe(){return project.timeline.keyframes.find(item=>item.id===selectedKeyframeId);}
  function renderKeyframes(){
    const track=$('keyframe-track');track.replaceChildren();track.style.width=`${Math.max(100,project.timeline.zoom*100)}%`;
    for(const item of project.timeline.keyframes){
      const marker=document.createElement('button');marker.type='button';marker.className='keyframe-marker';marker.classList.toggle('is-selected',item.id===selectedKeyframeId);marker.style.left=`${item.time/project.timeline.duration*100}%`;marker.title=`${item.path} · ${item.time.toFixed(3)} s`;marker.dataset.id=item.id;
      marker.addEventListener('click',()=>{selectedKeyframeId=item.id;const editable=editorKeyframePath(item.path);if([...$('keyframe-property').options].some(option=>option.value===editable))$('keyframe-property').value=editable;$('keyframe-value').value=typeof item.value==='object'?JSON.stringify(item.value):String(item.value);$('keyframe-easing').value=item.easing;renderKeyframes();});
      marker.addEventListener('pointerdown',event=>{event.preventDefault();marker.setPointerCapture(event.pointerId);const rect=track.getBoundingClientRect();const move=moveEvent=>{const time=Math.max(0,Math.min(project.timeline.duration,(moveEvent.clientX-rect.left)/rect.width*project.timeline.duration));const keyframes=moveKeyframe(project.timeline.keyframes,item.id,time,{duration:project.timeline.duration});app.updateProject({timeline:{keyframes}},'关键帧已移动。');refreshProject();renderKeyframes();};marker.addEventListener('pointermove',move);marker.addEventListener('pointerup',()=>marker.removeEventListener('pointermove',move),{once:true});});
      track.append(marker);
    }
  }
  $('keyframe-add').addEventListener('click',()=>safe(()=>{
    const path=resolvedKeyframePath(),before=new Set(project.timeline.keyframes.map(item=>item.id)),keyframes=addKeyframe(project.timeline.keyframes,{path,time:app.getState().time,value:keyframeValue(path,value('keyframe-value')),easing:value('keyframe-easing')},{duration:project.timeline.duration});selectedKeyframeId=keyframes.find(item=>!before.has(item.id))?.id;update({timeline:{keyframes}},'已在播放头新增关键帧。');
  }));
  $('keyframe-copy').addEventListener('click',()=>safe(()=>{if(!selectedKeyframe())throw new Error('请先选择关键帧。');const keyframes=copyKeyframe(project.timeline.keyframes,selectedKeyframeId,{timeOffset:.1},{duration:project.timeline.duration});selectedKeyframeId=keyframes.find(item=>!project.timeline.keyframes.some(old=>old.id===item.id))?.id;update({timeline:{keyframes}},'关键帧已复制。');}));
  $('keyframe-delete').addEventListener('click',()=>safe(()=>{if(!selectedKeyframe())throw new Error('请先选择关键帧。');const keyframes=removeKeyframe(project.timeline.keyframes,selectedKeyframeId,{duration:project.timeline.duration});selectedKeyframeId=null;update({timeline:{keyframes}},'关键帧已删除。');}));

  function themeList(){return[...BUILTIN_THEMES,...customThemes];}
  function renderThemePicker(){
    const themes=themeList(),options=themes.map(theme=>{const option=document.createElement('option');option.value=theme.id;option.textContent=theme.name;return option;});
    if(!themes.some(theme=>theme.id===project.theme.preset)){const option=document.createElement('option');option.value=project.theme.preset;option.textContent='当前自定义';options.push(option);}
    $('theme-select').replaceChildren(...options);$('theme-select').value=project.theme.preset;
    const controls=$('theme-controls');controls.replaceChildren();for(const key of THEME_COLOR_KEYS){const label=document.createElement('label');label.textContent={number:'数字',text:'文字',glow:'光晕',background:'背景',scanline:'扫描线',glitch:'故障'}[key];const input=document.createElement('input');input.id=`theme-${key}`;input.value=project.theme.colors[key];input.addEventListener('change',()=>safe(()=>update({theme:{preset:'custom',colors:{[key]:input.value}}},`${label.textContent}颜色已更新。`)));label.append(input);controls.append(label);}
  }
  $('theme-select').addEventListener('change',()=>safe(()=>{const theme=themeList().find(item=>item.id===value('theme-select'));if(!theme)throw new Error('主题不存在。');update({theme:{preset:theme.id,colors:theme.colors}},`已应用“${theme.name}”主题。`);}));
  $('theme-save').addEventListener('click',()=>safe(()=>{const name=prompt('自定义主题名称','我的主题');if(!name)return;const id=`custom-${Date.now().toString(36)}`,theme=normalizeTheme({id,name,colors:project.theme.colors});customThemes.push(theme);localStorage.setItem('signal-custom-themes-v1',JSON.stringify(customThemes));update({theme:{preset:id,colors:theme.colors}},'自定义主题已保存在本机。');}));
  $('theme-import').addEventListener('click',()=>{$('theme-file').value='';$('theme-file').click();});$('theme-file').addEventListener('change',event=>safe(async()=>{const file=event.target.files?.[0];if(!file)return;const theme=importCustomTheme(await file.text());if(BUILTIN_THEMES.some(item=>item.id===theme.id))throw new Error('导入主题不能覆盖内置主题。');customThemes=customThemes.filter(item=>item.id!==theme.id);customThemes.push(theme);localStorage.setItem('signal-custom-themes-v1',JSON.stringify(customThemes));update({theme:{preset:theme.id,colors:theme.colors}},'主题已导入。');}));
  $('theme-export').addEventListener('click',()=>safe(()=>{const selected=themeList().find(item=>item.id===value('theme-select'))??{id:'custom',name:'当前自定义',colors:project.theme.colors};download(serializeCustomTheme(selected),`${selected.id}.signal-theme.json`);}));
  $('theme-delete').addEventListener('click',()=>safe(()=>{const id=value('theme-select');if(BUILTIN_THEMES.some(item=>item.id===id))throw new Error('内置主题不能删除。');if(!customThemes.some(item=>item.id===id))throw new Error('当前临时主题尚未保存。');customThemes=customThemes.filter(item=>item.id!==id);localStorage.setItem('signal-custom-themes-v1',JSON.stringify(customThemes));const original=BUILTIN_THEMES.find(item=>item.id==='original');update({theme:{preset:original.id,colors:original.colors}},'自定义主题已删除。');}));

  $('number-font-file').addEventListener('change',event=>{const file=event.target.files?.[0];if(file)safe(()=>app.loadProjectFont(file,'number'));});$('text-font-file').addEventListener('change',event=>{const file=event.target.files?.[0];if(file)safe(()=>app.loadProjectFont(file,'text'));});
  const fontFields={number:{size:'number-font-size',weight:'number-font-weight',letterSpacing:'number-letter-spacing',stroke:'number-stroke',shadow:'number-shadow'},text:{size:'text-font-size',weight:'text-font-weight',letterSpacing:'text-letter-spacing',stroke:'text-stroke',shadow:'text-shadow'}};
  for(const [target,fields]of Object.entries(fontFields))for(const [key,id]of Object.entries(fields))$(id).addEventListener('change',()=>safe(()=>update({typography:{[target]:{[key]:number(id)}}},`${target==='number'?'数字':'文字'}字体样式已更新。`)));

  $('audio-file').addEventListener('change',event=>{const file=event.target.files?.[0];if(file)safe(async()=>{await app.setCustomAudioFile(file);refreshProject();reflect();});});
  $('audio-source').addEventListener('change',()=>safe(()=>app.setAudioSource(value('audio-source'))));
  const audioFields={volume:'audio-volume',muted:'audio-muted',trimStart:'audio-trim-start',trimEnd:'audio-trim-end',timelineStart:'audio-timeline-start',timelineEnd:'audio-timeline-end',loop:'audio-loop',fadeIn:'audio-fade-in',fadeOut:'audio-fade-out'};
  for(const [key,id]of Object.entries(audioFields))$(id).addEventListener('change',()=>safe(()=>{const input=$(id),optional=['trimEnd','timelineEnd'].includes(key),next=input.type==='checkbox'?input.checked:optional&&input.value===''?null:Number(input.value);update({audio:{[key]:next}},'音轨设置已更新。');}));
  const beatFields={enabled:'beat-enabled',bpm:'beat-bpm',offset:'beat-offset',subdivision:'beat-subdivision',intensity:'beat-intensity',flash:'beat-flash',numberJump:'beat-number-jump',rgbSplit:'beat-rgb-split',shake:'beat-shake'};for(const [key,id]of Object.entries(beatFields))$(id).addEventListener('change',()=>safe(()=>update({beat:{[key]:$(id).type==='checkbox'?$(id).checked:Number($(id).value)}},'Beat Sync 已更新。')));
  $('beat-analyze').addEventListener('click',()=>safe(async()=>{const buffer=app.getCustomAudioBuffer();if(!buffer)throw new Error('自动节拍分析需要先导入自定义音乐。');report('正在分析节拍…');const result=analyzeBeatGrid(buffer,{end:buffer.duration??buffer.length/buffer.sampleRate,onProgress:progress=>report(`正在分析节拍 ${Math.round(progress*100)}%…`)});update({beat:{enabled:true,bpm:result.bpm,offset:result.offset,analysis:'web-audio'}},`分析完成：${result.bpm.toFixed(2)} BPM，置信度 ${Math.round(result.confidence*100)}%。`);}));
  function renderBeatMarkers(){const host=$('beat-markers');host.replaceChildren();if(!project.beat.enabled)return;for(const marker of getBeatMarkers({start:0,end:project.timeline.duration,bpm:project.beat.bpm,offset:project.beat.offset,subdivision:project.beat.subdivision})){const line=document.createElement('span');line.className=`beat-marker${marker.major?' major':''}`;line.style.left=`${marker.time/project.timeline.duration*100}%`;line.title=`${marker.time.toFixed(3)} s`;host.append(line);}}

  function selectedLayer(){return project.layers.find(layer=>layer.id===selectedLayerId);}
  function renderLayers(){const host=$('layers-list');host.replaceChildren();for(const layer of project.layers){const button=createLayerListButton(layer,{selected:layer.id===selectedLayerId,onSelect:()=>{selectedLayerId=layer.id;renderLayers();reflectLayer();}});host.append(button);}if(!selectedLayerId&&project.layers[0]){selectedLayerId=project.layers[0].id;renderLayers();reflectLayer();}}
  function reflectLayer(){const layer=selectedLayer();if(!layer)return;$('layer-type').value=layer.type;$('layer-text').value=layer.text??'';$('layer-color').value=typeof layer.fill==='string'?layer.fill:'#ffffff';$('layer-font-size').value=layer.fontSize??72;$('layer-x').value=layer.x;$('layer-y').value=layer.y;$('layer-width').value=layer.width;$('layer-height').value=layer.height;$('layer-rotation').value=layer.rotation;$('layer-opacity').value=layer.opacity;$('layer-z').value=layer.zIndex;$('layer-blend').value=layer.blendMode;$('layer-mask').value=layer.mask.type;$('layer-glow').value=layer.glow.blur;$('layer-enter').value=layer.enter.type;$('layer-enter-duration').value=layer.enter.duration;$('layer-exit').value=layer.exit.type;$('layer-exit-duration').value=layer.exit.duration;}
  const layerPatch=()=>{const current=selectedLayer();if(!current)return null;return normalizeLayer({...current,type:value('layer-type'),text:value('layer-text'),fill:value('layer-color'),fontSize:number('layer-font-size'),x:number('layer-x'),y:number('layer-y'),width:number('layer-width'),height:number('layer-height'),rotation:number('layer-rotation'),opacity:number('layer-opacity'),zIndex:number('layer-z'),blendMode:value('layer-blend'),mask:{...current.mask,type:value('layer-mask')},glow:{...current.glow,enabled:number('layer-glow')>0,blur:number('layer-glow')},enter:{...current.enter,type:value('layer-enter'),duration:number('layer-enter-duration')},exit:{...current.exit,type:value('layer-exit'),duration:number('layer-exit-duration')}});};
  for(const id of ['layer-type','layer-text','layer-color','layer-font-size','layer-x','layer-y','layer-width','layer-height','layer-rotation','layer-opacity','layer-z','layer-blend','layer-mask','layer-glow','layer-enter','layer-enter-duration','layer-exit','layer-exit-duration'])$(id).addEventListener('change',()=>safe(()=>{const layer=layerPatch();if(!layer)return;update({layers:project.layers.map(item=>item.id===layer.id?layer:item)},'图层已更新。');}));
  $('layer-add').addEventListener('click',()=>safe(()=>{const id=`layer-${Date.now().toString(36)}`,type=value('layer-type'),layer=normalizeLayer({id,type,name:type==='text'?'文字图层':'Logo 图层',text:value('layer-text')||'SIGNAL',fill:value('layer-color')||'#ffffff',fontSize:number('layer-font-size')||72,assetId:type==='image'?id:null,x:project.preview.aspect==='9:16'?540:960,y:540,width:480,height:240,zIndex:project.layers.length});selectedLayerId=id;update({layers:[...project.layers,layer]},'图层已添加。');}));
  $('layer-delete').addEventListener('click',()=>safe(()=>{const layer=selectedLayer();if(!layer)throw new Error('请先选择图层。');const id=layer.id;selectedLayerId=null;app.releaseLayerImage?.(id);update({layers:project.layers.filter(item=>item.id!==id)},'图层已删除。');}));
  const moveLayer=direction=>safe(()=>{const layer=selectedLayer();if(!layer)throw new Error('请先选择图层。');const ordered=[...project.layers].sort((a,b)=>a.zIndex-b.zIndex),index=ordered.findIndex(item=>item.id===layer.id),target=index+direction;if(target<0||target>=ordered.length)return;[ordered[index],ordered[target]]=[ordered[target],ordered[index]];update({layers:ordered.map((item,zIndex)=>({...item,zIndex}))},'图层顺序已更新。');});$('layer-up').onclick=()=>moveLayer(1);$('layer-down').onclick=()=>moveLayer(-1);
  $('layer-file').addEventListener('change',event=>safe(async()=>{const layer=selectedLayer(),file=event.target.files?.[0];if(!layer||layer.type!=='image')throw new Error('请先选择图片图层。');if(!file)return;const info=await app.setLayerImageFile(layer.id,file);update({layers:project.layers.map(item=>item.id===layer.id?{...item,name:file.name,fileName:file.name,mimeType:file.type,width:info.width,height:info.height,assetId:layer.id}:item)},'Logo 已载入并加入最终渲染。');}));

  function allTemplates(){return[...BUILT_IN_TEMPLATES,...customTemplates];}
  function renderTemplates(){const select=$('template-select');select.replaceChildren(...allTemplates().map(template=>{const option=document.createElement('option');option.value=template.id;option.textContent=`${template.builtin?'内置':'本机'} · ${template.name}`;return option;}));}
  const currentTemplate=()=>allTemplates().find(item=>item.id===value('template-select'));
  $('template-apply').onclick=()=>safe(()=>{const template=currentTemplate();if(!template)throw new Error('模板不存在。');app.setProject(applyTemplate(template));refreshProject();reflect();report(`已应用模板“${template.name}”。`);});
  $('template-save').onclick=()=>safe(()=>{const name=prompt('模板名称',project.meta.name);if(!name)return;customTemplates=addCustomTemplate(customTemplates,createTemplateFromProject(project,{id:`custom-${Date.now().toString(36)}`,name}));saveCustomTemplates(customTemplates);renderTemplates();report('模板已保存在本机。');});
  $('template-copy').onclick=()=>safe(()=>{const template=currentTemplate();if(!template)throw new Error('模板不存在。');customTemplates=duplicateTemplate(customTemplates,template.id,{newId:`custom-${Date.now().toString(36)}`});saveCustomTemplates(customTemplates);renderTemplates();report('模板副本已创建。');});
  $('template-delete').onclick=()=>safe(()=>{const template=currentTemplate();if(!template||template.builtin)throw new Error('内置模板不能删除。');customTemplates=deleteCustomTemplate(customTemplates,template.id);saveCustomTemplates(customTemplates);renderTemplates();report('自定义模板已删除。');});
  $('template-import').onclick=()=>{$('template-file').value='';$('template-file').click();};$('template-file').onchange=event=>safe(async()=>{const file=event.target.files?.[0];if(!file)return;customTemplates=addCustomTemplate(customTemplates,importTemplate(await file.text()));saveCustomTemplates(customTemplates);renderTemplates();report('模板已导入。');});
  $('template-export').onclick=()=>safe(()=>{const template=currentTemplate();if(!template)throw new Error('模板不存在。');download(exportTemplate(template),`${template.id}.signal-template.json`);});

  $('share-create').onclick=()=>safe(()=>{const result=createShareUrl(project,location.href);$('share-link').value=result.url;$('share-status').textContent=result.message;if(result.tooLong)report('分享链接过长，请使用“导出 JSON”。');});
  $('share-copy').onclick=()=>safe(async()=>{if(!$('share-link').value)throw new Error('请先生成分享链接。');await navigator.clipboard.writeText($('share-link').value);report('分享链接已复制。');});

  const queue=new BatchExportQueue({concurrency:1,exporter:async(input,{signal,onProgress})=>app.exportVideo({...input,signal,onProgress:(percent,message)=>{onProgress(percent,100);report(message);}}),onUpdate:()=>renderBatch()});
  function renderBatch(){const host=$('batch-list');host.replaceChildren();for(const task of queue.list()){const row=document.createElement('div');row.className='batch-item';const label=document.createElement('span');label.textContent=`${task.label||task.id} · ${task.status}${task.error?` · ${task.error}`:''}`;const progress=document.createElement('progress');progress.className='batch-progress';progress.max=1;progress.value=task.progress;row.append(label,progress);host.append(row);}}
  const enqueueProject=(source,label)=>queue.addTask(createBatchExportInput(source,{audioBuffer:source.audio.source==='custom'?app.getCustomAudioBuffer?.()??null:null}),{label,fileNameTemplate:value('batch-filename'),metadata:{label,value:source.options.find(item=>item.id===source.preview.selectedId)?.value??source.options[0]?.value}});
  $('batch-add').onclick=()=>safe(()=>{refreshProject();const label=project.options.find(item=>item.id===project.preview.selectedId)?.label??project.meta.name;enqueueProject(project,label);report('已将当前项目加入批量队列。');});
  $('batch-add-variants').onclick=()=>safe(()=>{refreshProject();const lines=value('batch-variants').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);if(!lines.length)throw new Error('请输入至少一行“标签|数字”。');const selectedId=project.preview.selectedId;for(const [index,line]of lines.entries()){const split=line.indexOf('|');if(split<1)throw new Error(`第 ${index+1} 行需使用“标签|数字”格式。`);const label=line.slice(0,split).trim(),numberValue=line.slice(split+1).trim();if(!label||Array.from(label).length>12)throw new Error(`第 ${index+1} 行标签需为 1–12 个字符。`);if(!/^\d{1,4}$/.test(numberValue))throw new Error(`第 ${index+1} 行数字需为 1–4 位。`);const variant=structuredClone(project),option=variant.options.find(item=>item.id===selectedId);option.label=label;option.value=numberValue;enqueueProject(variant,label);}report(`已批量加入 ${lines.length} 个替换任务。`);});
  $('batch-run').onclick=()=>safe(async()=>{await queue.run();report('批量队列已结束，可下载 ZIP。');});$('batch-cancel').onclick=()=>{queue.cancelAll();report('正在取消批量任务。');};$('batch-retry').onclick=()=>safe(async()=>{for(const task of queue.list())if(['failed','cancelled'].includes(task.status))queue.retryTask(task.id);await queue.run();});$('batch-zip').onclick=()=>safe(async()=>download(await queue.createZip(),'signal-batch.zip','application/zip'));

  function reflect(){
    project=app.getProject();$('display-mode').value=project.layout.mode;$('layout-mode').value=project.layout.grid;$('layout-spacing').value=project.layout.spacing;$('layout-page').value=project.layout.page+1;$('framing-mode').value=project.preview.framing;
    $('duration-total').value=project.timeline.duration;for(const [key,id]of Object.entries(stageIds))$(id).value=project.timeline.stages[key];$('timeline-zoom').value=project.timeline.zoom;renderKeyframes();
    renderThemePicker();for(const [target,fields]of Object.entries(fontFields))for(const [key,id]of Object.entries(fields))$(id).value=project.typography[target][key]??'';
    $('audio-source').value=project.audio.source;$('audio-name').textContent=project.audio.source==='custom'?project.audio.name:project.audio.source==='original'?'原版 audio.wav':'无音轨';for(const [key,id]of Object.entries(audioFields)){const input=$(id),current=project.audio[key];if(input.type==='checkbox')input.checked=current;else input.value=current??'';}
    for(const [key,id]of Object.entries(beatFields)){const input=$(id);if(input.type==='checkbox')input.checked=project.beat[key];else input.value=project.beat[key];}renderBeatMarkers();renderLayers();renderTemplates();
  }
  window.addEventListener('signal-project-change',event=>{project=event.detail.project;reflect();});
  window.addEventListener('pagehide',()=>queue.dispose(),{once:true});
  if(location.hash.startsWith(SHARE_FRAGMENT_PREFIX))safe(()=>{app.setProject(decodeShareFragment(location.hash));refreshProject();report('已从分享链接载入项目配置；本地资源需要在本机重新选择。');});
  reflect();return{queue,refresh:reflect};
}

