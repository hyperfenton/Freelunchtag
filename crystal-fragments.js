// A shared, irregular polar partition tiles the photographed glass with 1,000 triangles.
// Each triangle is extruded independently, and retains the same identity through all acts.
const CENTER = [.492, .472];
const RADII = [.443, .422];
const TAU = Math.PI * 2;
function random(seed) {
  let x = seed >>> 0;
  return () => {x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};
}

function cutGlass() {
  const rng = random(0x51a77e12);
  const rings = [];
  const slices = 40;
  for (let j=1;j<=13;j++) {
    const ring=[];
    const r=j/13;
    for(let k=0;k<slices;k++){
      const a=TAU*(k + (j%2)*.31 + (rng()-.5)*.59)/slices;
      const radius = j===13 ? .992+.006*Math.cos(a*78) : r + (rng()-.5)*.056;
      ring.push([CENTER[0]+RADII[0]*radius*Math.cos(a), CENTER[1]+RADII[1]*radius*Math.sin(a)]);
    }
    rings.push(ring);
  }
  const data=[], glints=[];
  function shard(points) {
    const c=[0,0];
    points.forEach(p=>{c[0]+=p[0]/3;c[1]+=p[1]/3;});
    const seed=[rng(),rng(),rng(),rng()];
    const floorSeed=[rng(),rng(),rng(),rng()];
    const vertex=(p,layer,face,nx,ny,bary)=>{
      data.push(p[0],p[1],c[0],c[1],layer,face,nx,ny,...seed,...bary,...floorSeed);
    };
    const a=[1,0,0], b=[0,1,0], d=[0,0,1];
    [[0,1,a],[1,1,b],[2,1,d],[2,-1,d],[1,-1,b],[0,-1,a]].forEach(([i,z,v])=>vertex(points[i],z,z>0?0:1,0,0,v));
    for(let i=0;i<3;i++){
      const p=points[i], q=points[(i+1)%3], dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);
      const nx=dy/length, ny=-dx/length;
      [[p,1,a],[p,-1,b],[q,1,d],[q,1,a],[p,-1,b],[q,-1,d]].forEach(([pt,z,bc])=>vertex(pt,z,2,nx,ny,bc));
    }
    glints.push(c[0],c[1],c[0],c[1],1,3,0,0,...seed,1,0,0,...floorSeed);
  }
  for(let k=0;k<slices;k++)shard([CENTER,rings[0][k],rings[0][(k+1)%slices]]);
  for(let j=1;j<rings.length;j++){
    for(let k=0;k<slices;k++){
      const next=(k+1)%slices, a=rings[j-1][k],b=rings[j-1][next],c=rings[j][k],d=rings[j][next];
      const ccw=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])>(q[1]-p[1])*(r[0]-p[0]);
      const preferFirst=rng()<.5;
      if((preferFirst && ccw(a,c,d)&&ccw(a,d,b)) || !(ccw(a,c,b)&&ccw(b,c,d))){shard([a,c,d]);shard([a,d,b]);}
      else{shard([a,c,b]);shard([b,c,d]);}
    }
  }
  return {triangles:new Float32Array(data),glints:new Float32Array(glints)};
}

const shardVertex = `
precision highp float;
attribute vec2 aUV, aCentroid;
attribute vec4 aFace, aSeed, aFloor;
attribute vec3 aBary;
uniform vec2 uViewport,uAnchor,uLogoAt;
uniform vec4 uLens;                 // side in pixels, tilt, roll, dpr
uniform vec4 uStory;                // breakage, descent, sweep, toss
uniform vec4 uLight;                // light, time, night, bloom
varying vec2 vUV;
varying vec3 vNormal,vBary;
varying vec4 vMaterial;             // face, fracture, random, alpha
varying float vFlash;
const float PI = 3.14159265;

mat2 spin(float q){float c=cos(q),s=sin(q);return mat2(c,s,-s,c);}
float rise(float a,float b,float t){return smoothstep(a,b,t);}
float plateZ(vec2 uv){
  vec2 p=(uv-vec2(.492,.472))/vec2(.443,.422);
  float r=length(p),f=.5+.5*cos(78.*atan(p.y,p.x)+.82*(r-.78));
  return (1.-smoothstep(.971+f*.009,1.005+f*.006,r))*(.009+.049*smoothstep(.637,.95,r)+.0048*f*smoothstep(.64,.76,r));
}
vec3 projectPlate(vec2 p,float layer){
  vec2 pos=p-vec2(.492,.472);
  float z=plateZ(p)+min(0.,layer)*.003;
  vec2 yz=spin(uLens.y)*vec2(pos.y,z);
  vec2 screen=spin(uLens.z)*vec2(pos.x,yz.x);
  return vec3(uAnchor*uViewport+screen*uLens.x/max(.29,1.-yz.y/1.85),yz.y);
}
void main(){
  float sh=uStory.x, descend=uStory.y, sweep=uStory.z, toss=uStory.w;
  float t=rise(.012,.99,sh), flight=sin(t*PI);
  float shortest=min(uViewport.x,uViewport.y);
  vec2 radial=aCentroid-vec2(.492,.472);
  float ang=atan(radial.y,radial.x)+(aSeed.x-.5)*1.24;
  vec2 direction=vec2(cos(ang),sin(ang));
  vec3 intact=projectPlate(aUV,aFace.x);
  vec3 origin=projectPlate(aCentroid,1.);
  float reach=.29+.47*sqrt(aSeed.y);
  vec2 settled=uLogoAt*uViewport+vec2(direction.x*reach*(1.0+.38*min(1.,uViewport.x/uViewport.y)),direction.y*reach)*shortest;
  // Angular momentum, launch impulse, and falling elevation differ for every prism.
  vec2 center=mix(origin.xy,settled,t)+direction*flight*shortest*(.07+.34*aSeed.z);
  center.y-=shortest*flight*(.06+.25*aSeed.w);
  float size=mix(uLens.x,shortest*(.53+.91*aSeed.w),t)*(1.+flight*aSeed.x*.82);
  float depth=mix(origin.z,.18*(aSeed.z-.5),t)+flight*.45*aSeed.x;

  vec2 floorPos=vec2(mix(.025,.975,aFloor.x),.58+.39*sqrt(aFloor.y));
  vec2 floor=floorPos*uViewport;
  float lower=rise(0.,.99,descend);
  center=mix(center,floor,lower);
  center.y-=sin(lower*PI)*shortest*.075*aSeed.w;
  float spinX=t*(1.5+5.9*aSeed.z)+flight*.8;
  float spinY=t*(1.8+6.8*aSeed.w);
  float spinZ=t*(aSeed.x-.5)*9.2;
  spinX=mix(spinX,1.04+.40*(aSeed.z-.5),lower);
  spinY=mix(spinY,(aSeed.w-.5)*.36,lower);
  spinZ=mix(spinZ,6.28318*aFloor.z,lower);
  size=mix(size,shortest*(.16+.58*pow(aFloor.w,2.2)),lower);
  depth=mix(depth,-.22+.34*floorPos.y,lower);

  // Three advancing strokes push, relax, and gather the same pieces.
  float passA=rise(.015,.245,sweep), passB=rise(.265,.535,sweep), passC=rise(.555,.855,sweep);
  float front=.10+.32*passA+.21*passB+.17*passC;
  float caught=rise(floorPos.x-.055,floorPos.x+.035,front)*rise(0.,.10,sweep);
  float last=rise(.71,.88,sweep);
  caught=max(caught,last);
  float bristle=sin(passA*PI)+sin(passB*PI)+sin(passC*PI);
  vec2 train=vec2(front+(aSeed.x-.5)*mix(.113,.034,last),mix(floorPos.y,.776, .52+.48*last)+(aSeed.y-.5)*.070*(1.-last));
  vec2 pail=vec2(.81+(aSeed.y-.5)*.051,.785+(aSeed.z-.5)*.037);
  vec2 load=mix(train,pail,last);
  center=mix(center,load*uViewport,caught);
  center.y-=caught*bristle*shortest*.036*aSeed.z;
  size*=1.-caught*(.21+.24*last);
  spinZ+=caught*bristle*(aSeed.y-.5)*2.2;

  float tossT=clamp((toss-aSeed.w*.41)/(.52+.06*aSeed.z),0.,1.);
  float airborne=sin(tossT*PI);
  vec2 soil=vec2(.53+(aSeed.x-.5)*.27,.71+(aSeed.y-.5)*.135);
  vec2 thrown=mix(pail,soil,tossT);
  thrown.y-=airborne*(.18+.28*aSeed.z);
  thrown.x+=airborne*(aSeed.y-.5)*.14;
  center=mix(center,thrown*uViewport,rise(0.,.035,toss));
  spinX+=tossT*(2.+5.*aSeed.z);
  spinZ+=tossT*(aSeed.x-.5)*9.;
  size*=1.+airborne*.80-tossT*.30;
  depth+=airborne*(.23+.22*aSeed.z);

  vec3 rel=vec3(aUV-aCentroid,aFace.x*(.0018+.0015*aSeed.w));
  rel.yz=spin(spinX)*rel.yz;rel.xz=spin(spinY)*rel.xz;rel.xy=spin(spinZ)*rel.xy;
  vec2 loose=center+rel.xy*size/(1.-clamp(rel.z+depth,-.45,.65)*.46);
  vec2 px=mix(intact.xy,loose,rise(.007,.23,sh));
  vec2 clip=vec2(2.,-2.)*(px/uViewport-.5);
  gl_Position=vec4(clip,clamp(-.82*(depth+rel.z),-.91,.91),1.);
  vec3 normal=aFace.y<.5?vec3(0,0,1):aFace.y<1.5?vec3(0,0,-1):vec3(aFace.zw,.11);
  normal.yz=spin(spinX)*normal.yz;normal.xz=spin(spinY)*normal.xz;normal.xy=spin(spinZ)*normal.xy;
  vNormal=normal; vUV=aUV; vBary=aBary;
  float visible=(1.-rise(.06,.96,uLight.z))*(1.-rise(0.,.47,uLight.w));
  float inPail=last*(1.-rise(.0,.16,toss));
  visible*=1.-.78*inPail;
  vMaterial=vec4(aFace.y,rise(.022,.27,sh),aSeed.w,visible);
  // Glints are highlights of existing pieces; they add no extra glass geometry.
  float clock=sin(uLight.y*(.95+aSeed.z*.61)+aSeed.x*81.+sh*6.+descend*3.+toss*4.);
  vFlash=rise(.90,.997,clock)*(.42+.58*aSeed.w)*rise(.12,.34,sh)*visible;
  if(aFace.y>2.5){
    vFlash*=step(.73,aSeed.y);
    gl_PointSize=clamp((3.+11.*vFlash)*uLens.w,1.,24.);
    if(vFlash<.055)gl_Position=vec4(-3.,-3.,0.,1.);
  }
}`;

const shardFragment = `
precision highp float;
uniform sampler2D uPhoto;
uniform vec4 uLight,uStory;
varying vec2 vUV;
varying vec3 vNormal,vBary;
varying vec4 vMaterial;
varying float vFlash;
void main(){
  float face=vMaterial.x, fractured=vMaterial.y, randomValue=vMaterial.z;
  if(face>2.5){
    vec2 p=gl_PointCoord*2.-1.;
    float falloff=max(0.,1.-length(p));
    float cross=max(exp(-28.*abs(p.x)),exp(-28.*abs(p.y)))*pow(falloff,1.4);
    float hot=exp(-18.*dot(p,p));
    gl_FragColor=vec4(mix(vec3(.64,.87,1.),vec3(1.,.95,1.),hot),(hot+.65*cross)*vFlash*.78);return;
  }
  if(face>.5 && fractured<.005)discard;
  vec3 n=normalize(vNormal);
  vec3 tex=texture2D(uPhoto,vUV).rgb;
  vec3 lamp=normalize(vec3(-.58+uLight.x*.73,-.57,1.));
  float ndl=abs(dot(n,lamp)), fresnel=pow(1.-abs(n.z),2.);
  float mirror=pow(max(dot(reflect(-lamp,n),vec3(0.,0.,1.)),0.),15.);
  float band=pow(.5+.5*cos(n.y*11.+n.x*5.+randomValue*4.7+.4*uLight.x),6.);
  vec3 spectral=.57+.43*cos(vec3(.18,2.38,4.72)+n.x*5.+n.y*3.9+randomValue*3.);
  float seam=1.-smoothstep(.006,.052,min(vBary.x,min(vBary.y,vBary.z)));
  vec3 cut=tex*(.65+.31*ndl)+vec3(.19,.16,.32)*fresnel;
  cut+=spectral*(.06+.31*band)*(.22+.78*fresnel)+vec3(.93,.95,1.)*(.59*mirror+.18*vFlash+seam*.16);
  if(face>.5 && face<1.5)cut=mix(cut,vec3(.40,.37,.69)+spectral*.20,.20);
  if(face>1.5)cut=vec3(.19,.18,.33)+mix(spectral,vec3(.72,.78,.91),.38)*(.16+.33*band)+vec3(.9,.95,1.)*(.48*mirror+.19*seam);
  float onFloor=smoothstep(.12,.90,uStory.y)*(1.-smoothstep(.04,.35,uStory.w));
  cut=mix(cut,cut*vec3(.67,.67,.78)+vec3(.021,.027,.05),onFloor*(.66+.30*(1.-randomValue)));
  float alpha=mix(1.,face>1.5?.96:.88,fractured)*vMaterial.w;
  gl_FragColor=vec4(mix(tex,cut,fractured),alpha);
}`;

const logoVertex=`
precision highp float;
attribute vec3 aLayerUV;
uniform vec2 uViewport,uLogoAt;
uniform vec4 uLens,uStory,uLight;
uniform vec2 uPointer;
varying vec2 vUV;
varying float vLevel;
void main(){
  vUV=aLayerUV.xy;vLevel=aLayerUV.z;
  float b=smoothstep(.22,.87,uStory.x), d=smoothstep(.03,.98,uStory.y);
  float size=min(uViewport.x,uViewport.y)*mix(.39,.68,b);
  float angle=(1.-b)*.82+.27*sin(uLight.y*.43)+uPointer.x*.09;
  float z=(vLevel-1.)*.094;
  vec3 p=vec3(aLayerUV.xy-.5,z);
  p.xz=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*p.xz;
  angle=-.14+.12*cos(uLight.y*.39)+.10*uPointer.y;
  p.yz=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*p.yz;
  vec2 pos=uLogoAt*uViewport + p.xy*size/(1.-p.z*.4);
  pos+=vec2((1.-vLevel)*size*.032,(1.-vLevel)*size*.036-d*size*.28);
  vec2 clip=(pos/uViewport-.5)*vec2(2.,-2.);
  gl_Position=vec4(clip,.45-vLevel*.14,1.);
}`;
const logoFragment=`
precision highp float;
uniform sampler2D uLogo,uBevel,uEnvironment;
uniform vec2 uTexel;
uniform vec4 uLight,uStory;
uniform float uLogoOpacity;
varying vec2 vUV;
varying float vLevel;
float dist(vec2 p){return texture2D(uBevel,p).r*16.;}
float boltDistance(vec2 p){return (texture2D(uBevel,p).g-.5)*32.;}
void main(){
  vec4 brand=texture2D(uLogo,vUV);
  vec4 relief=texture2D(uBevel,vUV);
  if(min(brand.a,relief.a)<.065)discard;
  float d=dist(vUV), bd=boltDistance(vUV);
  float bevel=1.-smoothstep(.5,10.3,d);
  vec2 gradient=.5*vec2(dist(vUV+vec2(uTexel.x,0))-dist(vUV-vec2(uTexel.x,0)),
                         dist(vUV+vec2(0,uTexel.y))-dist(vUV-vec2(0,uTexel.y)));
  float bolt=smoothstep(-.6,.6,bd), engraved=1.-smoothstep(.6,4.6,abs(bd));
  vec2 bg=.5*vec2(boltDistance(vUV+vec2(uTexel.x,0))-boltDistance(vUV-vec2(uTexel.x,0)),
                    boltDistance(vUV+vec2(0,uTexel.y))-boltDistance(vUV-vec2(0,uTexel.y)));
  // A brilliant cut with a broad table facet and alternating angular crown facets.
  vec2 jewel=(vUV-vec2(.475,.50))*vec2(1.16,1.);
  float radius=length(jewel), bearing=atan(jewel.y,jewel.x);
  float sector=floor((bearing+3.14159)*1.753);
  float mid=(sector+.5)/1.753-3.14159;
  float facetDistance=radius*cos(mod(bearing+.52,1.047)-.5236);
  float crown=smoothstep(.13+.022*cos(mid*4.),.178+.022*cos(mid*4.),facetDistance);
  float split=step(.0,cos(bearing*11.+.36));
  vec2 facets=mix(vec2(-.045,.09),vec2(cos(mid+.25*split),sin(mid+.25*split))*(.21+.23*split),crown);
  facets+=.045*vec2(cos(3.9*sector),sin(2.7*sector))+.24*jewel;
  vec3 n=normalize(vec3(facets-gradient*bevel*.92+bg*engraved*.65,1.));
  float angle=.27*sin(uLight.y*.43)+.22*uLight.x;
  n.xz=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*n.xz;
  vec3 reflected=reflect(vec3(0.,0.,-1.),n);
  vec3 refracted=refract(vec3(0.,0.,-1.),n,1./1.56);
  float envAngle=atan(reflected.y,reflected.x)+.36*sin(.31*uLight.y)+dot(jewel,vec2(.52,-.83));
  vec2 envUV=vec2(.492,.472)+vec2(.443,.422)*(.713+.26*abs(reflected.z))*vec2(cos(envAngle),sin(envAngle));
  // The studio photograph itself reflects and splits across the cut planes.
  vec3 a=texture2D(uEnvironment,envUV).rgb;
  vec3 b=texture2D(uEnvironment,envUV+reflected.xy*.018).rgb;
  float luminosity=dot(a,vec3(.24,.64,.12));
  float bLum=dot(b,vec3(.24,.64,.12));
  vec3 ice=mix(vec3(.15,.15,.38),vec3(.89,.93,1.),smoothstep(.10,.85,luminosity));
  vec3 optic=mix(ice,vec3(a.r,.5*(a.g+b.g),b.b),.28);
  optic+=vec3(.065,.064,.12)*(1.-abs(n.z));
  float cyan=smoothstep(.04,.53,brand.b-brand.r);
  vec3 tint=mix(vec3(.76,.74,.92),vec3(.67,.89,.99),cyan);
  vec3 body=optic*(.79+.19*tint)+tint*.071;
  body=mix(mix(vec3(.34,.38,.57),vec3(.69,.73,.85),smoothstep(-.30,.36,jewel.x-jewel.y)),body,.72);
  body+=vec3(.025,.095,.11)*cyan;
  // Low-dispersion gold glows inside the carved bolt. Its chamfer has a luminous rim.
  vec3 boltGlass=mix(vec3(.48,.44,.55),vec3(1.,.95,.82),smoothstep(.11,.74,bLum));
  boltGlass+=vec3(.13,.105,.06)*(1.-bevel);
  body=mix(body,boltGlass,bolt*.89);
  body*=1.-.46*exp(-pow((bd+2.35)/1.63,2.));
  float ridge=exp(-pow(bd/1.35,2.));
  body+=vec3(.69,.77,.87)*ridge*(.48+.34*max(0.,dot(bg,vec2(-.64,-.75))));
  float perimeter=exp(-pow((d-2.)/1.6,2.));
  float edgeBeam=.23+.74*max(0.,dot(n.xy,vec2(-.71,-.70)));
  body+=vec3(.61,.80,1.)*(bevel*edgeBeam*.69+perimeter*.37);
  // Broad moving studio softbox reflected on the central table of the gemstone.
  float boxPosition=.03+.88*(.5+.5*sin(.43*uLight.y+.39));
  float box = exp(-pow((dot(vUV,vec2(.83,.40))-boxPosition+.047*n.x)/.048,2.));
  body+=vec3(.44,.46,.48)*box*(.39+.61*abs(reflected.z));
  vec3 lamp=normalize(vec3(-.4+.31*sin(uLight.y*.34),-.24,1.));
  body+=vec3(.43,.54,.64)*pow(max(dot(reflected,lamp),0.),26.);
  if(vLevel<.99){
    float cut=.5+.5*cos(22.*vLevel + 6.1*envAngle + dot(refracted.xy,vec2(4.,8.)));
    body=mix(vec3(.14,.13,.33),mix(vec3(.62,.68,.93),a,.50),smoothstep(.10,.92,cut))+.18*perimeter;
  }
  float opacity=smoothstep(.22,.68,uStory.x)*(1.-smoothstep(.02,.63,uStory.y))*uLogoOpacity;
  gl_FragColor=vec4(body,min(brand.a,relief.a)*opacity);
}`;

function chamfer(mask,w,h) {
  const result=new Float32Array(w*h);
  for(let i=0;i<result.length;i++)result[i]=mask[i]?24:0;
  const d=Math.SQRT2;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;result[i]=Math.min(result[i],result[i-1]+1,result[i-w]+1,result[i-w-1]+d,result[i-w+1]+d);
  }
  for(let y=h-2;y>0;y--)for(let x=w-2;x>0;x--){
    const i=y*w+x;result[i]=Math.min(result[i],result[i+1]+1,result[i+w]+1,result[i+w-1]+d,result[i+w+1]+d);
  }
  return result;
}

// Trace the printed eyelet and yellow bolt from the approved icon for physical cutouts.
function bevelImage(image) {
  const w=image.naturalWidth,h=image.naturalHeight;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0);
  const src=ctx.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h),bolt=new Uint8Array(w*h);
  const eyelet=new Uint8Array(w*h);
  const start=Math.floor(h*.269)*w+Math.floor(w*.648);
  const queue=[start];eyelet[start]=1;
  for(let k=0;k<queue.length;k++){
    const i=queue[k];
    for(const j of [i-1,i+1,i-w,i+w]){
      const x=(j%w)/w,y=Math.floor(j/w)/h;
      if(eyelet[j]||x<.51||x>.77||y<.154||y>.36)continue;
      const r=src[j*4],g=src[j*4+1],b=src[j*4+2];
      if(Math.max(r,g,b)<116||(r>g*1.28&&r>b*1.28)||(Math.min(r,g,b)>145&&Math.max(r,g,b)-Math.min(r,g,b)<47)){
        eyelet[j]=1;queue.push(j);
      }
    }
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x, j=i*4;
    const r=src[j],g=src[j+1],b=src[j+2];
    mask[i]=src[j+3]>=107&&!eyelet[i]?1:0;
    bolt[i]=r>150&&g>106&&g>b*1.62&&r>g*.97&&y/h>.29?1:0;
  }
  const outer=chamfer(mask,w,h),inBolt=chamfer(bolt,w,h),outBolt=chamfer(bolt.map(x=>1-x),w,h);
  const pixels=new Uint8Array(w*h*4);
  for(let i=0;i<outer.length;i++) {
    pixels[i*4]=Math.min(255,Math.round(outer[i]*255/16));
    pixels[i*4+1]=Math.max(0,Math.min(255,Math.round((.5+(inBolt[i]-outBolt[i])/32)*255)));
    pixels[i*4+3]=mask[i]?src[i*4+3]:0;
  }
  return {w,h,pixels};
}

export function createCrystalFragments(canvas,plateImage,logoImage) {
  if(!plateImage?.naturalWidth||!logoImage?.naturalWidth)return null;
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,depth:true,powerPreference:'low-power'});
  if(!gl)return null;
  const resources={programs:[],shaders:[],buffers:[],textures:[]};
  function destroy(){
    resources.buffers.forEach(b=>gl.deleteBuffer(b));resources.textures.forEach(t=>gl.deleteTexture(t));
    resources.programs.forEach(p=>gl.deleteProgram(p));resources.shaders.forEach(s=>gl.deleteShader(s));
  }
  function makeProgram(vs,fs,names) {
    const p=gl.createProgram();resources.programs.push(p);
    for(const [type,src] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){
      const s=gl.createShader(type);resources.shaders.push(s);gl.shaderSource(s,src);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    const uniforms=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(p,'u'+n)]));
    return {p,u:uniforms};
  }
  function buffer(array){
    const b=gl.createBuffer();resources.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);return b;
  }
  function texture(image,raw) {
    const t=gl.createTexture();resources.textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    if(raw)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,raw.w,raw.h,0,gl.RGBA,gl.UNSIGNED_BYTE,raw.pixels);
    else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    for(const v of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,v,gl.LINEAR);
    for(const v of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,v,gl.CLAMP_TO_EDGE);
    return t;
  }
  function assign(unit,t) {gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);}
  function layout(p, fields) {
    let offset=0;
    const stride=fields.reduce((sum,[,size])=>sum+size,0)*4;
    const entries=fields.map(([name,size])=>{
      const entry={idx:gl.getAttribLocation(p,'a'+name),size,offset};offset+=size*4;return entry;
    });
    return b=>{
      gl.bindBuffer(gl.ARRAY_BUFFER,b);
      for(const {idx,size,offset} of entries){
        if(idx<0)continue;
        gl.enableVertexAttribArray(idx);gl.vertexAttribPointer(idx,size,gl.FLOAT,false,stride,offset);
      }
    };
  }
  try {
    const common=['Viewport','LogoAt','Lens','Story','Light'];
    const glass=makeProgram(shardVertex,shardFragment,[...common,'Photo','Anchor']);
    const mark=makeProgram(logoVertex,logoFragment,[...common,'Logo','Bevel','Environment','Texel','LogoOpacity','Pointer']);
    const data=cutGlass(), shards=buffer(data.triangles), glints=buffer(data.glints);
    const shardCount=data.triangles.length/19, glintCount=data.glints.length/19;
    const prismLayout=layout(glass.p,[['UV',2],['Centroid',2],['Face',4],['Seed',4],['Bary',3],['Floor',4]]);
    const slab=[];
    for(let layer=0;layer<=8;layer++)for(const [x,y] of [[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]])slab.push(x,y,layer/8);
    const logoBuffer=buffer(new Float32Array(slab)), logoLayout=layout(mark.p,[['LayerUV',3]]);
    const plate=texture(plateImage),logo=texture(logoImage),bevel=texture(null,bevelImage(logoImage));
    gl.useProgram(glass.p);gl.uniform1i(glass.u.Photo,0);
    gl.useProgram(mark.p);gl.uniform1i(mark.u.Logo,1);gl.uniform1i(mark.u.Bevel,2);gl.uniform1i(mark.u.Environment,0);
    gl.uniform2f(mark.u.Texel,1/logoImage.naturalWidth,1/logoImage.naturalHeight);
    gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0,0,0,0);
    const locations=Array.from({length:gl.getParameter(gl.MAX_VERTEX_ATTRIBS)},(_,i)=>i);
    function resetAttributes() {locations.forEach(i=>gl.disableVertexAttribArray(i));}
    let wasClear=false;
    function render({width,height,dpr=1,x=.5,y=.5,scale=1,tilt=0,roll=0,light=.5,time=0,
      pointerX=0,pointerY=0,breakage=0,descent=0,sweep=0,toss=0,night=0,bloom=0,logo:logoOpacity=1,logoX=.5,logoY=.47}) {
      if(!width||!height||gl.isContextLost())return;
      const density=Math.min(1.5,Math.max(.5,dpr)),w=Math.round(width*density),h=Math.round(height*density);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;wasClear=false;}
      if(breakage<.005||night>=.998||bloom>=.998){
        if(!wasClear)gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        wasClear=true;return;
      }
      wasClear=false;gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      function pose(effect) {
        gl.useProgram(effect.p);const u=effect.u;
        gl.uniform2f(u.Viewport,width,height);gl.uniform2f(u.LogoAt,logoX,logoY);
        gl.uniform4f(u.Lens,scale*Math.min(width,height),tilt,roll,density);
        gl.uniform4f(u.Story,breakage,descent,sweep,toss);gl.uniform4f(u.Light,light,time,night,bloom);
      }
      gl.disable(gl.DEPTH_TEST);
      resetAttributes();
      if(breakage>.22&&descent<.63&&logoOpacity>0) {
        pose(mark);gl.uniform1f(mark.u.LogoOpacity,logoOpacity);gl.uniform2f(mark.u.Pointer,pointerX,pointerY);
        assign(0,plate);assign(1,logo);assign(2,bevel);logoLayout(logoBuffer);gl.drawArrays(gl.TRIANGLES,0,slab.length/3);
      }
      pose(glass);gl.uniform2f(glass.u.Anchor,x,y);assign(0,plate);
      gl.enable(gl.DEPTH_TEST);prismLayout(shards);gl.drawArrays(gl.TRIANGLES,0,shardCount);
      if(breakage>.12){gl.disable(gl.DEPTH_TEST);prismLayout(glints);gl.drawArrays(gl.POINTS,0,glintCount);}
    }
    return {render,destroy};
  } catch {
    destroy();return null;
  }
}
