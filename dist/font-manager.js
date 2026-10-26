export const FONT_FORMATS=Object.freeze({
  ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'
});
export const MAX_LOCAL_FONT_BYTES=64*1024*1024;

const basename=value=>String(value??'').split(/[\\/]/).at(-1).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,180);
const abortError=()=>new DOMException('字体加载已取消。','AbortError');
const throwIfAborted=signal=>{if(signal?.aborted)throw abortError();};
const finite=(value,fallback,label,{min,max,integer=false}={})=>{
  const number=value===undefined||value===null||value===''?fallback:Number(value);
  if(!Number.isFinite(number)||(integer&&!Number.isInteger(number))||number<min||number>max)throw new Error(`${label}无效。`);
  return number;
};

function extensionOf(name){
  const match=String(name).toLowerCase().match(/\.([a-z0-9]+)$/);return match?.[1]??'';
}

export function inspectFontFile(file){
  if(!file||typeof file.arrayBuffer!=='function')throw new Error('请选择有效的本地字体文件。');
  const name=basename(file.name),extension=extensionOf(name),expectedType=FONT_FORMATS[extension];
  if(!expectedType)throw new Error('仅支持 TTF、OTF、WOFF 和 WOFF2 字体。');
  const size=Number(file.size);
  if(!Number.isFinite(size)||size<=0)throw new Error('字体文件为空或大小无效。');
  if(size>MAX_LOCAL_FONT_BYTES)throw new Error('单个字体文件不能超过 64 MiB。');
  const suppliedType=String(file.type??'').toLowerCase();
  const acceptedTypes=new Set([expectedType,'application/font-sfnt','application/x-font-ttf','application/x-font-opentype','application/font-woff','font/x-woff','']);
  if(!acceptedTypes.has(suppliedType))throw new Error('字体文件类型与扩展名不匹配。');
  return Object.freeze({name,extension,mimeType:expectedType,size});
}

const cleanFamily=value=>{
  const family=String(value??'').replace(/[\u0000-\u001f\u007f"'`;{}]/g,' ').replace(/\s+/g,' ').trim().slice(0,128);
  if(!family)throw new Error('字体名称不能为空。');
  return family;
};

export function normalizeFontStyle(style={},defaults={}){
  if(!style||typeof style!=='object'||Array.isArray(style))throw new Error('字体样式格式无效。');
  const base={family:'Saira',weight:400,size:null,letterSpacing:0,stroke:0,shadow:0,...defaults};
  const requestedSize=style.size===undefined?base.size:style.size;
  const size=requestedSize===null?null:finite(requestedSize,base.size,'字号',{min:1,max:4096});
  return Object.freeze({
    family:cleanFamily(style.family??base.family),
    weight:finite(style.weight,base.weight,'字重',{min:1,max:1000,integer:true}),
    size,
    letterSpacing:finite(style.letterSpacing,base.letterSpacing,'字距',{min:-500,max:2000}),
    stroke:finite(style.stroke,base.stroke,'描边',{min:0,max:500}),
    shadow:finite(style.shadow,base.shadow,'阴影',{min:0,max:1000})
  });
}

export function normalizeTypographyStyles(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('字体设置格式无效。');
  return Object.freeze({
    number:normalizeFontStyle(input.number??{}, {weight:900}),
    text:normalizeFontStyle(input.text??{}, {weight:400})
  });
}

const cleanId=value=>{
  const id=String(value??'').trim().replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96);
  return id||null;
};

export function sanitizeFontMetadata(fonts=[]){
  if(!Array.isArray(fonts))throw new Error('字体元数据列表格式无效。');
  return fonts.map((font,index)=>{
    if(!font||typeof font!=='object'||Array.isArray(font))throw new Error(`第 ${index+1} 个字体元数据无效。`);
    const id=cleanId(font.id)??`font-${index+1}`,family=cleanFamily(font.family),name=basename(font.name);
    const extension=extensionOf(name),mimeType=FONT_FORMATS[extension]??String(font.mimeType??'').toLowerCase();
    if(!Object.values(FONT_FORMATS).includes(mimeType))throw new Error(`第 ${index+1} 个字体类型无效。`);
    const weight=String(font.weight??'normal').trim().slice(0,32)||'normal';
    const style=['normal','italic','oblique'].includes(font.style)?font.style:'normal';
    return{id,family,name,mimeType,weight,style};
  });
}

/** Remove local buffers, object URLs, file handles and paths before sharing. */
export function sanitizeTypographyForShare(typography={}){
  if(!typography||typeof typography!=='object'||Array.isArray(typography))throw new Error('字体设置格式无效。');
  const styles=normalizeTypographyStyles(typography);
  return{...styles,fonts:sanitizeFontMetadata(typography.fonts??[])};
}

function waitForPromise(promise,{signal,timeoutMs=15000,label='字体加载'}={}){
  throwIfAborted(signal);
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);callback(value);};
    const onAbort=()=>finish(reject,abortError());
    const timer=setTimeout(()=>finish(reject,new Error(`${label}超时。`)),timeoutMs);
    signal?.addEventListener('abort',onAbort,{once:true});
    Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));
  });
}

export async function waitForFontsReady(fontSet=globalThis.document?.fonts,{families=[],signal,timeoutMs=15000}={}){
  if(!fontSet)throw new Error('当前浏览器不支持 Font Loading API。');
  throwIfAborted(signal);
  const unique=[...new Set(families.map(cleanFamily))];
  if(typeof fontSet.load==='function')for(const family of unique){
    const result=await waitForPromise(fontSet.load(`16px "${family.replace(/"/g,'')}"`),{signal,timeoutMs,label:`字体 ${family} 加载`});
    if(Array.isArray(result)&&result.length===0)throw new Error(`字体“${family}”尚未加载，已停止导出。`);
  }
  if(fontSet.ready)await waitForPromise(fontSet.ready,{signal,timeoutMs,label:'字体就绪等待'});
  throwIfAborted(signal);
}

let sequence=0;

export class LocalFontManager{
  constructor({FontFaceClass=globalThis.FontFace,fontSet=globalThis.document?.fonts}={}){
    this.FontFaceClass=FontFaceClass;this.fontSet=fontSet;this.records=new Map();this.disposed=false;
  }

  get loaded(){return [...this.records.values()].map(record=>({...record.metadata}));}

  async load(file,{family,weight='normal',style='normal',id,signal}={}){
    if(this.disposed)throw new Error('字体管理器已经释放。');
    if(typeof this.FontFaceClass!=='function'||!this.fontSet||typeof this.fontSet.add!=='function')throw new Error('当前浏览器不支持本地字体加载。');
    const inspected=inspectFontFile(file),resolvedFamily=cleanFamily(family??inspected.name.replace(/\.[^.]+$/,''));
    const resolvedStyle=['normal','italic','oblique'].includes(style)?style:'normal',resolvedWeight=String(weight).trim().slice(0,32)||'normal';
    const resolvedId=cleanId(id)??`font-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
    if(this.records.has(resolvedId))throw new Error(`字体标识“${resolvedId}”已存在。`);
    throwIfAborted(signal);
    const bytes=await file.arrayBuffer();throwIfAborted(signal);
    let face,added=false;
    try{
      face=new this.FontFaceClass(resolvedFamily,bytes,{weight:resolvedWeight,style:resolvedStyle});
      const loaded=typeof face.load==='function'?await face.load():face;throwIfAborted(signal);
      this.fontSet.add(loaded);added=true;
      const metadata=Object.freeze({id:resolvedId,family:resolvedFamily,name:inspected.name,mimeType:inspected.mimeType,weight:resolvedWeight,style:resolvedStyle});
      this.records.set(resolvedId,{face:loaded,metadata});
      return{...metadata};
    }catch(error){
      if(added&&typeof this.fontSet.delete==='function')this.fontSet.delete(face);
      if(error?.name==='AbortError')throw error;
      throw new Error(`无法加载字体“${inspected.name}”。文件可能损坏或浏览器不支持该字体。`,{cause:error});
    }
  }

  async ready({families,signal,timeoutMs}={}){
    const requested=families??this.loaded.map(font=>font.family);
    await waitForFontsReady(this.fontSet,{families:requested,signal,timeoutMs});
  }

  dispose(id){
    const record=this.records.get(id);if(!record)return false;
    if(typeof this.fontSet?.delete==='function')this.fontSet.delete(record.face);
    this.records.delete(id);return true;
  }

  disposeAll(){
    for(const id of [...this.records.keys()])this.dispose(id);
    this.disposed=true;
  }
}
