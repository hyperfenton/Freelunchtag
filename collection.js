const byId = id => document.getElementById(id);
const root = document.documentElement;
const panel = byId('collection');
const stage = byId('stage');
const dialog = byId('collectorDialog');
const expand = byId('inspectTag');


const editions = [
  { id: 'classic', name: 'Classic Lightning' },
  { id: 'taco', name: 'Taco' },
  { id: 'pizza', name: 'Pizza' }
];
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
let selected = 0;
let reversed = false;
let neighborButtons = [];

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ }
}

function setMotion() {
  const paused = systemMotion.matches || readPreference('lunch-pause') === 'yes';
  root.dataset.motion = paused ? 'off' : 'on';
  const control = byId('motionToggle');
  control.disabled = systemMotion.matches;
  control.textContent = paused ? 'Resume motion' : 'Pause motion';
  const label = systemMotion.matches ? 'Reduced motion enabled on this device' : paused ? 'Resume animation' : 'Pause animation';
  control.title = label;
  control.setAttribute('aria-label', label);
  control.setAttribute('aria-pressed', String(paused));
  stage.dispatchEvent(new Event('motionchange'));

}
byId('motionToggle').addEventListener('click', () => {
  savePreference('lunch-pause', root.dataset.motion === 'on' ? 'yes' : 'no');
  setMotion();
});
systemMotion.addEventListener('change', setMotion);

function flip(back) {
  reversed = back;
  panel.classList.toggle('flipped', back);
  byId('flipTag').setAttribute('aria-pressed', String(back));
  byId('flipLabel').textContent = back ? 'Show front' : 'Flip tag';
  stage.setAttribute('aria-pressed', String(back));
  stage.setAttribute('aria-label', editions[selected].name + (back ? ', back of the collectible tag' : ', front of the collectible tag'));
  stage.dispatchEvent(new Event('posechange'));
}
byId('flipTag').addEventListener('click', () => flip(!reversed));
stage.setAttribute('aria-pressed', 'false');
stage.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    flip(!reversed);
  }
});
let press;
stage.addEventListener('pointerdown', event => {
  if (event.button === 0) press = [event.clientX, event.clientY];
});
stage.addEventListener('pointercancel', () => { press = null; });
stage.addEventListener('pointerup', event => {
  if (press && Math.hypot(event.clientX - press[0], event.clientY - press[1]) < 7) flip(!reversed);
  press = null;
});

function updateNeighbors() {
  neighborButtons.forEach(({ button, step }) => {
    const edition = editions[(selected + step + editions.length) % editions.length];
    button.firstElementChild.src = 'assets/collection/' + edition.id + '.webp';
    button.setAttribute('aria-label', 'Choose ' + edition.name);
  });
}
function choose(index, direction = 1) {
  if (selected === index) return;
  selected = index;
  const edition = editions[index];
  panel.dataset.edition = edition.id;
  byId('editionName').textContent = edition.name;
  panel.querySelector('.edition-count').textContent = '0' + (index + 1) + ' / 03';
  byId('frontArt').src = 'assets/collection/' + edition.id + '.webp';
  panel.querySelectorAll('[data-choice]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.choice === edition.id));
  });
  panel.style.setProperty('--from', direction > 0 ? '14%' : '-14%');
  panel.classList.remove('changing');
  void panel.offsetWidth;
  panel.classList.add('changing');
  flip(false);
  updateNeighbors();
  stage.dispatchEvent(new Event('editionchange'));
}
function adjacent(step) { choose((selected + step + editions.length) % editions.length, step); }
panel.querySelectorAll('[data-choice]').forEach((button, index) => {
  button.addEventListener('click', () => choose(index, index >= selected ? 1 : -1));
});
function galleryClose() { dialog.close(); }
expand.addEventListener('click', () => {
  byId('filmOptions').open=false;

  neighborButtons = [-1, 1].map(step => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'neighbor ' + (step < 0 ? 'prev' : 'next');
    const image = new Image();
    image.alt = '';
    button.append(image);
    button.addEventListener('click', () => adjacent(step));
    panel.insertBefore(button, panel.querySelector('.collector-controls'));
    return { button, step };
  });
  updateNeighbors();
  dialog.showModal();

  byId('closeGallery').focus();

});
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    adjacent(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
byId('closeGallery').addEventListener('click', galleryClose);
dialog.addEventListener('cancel', event => { event.preventDefault(); galleryClose(); });
dialog.addEventListener('click', event => { if (event.target === dialog) galleryClose(); });
dialog.addEventListener('close', () => {
  neighborButtons.forEach(({ button }) => button.remove());
  neighborButtons = [];

  byId('filmOptions').querySelector('summary').focus({preventScroll:true});

});

setMotion();
// The side tag carries the same lookup as the printed QR. Keep the viewer's place on the floor.
const quickTrigger = byId('quickTag');
const lookupDialog = byId('quickLookup');
const ticket = document.querySelector('.ticket');
const ticketHome = document.createComment('invitation lookup position');
ticket.before(ticketHome);
quickTrigger.addEventListener('click', () => {
  if(lookupDialog.open)return;
  byId('filmOptions').open=false;
  byId('lookupMount').append(ticket);
  lookupDialog.showModal();
  const focusTarget = byId('step-1').classList.contains('active') ? byId('resultHeading') : byId('tagNumber');
  focusTarget.focus({preventScroll:true});
});
byId('closeLookup').addEventListener('click', () => lookupDialog.close());
lookupDialog.addEventListener('close', () => {
  // A QR can reopen the sheet before the previous close event is delivered.
  if(lookupDialog.open)return;
  ticketHome.after(ticket);
  if(location.hash==='#claim' && document.documentElement.classList.contains('projecting')) document.getElementById('cinema').dataset.returned='true';
  quickTrigger.focus({preventScroll:true});
});
lookupDialog.addEventListener('click', e => {
  if(e.target===lookupDialog) lookupDialog.close();
});
