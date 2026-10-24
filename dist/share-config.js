import {normalizeProject,sanitizeProjectForShare} from './project-model.js';

export const SHARE_FRAGMENT_PREFIX='#signal=v2.';
export const DEFAULT_SHARE_URL_LIMIT=8000;
export const MAX_SHARE_PAYLOAD_BYTES=2*1024*1024;

function bytesToBase64(bytes){
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
  if(typeof btoa==='function')return btoa(binary);
  if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');
  throw new Error('当前环境不支持分享链接编码。');
}
function base64ToBytes(base64){
  let binary;
  if(typeof atob==='function')binary=atob(base64);
  else if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(base64,'base64'));
  else throw new Error('当前环境不支持分享链接解码。');
  const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return bytes;
}
const base64Url=bytes=>bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromBase64Url=value=>{
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('分享链接包含无效字符。');
  return base64ToBytes(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
};

export function encodeShareFragment(project){
  const safe=sanitizeProjectForShare(project),json=JSON.stringify(safe),bytes=new TextEncoder().encode(json);
  if(bytes.byteLength>MAX_SHARE_PAYLOAD_BYTES)throw new Error('项目配置过大，无法生成分享链接；请导出 JSON 文件。');
  return SHARE_FRAGMENT_PREFIX+base64Url(bytes);
}

export function extractShareFragment(value){
  const input=String(value??'').trim(),hash=input.includes('#')?`#${input.split('#').slice(1).join('#')}`:input.startsWith('signal=')?`#${input}`:input;
  if(!hash.startsWith('#signal='))throw new Error('链接中没有 SIGNAL 项目配置。');
  if(!hash.startsWith(SHARE_FRAGMENT_PREFIX))throw new Error('不支持此分享链接版本。');
  const payload=hash.slice(SHARE_FRAGMENT_PREFIX.length);if(!payload)throw new Error('分享链接缺少项目数据。');return payload;
}

export function decodeShareFragment(fragment){
  let bytes,json,data;
  try{bytes=fromBase64Url(extractShareFragment(fragment));}catch(error){if(error?.message?.includes('分享链接'))throw error;throw new Error('分享链接编码已损坏。');}
  if(bytes.byteLength>MAX_SHARE_PAYLOAD_BYTES)throw new Error('分享链接项目数据超过安全大小限制。');
  try{json=new TextDecoder('utf-8',{fatal:true}).decode(bytes);data=JSON.parse(json);}catch{throw new Error('分享链接中的项目数据已损坏。');}
  return normalizeProject(data);
}

export function inspectShareLength(project,{baseUrl='',maxLength=DEFAULT_SHARE_URL_LIMIT}={}){
  const limit=Number(maxLength);if(!Number.isFinite(limit)||limit<1)throw new Error('分享链接长度上限无效。');
  const fragment=encodeShareFragment(project),urlLength=String(baseUrl).split('#')[0].length+fragment.length,tooLong=urlLength>limit;
  return{fragment,urlLength,maxLength:limit,tooLong,message:tooLong?`分享链接长 ${urlLength} 个字符，超过 ${limit} 字符建议上限；请改为下载 JSON 配置。`:`分享链接长度 ${urlLength}/${limit}，可以复制分享。`};
}

export function createShareUrl(project,baseUrl=globalThis.location?.href??'',options={}){
  const root=String(baseUrl).split('#')[0],diagnostic=inspectShareLength(project,{...options,baseUrl:root});
  return{...diagnostic,url:root+diagnostic.fragment};
}
