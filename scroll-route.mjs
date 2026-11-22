// Each chapter begins with a camera move and gives its reading frame room to settle.
export const duration=36;
export const fps=24;
export const chapters=[
  {id:'hero',start:0,read:4.82,still:'lift',label:'Read the lunch invitation',span:180},
  {id:'lunch',start:5.05,read:6.65,still:'floor',label:'Read what the invitation covers',span:94},
  {id:'hosts',start:7.25,read:8.52,still:'host',label:'Meet the lunch hosts',span:84},
  {id:'how',start:9.05,read:10.9,still:'broom',label:'Read how to use the tag',span:174},
  {id:'video',start:11.85,read:13.45,still:'toss',label:'Open the original lunch explainer',span:84},
  {id:'story',start:14.7,read:16.75,still:'story',label:'Read the story of the second place setting',span:172},
  {id:'why',start:17.72,read:19.65,still:'why',label:'Read why Meadows buys lunch',span:92},
  {id:'claim',start:21.05,read:22.9,still:'claim',label:'Enter your invitation code',span:106},
  {id:'bonus',start:24.05,read:28.85,still:'visit',label:'View Meadows visiting times',span:140},
  {id:'made-with-love',start:30,read:35.55,still:'close',label:'Read the message in the flowers',span:230}
];
export const lastFrame=(duration*fps-1)/fps;
export function sceneAt(t){
  let i=0;
  while(i+1<chapters.length&&t>=chapters[i+1].start)i++;
  return i;
}
// Stops remain strictly monotone in both directions. Added distance around the
// offer, printed instructions, shared meal and bloom makes a small drag readable.
const pacing=[
  [[0,0],[.36,.72],[.54,2.4],[.73,4.53],[.92,4.92]],
  [[0,5.05],[.43,6.45],[.75,6.82]],
  [[0,7.25],[.68,8.52]],
  [[0,9.05],[.21,10.4],[.47,10.78],[.85,11.14]],
  [[0,11.85],[.62,13.45]],
  [[0,14.7],[.22,16.12],[.78,16.94],[.91,17.18]],
  [[0,17.72],[.64,19.65]],
  [[0,21.05],[.66,22.9]],
  [[0,24.05],[.23,25.25],[.64,28.5],[.85,29.35]],
  [[0,30],[.33,31.22],[.59,34.25],[.83,35.55],[1,lastFrame]]
];
export function makeRoute(tops,end){
  const points=[];
  for(let i=0;i<chapters.length;i++){
    const bottom=tops[i+1]??end;
    for(const [fraction,time] of pacing[i])
      points.push([tops[i]+fraction*(bottom-tops[i]),time]);
  }
  return points;
}
export function mapValue(points,value,inverse=false){
  const a=inverse?1:0,b=1-a;
  if(value<=points[0][a])return points[0][b];
  for(let i=1;i<points.length;i++){
    const right=points[i],left=points[i-1];
    if(value<=right[a]){
      const t=(value-left[a])/(right[a]-left[a]);
      return left[b]+t*(right[b]-left[b]);
    }
  }
  return points.at(-1)[b];
}
