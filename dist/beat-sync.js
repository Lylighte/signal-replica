/** Deterministic beat-grid utilities shared by preview and frame export. */

export const DEFAULT_BEAT_SYNC=Object.freeze({
  enabled:false,
  bpm:120,
  offset:0,
  subdivision:1,
  intensity:0.6,
  attack:0.025,
  decay:0.18,
  flash:true,
  numberJump:true,
  rgbSplit:true,
  shake:true
});

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

function abortError(){const error=new Error('节拍分析已取消。');error.name='AbortError';return error;}
function throwIfAborted(signal){if(signal?.aborted)throw abortError();}

export function normalizeBeatSync(settings={}){
  const bpm=number(settings.bpm,DEFAULT_BEAT_SYNC.bpm),offset=number(settings.offset,0),
    subdivision=number(settings.subdivision,1),intensity=number(settings.intensity,DEFAULT_BEAT_SYNC.intensity),
    attack=number(settings.attack,DEFAULT_BEAT_SYNC.attack),decay=number(settings.decay,DEFAULT_BEAT_SYNC.decay);
  if(bpm<20||bpm>400)throw new Error('BPM 需在 20–400 之间。');
  if(offset<-3600||offset>3600)throw new Error('节拍偏移需在 -3600–3600 秒之间。');
  if(![1,2,4].includes(subdivision))throw new Error('节拍细分仅支持 1、2 或 4。');
  if(intensity<0||intensity>1)throw new Error('节拍效果强度需在 0–1 之间。');
  if(attack<0||decay<=0)throw new Error('节拍包络时间无效。');
  return Object.freeze({
    enabled:settings.enabled===undefined?DEFAULT_BEAT_SYNC.enabled:Boolean(settings.enabled),
    bpm,offset,subdivision,intensity,attack,decay,
    flash:settings.flash===undefined?true:Boolean(settings.flash),
    numberJump:settings.numberJump===undefined?true:Boolean(settings.numberJump),
    rgbSplit:settings.rgbSplit===undefined?true:Boolean(settings.rgbSplit),
    shake:settings.shake===undefined?true:Boolean(settings.shake)
  });
}

export function getBeatMarkers({start=0,end,bpm=120,offset=0,subdivision=1}={}){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start)throw new Error('节拍标记时间范围无效。');
  const settings=normalizeBeatSync({enabled:true,bpm,offset,subdivision}),period=60/settings.bpm/settings.subdivision;
  const firstIndex=Math.max(0,Math.ceil((start-settings.offset)/period-1e-9));
  const lastIndex=Math.floor((end-settings.offset)/period+1e-9),markers=[];
  for(let index=firstIndex;index<=lastIndex;index++){
    const time=settings.offset+index*period;
    if(time>=start-1e-9&&time<=end+1e-9)markers.push(Object.freeze({index,time,beat:index/settings.subdivision,major:index%settings.subdivision===0}));
  }
  return Object.freeze(markers);
}

/**
 * Return one deterministic effect packet for a project time. Renderers can map
 * these normalized amplitudes to their own pixels without reading wall time or
 * analyser state, so preview and offline export stay identical.
 */
export function getBeatEffectState(time,settings={}){
  if(!Number.isFinite(time)||time<0)throw new Error('节拍采样时间无效。');
  const beat=normalizeBeatSync(settings);
  const silent=Object.freeze({active:false,index:-1,time:null,phase:0,strength:0,flash:0,numberJump:0,rgbSplit:0,shake:0});
  if(!beat.enabled||time<beat.offset)return silent;
  const period=60/beat.bpm/beat.subdivision,index=Math.floor((time-beat.offset)/period+1e-9),beatTime=beat.offset+index*period,phase=Math.max(0,time-beatTime);
  if(phase>beat.attack+beat.decay)return Object.freeze({...silent,index,time:beatTime,phase});
  const envelope=beat.attack>0&&phase<beat.attack?phase/beat.attack:Math.max(0,1-(phase-beat.attack)/beat.decay);
  const strength=clamp(envelope*beat.intensity,0,1);
  return Object.freeze({
    active:strength>0,index,time:beatTime,phase,strength,
    flash:beat.flash?strength:0,
    numberJump:beat.numberJump?strength:0,
    rgbSplit:beat.rgbSplit?strength:0,
    shake:beat.shake?strength:0
  });
}

function assertAudioBuffer(audioBuffer){
  if(!audioBuffer||!Number.isInteger(audioBuffer.length)||audioBuffer.length<1||
    !Number.isInteger(audioBuffer.numberOfChannels)||audioBuffer.numberOfChannels<1||
    !Number.isFinite(audioBuffer.sampleRate)||audioBuffer.sampleRate<=0||typeof audioBuffer.getChannelData!=='function')
    throw new Error('无法分析无效的 AudioBuffer。');
  return audioBuffer;
}

/**
 * Lightweight deterministic onset/autocorrelation analysis. It is deliberately
 * an estimate: the UI should present the result for confirmation instead of
 * silently replacing a user's manual BPM.
 */
export function analyzeBeatGrid(audioBuffer,{
  start=0,end,minBpm=60,maxBpm=200,hopSize=512,signal,onProgress=()=>{}
}={}){
  const source=assertAudioBuffer(audioBuffer),duration=source.length/source.sampleRate;
  if(!Number.isFinite(start)||!Number.isFinite(end??duration)||start<0||(end??duration)<=start||(end??duration)>duration+1e-9)throw new Error('节拍分析时间范围无效。');
  if(!Number.isFinite(minBpm)||!Number.isFinite(maxBpm)||minBpm<20||maxBpm>400||maxBpm<=minBpm)throw new Error('节拍分析 BPM 范围无效。');
  if(!Number.isInteger(hopSize)||hopSize<64)throw new Error('节拍分析步长无效。');
  throwIfAborted(signal);
  const first=Math.round(start*source.sampleRate),last=Math.round((end??duration)*source.sampleRate),windowCount=Math.max(1,Math.ceil((last-first)/hopSize));
  const energy=new Float64Array(windowCount),onset=new Float64Array(windowCount),channels=Array.from({length:source.numberOfChannels},(_,index)=>source.getChannelData(index));
  for(let window=0;window<windowCount;window++){
    if(window%128===0){throwIfAborted(signal);onProgress(window/windowCount*.45);}
    const from=first+window*hopSize,to=Math.min(last,from+hopSize);
    let sum=0,count=0;
    for(let frame=from;frame<to;frame++)for(const channel of channels){const sample=channel[frame]||0;sum+=sample*sample;count++;}
    energy[window]=count?Math.sqrt(sum/count):0;
    if(window>0)onset[window]=Math.max(0,energy[window]-energy[window-1]);
  }
  const mean=onset.reduce((sum,value)=>sum+value,0)/onset.length;
  for(let index=0;index<onset.length;index++)onset[index]=Math.max(0,onset[index]-mean*.5);
  let bestBpm=minBpm,bestLag=1,bestScore=-Infinity,scoreSum=0,candidates=0;
  for(let bpm=Math.ceil(minBpm*2)/2;bpm<=maxBpm+1e-9;bpm+=.5){
    if(candidates%64===0){throwIfAborted(signal);onProgress(.45+(bpm-minBpm)/(maxBpm-minBpm)*.45);}
    const lag=Math.max(1,Math.round(source.sampleRate*60/bpm/hopSize));
    let score=0,normA=0,normB=0;
    for(let index=lag;index<onset.length;index++){
      score+=onset[index]*onset[index-lag];normA+=onset[index]*onset[index];normB+=onset[index-lag]*onset[index-lag];
    }
    score=normA&&normB?score/Math.sqrt(normA*normB):0;
    // Prefer the musically useful faster interpretation when octave aliases tie.
    score*=1+bpm/maxBpm*1e-6;
    scoreSum+=Math.max(0,score);candidates++;
    if(score>bestScore){bestScore=score;bestBpm=bpm;bestLag=lag;}
  }
  // Report the tempo represented by the winning integer analysis lag. This is
  // more accurate than whichever 0.5 BPM candidate happened to map to that lag.
  bestBpm=clamp(source.sampleRate*60/(bestLag*hopSize),minBpm,maxBpm);
  let phaseIndex=0,phaseScore=-1;
  for(let phase=0;phase<bestLag;phase++){
    let score=0;
    for(let index=phase;index<onset.length;index+=bestLag)score+=onset[index];
    if(score>phaseScore){phaseScore=score;phaseIndex=phase;}
  }
  const period=60/bestBpm,rawOffset=start+phaseIndex*hopSize/source.sampleRate;
  const offset=start+((rawOffset-start)%period+period)%period;
  const averageScore=candidates?scoreSum/candidates:0,confidence=bestScore>0?clamp((bestScore-averageScore)/(1-averageScore||1),0,1):0;
  throwIfAborted(signal);onProgress(1);
  return Object.freeze({bpm:bestBpm,offset,confidence,period,analyzedStart:start,analyzedEnd:end??duration});
}

