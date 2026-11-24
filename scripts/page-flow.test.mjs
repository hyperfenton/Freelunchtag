import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import test from 'node:test';
const load = file => readFile(new URL('../'+file,import.meta.url),'utf8');
const page=await load('index.html');

test('the homepage retains the guest journey and its two welcome shortcuts',()=>{
  const main=page.match(/<main>([\s\S]*?)<\/main>/)[1];
  const ids=[...main.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,['hero','lunch','hosts','how','video','story','why','claim','bonus']);
  const hero=main.split('</section>')[0];
  assert.match(hero,/href="#claim"/);assert.match(hero,/href="#how"/);
});
test('QR navigation strips the secret before resources or analytics load',()=>{
  const capture=page.indexOf("location.hash.startsWith('#tag=')");
  const strip=page.indexOf('history.replaceState');
  const firstLink=page.search(/<(?:link\b|script\s+[^>]*src=)/);
  assert.ok(capture>0 && strip>capture && strip<firstLink);
  assert.match(page.slice(capture,firstLink),/'#claim'/);
});
test('the primary and saved original films retain local movies and posters for both compositions',async()=>{
  assert.match(page,/<video id="storyFilm" muted playsinline/);
  assert.doesNotMatch(page,/<canvas/);
  const {configure}=await import('../alternate-films.mjs');
  const primary=configure('pass-the-salsa');
  const primaryFiles=Object.keys(primary.posterTimes).flatMap(name=>['','-wide'].map(suffix=>'film-'+name+suffix+'.webp'));
  primaryFiles.push('free-lunch-portrait.mp4','free-lunch-wide.mp4');
  for(const name of primaryFiles){
    const info=await stat(new URL('../assets/pass-the-salsa/'+name,import.meta.url));
    assert.ok(info.size>1024,name+' is present for the homepage');
  }
  const images=['lift','shatter','emblem','floor','host','broom','toss','story','why','claim','visit','close'];
  const files=images.flatMap(name=>['','-wide'].map(suffix=>'film-'+name+suffix+'.webp'));
  files.push('free-lunch-portrait.mp4','free-lunch-wide.mp4');
  for(const name of files){
    const info=await stat(new URL('../assets/film/'+name,import.meta.url));
    assert.ok(info.size>1024,name+' is present for the saved original');
  }
});
test('the side tag and printed QR use a single invitation form',()=>{
  assert.match(page,/id="quickTag"[^>]+aria-haspopup="dialog"/);
  assert.match(page,/<dialog id="quickLookup"/);
  assert.equal([...page.matchAll(/id="codeForm"/g)].length,1);
  assert.match(page,/id="made-with-love"[\s\S]*?Made with love<br><em>by Meadows/);
});

test('scroll distance and film time round-trip at chapter boundaries and in between',async()=>{
  const {chapters, lastFrame, makeRoute, mapValue, sceneAt}=await import('../scroll-route.mjs');
  const tops=chapters.map((_,i)=>i*1000), end=tops.at(-1)+700;
  const route=makeRoute(tops,end);
  assert.deepEqual(route[0],[0,0]);assert.deepEqual(route.at(-1),[end,lastFrame]);
  for(let i=1;i<route.length;i++){
    assert.ok(route[i][0]>route[i-1][0] && route[i][1]>route[i-1][1]);
  }
  for(let y=0;y<=end;y+=13){
    assert.ok(Math.abs(mapValue(route,mapValue(route,y),true)-y)<1e-7);
  }
  for(const [i,ch] of chapters.entries()){
    assert.equal(sceneAt(ch.read),i);
    assert.equal(mapValue(route,tops[i]),ch.start);
  }
  assert.equal(mapValue(route,-150),0);assert.equal(mapValue(route,end+150),lastFrame);
});

test('only objects in the displayed footage accept taps',async()=>{
  const {filmObjects,mediaFrame,objectBounds,posterTimes}=await import('../film-objects.mjs');
  const mobile=mediaFrame(390,844,false,'cover');
  const visible=t=>filmObjects.filter(o=>objectBounds(o,t,mobile)).map(o=>o.id);
  assert.deepEqual(visible(0),['plate']);
  assert.deepEqual(visible(3.2),[]);
  assert.deepEqual(visible(posterTimes.broom),['card','tag']);
  assert.deepEqual(visible(posterTimes.visit),['shard']);
  assert.deepEqual(visible(posterTimes.close),['flowers']);
  const [card,tag]=['card','tag'].map(id=>objectBounds(filmObjects.find(o=>o.id===id),10.9,mobile));
  assert.ok(tag.x+tag.width<=card.x,'separate chair objects');
});

test('visible object bounds fit both the video and the screen after cropping or letterboxing',async()=>{
  const {filmObjects,mediaFrame,objectBounds}=await import('../film-objects.mjs');
  for(const [w,h,wide,fit] of [[320,694,false,'cover'],[1024,960,true,'contain'],[844,390,true,'cover'],[280,820,false,'contain']]){
    const frame=mediaFrame(w,h,wide,fit);
    for(const obj of filmObjects){
      for(let t=0;t<=36;t+=.125){
        const b=objectBounds(obj,t,frame);
        if(!b)continue;
        assert.ok(b.x>=Math.max(0,frame.x)-.01 && b.y>=Math.max(0,frame.y)-.01);
        assert.ok(b.x+b.width<=Math.min(w,frame.x+frame.w)+.01 && b.y+b.height<=Math.min(h,frame.y+frame.h)+.01);
        assert.ok(b.width>=44 && b.height>=44,'minimum tap area for '+obj.id);
      }
    }
  }
});

test('the guest guide and manual entry are reachable before exploring film objects',()=>{
  assert.match(page,/<header class="film-tools">[\s\S]*?id="invitationGuide"[^>]*aria-controls="sceneDialog"/);
  const guide=page.slice(page.indexOf('<div id="invitationCopy">'),page.indexOf('<div class="demonstration"'));
  assert.match(guide,/href="#claim"/);
  assert.match(guide,/12-character code/);
  assert.match(guide,/original host/);
  assert.equal((guide.match(/<li>/g)||[]).length,3);
  assert.equal((page.match(/id="codeForm"/g)||[]).length,1);
});

test('each film edition retains its guest entry, five readable stops and reversible scroll',async()=>{
  const {chapters,configure,lastFrame,makeRoute,mapValue}=await import('../alternate-films.mjs');
  const tops=chapters.map((_,i)=>i*1000),end=tops.at(-1)+840;
  const route=makeRoute(tops,end);
  let previous=[-1,-1];
  for(const point of route){
    assert.ok(point[0]>previous[0] && point[1]>previous[1]);
    previous=point;
  }
  assert.equal(route.at(-1)[1],lastFrame);
  for(const cut of ['found-tag','lunch-line','pass-the-salsa']){
    const path=cut==='pass-the-salsa'?'your-tag':cut;
    const entry=await load(path+'.html');
    const config=configure(cut);
    assert.ok(entry.includes('data-film="'+cut+'"'));
    const canonical=cut==='pass-the-salsa'?'https://freelunchtag.com/':'https://freelunchtag.com/'+path+'.html';
    assert.ok(entry.includes('<link rel="canonical" href="'+canonical+'">'));
    if(cut!=='pass-the-salsa'){
      assert.match(entry,/<meta name="robots" content="noindex,\s*follow">/);
      assert.match(entry,/href="original-film.html">Original film</);
    }
    assert.ok(entry.indexOf('history.replaceState')<entry.indexOf('<link'));
    assert.equal((entry.match(/id="codeForm"/g)||[]).length,1);
    assert.ok(entry.includes('Can I bring someone?'));
    for(const [i,track] of config.tracks.entries()){
      const {frames}=track,t=config.nextStops[track.deck ? 4 : i];
      assert.ok(frames[0][0]<=t && frames.at(-1)[0]>=t,'the object is present at its reading stop');
      assert.ok(Math.abs(t-mapValue(route,mapValue(route,t,true)))<1e-7);
    }
    for(const name of Object.keys(config.posterTimes)){
      for(const aspect of ['', '-wide']){
        const file=new URL('../assets/'+cut+'/film-'+name+aspect+'.webp',import.meta.url);
        assert.ok((await stat(file)).size>5000);
      }
    }
  }
});

test('the two salsa bottles open distinct question decks at the final reading stop',async()=>{
  const {configure}=await import('../alternate-films.mjs');
  const {mediaFrame,objectBounds}=await import('../film-objects.mjs');
  const cut=configure('pass-the-salsa');
  const bottles=cut.tracks.filter(track=>track.deck);
  assert.deepEqual(bottles.map(track=>track.deck),['mild','hot']);
  for(const bottle of bottles){
    assert.equal(bottle.action,'talk');
    assert.ok(cut.questionDecks[bottle.deck].questions.length>1);
  }
  assert.notEqual(cut.questionDecks.mild.questions[0], cut.questionDecks.hot.questions[0]);
  for(const [w,h,wide] of [[320,694,false],[390,844,false],[1400,850,true]]){
    const frame=mediaFrame(w,h,wide,'cover');
    const [mild,hot]=bottles.map(b=>objectBounds(b,cut.posterTimes.close,frame,[]));
    assert.ok(mild.x+mild.width<=hot.x);
  }
});

test('the selected invitation is the homepage, old links remain usable and other designs are saved away',async()=>{
  const {configure}=await import('../alternate-films.mjs');
  const html=await load('your-tag.html');
  assert.equal(page,html);
  assert.equal(await load('pass-the-salsa.html'),html);
  assert.match(html,/<title>Free Lunch Tag \| Meadows Baptist Church in Plano<\/title>/);
  assert.match(html,/<h1 id="hero-title">Someone gave you a <em>Free Lunch Tag\.<\/em><\/h1>/);
  assert.match(html,/<html lang="en" data-film="pass-the-salsa">/);
  assert.match(html,/<link rel="canonical" href="https:\/\/freelunchtag.com\/">/);
  assert.match(html,/<meta property="og:url" content="https:\/\/freelunchtag.com\/">/);
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const website=schema['@graph'].find(entity=>entity['@type']==='WebSite');
  const webpage=schema['@graph'].find(entity=>entity['@type']==='WebPage');
  assert.equal(website.url,'https://freelunchtag.com/');
  assert.equal(webpage.url,website.url);
  assert.equal(webpage.isPartOf['@id'],website['@id']);
  assert.doesNotMatch(html,/Pass the Salsa/i);
  const menu=html.match(/<div class="tool-list">([\s\S]*?)<\/div>/)[1];
  assert.doesNotMatch(menu,/href="(?:found-tag|lunch-line|original-film|your-tag|pass-the-salsa)\.html"/);
  assert.doesNotMatch(menu,/>Original film</);
  const original=await load('original-film.html');
  assert.match(original,/<meta name="robots" content="noindex,\s*follow">/);
  assert.match(original,/<span>We want to<\/span> <span>buy you<\/span> <em>lunch!<\/em>/);
  assert.match(original,/assets\/film\/film-lift-wide\.webp/);
  assert.doesNotMatch(original,/<html[^>]*data-film=/);
  assert.equal(configure('pass-the-salsa').tracks[0].action,'lookup');
});
