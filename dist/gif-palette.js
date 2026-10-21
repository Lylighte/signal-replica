// Reserve a neutral ramp for the grayscale artwork; adapt the remaining entries
// to chromatic pixels sampled across all exported frames.
export function sampleColors(histogram,rgba,stride=4){
  for(let i=0;i<rgba.length;i+=4*stride){
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    if(Math.max(r,g,b)-Math.min(r,g,b)<=8)continue;
    const key=(r>>3)<<10|(g>>3)<<5|(b>>3),entry=histogram.get(key)??[0,0,0,0];
    entry[0]+=r;entry[1]+=g;entry[2]+=b;entry[3]++;histogram.set(key,entry);
  }
}
export function buildPalette(histogram){
  const palette=new Uint8Array(768),grayCount=histogram.size?128:256;
  for(let i=0;i<grayCount;i++)palette.fill(Math.round(i*255/(grayCount-1)),i*3,i*3+3);
  if(!histogram.size)return{palette,grayCount};
  const points=Array.from(histogram.values(),p=>[p[0]/p[3],p[1]/p[3],p[2]/p[3],p[3]]);
  const box=points=>{
    const ranges=[0,1,2].map(c=>{let min=255,max=0;for(const p of points){min=Math.min(min,p[c]);max=Math.max(max,p[c]);}return max-min;});
    const axis=ranges.indexOf(Math.max(...ranges)),weight=points.reduce((n,p)=>n+p[3],0);
    return{points,axis,weight,score:points.length>1?ranges[axis]*Math.sqrt(weight):-1};
  };
  const boxes=[box(points)];
  while(boxes.length<128){
    boxes.sort((a,b)=>b.score-a.score);const current=boxes[0];if(current.score<0)break;
    current.points.sort((a,b)=>a[current.axis]-b[current.axis]);
    let accumulated=0,cut=1;
    for(;cut<current.points.length;cut++){accumulated+=current.points[cut-1][3];if(accumulated>=current.weight/2)break;}
    cut=Math.min(cut,current.points.length-1);
    boxes.splice(0,1,box(current.points.slice(0,cut)),box(current.points.slice(cut)));
  }
  for(let i=0;i<128;i++){
    const current=boxes[i%boxes.length];
    for(let c=0;c<3;c++)palette[(128+i)*3+c]=Math.round(current.points.reduce((n,p)=>n+p[c]*p[3],0)/current.weight);
  }
  return{palette,grayCount};
}
export function indexColors(rgba,{palette,grayCount},cache=new Map()){
  const indices=new Uint8Array(rgba.length/4);
  for(let i=0,p=0;i<rgba.length;i+=4,p++){
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    if(Math.max(r,g,b)-Math.min(r,g,b)<=8){indices[p]=Math.round((r+g+b)/3*(grayCount-1)/255);continue;}
    const key=(r>>3)<<10|(g>>3)<<5|(b>>3);let match=cache.get(key);
    if(match===undefined){
      let best=Infinity;match=0;
      // Use bin centers so results don't depend on frame traversal order.
      const rr=(r&248)+3.5,gg=(g&248)+3.5,bb=(b&248)+3.5;
      for(let color=0;color<256;color++){
        const d=(rr-palette[color*3])**2+(gg-palette[color*3+1])**2+(bb-palette[color*3+2])**2;
        if(d<best){best=d;match=color;}
      }
      cache.set(key,match);
    }
    indices[p]=match;
  }
  return indices;
}
