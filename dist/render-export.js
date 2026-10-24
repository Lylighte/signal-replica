import {SignalRenderer} from './engine.js';
import {previewIssue} from './editor-data.js';
import {getExportResolution} from './export-plan.js';
import {createProjectSceneFactory} from './project-runtime.js';
import {findMissingImageLayers} from './layers.js';

export function assertProjectImageAssets(project,runtimeAssets={}){
  const missing=findMissingImageLayers(project?.layers??[],{images:runtimeAssets?.images});
  if(missing.length)throw new Error(`图片图层缺少本地文件：${missing.map(layer=>`“${layer.name||layer.id}”`).join('、')}。请重新选择图片后再导出。`);
  return true;
}

export function createExportRenderer({design,aspect,quality='1080p',framing='crop',project,runtimeAssets}={}){
  if(project)assertProjectImageAssets(project,runtimeAssets);
  const {width,height}=getExportResolution(aspect,quality);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const renderer=new SignalRenderer(canvas,{aspect,framing});
  const exportProject=project?{
    ...project,preview:{...project.preview,aspect,framing},layout:{...project.layout,aspect,framing}
  }:null;
  const sceneFactory=exportProject?createProjectSceneFactory(exportProject,runtimeAssets):null;
  let activeDesign=design,lastDesignSignature='';
  const applyDesign=next=>{
    const issue=previewIssue(next);if(issue)throw new Error(issue);
    const signature=JSON.stringify(next);
    if(signature!==lastDesignSignature){renderer.setDesign(next);lastDesignSignature=signature;}
  };
  if(design)applyDesign(design);

  return{
    canvas,width,height,framing,nativeResolution:true,
    render(time,options,view,selectedId,scene){
      let renderTime=time,renderOptions=options,renderView=view,renderSelectedId=selectedId,renderScene=scene??{};
      if(sceneFactory){
        const frame=sceneFactory(time);activeDesign={...frame.design};
        const number=frame.project.typography?.number,text=frame.project.typography?.text;
        if(number?.size!=null)activeDesign.numberSize=number.size;if(number?.weight!=null)activeDesign.numberWeight=number.weight;
        if(text?.size!=null)activeDesign.labelSize=text.size;if(text?.weight!=null)activeDesign.labelWeight=text.weight;
        renderTime=frame.signalTime;renderOptions=frame.options;renderView=frame.view;renderSelectedId=frame.selectedId;renderScene=frame.scene;
      }
      applyDesign(activeDesign);
      renderer.render(renderTime,renderOptions,renderView,renderSelectedId,renderScene);
      if(activeDesign.screenCurve==='curved'&&!renderer.curvatureSupported)throw new Error('当前浏览器未能渲染曲面效果，已停止导出。');
    },
    dispose(){renderer.dispose();canvas.width=1;canvas.height=1;}
  };
}
