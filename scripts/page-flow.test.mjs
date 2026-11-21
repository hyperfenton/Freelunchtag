import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import test from 'node:test';
const load = file => readFile(new URL('../'+file,import.meta.url),'utf8');
const page=await load('index.html');

test('the film retains the original guest journey and its two welcome shortcuts',()=>{
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
test('the primary visual is a local movie with photographic posters for both compositions',async()=>{
  assert.match(page,/<video id="storyFilm" muted playsinline/);
  assert.doesNotMatch(page,/<canvas/);
  const images=['lift','shatter','emblem','floor','host','broom','toss','story','why','claim','visit','close'];
  const files=images.flatMap(name=>['','-wide'].map(suffix=>'film-'+name+suffix+'.webp'));
  files.push('free-lunch-portrait.mp4','free-lunch-wide.mp4');
  for(const name of files){
    const info=await stat(new URL('../assets/film/'+name,import.meta.url));
    assert.ok(info.size>1024,name+' is present');
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
