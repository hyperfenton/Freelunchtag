import assert from 'node:assert/strict';
import test from 'node:test';
import {selectFilmQuality} from '../film-quality.mjs';

const desktop={wide:true,width:1440,height:900,pixelRatio:2};
const capable={supported:true,smooth:true,powerEfficient:true};
const fast={downlink:40,effectiveType:'4g'};
const neverProbe=()=>{throw new Error('This choice should not probe a 4K decoder');};

test('Auto keeps HD on a desktop with unknown network speed without probing 4K',async()=>{
  assert.equal(await selectFilmQuality({...desktop,decodingInfo:neverProbe}),'hd');
});

test('Auto respects slow connections and Save Data before considering a 4K source',async()=>{
  for(const connection of [
    {effectiveType:'slow-2g'},
    {effectiveType:'2g'},
    {effectiveType:'3g'},
    {downlink:3,effectiveType:'4g'},
    {downlink:40,saveData:true},
  ]){
    assert.equal(await selectFilmQuality({...desktop,connection,decodingInfo:neverProbe}),'720');
  }
});

test('a large fast desktop probes the actual 4K encoding before selecting it',async()=>{
  let calls=0;
  const decodingInfo=async config=>{
    calls++;
    assert.equal(config.type,'file');
    assert.match(config.video.contentType,/video\/mp4/);
    assert.match(config.video.contentType,/avc1\.640033/);
    assert.equal(config.video.width,3840);
    assert.equal(config.video.height,2160);
    assert.equal(config.video.bitrate,18_000_000);
    assert.equal(config.video.framerate,24);
    return capable;
  };
  assert.equal(await selectFilmQuality({...desktop,connection:fast,decodingInfo}),'4k');
  assert.equal(calls,1);
});

test('a substantial fast poster transfer can qualify 4K without a connection API',async()=>{
  const posterTransfer={transferSize:512*1024,responseStart:100,responseEnd:200};
  assert.equal(await selectFilmQuality({
    ...desktop,posterTransfer,decodingInfo:async()=>capable,
  }),'4k');
  for(const transfer of [
    {transferSize:0,responseStart:100,responseEnd:200},
    {transferSize:128*1024,responseStart:100,responseEnd:120},
    {transferSize:512*1024,responseStart:100,responseEnd:110},
    {transferSize:512*1024,responseStart:100,responseEnd:500},
  ]){
    assert.equal(await selectFilmQuality({
      ...desktop,posterTransfer:transfer,decodingInfo:neverProbe,
    }),'hd');
  }
});

test('Auto rejects unsupported, uneven, or inefficient 4K decoding',async()=>{
  for(const result of [
    {...capable,supported:false},
    {...capable,smooth:false},
    {...capable,powerEfficient:false},
  ]){
    assert.equal(await selectFilmQuality({
      ...desktop,connection:fast,decodingInfo:async()=>result,
    }),'hd');
  }
  assert.equal(await selectFilmQuality({...desktop,connection:fast}),'hd');
  assert.equal(await selectFilmQuality({
    ...desktop,connection:fast,decodingInfo:async()=>{throw new Error('Probe unavailable');},
  }),'hd');
});

test('Auto does not load 4K for a small desktop viewport or a lower-density screen',async()=>{
  for(const viewport of [
    {width:1024,height:768,pixelRatio:2},
    {width:1440,height:900,pixelRatio:1},
  ]){
    assert.equal(await selectFilmQuality({
      ...desktop,...viewport,connection:fast,decodingInfo:neverProbe,
    }),'hd');
  }
});

test('portrait delivery follows its useful pixel size and never selects a 4K movie',async()=>{
  const phone={wide:false,width:390,height:844};
  assert.equal(await selectFilmQuality({
    ...phone,pixelRatio:1,connection:fast,decodingInfo:neverProbe,
  }),'720');
  assert.equal(await selectFilmQuality({
    ...phone,pixelRatio:3,connection:fast,decodingInfo:neverProbe,
  }),'hd');
  assert.notEqual(await selectFilmQuality({
    ...phone,pixelRatio:3,preference:'4k',connection:fast,decodingInfo:neverProbe,
  }),'4k');
});

test('explicit quality choices override network estimation while respecting Save Data and decoder support',async()=>{
  assert.equal(await selectFilmQuality({
    ...desktop,preference:'hd',connection:{downlink:1,effectiveType:'3g'},decodingInfo:neverProbe,
  }),'hd');
  assert.equal(await selectFilmQuality({
    ...desktop,preference:'hd',connection:{saveData:true},decodingInfo:neverProbe,
  }),'720');
  assert.equal(await selectFilmQuality({
    ...desktop,preference:'4k',decodingInfo:async()=>({...capable,powerEfficient:false}),
  }),'4k');
  assert.equal(await selectFilmQuality({
    ...desktop,preference:'4k',decodingInfo:async()=>({...capable,supported:false}),
  }),'hd');
});

test('a decoder probe deadline resolves to HD and a late result cannot trigger an upgrade',{timeout:1000},async()=>{
  let finishProbe;
  const probe=new Promise(resolve=>{finishProbe=resolve;});
  let probeCalls=0;
  const selection=selectFilmQuality({
    ...desktop,connection:fast,timeoutMs:15,
    decodingInfo:()=>{probeCalls++;return probe;},
  });
  assert.equal(await selection,'hd');
  finishProbe(capable);
  await Promise.resolve();
  assert.equal(await selection,'hd');
  assert.equal(probeCalls,1);
});

test('a late fast poster transfer cannot start a decoder probe after the HD deadline',{timeout:1000},async()=>{
  let finishTransfer;
  const posterTransfer=new Promise(resolve=>{finishTransfer=resolve;});
  let probeCalls=0;
  const selection=selectFilmQuality({
    ...desktop,posterTransfer,timeoutMs:15,
    decodingInfo:async()=>{probeCalls++;return capable;},
  });
  assert.equal(await selection,'hd');
  assert.equal(probeCalls,0);
  finishTransfer({transferSize:512*1024,responseStart:100,responseEnd:200});
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(await selection,'hd');
  assert.equal(probeCalls,0);
});
