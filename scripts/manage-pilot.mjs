import fs from 'node:fs';
const action=process.env.ACTION,host=process.env.HOST_ID,selection=process.env.CARD_REFS||'all';
const status=process.env.STATUS,date=process.env.LUNCH_DATE||'';
const file='data/cards.json',data=JSON.parse(fs.readFileSync(file,'utf8'));
if(!['activate','handed_out','requested','scheduled','completed','deactivate'].includes(action))throw Error('Unknown action');
if(!JSON.parse(fs.readFileSync('data/hosts.json','utf8')).hosts.some(h=>h.id===host))throw Error('Unknown host');
const refs=selection==='all'?null:selection.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
if(refs && (refs.length>80 || refs.some(r=>!data.cards.some(c=>c.ref===r&&c.hostId===host))))throw Error('Every card reference must belong to the selected host');
const selected=data.cards.filter(c=>c.hostId===host && (!refs||refs.includes(c.ref)));
const target={activate:'active',deactivate:'inactive',handed_out:'handed_out',requested:'requested',scheduled:'scheduled',completed:'completed'}[action];
if(target==='scheduled' && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))throw Error('A valid lunch date is required');
if(['requested','scheduled','completed'].includes(target) && !refs)throw Error('Select the specific card references for actual lunches; do not use all');
if(target!=='inactive' && selected.some(c=>!c.contactReady))throw Error('Add encrypted host contact details before activating cards');
if(target==='active' && selected.some(c=>['requested','scheduled','completed'].includes(c.status)))throw Error('A requested or used card cannot be reactivated in bulk');
for(const c of selected){
  c.status=target;
  c.scheduledFor=target==='scheduled'?date:(target==='completed'?c.scheduledFor||'':'');
  c.completedAt=target==='completed'?new Date().toISOString():'';
  c.updatedAt=new Date().toISOString();
}
data.updatedAt=new Date().toISOString();
fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
console.log(`Updated ${selected.length} cards for ${host}: ${target}. No card codes or phone numbers are logged.`);
