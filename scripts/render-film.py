"""Rebuild the two web framings from the six original Higgsfield camera moves.

Requires Python 3, OpenCV, Pillow, and FFmpeg with libx264. Run from any directory.
The archival takes use shared end/start photographs and include both endpoints.
"""
import argparse
import json
import math
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image

from inscriptions import FilmInscriptions

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'film-source'
OUTPUT = ROOT / 'assets' / 'film'
FPS = 24
TAKES = [
    ('01-plate', 5), ('02-invitation', 6), ('03-second-place', 6),
    ('04-sweep', 6), ('05-threshold', 7), ('06-bloom', 6)
]
POSTERS = {round(time * FPS): name for name, time in [
    ('lift', 0), ('shatter', 3.72), ('emblem', 4.92), ('floor', 6.65),
    ('host', 8.52), ('broom', 10.90), ('toss', 13.45), ('story', 16.75),
    ('why', 19.65), ('claim', 22.90), ('visit', 29.85), ('close', 35.95)
]}
# Time, horizontal centre in portrait, vertical centre in landscape. Let the
# composition drift from the note to the tag, the low dustpan and finally the stems.
FRAMING = [(0, .50, .48), (5, .50, .47), (8, .53, .50), (10.4, .504, .56),
           (12.2, .504, .56), (14.4, .52, .54), (17, .49, .53),
           (20, .52, .56), (23, .53, .58), (27, .51, .59),
           (30, .49, .59), (33, .50, .52), (35.2, .50, .46), (36, .50, .46)]


def centre(t, axis):
    for left, right in zip(FRAMING, FRAMING[1:]):
        if t <= right[0]:
            phase = (t - left[0]) / (right[0] - left[0])
            blend = (1 - math.cos(math.pi * phase)) / 2
            return left[axis] + (right[axis] - left[axis]) * blend
    return FRAMING[-1][axis]


def render(mode):
    portrait = mode == 'portrait'
    w, h = (720, 1560) if portrait else (1280, 720)
    if portrait:
        # The centre of the phone frame retains the camera's perspective. Gradually
        # extend the upper/lower field into tall screens so lettering stays in shot.
        base_height = 1280
        extra = (h - base_height) / 2
        edge = 420
        y = np.arange(h, dtype=np.float32)
        y = (y - extra
             + extra * np.maximum(0, 1-y/edge)**2
             - extra * np.maximum(0, 1-(h-1-y)/edge)**2)
        phone_x, phone_y = np.meshgrid(np.arange(w, dtype=np.float32), y)

    movie = OUTPUT / f'free-lunch-{mode}.mp4'
    staging = movie.with_suffix('.new.mp4')
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
               '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}',
               '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libx264',
               '-threads', '3', '-preset', 'fast', '-crf', '20', '-maxrate',
               '2900k' if portrait else '3700k', '-bufsize', '5500k', '-g', '6',
               '-keyint_min', '6', '-sc_threshold', '0', '-bf', '0', '-vf',
               'scale=out_color_matrix=bt709', '-pix_fmt', 'yuv420p', '-colorspace',
               'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
               '-movflags', '+faststart', str(staging)]
    # The browser uses these exact camera moves when projecting the tap regions.
    camera_module = (ROOT / 'film-camera.mjs').read_text()
    reading_moves = json.loads(camera_module.split('export const readingMoves =', 1)[1].strip().removesuffix(';'))
    inscriptions = FilmInscriptions()
    frame_number = 0
    with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
        for name, seconds in TAKES:
            reader = cv2.VideoCapture(str(SOURCE / (name + '.mp4')))
            try:
                assert reader.isOpened() and reader.get(cv2.CAP_PROP_FPS) == FPS, name
                count = seconds * FPS
                assert int(reader.get(cv2.CAP_PROP_FRAME_COUNT)) == count + 1, name
                for local in range(count):
                    ok, frame = reader.read()
                    if not ok:
                        raise ValueError(f'Cannot read {name}, frame {local}')
                    inscriptions.apply(frame, name, local)
                    side = frame.shape[0]
                    assert frame.shape[1] == side
                    crop = round(side * 9 / 16)
                    origin = round(centre(frame_number / FPS, 1 if portrait else 2) * side - crop / 2)
                    origin = max(0, min(side - crop, origin))
                    view = frame[:, origin:origin+crop] if portrait else frame[origin:origin+crop, :]
                    if portrait:
                        composed = cv2.remap(view, (phone_x+.5)*(crop/w)-.5,
                                             (phone_y+.5)*(side/base_height)-.5,
                                             cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
                    else:
                        composed = cv2.resize(view, (w, h), interpolation=cv2.INTER_CUBIC)
                    time = frame_number / FPS
                    for move in reading_moves:
                        start, settle, leave, end = move['seconds']
                        if not start < time < end:
                            continue
                        phase = min(1, (time-start)/(settle-start), (end-time)/(end-leave))
                        zoom = 1 + (move['scale']-1) * (1-math.cos(math.pi*phase))/2
                        px, py = move[mode]
                        lens = cv2.getRotationMatrix2D((px*w, py*h), 0, zoom)
                        composed = cv2.warpAffine(composed,lens,(w,h),flags=cv2.INTER_CUBIC,
                                                  borderMode=cv2.BORDER_REPLICATE)
                    encoder.stdin.write(composed.tobytes())
                    if frame_number in POSTERS:
                        stem = 'film-' + POSTERS[frame_number] + ('' if portrait else '-wide')
                        Image.fromarray(composed[:, :, ::-1]).save(OUTPUT / (stem + '.webp'), quality=87)
                    frame_number += 1
            finally:
                reader.release()
        encoder.stdin.close()
        if encoder.wait() != 0:
            raise RuntimeError('FFmpeg could not encode ' + mode)
    staging.replace(movie)
    print(f'{movie.name}: {frame_number} frames')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--framing', choices=['portrait', 'wide', 'both'], default='both')
    args = parser.parse_args()
    cv2.setNumThreads(2)
    for name in (['portrait', 'wide'] if args.framing == 'both' else [args.framing]):
        render(name)
