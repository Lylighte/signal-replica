import {evaluateProjectAtTime,normalizeProject} from './project-model.js';
import {getBeatEffectState} from './beat-sync.js';
import {planStudioLayout} from './studio-layout.js';
import {drawLayers,findMissingImageLayers,normalizeLayers} from './layers.js';

const framingMode=value=>value==='contain'?'fit':value==='cover'?'crop':value;
const normalizedProjectCache=new WeakMap();
function normalizedProject(input){
  if(!input||typeof input!=='object')return normalizeProject(input);
  const cached=normalizedProjectCache.get(input);if(cached)return cached;
  const normalized=normalizeProject(input);normalizedProjectCache.set(input,normalized);normalizedProjectCache.set(normalized,normalized);return normalized;
}

function runtimeTheme(theme){
  const colors=theme?.colors??{};
  return{
    numberColor:colors.number,
    textColor:colors.text,
    glowColor:colors.glow,
    backgroundColor:colors.background,
    scanlineColor:colors.scanline,
    glitchLight:colors.glitch,
    flashColor:colors.glitch
  };
}

function runtimeFonts(typography){
  return{
    numberFamily:typography?.number?.family||'Saira',
    textFamily:typography?.text?.family||'Saira',
    numberLetterSpacing:typography?.number?.letterSpacing??0,textLetterSpacing:typography?.text?.letterSpacing??0,
    numberStroke:typography?.number?.stroke??0,textStroke:typography?.text?.stroke??0,
    numberShadow:typography?.number?.shadow??0,textShadow:typography?.text?.shadow??0
  };
}

function optionTransforms(options){
  return Object.fromEntries(options.map(option=>[option.id,{
    x:Number(option.position?.x)||0,
    y:Number(option.position?.y)||0,
    scale:Number.isFinite(Number(option.scale))?Number(option.scale):1,
    opacity:Number.isFinite(Number(option.opacity))?Number(option.opacity):1,
    rotation:Number(option.rotation)||0
  }]));
}

function adaptProjectLayer(layer,duration){
  if(layer?.enter&&layer?.exit&&layer?.mask&&typeof layer.mask==='object'&&layer?.glow&&typeof layer.glow==='object')return{
    ...layer,x:layer.position?.x??layer.x,y:layer.position?.y??layer.y,
    scaleX:layer.scale??layer.scaleX,scaleY:layer.scale??layer.scaleY
  };
  const enterDuration=Math.min(.35,Math.max(0,Number(layer.enterAt)||0));
  const exitAt=layer.exitAt==null?duration:Number(layer.exitAt);
  const exitDuration=Math.min(.35,Math.max(0,duration-exitAt));
  const common={
    id:layer.id,type:layer.type,name:layer.name,visible:layer.visible!==false,zIndex:layer.zIndex,
    x:layer.position?.x??layer.x??960,y:layer.position?.y??layer.y??540,width:layer.width,height:layer.height,
    rotation:layer.rotation,scaleX:layer.scale??layer.scaleX??1,scaleY:layer.scale??layer.scaleY??1,
    opacity:layer.opacity,blendMode:layer.blendMode,
    glow:{enabled:Number(layer.glow)>0,blur:Number(layer.glow)||0,strength:1,color:layer.color??'#fff'},
    mask:{type:layer.mask==='rounded-rect'?'rounded':layer.mask??'none',radius:24,inset:0},
    enter:enterDuration?{type:'fade',at:0,duration:enterDuration}:{type:'none'},
    exit:exitDuration?{type:'fade',at:exitAt,duration:exitDuration}:{type:'none'}
  };
  if(layer.type==='text')return{...common,text:layer.text,fontFamily:layer.fontFamily,fontSize:layer.fontSize,fontWeight:String(layer.fontWeight),fill:layer.color,align:layer.align};
  return{...common,assetId:layer.assetId??layer.id,src:'',fit:layer.fit??'contain'};
}

export function createProjectRenderState(projectInput,time,{images}={}){
  const base=normalizedProject(projectInput);
  const evaluated=evaluateProjectAtTime(base,time,{normalized:true}),project=evaluated.project;
  const aspect=project.preview.aspect,framing=framingMode(project.preview.framing);
  const mode=project.layout.mode==='focus'&&project.preview.view==='single'?'single':project.layout.mode;
  const layout=planStudioLayout(project.options,{
    mode,grid:project.layout.grid,aspect,framing,order:project.layout.order,page:project.layout.page,
    spacing:project.layout.spacing,selectedId:project.layout.selectedId??project.preview.selectedId,
    carouselDuration:project.layout.carouselDuration,time:evaluated.projectTime,
    labelFontSize:project.typography.text.size??project.design.labelSize,
    numberFontSize:project.typography.number.size??project.design.numberSize
  });
  const beat=project.beat??{},triggers=beat.triggers??{};
  const beatEffect=getBeatEffectState(evaluated.projectTime,{
    enabled:beat.enabled,bpm:beat.bpm,offset:beat.offset??0,subdivision:beat.subdivision,intensity:Math.min(1,Math.max(0,beat.intensity??0)),attack:beat.attack,decay:beat.decay,
    flash:beat.flash??triggers.flash,numberJump:beat.numberJump??triggers.numberJump,rgbSplit:beat.rgbSplit??triggers.rgbSplit,shake:beat.shake??triggers.shake
  });
  const runtimeDesign={...project.design};if(Number.isFinite(Number(project.effects?.glitchStrength)))runtimeDesign.glitchStrength=Number(project.effects.glitchStrength);
  const normalizedLayers=normalizeLayers((project.layers??[]).map(layer=>adaptProjectLayer(layer,project.timeline.duration)));
  const missingImages=findMissingImageLayers(normalizedLayers,{images});
  const scene={
    signalTime:evaluated.signalTime,panels:layout.panels,optionTransforms:optionTransforms(project.options),
    theme:runtimeTheme(project.theme),fonts:runtimeFonts(project.typography),beatEffect,
    drawLayers:normalizedLayers.length?({ctx,mapping})=>{
      ctx.save();ctx.setTransform(mapping.scale,0,0,mapping.scale,mapping.offsetX,mapping.offsetY);
      drawLayers(ctx,normalizedLayers,{time:evaluated.projectTime,duration:project.timeline.duration,images,viewport:{x:0,y:0,width:mapping.logicalWidth,height:mapping.logicalHeight}});
      ctx.restore();
    }:null
  };
  const assetIssues=Object.freeze(missingImages.map(layer=>`图片图层“${layer.name||layer.id}”尚未载入本地文件。`));
  return Object.freeze({project,projectTime:evaluated.projectTime,signalTime:evaluated.signalTime,design:runtimeDesign,options:project.options,view:project.preview.view,selectedId:project.preview.selectedId,aspect,framing,layout,assetIssues,scene});
}

export function createProjectSceneFactory(project,runtime={}){
  const normalized=normalizedProject(project);
  return time=>createProjectRenderState(normalized,time,runtime);
}

