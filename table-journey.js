// The page scroll is the edit timeline. Visitors can jump to any section or replay just the opening.
import {createTableWorld} from './glass-world.js';
import {createCrystalFragments} from './crystal-fragments.js';
import {mountFilmTitles} from './in-scene-titles.js';
import {createGardenProps} from './garden-props.js';

const id = name => document.getElementById(name);
const root = document.documentElement;
const world = document.querySelector('.world');
const stillPhoto = world.querySelector('.world-still');
const fallbackLogo = world.querySelector('.fallback-logo');
const floor = world.querySelector('.floor-setting');
const garden = world.querySelector('.garden-setting');
const bloomPhoto = world.querySelector('.bloom-setting');
const nightOverlay = world.querySelector('.night');
const plateCanvas = id('worldCanvas');
const shardCanvas = id('fragmentCanvas');
const propCanvas = id('propCanvas');
const trigger = id('plateStage');
const modal = id('collectorDialog');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const saver = navigator.connection?.saveData === true;
const clamp = (n,min=0,max=1) => Math.max(min,Math.min(max,n));
const mix = (a,b,t) => a+(b-a)*t;
function ramp(lo,hi,value) {
  const t=clamp((value-lo)/Math.max(.001,hi-lo));
  return t*t*(3-2*t);
}
const photo = new Image(), mark = new Image();
photo.src='assets/collection/glass-place-setting.webp';
mark.src='LOGO.PNG';
let plate, shards, props, titles, loaded=false, loadPending=false, propsTried=false;
let width=0,height=0,dpr=1,bounds={},home=[],end=1,resize=true;
let frame=0,dirty=true,lastPaint=-1000,time=0,previousScroll=scrollY,speed=0;
let openingStart=null,openingDone=Boolean(location.hash)||scrollY>30;
let gesture=null, roll=0, tilt=0, aimRoll=0, aimTilt=0, pointerX=0, pointerY=0;
let rippleStart=-10000, rippleX=.5, rippleY=.4, blackoutStart=null, passedNight=false;
let isSmall=false, paintedProps=false, paintedShards=false;
let lastMetrics=0,frameCost=12,openingControl;
const pause=()=>reduced.matches||root.dataset.motion==='off'||saver;
const openingDuration=3850;

function measure() {
  width=world.clientWidth;height=world.clientHeight;
  isSmall=width<=680; dpr=Math.min(devicePixelRatio,isSmall?1.16:1.33);
  const rect=trigger.getBoundingClientRect(),short=Math.min(width,height);
  const side=isSmall?Math.min(width*1.10,rect.height*1.60):Math.min(rect.width*1.28,rect.height*1.33);
  home=[(rect.left+rect.width*.5)/width,(rect.top+scrollY+rect.height*.47)/height,side/short];
  const list=['hero','lunch','hosts','how','video','story','why','claim','bonus','made-with-love'];
  for(const name of list){
    const r=id(name).getBoundingClientRect(), top=r.top+scrollY;
    bounds[name]={top,bottom:top+r.height,center:top+(r.height-height)*.5};
  }
  const cut=document.querySelector('.nightfall').getBoundingClientRect();
  bounds.night=cut.top+scrollY-height*.53;
  end=Math.max(1,document.documentElement.scrollHeight-height);
  titles?.layout(width,height,bounds);
  resize=false;
}
function timeline(y,now,still) {
  const descent=ramp(Math.max(64,bounds.hero.bottom-height*.86),bounds.lunch.center+height*.12,y);
  const sweep=ramp(bounds.how.top-height*.66,bounds.how.bottom-height*.65,y);
  const toss=ramp(bounds.video.center+height*.09,bounds.story.center+height*.12,y);
  const gardenIn=ramp(.20,.85,toss);
  const nightPosition=ramp(bounds.night-height*.22,bounds.night+height*.16,y);
  if(!still&&nightPosition>.42&&!passedNight){blackoutStart=now;passedNight=true;}
  if(y<bounds.night-height*.65){passedNight=false;blackoutStart=null;}
  const darkAge=blackoutStart===null?5:(now-blackoutStart)/1000;
  const night=still?0:(ramp(0,.24,darkAge)*(1-ramp(.55,1.25,darkAge)))*(1-ramp(.75,1,Math.abs(y-bounds.night)/height));
  const bloom=ramp(bounds.night+height*.05,Math.min(end,bounds['made-with-love'].center),y);
  const elapsed=openingStart===null?0:clamp((now-openingStart)/openingDuration);
  if(elapsed>=1 || y>height*.42)openingDone=true;
  const intro=still||openingDone?1:Math.max(elapsed,ramp(0,height*.42,y));
  const lift=ramp(.035,.37,intro)*(1-ramp(.42,.565,intro));
  const breakage=ramp(.555,.99,intro);
  const strike=ramp(.505,.55,intro)*(1-ramp(.55,.65,intro));
  const beforeBreak=1-ramp(.005,.095,breakage);
  return {descent,sweep,toss,gardenIn,night,bloom,intro,lift,breakage,strike,beforeBreak};
}

function poseAt(y,now,still) {
  const v=timeline(y,now,still), h=home;
  const off=still?0:1;
  const drift=Math.sin(time*.51);
  // Start above the table. Lift from the ring of light, drop, then track with the falling pieces.
  const pose={
    width,height,dpr,time,pointerX:still?0:pointerX,pointerY:still?0:pointerY,
    x:h[0]+(.045*v.lift + roll*.037 + drift*.002)*off,
    y:h[1]-v.lift*(isSmall?.095:.13)-.23*v.descent,
    scale:h[2]*(1+.19*v.lift+.37*v.descent),
    tilt:.05 + (.81*v.lift + tilt*.28 + .012*drift)*off + v.descent*.88,
    roll:-.035 + (-.31*v.lift +roll*.28 + .012*Math.sin(time*.37))*off + v.descent*.19,
    light:clamp(.48+.32*v.lift+.18*Math.sin(time*.49)*off+.14*speed),
    flow:still?0:Math.max(v.strike*.9,v.lift*.52,.07+.045*drift),
    ripple:-1,pulseX:rippleX,pulseY:rippleY,plateOpacity:v.beforeBreak,
    ...v,logoX:h[0],logoY:h[1]-.02,logo:1-ramp(.025,.81,v.descent)
  };
  const age=(now-rippleStart)/1500;
  if(!still&&age>=0&&age<1)pose.ripple=age;
  return pose;
}

function styleScene(pose,y,still) {
  const {descent,sweep,toss,gardenIn,night,bloom}=pose;
  const control=still?'still':pose.intro<.985?'playing':'replay';
  if(control!==openingControl){
    openingControl=control;
    trigger.disabled=still;
    trigger.querySelector('.glass-cue').textContent=control==='playing'?'Touch the glass':'Replay the opening';
  }
  const under=ramp(.04,.85,descent)*(1-gardenIn);
  const finalStroke=ramp(.65,1,sweep);
  floor.style.opacity=under.toFixed(3);
  floor.style.transform='translate3d('+((-2.4*finalStroke + 1.2*(1-descent))+pose.pointerX*.18).toFixed(2)+'%,'
     +(-3.4*(1-descent)+1.5*toss).toFixed(2)+'%,0) scale('+(1.07+.17*finalStroke+.16*toss).toFixed(3)+')';
  garden.style.opacity=gardenIn.toFixed(3);
  bloomPhoto.style.opacity=ramp(.32,.95,bloom).toFixed(3);
  bloomPhoto.style.transform='scale('+(1.09-.07*bloom).toFixed(3)+')';
  garden.style.transform='translate3d('+(.7*(1-bloom)).toFixed(2)+'%,'+(2.8*(1-bloom)).toFixed(2)+'%,0) scale('+(1.1+.22*(1-toss)+.08*bloom).toFixed(3)+')';
  nightOverlay.style.opacity=night.toFixed(3);
  id('made-with-love').style.setProperty('--bloom',bloom.toFixed(3));
  // Flat, quiet areas follow the reading side. The glass, floor, and garden remain a single continuous scene.
  const storyLight=ramp(bounds.video.center,bounds.story.center,y)*(1-ramp(bounds.story.center,bounds.why.center,y));
  const lunchLight=descent*(1-ramp(bounds.lunch.center,bounds.hosts.center,y));
  const right=Math.max(storyLight,lunchLight);
  world.style.setProperty('--veil-left',mix(isSmall?.36:.70,.19,right).toFixed(2));
  world.style.setProperty('--veil-right',mix(isSmall?.19:.02,.70,right).toFixed(2));
  root.style.setProperty('--read',clamp(y/end).toFixed(4));
  if(!plate){
    const side=Math.min(width,height)*pose.scale;
    stillPhoto.style.width=side+'px';stillPhoto.style.height=side+'px';
    stillPhoto.style.transform='translate3d('+(pose.x*width-side/2).toFixed(1)+'px,'+(pose.y*height-side/2).toFixed(1)+'px,0) perspective(1100px) rotateZ('+pose.roll+'rad) rotateX('+pose.tilt+'rad)';
    stillPhoto.style.opacity=(pose.plateOpacity*(1-under)).toFixed(2);
  }
  if(!shards){
    const opacity=ramp(.18,.80,pose.breakage)*pose.logo;
    fallbackLogo.style.opacity=opacity.toFixed(2);
    fallbackLogo.style.transform='translate3d('+(pose.logoX*width).toFixed(1)+'px,'+(pose.logoY*height).toFixed(1)+'px,0) translate(-50%,-50%)';
  }
  if(!props)world.style.setProperty('--botanical',bloom.toFixed(2));
  if(still||sweep===0)world.style.setProperty('--drift','0px');
  else world.style.setProperty('--drift',(3*Math.sin(time*.36)).toFixed(1)+'px');
}

function paint(now) {
  frame=0;
  if(document.hidden||modal.open||id('quickLookup').open)return;
  if(resize)measure();
  if(!width||!height)return;
  const still=pause(), interval=frameCost>26?65:42;
  if(!dirty&&(still||now-lastPaint<interval)){if(!still)frame=requestAnimationFrame(paint);return;}
  const elapsed=now-lastPaint, started=performance.now();lastPaint=now;dirty=false;
  if(!still){time+=Math.min(elapsed,85)/1000;roll=mix(roll,aimRoll,.23);tilt=mix(tilt,aimTilt,.23);if(!gesture){aimRoll*=.9;aimTilt*=.9;}}
  const y=scrollY; speed=still?0:mix(speed,clamp(Math.abs(y-previousScroll)/70),.24);previousScroll=y;
  const pose=poseAt(y,now,still);
  if(frameCost>26)pose.dpr=Math.max(.7,dpr*.75);
  if(plate && pose.descent<1)plate.render(pose);
  if(shards){
    const active=pose.breakage>.001 && pose.bloom<.97;
    if(active||paintedShards)shards.render(pose);
    paintedShards=active;
  }
  if(loaded && !propsTried && (pose.descent>.55||pose.bloom>0) && !saver) {
    propsTried=true;
    try {props=createGardenProps(propCanvas);} catch { /* Photographic garden remains available. */ }
    if(props)world.classList.add('has-props');
  }
  if(props){
    const active=(pose.descent>.5&&pose.toss<1)||pose.bloom>0;
    if(active||paintedProps)props.render(pose);
    paintedProps=active;
  }
  titles?.render(pose,y,now,still);
  styleScene(pose,y,still);
  if(now-lastMetrics>100){frameCost=mix(frameCost,performance.now()-started,.22);lastMetrics=now;}
  const animating = plate || shards || props || pose.intro < 1 || pose.night > 0 || (blackoutStart!==null && now-blackoutStart<1400);
  if(!still && animating)frame=requestAnimationFrame(paint);
}
function schedule(){dirty=true;if(!frame&&!document.hidden)frame=requestAnimationFrame(paint);}
function relayout(){resize=true;schedule();}
addEventListener('scroll',schedule,{passive:true});addEventListener('resize',relayout);
document.addEventListener('visibilitychange',()=>{lastPaint=performance.now();schedule();});
new ResizeObserver(relayout).observe(document.querySelector('main'));
new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['data-motion','data-theme']});
modal.addEventListener('close',relayout);id('quickLookup').addEventListener('close',relayout);document.fonts.ready.then(relayout);
function castLight(x,y){if(pause())return;rippleStart=performance.now();rippleX=clamp(x/width);rippleY=clamp(y/height);schedule();}
addEventListener('pointermove',event=>{
  if(event.pointerType==='mouse'&&!pause()){pointerX=clamp(event.clientX/innerWidth*2-1,-1,1);pointerY=clamp(event.clientY/innerHeight*2-1,-1,1);}
},{passive:true});
trigger.addEventListener('pointerdown',e=>{gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dragged:false};castLight(e.clientX,e.clientY);});
trigger.addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.id||pause())return;
  const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
  if(!gesture.dragged&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){gesture.dragged=true;trigger.setPointerCapture(e.pointerId);}
  if(gesture.dragged){aimRoll=clamp(dx/(width*.34),-1,1);aimTilt=clamp(dy/150,-1,1);schedule();}
});
let dragged=false;
trigger.addEventListener('pointerup',()=>{dragged=Boolean(gesture?.dragged);gesture=null;schedule();});
trigger.addEventListener('pointercancel',()=>{gesture=null;dragged=false;schedule();});
trigger.addEventListener('click',e=>{
  if(dragged){dragged=false;return;}
  if(pause())return;
  openingDone=false;openingStart=performance.now();
  if(e.detail===0)castLight(home[0]*width,home[1]*height);
  schedule();
});
async function enableScene(){
  if(loadPending||loaded)return;
  loadPending=true;
  try{
    await Promise.all([photo.decode(),mark.decode()]);
    if(!saver){
      plate=createTableWorld(plateCanvas,photo);
      shards=createCrystalFragments(shardCanvas,photo,mark);
    }
    if(plate)world.classList.add('lit');
    if(shards)world.classList.add('has-fragments');
    if(!saver){
      titles=await mountFilmTitles(id('typeCanvas'));
      if(titles){
        root.classList.add('film-type');
        resize=true;
      }
    }
    loaded=true;
    if(!openingDone)openingStart=performance.now();
  }catch{openingStart=performance.now();}
  finally{loadPending=false;schedule();}
}
plateCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();plate=null;world.classList.remove('lit');schedule();});
shardCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();shards=null;world.classList.remove('has-fragments');schedule();});
propCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();props=null;world.classList.remove('has-props');schedule();});
id('typeCanvas').addEventListener('webglcontextlost',e=>{e.preventDefault();titles=null;root.classList.remove('film-type');relayout();});
schedule();
if('requestIdleCallback' in window)requestIdleCallback(enableScene,{timeout:350});else setTimeout(enableScene,40);
