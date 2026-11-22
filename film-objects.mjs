import {readingMoves} from './film-camera.mjs';

// Object bounds measured against the released film. Each row contains the time in
// seconds, then left/top/right/bottom percentages for the portrait and wide masters.
// Travel between the marks is linear. Outside a track the object cannot be tapped.
export const filmObjects = [
  {id: 'plate', label: 'Lift the plate', hint: 'Lift plate', dialog: '', pin: [0.66, 0.85], frames: [
    [0, -9.6, 40.6, 104.2, 74.2, 16.5, 33.3, 80.5, 106.0],
    [1.4, -9.6, 38.9, 104.2, 70.9, 16.5, 29.9, 80.5, 99.2],
    [2.65, -10.4, 35.3, 103.3, 65.4, 16.0, 22.6, 80.0, 87.9],
  ]},
  {id: 'crystal', label: 'Explore the three collectible tags', hint: 'Explore tags', dialog: 'collectorDialog', pin: [0.9, 0.7], frames: [
    [3.75, 11.8, 30.2, 78.4, 54.4, 28.5, 12.2, 66.0, 64.6],
    [5, 12.7, 28.8, 80.2, 53.4, 29.0, 9.5, 67.0, 62.8],
    [6.5, 10.1, 27.5, 77.6, 53.5, 29.0, 3.9, 67.0, 60.2],
    [7, 3.3, 24.2, 81.5, 51.6, 26.0, -4.3, 70.0, 54.9],
    [7.45, -8.1, 9.9, 84.3, 48.4, 20.0, -28.7, 72.0, 46.8],
  ]},
  {id: 'card', label: 'Enter the code on your invitation', hint: 'Enter tag', dialog: 'quickLookup', pin: [0.08, 0.08], frames: [
    [9.5, 72.2, 48.9, 122.5, 61.4, 63.7, 40.3, 92.0, 67.3],
    [10, 50.1, 49.2, 105.8, 61.2, 50.7, 38.2, 82.0, 64.2],
    [10.5, 35.7, 48.8, 95.6, 61.5, 42.4, 36.6, 76.1, 64.1],
    [11.5, 34.3, 48.7, 94.9, 62.4, 41.6, 36.4, 75.7, 66.1],
    [12, 31.5, 52.9, 94.4, 64.6, 40.0, 45.5, 75.4, 70.9],
    [12.5, 37.6, 63.7, 94.5, 75.5, 43.5, 69.1, 75.5, 94.6],
  ]},
  {id: 'tag', label: 'Turn the collectible tag in 3-D', hint: 'Turn tag', dialog: 'collectorDialog', pin: [0.45, 0.18], frames: [
    [9.5, 49.7, 51.1, 71.3, 67.2, 51.0, 45.1, 63.2, 79.9],
    [10, 23.3, 51.2, 48.9, 67.4, 35.6, 42.7, 50.0, 77.7],
    [10.5, 5.7, 50.2, 34.3, 67.0, 25.5, 39.6, 41.6, 76.1],
    [11.5, 1.6, 50.5, 31.5, 67.1, 23.2, 40.3, 40.0, 76.2],
    [12, 0.7, 54.9, 30.8, 71.0, 22.7, 49.9, 39.6, 84.8],
    [12.5, 5.4, 65.3, 35.8, 82.3, 25.4, 72.7, 42.5, 107.2],
  ]},
  {id: 'bowl', label: 'Find out who buys lunch', hint: 'Who buys lunch?', dialog: 'sceneDialog', pin: [0.25, 0.32], frames: [
    [14.9, -34.9, 47.5, 24.6, 60.7, 4.0, 37.6, 37.5, 66.1],
    [15.5, -26.7, 52.5, 35.2, 68.6, 7.7, 49.0, 42.5, 83.9],
    [16.5, -23.9, 52.8, 37.1, 68.9, 7.7, 50.5, 42.0, 85.3],
    [18.5, -25.6, 52.8, 34.9, 69.3, 8.0, 48.1, 42.0, 83.8],
    [19, -32.6, 45.7, 33.6, 62.8, 4.8, 31.5, 42.0, 68.5],
    [19.32, -37.4, 37.7, 30.1, 55.7, 2.5, 13.3, 40.5, 52.4],
  ]},
  {id: 'pail', label: 'Send the glass into the garden', hint: 'Follow the glass', dialog: '', pin: [0.26, 0.55], frames: [
    [20.92, 70.5, 47.1, 124.0, 69.3, 63.7, 32.3, 93.8, 80.3],
    [21.65, 66.3, 42.6, 123.6, 66.2, 61.8, 21.2, 94.0, 72.2],
    [22.5, 65.3, 43.4, 123.0, 66.6, 61.5, 21.7, 94.0, 71.8],
    [23, 63.3, 43.0, 121.4, 66.4, 60.5, 20.6, 93.2, 71.3],
    [24.7, 66.9, 43.3, 125.4, 66.7, 61.7, 20.6, 94.6, 71.3],
    [25.44, 66.1, 41.4, 126.7, 66.0, 60.7, 16.0, 94.8, 69.3],
    [26, 38.5, 37.4, 92.9, 58.7, 44.8, 7.1, 75.4, 53.1],
  ]},
  {id: 'shard', label: 'Grow the garden flowers', hint: 'Grow flowers', dialog: '', pin: [0.19, 0.60], frames: [
    [28.82, -29.6, 46.2, 77.4, 70.6, 4.8, 25.9, 65.0, 78.7],
    [30, -27.1, 46.1, 79.4, 69.6, 5.6, 25.7, 65.5, 76.6],
    [31.5, -28.2, 46.1, 77.6, 69.7, 5.5, 31.8, 65.0, 82.9],
    [32.9, -29.3, 46.4, 73.1, 69.9, 5.4, 38.7, 63.0, 89.5],
  ]},
  {id: 'flowers', label: 'See when to visit Meadows', hint: 'Visit Meadows', dialog: 'sceneDialog', pin: [0.83, 0.99], frames: [
    [34.42, 7.3, 27.4, 91.4, 53.9, 26.0, 5.2, 73.3, 62.6],
    [35, 6.1, 27.9, 92.5, 53.5, 25.3, 9.0, 73.9, 64.5],
    [36, 6.4, 27.9, 92.5, 53.5, 25.5, 9.2, 73.9, 64.7],
  ]},
]

// The poster filenames are shared with the reduced-motion and loading views.
export const posterTimes = {
  lift: 0, floor: 6.65, host: 8.52, broom: 10.9, toss: 13.45, story: 16.75,
  why: 19.65, claim: 22.9, visit: 29.85, close: 35.95
};

export function mediaFrame(width, height, wide, fit) {
  const w = wide ? 1280 : 720;
  const h = wide ? 720 : 1560;
  const scale = fit === 'contain' ? Math.min(width / w, height / h) : Math.max(width / w, height / h);
  return {width, height, w: w * scale, h: h * scale, x: (width - w * scale) / 2, y: (height - h * scale) / 2, wide};
}

function visibleAxis(a, b, offset, size, viewport) {
  const min = Math.max(0, offset);
  const max = Math.min(viewport, offset + size);
  const left = Math.max(min, offset + a * size / 100);
  const right = Math.min(max, offset + b * size / 100);
  if (right - left < 10) return null;
  const hitSize = Math.min(max - min, Math.max(44, right - left));
  const start = Math.max(min, Math.min(max - hitSize, (left + right - hitSize) / 2));
  return [start, hitSize];
}

export function objectBounds(track, time, frame) {
  const marks = track.frames;
  if (time < marks[0][0] || time > marks.at(-1)[0]) return null;
  const index = marks.findIndex(row => row[0] >= time);
  const left = marks[Math.max(0, index - 1)], right = marks[index];
  const blend = left === right ? 0 : (time - left[0]) / (right[0] - left[0]);
  const offset = frame.wide ? 5 : 1;
  const move = readingMoves.find(({seconds:[start,,,end]}) => time > start && time < end);
  let zoom = 1;
  let pivot = [0,0];
  if (move) {
    const [start,settle,leave,end] = move.seconds;
    const phase = Math.min(1, (time-start)/(settle-start), (end-time)/(end-leave));
    zoom += (move.scale-1) * (1-Math.cos(Math.PI*phase))/2;
    pivot = frame.wide ? move.wide : move.portrait;
  }
  const at = i => {
    const value = left[offset+i] + (right[offset+i] - left[offset+i]) * blend;
    const centre = 100 * pivot[i%2];
    return centre + zoom * (value-centre);
  };
  const x = visibleAxis(at(0), at(2), frame.x, frame.w, frame.width);
  const y = visibleAxis(at(1), at(3), frame.y, frame.h, frame.height);
  return x && y ? {x:x[0], y:y[0], width:x[1], height:y[1]} : null;
}

export function mountFilmObjects(layer, activate) {
  let press;
  layer.addEventListener('pointerdown', event => {
    press = {id:event.pointerId, x:event.clientX, y:event.clientY, dragged:false};
  });
  layer.addEventListener('pointermove', event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX-press.x, event.clientY-press.y) > 9) press.dragged = true;
  });
  layer.addEventListener('pointercancel', () => { if (press) press.dragged = true; });
  const buttons = filmObjects.map(track => {
    const button = document.createElement('button');
    button.type = 'button';
    button.hidden = true;
    button.className = 'film-object';
    button.dataset.object = track.id;
    button.setAttribute('aria-label', track.label);
    if (track.dialog) {
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', track.dialog);
    }
    const pin = document.createElement('span');
    pin.className = 'film-pin';
    pin.setAttribute('aria-hidden','true');
    pin.style.left = track.pin[0]*100 + '%';
    pin.style.top = track.pin[1]*100 + '%';
    const hint = document.createElement('span');
    hint.className = 'film-pin-label';
    hint.textContent = track.hint;
    pin.append(hint);
    button.append(pin);
    button.addEventListener('click', event => {
      if (event.detail === 0 || !press?.dragged) activate(track, button, lastTime);
      press = null;
    });
    layer.append(button);
    return {track, button, pin};
  });
  let frame, lastTime;
  return {
    measure(wide, fit) {
      const rect = layer.getBoundingClientRect();
      frame = mediaFrame(rect.width, rect.height, wide, fit);
      const t = lastTime;
      lastTime = undefined;
      if (t !== undefined) this.show(t);
    },
    show(time) {
      if (!frame || lastTime === time) return;
      lastTime = time;
      for (const {track, button, pin} of buttons) {
        const box = objectBounds(track, time, frame);
        if (!box) {
          if (!button.hidden) button.hidden = true;
          continue;
        }
        button.style.transform = 'translate(' + box.x + 'px,' + box.y + 'px)';
        button.style.width = box.width + 'px';
        button.style.height = box.height + 'px';
        pin.classList.toggle('label-left', box.x + box.width * track.pin[0] > frame.width / 2);
        button.hidden = false;
      }
    }
  };
}
