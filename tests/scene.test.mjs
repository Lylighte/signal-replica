import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOptions,resolveOptionSource,PRESETS,APP_CONFIG,REFERENCE_OFFSET} from '../dist/config.js';
import {layoutPanels,reelPosition,optionPositions,optionEntrance,selectedOptionOpacity,preRollNoise,expansionEase,expansionProgress,easeInOutQuad,numberColumns,entryState,entryGlitch,columnPosition,reelPitch,labelPositions,placeReelPosition,placeSpeedMultiplier,reelSpeed} from '../dist/engine.js';
import {MOTION} from '../dist/config.js';
import {DEFAULT_DESIGN,DESIGN_FIELDS,DESIGN_GROUPS,validateDesign,outsideSliderRange} from '../dist/design.js';
import {moveOption,importSettings,exportSettings,previewIssue,ASPECTS} from '../dist/editor-data.js';
import {DEFAULT_SETTINGS} from '../dist/default-settings.js';

test('zero, leading zeroes and full-width digits remain usable',()=>{
  const data=validateOptions([{id:'a',label:'零',value:'0'},{id:'b',label:'ZERO',value:'００７'}]);
  assert.equal(data[0].value,'0');assert.equal(data[1].value,'007');
});
test('reject malformed content and duplicate identities',()=>{
  for(const value of ['','-1','1.5','1e3','12345','<b>'])assert.throws(()=>validateOptions([{id:'a',label:'EZ',value}]));
  assert.throws(()=>validateOptions([{id:'a',label:' ',value:'0'}]));
  assert.throws(()=>validateOptions([{id:'a',label:'EZ',value:'0'},{id:'a',label:'HD',value:'1'}]));
  assert.throws(()=>validateOptions([]));
  assert.throws(()=>validateOptions(Array.from({length:9},(_,i)=>({id:String(i),label:'X',value:'0'}))));
});
test('preset results are independent copies and unknown sources fail',()=>{
  const a=resolveOptionSource({mode:'preset',presetId:'ez-zero'});a[0].value='9';
  assert.equal(resolveOptionSource({mode:'preset',presetId:'ez-zero'})[0].value,'0');
  assert.throws(()=>resolveOptionSource({mode:'preset',presetId:'missing'}));
  assert.throws(()=>resolveOptionSource({mode:'other'}));
  assert.deepEqual(resolveOptionSource({mode:'custom'},[{id:'a',label:'TEST',value:'42'}]),[{id:'a',label:'TEST',value:'42'}]);
});
test('one through eight panels fit inside the reference content area',()=>{
  for(let count=1;count<=8;count++){
    const options=Array.from({length:count},(_,i)=>({id:String(i),label:'X',value:'0'}));
    const panels=layoutPanels(options,'grid','0');assert.equal(panels.length,count);
    for(const p of panels){assert.ok(p.x>=240-1e-8);assert.ok(p.y>=0);assert.ok(p.x+720*p.scale<=1680+1e-8);assert.ok(p.y+540*p.scale<=1080+1e-8);}
  }
  assert.deepEqual(layoutPanels(PRESETS[0].options,'grid','ez').map(p=>[p.x,p.y,p.scale]),[[240,0,1],[960,0,1],[240,540,1],[960,540,1]]);
  assert.equal(layoutPanels(PRESETS[0].options,'single','hd')[0].option.id,'hd');
});
test('reels hold, join continuously and accelerate without reversal',()=>{
  assert.equal(reelPosition(4),0);assert.equal(reelPosition(MOTION.rollStart),0);
  assert.ok(Math.abs(reelPosition(3.2-1e-5)-reelPosition(3.2))<1e-6);
  let previous=reelPosition(MOTION.rollStart);
  for(let t=MOTION.rollStart+.1;t<15;t+=.1){const next=reelPosition(t);assert.ok(next>previous);previous=next;}
  assert.ok(reelPosition(13)-reelPosition(12)>reelPosition(8)-reelPosition(7));
});
test('selection translates only the chosen option to the centre and sends others outward',()=>{
  const start=optionPositions(0,4,1),end=optionPositions(MOTION.selectStart+DEFAULT_DESIGN.selectDuration,4,1);
  assert.equal(end[1].x,360);assert.ok(start[1].x<360);
  assert.ok(end[0].x<0);assert.ok(end[2].x>720);assert.ok(end[3].x>720);
  assert.ok(end.every(p=>p.y===270));
});
test('long expansion contains the first numeric reveal and glitch episode',()=>{
  assert.equal(easeInOutQuad(.25),.125);assert.equal(easeInOutQuad(.75),.875);
  assert.equal(expansionProgress(MOTION.expandStart),0);assert.equal(expansionProgress(MOTION.expandEnd),1);
  assert.ok(MOTION.numberAppear<MOTION.expandEnd);assert.ok(MOTION.expandEnd-MOTION.expandStart>=1.2);assert.ok(MOTION.flashes[0][0]>MOTION.expandStart&&MOTION.flashes[0][0]<MOTION.expandEnd);
});
test('expansion curve choices have exact endpoints, symmetry and stronger middle acceleration',()=>{
  for(const easingCurve of ['quadratic','power','sigmoid']){
    const design=validateDesign({easingCurve});
    assert.equal(expansionEase(0,design),0);assert.equal(expansionEase(1,design),1);assert.ok(Math.abs(expansionEase(.5,design)-.5)<1e-12);
    let previous=0;
    for(let step=0;step<=100;step++){
      const t=step/100,current=expansionEase(t,design);
      assert.ok(current>=previous);assert.ok(Math.abs(current+expansionEase(1-t,design)-1)<1e-12);previous=current;
    }
    for(const column of numberColumns('17',MOTION.numberAppear,design)){
      for(const boundary of [...MOTION.flashes.flat(),MOTION.numberSettle])assert.ok(Math.abs(columnPosition(column,boundary-1e-7,design)-columnPosition(column,boundary+1e-7,design))<1e-5);
    }
  }
  assert.equal(expansionEase(.25,validateDesign({easingCurve:'quadratic'})),.125);
  assert.ok(expansionEase(.25,validateDesign({easingCurve:'power',easingPower:6}))<expansionEase(.25,validateDesign({easingCurve:'power',easingPower:3})));
  assert.ok(expansionEase(.25,validateDesign({easingCurve:'sigmoid',sigmoidSteepness:20}))<expansionEase(.25,validateDesign({easingCurve:'sigmoid',sigmoidSteepness:8})));
  for(const easingCurve of ['quadratic','sigmoid']){
    const design=validateDesign({easingCurve});
    assert.deepEqual(optionPositions(3.3,4,3,design),optionPositions(3.3,4,3));
    assert.deepEqual(numberColumns('17',12,design),numberColumns('17',12));
    assert.deepEqual(labelPositions(12,design),labelPositions(12));
    for(const time of [MOTION.numberAppear,4.7,4.9,5.1,MOTION.flashEnd,5.4,MOTION.numberSettle,12])
      for(const column of numberColumns('17',time,design))assert.equal(columnPosition(column,time,design),columnPosition(column,time));
  }
  for(const easingCurve of ['invalid',4,null])assert.throws(()=>validateDesign({easingCurve}));
});
test('higher places appear from the left while all visible columns push right',()=>{
  for(const value of ['0','10','007','1234']){
    assert.equal(numberColumns(value,4).length,value.length);
    const final=numberColumns(value,MOTION.sideEnd+.1);assert.equal(final.length,5);
    assert.ok(final.every(c=>c.opacity>=0&&c.opacity<=1));
    assert.ok(final.filter(c=>!c.primary).every(c=>c.initialDigit===0&&c.place>=value.length));
    for(let t=0;t<=15;t+=.1)assert.ok(numberColumns(value,t).length<=5);
    let previous=numberColumns(value,MOTION.sideStart);
    for(let t=MOTION.sideStart+.05;t<=MOTION.sideEnd;t+=.05){
      const current=numberColumns(value,t);
      for(const column of current){const before=previous.find(c=>c.place===column.place);if(before)assert.ok(column.x>=before.x-1e-8);}
      previous=current;
    }
    const first=numberColumns(value,4).filter(c=>c.primary),last=final.filter(c=>c.primary);
    assert.ok(first.every((c,i)=>last[i].x>=c.x));
  }
});
test('number entrance flashes exactly twice and finishes travel before gentle settling',()=>{
  let pulses=0,previous=false;
  for(let t=MOTION.expandStart;t<MOTION.numberSettle;t+=.002){const current=entryState(t).flash;if(current&&!previous)pulses++;previous=current;}
  assert.equal(pulses,2);assert.equal(entryState((MOTION.expandStart+MOTION.expandEnd)/2).visible,true);assert.equal(entryState(MOTION.expandStart-.01).visible,false);
  for(const column of numberColumns('17',3)){
    const remaining=-columnPosition(column,MOTION.flashEnd)*reelPitch(column.scaleY);
    assert.ok(remaining>=14&&remaining<17);
    assert.equal(columnPosition(column,MOTION.numberSettle-column.settleAhead),0);
    assert.ok(-columnPosition(column,MOTION.flashEnd+.1)*reelPitch(column.scaleY)<14);
  }
});
test('entry stays left-to-right through the reported near-alignment frames without an overtake',()=>{
  for(const value of ['0','17','007','1234']){
    const columns=numberColumns(value,MOTION.numberAppear);
    const arrivals=columns.map(c=>MOTION.numberSettle-c.settleAhead);
    for(let i=1;i<arrivals.length;i++)assert.equal(arrivals[i]-arrivals[i-1],DEFAULT_DESIGN.settleStagger);
    for(let time=4.78;time<=arrivals.at(-1);time+=1/240){
      const offsets=columns.map(column=>-columnPosition(column,time)*reelPitch(column.scaleY));
      for(let i=1;i<offsets.length;i++)assert.ok(offsets[i]>=offsets[i-1]-1e-8,`${value} at ${time}: ${offsets}`);
    }
    for(const [i,column]of columns.entries()){
      assert.equal(columnPosition(column,arrivals[i]),0);
      assert.ok(columnPosition(column,arrivals[i]-.0001)<0);
      // Early entry retains the pre-fix distance and easing, before columns align.
      for(const time of value.length<=2?[MOTION.numberAppear,4.78]:[MOTION.numberAppear]){
        const p=(time-MOTION.flashes[0][0])/(MOTION.flashEnd-MOTION.flashes[0][0]),r=14/reelPitch(column.scaleY);
        assert.ok(Math.abs(columnPosition(column,time)-(-r-(column.entryDistance-r)*Math.pow(1-p,column.entryPower)))<1e-12);
      }
    }
  }
});
test('alignment stays ordered and continuous across the configurable delay range',()=>{
  for(const settleStagger of [0,.03,.2,.5])for(const settleWindow of [.05,.1,.2])for(const value of ['17','007','1234']){
    const design=validateDesign({settleStagger,settleWindow}),columns=numberColumns(value,4.6,design);
    let previous=columns.map(c=>columnPosition(c,4.6,design));
    for(let time=4.61;time<8;time+=.01){
      const positions=columns.map(c=>columnPosition(c,time,design));
      positions.forEach((p,i)=>{
        assert.ok(p>=previous[i]-1e-10,`${value} reverses at ${time}`);
        if(i)assert.ok(p<=positions[i-1]+1e-10,`${value} overtakes at ${time}, delay ${settleStagger}`);
      });previous=positions;
    }
  }
});
test('half-second arrival intervals are not capped by the small adjustment window',()=>{
  const design=validateDesign({settleStagger:.5}),start=MOTION.numberSettle-design.settleWindow;
  assert.equal(validateDesign({settleStagger:.505}).settleStagger,.505);
  for(const value of ['0','17','007','1234']){
    const columns=numberColumns(value,MOTION.numberAppear,design),arrivals=columns.map(column=>MOTION.numberSettle-column.settleAhead);
    for(let i=1;i<arrivals.length;i++)assert.ok(Math.abs(arrivals[i]-arrivals[i-1]-.5)<1e-12);
    assert.ok(arrivals.at(-1)<MOTION.rollStart);
    for(const [i,column]of columns.entries()){
      assert.equal(columnPosition(column,arrivals[i],design),0);
      assert.ok(columnPosition(column,arrivals[i]-.001,design)<0);
      for(const boundary of [start,MOTION.flashEnd,MOTION.numberSettle])assert.ok(Math.abs(columnPosition(column,boundary-1e-7,design)-columnPosition(column,boundary+1e-7,design))<1e-5);
      const original=numberColumns(value,MOTION.numberAppear)[i];
      assert.equal(columnPosition(column,MOTION.numberAppear,design),columnPosition(original,MOTION.numberAppear));
    }
  }
});
test('option text leaves slowly to opposite sides during rolling',()=>{
  assert.deepEqual(labelPositions(4),{left:DEFAULT_DESIGN.labelLeft,right:DEFAULT_DESIGN.labelRight});
  const early=labelPositions(MOTION.rollStart+.1),middle=labelPositions(9),end=labelPositions(MOTION.rollStart+DEFAULT_DESIGN.labelExitDuration);
  assert.ok(early.left>DEFAULT_DESIGN.labelLeft-1&&early.right<DEFAULT_DESIGN.labelRight+1);assert.ok(middle.left<early.left&&middle.right>early.right);
  assert.ok(end.left<0&&end.right>720);
});
test('individual reels continuously enter from 06 to 17 with no value switch at flashes',()=>{
  const columns=numberColumns('17',2);
  assert.deepEqual(columns.map(c=>(c.initialDigit+Math.floor(columnPosition(c,MOTION.numberAppear))+10)%10),[0,6]);
  for(const column of columns){
    let previous=columnPosition(column,MOTION.numberAppear);
    for(let t=MOTION.numberAppear+.01;t<=MOTION.numberSettle;t+=.01){
      const current=columnPosition(column,t);assert.ok(current>=previous);previous=current;
    }
    for(const boundary of [...MOTION.flashes.flat(),MOTION.numberSettle])
      assert.ok(Math.abs(columnPosition(column,boundary-1e-7)-columnPosition(column,boundary+1e-7))<1e-5);
    assert.equal(columnPosition(column,APP_CONFIG.stillTime),0);
  }
  const t=MOTION.numberAppear;
  assert.ok(columnPosition(columns[0],t+.01)-columnPosition(columns[0],t)<columnPosition(columns[1],t+.01)-columnPosition(columns[1],t));
});
test('reference entrance contains a uniform wash followed by an inverted reel frame',()=>{
  const at=frame=>REFERENCE_OFFSET+frame/30;
  assert.equal(entryGlitch(at(72)),'none');assert.equal(entryGlitch(at(73)),'wash');
  assert.equal(entryGlitch(at(74)),'invert');assert.equal(entryGlitch(at(75)),'wash');
  assert.equal(entryGlitch(at(77)),'tear');assert.equal(entryGlitch(at(81)),'none');
  assert.equal(entryGlitch(at(85)),'tear');assert.equal(entryGlitch(at(88)),'invert');
  assert.equal(entryGlitch(at(93)),'wash');assert.equal(entryGlitch(at(94)),'none');
});
test('neighbour sprites are fully outside the panel at rest for every supported value width',()=>{
  for(const value of ['0','17','007','1234'])for(const column of numberColumns(value,4)){
    const halfSprite=180*column.scaleY,pitch=reelPitch(column.scaleY);
    assert.ok(270+pitch-halfSprite>=540);assert.ok(270-pitch+halfSprite<=0);
  }
});
test('places accelerate right to left and approach the same final high speed',()=>{
  const columns=numberColumns('17',12),primary=columns.filter(c=>c.primary);
  assert.equal(primary[0].rate,.25);assert.equal(primary[1].rate,1);
  const early=MOTION.rollStart+2.5,late=MOTION.rollStart+DEFAULT_DESIGN.speedConverge+.5;
  assert.ok([0,1,2,3,4].every((place,i)=>i===0||placeSpeedMultiplier(early,place)<placeSpeedMultiplier(early,place-1)));
  for(const place of [0,1,2,3,4]){
    assert.equal(placeSpeedMultiplier(late,place),1);
    const delta=.0001,speed=(placeReelPosition(late+delta,place)-placeReelPosition(late-delta,place))/(2*delta);
    assert.ok(Math.abs(speed-reelSpeed(late))<1e-4);
    assert.ok(Math.abs(placeReelPosition(12.9-1e-7,place)-placeReelPosition(12.9+1e-7,place))<1e-4);
  }
});
test('option intro settles from a wide blurred row before staggered selection begins',()=>{
  const first=optionPositions(0,4,3),ready=optionPositions(DEFAULT_DESIGN.introDuration,4,3);
  assert.ok(first[0].x<ready[0].x&&first[3].x>ready[3].x);
  assert.equal(optionEntrance(DEFAULT_DESIGN.introDuration).blur,0);
  const early=optionPositions(MOTION.selectStart+.12,4,3);
  assert.ok(early[0].x<ready[0].x);assert.equal(early[3].x,ready[3].x);
});
test('selected option presses once before departure, independently of number glitches',()=>{
  assert.equal(selectedOptionOpacity(2),1);
  assert.ok(selectedOptionOpacity(62/30)<1&&selectedOptionOpacity(62/30)>0);
  for(let frame=64;frame<=70;frame++)assert.ok(Math.abs(selectedOptionOpacity(frame/30)-DEFAULT_DESIGN.pressOpacity)<1e-12);
  assert.ok(selectedOptionOpacity(72/30)>selectedOptionOpacity(71/30));
  assert.equal(selectedOptionOpacity(73/30),1);
  for(const time of [MOTION.selectStart,MOTION.numberAppear,APP_CONFIG.stillTime])assert.equal(selectedOptionOpacity(time),1);
  const changed=validateDesign({pressStart:2.6,pressDuration:.8,pressFade:.2,pressOpacity:.15});
  assert.equal(selectedOptionOpacity((2.6+MOTION.selectStart)/2,changed),.15);
  assert.equal(selectedOptionOpacity(MOTION.selectStart,changed),1);
});
test('other options expand their letters before leaving while chosen label stays compact',()=>{
  const positions=optionPositions(MOTION.selectStart+.18,4,3,validateDesign({exitExpandDuration:.18}));
  assert.equal(positions[0].exitExpand,1);assert.ok(positions[1].exitExpand>0&&positions[1].exitExpand<1);
  assert.equal(positions[2].exitExpand,0);assert.equal(positions[3].exitExpand,0);
  assert.ok(positions[0].x>0);assert.equal(positions[3].exitProgress,0);
});
test('pre-roll interference matches brief reference bursts and never changes held reel positions',()=>{
  assert.equal(preRollNoise(6.6),0);assert.equal(preRollNoise(202/30),.55);
  assert.equal(preRollNoise(206/30),0);assert.equal(preRollNoise(7.2),0);
  assert.equal(preRollNoise(225/30),.65);assert.equal(preRollNoise(MOTION.rollStart),0);
  for(const [start,end]of MOTION.noiseBursts){
    assert.ok(start>MOTION.numberSettle&&end<MOTION.rollStart);
    for(const column of numberColumns('17',start))assert.equal(columnPosition(column,start),0);
    assert.ok(preRollNoise((start+end)/2)>0);
  }
});
test('design input accepts both sides of slider bounds while invalid patches remain atomic',()=>{
  const before={...DEFAULT_DESIGN};
  assert.equal(validateDesign({numberSize:400,numberGlowStrength:0}).numberSize,400);
  for(const patch of [{numberSize:400,rollSpeed:NaN},{finalColumns:5.5},{unknown:1},{numberSize:Infinity}])assert.throws(()=>validateDesign(patch,before));
  assert.equal(validateDesign({numberSize:50}).numberSize,50);
  assert.equal(validateDesign({numberSize:100000000}).numberSize,100000000);
  const speed=DESIGN_FIELDS.find(field=>field.key==='rollSpeed');
  assert.equal(outsideSliderRange(speed,.1),true);assert.equal(outsideSliderRange(speed,5),true);assert.equal(outsideSliderRange(speed,1),false);
  assert.equal(speed.min,.25);assert.equal(speed.max,3);
  assert.deepEqual(before,DEFAULT_DESIGN);
  assert.equal(DESIGN_FIELDS.length,new Set(DESIGN_FIELDS.map(f=>f.key)).size);
});
test('regrouping retains every setting exactly once and preserves default values',()=>{
  const keys=DESIGN_GROUPS.flatMap(group=>group.fields.map(field=>field.key));
  assert.deepEqual([...keys].sort(),DESIGN_FIELDS.map(field=>field.key).sort());
  assert.equal(new Set(keys).size,keys.length);
  assert.deepEqual(DEFAULT_DESIGN,DEFAULT_SETTINGS.design);
  assert.deepEqual(PRESETS[0].options,DEFAULT_SETTINGS.options);
  assert.deepEqual(APP_CONFIG.preview,DEFAULT_SETTINGS.preview);
  for(const field of DESIGN_FIELDS){
    assert.ok(Object.hasOwn(DEFAULT_SETTINGS.design,field.key));
    if(!field.options)assert.ok(!outsideSliderRange(field,field.value),`${field.key} default outside slider`);
  }
});
test('option moves preserve identities, leading zeros, and original input',()=>{
  const original=[{id:'a',label:'A',value:'007'},{id:'b',label:'B',value:'17'},{id:'c',label:'C',value:'0'}];
  assert.deepEqual(moveOption(original,'b',-1).map(o=>o.id),['b','a','c']);
  assert.deepEqual(moveOption(original,'b',1).map(o=>o.id),['a','c','b']);
  assert.deepEqual(moveOption(original,'a',-1),original);assert.deepEqual(moveOption(original,'c',1),original);
  assert.equal(original[0].id,'a');assert.equal(moveOption(original,'a',1)[1].value,'007');
  assert.throws(()=>moveOption(original,'missing',-1));
});
test('configuration roundtrip restores order, extended values, selected identity and 4:3',()=>{
  const current={options:PRESETS[0].options,design:{...DEFAULT_DESIGN},view:'grid',aspect:'16:9',selectedId:'ez'};
  const edited={...current,options:moveOption(current.options,'in',-1),design:validateDesign({rollSpeed:.1,numberGap:1000}),view:'single',aspect:'4:3',selectedId:'in'};
  assert.deepEqual(importSettings(exportSettings(edited),current),edited);
  assert.deepEqual(ASPECTS['4:3'],{width:1440,height:1080});
});
test('option-only imports keep settings and generate missing identities',()=>{
  const current={design:validateDesign({numberSize:404}),aspect:'4:3',view:'single',selectedId:'missing'};
  const imported=importSettings('\uFEFF'+JSON.stringify([{label:'ZERO',value:'００７'}]),current);
  assert.equal(imported.options[0].value,'007');assert.equal(imported.selectedId,imported.options[0].id);
  assert.deepEqual(imported.design,current.design);assert.equal(imported.aspect,'4:3');
});
test('malformed imports do not modify any current option or setting',()=>{
  const current={options:PRESETS[0].options,design:{...DEFAULT_DESIGN},view:'grid',aspect:'16:9',selectedId:'ez'},before=structuredClone(current);
  for(const text of ['{',JSON.stringify({version:2,options:current.options}),JSON.stringify({options:[]}),JSON.stringify({options:current.options,design:{unknown:1}}),JSON.stringify({options:current.options,preview:{aspect:'1:1'}}),JSON.stringify({options:[{id:'x',label:'X',value:'-1'}]})])assert.throws(()=>importSettings(text,current));
  assert.deepEqual(current,before);
});
test('oversized and physically invalid settings stay accepted but do not attempt unsafe drawing',()=>{
  assert.equal(previewIssue(DEFAULT_DESIGN),'');assert.equal(previewIssue(validateDesign({numberSize:700,rollSpeed:.1})), '');
  for(const patch of [{numberSize:100000000},{finalColumns:100000000},{scanSpacing:0},{scanLineSpacing:-3},{vignetteKnee:2}])assert.ok(previewIssue(validateDesign(patch)));
});
test('custom size and glow retain a safe vertical pitch without changing entry size over time',()=>{
  const design=validateDesign({numberSize:600,numberGlowRadius:60,rowPitch:300});
  for(const value of ['0','17','007','1234']){
    const before=numberColumns(value,MOTION.numberAppear,design),after=numberColumns(value,APP_CONFIG.stillTime,design);
    assert.deepEqual(before.map(c=>[c.scaleX,c.scaleY]),after.map(c=>[c.scaleX,c.scaleY]));
    for(const column of after)assert.ok(reelPitch(column.scaleY,design)>270+(design.numberSize*.72+design.numberGlowRadius*6)/2*column.scaleY);
  }
});
test('final horizontal spacing follows the input even beyond panel edges',()=>{
  for(const finalColumns of [5,8])for(const finalColumnGap of [144,172,240,500]){
    const design=validateDesign({finalColumns,finalColumnGap});
    const columns=numberColumns('17',MOTION.sideStart+design.pushDuration,design);
    for(let i=1;i<columns.length;i++)assert.equal(columns[i].x-columns[i-1].x,finalColumnGap);
    assert.equal(columns[0].x,-columns.at(-1).x);
    if(finalColumnGap>=240){assert.ok(columns[0].x<-360);assert.ok(columns.at(-1).x>360);}
    assert.deepEqual(numberColumns('17',MOTION.numberAppear,design).map(c=>c.x),numberColumns('17',MOTION.numberAppear).map(c=>c.x));
  }
});
test('edited reel count and speed apply to the same continuous reel model',()=>{
  const design=validateDesign({finalColumns:8,rollSpeed:2,pushDuration:1.2});
  assert.equal(numberColumns('17',MOTION.sideStart+1.3,design).length,8);
  assert.ok(numberColumns('17',APP_CONFIG.stillTime,design).every(c=>c.primary));
  assert.ok(Math.abs(placeReelPosition(15,1,design)-2*placeReelPosition(15,1))<1e-8);
});
