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
