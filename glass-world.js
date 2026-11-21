// Relief geometry is registered to the photographed fluted glass and silverware.
const vertex = `
  precision highp float;
  attribute vec2 aUV;
  uniform vec2 uViewport, uCenter;
  uniform float uSide, uTilt, uRoll;
  varying vec2 vUV;

  vec2 cutlery(vec2 uv) {
    float fork = abs(uv.x - (.116 - .316 * uv.y));
    float knife = abs(uv.x - (.862 + .285 * uv.y));
    float forkWidth = .010 + .028 * smoothstep(.04, .18, uv.y) * (1. - smoothstep(.19, .24, uv.y));
    float knifeWidth = .013 + .024 * smoothstep(-.015, .045, uv.y) * (1. - smoothstep(.27, .34, uv.y));
    float forkMetal = (1. - smoothstep(.4 * forkWidth, forkWidth, fork)) * (1. - smoothstep(.41, .46, uv.y));
    float knifeMetal = (1. - smoothstep(.42 * knifeWidth, knifeWidth, knife)) * smoothstep(.008, .026, uv.y);
    return vec2(forkMetal, knifeMetal);
  }

  float heightAt(vec2 uv) {
    vec2 d = (uv - vec2(.492, .472)) / vec2(.443, .422);
    float r = length(d);
    float angle = atan(d.y, d.x);
    float flutes = .5 + .5 * cos(angle * 78. + .82 * (r - .78));
    float outside = 1. - smoothstep(.971 + flutes * .009, 1.005 + flutes * .006, r);
    float rim = smoothstep(.637, .95, r);
    float glass = outside * (.009 + .049 * rim + .0048 * flutes * smoothstep(.64, .76, r));
    vec2 metal = cutlery(uv);
    return max(glass, .018 * max(metal.x, metal.y));
  }

  void main() {
    vUV = aUV;
    vec2 pos = aUV - vec2(.492, .472);
    float z = heightAt(aUV);
    float st = sin(uTilt), ct = cos(uTilt);
    vec2 tilted = vec2(pos.x, ct * pos.y - st * z);
    float depth = st * pos.y + ct * z;
    float sr = sin(uRoll), cr = cos(uRoll);
    vec2 turned = vec2(cr * tilted.x - sr * tilted.y, sr * tilted.x + cr * tilted.y);
    float perspective = max(.29, 1. - depth / 1.85);
    vec2 anchor = vec2(2. * uCenter.x - 1., 1. - 2. * uCenter.y);
    vec2 screenOffset = turned * vec2(2., -2.) * uSide / uViewport;
    gl_Position = vec4(anchor * perspective + screenOffset, .08 * perspective - depth * .30, perspective);
  }
`;

const fragment = `
  precision highp float;
  uniform sampler2D uPhoto;
  uniform vec2 uViewport, uPointer, uPulse;
  uniform float uDpr, uTime, uTilt, uRoll, uLight, uRipple, uFlow, uSide, uPlateOpacity;
  varying vec2 vUV;

  vec3 cloth(vec2 pixel) {
    vec2 p = pixel / uViewport;
    vec3 base = mix(vec3(.129,.069,.427), vec3(.187,.108,.552), .43 + .24*p.x + .13*p.y);
    float weave = sin(pixel.x*2.07 + pixel.y*.11) * sin(pixel.y*1.81) * .0012;
    return base + weave;
  }

  void main() {
    vec2 uv = vUV;
    vec2 pixel = vec2(gl_FragCoord.x, uViewport.y*uDpr - gl_FragCoord.y) / uDpr;
    vec3 base = cloth(pixel);
    vec2 d = (uv - vec2(.492,.472)) / vec2(.443,.422);
    float r = length(d), a = atan(d.y,d.x);
    float reeds = cos(a*78. + .82*(r-.78));
    float rim = smoothstep(.625,.71,r) * (1.-smoothstep(.979,1.006,r));
    float lamp = -.70 + uLight*2.0 + uRoll*.72 + uTilt*.56 + .18*uPointer.x;
    float slow = uTime * .16;
    float phase = a - lamp;
    vec2 refractDir = vec2(cos(a),sin(a));
    // The touch is in screen space, so the crest starts precisely under a finger.
    vec2 travel = (pixel - uPulse * uViewport) / uSide;
    float progress = clamp(uRipple, 0., 1.);
    float distanceFromWave = length(travel) - .97 * progress;
    float envelope = step(0., uRipple) * smoothstep(0., .075, progress) * (1.-smoothstep(.70,1.,progress));
    float crest = exp(-pow(distanceFromWave / .048, 2.)) * envelope;
    float wake = exp(-pow((distanceFromWave+.070) / .074, 2.)) * envelope;
    float face = 1.-smoothstep(.62,.74,r);
    vec2 pulseDir = travel / max(.001,length(travel));
    vec2 displacedUV = uv + pulseDir * (.0012*face + .0041*rim) * (crest-.48*wake);
    vec2 shift = refractDir * rim * reeds * (.00029 + .00036 * abs(uTilt)) * sin(phase + .25*slow);
    shift += pulseDir * (.0011 + .0012*rim) * crest;
    vec3 photo = texture2D(uPhoto,displacedUV).rgb;
    vec3 split = vec3(texture2D(uPhoto,displacedUV+shift).r, photo.g, texture2D(uPhoto,displacedUV-shift).b);
    vec3 color = mix(photo,split,rim*.78);

    // Fresnel and prismatic streaks follow the existing glass ribs as light moves.
    float facet = clamp(.52 + .48*cos(phase*2. + .50*reeds + uPointer.y*.12), 0., 1.);
    float glint = pow(facet, 14.) * (.39 + .61*pow(.5+.5*reeds, 4.));
    vec3 prism = .55 + .45*cos(vec3(.14,2.19,4.27) + a*5. + r*16. - lamp*1.85 + .16*slow);
    color += rim * glint * (.054 + .076*uLight) * (.36 + .64*prism);
    color += (crest*.20 + wake*.044) * rim * (.27+.73*pow(.5+.5*reeds,2.)) * (.28+.72*prism);
    // Converging light through the glass keeps the pressure wave optical and soft.
    float windowLight = .34 + .66*pow(.5+.5*cos(2.1*phase-.7*r),2.);
    color += face * (.034*crest - .014*wake) * windowLight * vec3(.72,.83,1.);
    float lip = exp(-pow((r-.963)*92., 2.)) + .65*exp(-pow((r-.656)*116.,2.));
    color += lip * glint * vec3(.043,.047,.06);

    // Nearly neutral areas of the silver respond to a travelling strip light.
    float fork = 1. - smoothstep(.022,.061,abs(uv.x-(.116-.316*uv.y)));
    float knife = 1. - smoothstep(.021,.06,abs(uv.x-(.862+.285*uv.y)));
    float neutral = 1. - smoothstep(.085,.31,max(max(photo.r,photo.g),photo.b)-min(min(photo.r,photo.g),photo.b));
    float sweep = .5+.5*cos(16.*uv.y+3.2*lamp+uPointer.x+slow*.38);
    color += max(fork,knife) * neutral * smoothstep(.16,.72,photo.g) * pow(sweep,7.) * vec3(.043,.047,.054);

    // Outside the plate, narrow, moving fragments tint the photographed caustics.
    float apron = smoothstep(.995,1.05,r) * (1.-smoothstep(1.11,1.39,r));
    float caustic = pow(.5+.5*cos(a*54.+r*9.-.5*sin(a*12.+slow)),8.);
    color += apron * caustic * (.065 + .035*uLight) * (.25+.75*prism) * smoothstep(.12,.65,photo.b);
    float causticFoot = exp(-pow((r-1.081)/.119,2.)) * smoothstep(.97,1.03,r);
    float causticAngle = .5+.5*cos(a-(1.43+.20*uTilt)-.18*sin(lamp));
    float shaft = pow(causticAngle,8.) * (.12+.88*pow(.5+.5*cos(a*52.+r*8.+.4*sin(slow)),4.));
    color += causticFoot * shaft * (.25*uFlow+.24*crest+.065*wake) * (.30+.70*prism);
    color += uFlow * rim * glint * .14 * (.38+.62*prism);
    float margin = min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
    // The table underneath replaces the dish and its reflection, keeping silverware.
    float photographedGlass = 1.-smoothstep(1.16,1.44,r);
    float silverKeep = max(fork,knife)*smoothstep(.10,.38,photo.g)*(.72+.28*neutral);
    color = mix(color,base,(1.-uPlateOpacity)*photographedGlass*(1.-silverKeep));
    float fade = smoothstep(.0,.075,margin);
    gl_FragColor = vec4(mix(base,color,fade),1.);
  }
`;

const fieldVertex = `
  attribute vec2 aPoint;
  void main(){ gl_Position = vec4(aPoint, 0.9, 1.); }
`;
const fieldFragment = `
  precision mediump float;
  uniform vec2 uViewport;
  uniform float uDpr;
  void main(){
    vec2 pixel = vec2(gl_FragCoord.x, uViewport.y*uDpr - gl_FragCoord.y) / uDpr;
    vec2 p = pixel / uViewport;
    vec3 base = mix(vec3(.129,.069,.427),vec3(.187,.108,.552),.43+.24*p.x+.13*p.y);
    float weave = sin(pixel.x*2.07+pixel.y*.11)*sin(pixel.y*1.81)*.0012;
    gl_FragColor = vec4(base+weave,1.);
  }
`;

function reliefGrid(steps) {
  const pitch = steps + 1;
  const uv = new Float32Array(pitch * pitch * 2);
  const indices = new Uint16Array(steps * steps * 6);
  let vertexOffset = 0, indexOffset = 0;
  for (let y = 0; y < pitch; y++) {
    for (let x = 0; x < pitch; x++) {
      uv[vertexOffset++] = x / steps;
      uv[vertexOffset++] = y / steps;
      if (x === steps || y === steps) continue;
      const i = y * pitch + x;
      indices.set([i, i+1, i+pitch, i+1, i+pitch+1, i+pitch], indexOffset);
      indexOffset += 6;
    }
  }
  return { uv, indices };
}

export function createTableWorld(canvas, image) {
  if (!image?.naturalWidth) return null;
  const gl = canvas.getContext('webgl', { alpha:false, antialias:true, depth:true, powerPreference:'low-power' });
  if (!gl) return null;
  const programs = [], shaders = [], buffers = [], textures = [];
  function destroy() {
    buffers.forEach(b => gl.deleteBuffer(b));
    textures.forEach(t => gl.deleteTexture(t));
    programs.forEach(p => gl.deleteProgram(p));
    shaders.forEach(s => gl.deleteShader(s));
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    programs.push(p);
    for (const [type, source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]) {
      const s = gl.createShader(type);
      shaders.push(s);
      gl.shaderSource(s,source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      gl.attachShader(p,s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
    return p;
  }
  function buffer(target, values) {
    const result = gl.createBuffer();
    buffers.push(result);
    gl.bindBuffer(target,result);
    gl.bufferData(target,values,gl.STATIC_DRAW);
    return result;
  }
  function uniforms(p, names) {
    return Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(p,'u'+n)]));
  }
  function bindPosition(index, source) {
    gl.bindBuffer(gl.ARRAY_BUFFER,source);
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index,2,gl.FLOAT,false,0,0);
  }
  try {
    const field = program(fieldVertex,fieldFragment), plate = program(vertex,fragment);
    const fieldPoint = gl.getAttribLocation(field,'aPoint'), plateUV = gl.getAttribLocation(plate,'aUV');
    const fieldUniforms = uniforms(field,['Viewport','Dpr']);
    const surface = uniforms(plate,['Viewport','Center','Side','Tilt','Roll','Pointer','Light','Time','Dpr','Photo','Pulse','Ripple','Flow','PlateOpacity']);
    const {uv,indices} = reliefGrid(160);
    const quad = buffer(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]));
    const vertices = buffer(gl.ARRAY_BUFFER,uv);
    const elements = buffer(gl.ELEMENT_ARRAY_BUFFER,indices);
    const photo = gl.createTexture();
    textures.push(photo);
    gl.bindTexture(gl.TEXTURE_2D,photo);
    // Top-left UV coordinates match the source photograph and screen-space camera.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
    for (const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);
    for (const filter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,filter,gl.LINEAR);
    gl.useProgram(plate);
    gl.uniform1i(surface.Photo,0);
    function render({width,height,dpr=1,x=.5,y=.5,scale=1,tilt=0,roll=0,light=.5,time=0,pointerX=0,pointerY=0,
      ripple=-1,flow=0,pulseX=x,pulseY=y,plateOpacity=1}) {
      if (!width || !height || gl.isContextLost()) return;
      const density = Math.min(1.5,Math.max(.5,dpr));
      const w = Math.round(width*density), h = Math.round(height*density);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0,0,w,h);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(field);
      gl.uniform2f(fieldUniforms.Viewport,width,height);
      gl.uniform1f(fieldUniforms.Dpr,density);
      bindPosition(fieldPoint,quad);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(plate);
      bindPosition(plateUV,vertices);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,photo);
      gl.uniform2f(surface.Viewport,width,height);
      gl.uniform2f(surface.Center,x,y);
      gl.uniform1f(surface.Side,scale*Math.min(width,height));
      gl.uniform1f(surface.Tilt,tilt);
      gl.uniform1f(surface.Roll,roll);
      gl.uniform2f(surface.Pointer,pointerX,pointerY);
      gl.uniform1f(surface.Light,light);
      gl.uniform1f(surface.Time,time);
      gl.uniform2f(surface.Pulse,pulseX,pulseY);
      gl.uniform1f(surface.Ripple,ripple);
      gl.uniform1f(surface.Flow,flow);
      gl.uniform1f(surface.PlateOpacity,plateOpacity);
      gl.uniform1f(surface.Dpr,density);
      gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
    }
    return {render,destroy};
  } catch {
    destroy();
    return null;
  }
}
