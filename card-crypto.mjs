// Capability-based static invitations. Never put plaintext card secrets in this repository.
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const normalizeCode=value=>String(value).toUpperCase().replace(/[\s-]/g,'');
export async function lookupId(secret) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('flt-lookup-v1:'+secret)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function key(secret,salt) {
  const material=await crypto.subtle.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(secret,payload) {
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret,salt),enc.encode(JSON.stringify(payload)));
  return {id:await lookupId(secret),salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(data))};
}
export async function open(secret,lock) {
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(lock.iv)},await key(secret,bytes(lock.salt)),bytes(lock.data));
  return JSON.parse(new TextDecoder().decode(plain));
}
