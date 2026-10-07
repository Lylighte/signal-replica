// All adjustable visual values have one definition for rendering and the editor.
import {DEFAULT_SETTINGS} from './default-settings.js';
const field=(key,label,min,max,step,unit='')=>({key,label,value:DEFAULT_SETTINGS.design[key],min,max,step,unit});
const choice=(key,label,options)=>({key,label,value:DEFAULT_SETTINGS.design[key],options});
const ORIGINAL_GROUPS=[
  {name:'数字与光晕',open:true,fields:[
    field('numberSize','数字字号',200,800,1,'px'),field('numberWeight','数字字重',100,900,100),
    field('numberWidth','数字字宽',0.5,2,.01),field('numberBrightness','数字亮度',0,255,1),
    field('numberGlowRadius','数字光晕范围',0,90,1,'px'),field('numberGlowStrength','数字光晕强度',0,2,.01),
    field('scanStrength','字内细纹强度',0,.2,.005),field('scanSpacing','字内细纹间距',2,20,1,'px')
  ]},
  {name:'间距与滚动列',open:false,fields:[
    field('numberGap','初始横向间距',0,520,1,'px'),field('rowPitch','纵向数字间距',200,800,1,'px'),
    field('finalColumns','最终滚动列数',4,8,1,'列'),field('finalColumnGap','最终横向间距',0,340,1,'px'),
    field('finalWidth','最终数字字宽',0.2,1.2,.01),field('singleScale','单列数字大小',0.5,2.5,.01)
  ]},
  {name:'选项文字',open:false,fields:[
    field('labelSize','选项字号',12,72,1,'px'),field('labelWeight','选项字重',100,900,100),
    field('labelBrightness','选项亮度',0,255,1),field('labelGlowRadius','选项光晕范围',0,56,1,'px'),
    field('labelGlowStrength','选项光晕强度',0,4,.01),field('optionGap','选项初始间距',40,180,1,'px'),
    field('labelLeft','展开后左侧位置',-120,240,1,'px'),field('labelRight','展开后右侧位置',480,840,1,'px'),
    field('labelMaxWidth','选项最大宽度',60,300,1,'px'),field('labelExitLeft','左侧移出距离',100,720,1,'px'),
    field('labelExitRight','右侧移出距离',100,720,1,'px')
  ]},
  {name:'画面亮度与故障',open:false,fields:[
    field('centerBrightness','中心亮度',.3,1, .01),field('edgeBrightness','边缘亮度',0,1,.01),
    field('vignetteKnee','晕影过渡位置',0,1,.01),field('motionBlur','纵向拖影强度',0.1,3.5,.01),
    field('glitchStrength','故障撕裂强度',0,2,.01),field('flashBrightness','反色闪光亮度',0,255,1),
    field('washBrightness','灰色闪光亮度',0,255,1),
    field('scanLineStrength','亮处扫描线强度',0,0.3,.005),field('scanLineSpacing','扫描线间距',2,24,1,'px'),
    field('scanLineWidth','扫描线宽度',0.5,4,.5,'px'),
    field('noiseStrength','滚动前噪声强度',0,1,.01),field('noiseDensity','噪声块数量',50,1200,1),
    field('noiseBlockSize','噪声块大小',4,40,1,'px'),field('noiseBandStrength','噪声横条强度',0,.6,.01)
  ]},
  {name:'入场与缓动',open:false,fields:[
    choice('easingCurve','选项展开曲线',[{value:'quadratic',label:'二次方'},{value:'power',label:'次方（可调指数）'},{value:'sigmoid',label:'Sigmoid（可调陡度）'}]),
    field('easingPower','次方指数',2,8,.1),field('sigmoidSteepness','Sigmoid 陡度',4,30,.5),
    field('settleWindow','对齐过渡时长',.05,.2,.01,'s'),field('settleStagger','从左到右就位错开',0,.5,.005,'s'),
    field('introDuration','选项收拢时长',0.2,1.8,.01,'s'),field('introSpread','入场展开比例',1,3,.01),
    field('introSize','选项入场大小',1,2.5,.01),field('introBlur','选项入场模糊',0,30,1,'px'),
    field('selectDuration','选中项平移时长',0.3,1.7,.01,'s'),field('expandDuration','选项展开时长',0.25,1.5,.01,'s'),
    field('labelExitDuration','选项移出时长',1,12,.01,'s'),
    field('pressStart','选项按下时点',0,4,.01,'s'),field('pressDuration','按下效果时长',.2,.8,.01,'s'),
    field('pressFade','消失与恢复时长',.03,.2,.01,'s'),field('pressOpacity','按下最低亮度',0,.4,.01),
    field('exitLetterSpread','离场字符展开幅度',0,60,1,'px'),field('exitExpandDuration','离场字符展开时长',0.08,0.8,.01,'s')
  ]},
  {name:'屏幕曲面',open:false,fields:[
    choice('screenCurve','老电视机曲面',[{value:'flat',label:'关闭'},{value:'curved',label:'开启'}]),
    field('screenCurvature','曲面弯曲强度',0,0.12,.005)
  ]},
  {name:'滚动与右推',open:false,fields:[
    field('rollSpeed','整体滚动速度',.25,3,.01),field('placeRatio','高位初始速度比例',.05,.8,.01),
    field('placeStagger','各位加速错开',0,.8,.01,'s'),field('speedConverge','接近同速所需时间',4,9,.01,'s'),
    field('pushDuration','向右推进时长',1,5,.01,'s'),field('revealStagger','高位渐入错开',0,.6,.01,'s')
  ]}
];
export const DESIGN_FIELDS=ORIGINAL_GROUPS.flatMap(group=>group.fields);
const byKey=new Map(DESIGN_FIELDS.map(f=>[f.key,f]));
const group=(name,keys,open=false)=>({name,open,fields:keys.split(' ').map(key=>byKey.get(key))});
export const DESIGN_GROUPS=[
  group('数字外观与光晕','numberSize numberWeight numberWidth numberBrightness numberGlowRadius numberGlowStrength singleScale',true),
  group('数字间距与列数','numberGap rowPitch finalColumns finalColumnGap finalWidth'),
  group('选项文字与位置','labelSize labelWeight labelBrightness labelGlowRadius labelGlowStrength optionGap labelLeft labelRight labelMaxWidth labelExitLeft labelExitRight'),
  group('选项入场与按下','introDuration introSpread introSize introBlur pressStart pressDuration pressFade pressOpacity'),
  group('选项选择、展开与离场','selectDuration expandDuration easingCurve easingPower sigmoidSteepness exitLetterSpread exitExpandDuration labelExitDuration'),
  group('数字对齐与就位','settleWindow settleStagger'),
  group('加速滚动与右推','rollSpeed placeRatio placeStagger speedConverge pushDuration revealStagger'),
  group('画面亮度与拖影','centerBrightness edgeBrightness vignetteKnee motionBlur'),
  group('扫描线与曲面','scanStrength scanSpacing scanLineStrength scanLineSpacing scanLineWidth screenCurve screenCurvature'),
  group('噪声与故障','noiseStrength noiseDensity noiseBlockSize noiseBandStrength glitchStrength flashBrightness washBrightness')
];
export const DEFAULT_DESIGN=Object.freeze(Object.fromEntries(DESIGN_FIELDS.map(f=>[f.key,f.value])));
export const outsideSliderRange=(field,value)=>!field.options&&(value<field.min||value>field.max);
export function validateDesign(patch,current=DEFAULT_DESIGN){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('画面参数格式无效。');
  const result={...current};
  for(const [key,value]of Object.entries(patch)){
    const field=byKey.get(key);
    if(!field)throw new Error('未知画面参数。');
    if(field.options){
      if(!field.options.some(option=>option.value===value))throw new Error(`${field.label}选项无效。`);
    }else if(typeof value!=='number'||!Number.isFinite(value)||(field.step>=1&&!Number.isInteger(value)))throw new Error(`${field.label}需为有效${field.step>=1?'整数':'数值'}。`);
    result[key]=value;
  }
  return result;
}
