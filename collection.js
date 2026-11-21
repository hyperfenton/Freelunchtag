const panel = document.getElementById('collection');
const stage = document.getElementById('stage');
const tilt = document.getElementById('tilt');
const flip = document.getElementById('flipTag');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const editions = {
  classic: ['Classic Lightning', '01', 'Classic Lightning tag with a golden bolt and Free Lunch lettering'],
  taco: ['Taco', '02', 'Sunglasses taco giving a shaka above Free Lunch lettering'],
  pizza: ['Pizza', '03', 'Pepperoni slice in sunglasses giving a thumbs-up above Free Lunch lettering']
};
function showBack(back) {
  panel.classList.toggle('flipped', back);
  flip.setAttribute('aria-pressed', String(back));
  document.getElementById('flipLabel').textContent = back ? 'Show front' : 'Flip tag';
  document.getElementById('frontArt').setAttribute('aria-hidden', String(back));
  panel.querySelector('.tag-back').alt = back ? 'Back of a sample tag showing where to scan the QR or find the printed code' : '';
}
for (const button of panel.querySelectorAll('[data-choice]')) {
  button.addEventListener('click', () => {
    const id = button.dataset.choice;
    const [name, count, description] = editions[id];
    panel.dataset.edition = id;
    document.getElementById('frontArt').src = 'assets/collection/' + id + '.webp';
    document.getElementById('frontArt').alt = description;
    document.getElementById('editionName').textContent = name;
    panel.querySelector('.edition-count').textContent = count + ' / 03';
    for (const choice of panel.querySelectorAll('[data-choice]')) choice.setAttribute('aria-pressed',String(choice === button));
    showBack(false);
  });
}
flip.addEventListener('click', () => showBack(!panel.classList.contains('flipped')));
let down = null;
stage.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
stage.addEventListener('pointermove', e => {
  if (reduced.matches || (e.pointerType !== 'mouse' && !down)) return;
  const r = stage.getBoundingClientRect();
  tilt.style.setProperty('--yaw', ((e.clientX-r.left)/r.width-.5)*36-10+'deg');
  tilt.style.setProperty('--pitch', (.5-(e.clientY-r.top)/r.height)*24+'deg');
});
function resetTilt(){tilt.style.removeProperty('--yaw');tilt.style.removeProperty('--pitch');}
stage.addEventListener('pointerup', e => {
  if(down && Math.abs(e.clientX-down[0])>45 && Math.abs(e.clientY-down[1])<40) showBack(!panel.classList.contains('flipped'));
  down=null; resetTilt();
});
stage.addEventListener('pointercancel',()=>{down=null;resetTilt();});
stage.addEventListener('pointerleave',()=>{down=null;resetTilt();});
for(const a of document.querySelectorAll('a[href="#claim"]'))a.addEventListener('click',()=>{if(document.getElementById('step-0').classList.contains('active'))document.getElementById('tagNumber').focus({preventScroll:true});});

const expand = document.getElementById('inspectTag');
const dialog = document.getElementById('collectorDialog');
const mount = document.getElementById('galleryMount');
const placeholder = document.createComment('collectible display position');
panel.before(placeholder);
expand.addEventListener('click',()=>{
  mount.append(panel);
  dialog.showModal();
  document.getElementById('closeGallery').focus();
});
document.getElementById('closeGallery').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{placeholder.after(panel);expand.focus({preventScroll:true});});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
new MutationObserver(()=>{
  const back=panel.classList.contains('flipped');
  stage.setAttribute('aria-label',editions[panel.dataset.edition][0]+(back?', back of the collectible tag':', front of the collectible tag'));
}).observe(panel,{attributes:true,attributeFilter:['class','data-edition']});
for(const button of panel.querySelectorAll('[data-choice]')){
  button.addEventListener('click',()=>{
    const label=panel.querySelector('.display-details');label.classList.remove('graphic-pop');
    requestAnimationFrame(()=>requestAnimationFrame(()=>label.classList.add('graphic-pop')));
  });
}
