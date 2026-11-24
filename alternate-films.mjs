// Shared edit list for the alternate cuts. Each holds on the five source
// photographs between four six-second moves, leaving the print readable.
import {mapValue} from './scroll-route.mjs?v=walkthrough-1';
export {mapValue};
export const fps=24;
export const lastFrame=(4*144 + 5*58 - 1)/fps;
const readings=[0, 202/24, 404/24, 606/24, 808/24];
const shots=['offer','lookup','text','swap','close'];
export const posterTimes=Object.fromEntries(shots.map((name,i)=>[name,readings[i]+1]));
export const chapters=[
  ['hero',0,1,'offer',140],['lunch',3.55,4.25,'offer',66],
  ['hosts',5.65,6.75,'lookup',66],['how',7.4,9.46,'lookup',167],
  ['video',11.1,13.0,'lookup',72],['story',14.7,17.84,'text',161],
  ['why',19.8,21.6,'text',72],['claim',22.8,24,'swap',70],
  ['bonus',24.85,26.25,'swap',161],['made-with-love',30.4,34.7,'close',180]
].map(([id,start,read,still,span])=>({id,start,read,still,span}));
export function sceneAt(t){let i=0;while(i+1<chapters.length && t>=chapters[i+1].start)i++;return i;}
export function makeRoute(tops,end){
  const route=[];
  for(const [index,ch] of chapters.entries()){
    const height=(tops[index+1]??end)-tops[index];
    route.push([tops[index],ch.start]);
    const anchor=readings.find(time=>Math.abs(ch.read-time)<1.2);
    if(anchor!==undefined){
      if(anchor>ch.start)route.push([tops[index]+height*.26,anchor]);
      route.push([tops[index]+height*.63,ch.read]);
      route.push([tops[index]+height*.85,Math.min(anchor+2.26,lastFrame-.02)]);
    }else route.push([tops[index]+height*.62,ch.read]);
  }
  route.push([end,lastFrame]);
  return route;
}
export const nextStops=shots.map(name=>posterTimes[name]);
// Percentages refer to the two native masters, portrait first then landscape.
const salsaBounds=[
  [32,35,68,68,43,31,58,75],[20,24,94,68,33,13,67,71],
  [22,27,83,76,40,9,63,78],[6,34,94,91,29,16,70,94]
];
const bottleBounds={
  mild:[6,44,43,70,32,27,47,66],
  hot:[56,44,95,70,52,27,67,66]
};
const salsaDecks={
  mild:{label:'Mild question',hint:'Icebreaker',heading:'Start with something easy.',questions:[
    'What meal reminds you of someone you love?',
    'A friend has one afternoon in Plano. Where would you take them?',
    'What’s something small a neighbor did that you still remember?',
    'If we passed you the speaker, what song would you put on?'
  ]},
  hot:{label:'Hot question',hint:'Friendly debate',heading:'Pick a side.',questions:[
    'Corn tortillas or flour? Make the case for your favorite.',
    'You can keep only one: breakfast tacos or late-night tacos. Which stays?',
    'What food do you think deserves way more credit?',
    'You’re opening a food truck with one dish on the menu. What is it?'
  ]}
};
export function configure(cut){
  const found=cut==='found-tag';
  const invitation=cut==='pass-the-salsa';
  const objects=[
    invitation ? ['Find the host on my tag','Meet my host','quickLookup','lookup']
      : [found?'Turn the keychain in 3D':'Who buys lunch?',found?'Turn tag':'Who pays?',found?'collectorDialog':'sceneDialog',found?'gallery':'lunch'],
    ['Look up the code on your tag','Find host','quickLookup','lookup'],
    ['Text the host linked to your tag','Text host','quickLookup','lookup'],
    ['Explore Classic, Taco and Pizza','See tags','collectorDialog','gallery'],
    ['Pick a question for the table','Table talk','sceneDialog','talk']
  ];
  const bounds=found
    ? [[29,35,73,62,39,24,62,65],[12,29,89,80,34,20,74,91],[9,18,92,84,24,12,96,90],[27,35,72,61,38,23,63,68],[28,35,72,62,39,24,63,67]]
    : [[25,28,77,51,33,16,68,53],[25,30,76,56,34,18,68,60],[28,26,72,67,39,18,63,72],[21,40,79,66,32,36,70,73],[19,39,81,66,31,34,69,73]];
  const allBounds=invitation?salsaBounds:bounds;
  const pins=found?[[.10,.13],[.08,.12],[.08,.18],[.12,.12],[.1,.11]]:
    [[.06,.03],[.09,.02],[.91,.13],[.09,.08],[.06,.05]];
  const tracks=allBounds.map((box,i)=>{
    const [label,hint,dialog,action]=objects[i];
    return {id:cut+'-'+shots[i],label,hint,dialog,action,pin:pins[i],
      frames:[[Math.max(0,readings[i]-.16),...box],[Math.min(lastFrame,readings[i]+2.57),...box]]};
  });
  if(invitation){
    for(const [deck,bounds] of Object.entries(bottleBounds)){
      const {label,hint}=salsaDecks[deck];
      tracks.push({id:cut+'-'+deck,label:'Open '+label.toLowerCase()+' from the salsa bottle',hint,action:'talk',deck,dialog:'sceneDialog',pin:[.5,.16],
        frames:[[readings[4]-.16,...bounds],[lastFrame,...bounds]]});
    }
  }
  return {chapters,sceneAt,makeRoute,mapValue,fps,lastFrame,posterTimes,nextStops,
    album:'assets/'+cut+'/', revision:invitation?'?v=quality-1':'?v=1',
    responsiveMedia:invitation,
    cue:invitation?'See how lunch works':found?'Scroll with the tag':'Scroll down the counter',
    replay:invitation?'Back to your tag':found?'Find it again':'Back to the pizza box',
    tracks, questionDecks:invitation?salsaDecks:undefined};
}
