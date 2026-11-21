// A single lit mesh contains the broom, spun-metal pail, and opening anemones.
const TAU = Math.PI * 2;
const clamp = (n, lo=0, hi=1) => Math.max(lo,Math.min(hi,n));
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const mul = (a,k) => a.map(v=>v*k);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = v => mul(v,1/(Math.hypot(...v)||1));
const blend = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const up=[0,1,0], zero=[0,0,0];
const material={ metal:0,wood:1,straw:2,stem:3,leaf:4,petal:5,pollen:6,shadow:7,interior:8 };

// Each vertex stores a local pivot and hinge so petals unfurl without new geometry.
function buildStillLife(){
  const data=[];
  let group=0,kind=0,color=[1,1,1],pivot=zero,axis=up,weight=0;
  function paint(mat,rgb){kind=mat;color=rgb;pivot=zero;axis=up;weight=0;}
  function point(p,n,shade=1,w=weight){
    return [...p,...n,...mul(color,shade),group,kind,w,...pivot,...axis];
  }
  function tri(a,b,c){data.push(...a,...b,...c);}
  function quad(a,b,c,d){tri(a,b,c);tri(a,c,d);}
  function ringBody(profile,segments=64,inside=false){
    for(let j=0;j<profile.length-1;j++){
      const [r0,y0]=profile[j], [r1,y1]=profile[j+1];
      const ny=r0-r1, nx=y1-y0;
      for(let i=0;i<segments;i++){
        const a=TAU*i/segments,b=TAU*(i+1)/segments;
        const v=(angle,r,y)=>point([r*Math.cos(angle),y,r*Math.sin(angle)],unit(mul([Math.cos(angle)*nx,ny,Math.sin(angle)*nx],inside?-1:1)));
        quad(v(a,r0,y0),v(b,r0,y0),v(b,r1,y1),v(a,r1,y1));
      }
    }
  }
  function tube(path,radii,sides=8,cap=false){
    const rings=path.map((center,j)=>{
      const before=path[Math.max(0,j-1)], after=path[Math.min(path.length-1,j+1)];
      const tangent=unit(sub(after,before));
      const tangentNormal=unit(cross(tangent,Math.abs(tangent[2])<.87?[0,0,1]:[1,0,0]));
      const bitangent=unit(cross(tangent,tangentNormal));
      return Array.from({length:sides},(_,i)=>{
        const a=TAU*i/sides,r=Array.isArray(radii)?radii[j]:radii;
        const n=add(mul(tangentNormal,Math.cos(a)),mul(bitangent,Math.sin(a)));
        return point(add(center,mul(n,r)),n);
      });
    });
    for(let j=0;j<rings.length-1;j++) for(let i=0;i<sides;i++){
      const n=(i+1)%sides;quad(rings[j][i],rings[j][n],rings[j+1][n],rings[j+1][i]);
    }
    if(cap)for(let j of [0,path.length-1]){
      const n=unit(sub(path[j],path[j===0?1:j-1]));
      for(let i=0;i<sides;i++)tri(point(path[j],n),rings[j][i],rings[j][(i+1)%sides]);
    }
  }
  function sphere(center,scale,bands=6,slices=12){
    const v=(la,lo)=>{
      const n=[Math.cos(la)*Math.cos(lo),Math.sin(la),Math.cos(la)*Math.sin(lo)];
      return point(add(center,n.map((x,i)=>x*scale[i])),unit(n.map((x,i)=>x/scale[i])));
    };
    for(let j=0;j<bands;j++)for(let i=0;i<slices;i++){
      const a=Math.PI*(j/bands-.5),b=Math.PI*((j+1)/bands-.5),u=TAU*i/slices,vv=TAU*(i+1)/slices;
      quad(v(a,u),v(a,vv),v(b,vv),v(b,u));
    }
  }
  function shadow(rx,rz){
    paint(material.shadow,[.025,.017,.075]);
    for(let i=0;i<48;i++){
      const a=TAU*i/48,b=TAU*(i+1)/48;
      const mark=(t,r)=>point([rx*r*Math.cos(t),.001,rz*r*Math.sin(t)],up,1,1-r);
      tri(mark(0,0),mark(a,1),mark(b,1));
    }
  }
  // Pail bottom, flared shell, rolled foot and lip, nested interior and arched bail.
  group=0;
  shadow(.134,.099);
  paint(material.metal,[.74,.75,.83]);
  ringBody([[.064,.005],[.072,.008],[.075,.015],[.074,.021],[.080,.062],[.083,.077],[.082,.082],[.084,.087],[.099,.177],[.102,.180],[.103,.188],[.101,.194],[.096,.194]],72);
  paint(material.interior,[.39,.40,.50]);
  ringBody([[.001,.015],[.068,.015],[.071,.024],[.096,.190]],64,true);
  paint(material.metal,[.89,.89,.97]);
  ringBody([[.096,.186],[.102,.187],[.104,.190],[.103,.194],[.10,.196],[.096,.194],[.095,.189]],72);
  for(const y of [.042,.047,.124]){
    const r=.074+.027*y/.19;ringBody([[r,y],[r+.0014,y+.0012],[r,y+.0025]],64);
  }
  for(const x of [-.095,.095]){
    sphere([x,.166,.009],[.011,.017,.011]);
    paint(material.interior,[.36,.35,.46]);
    sphere([x*1.07,.169,.009],[.004,.005,.005],5,8);
    paint(material.metal,[.89,.89,.97]);
  }
  const handle=Array.from({length:36},(_,i)=>{
    const a=Math.PI*i/35;
    return [.101*Math.cos(a),.168+.131*Math.sin(a),.010-.035*Math.sin(a)];
  });
  tube(handle,.0037,9);
  paint(material.metal,[.58,.54,.70]);
  tube(handle.slice(14,22),.0075,12,true);
  // Bound broomcorn: individual tapered reeds, stitched wire courses, turned ash handle.
  group=1;
  shadow(.12,.05);
  for(let j=0;j<5;j++)for(let i=0;i<23;i++){
    const x=(i-11)/11,z=(j-2)/2;
    const hash=Math.sin((i+1)*171.37+(j+1)*53.21)*439.73;
    const h=hash-Math.floor(hash),warm=.67+.33*h;
    const fiberColor=blend([.71,.37,.13],[.99,.75,.40],warm);
    paint(material.straw,mul(fiberColor,.72+.27*h));
    tube([[x*.034,.180,z*.011],[x*.047,.128,z*.0155],[x*.066,.071,z*.018],[x*(.086+.009*h)+.006*Math.sin(j+i),.012*h,z*.025+.004*h]],[.0032,.0034,.0028,.00125],4);
  }
  paint(material.wood,[.65,.36,.16]);
  tube([[0,.139,0],[0,.197,0],[.006,.239,0],[.020,.48,-.007],[.048,.80,-.015]],[.018,.017,.0108,.0103,.0116],14,true);
  paint(material.metal,[.63,.57,.74]);
  tube([[0,.18,0],[.004,.221,0]],[.018,.0125],18,true);
  for(let j=0;j<5;j++){
    const y=.132+j*.0065; const rx=.046-j*.002,rz=.0185;
    const loop=Array.from({length:33},(_,i)=>{const a=TAU*i/32;return [rx*Math.cos(a),y,rz*Math.sin(a)];});
    paint(material.metal,j%2?[.57,.47,.72]:[.85,.71,.51]);tube(loop,.0018,5);
  }
  paint(material.wood,[.38,.235,.16]);
  tube([[.044,.738,-.014],[.048,.801,-.015],[.048,.808,-.015]],[.0123,.0132,.010],14,true);
  const gardenStart=data.length/18;
  const plants=[
    [.48,-.073,-.18,.084,[.64,.44,.95]], [.34,.040,.28,.073,[.91,.76,.99]], [.52,.026,.16,.077,[.49,.41,.94]],
    [.27,-.020,-.10,.055,[.78,.59,.98]], [.40,-.042,-.22,.078,[.73,.55,.99]], [.53,.058,.25,.089,[.85,.70,.99]],
    [.31,-.030,.1,.065,[.55,.43,.91]], [.24,.034,-.17,.053,[.89,.75,.98]]
  ];
  plants.forEach(([height,lean,yaw,radius,rgb],index)=>{
    group=index+2;
    const curve=t=>[lean*t*t+.012*Math.sin(t*4+index)*t,height*t,.013*Math.sin(index+t*2.6)*t];
    paint(material.stem,[.26,.47,.39]);
    const stalk=Array.from({length:16},(_,i)=>curve(i/15));
    tube(stalk,stalk.map((_,i)=>.0055-.0032*(i/15)),7);
    for(let j=0;j<4;j++){
      const origin=curve(.18+j*.145),dir=(j+index)%2?1:-1;
      const len=.070+j*.008,depth=.040*Math.sin(index+j*1.7);
      paint(material.leaf,[.24+j*.025,.46+j*.025,.42+j*.022]);
      const leaf=(t,u)=>{
        const width=Math.sin(Math.PI*t)*.020;
        const ridge=(1-Math.abs(u))*width*.46;
        return [origin[0]+dir*len*t,origin[1]+.095*t-.042*t*t+u*width*.48,origin[2]+depth*t+u*width+ridge];
      };
      for(let v=0;v<8;v++)for(let k=0;k<4;k++){
        const vertex=(t,u)=>{
          const mid=leaf(t,u),n=unit(cross(sub(leaf(t+.001,u),mid),sub(leaf(t,u+.001),mid)));
          return point(mid,n,.79+.19*(1-Math.abs(u)));
        };
        const t=v/8,b=(v+1)/8,a=k/2-1,c=(k+1)/2-1;
        quad(vertex(t,a),vertex(t,c),vertex(b,c),vertex(b,a));
      }
    }
    const head=curve(1),face=unit([Math.sin(yaw)*.87,.36+.13*Math.sin(index),.90*Math.cos(yaw)]);
    const ux=unit(cross(up,face)),uy=unit(cross(face,ux));
    // Two offset whorls have subtly ruffled edges and a folded midrib.
    for(let layer=0;layer<2;layer++)for(let petal=0;petal<9;petal++){
      const a=TAU*(petal+.48*layer)/9+index*.63, d=add(mul(ux,Math.cos(a)),mul(uy,Math.sin(a)));
      const tangent=unit(cross(face,d)),base=add(head,mul(d,radius*.13));
      const length=radius*(layer?.78:1)*(.98+.09*Math.sin(petal*1.74+index));
      paint(material.petal,mul(rgb,(layer?1.08:.89)+.09*Math.sin(petal*1.8)));
      pivot=base;axis=unit(cross(d,face));weight=1;
      const surface=(t,u)=>{
        const taper=Math.pow(Math.max(0,Math.sin(Math.PI*(.06+.9*t))),.64);
        const w=length*(layer?.39:.43)*taper;
        const wave=(.028+.012*Math.sin(a*5))*Math.cos(t*8+u*4)*Math.abs(u)*t;
        const cup=length*(.21*Math.sin(t*Math.PI)-.13*t*t+.17*u*u*t+wave+.16*layer*t);
        return add(add(add(base,mul(d,length*t*(1-.105*u*u*t))),mul(tangent,w*u)),mul(face,cup));
      };
      const make=(t,u)=>{
        const v=surface(t,u),n=unit(cross(sub(surface(t+.001,u),v),sub(surface(t,u+.001),v)));
        return point(v,n,.68+.31*t+.11*Math.cos(u*3.3)+.025*Math.cos(u*15),1);
      };
      for(let j=0;j<7;j++)for(let k=0;k<5;k++){
        const t=j/7,b=(j+1)/7,u=2*k/5-1,w=2*(k+1)/5-1;
        quad(make(t,u),make(t,w),make(b,w),make(b,u));
      }
    }
    paint(material.pollen,[.88,.69,.39]);sphere(add(head,mul(face,radius*.035)),[radius*.165,radius*.15,radius*.15],6,12);
    for(let k=0;k<15;k++){
      const a=k*2.39996,r=radius*.15*Math.sqrt(k/15);
      const loc=add(add(add(head,mul(ux,r*Math.cos(a))),mul(uy,r*Math.sin(a))),mul(face,radius*.15));
      paint(material.pollen,k%3?[.99,.83,.55]:[.91,.67,.37]);sphere(loc,[.0028,.0034,.0028],3,5);
    }
  });
  return {vertices:new Float32Array(data),gardenStart};
}

// Building the silk petals off the UI thread keeps phone gestures responsive.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope && self.name === 'lunch-garden-mesh') {
  const mesh=buildStillLife();
  self.postMessage(mesh,[mesh.vertices.buffer]);
}

const vertexSource=`
  precision highp float;
  attribute vec3 p,n,albedo,tag,hinge,axis;
  uniform vec2 viewport;
  uniform vec4 place[10],angles[10],growth[10];
  uniform float time;
  varying vec3 vNormal,vColor,vPosition;
  varying float vMat,vOpacity,vDetail;
  vec3 twist(vec3 v,vec3 k,float a){
    return v*cos(a)+cross(k,v)*sin(a)+k*dot(k,v)*(1.-cos(a));
  }
  vec3 orient(vec3 v,vec3 r){
    v=twist(v,vec3(0.,1.,0.),r.y);
    v=twist(v,vec3(1.,0.,0.),r.x);
    return twist(v,vec3(0.,0.,1.),r.z);
  }
  void main(){
    int i=int(tag.x+.5);
    vec4 loc=place[i],spin=angles[i],g=growth[i];
    vMat=tag.y;vDetail=tag.z;vColor=albedo;vOpacity=loc.w;
    vNormal=vec3(0.,0.,1.);vPosition=vec3(0.);
    if(loc.w<.005){gl_Position=vec4(3.,3.,1.,1.);return;}
    vec3 pos=p,normal=n;
    if(i>1){
      if(tag.y>4.5 && tag.y<5.5){
        float close=(1.-g.y)*1.42;
        pos=hinge+twist((p-hinge)*(.30+.70*g.y),axis,close);
        normal=twist(normal,axis,close);
      }
      float s=clamp(pos.y/max(.01,g.w),0.,1.);
      // Lengthen only the stalk for tall, narrow viewports.
      pos.y+=(g.z-1.)*g.w*s;
      float breeze=sin(time*.77+float(i)*1.37+pos.y*3.)*.012;
      pos.x+=s*s*(breeze+spin.w);
      pos.z+=s*s*.008*sin(time*.63+float(i)*1.12);
      pos*=g.x;
      pos.y*=.25+.75*g.x;
    }
    if(tag.y>6.5 && tag.y<7.5){
      if(i==0){pos.x*=1.+g.x*.15;pos.z*=1.-g.x*.1;}
      pos=orient(pos,vec3(.35,0.,0.));
    }else{pos=orient(pos,spin.xyz);normal=orient(normal,spin.xyz);}
    float perspective=1./clamp(1.-pos.z*.31,.78,1.24);
    vec2 offset=2.*pos.xy*loc.z*min(viewport.x,viewport.y)/viewport*perspective;
    gl_Position=vec4(vec2(2.*loc.x-1.,1.-2.*loc.y)+offset,clamp(-pos.z*.9+(tag.y==7.?.77:0.),-.98,.96),1.);
    vNormal=normal;vPosition=pos;
  }
`;
const fragmentSource=`
  precision mediump float;
  varying vec3 vNormal,vColor,vPosition;
  varying float vMat,vOpacity,vDetail;
  uniform float time;
  float strip(vec3 d,vec3 side,float width){
    return exp(-pow((dot(d,normalize(side))-.29)/width,2.));
  }
  vec3 studio(vec3 r){
    float y=r.y*.5+.5;
    vec3 env=mix(vec3(.065,.045,.13),vec3(.35,.31,.53),smoothstep(.26,.9,y));
    env+=vec3(.53,.53,.64)*strip(r,vec3(-.64,.36,.61),.13);
    env+=vec3(.78,.86,1.)*strip(r,vec3(.48,.28,.66),.044);
    env+=vec3(.45,.29,.63)*strip(r,vec3(-.51,.88,-.42),.19);
    env+=vec3(.32,.36,.59)*smoothstep(.49,.77,r.y);
    return env;
  }
  void main(){
    if(vOpacity<.005)discard;
    if(vMat>6.5 && vMat<7.5){
      float a=vOpacity*.35*vDetail*vDetail;
      gl_FragColor=vec4(vColor,a);return;
    }
    vec3 N=normalize(vNormal);
    if(N.z<-.05)N=-N;
    vec3 V=normalize(vec3(-vPosition.x*.23,.15,1.));
    vec3 L=normalize(vec3(-.61,.87,.68)),H=normalize(L+V),R=reflect(-V,N);
    float ndl=max(dot(N,L),0.), h=max(dot(N,H),0.);
    vec3 col=vColor*(.42+.61*ndl);
    float edge=pow(1.-abs(dot(N,V)),2.6);
    if(vMat<.5 || vMat>7.5){
      col=vColor*(.18+.22*ndl)+studio(R)*(.69+.17*edge);
      col+=pow(h,62.)*.36;
      if(vMat>7.5)col*=.55;
    }else if(vMat<1.5){
      float grain=sin(vPosition.x*640.+sin(vPosition.y*29.)*1.9)*.04;
      col*=1.+grain; col+=vec3(.55,.41,.27)*pow(h,34.)*.42;
    }else if(vMat<2.5){
      col+=vec3(.67,.48,.29)*pow(h,19.)*.32+vec3(.18,.12,.10)*edge;
    }else if(vMat<4.5){
      col+=vec3(.24,.27,.36)*pow(h,19.)+.13*edge;
    }else if(vMat<5.5){
      float silk=pow(max(0.,dot(normalize(vec3(.76,.29,.62)),N)),6.);
      col=vColor*(.55+.47*ndl)+vec3(.29,.27,.49)*silk+vec3(.22,.23,.31)*edge;
      col+=vec3(.51,.46,.62)*pow(h,27.)*.40;
    }else{col+=vec3(.43,.31,.15)*pow(h,16.)+.1*edge;}
    gl_FragColor=vec4(min(col,vec3(1.)),vOpacity);
  }
`;

// Coordinates use viewport fractions from the top left. Lengths use the shorter
// viewport edge. Pose progress is reversible and creates no timers or listeners.
export function createGardenProps(canvas){
  if(!canvas)return null;
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:true,powerPreference:'low-power'});
  if(!gl)return null;
  let buffer,program,vert,frag,worker,disposed=false;
  function shader(kind,source){
    const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
      const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message||'Could not compile the garden material.');
    }
    return s;
  }
  function destroy(){
    disposed=true;worker?.terminate();
    if(buffer)gl.deleteBuffer(buffer);
    if(program)gl.deleteProgram(program);
    if(vert)gl.deleteShader(vert);
    if(frag)gl.deleteShader(frag);
  }
  try{
    vert=shader(gl.VERTEX_SHADER,vertexSource);frag=shader(gl.FRAGMENT_SHADER,fragmentSource);
    program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    const stride=18*4;
    let gardenStart=0,vertexCount=0,lastPose=null;
    buffer=gl.createBuffer();
    gl.useProgram(program);
    const attributes=['p','n','albedo','tag','hinge','axis'].map(name=>gl.getAttribLocation(program,name));
    const uniforms=Object.fromEntries(['viewport','time','place[0]','angles[0]','growth[0]'].map(name=>[name,gl.getUniformLocation(program,name)]));
    const place=new Float32Array(40),angles=new Float32Array(40),growth=new Float32Array(40);
    const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
    const keyframes=[[0,-.19],[.09,.105],[.28,.42],[.36,.27],[.55,.63],[.63,.46],[.86,.80],[1,1.16]];
    function sweepPath(v){
      let i=1;while(i<keyframes.length-1 && v>keyframes[i][0])i++;
      const a=keyframes[i-1],b=keyframes[i];return a[1]+(b[1]-a[1])*smooth(a[0],b[0],v);
    }
    const plantX=[.025,.124,.173,-.025,.837,.989,.903,.769];
    const plantY=[.97,.987,.98,.945,.982,.976,.99,.989];
    const heights=[.48,.34,.52,.27,.40,.53,.31,.24];
    const phases=[.01,.15,.07,.22,.08,0,.22,.27];
    let painted=false;
    function render(pose={}){
      lastPose=pose;
      if(!vertexCount||disposed)return;
      const {width,height,dpr=1,time=0,pointerX=0,descent=0,sweep=0,toss=0,night=0,bloom=0}=pose;
      if(!(width>0&&height>0)||gl.isContextLost())return;
      const floor=smooth(.70,.99,descent)*(1-smooth(.62,.97,toss))*(1-clamp(night));
      const garden=clamp(bloom);
      if(floor<.004 && garden<.002){
        if(painted){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);painted=false;}
        return;
      }
      const pixelRatio=clamp(dpr,.55,1.5);
      const w=Math.round(width*pixelRatio),h=Math.round(height*pixelRatio);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const short=width<height,wide=clamp(height/width,1,1.67);
      const bx=sweepPath(clamp(sweep)),t=smooth(0,.72,toss);
      const bucketX=.814+(1-smooth(.71,.98,descent))*.25-.23*t;
      const bucketY=.792-.16*Math.sin(Math.PI*t);
      place.set([bucketX,bucketY,short?1.39:1.07,floor],0);
      angles.set([.19+.29*t,-.12+pointerX*.045,-.05+1.61*t,0],0);
      growth.set([t,0,0,0],0);
      const broomVisible=floor*smooth(.006,.095,sweep)*(1-smooth(.89,1,sweep));
      const onReturn=Math.sin(3*Math.PI*clamp(sweep));
      place.set([bx,.803-.038*Math.max(0,-Math.sin(6*Math.PI*sweep)),(short?1.42:1.12)*(1+.47*smooth(.80,1,sweep)),broomVisible],4);
      angles.set([.19,-.18+onReturn*.11,.39+.17*Math.sin(TAU*(sweep*2.85)-.55)+.43*smooth(.81,1,sweep),0],4);
      growth.set([0,0,0,0],4);
      for(let i=0;i<8;i++){
        const phase=phases[i],sprout=smooth(phase,.68+phase*.6,garden),open=smooth(.28+phase,.92+phase*.27,garden);
        const a=clamp(sprout*4)*(1-clamp(night)*.8)*(1-smooth(.52,.94,garden));
        const j=(i+2)*4;
        place.set([plantX[i],plantY[i],short?1.17:1.04,a],j);
        angles.set([.08,.14*Math.sin(i*1.7),.04*Math.sin(i*.9),pointerX*.006],j);
        growth.set([sprout,open,wide,heights[i]],j);
      }
      gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      attributes.forEach((at,i)=>{gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,stride,12*i);});
      gl.uniform2f(uniforms.viewport,width,height);gl.uniform1f(uniforms.time,time);
      gl.uniform4fv(uniforms['place[0]'],place);gl.uniform4fv(uniforms['angles[0]'],angles);gl.uniform4fv(uniforms['growth[0]'],growth);
      const first=floor<.004?gardenStart:0;
      const end=garden<.002?gardenStart:vertexCount;
      gl.drawArrays(gl.TRIANGLES,first,end-first);painted=true;
    }
    function install(mesh){
      if(disposed||gl.isContextLost())return;
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);
      gardenStart=mesh.gardenStart;vertexCount=mesh.vertices.length/18;
      if(lastPose)render(lastPose);
    }
    function onWorkerUnavailable(){
      worker?.terminate();worker=null;
      const build=()=>{if(!disposed)install(buildStillLife());};
      if('requestIdleCallback' in globalThis)globalThis.requestIdleCallback(build,{timeout:500});else setTimeout(build,0);
    }
    try{
      worker=new Worker(import.meta.url,{type:'module',name:'lunch-garden-mesh'});
      worker.onmessage=event=>{install(event.data);worker.terminate();worker=null;};
      worker.onerror=onWorkerUnavailable;
    }catch{onWorkerUnavailable();}
    return {render,destroy};
  }catch{destroy();return null;}
}
