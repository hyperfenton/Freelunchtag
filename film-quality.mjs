// Select before attaching a video URL: a capability check never downloads media.
// The 4K export is H.264 High, level 5.1, 24 fps, capped at 18 Mbps.
export const fourKConfiguration = Object.freeze({
  type: 'file',
  video: Object.freeze({
    contentType: 'video/mp4; codecs="avc1.640033"',
    width: 3840, height: 2160, bitrate: 18000000, framerate: 24
  })
});

function renderedWidth(width, height, wide, fit) {
  const ratio = wide ? 16 / 9 : 6 / 13;
  return fit === 'contain' ? Math.min(width, height * ratio) : Math.max(width, height * ratio);
}

function fastTransfer(transfer) {
  if (!transfer || transfer.transferSize < 256 * 1024) return false;
  const milliseconds = transfer.responseEnd - transfer.responseStart;
  return Number.isFinite(milliseconds) && milliseconds >= 20 &&
    transfer.transferSize * 8 / (milliseconds * 1000) >= 27;
}

export async function selectFilmQuality({
  wide, width, height, pixelRatio = 1, fit = 'cover', preference = 'auto',
  connection, decodingInfo, posterTransfer, timeoutMs = 400
}) {
  const pixels = renderedWidth(width, height, wide, fit) * pixelRatio;
  const baseline = wide || pixels > 720 ? 'hd' : '720';
  if (connection?.saveData === true) return '720';
  if (preference === 'hd') return 'hd';
  const forced = preference === '4k' && wide;
  if (!forced && (['slow-2g', '2g', '3g'].includes(connection?.effectiveType) ||
    (Number.isFinite(connection?.downlink) && connection.downlink > 0 && connection.downlink < 4))) return '720';
  if (!wide) return baseline;
  if (!forced && (width < 1280 || pixels < 2560)) return baseline;
  if (typeof decodingInfo !== 'function') return baseline;

  let expired = false, timer;
  const decision = async () => {
    if (!forced && !(Number.isFinite(connection?.downlink) && connection.downlink >= 27)) {
      let transfer;
      try { transfer = await posterTransfer; } catch { return baseline; }
      if (expired || !fastTransfer(transfer)) return baseline;
    }
    if (expired) return baseline;
    try {
      const capability = await decodingInfo(fourKConfiguration);
      return capability?.supported && capability.smooth && (forced || capability.powerEfficient) ? '4k' : baseline;
    } catch { return baseline; }
  };
  try {
    return await Promise.race([
      decision(),
      new Promise(resolve => { timer = setTimeout(() => { expired = true; resolve(baseline); }, timeoutMs); })
    ]);
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}

export function filmFilename(wide, quality) {
  const aspect = wide ? 'wide' : 'portrait';
  return 'free-lunch-' + aspect + (quality === '720' ? '-720' : wide && quality === '4k' ? '-4k' : '') + '.mp4';
}

export function filmPosterSources(album, shot, revision) {
  return {
    wide: [
      ['-wide-720', 1280], ['-wide', 1920], ['-wide-4k', 3840]
    ].map(([suffix, width]) => `${album}film-${shot}${suffix}.webp${revision} ${width}w`).join(', '),
    portrait: [
      ['-720', 720], ['', 1080]
    ].map(([suffix, width]) => `${album}film-${shot}${suffix}.webp${revision} ${width}w`).join(', ')
  };
}
