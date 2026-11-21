"""Track foil lettering on glass and a printed instruction on the invitation."""
from pathlib import Path

import cv2
import numpy as np

ART = Path(__file__).resolve().parents[1] / 'film-source'

# At each frame, the left and right ends of the inscription's centre line are
# marked on the glass, followed by its projected height. The garden track spans
# the turn of the fragment, its landing and the pullback from the growing stem.
# The plate is front-facing. Offsets follow the baseline of “on me.” as it lifts.
PLATE_Y = [(0,0),(8,1),(16,2),(24,4),(32,4),(40,3),(44,1),(48,-4),
           (52,-9),(56,-17),(60,-27),(64,-34),(67,-41),(69,-43)]
PLATE = [(n,325,614+dy,637,611+dy,24) for n,dy in PLATE_Y]
SHARD = [
    (132, 377, 626, 509, 436, 7), (134, 350, 647, 555, 485, 34),
    (136, 363, 639, 596, 511, 55), (138, 371, 640, 604, 542, 60),
    (140, 360, 625, 601, 563, 57), (142, 318, 618, 577, 555, 64),
    (144, 274, 600, 549, 524, 67), (148, 258, 582, 532, 497, 68),
    (152, 251, 567, 520, 496, 65), (157, 255, 554, 525, 486, 64),
    (163, 266, 551, 532, 482, 64), (168, 267, 550, 535, 481, 64),
    (184, 267, 550, 535, 481, 64), (200, 267, 550, 535, 481, 64),
    (208, 269, 564, 526, 497, 61), (216, 269, 588, 510, 525, 57),
    (224, 268, 618, 493, 559, 53), (232, 265, 647, 474, 592, 50),
    (240, 257, 665, 453, 614, 47), (248, 256, 678, 444, 629, 45),
    (264, 256, 691, 435, 644, 43), (280, 256, 694, 434, 647, 43),
    (312, 256, 694, 434, 647, 43)
]


def surface_marks(frame, marks):
    coords = np.asarray(marks)
    return [np.interp(frame, coords[:, 0], coord) for coord in coords[:, 1:].T]


class FilmInscriptions:
    def __init__(self):
        self.host = cv2.imread(str(ART / 'meadows-gilding.png'), cv2.IMREAD_GRAYSCALE)
        self.tag = cv2.imread(str(ART / 'tag-gilding.png'), cv2.IMREAD_GRAYSCALE)
        self.note = cv2.imread(str(ART / 'printed-code-ink.png'), cv2.IMREAD_GRAYSCALE)
        self.card_marks = np.loadtxt(ART / 'card-ink-track.csv', delimiter=',', skiprows=1)
        if any(mask is None for mask in (self.host, self.tag, self.note)):
            raise ValueError('Missing invitation lettering in film-source')

    def apply(self, image, take, frame):
        if take == '01-plate' and frame <= 69:
            # Raised fragments cover the signature as the plate breaks.
            strength = min(1, max(0, (69 - frame) / 5))
            self.gild(image, self.host, surface_marks(frame, PLATE), strength)
        elif take in ('02-invitation', '03-second-place'):
            time = frame + (120 if take == '02-invitation' else 264)
            if self.card_marks[0,0] <= time <= self.card_marks[-1,0]:
                corners = np.float32(surface_marks(time, self.card_marks)).reshape(4,2)
                self.print_note(image, corners)
        elif take == '05-threshold' and frame >= 132:
            self.gild(image, self.tag, surface_marks(frame, SHARD), min(1, (frame-132)/4))
        elif take == '06-bloom':
            self.gild(image, self.tag, surface_marks(168+frame, SHARD), 1, foliage=True)

    def print_note(self, image, corners):
        x,y,w,h = cv2.boundingRect(corners)
        x0,y0 = max(x,0),max(y,0)
        x1,y1 = min(x+w,image.shape[1]),min(y+h,image.shape[0])
        if x0 >= x1 or y0 >= y1:
            return
        h,w = self.note.shape
        src = np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]])
        transform = cv2.getPerspectiveTransform(src,corners-np.float32([x0,y0]))
        mask = cv2.warpPerspective(self.note,transform,(x1-x0,y1-y0))
        ink = cv2.GaussianBlur(mask,(3,3),.48).astype(np.float32)[:,:,None]/255
        paper = image[y0:y1,x0:x1]
        paper[:] = (paper*(1-ink*np.float32([.70,.78,.68]))).astype(np.uint8)

    @staticmethod
    def gild(image, art, marks, strength, foliage=False):
        lx, ly, rx, ry, height = marks
        # The type follows the slight keystone and lean of the glass face.
        lean = height * .12
        corners = np.float32([[lx-lean, ly-height*.55], [rx-lean, ry-height*.45],
                              [rx+lean, ry+height*.45], [lx+lean, ly+height*.55]])
        x, y, w, h = cv2.boundingRect(corners)
        region = image[y:y+h, x:x+w]
        ah, aw = art.shape
        src = np.float32([[0,0], [aw-1,0], [aw-1,ah-1], [0,ah-1]])
        transform = cv2.getPerspectiveTransform(src, corners - np.float32([x,y]))
        ink = cv2.warpPerspective(art, transform, (w,h), flags=cv2.INTER_AREA).astype(np.float32)/255
        # Mix the original luminance into the foil. Reflections and texture
        # continue through the lettering as the camera and garden light move.
        ink = cv2.GaussianBlur(ink,(3,3),.43)
        if foliage:
            hsv = cv2.cvtColor(region,cv2.COLOR_BGR2HSV)
            stems = cv2.inRange(hsv,(28,50,48),(92,255,255))
            ink *= 1 - cv2.GaussianBlur(stems,(3,3),.6).astype(np.float32)/255
        light = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY).astype(np.float32)
        foil = np.clip(np.float32([143,195,236])[None,None,:] + (light[:,:,None]-83)*.56, 0,255)
        shadow = cv2.GaussianBlur(cv2.dilate(ink,np.ones((3,3),np.uint8)),(3,3),.55)
        shadow = np.roll(shadow,1,axis=0)[:,:,None] * (.47*strength)
        alpha = ink[:,:,None]*(.95*strength)
        image[y:y+h,x:x+w] = ((1-alpha)*region*(1-shadow) + alpha*foil).astype(np.uint8)
