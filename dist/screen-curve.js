// Geometry-only postprocess; existing brightness, grain and scanlines are untouched.
export class ScreenCurve {
  constructor(){this.surface=null;this.gl=null;this.failed=false;}
  initialize(width,height){
    const surface=document.createElement('canvas');surface.width=width;surface.height=height;
    const gl=surface.getContext('webgl',{alpha:false,antialias:false,depth:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL unavailable');
    const shader=(type,source)=>{
      const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);
      if(!gl.getShaderParameter(item,gl.COMPILE_STATUS)){gl.deleteShader(item);throw new Error('Curve shader unavailable');}
      return item;
    };
    const vertex=shader(gl.VERTEX_SHADER,'attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}');
    const fragment=shader(gl.FRAGMENT_SHADER,`precision mediump float;
      varying vec2 uv; uniform sampler2D frame; uniform float curvature;
      void main(){
        vec2 p=uv*2.-1.; vec2 source=.5+.5*p*(1.+curvature*dot(p,p));
        if(source.x<0.||source.x>1.||source.y<0.||source.y>1.)gl_FragColor=vec4(0.,0.,0.,1.);
        else gl_FragColor=vec4(texture2D(frame,source).rgb,1.);
      }`);
    const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Curve program unavailable');
    gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.uniform1i(gl.getUniformLocation(program,'frame'),0);
    this.strength=gl.getUniformLocation(program,'curvature');this.surface=surface;this.gl=gl;
    surface.addEventListener('webglcontextlost',event=>{event.preventDefault();this.gl=null;this.surface=null;});
  }
  apply(source,output,strength){
    if(!strength)return true;
    if(this.failed)return false;
    try{
      if(!this.gl)this.initialize(source.width,source.height);
      const gl=this.gl;if(gl.isContextLost())return false;
      gl.viewport(0,0,source.width,source.height);gl.uniform1f(this.strength,strength);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      output.drawImage(this.surface,0,0);return true;
    }catch{this.failed=true;return false;}
  }
}
