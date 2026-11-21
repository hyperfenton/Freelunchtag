// Typeset canvases become a set of thin relief planes immersed in the scene's light.
// The source bitmap defines the glyphs, type color and whitespace, never a backing plate.
const letterVertex=`
  precision highp float;
  attribute vec3 aVertex;
  uniform vec2 uViewport,uCenter,uSize;
  uniform vec3 uAngles;
  uniform float uSet;
  varying vec2 vUV;
  varying float vLayer;
  varying vec3 vRight,vDown,vFace,vView;
  mat3 orientation(vec3 r){
    float sx=sin(r.x),cx=cos(r.x),sy=sin(r.y),cy=cos(r.y),sz=sin(r.z),cz=cos(r.z);
    // Coordinates before projection are x-right, y-down, z-towards the camera.
    mat3 tilt=mat3(1.,0.,0., 0.,cx,sx, 0.,-sx,cx);
    mat3 yaw=mat3(cy,0.,-sy, 0.,1.,0., sy,0.,cy);
    mat3 roll=mat3(cz,sz,0., -sz,cz,0., 0.,0.,1.);
    return roll*tilt*yaw;
  }
  void main(){
    vUV=aVertex.xy;vLayer=aVertex.z;
    mat3 turn=orientation(uAngles);
    vRight=turn[0];vDown=turn[1];vFace=turn[2];
    float unit=clamp(uSize.x/500.,.70,1.65);
    float thickness=(uSet==2.?.62:uSet==1.?2.4:uSet==3.?1.8:3.5)*unit;
    vec3 surface=vec3((vUV-.5)*uSize,thickness*max(vLayer,0.)/3.);
    if(vLayer<-.5){
      surface.xy+=vec2(1.0,1.6)*max(.8,thickness);
      surface.z=-.65;
    }else {
      // Real surface thickness travels out from the plane. A grazing contact edge
      // stays visible even when the face moves directly in front of the camera.
      surface.xy+=(1.-vLayer/3.)*thickness*vec2(.17,.39);
    }
    vec3 p=turn*surface;
    float focal=max(620.,min(uViewport.x,uViewport.y)*1.88);
    float perspective=max(.36,1.-p.z/focal);
    vec2 anchor=vec2(2.*uCenter.x-1.,1.-2.*uCenter.y);
    gl_Position=vec4(anchor*perspective+p.xy*vec2(2.,-2.)/uViewport,0.,perspective);
    vView=normalize(vec3(-p.xy,focal-p.z));
  }
`;

const letterFragment=`
  precision highp float;
  uniform sampler2D uInk;
  uniform vec2 uSize,uTexel,uPointer;
  uniform float uTime,uLight,uSet,uAlpha,uReveal,uErase,uSweep;
  varying vec2 vUV;
  varying float vLayer;
  varying vec3 vRight,vDown,vFace,vView;
  float grain(vec2 p){
    vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.11369,.13787));
    p3+=dot(p3,p3.yzx+19.19);
    return fract((p3.x+p3.y)*p3.z);
  }
  float noise(vec2 p){
    vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(grain(cell),grain(cell+vec2(1.,0.)),f.x),mix(grain(cell+vec2(0.,1.)),grain(cell+1.),f.x),f.y);
  }
  float typeAlpha(vec2 uv){return texture2D(uInk,uv).a;}
  void main(){
    vec4 ink=texture2D(uInk,vUV);
    // Round one soft optical contact shadow. All other planes honor the exact letter contours.
    vec2 px=max(uTexel,vec2(1./max(1.,uSize.x),1./max(1.,uSize.y)));
    float coverage=ink.a;
    if(vLayer<-.5){
      vec2 d=px*(uSet==2.?1.1:1.7);
      coverage=ink.a*.28+.18*(typeAlpha(vUV+d)+typeAlpha(vUV-d)+typeAlpha(vUV+vec2(d.x,-d.y))+typeAlpha(vUV+vec2(-d.x,d.y)));
    }
    if(coverage<.008)discard;
    vec2 local=vUV*uSize;
    float fine=grain(floor(local*1.21));
    float stone=noise(local/13.);
    float veil=1.;
    float revealGlint=0.;
    if(uReveal<.999){
      float feed=uSet==3.?1.-vUV.y:vUV.x;
      float broken=(stone-.5)*.08+(fine-.5)*.028;
      if(uSet==0.)broken+=.024*sin(vUV.y*28.+vUV.x*14.);
      float d=uReveal*1.18-.09-feed+broken;
      veil*=smoothstep(-.025,.035,d);
      revealGlint=exp(-abs(d)*41.)*.28;
    }
    if(uErase>.001){
      // Individual grains disappear irregularly at the brush front; the trailing
      // face is wholly gone once the broom passes its rightmost edge.
      float tooth=noise(vec2(vUV.y*33.,uSweep*1.7))-.5;
      float d=vUV.x-(uErase*1.18-.08)+tooth*.065+(stone-.5)*.085+(fine-.5)*.068;
      veil*=smoothstep(-.022,.037,d);
    }
    float a=coverage*uAlpha*veil;
    if(a<.006)discard;
    if(vLayer<-.5){
      gl_FragColor=vec4(.027,.018,.075,a*(uSet==2.?.37:.48));return;
    }
    vec3 inkColor=ink.rgb;
    if(vLayer<2.5){
      float level=vLayer/3.;
      vec3 side=mix(vec3(.095,.065,.20),inkColor*.47,.26+.45*level);
      if(uSet==2.)side=inkColor*.39;
      gl_FragColor=vec4(side,a);return;
    }
    float left=typeAlpha(vUV-vec2(px.x,0.)),right=typeAlpha(vUV+vec2(px.x,0.));
    float top=typeAlpha(vUV-vec2(0.,px.y)),bottom=typeAlpha(vUV+vec2(0.,px.y));
    float core=min(min(left,right),min(top,bottom));
    float wide=smoothstep(.76,.99,core);
    float edge=clamp((abs(left-right)+abs(top-bottom))*.79,0.,1.);
    vec3 normal=normalize(vFace+vRight*(left-right)*.98+vDown*(top-bottom)*.98);
    vec3 lightDirection=normalize(vec3(-.70+uLight*.54+uPointer.x*.10,-.77+.12*sin(uTime*.30),.76));
    float diffuse=max(dot(normal,lightDirection),0.);
    vec3 halfRay=normalize(lightDirection+normalize(vView));
    float gloss=pow(max(dot(normal,halfRay),0.),19.);
    vec3 reflected=reflect(-normalize(vView),normal);
    float softbox=exp(-pow((dot(reflected,normalize(vec3(-.42,-.72,.55)))-.63)/.14,2.));
    float stripe=sin(local.x*.022+local.y*.036+stone*.8+uTime*.46+uLight*2.2);
    vec3 color;
    if(uSet==2.){
      // Thin settled particles pick up the violet bounce from the floor. Smaller
      // strokes keep their coverage while broad strokes acquire fine wear.
      color=inkColor*(.72+.15*diffuse+.105*stone+.070*fine);
      color+=vec3(.12,.11,.17)*edge*diffuse+vec3(.11,.13,.18)*step(.973,fine)*wide;
      a*=1.-wide*.13*(1.-smoothstep(.035,.085,fine));
    }else if(uSet==3.){
      float vein=pow(.5+.5*sin(local.x*.096+local.y*.035+1.7*stone),7.);
      color=inkColor*(.81+.13*diffuse+wide*.055*vein)+vec3(.16,.19,.23)*(gloss+.5*edge*diffuse);
      color+=vec3(.075,.068,.10)*stone;
    }else if(uSet==1.){
      color=inkColor*(.80+.15*diffuse+wide*.075*stripe)+vec3(.21,.21,.25)*(gloss*.62+softbox*.38+edge*diffuse);
    }else{
      vec3 dispersed=.55+.45*cos(vec3(.7,2.25,4.25)+stripe*2.6+normal.x*3.+stone*.4);
      color=inkColor*(.79+.16*diffuse+wide*.085*stripe);
      color+=edge*(.10+.25*gloss)*dispersed+vec3(.22,.23,.28)*(softbox*.37+gloss*.7);
    }
    color+=revealGlint*vec3(.48,.49,.65);
    gl_FragColor=vec4(clamp(color,0.,1.),a);
  }
`;

const materialCodes={crystal:0,silver:1,floor:2,garden:3};
export function createEnvironmentType(canvas){
  if(!canvas)return null;
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:false,premultipliedAlpha:true,powerPreference:'low-power'});
  if(!gl)return null;
  let program,vertex,fragment,buffer,painted=false,disposed=false;
  let clock=0,textureBytes=0;
  const cache=new Map();
  function release(image){
    const item=cache.get(image);
    if(!item)return;
    gl.deleteTexture(item.texture);textureBytes-=item.bytes;cache.delete(image);
  }
  function destroy(){
    disposed=true;
    for(const image of cache.keys())release(image);
    if(program)gl.deleteProgram(program);
    if(vertex)gl.deleteShader(vertex);if(fragment)gl.deleteShader(fragment);if(buffer)gl.deleteBuffer(buffer);
  }
  function compile(type,source){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message);}
    return s;
  }
  try{
    vertex=compile(gl.VERTEX_SHADER,letterVertex);fragment=compile(gl.FRAGMENT_SHADER,letterFragment);
    program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    const uniforms=Object.fromEntries(['Viewport','Center','Size','Angles','Set','Ink','Texel','Pointer','Time','Light','Alpha','Reveal','Erase','Sweep'].map(n=>[n,gl.getUniformLocation(program,'u'+n)]));
    const attr=gl.getAttribLocation(program,'aVertex'),maxSide=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const mesh=[];
    for(const layer of [-1,0,1,2,3])for(const uv of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]])mesh.push(...uv,layer);
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh),gl.STATIC_DRAW);
    gl.useProgram(program);gl.uniform1i(uniforms.Ink,0);
    const limit=Math.min(32*1024*1024,Math.max(12*1024*1024,maxSide*2048));
    function inkFor(source,version){
      let item=cache.get(source);
      if(item&&item.version===version&&item.sourceWidth===source.width&&item.sourceHeight===source.height){item.used=clock;return item;}
      if(item)release(source);
      let image=source;
      if(Math.max(image.width,image.height)>maxSide){
        const ratio=maxSide/Math.max(image.width,image.height);
        image=document.createElement('canvas');image.width=Math.max(1,Math.round(source.width*ratio));image.height=Math.max(1,Math.round(source.height*ratio));
        image.getContext('2d').drawImage(source,0,0,image.width,image.height);
      }
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}catch{gl.deleteTexture(texture);return null;}
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      item={texture,width:image.width,height:image.height,sourceWidth:source.width,sourceHeight:source.height,bytes:image.width*image.height*4,version,used:clock};
      cache.set(source,item);textureBytes+=item.bytes;return item;
    }
    function render(pose,prints=[]){
      if(disposed||gl.isContextLost())return;
      const {width,height,dpr=1,time=0,light=.5,pointerX=0,pointerY=0,sweep=0}=pose||{};
      if(!(width>0&&height>0))return;
      const active=prints.slice(0,2).filter(p=>p.image?.width&&p.image?.height&&p.width>0&&p.height>0&&(p.alpha??1)>.005&&(p.reveal??1)>.001&&(p.erase??0)<.999);
      if(!active.length){
        if(painted){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);painted=false;}
        return;
      }
      const scale=Math.max(.6,Math.min(2,dpr)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,3,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.uniform2f(uniforms.Viewport,width,height);gl.uniform2f(uniforms.Pointer,pointerX,pointerY);
      gl.uniform1f(uniforms.Time,(time%1400));gl.uniform1f(uniforms.Light,light);gl.uniform1f(uniforms.Sweep,sweep);
      ++clock;
      for(const p of active){
        const t=inkFor(p.image,p.version??0);if(!t)continue;
        gl.bindTexture(gl.TEXTURE_2D,t.texture);
        gl.uniform2f(uniforms.Texel,1/t.width,1/t.height);gl.uniform2f(uniforms.Size,p.width,p.height);
        gl.uniform2f(uniforms.Center,p.x??.5,p.y??.5);gl.uniform3f(uniforms.Angles,p.tilt||0,p.yaw||0,p.roll||0);
        gl.uniform1f(uniforms.Set,materialCodes[p.material]??0);gl.uniform1f(uniforms.Alpha,p.alpha??1);
        gl.uniform1f(uniforms.Reveal,p.reveal??1);gl.uniform1f(uniforms.Erase,p.erase??0);
        gl.drawArrays(gl.TRIANGLES,0,30);
      }
      if(cache.size>10||textureBytes>limit){
        const stale=[...cache.entries()].filter(([,t])=>t.used!==clock).sort((a,b)=>a[1].used-b[1].used);
        for(const [image] of stale){release(image);if(cache.size<=10&&textureBytes<=limit)break;}
      }
      painted=true;
    }
    return {render,destroy};
  }catch{destroy();return null;}
}
