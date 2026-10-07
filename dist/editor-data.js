import {validateOptions} from './config.js';
import {validateDesign} from './design.js';
export const ASPECTS=Object.freeze({'16:9':{width:1920,height:1080},'4:3':{width:1440,height:1080}});
export function moveOption(options,id,direction){
  if(![-1,1].includes(direction))throw new Error('排序方向无效。');
  const result=validateOptions(options),index=result.findIndex(option=>option.id===id);
  if(index<0)throw new Error('选项不存在。');
  const target=index+direction;
  if(target>=0&&target<result.length)[result[index],result[target]]=[result[target],result[index]];
  return result;
}
export function exportSettings({options,design,view,selectedId,aspect}){
  return JSON.stringify({format:'signal-studio',version:1,options:validateOptions(options),design:validateDesign(design),preview:{view,selectedId,aspect}},null,2)+'\n';
}
export function importSettings(text,current){
  let data;try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('文件不是有效的 JSON。');}
  if(!data||typeof data!=='object')throw new Error('配置文件格式无效。');
  if(!Array.isArray(data)&&data.version!==undefined&&data.version!==1)throw new Error('不支持此配置文件版本。');
  if(data.format!==undefined&&data.format!=='signal-studio')throw new Error('此文件不是 SIGNAL 配置。');
  const raw=Array.isArray(data)?data:data.options;
  if(!Array.isArray(raw))throw new Error('文件缺少选项列表。');
  const options=validateOptions(raw.map((option,index)=>({...option,id:option?.id??`imported-${index+1}`})));
  const design=validateDesign(data.design??{},current.design),preview=data.preview??{};
  if(!preview||typeof preview!=='object'||Array.isArray(preview))throw new Error('预览设置格式无效。');
  const aspect=preview.aspect??current.aspect,view=preview.view??current.view;
  if(!Object.hasOwn(ASPECTS,aspect)||!['grid','single'].includes(view))throw new Error('预览比例或布局无效。');
  const selectedId=preview.selectedId??current.selectedId;
  return {options,design,view,aspect,selectedId:options.some(option=>option.id===selectedId)?selectedId:options[0].id};
}
// Accepted input remains stored even when a browser cannot draw it. No values are clamped.
export function previewIssue(design){
  const positive=['numberSize','numberWidth','labelSize','labelMaxWidth','scanSpacing','scanLineSpacing'];
  if(positive.some(key=>design[key]<=0))return '字号、字宽和扫描线间距需为正数才能预览；输入值已保留。';
  if(1080/design.scanSpacing>50000||1080/design.scanLineSpacing>50000)return '扫描线间距过小，超过实时绘制容量；输入值已保留。';
  if(design.vignetteKnee<0||design.vignetteKnee>1)return '晕影过渡位置需在 0–1 之间才能预览；输入值已保留。';
  const pad=Math.max(4,design.numberGlowRadius*3),width=design.numberSize*design.numberWidth+pad*2,height=design.numberSize+pad*2;
  const labelExtent=design.labelSize*12+Math.max(4,design.labelGlowRadius*3)*2;
  if(Math.max(width,height,labelExtent)>8192||width*height>16*1024*1024||design.finalColumns>128||design.noiseDensity>50000)
    return '当前数值超过本页可实时绘制的容量；输入值已保留，预览保留上一有效画面。';
  return '';
}
