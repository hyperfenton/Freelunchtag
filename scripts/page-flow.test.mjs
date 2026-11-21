import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('the public homepage follows the original invitation sequence', () => {
  const main = page.match(/<main>([\s\S]*?)<\/main>/)[1];
  const sections = [...main.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(sections, ['hero', 'lunch', 'hosts', 'how', 'video', 'story', 'why', 'claim', 'bonus']);
  const hero = main.split('</section>')[0];
  assert.match(hero, /href="#claim"/);
  assert.match(hero, /href="#how"/);
  assert.doesNotMatch(hero, /id="codeForm"/);
});

test('physical-tag navigation conceals the QR fragment before analytics or page requests', () => {
  const capture = page.indexOf("location.hash.startsWith('#tag=')");
  const strip = page.indexOf('history.replaceState');
  const firstLinkedResource = page.search(/<(?:link\b|script\s+[^>]*src=)/);
  assert.ok(capture > 0 && strip > capture && strip < firstLinkedResource);
  assert.match(page.slice(capture, firstLinkedResource), /'#claim'/);
});

test('the plate is the opening and the three printable tags have a separate viewer', () => {
  const opening = page.split('<section id="lunch"')[0];
  assert.match(opening, /id="plateStage"/);
  assert.doesNotMatch(opening, /id="frontArt"/);
  assert.match(page, /<dialog id="collectorDialog"[\s\S]*?id="frontArt"/);
  assert.match(page, /id="made-with-love"[\s\S]*?Made with love<br><em>by Meadows/);
});

test('the art, fonts and renderers ship with the public site', async () => {
  const css = await readFile(new URL('../table.css', import.meta.url), 'utf8');
  const resources = [...css.matchAll(/url\(["']?(assets\/[^"')]+)["']?\)/g)].map(match => match[1]);
  resources.push('table-journey.js','glass-world.js','environment-type.js','in-scene-titles.js','crystal-fragments.js','garden-props.js','tag-viewer.js');
  for (const file of new Set(resources)) {
    assert.ok((await readFile(new URL('../' + file, import.meta.url))).length > 0, file);
  }
});

test('the side tag opens a single reusable lookup dialog', () => {
  assert.match(page, /id="quickTag"[^>]+aria-haspopup="dialog"/);
  assert.match(page, /<dialog id="quickLookup"/);
  assert.equal([...page.matchAll(/id="codeForm"/g)].length, 1);
});
