import {SignalRenderer,WIDTH,HEIGHT} from './engine.js';
import {previewIssue} from './editor-data.js';

export const EXPORT_RESOLUTIONS=Object.freeze({
  '16:9':Object.freeze({width:1920,height:1080}),
  '4:3':Object.freeze({width:1440,height:1080})
});

export function getExportResolution(aspect){
  const resolution=EXPORT_RESOLUTIONS[aspect];
  if(!resolution)throw new Error('画面比例无效。');
  return resolution;
}

export function createExportRenderer({design,aspect}){
  const issue=previewIssue(design);if(issue)throw new Error(issue);
  const {width,height}=getExportResolution(aspect);
  const source=document.createElement('canvas');source.width=WIDTH;source.height=HEIGHT;
  const renderer=new SignalRenderer(source);renderer.setDesign(design);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{alpha:false});
  if(!context){renderer.dispose();throw new Error('当前浏览器无法创建导出画布。');}

  return{
    canvas,width,height,
    render(time,options,view,selectedId){
      renderer.render(time,options,view,selectedId);
      if(design.screenCurve==='curved'&&!renderer.curvatureSupported)throw new Error('当前浏览器未能渲染曲面效果，已停止导出。');
      context.fillStyle='#000';context.fillRect(0,0,width,height);
      if(aspect==='4:3')context.drawImage(source,240,0,1440,1080,0,0,width,height);
      else context.drawImage(source,0,0,width,height);
    },
    dispose(){renderer.dispose();canvas.width=1;canvas.height=1;}
  };
}
