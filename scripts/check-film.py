"""Flag truncated encodes, blackouts and abrupt visual transitions in the shipped take.

Run from any directory with the renderer's OpenCV dependency installed.
Histogram similarity is a regression signal. The camera moves share endpoint frames. Inspect the footage at normal speed as well.
"""
from pathlib import Path
import cv2
import numpy as np

FILM = Path(__file__).resolve().parents[1] / 'assets' / 'film'
for framing, size in [('portrait',(720,1560)), ('wide',(1280,720))]:
    cap = cv2.VideoCapture(str(FILM / f'free-lunch-{framing}.mp4'))
    assert cap.isOpened(), f'Cannot decode {framing}'
    assert cap.get(cv2.CAP_PROP_FPS) == 24
    assert (cap.get(cv2.CAP_PROP_FRAME_WIDTH),cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) == size
    previous = None
    previous_small = None
    count = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame,(size[0]//9,size[1]//9),interpolation=cv2.INTER_AREA)
        assert small.mean() > 30, f'{framing}: dark frame at {count/24:.2f}s'
        hist = cv2.calcHist([small],[0,1,2],None,[8,8,8],[0,256]*3)
        cv2.normalize(hist,hist,1,0,cv2.NORM_L1)
        if previous is not None:
            distance = cv2.compareHist(previous,hist,cv2.HISTCMP_BHATTACHARYYA)
            if distance >= .19:
                # Moving glass can flash across histogram bins while the environment
                # stays aligned. A hard transition also breaks spatial correlation.
                alignment = np.corrcoef(previous_small.ravel(), small.ravel())[0,1]
                assert distance < .28 and alignment > .55, (
                    f'{framing}: inspect adjacent frames at {count/24:.2f}s')
            if count in (120,264,408,552,720):
                assert distance < .09, f'{framing}: unmatched take boundary at {count/24:.2f}s'
        previous_small = small
        previous = hist
        count += 1
    cap.release()
    assert count == 36*24, f'{framing} has {count} decoded frames'
    print(f'{framing}: checked all {count} frames')
