// The printable meshes are quantized in hundredths of a millimetre.
const stage=document.getElementById('stage');
const panel=document.getElementById('collection');
const canvas=document.createElement('canvas');
canvas.setAttribute('aria-hidden','true');
canvas.className='product-canvas';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
async function mountViewer(){
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'low-power'});
 if(!gl)return;
 function shader(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Shader unavailable');return s;}
 const program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,`
 attribute vec3 p,n; attribute float m; uniform vec3 rotation; uniform float aspect,zoom;
 varying vec3 norm; varying vec2 uv; varying float mat;
 void main(){vec3 a=p*.01;vec3 v=a-vec3(0.,6.6,0.);vec3 cs=cos(rotation),sn=sin(rotation);
 mat3 ry=mat3(cs.y,0.,-sn.y,0.,1.,0.,sn.y,0.,cs.y);
 mat3 rx=mat3(1.,0.,0.,0.,cs.x,sn.x,0.,-sn.x,cs.x);
 mat3 rz=mat3(cs.z,sn.z,0.,-sn.z,cs.z,0.,0.,0.,1.);
 mat3 rot=rz*rx*ry;vec3 pos=rot*v;float depth=154.-pos.z;
 gl_Position=vec4(pos.x*zoom/aspect,pos.y*zoom,depth-30.,depth);
 norm=normalize(rot*(n*.001));mat=m;uv=vec2(.5+(m>1.5?-a.x:a.x)/48.,.5+a.y/72.);
 }`));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
 precision mediump float;varying vec3 norm;varying vec2 uv;varying float mat;
 uniform sampler2D front,back;
 void main(){vec3 N=normalize(norm),L=normalize(vec3(-.55,.83,1.45));vec3 c=vec3(.092,.074,.11);
 if(mat>.5&&mat<1.5)c=texture2D(front,uv).rgb;
 if(mat>1.5&&mat<2.5)c=texture2D(back,uv).rgb;
 if(mat>3.5)c=vec3(.99,.30,.23);
 float d=max(dot(N,L),0.);vec3 shade=c*(.70+.36*d);
 if(mat>2.5&&mat<3.5){vec3 R=reflect(vec3(0.,0.,-1.),N);
 float band=smoothstep(.14,.33,R.y)-smoothstep(.49,.68,R.y);
 float rim=pow(1.-abs(N.z),2.);shade=vec3(.075,.06,.09)+band*vec3(.75,.73,.72)+.36*rim;}
 else{shade+=.12*pow(max(dot(N,normalize(L+vec3(0.,0.,1.))),0.),28.);}
 gl_FragColor=vec4(shade,1.);}`));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Viewer unavailable');
 gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
 const loc={};for(const x of ['aspect','zoom','rotation','front','back'])loc[x]=gl.getUniformLocation(program,x);
 const attr=['p','n','m'].map(x=>gl.getAttribLocation(program,x));for(const x of attr)gl.enableVertexAttribArray(x);
 const base='assets/collection/';const cache=new Map();
 function cached(key,loader){if(!cache.has(key))cache.set(key,loader().catch(e=>{cache.delete(key);throw e;}));return cache.get(key);}
 function mesh(file){return cached(file,async()=>{const res=await fetch(base+file);if(!res.ok)throw Error('Missing model');const b=await res.arrayBuffer(),h=new Uint32Array(b,0,2),len=h[0]*14;
 const v=gl.createBuffer(),i=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,v);gl.bufferData(gl.ARRAY_BUFFER,new Uint8Array(b,8,len),gl.STATIC_DRAW);
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint8Array(b,8+len),gl.STATIC_DRAW);return {v,i,count:h[1]};});}
 function texture(file){return cached(file,async()=>{const im=new Image();im.src=base+file;await im.decode();const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);
 for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
 for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);return t;});}
 const [body,back]=await Promise.all([mesh('tag-hardware.bin'),texture('back.webp')]);
 let front,ink,active='',revision=0,angle=-.28,target=-.28,pitch=.05,wantPitch=.05,raf=0,drag=null,visible=true;
 function draw(){raf=0;if(!front||!ink||!visible)return;const w=Math.round(stage.clientWidth*Math.min(devicePixelRatio,2)),h=Math.round(stage.clientHeight*Math.min(devicePixelRatio,2));if(!w||!h)return;
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 angle=reduce.matches?target:angle+(target-angle)*.16;pitch=reduce.matches?wantPitch:pitch+(wantPitch-pitch)*.16;
 gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(loc.aspect,w/h);gl.uniform1f(loc.zoom,3.23);
 gl.uniform3f(loc.rotation,pitch,angle,-.20);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,ink);gl.uniform1i(loc.front,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,back);gl.uniform1i(loc.back,1);
 for(const s of [body,front]){gl.bindBuffer(gl.ARRAY_BUFFER,s.v);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,s.i);gl.vertexAttribPointer(attr[0],3,gl.SHORT,false,14,0);gl.vertexAttribPointer(attr[1],3,gl.SHORT,false,14,6);gl.vertexAttribPointer(attr[2],1,gl.SHORT,false,14,12);gl.drawElements(gl.TRIANGLES,s.count,gl.UNSIGNED_SHORT,0);}
 if(Math.abs(angle-target)+Math.abs(pitch-wantPitch)>.002)schedule();}
 function schedule(){if(!raf)raf=requestAnimationFrame(draw);}
 function rest(){target=panel.classList.contains('flipped')?Math.PI-.15:-.28;wantPitch=.05;schedule();}
 async function edition(){const id=panel.dataset.edition;if(id===active)return rest();const req=++revision;const [f,t]=await Promise.all([mesh('tag-'+id+'.bin'),texture(id+'.webp')]);if(req!==revision)return;
 front=f;ink=t;active=id;if(!reduce.matches)angle=-.7;rest();stage.classList.add('has-model');}
 stage.append(canvas);await edition();
 new MutationObserver(()=>edition().catch(()=>stage.classList.remove('has-model'))).observe(panel,{attributes:true,attributeFilter:['class','data-edition']});
 stage.addEventListener('pointerdown',e=>{drag=e.clientX;});
 stage.addEventListener('pointermove',e=>{if(reduce.matches)return;const rect=stage.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width-.5,y=(e.clientY-rect.top)/rect.height-.5;
 target=(panel.classList.contains('flipped')?Math.PI-.15:-.28)+(drag===null?x*.82:(e.clientX-drag)*.018);wantPitch=y*.42;schedule();});
 for(const ev of ['pointerup','pointercancel','pointerleave'])stage.addEventListener(ev,()=>{drag=null;rest();});
 new ResizeObserver(schedule).observe(stage);new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible)schedule();}).observe(stage);
 canvas.addEventListener('webglcontextlost',()=>{stage.classList.remove('has-model');visible=false;});
}
mountViewer().catch(()=>stage.classList.remove('has-model'));
