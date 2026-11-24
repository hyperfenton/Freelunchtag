import * as originalRoute from './scroll-route.mjs?v=walkthrough-1';
import {mountFilmObjects, posterTimes as originalPosters} from './film-objects.mjs?v=editions-1';
import {selectFilmQuality, filmFilename, filmPosterSources} from './film-quality.mjs?v=quality-4';

const editionName=document.documentElement.dataset.film;
const edition=editionName ? (await import('./alternate-films.mjs?v=quality-4')).configure(editionName) : null;
const {chapters, fps, lastFrame, makeRoute, mapValue, sceneAt}=edition || originalRoute;
const posterTimes=edition?.posterTimes || originalPosters;
const byId=id=>document.getElementById(id);
const root=document.documentElement, cinema=byId('cinema'), film=byId('storyFilm');
const still=byId('stillFrame'), photo=still.querySelector('img'), widePhoto=still.querySelector('source');
const objects=mountFilmObjects(byId('filmObjects'), activateObject, edition?.tracks, edition ? [] : undefined);
const nextButton=byId('continueFilm'), options=byId('filmOptions');
const details=byId('sceneDialog'), content=byId('sceneContent'), title=byId('sceneTitle');
const quick=byId('quickTag'), watch=byId('watchFilm'), cue=byId('scrollCue');
const wide=matchMedia('(min-aspect-ratio:1/1)'), reduce=matchMedia('(prefers-reduced-motion:reduce)');
const album=edition?.album || 'assets/film/', revision=edition?.revision || '?v=walkthrough-1';
const responsiveMedia=edition?.responsiveMedia===true;
const qualityControl=byId('filmQuality'), qualityStatus=byId('filmQualityStatus');
const dialogsOpen=()=>Boolean(document.querySelector('dialog[open]'));
const motionOff=()=>reduce.matches||root.dataset.motion==='off'||navigator.connection?.saveData===true;
const frameTime=t=>Math.max(0,Math.min(lastFrame,Math.round(t*fps)/fps));
let route=[], selected=-1, wanted=0, sourceName='', ready=false, unavailable=false;
let playbackEnd=null;
let watching=false, wasOpen=false, tick=0, previousFrame=0, ownScroll=-1, relocated=null;
let qualityPreference='auto', activeQuality='', sourceWide=false, selectionVersion=0;
let pendingQualityKey='', selectedQualityKey='', qualityWatchdog=0, seekStarted=0, slowSeeks=0;
const qualitySelections=new Map(), failedQualities={wide:new Set(),portrait:new Set()};

// Only the already-requested, same-origin opening poster supplies speed evidence.
// A cached image, a different chapter or missing Resource Timing stays unknown.
const openingTransfer=responsiveMedia ? new Promise(resolve=>{
  const finish=()=>{
    photo.removeEventListener('load',finish);photo.removeEventListener('error',finish);
    try{
      const url=new URL(photo.currentSrc||photo.src,location.href);
      if(url.origin!==location.origin||!url.pathname.includes('/film-offer'))return resolve(null);
      const entry=performance.getEntriesByName(url.href).at(-1);
      resolve(entry ? {transferSize:entry.transferSize,responseStart:entry.responseStart,responseEnd:entry.responseEnd} : null);
    }catch{resolve(null);}
  };
  if(photo.complete)finish();
  else{photo.addEventListener('load',finish,{once:true});photo.addEventListener('error',finish,{once:true});}
}) : null;
// Let the high-priority photograph finish and reach the screen before a large
// movie competes for bandwidth. Reuse this gate for later quality changes.
const openingPaint=responsiveMedia ? openingTransfer.then(async()=>{
  try{await photo.decode();}catch{}
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}) : Promise.resolve();

const currentPreference=()=>!wide.matches&&qualityPreference==='4k'?'auto':qualityPreference;
function qualityMessage(){
  if(!qualityControl)return;
  qualityControl.value=currentPreference();
  qualityControl.querySelector('[value="4k"]').disabled=!wide.matches;
  qualityControl.disabled=motionOff();
  if(motionOff())qualityStatus.textContent='Motion is paused.';
  else if(unavailable)qualityStatus.textContent='Showing still images.';
  else if(pendingQualityKey)qualityStatus.textContent='Choosing quality…';
  else if(activeQuality){
    const label=activeQuality==='4k'?'4K':activeQuality==='hd'?'HD':'720p';
    qualityStatus.textContent=!ready?'Loading '+label+'…':currentPreference()==='4k'&&activeQuality!=='4k'?'Using '+label+' for smoother playback.':currentPreference()==='auto'?'Auto: '+label:label;
  }
}
function availableQuality(quality,isWide){
  const failures=failedQualities[isWide?'wide':'portrait'];
  while(failures.has(quality)){
    if(quality==='720')return null;
    quality=quality==='4k'?'hd':'720';
  }
  return quality;
}
function attachMovie(name,quality='',isWide=wide.matches){
  if(name===sourceName&&!unavailable){qualityMessage();return;}
  clearTimeout(qualityWatchdog);
  stopWatching();posterAt(wanted);sourceName=name;ready=false;unavailable=false;
  activeQuality=quality;sourceWide=isWide;seekStarted=0;slowSeeks=0;
  film.preload='auto';film.src=name;film.load();qualityMessage();
  armQualityWatchdog();
}
function armQualityWatchdog(){
  clearTimeout(qualityWatchdog);
  if(activeQuality!=='4k'||motionOff()||dialogsOpen()||document.hidden||ready&&film.readyState>=2)return;
  const expected=sourceName;
  qualityWatchdog=setTimeout(()=>{
    if(sourceName===expected&&!motionOff()&&!dialogsOpen()&&!document.hidden&&!(ready&&film.readyState>=2))lowerQuality();
  },5000);
}
function lowerQuality(){
  if(!responsiveMedia||!activeQuality||sourceWide!==wide.matches)return false;
  failedQualities[sourceWide?'wide':'portrait'].add(activeQuality);
  const next=availableQuality(activeQuality,sourceWide);
  if(!next)return false;
  attachMovie(album+filmFilename(sourceWide,next)+revision,next,sourceWide);
  return true;
}
function measure(){
  objects.measure(wide.matches,getComputedStyle(film).objectFit);
  const last=Math.max(1,root.scrollHeight-innerHeight);
  route=makeRoute(chapters.map(ch=>byId(ch.id).getBoundingClientRect().top+scrollY),last);
}
function stillAt(i,t){
  return !edition && chapters[i].id==='made-with-love' && t<33.2 ? 'visit' : chapters[i].still;
}
function showPoster(i,t){
  const name=stillAt(i,t);
  if(still.dataset.shot===name)return;
  still.dataset.shot=name;
  if(responsiveMedia){
    const sources=filmPosterSources(album,name,revision);
    widePhoto.srcset=sources.wide;widePhoto.sizes='100vw';
    photo.srcset=sources.portrait;photo.sizes='100vw';
  }else widePhoto.srcset=album+'film-'+name+'-wide.webp'+revision;
  photo.src=album+'film-'+name+'.webp'+revision;
}
function setScene(t){
  const i=sceneAt(t);
  const opening=edition?.openingMotionStart!==undefined
    ? t<edition.openingMotionStart+.25||!cinema.classList.contains('on-film')&&stillAt(i,t)==='offer'
    : t<.55;
  const end=t>=lastFrame-.08;
  cue.hidden=!opening&&!end;
  cue.textContent=end?(edition?.replay || 'Back to the table'):(edition?.cue || 'Scroll to follow the glass');
  if(i!==selected){
    selected=i;cinema.dataset.scene=chapters[i].id;
    nextButton.setAttribute('aria-label',i===chapters.length-1?'Back to the table':'Follow the camera to the next part');
    if(!edition)nextButton.classList.toggle('at-end',i===chapters.length-1);
  }
  if(edition){
    const repeat=t>=edition.nextStops.at(-1)-.1;
    nextButton.classList.toggle('at-end',repeat);
    nextButton.setAttribute('aria-label',repeat?edition.replay:'Go to the next stop');
  }
  objects.show(cinema.classList.contains('on-film') ? t : posterTimes[stillAt(i,t)]);
}
function chooseFile(){
  if(motionOff()||dialogsOpen())return;
  const isWide=wide.matches;
  if(!responsiveMedia){attachMovie(album+(isWide?'free-lunch-wide.mp4':'free-lunch-portrait.mp4')+revision);return;}
  if(activeQuality&&sourceWide!==isWide)posterAt(wanted);
  const preference=currentPreference(),key=(isWide?'wide':'portrait')+':'+preference;
  if(selectedQualityKey===key&&sourceName){
    if(pendingQualityKey&&pendingQualityKey!==key){++selectionVersion;pendingQualityKey='';qualityMessage();}
    return;
  }
  if(pendingQualityKey===key)return;
  pendingQualityKey=key;
  const version=++selectionVersion;
  if(!qualitySelections.has(key)){
    qualitySelections.set(key,selectFilmQuality({
      wide:isWide,width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio||1,
      fit:getComputedStyle(film).objectFit,preference,connection:navigator.connection,
      decodingInfo:navigator.mediaCapabilities?.decodingInfo?.bind(navigator.mediaCapabilities),
      posterTransfer:openingTransfer
    }));
  }
  qualityMessage();
  qualitySelections.get(key).then(async selection=>{
    await openingPaint;
    if(version!==selectionVersion)return;
    pendingQualityKey='';
    if(isWide!==wide.matches||preference!==currentPreference()||motionOff()||dialogsOpen()){qualityMessage();return;}
    selectedQualityKey=key;
    const quality=availableQuality(selection,isWide);
    if(!quality){unavailable=true;posterAt(wanted);qualityMessage();return;}
    attachMovie(album+filmFilename(isWide,quality)+revision,quality,isWide);
  });
}
function posterAt(t){
  cinema.classList.remove('on-film');setScene(t);showPoster(sceneAt(t),t);
}
function reveal(){
  if(responsiveMedia&&sourceWide!==wide.matches)return;
  if(responsiveMedia&&!watching&&wanted===0){posterAt(0);return;}
  if((watching||Math.abs(film.currentTime-wanted)<.5/fps||cinema.classList.contains('on-film'))&&ready&&!motionOff()&&!unavailable&&film.readyState>=2){
    cinema.classList.add('on-film');objects.show(film.currentTime);
    clearTimeout(qualityWatchdog);
  }
}
function schedule(){
  if(!tick&&!document.hidden&&!dialogsOpen())tick=requestAnimationFrame(render);
}
function ownPosition(y,behavior='instant'){
  ownScroll=Math.round(y);
  scrollTo({top:y,behavior});
}
function render(now){
  tick=0;
  if(dialogsOpen()||document.hidden)return;
  if(watching){
    if(playbackEnd!==null && film.currentTime>=playbackEnd){
      const end=playbackEnd;stopWatching();jumpToFrame(end);return;
    }
    wanted=frameTime(film.currentTime);setScene(wanted);reveal();
    ownPosition(mapValue(route,wanted,true));schedule();return;
  }
  if(motionOff()||unavailable){posterAt(wanted);return;}
  if(!ready||film.seeking||responsiveMedia&&sourceWide!==wide.matches)return;
  const delta=wanted-film.currentTime;
  if(Math.abs(delta)<.5/fps){setScene(wanted);reveal();return;}
  // A single outstanding decoder seek prevents stale frames piling up on iOS.
  // The short settling time works identically going up or down the page.
  const dt=Math.max(16,Math.min(100,now-previousFrame));
  previousFrame=now;
  let step=Math.max(1/fps,Math.abs(delta)*(1-Math.exp(-dt/46)));
  step=Math.min(step,Math.abs(delta));
  const skipOpening=edition?.openingMotionStart!==undefined&&
    (wanted===0||film.currentTime<edition.openingMotionStart&&wanted>=edition.openingMotionStart);
  const dest=skipOpening?wanted:frameTime(film.currentTime+Math.sign(delta)*step);
  try{seekStarted=performance.now();film.currentTime=dest;}catch{schedule();}
}
function followScroll(){
  if(dialogsOpen())return;
  if(watching){
    if(Math.abs(scrollY-ownScroll)<2)return;
    stopWatching();
  }
  wanted=frameTime(mapValue(route,scrollY));
  if(edition?.openingMotionStart!==undefined&&wanted===0){
    posterAt(0);
    if(!motionOff()&&!unavailable&&ready&&film.currentTime!==0){
      try{seekStarted=performance.now();film.currentTime=0;}catch{}
    }
  }
  if(motionOff()||unavailable){posterAt(wanted);return;}
  chooseFile();schedule();
}
function stopWatching(){
  if(!watching)return;
  watching=false;playbackEnd=null;film.pause();watch.textContent='Watch as a film';
}
function jumpToFrame(time){
  wanted=frameTime(time);
  ownPosition(mapValue(route,wanted,true));
  if(!ready||motionOff()||unavailable){posterAt(wanted);return;}
  film.currentTime=wanted;
  schedule();
}

function playObjectMove(end, fallback){
  if(motionOff()||unavailable||!ready){jumpToFrame(fallback);return;}
  playbackEnd=end;
  watching=true;
  watch.textContent='Return to scrolling';
  film.play().then(schedule).catch(()=>{stopWatching();jumpToFrame(fallback);});
}

function activateObject(track,button,displayedTime){
  if(button.hidden||dialogsOpen())return;
  closeMenu();
  stopWatching();
  if(cinema.classList.contains('on-film')&&Math.abs(wanted-displayedTime)>.5/fps)jumpToFrame(displayedTime);
  if(track.action==='talk'){openTableTalk(button,track.deck);return;}
  if(track.action==='lunch'){sceneDetails('lunch',button);return;}
  if(track.action==='gallery')byId('inspectTag').click();
  else if(track.action==='lookup')quick.click();
  else switch(track.id){
    case 'plate': playObjectMove(4.83,6.65);return;
    case 'pail': playObjectMove(29.8,28.85);return;
    case 'shard': playObjectMove(35.83,35.55);return;
    case 'crystal':
    case 'tag': byId('inspectTag').click();break;
    case 'card': quick.click();break;
    case 'bowl': sceneDetails('lunch');break;
    case 'flowers': sceneDetails('bonus');break;
  }
  const dialog=byId(track.dialog);
  if(dialog.open)dialog.addEventListener('close',()=>{
    if(!button.hidden&&!dialogsOpen())button.focus({preventScroll:true});
  },{once:true});
}

function watchFilm(){
  closeMenu();
  if(watching){stopWatching();followScroll();return;}
  if(motionOff())return;
  chooseFile();
  if(!ready||unavailable||pendingQualityKey)return;
  watching=true;watch.textContent='Return to scrolling';
  if(wanted>=lastFrame-.1){film.currentTime=0;wanted=0;ownPosition(0);}
  else if(edition?.openingMotionStart!==undefined&&wanted===0&&film.currentTime!==0)film.currentTime=0;
  film.play().then(schedule).catch(()=>{stopWatching();followScroll();});
}
function requestChapter(i,atStart=false){
  stopWatching();
  const t=i===0?0:atStart?chapters[i].start:chapters[i].read;
  // Let native scrolling move through the intervening frames, including on touch.
  const y=mapValue(route,t,true);
  scrollTo({top:y,behavior:motionOff()||atStart?'instant':'smooth'});
  if(atStart||motionOff())followScroll();
}
function closeMenu(){options.open=false;}
watch.addEventListener('click',watchFilm);
nextButton.addEventListener('click',()=>{
  if(!edition){requestChapter((selected+1)%chapters.length);return;}
  stopWatching();
  const stop=edition.nextStops.slice(1).find(t=>t>wanted+.12) ?? 0;
  scrollTo({top:mapValue(route,stop,true),behavior:motionOff()?'instant':'smooth'});
});
addEventListener('scroll',followScroll,{passive:true});
function interruptPlayback(){
  if(watching&&!dialogsOpen()){
    stopWatching();
    if(edition?.openingMotionStart!==undefined)followScroll();
  }
}
for(const type of ['wheel','touchstart'])addEventListener(type,interruptPlayback,{passive:true});
addEventListener('keydown',e=>{
  if(['PageDown','PageUp','ArrowDown','ArrowUp','Home','End'].includes(e.key))interruptPlayback();
});
film.addEventListener('loadedmetadata',()=>{
  ready=true;previousFrame=0;qualityMessage();
  if(responsiveMedia&&Math.abs(film.currentTime-wanted)>=.5/fps){
    try{seekStarted=performance.now();film.currentTime=wanted;}catch{}
  }
  schedule();
});
film.addEventListener('loadeddata',()=>{clearTimeout(qualityWatchdog);schedule();reveal();});
film.addEventListener('seeked',()=>{
  // A seek from the previous orientation can complete after a poster takes over.
  if(motionOff()||unavailable||!ready||responsiveMedia&&sourceWide!==wide.matches)return;
  if(activeQuality==='4k'&&seekStarted){
    slowSeeks=performance.now()-seekStarted>500?slowSeeks+1:0;
    if(slowSeeks>=3&&lowerQuality())return;
  }
  seekStarted=0;
  setScene(film.currentTime);reveal();schedule();
});
film.addEventListener('ended',()=>{stopWatching();wanted=lastFrame;ownPosition(mapValue(route,wanted,true));setScene(wanted);});
film.addEventListener('error',()=>{
  if(lowerQuality())return;
  clearTimeout(qualityWatchdog);stopWatching();unavailable=true;ready=false;posterAt(wanted);qualityMessage();
});
function updateMotion(){
  watch.disabled=motionOff();
  qualityMessage();
  if(motionOff()){clearTimeout(qualityWatchdog);stopWatching();film.pause();posterAt(wanted);return;}
  chooseFile();armQualityWatchdog();schedule();
}
qualityControl?.addEventListener('change',()=>{
  stopWatching();qualityPreference=qualityControl.value;
  ++selectionVersion;pendingQualityKey='';selectedQualityKey='';
  // An explicit choice can reassess a resized viewport; normal resizing never
  // starts a second rendition download merely to upgrade its quality.
  qualitySelections.delete((wide.matches?'wide':'portrait')+':'+currentPreference());
  failedQualities[wide.matches?'wide':'portrait'].clear();
  chooseFile();
});
new MutationObserver(updateMotion).observe(root,{attributes:true,attributeFilter:['data-motion']});
reduce.addEventListener('change',updateMotion);
let previousWidth=innerWidth;
function resize(){
  const t=wanted;measure();
  qualityMessage();
  if(Math.abs(previousWidth-innerWidth)>8){
    previousWidth=innerWidth;ownPosition(mapValue(route,t,true));chooseFile();
  }
  if(!watching)followScroll();
}
wide.addEventListener('change',()=>{resize();chooseFile();});addEventListener('resize',resize);
// Keep clipped headings and prose available to assistive technology, while
// removing only their controls from sequential keyboard navigation. The saved
// value travels with clones; moved controls remain programmatically focusable.
function manageClippedFocus(){
  const marker='data-film-tabindex';
  const controls='a[href],area[href],button,input,select,textarea,summary,iframe,object,embed,audio[controls],video[controls],[contenteditable]:not([contenteditable="false"]),[tabindex],['+marker+']';
  const update=node=>{
    if(node.closest('body>main,body>footer')){
      if(!node.hasAttribute(marker))node.setAttribute(marker,JSON.stringify(node.getAttribute('tabindex')));
      node.setAttribute('tabindex','-1');
    }else if(node.hasAttribute(marker)){
      const previous=JSON.parse(node.getAttribute(marker));
      if(previous===null)node.removeAttribute('tabindex');
      else node.setAttribute('tabindex',previous);
      node.removeAttribute(marker);
    }
  };
  const visit=node=>{
    if(node.nodeType!==1||!node.isConnected)return;
    if(node.matches(controls))update(node);
    node.querySelectorAll(controls).forEach(update);
  };
  visit(document.body);
  // Attribute changes above are deliberately not observed, avoiding loops.
  new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)visit(node);
  }).observe(document.body,{childList:true,subtree:true});
}
function moveHere(node){
  if(!node)return;
  const slot=document.createComment('scene detail in original page flow');
  node.before(slot);content.append(node);relocated={node,slot};
}
function copyElements(selector){
  document.querySelectorAll(selector).forEach(n=>{
    const copy=n.cloneNode(true);
    // Footer clipping must not follow the credits into this dialog.
    if(n.matches('footer .credits'))copy.classList.remove('credits');
    content.append(copy);
  });
}
let sceneReturn;
function sceneDetails(id=chapters[selected].id, trigger=options.querySelector('summary')){
  closeMenu();
  if(dialogsOpen())return;
  const section=byId(id);
  if(id==='claim'){quick.click();return;}
  sceneReturn=trigger;
  details.toggleAttribute('data-guide',id==='how');
  content.replaceChildren();
  const heading=section.querySelector('h1,h2')?.innerText||'Made with love by Meadows.';
  title.textContent=id==='how'?(edition?'Lunch, explained.':'Can I buy you lunch?'):heading.replace(/\s+/g,' ').trim();
  switch(id){
    case 'hero':copyElements('#hero .lede');break;
    case 'lunch':copyElements('#lunch p');break;
    case 'hosts':moveHere(section.querySelector('.people'));break;
    case 'how':moveHere(byId('invitationCopy'));break;
    case 'video':moveHere(section.querySelector('video'));break;
    case 'story':copyElements('#story .prose>p,#story .partners');break;
    case 'why':copyElements('#why p');break;
    case 'bonus':copyElements('#bonus .prose>*');break;
    default:copyElements('footer .credits');
  }
  details.showModal();byId('closeScene').focus();
}
const promptIndex=new Map();
const tableQuestions=[
  'Your friend has the aux for one song. What should they play?',
  'You get to put one local spot on the map. Where are we eating?',
  'What’s something you could teach this table in five minutes?',
  'Which pizza topping are you willing to defend?',
  'You have a free Saturday and twenty bucks. What’s the plan?'
];
function openTableTalk(trigger,deck){
  closeMenu();stopWatching();
  if(dialogsOpen())return;
  sceneReturn=trigger;
  details.removeAttribute('data-guide');title.textContent='Pass a question around.';
  const question=document.createElement('p');question.className='table-question';question.setAttribute('aria-live','polite');
  const next=document.createElement('button');next.type='button';next.className='button';next.textContent='Draw another';
  const decks=edition?.questionDecks;
  let current=deck || (decks?'mild':'original');
  const draw=()=>{
    const questions=decks ? decks[current].questions : tableQuestions;
    const index=promptIndex.get(current) || 0;
    question.textContent=questions[index];
    promptIndex.set(current,(index+1)%questions.length);
  };
  next.addEventListener('click',draw);
  content.replaceChildren(question,next);
  if(decks){
    const choices=document.createElement('div');
    choices.className='salsa-choices';
    choices.setAttribute('role','group');choices.setAttribute('aria-label','Choose a table question');
    const pick=key=>{
      current=key;
      for(const button of choices.children)button.setAttribute('aria-pressed',String(button.value===key));
      title.textContent=decks[key].heading;
      draw();
    };
    for(const [key,choice] of Object.entries(decks)){
      const button=document.createElement('button');
      button.type='button';button.value=key;button.textContent=choice.label;
      button.addEventListener('click',()=>pick(key));choices.append(button);
    }
    content.prepend(choices);pick(current);
  }else draw();
  details.showModal();byId('closeScene').focus();
}
byId('tableTalk')?.addEventListener('click',e=>openTableTalk(e.currentTarget));
byId('invitationGuide').addEventListener('click',event=>{
  stopWatching();sceneDetails('how',event.currentTarget);
});
byId('readScene').addEventListener('click',()=>sceneDetails());
byId('closeScene').addEventListener('click',()=>details.close());
details.addEventListener('close',()=>{
  if(relocated){
    if(relocated.node.tagName==='VIDEO')relocated.node.pause();
    relocated.slot.replaceWith(relocated.node);relocated=null;
  }
  content.replaceChildren();
  if(!dialogsOpen())sceneReturn?.focus({preventScroll:true});
});

function watchDialogs(){
  const open=dialogsOpen();
  if(open&&!wasOpen){clearTimeout(qualityWatchdog);film.pause();}
  if(!open&&wasOpen){
    chooseFile();armQualityWatchdog();
    if(watching)film.play().then(schedule).catch(stopWatching);
    else followScroll();
  }
  wasOpen=open;
}
for(const d of document.querySelectorAll('dialog'))new MutationObserver(watchDialogs).observe(d,{attributes:true,attributeFilter:['open']});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){clearTimeout(qualityWatchdog);film.pause();}
  else{
    armQualityWatchdog();
    if(watching&&!dialogsOpen())film.play().then(schedule).catch(stopWatching);
    else schedule();
  }
});
document.querySelectorAll('a[href="#claim"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();if(details.open)details.close();quick.click();}));
function followHash(){
  if(location.hash==='#claim'){quick.click();return;}
  const i=chapters.findIndex(ch=>ch.id===location.hash.slice(1));
  if(i>=0)requestChapter(i,true);
}
for(const chapter of chapters)byId(chapter.id).style.setProperty('--travel',chapter.span+'svh');
root.classList.add('projecting');
manageClippedFocus();
measure();wanted=frameTime(mapValue(route,scrollY));setScene(wanted);showPoster(selected,wanted);
addEventListener('hashchange',followHash);
if(location.hash)followHash();
updateMotion();
