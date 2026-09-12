import {normalizeCode,lookupId,open} from './card-crypto.mjs';
let hosts=[],cards=[],loaded=false,loading,failures=0,lockUntil=0,requestVersion=0;
const $=id=>document.getElementById(id);
const safePhoto=url=>typeof url==='string' && (/^hosts\/[a-z0-9-]+\.(jpg|png|webp)$/i.test(url)||/^https:\/\//.test(url))?url:'';
window.scrollToSection=id=>$(id)?.scrollIntoView({behavior:'smooth'});
window.toggleTheme=()=>{document.body.dataset.theme=document.body.dataset.theme==='dark'?'light':'dark';};
window.goToStep=step=>{document.querySelectorAll('.claim-step').forEach(s=>s.classList.remove('active'));$('step-'+step)?.classList.add('active');};
function face(host){const box=document.createElement('div');box.className='host-face';const photo=safePhoto(host.photo);if(photo){const img=document.createElement('img');img.src=photo;img.alt=host.firstName;img.loading='lazy';img.onerror=()=>{box.textContent=host.firstName[0];};box.append(img);}else box.textContent=host.firstName[0];return box;}
function stats(host){const list=cards.filter(c=>c.hostId===host.id);return {completed:list.filter(c=>c.status==='completed').length,scheduled:list.filter(c=>c.status==='scheduled').length,available:list.filter(c=>['active','handed_out'].includes(c.status)&&c.contactReady).length,claimed:list.filter(c=>['scheduled','completed'].includes(c.status)).length};}
function statusText(s){return s.completed?`${s.completed} ${s.completed===1?'lunch':'lunches'} shared 🍔`:s.scheduled?'Our first lunch is coming up!':'Lunch is coming soon!';}
function renderHosts(){if(!hosts.length){document.querySelector('.hosts-intro').textContent='Our lunch host introductions are coming soon.';$('hostsNotice').textContent='Invitations are not available to claim yet. Please check back soon.';}const grid=$('hostsGrid');grid.replaceChildren();for(const h of hosts){const s=stats(h),button=document.createElement('button');button.className='host-tile';button.type='button';button.setAttribute('aria-label',`Meet ${h.firstName}`);button.append(face(h));const name=document.createElement('strong');name.textContent=h.firstName;button.append(name);const label=document.createElement('span');label.className='host-status';label.textContent=statusText(s);button.append(label);if(s.available){const n=document.createElement('span');n.className='host-available';n.textContent=`${s.available} invitations still open`;button.append(n);}button.onclick=()=>showProfile(h,button);grid.append(button);}const total=cards.filter(c=>c.status==='completed').length;document.querySelector('.proof-text').textContent=total?`${total} ${total===1?'lunch':'lunches'} shared with our neighbors`:'Our first lunches are coming soon!';}
function showProfile(h,trigger){const box=$('hostProfile');box.replaceChildren();box.hidden=false;const close=document.createElement('button');close.className='profile-close';close.textContent='Close ×';close.onclick=()=>{box.hidden=true;trigger.focus();};box.append(close,face(h));const title=document.createElement('h3');title.textContent=`Meet ${h.firstName}`;title.tabIndex=-1;box.append(title);for(const t of [h.bio,statusText(stats(h)),stats(h).claimed?`${stats(h).claimed} invitations claimed · Confirmed by the host`:null]){if(!t)continue;const p=document.createElement('p');p.textContent=t;box.append(p);}const btn=document.createElement('button');btn.className='btn-secondary';btn.textContent='I HAVE A CARD';btn.onclick=()=>{window.scrollToSection('claim');$('tagNumber').focus({preventScroll:true});};box.append(btn);box.scrollIntoView({behavior:'smooth',block:'nearest'});title.focus({preventScroll:true});}
async function load(){if(loaded)return;if(loading)return loading;loading=(async()=>{const [h,c]=await Promise.all([fetch('data/hosts.json',{cache:'no-cache'}),fetch('data/cards.json',{cache:'no-cache'})]);if(!h.ok||!c.ok)throw Error('Could not load invitations');hosts=(await h.json()).hosts;cards=(await c.json()).cards;loaded=true;renderHosts();})();try{await loading;}finally{loading=null;}}
function error(message){$('tagError').textContent=message;$('tagError').classList.remove('hidden');window.goToStep(0);}
window.checkTag=async function(secret,kind){const version=++requestVersion;const btn=document.querySelector('#step-0 .btn-submit');
  if(Date.now()<lockUntil){error('Please wait a minute before trying another code.');return;}
  $('tagError').classList.add('hidden');btn.disabled=true;btn.textContent='CHECKING YOUR INVITATION…';
  try {await load();if(version!==requestVersion)return;const raw=typeof secret==='string'?secret:$('tagNumber').value;const isQR=kind==='qr',code=isQR?raw:normalizeCode(raw);
    if(!(isQR?/^[A-Za-z0-9_-]{32}$/:/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/).test(code))throw Error('Check the 12-character code printed on your card.');
    const id=await lookupId(code),card=cards.find(c=>c.locks?.[isQR?'qr':'code']?.id===id);
    if(!card||!['active','handed_out','requested','scheduled','completed'].includes(card.status)||!card.contactReady)throw Error('This invitation is not available yet. Check the code, or ask the person who gave you the card to activate it.');
    const payload=await open(code,card.locks[isQR?'qr':'code']);if(version!==requestVersion)return;
    const host=hosts.find(h=>h.id===payload.hostId);
    if(!host||payload.ref!==card.ref||!/^1?\d{10}$/.test(payload.phone))throw Error('Please ask your host to check this invitation.');
    failures=0;$('activatorName').textContent=host.firstName;$('activatorPhone').textContent=payload.phone;$('activatorNote').textContent=host.bio;$('activatorNote').classList.remove('hidden');
    const avatar=face(host);$('activatorAvatar').replaceChildren(...avatar.childNodes);
    const text=$('textButton');text.href=`sms:${payload.phone}?body=${encodeURIComponent(`Hey ${host.firstName}! I received your Free Lunch Tag (${card.ref}). When would be a good time to meet?`)}`;
    text.removeAttribute('aria-disabled');$('lookupStatus').textContent=card.status==='completed'?'This invitation has already been used. You can still get in touch with your host.':card.status==='scheduled'?'Your host has marked this lunch as scheduled. Text them to confirm the details.':'Text your host to agree on a place and time. Your lunch is confirmed together.';
    window.goToStep(1);window.scrollToSection('claim');
  }catch(e){if(version!==requestVersion)return;if(++failures>=5){lockUntil=Date.now()+60000;failures=0;}error(e.message||'Please try again.');}
  finally{if(version===requestVersion){btn.disabled=false;btn.textContent='FIND MY LUNCH HOST →';}}
};
$('preloader')?.classList.add('hidden');
$('tagNumber').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();window.checkTag();}});
load().catch(()=>{$('hostsNotice').textContent='We couldn’t load the lunch hosts. Please refresh to try again.';});
const token=window.__lunchTag;delete window.__lunchTag;
if(token){window.scrollToSection('claim');window.checkTag(token,'qr');}
