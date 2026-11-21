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

function setTheme(value) {
  root.dataset.theme = value === 'dark' ? 'dark' : 'light';
  const action = root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  byId('themeToggle').setAttribute('aria-label', action);
  byId('themeToggle').title = action;
}
setTheme(readPreference('lunch-theme') || 'light');
byId('themeToggle').addEventListener('click', () => {
  setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  savePreference('lunch-theme', root.dataset.theme);
});

function setMotion() {
  const paused = systemMotion.matches || readPreference('lunch-pause') === 'yes';
  root.dataset.motion = paused ? 'off' : 'on';
  const control = byId('motionToggle');
  control.disabled = systemMotion.matches;
  control.firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
  const label = systemMotion.matches ? 'Reduced motion enabled on this device' : paused ? 'Resume animation' : 'Pause animation';
  control.title = label;
  control.setAttribute('aria-label', label);
  control.setAttribute('aria-pressed', String(paused));
  stage.dispatchEvent(new Event('motionchange'));
  requestScrollFrame();
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
  requestScrollFrame();
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

  expand.focus({ preventScroll: true });
  requestScrollFrame();
});

// Native anchors and scrolling remain available with motion paused or graphics disabled.
document.querySelectorAll('a[href="#claim"]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash !== '#claim') history.pushState(null, '', '#claim');
    byId('claim').scrollIntoView({behavior:'instant'});
    const target = byId('step-0').classList.contains('active') ? byId('tagNumber') : byId('resultHeading');
    target.focus({ preventScroll: true });
  });
});
const hero = byId('hero');
const demo = document.querySelector('.demonstration');
const rows = [...document.querySelectorAll('[data-beat]')];
const compact = matchMedia('(max-width: 680px)');
let frame = 0;
let howVisible = false;
function requestScrollFrame() {
  if (!frame) frame = requestAnimationFrame(updateScroll);
}
function updateScroll() {
  frame = 0;
  document.body.classList.toggle('past-opening', hero.getBoundingClientRect().bottom < innerHeight * .42);
  if (howVisible) {
    const guide = innerHeight * (compact.matches ? .59 : .44);
    const current = rows.reduce((choice, row) => row.getBoundingClientRect().top < guide ? row : choice, rows[0]);
    demo.dataset.moment = current.dataset.beat;
  }
}
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.target === byId('how')) howVisible = entry.isIntersecting;

  }
  requestScrollFrame();
});
observer.observe(byId('how'));
const arrivals = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      entry.target.classList.add('arrived');
      arrivals.unobserve(entry.target);
    }
  }
}, { threshold: .12 });
document.querySelectorAll('main > .section').forEach(section => arrivals.observe(section));
addEventListener('scroll', requestScrollFrame, { passive:true });
addEventListener('resize', requestScrollFrame);
setMotion();
stage.addEventListener('pointermove', event => {
  if (root.dataset.motion === 'off' || event.pointerType !== 'mouse') return;
  const bounds = stage.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  stage.style.setProperty('--glint-x', (x * 100).toFixed(1) + '%');
  stage.style.setProperty('--glint-y', (y * 100).toFixed(1) + '%');
  stage.style.setProperty('--glint', '.65');
  stage.style.setProperty('--table-x', ((x - .5) * -12).toFixed(1) + 'px');
  stage.style.setProperty('--tilt-y', ((x - .5) * 55 - 10).toFixed(1) + 'deg');
  stage.style.setProperty('--tilt-x', ((.5 - y) * 28).toFixed(1) + 'deg');
});
stage.addEventListener('pointerleave', () => {
  for (const name of ['--glint', '--table-x', '--tilt-y', '--tilt-x']) stage.style.removeProperty(name);
});

// The side tag carries the same lookup as the printed QR. Keep the viewer's place on the floor.
const quickTrigger = byId('quickTag');
const lookupDialog = byId('quickLookup');
const ticket = document.querySelector('.ticket');
const ticketHome = document.createComment('invitation lookup position');
ticket.before(ticketHome);
quickTrigger.addEventListener('click', () => {
  byId('lookupMount').append(ticket);
  lookupDialog.showModal();
  const focusTarget = byId('step-1').classList.contains('active') ? byId('resultHeading') : byId('tagNumber');
  focusTarget.focus({preventScroll:true});
});
byId('closeLookup').addEventListener('click', () => lookupDialog.close());
lookupDialog.addEventListener('close', () => {
  ticketHome.after(ticket);
  quickTrigger.focus({preventScroll:true});
});
lookupDialog.addEventListener('click', e => {
  if(e.target===lookupDialog) lookupDialog.close();
});
