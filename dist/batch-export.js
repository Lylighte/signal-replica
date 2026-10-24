export const MAX_BATCH_CONCURRENCY=2;
export const BATCH_TASK_STATES=Object.freeze(['queued','running','completed','failed','cancelled']);

const encoder=new TextEncoder();
const INVALID_FILENAME=/[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED=/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const abortError=()=>new DOMException('批量导出任务已取消。','AbortError');

export function sanitizeExportFileName(value,{fallback='signal-export',maxLength=180}={}){
  let result=String(value??'').normalize('NFKC').replace(INVALID_FILENAME,'-').replace(/\.{2,}/g,'.').replace(/\s+/g,' ').trim();
  result=result.replace(/^[. ]+|[. ]+$/g,'');
  if(!result||WINDOWS_RESERVED.test(result))result=fallback;
  if(Array.from(result).length>maxLength)result=Array.from(result).slice(0,maxLength).join('').replace(/[. ]+$/g,'');
  return result||fallback;
}

const pad=value=>String(value).padStart(2,'0');
const dateParts=value=>{
  const date=value instanceof Date&&!Number.isNaN(value.valueOf())?value:new Date();
  return{date:`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,time:`${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`};
};

export function formatBatchFileName(template='signal-{index}-{label}',values={}, {extension='',now}={}){
  if(typeof template!=='string'||!template.trim()||template.length>512)throw new Error('文件名模板无效。');
  const clock=dateParts(now),tokens={...clock,...values,index:values.index??1,label:values.label??'',value:values.value??'',id:values.id??''};
  const rendered=template.replace(/\{([a-z][a-z0-9_-]*)\}/gi,(_match,key)=>Object.hasOwn(tokens,key)?String(tokens[key]??''):'');
  let name=sanitizeExportFileName(rendered);
  if(extension){
    const suffix=String(extension).replace(/^\.+/,'').replace(/[^a-z0-9]+/gi,'').slice(0,12).toLowerCase();
    if(!suffix)throw new Error('导出文件扩展名无效。');
    if(!name.toLowerCase().endsWith(`.${suffix}`))name=sanitizeExportFileName(`${name}.${suffix}`);
  }
  return name;
}

const crcTable=(()=>{
  const table=new Uint32Array(256);
  for(let index=0;index<256;index++){let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;table[index]=value>>>0;}
  return table;
})();
const crc32=bytes=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;};
const asBytes=async value=>{
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  if(typeof Blob!=='undefined'&&value instanceof Blob)return new Uint8Array(await value.arrayBuffer());
  if(typeof value==='string')return encoder.encode(value);
  throw new Error('ZIP 条目必须是 Blob、字符串或二进制数据。');
};
const zipName=value=>sanitizeExportFileName(value,{fallback:'file',maxLength:220});

function localHeader(nameBytes,checksum,size){
  const header=new Uint8Array(30),view=new DataView(header.buffer);
  view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(8,0,true);
  view.setUint16(10,0,true);view.setUint16(12,0x21,true);view.setUint32(14,checksum,true);view.setUint32(18,size,true);view.setUint32(22,size,true);view.setUint16(26,nameBytes.length,true);
  return header;
}
function centralHeader(nameBytes,checksum,size,offset){
  const header=new Uint8Array(46),view=new DataView(header.buffer);
  view.setUint32(0,0x02014b50,true);view.setUint16(4,20,true);view.setUint16(6,20,true);view.setUint16(8,0x800,true);view.setUint16(10,0,true);
  view.setUint16(12,0,true);view.setUint16(14,0x21,true);view.setUint32(16,checksum,true);view.setUint32(20,size,true);view.setUint32(24,size,true);view.setUint16(28,nameBytes.length,true);view.setUint32(42,offset,true);
  return header;
}
function endRecord(count,centralSize,centralOffset){
  const output=new Uint8Array(22),view=new DataView(output.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,count,true);view.setUint16(10,count,true);view.setUint32(12,centralSize,true);view.setUint32(16,centralOffset,true);return output;
}

export async function buildStoreZip(files,{type='application/zip'}={}){
  const entries=Array.isArray(files)?files:Object.entries(files??{}).map(([name,data])=>({name,data}));
  if(!entries.length)throw new Error('ZIP 至少需要一个文件。');
  if(entries.length>0xffff)throw new Error('ZIP 文件数量超过 65535 个。');
  const names=new Set(),rows=[],parts=[];let offset=0;
  for(const entry of entries){
    if(!entry||typeof entry!=='object')throw new Error('ZIP 条目格式无效。');
    let name=zipName(entry.name),counter=2;
    const dot=name.lastIndexOf('.'),base=dot>0?name.slice(0,dot):name,extension=dot>0?name.slice(dot):'';
    while(names.has(name.toLowerCase()))name=sanitizeExportFileName(`${base}-${counter++}${extension}`,{fallback:'file',maxLength:220});
    names.add(name.toLowerCase());
    const nameBytes=encoder.encode(name);if(nameBytes.length>0xffff)throw new Error('ZIP 文件名过长。');
    const bytes=await asBytes(entry.data??entry.blob??entry.bytes),size=bytes.byteLength;
    if(size>0xffffffff||offset+30+nameBytes.length+size>0xffffffff)throw new Error('ZIP 超过 4 GiB，当前浏览器不支持 ZIP64。');
    const checksum=crc32(bytes),header=localHeader(nameBytes,checksum,size);
    parts.push(header,nameBytes,bytes);rows.push({name,nameBytes,checksum,size,offset});offset+=header.length+nameBytes.length+size;
  }
  const centralOffset=offset;let centralSize=0;
  for(const row of rows){const header=centralHeader(row.nameBytes,row.checksum,row.size,row.offset);parts.push(header,row.nameBytes);centralSize+=header.length+row.nameBytes.length;}
  if(centralOffset+centralSize>0xffffffff)throw new Error('ZIP 超过 4 GiB，当前浏览器不支持 ZIP64。');
  parts.push(endRecord(rows.length,centralSize,centralOffset));
  const blob=new Blob(parts,{type});
  return{blob,entries:rows.map(({name,size})=>({name,size})),size:blob.size};
}

export async function createStoreZip(files,options){return(await buildStoreZip(files,options)).blob;}

let nextTaskId=0;
const taskId=()=>`batch-${Date.now().toString(36)}-${(++nextTaskId).toString(36)}`;
const progressValue=(current,total)=>{
  const value=total===undefined?Number(current):Number(current)/Number(total);
  return Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
};

export class BatchExportQueue{
  constructor({exporter,concurrency=1,onUpdate}={}){
    if(typeof exporter!=='function')throw new Error('批量导出队列需要 exporter 函数。');
    this.exporter=exporter;this.listeners=new Set();this.tasks=[];this.runningPromise=null;this.disposed=false;
    this.setConcurrency(concurrency);
    if(onUpdate)this.subscribe(onUpdate);
  }

  setConcurrency(value){
    const number=Number(value);
    if(!Number.isInteger(number)||number<1||number>MAX_BATCH_CONCURRENCY)throw new Error(`批量编码并发数需为 1–${MAX_BATCH_CONCURRENCY}。`);
    if(this.runningPromise)throw new Error('批量导出运行时不能修改并发数。');
    this.concurrency=number;return this;
  }

  subscribe(listener){
    if(typeof listener!=='function')throw new Error('队列监听器必须是函数。');
    this.listeners.add(listener);return()=>this.listeners.delete(listener);
  }

  _snapshot(task){return{id:task.id,label:task.label,status:task.status,progress:task.progress,fileName:task.fileName,error:task.error?.message??null,metadata:{...task.metadata},output:task.output};}
  list(){return this.tasks.map(task=>this._snapshot(task));}
  get(id){const task=this.tasks.find(item=>item.id===id);return task?this._snapshot(task):null;}
  _emit(task){const snapshot=this._snapshot(task);for(const listener of this.listeners)try{listener(snapshot,this.list());}catch(error){queueMicrotask(()=>{throw error;});}}
  _assertActive(){if(this.disposed)throw new Error('批量导出队列已经释放。');}

  addTask(input,{id=taskId(),label='',fileNameTemplate='signal-{index}-{label}',extension='mp4',metadata={}}={}){
    this._assertActive();const resolvedId=String(id).trim();if(!resolvedId||this.tasks.some(task=>task.id===resolvedId))throw new Error('批量任务标识为空或重复。');
    const index=this.tasks.length+1,fileName=formatBatchFileName(fileNameTemplate,{...metadata,index,label,id:resolvedId},{extension});
    const task={id:resolvedId,input,label:String(label),metadata:{...metadata},fileNameTemplate,extension,fileName,status:'queued',progress:0,error:null,output:null,controller:null};
    this.tasks.push(task);this._emit(task);return this._snapshot(task);
  }
  enqueue(input,options){return this.addTask(input,options);}

  removeTask(id){
    const index=this.tasks.findIndex(task=>task.id===id);if(index<0)return false;
    if(this.tasks[index].status==='running')throw new Error('请先取消正在编码的任务。');
    const [task]=this.tasks.splice(index,1);this._emit(task);return true;
  }

  cancelTask(id){
    const task=this.tasks.find(item=>item.id===id);if(!task)return false;
    if(task.status==='queued'){task.status='cancelled';task.error=null;this._emit(task);return true;}
    if(task.status==='running'){task.controller.abort();return true;}
    return false;
  }

  cancelAll(){let changed=false;for(const task of this.tasks)changed=this.cancelTask(task.id)||changed;return changed;}

  retryTask(id){
    this._assertActive();const task=this.tasks.find(item=>item.id===id);if(!task)throw new Error('找不到批量导出任务。');
    if(!['failed','cancelled'].includes(task.status))throw new Error('只有失败或已取消的任务可以重试。');
    task.status='queued';task.progress=0;task.error=null;task.output=null;task.controller=null;this._emit(task);return this._snapshot(task);
  }

  async _execute(task){
    if(task.status!=='queued')return;
    task.status='running';task.controller=new AbortController();task.progress=0;this._emit(task);
    try{
      const output=await this.exporter(task.input,{
        signal:task.controller.signal,task:this._snapshot(task),
        onProgress:(current,total)=>{if(task.status!=='running')return;task.progress=progressValue(current,total);this._emit(task);}
      });
      if(task.controller.signal.aborted)throw abortError();
      if(output===null||output===undefined)throw new Error('导出器未返回文件。');
      task.output=output;task.fileName=sanitizeExportFileName(output.fileName??output.filename??task.fileName);
      task.progress=1;task.status='completed';task.error=null;
    }catch(error){
      task.output=null;task.progress=0;
      if(task.controller.signal.aborted||error?.name==='AbortError'){task.status='cancelled';task.error=null;}
      else{task.status='failed';task.error=error instanceof Error?error:new Error(String(error));}
    }finally{task.controller=null;this._emit(task);}
  }

  run(){
    this._assertActive();if(this.runningPromise)return this.runningPromise;
    const pending=this.tasks.filter(task=>task.status==='queued');
    this.runningPromise=(async()=>{
      let cursor=0;
      const worker=async()=>{while(cursor<pending.length){const task=pending[cursor++];await this._execute(task);}};
      await Promise.all(Array.from({length:Math.min(this.concurrency,pending.length)},worker));
      return this.list();
    })().finally(()=>{this.runningPromise=null;});
    return this.runningPromise;
  }

  async createZip({includeManifest=true,manifestName='manifest.json'}={}){
    const completed=this.tasks.filter(task=>task.status==='completed');if(!completed.length)throw new Error('没有可打包的已完成任务。');
    const files=[];
    for(const task of completed){
      const data=task.output?.blob??task.output?.bytes??task.output;
      files.push({name:task.fileName,data});
    }
    if(includeManifest)files.push({name:manifestName,data:JSON.stringify({format:'signal-studio-batch',version:1,createdAt:new Date().toISOString(),tasks:completed.map(task=>({id:task.id,label:task.label,fileName:task.fileName,metadata:task.metadata}))},null,2)+'\n'});
    return createStoreZip(files);
  }

  clearCompleted(){
    const before=this.tasks.length;this.tasks=this.tasks.filter(task=>task.status!=='completed');return before-this.tasks.length;
  }

  dispose(){
    this.cancelAll();for(const task of this.tasks){const url=task.output?.objectUrl??task.output?.url;if(typeof url==='string'&&url.startsWith('blob:'))URL.revokeObjectURL(url);task.output=null;}
    this.listeners.clear();this.disposed=true;
  }
}
