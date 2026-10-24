import {createDefaultProject,normalizeProject,PROJECT_FORMAT} from './project-model.js';

export const TEMPLATE_FORMAT='signal-studio-template';
export const TEMPLATE_VERSION=1;
export const CUSTOM_TEMPLATE_STORAGE_KEY='signal-studio-custom-templates-v1';

const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
const idValue=(value,label='模板标识')=>{
  const result=String(value??'').trim();if(!result||result.length>96||!/^[\w-]+$/u.test(result))throw new Error(`${label}无效。`);return result;
};
const nameValue=value=>{const result=String(value??'').trim();if(!result||Array.from(result).length>96)throw new Error('模板名称无效。');return result;};

function projectWith(overrides){return createDefaultProject(overrides);}

const builtIns=[
  {
    id:'original-signal',name:'原版 SIGNAL',description:'保留原作动画、白色光晕与默认四难度数据。',
    project:projectWith({meta:{name:'原版 SIGNAL'},preview:{view:'single',selectedId:'at',aspect:'16:9',fitMode:'reflow'}})
  },
  {
    id:'rhythm-result',name:'音游成绩',description:'用于展示曲目难度、分数与判定结果。',
    project:projectWith({
      meta:{name:'音游成绩'},options:[{id:'score',label:'SCORE',value:'9950'},{id:'combo',label:'COMBO',value:'1268'},{id:'perfect',label:'PERFECT',value:'0987'},{id:'miss',label:'MISS',value:'0002'}],
      preview:{view:'grid',selectedId:'score',aspect:'16:9',fitMode:'reflow'},
      theme:{preset:'pink',colors:{number:'#ff8bd5',text:'#ffe4f6',glow:'rgba(255,67,190,0.9)',background:'#080008',scanline:'rgba(255,139,213,0.1)',glitch:'#5de7ff'}}
    })
  },
  {
    id:'system-boot',name:'系统启动',description:'终端式系统启动与模块状态展示。',
    project:projectWith({
      meta:{name:'系统启动'},options:[{id:'kernel',label:'KERNEL',value:'0001'},{id:'memory',label:'MEMORY',value:'4096'},{id:'signal',label:'SIGNAL',value:'0100'}],
      preview:{view:'grid',selectedId:'signal',aspect:'16:9',fitMode:'contain'},
      theme:{preset:'cyan',colors:{number:'#56fff1',text:'#bbfff9',glow:'rgba(0,255,229,0.82)',background:'#00100f',scanline:'rgba(86,255,241,0.12)',glitch:'#ff3df2'}}
    })
  },
  {
    id:'identity-auth',name:'身份认证',description:'身份编号、访问级别和认证状态模板。',
    project:projectWith({
      meta:{name:'身份认证'},options:[{id:'subject',label:'SUBJECT',value:'0721'},{id:'access',label:'ACCESS',value:'0005'},{id:'auth',label:'AUTH',value:'0001'}],
      preview:{view:'focus',selectedId:'auth',aspect:'4:3',fitMode:'reflow'},layout:{mode:'focus',focusId:'auth'},
      theme:{preset:'purple',colors:{number:'#c7a2ff',text:'#f1e8ff',glow:'rgba(146,72,255,0.9)',background:'#07020e',scanline:'rgba(199,162,255,0.1)',glitch:'#36e8ff'}}
    })
  },
  {
    id:'number-countdown',name:'数字倒计时',description:'通过离散关键帧实现的十秒倒计时。',
    project:projectWith({
      meta:{name:'数字倒计时'},options:[{id:'countdown',label:'COUNTDOWN',value:'10'}],preview:{view:'single',selectedId:'countdown',aspect:'9:16',fitMode:'reflow'},
      timeline:{duration:10,keyframes:Array.from({length:11},(_,index)=>({id:`count-${index}`,path:'options.countdown.value',time:index,value:String(10-index),easing:'linear'}))}
    })
  }
];

export const BUILT_IN_TEMPLATES=freeze(builtIns.map(template=>({...template,builtin:true,project:normalizeProject(template.project)})));

export function normalizeTemplate(template,{builtin=false}={}){
  if(!template||typeof template!=='object'||Array.isArray(template))throw new Error('模板格式无效。');
  return{
    id:idValue(template.id),name:nameValue(template.name),description:String(template.description??'').trim().slice(0,500),
    builtin:Boolean(template.builtin??builtin),project:normalizeProject(template.project??template)
  };
}

export function createTemplateFromProject(project,{id,name,description=''}={}){
  return normalizeTemplate({id:idValue(id),name:nameValue(name),description,builtin:false,project});
}

export function normalizeCustomTemplates(templates=[]){
  if(!Array.isArray(templates))throw new Error('自定义模板列表格式无效。');
  const normalized=templates.map(template=>normalizeTemplate({...template,builtin:false}));
  if(new Set(normalized.map(template=>template.id)).size!==normalized.length)throw new Error('自定义模板标识不能重复。');
  const builtInIds=new Set(BUILT_IN_TEMPLATES.map(template=>template.id));
  if(normalized.some(template=>builtInIds.has(template.id)))throw new Error('自定义模板不能使用内置模板标识。');
  return normalized;
}

export function listTemplates(customTemplates=[]){return[...clone(BUILT_IN_TEMPLATES),...normalizeCustomTemplates(customTemplates)];}

export function addCustomTemplate(templates,template){
  const current=normalizeCustomTemplates(templates),next=normalizeTemplate({...template,builtin:false});
  if(current.some(item=>item.id===next.id)||BUILT_IN_TEMPLATES.some(item=>item.id===next.id))throw new Error('模板标识已存在。');
  return[...current,next];
}

export function updateCustomTemplate(templates,id,patch){
  const current=normalizeCustomTemplates(templates),index=current.findIndex(template=>template.id===id);
  if(index<0)throw new Error('未找到该自定义模板。');
  if(patch?.id!==undefined&&patch.id!==id)throw new Error('更新模板时不能修改标识。');
  current[index]=normalizeTemplate({...current[index],...clone(patch),id,builtin:false});return current;
}

export function deleteCustomTemplate(templates,id){
  const current=normalizeCustomTemplates(templates),index=current.findIndex(template=>template.id===id);
  if(index<0)throw new Error('未找到该自定义模板。');
  return current.filter((_,itemIndex)=>itemIndex!==index);
}

export function duplicateTemplate(templates,id,{newId,name}={}){
  const current=normalizeCustomTemplates(templates),source=[...BUILT_IN_TEMPLATES,...current].find(template=>template.id===id);
  if(!source)throw new Error('未找到要复制的模板。');
  return addCustomTemplate(current,{...clone(source),id:idValue(newId,'新模板标识'),name:nameValue(name??`${source.name} 副本`),builtin:false});
}

export function exportTemplate(template,{pretty=true}={}){
  const normalized=normalizeTemplate(template);
  return JSON.stringify({format:TEMPLATE_FORMAT,version:TEMPLATE_VERSION,template:{...normalized,builtin:false}},null,pretty?2:0)+(pretty?'\n':'');
}

export function importTemplate(text){
  let data;try{data=JSON.parse(String(text).replace(/^\uFEFF/,''));}catch{throw new Error('模板文件不是有效的 JSON。');}
  if(data?.format===TEMPLATE_FORMAT){
    if(data.version!==TEMPLATE_VERSION)throw new Error('不支持此模板文件版本。');
    return normalizeTemplate({...data.template,builtin:false});
  }
  if(data?.format===PROJECT_FORMAT)return createTemplateFromProject(data,{id:'imported-template',name:data.meta?.name??'导入模板'});
  throw new Error('此文件不是 SIGNAL 模板。');
}

export function serializeCustomTemplates(templates){return JSON.stringify(normalizeCustomTemplates(templates));}
export function parseCustomTemplates(text){
  if(!text)return[];
  let data;try{data=JSON.parse(text);}catch{throw new Error('本地模板数据已损坏。');}
  return normalizeCustomTemplates(data);
}

export function loadCustomTemplates(storage=globalThis.localStorage){
  if(!storage?.getItem)return[];return parseCustomTemplates(storage.getItem(CUSTOM_TEMPLATE_STORAGE_KEY));
}
export function saveCustomTemplates(templates,storage=globalThis.localStorage){
  const normalized=normalizeCustomTemplates(templates);if(!storage?.setItem)throw new Error('当前环境无法保存本地模板。');
  storage.setItem(CUSTOM_TEMPLATE_STORAGE_KEY,JSON.stringify(normalized));return normalized;
}

export function applyTemplate(template){return normalizeProject(normalizeTemplate(template).project);}
