// The two edits share the same timecode. The browser displays original photography
// from the movie even when video decode, autoplay, or motion is unavailable.
const byId = id => document.getElementById(id);
const root = document.documentElement;
const cinema = byId('cinema');
const film = byId('storyFilm');
const still = byId('stillFrame');
const photo = still.querySelector('img');
const widePhoto = still.querySelector('source');
const object = byId('filmObject');
const nextButton = byId('continueFilm');
const options = byId('filmOptions');
const details = byId('sceneDialog');
const content = byId('sceneContent');
const title = byId('sceneTitle');
const quick = byId('quickTag');
const wide = matchMedia('(min-aspect-ratio: 1/1)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const album = 'assets/film/';
const chapters = [
  {id:'hero',start:0,end:6,still:'lift',label:'Replay the plate lifting and breaking'},
  {id:'lunch',start:6,end:10,still:'floor',label:'Read the lunch invitation'},
  {id:'hosts',start:10,end:14,still:'host',label:'Meet your lunch host'},
  {id:'how',start:14,end:20,still:'broom',label:'Read how the tag works'},
  {id:'video',start:20,end:24,still:'toss',label:'Watch the original 26-second explainer'},
  {id:'story',start:24,end:28,still:'story',label:'Read where Free Lunch Tag started'},
  {id:'why',start:28,end:32,still:'why',label:'Read why Meadows buys lunch'},
  {id:'claim',start:32,end:36,still:'claim',label:'Enter your tag'},
  {id:'bonus',start:37,end:41,still:'visit',label:'View Meadows visiting times'},
  {id:'made-with-love',start:41,end:46,still:'close',label:'Read the closing credit'}
];
const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
let selected=0, displayed=-1, boundaries=[], positions=[];
let whole=false, frame=0, settleTimer=0, pendingTime=0, sourceName='', savedY=0;
let modalWasOpen=false, videoReady=false, frozen=false, ignoreScroll=false, held=false;
let relocated=null;
const dialogOpen=()=>Boolean(document.querySelector('dialog[open]'));
const motionOff=()=>reduce.matches||root.dataset.motion==='off'||navigator.connection?.saveData===true;
function showPoster(index,photoName=chapters[index].still){
  const ambient=album+'film-'+photoName+(wide.matches?'-wide':'')+'.webp';
  cinema.style.setProperty('--surround','url("'+ambient+'")');
  if(still.dataset.shot===photoName)return;
  still.dataset.shot=photoName;
  widePhoto.srcset=album+'film-'+photoName+'-wide.webp';
  photo.src=album+'film-'+photoName+'.webp';
}
function setScene(index){
  selected=index;
  if(index===displayed)return;
  displayed=index;
  cinema.dataset.scene=chapters[index].id;
  object.setAttribute('aria-label',chapters[index].label);
  object.hidden=false;
  nextButton.classList.toggle('at-end',index===chapters.length-1);
  nextButton.setAttribute('aria-label',index===chapters.length-1?'Return to the opening':'Scroll to the next scene');
  showPoster(index);
}
function measure(){
  const h=innerHeight,max=Math.max(1,document.documentElement.scrollHeight-h);
  positions=chapters.map(ch=>{const r=byId(ch.id).getBoundingClientRect();return clamp(r.top+scrollY+(r.height-h)/2,0,max);});
  positions[0]=0;
  boundaries=positions.map((at,i)=>i===0?0:(at+positions[i-1])/2);
  boundaries.push(max+1);
}
function indexAtScroll(y){
  let i=0;
  while(i<chapters.length-1 && y>=boundaries[i+1])i++;
  return i;
}
function indexAtTime(t){
  let i=0;
  while(i<chapters.length-1 && t>=chapters[i+1].start)i++;
  return i;
}
function applyStill(){
  cinema.classList.remove('on-film');
  if(motionOff())film.pause();
}
function chooseFile(){
  if(motionOff()){applyStill();return;}
  const name=album+(wide.matches?'free-lunch-wide.mp4':'free-lunch-portrait.mp4');
  if(name===sourceName)return;
  sourceName=name;videoReady=false;cinema.classList.remove('on-film');
  pendingTime=chapters[selected].start;
  film.src=name;film.load();
}
function seek(time){
  pendingTime=time;
  if(!videoReady)return;
  const target=clamp(time,0,Math.max(0,film.duration-.055));
  if(Math.abs(film.currentTime-target)>.06){
    try{film.currentTime=target;}catch{/* Metadata or seekable ranges are still arriving. */}
  }
}
function play(){
  if(!videoReady||dialogOpen()||document.hidden||motionOff()||frozen||held)return;
  film.play().catch(()=>{if(film.readyState<2)applyStill();});
}
function reveal(){
  if(!motionOff()&&film.readyState>=2&&!film.error)cinema.classList.add('on-film');
}
function onVideoFrame(){
  if(!film.paused && !whole && film.currentTime>=chapters[selected].end-.12){
    film.pause();
    // Leave the inscription on screen until the reader advances.
    if(selected===0)showPoster(0,'emblem');
  }else if(whole){
    setScene(indexAtTime(film.currentTime));
    if(film.ended)whole=false;
  }
  if('requestVideoFrameCallback' in film)film.requestVideoFrameCallback(onVideoFrame);
}
if('requestVideoFrameCallback' in film)film.requestVideoFrameCallback(onVideoFrame);
else film.addEventListener('timeupdate',onVideoFrame);
film.addEventListener('loadedmetadata',()=>{videoReady=true;seek(pendingTime);play();});
film.addEventListener('loadeddata',reveal);
film.addEventListener('seeked',reveal);
film.addEventListener('playing',reveal);
film.addEventListener('error',()=>{videoReady=false;applyStill();});
film.addEventListener('ended',()=>{whole=false;});
function scrollUpdate(){
  frame=0;
  if(ignoreScroll||dialogOpen())return;
  const y=scrollY,i=indexAtScroll(y),ch=chapters[i];
  held=true;whole=false;frozen=false;film.pause();
  setScene(i);
  // Interpolate through the recorded cut, including the brief black beat before the garden.
  const starts=boundaries[i],ends=boundaries[i+1];
  const fraction=clamp((y-starts)/Math.max(1,ends-starts),0,1);
  const time=ch.start+fraction*((i===7?37:ch.end)-ch.start-.10);
  if(motionOff()){showPoster(i);applyStill();}
  else {chooseFile();seek(time);}
  clearTimeout(settleTimer);
  settleTimer=setTimeout(()=>{held=false;play();},115);
}
function onScroll(){if(!ignoreScroll&&!dialogOpen()&&!frame)frame=requestAnimationFrame(scrollUpdate);}
addEventListener('scroll',onScroll,{passive:true});
function align(index){
  ignoreScroll=true;
  scrollTo({top:positions[index],behavior:'instant'});
  requestAnimationFrame(()=>{ignoreScroll=false;});
}
function go(index,keepFilm=false){
  clearTimeout(settleTimer);held=false;whole=keepFilm;frozen=false;
  align(index);setScene(index);
  if(motionOff()){applyStill();return;}
  chooseFile();seek(chapters[index].start+.02);play();
}
function closeMenu(){options.open=false;}
nextButton.addEventListener('click',()=>go((selected+1)%chapters.length));
byId('watchFilm').addEventListener('click',()=>{
  closeMenu();
  if(motionOff())return;
  go(0,true);
});
function updateMotion(){
  byId('watchFilm').disabled=motionOff();
  if(motionOff()){whole=false;applyStill();showPoster(selected);}
  else if(!dialogOpen()){chooseFile();seek(chapters[selected].start);held=false;play();}
}
new MutationObserver(updateMotion).observe(root,{attributes:true,attributeFilter:['data-motion']});
reduce.addEventListener('change',updateMotion);
wide.addEventListener('change',()=>{measure();showPoster(selected);chooseFile();});
let lastWidth=innerWidth,lastHeight=innerHeight;
addEventListener('resize',()=>{
  const largeChange=Math.abs(lastWidth-innerWidth)>5||Math.abs(lastHeight-innerHeight)>100;
  lastWidth=innerWidth;lastHeight=innerHeight;measure();
  if(largeChange&&!dialogOpen()&&!whole){setScene(indexAtScroll(scrollY));chooseFile();}
});
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
  if(whole)align(selected);
  if(selected===0){go(0);return;}
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
  if(open&&!modalWasOpen){savedY=scrollY;film.pause();}
  if(!open&&modalWasOpen){
    chooseFile();
    if(Math.abs(scrollY-savedY)>1){
      ignoreScroll=true;scrollTo({top:savedY,behavior:'instant'});requestAnimationFrame(()=>ignoreScroll=false);
    }
    if(whole||film.currentTime<chapters[selected].end-.14)play();
  }
  modalWasOpen=open;
}
for(const d of document.querySelectorAll('dialog'))new MutationObserver(watchDialogs).observe(d,{attributes:true,attributeFilter:['open']});
document.addEventListener('visibilitychange',()=>{if(document.hidden)film.pause();else if(whole||film.currentTime<chapters[selected].end-.14)play();});
document.querySelectorAll('a[href="#claim"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();quick.click();}));
function followHash(){
  if(location.hash==='#claim'){setScene(7);quick.click();}
  else {
    const index=chapters.findIndex(ch=>ch.id===location.hash.slice(1));
    if(index>=0)go(index);
  }
}
addEventListener('hashchange',followHash);
root.classList.add('projecting');
measure();
setScene(indexAtScroll(scrollY));
if(location.hash)followHash();
updateMotion();
