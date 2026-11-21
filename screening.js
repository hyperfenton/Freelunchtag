// One native movie clock drives both the visible take and its interaction targets.
const byId=id=>document.getElementById(id);
const root=document.documentElement, cinema=byId('cinema'), film=byId('storyFilm');
const still=byId('stillFrame'), photo=still.querySelector('img'), widePhoto=still.querySelector('source');
const object=byId('filmObject'), nextButton=byId('continueFilm'), options=byId('filmOptions');
const details=byId('sceneDialog'), content=byId('sceneContent'), title=byId('sceneTitle');
const quick=byId('quickTag');
const wide=matchMedia('(min-aspect-ratio: 1/1)'), reduce=matchMedia('(prefers-reduced-motion: reduce)');
const album='assets/film/', revision='?v=flowering-1';
const chapters=[
  {id:'hero',start:0,read:0,still:'lift',label:'Replay the plate lifting and breaking'},
  {id:'lunch',start:6.8,read:8.65,still:'floor',label:'Read the lunch invitation'},
  {id:'hosts',start:10.4,read:11.95,still:'host',label:'Meet your lunch host'},
  {id:'how',start:14.1,read:16.9,still:'broom',label:'Read how the tag works'},
  {id:'video',start:19.7,read:21.6,still:'toss',label:'Watch the original 26-second explainer'},
  {id:'story',start:24,read:26.45,still:'story',label:'Read where Free Lunch Tag started'},
  {id:'why',start:28.45,read:30.5,still:'why',label:'Read why Meadows buys lunch'},
  {id:'claim',start:32.55,read:35,still:'claim',label:'Enter your tag'},
  {id:'bonus',start:37.2,read:39.56,still:'visit',label:'View Meadows visiting times'},
  {id:'made-with-love',start:41.55,read:46.8,still:'close',label:'Read the Meadows message in the flowers'}
];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const dialogOpen=()=>Boolean(document.querySelector('dialog[open]'));
const motionOff=()=>reduce.matches||root.dataset.motion==='off'||navigator.connection?.saveData===true;
let selected=-1, positions=[], pageY=-1, target=null, tick=0, lastStep=0, touchUntil=0;
let sourceName='', savedTime=0, ready=false, unavailable=false, wasOpen=false;
let relocated=null;
function sceneAt(t){
  return Math.max(0,chapters.findLastIndex(ch=>t>=ch.start));
}
function showPoster(i){
  const name=chapters[i].still;
  if(still.dataset.shot!==name){
    still.dataset.shot=name;
    widePhoto.srcset=album+'film-'+name+'-wide.webp'+revision;
    photo.src=album+'film-'+name+'.webp'+revision;
  }
}
function setScene(i){
  if(selected===i)return;
  selected=i;
  cinema.dataset.scene=chapters[i].id;
  object.setAttribute('aria-label',chapters[i].label);
  object.hidden=false;
  nextButton.classList.toggle('at-end',i===chapters.length-1);
  nextButton.setAttribute('aria-label',i===chapters.length-1?'Replay the film':'Move to the next part of the film');
}
function measure(){
  const max=Math.max(1,root.scrollHeight-innerHeight);
  positions=chapters.map(ch=>{
    const r=byId(ch.id).getBoundingClientRect();
    return clamp(scrollY+r.top+(r.height-innerHeight)/2,0,max);
  });
  positions[0]=0;
}
function interpolate(value,xs,ys){
  if(value<=xs[0])return ys[0];
  const i=xs.findIndex(x=>x>value);
  if(i<1)return ys.at(-1);
  return ys[i-1]+(ys[i]-ys[i-1])*(value-xs[i-1])/(xs[i]-xs[i-1]);
}
const times=chapters.map(ch=>ch.read);
function alignTo(value){
  pageY=Math.round(value);
  if(Math.abs(scrollY-pageY)>1)scrollTo({top:pageY,behavior:'instant'});
}
function showingPosters(){return motionOff()||unavailable;}
function staticAt(t){
  const i=sceneAt(t);
  savedTime=t;setScene(i);showPoster(i);
  cinema.classList.remove('on-film');
}
function chooseFile(){
  if(motionOff())return;
  const name=album+(wide.matches?'free-lunch-wide.mp4':'free-lunch-portrait.mp4')+revision;
  if(name===sourceName)return;
  if(ready)savedTime=film.currentTime;
  sourceName=name;ready=false;unavailable=false;
  film.src=name;film.load();
}
function play(){
  if(ready&&!showingPosters()&&!document.hidden&&!dialogOpen()&&film.paused&&!film.ended){
    film.play().catch(()=>{
      if(film.readyState<2||document.hidden||dialogOpen()||!film.paused)return;
      if(target===null){unavailable=true;staticAt(film.currentTime);}
    });
  }
}
function again(){if(!tick&&!document.hidden&&!dialogOpen()&&!showingPosters())tick=requestAnimationFrame(advance);}
function advance(now){
  tick=0;
  if(!ready||dialogOpen()||document.hidden||showingPosters())return;
  let t=film.currentTime;
  if(target!==null){
    const delta=target-t;
    if(Math.abs(delta)<.13){target=null;film.playbackRate=1;play();}
    else if(delta>0){
      // Forward navigation plays the intervening footage on the original decoder.
      film.playbackRate=clamp(1+delta*.65,1.05,3.5);play();
    }else{
      film.pause();
      // Browsers lack reverse playback. Walk backwards through nearby frames
      // instead of replacing the picture with a distant chapter or a poster.
      if(!film.seeking&&now-lastStep>30){
        const step=clamp((now-lastStep)/1000*2.9,.045,.13);
        film.currentTime=Math.max(target,t-step);lastStep=now;
      }
    }
  }else{
    savedTime=t;film.playbackRate=1;
    if(now>touchUntil)alignTo(interpolate(t,times,positions));
  }
  setScene(sceneAt(t));
  if(!film.ended||target!==null)again();
}
function travel(t){
  savedTime=clamp(t,0,times.at(-1));
  if(showingPosters()){staticAt(savedTime);return;}
  chooseFile();target=savedTime;lastStep=performance.now();again();
}
function restart(){
  // A direct user gesture can start the decoder after mobile autoplay is denied.
  if(ready&&!film.error&&!motionOff())unavailable=false;
  target=null;savedTime=0;alignTo(0);setScene(0);
  if(showingPosters()){staticAt(0);return;}
  if(ready){film.currentTime=0;film.playbackRate=1;play();again();}
}
function requestChapter(i){
  alignTo(positions[i]);
  if(i===0){restart();return;}
  travel(chapters[i].read);
}
function closeMenu(){options.open=false;}
addEventListener('scroll',()=>{
  if(dialogOpen()||Math.abs(scrollY-pageY)<=1)return;
  pageY=-1;touchUntil=performance.now()+450;
  travel(interpolate(scrollY,positions,times));
},{passive:true});
for(const type of ['touchstart','touchmove','wheel'])addEventListener(type,()=>{touchUntil=performance.now()+450;},{passive:true});
film.addEventListener('loadedmetadata',()=>{
  ready=true;
  if(savedTime>.05)film.currentTime=clamp(savedTime,0,Math.max(0,film.duration-.06));
  play();again();
});
function reveal(){if(!showingPosters()&&film.readyState>=2)cinema.classList.add('on-film');}
for(const name of ['playing','loadeddata','seeked'])film.addEventListener(name,reveal);
film.addEventListener('ended',()=>{setScene(chapters.length-1);alignTo(positions.at(-1));});
film.addEventListener('error',()=>{unavailable=true;ready=false;staticAt(savedTime);});
nextButton.addEventListener('click',()=>requestChapter((selected+1)%chapters.length));
byId('watchFilm').addEventListener('click',()=>{closeMenu();restart();});
function updateMotion(){
  byId('watchFilm').disabled=motionOff();
  if(motionOff()){
    if(ready)savedTime=film.currentTime;
    target=null;film.pause();
    const freeze=ready&&cinema.classList.contains('on-film')&&!reduce.matches&&navigator.connection?.saveData!==true;
    if(freeze)setScene(sceneAt(savedTime));
    else staticAt(savedTime);
  }else{
    chooseFile();
    if(ready&&!unavailable){
      if(Math.abs(film.currentTime-savedTime)>.1)film.currentTime=savedTime;
      reveal();play();again();
    }
  }
}
new MutationObserver(updateMotion).observe(root,{attributes:true,attributeFilter:['data-motion']});
reduce.addEventListener('change',updateMotion);
wide.addEventListener('change',()=>{measure();chooseFile();});
addEventListener('resize',measure);
function moveHere(node){
  if(!node)return;
  const slot=document.createComment('scene detail in original page flow');
  node.before(slot);content.append(node);relocated={node,slot};
}
function copyElements(selector){
  document.querySelectorAll(selector).forEach(n=>content.append(n.cloneNode(true)));
}
function sceneDetails(){
  closeMenu();
  if(dialogOpen())return;
  const ch=chapters[selected],section=byId(ch.id);
  if(ch.id==='claim'){quick.click();return;}
  content.replaceChildren();
  const heading=section.querySelector('h1,h2')?.innerText||'Made with love by Meadows.';
  title.textContent=heading.replace(/\s+/g,' ').trim();
  switch(ch.id){
    case 'hero':copyElements('#hero .lede');break;
    case 'lunch':copyElements('#lunch p');break;
    case 'hosts':moveHere(section.querySelector('.people'));break;
    case 'how':{
      const list=document.createElement('ol');
      section.querySelectorAll('article').forEach(a=>{const li=document.createElement('li');li.textContent=a.querySelector('h3').textContent+' '+a.querySelector('p').textContent;list.append(li);});
      content.append(list);break;
    }
    case 'video':moveHere(section.querySelector('video'));break;
    case 'story':copyElements('#story .prose>p,#story .partners');break;
    case 'why':copyElements('#why p');break;
    case 'bonus':copyElements('#bonus .prose>*');break;
    default:copyElements('footer .credits');
  }
  details.showModal();byId('closeScene').focus();
}
byId('readScene').addEventListener('click',sceneDetails);
object.addEventListener('click',()=>{
  if(selected===0){restart();return;}
  sceneDetails();
});
byId('closeScene').addEventListener('click',()=>details.close());
details.addEventListener('close',()=>{
  if(relocated){
    if(relocated.node.tagName==='VIDEO')relocated.node.pause();
    relocated.slot.replaceWith(relocated.node);relocated=null;
  }
  content.replaceChildren();
  object.focus({preventScroll:true});
});
function watchDialogs(){
  const open=dialogOpen();
  if(open&&!wasOpen)film.pause();
  if(!open&&wasOpen){play();again();}
  wasOpen=open;
}
for(const d of document.querySelectorAll('dialog'))new MutationObserver(watchDialogs).observe(d,{attributes:true,attributeFilter:['open']});
document.addEventListener('visibilitychange',()=>{if(document.hidden)film.pause();else{play();again();}});
document.querySelectorAll('a[href="#claim"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();quick.click();}));
function followHash(){
  if(location.hash==='#claim'){quick.click();return;}
  const i=chapters.findIndex(ch=>ch.id===location.hash.slice(1));
  if(i>=0)requestChapter(i);
}
addEventListener('hashchange',followHash);
root.classList.add('projecting');
measure();
savedTime=interpolate(scrollY,positions,times);
setScene(sceneAt(savedTime));showPoster(selected);
if(location.hash)followHash();
updateMotion();
