// Accessible HTML is the editorial source. Its typography is exposed to the camera as material textures.
import {createEnvironmentType} from './environment-type.js';
const $=selector=>document.querySelector(selector);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const words=element=>{
  if(!element)return '';
  const copy=element.cloneNode(true);
  copy.querySelectorAll('br').forEach(br=>br.replaceWith(' '));
  return copy.textContent.replace(/\s+/g,' ').trim();
};
const paragraphs=selector=>[...document.querySelectorAll(selector)].map(words).filter(Boolean);
function lines(context,text,width){
  const result=[];
  let line='';
  for(const word of text.split(/\s+/)){
    const next=line?line+' '+word:word;
    if(line&&context.measureText(next).width>width){result.push(line);line=word;}
    else line=next;
  }
  if(line)result.push(line);
  return result;
}
const chapters=[
  {id:'hero',material:'crystal',title:'#hero-title',body:'.lede'},
  {id:'lunch',material:'floor',title:'#lunch-title',body:'.lunch-inner p'},
  {id:'hosts',material:'silver',title:'#hosts-title',body:'.hosts-intro'},
  {id:'how',beat:0,material:'floor'},
  {id:'how',beat:1,material:'floor'},
  {id:'how',beat:2,material:'floor'},
  {id:'video',material:'silver',title:'#video-title',body:'.film-grid p'},
  {id:'story',material:'garden',title:'#story-title',body:'.story-grid .prose p'},
  {id:'why',material:'garden',title:'#why-title',body:'.why-inner p'},
  {id:'claim',material:'silver',title:'#step-0 h2'},
  {id:'bonus',material:'garden',title:'#bonus-title',body:'#bonus .prose p'},
  {id:'made-with-love',material:'crystal',title:'.closing p'}
];
// Position the camera relative to each inscription and leave the actual controls on the same plane.
const wide={
  hero:[.278,.48,.014,-.105,-.035,.43],lunch:[.61,.46,.32,-.05,-.024,.58],
  hosts:[.33,.43,.08,.09,-.018,.48],how:[.47,.42,.30,.05,-.037,.59],
  video:[.30,.44,.075,-.08,-.025,.42],story:[.54,.46,.17,-.045,.015,.67],
  why:[.46,.48,.29,.05,-.024,.63],claim:[.29,.45,.10,.08,-.035,.40],
  bonus:[.55,.45,.21,-.05,.012,.60],'made-with-love':[.5,.47,.05,0,-.025,.66]
};
const narrow={
  hero:[.47,.71,.04,-.04,-.032,.84],lunch:[.49,.43,.24,-.03,-.025,.82],
  hosts:[.48,.32,.08,.045,-.016,.82],how:[.47,.39,.23,.03,-.036,.81],
  video:[.48,.22,.08,-.04,-.022,.82],story:[.49,.43,.13,-.025,.012,.83],
  why:[.49,.47,.19,.03,-.012,.83],claim:[.46,.31,.10,.04,-.022,.81],
  bonus:[.49,.43,.14,-.03,.012,.83],'made-with-love':[.50,.43,.035,0,-.026,.85]
};
function typeset(chapter,width,mobile){
  const end=chapter.id==='made-with-love',cover=chapter.id==='hero';
  const article=chapter.beat===undefined?null:document.querySelectorAll('[data-beat]')[chapter.beat];
  const title=words(article?.querySelector('h3')||$(chapter.title));
  let body=article?[words(article.querySelector('p'))]:chapter.body?paragraphs(chapter.body):[];
  let caption=article?'How it works   /   0'+(chapter.beat+1):'';
  if(chapter.id==='bonus')body.push('Wednesday at 6:00 p.m.  ·  Sunday at 9:30 a.m.');
  if(chapter.id==='hosts'&&!body.length)body=['Meet the person inviting you to lunch.'];
  const image=document.createElement('canvas'),ratio=mobile?1.75:1.55;
  const ctx=image.getContext('2d');
  const pad=10,inner=width-pad*2;
  const headingSize=mobile?clamp(width*(cover?.161:end?.196:.145),37,end?80:61):clamp(width*(cover?.155:end?.158:.115),44,end?139:116);
  const bodySize=mobile?clamp(width*.051,16,19.5):clamp(width*.035,18,24);
  const lead=headingSize*.92,bodyLead=bodySize*1.43;
  const headFont='800 '+headingSize+'px "Barlow Condensed", Impact, sans-serif';
  const bodyFont='500 '+bodySize+'px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.font=headFont;
  let headline=cover?['WE WANT TO','BUY YOU LUNCH!']:end?['Made with love','by Meadows.']:lines(ctx,title,inner);
  // Keep the exact title in the field on a narrow phone.
  let actualSize=headingSize;
  for(const line of headline)actualSize=Math.min(actualSize,headingSize*inner/Math.max(1,ctx.measureText(line).width));
  ctx.font=bodyFont;
  const blocks=body.map(p=>lines(ctx,p,inner));
  const captionHeight=caption?bodySize*1.8:0;
  const height=Math.ceil(pad*2+captionHeight+headline.length*lead+(blocks.length?bodySize*1.13:0)
   +blocks.reduce((total,rows)=>total+rows.length*bodyLead,0)+Math.max(0,blocks.length-1)*bodySize*.58+5);
  image.width=Math.ceil(width*ratio);image.height=Math.ceil(height*ratio);
  ctx.scale(ratio,ratio);ctx.textBaseline='alphabetic';
  const left=end?width/2:pad;
  ctx.textAlign=end?'center':'left';
  let top=pad;
  if(caption){
    ctx.font='600 '+Math.max(13,bodySize*.81)+'px ui-monospace, Menlo, monospace';
    ctx.fillStyle='#d3d6ff';ctx.fillText(caption.toUpperCase(),left,top+bodySize);
    top+=captionHeight;
  }
  ctx.font='800 '+actualSize+'px "Barlow Condensed", Impact, sans-serif';
  for(const [i,line] of headline.entries()){
    const gradient=ctx.createLinearGradient(0,top,0,top+lead);
    gradient.addColorStop(0,'#fffbff');gradient.addColorStop(.57,'#f3f1ff');
    gradient.addColorStop(1,cover||end?'#aabdef':'#d9d5ff');
    ctx.fillStyle=gradient;ctx.fillText(line,left,top+lead*.82);
    top+=lead;
  }
  if(blocks.length)top+=bodySize*.68;
  ctx.font=bodyFont;ctx.fillStyle='#fffaff';
  for(const rows of blocks){
    for(const line of rows){ctx.fillText(line,pad,top+bodySize);top+=bodyLead;}
    top+=bodySize*.58;
  }
  return {image,width,height};
}

export async function mountFilmTitles(canvas){
  await document.fonts.load('800 44px "Barlow Condensed"');
  const renderer=createEnvironmentType(canvas);
  if(!renderer)return null;
  let width=0,height=0,anchors=[],atlas=[],current=-1,previous=-1,changed=0;
  function layout(w,h,bounds){
    const resize=w!==width||h!==height;
    width=w;height=h;
    const mobile=w<=680;
    const places=mobile?narrow:wide;
    anchors=chapters.map(ch=>{
      const b=bounds[ch.id];
      if(ch.beat!==undefined)return b.top+(b.bottom-b.top)*[.17,.50,.83][ch.beat]-h*.5;
      return ch.id==='hero'?0:b.center;
    });
    if(resize||!atlas.length){
      atlas=chapters.map(ch=>typeset(ch,Math.round(Math.min(w*places[ch.id][5],mobile?445:920)),mobile));
    }
  }
  function render(pose,scroll,now,still){
    const places=width<=680?narrow:wide;
    let next=0;
    for(let i=1;i<anchors.length;i++){
      if(scroll>(anchors[i-1]+anchors[i])*.5)next=i;
      else break;
    }
    if(next!==current){previous=current;current=next;changed=now;}
    const t=still?1:clamp((now-changed)/510);
    const out=[];
    function add(index,entering){
      if(index<0)return;
      const ch=chapters[index], spec=places[ch.id], source=atlas[index];
      if(ch.id==='claim'&&$('#step-1')?.classList.contains('active'))return;
      if(ch.id==='hosts'&&!$('#hostProfile').hidden)return;
      const travel=clamp((scroll-anchors[index])/height,-1,1);
      const mobile=width<=680;
      const phase=previous<0?t:entering?clamp((t-.40)/.60):clamp(t/.40);
      const ease=phase*phase*(3-2*phase);
      const light=ch.material==='garden'?.52:.41;
      let alpha=entering?ease:1-ease;
      if(ch.id==='made-with-love')alpha*=clamp((pose.bloom-.34)*2.1);
      if(ch.id==='hero')alpha*=still?1:clamp((pose.intro+.07)*3);
      if(alpha<.009)return;
      const maxHeight=height*(ch.id==='story'?.77:ch.id==='hero'?.37:.68);
      const fit=Math.min(1,maxHeight/source.height);
      let y=spec[1]-travel*(mobile?.095:.12);
      if(ch.id==='hero'&&mobile)y=Math.max(.60,Math.min(.74,pose.logoY+.43));
      if(mobile&&ch.id==='video')y=.205-travel*.08;
      const middle={x:spec[0]+(still?0:.005*pose.pointerX),y,
        width:source.width*fit,height:source.height*fit,
        tilt:spec[2]+(still?0:travel*.12),yaw:spec[3]+(still?0:pose.pointerX*.018),roll:spec[4],
        image:source.image,alpha,material:ch.material,
        reveal:still?1:entering?clamp(.16+phase*1.45):1,
        erase:still||entering?0:phase,light};
      out.push(middle);
    }
    if(t<1)add(previous,false);add(current,true);
    renderer.render(pose,out);
  }
  return {layout,render,destroy:()=>renderer.destroy()};
}
