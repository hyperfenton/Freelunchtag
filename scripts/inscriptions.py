"""Track gold lettering on glass and reprint the two photographed paper props."""
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
PLATE = [(n,301,616+dy,661,612+dy,30) for n,dy in PLATE_Y]
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


class PrintedPaper:
    def __init__(self, name):
        self.texture = cv2.imread(str(ART / (name + '-letterpress.png')))
        self.marks = np.loadtxt(ART / (name + '-track.csv'), delimiter=',', skiprows=1)
        if self.texture is None:
            raise ValueError('Missing paper artwork for ' + name)
        height, width = self.texture.shape[:2]
        self.corners = np.float32([[0,0],[width-1,0],[width-1,height-1],[0,height-1]])
        y, x = np.indices((height, width))
        edge = np.minimum.reduce((x, width-1-x, y, height-1-y))
        # Only the inner face is reprinted. Keep the photographed paper edge,
        # the tent fold and the shifting shadows around the original prop.
        self.alpha = np.uint8(np.minimum(edge / 9, 1) * 255)

    def apply(self, image, frame):
        if not self.marks[0,0] <= frame <= self.marks[-1,0]:
            return
        quad = np.float32(surface_marks(frame, self.marks)).reshape(4, 2)
        x, y, width, height = cv2.boundingRect(quad)
        x0, y0 = max(0,x), max(0,y)
        x1, y1 = min(image.shape[1], x+width), min(image.shape[0], y+height)
        if x1 <= x0 or y1 <= y0:
            return
        transform = cv2.getPerspectiveTransform(self.corners, quad - np.float32([x0,y0]))
        size = (x1-x0, y1-y0)
        ink = cv2.warpPerspective(self.texture, transform, size, flags=cv2.INTER_LINEAR)
        alpha = cv2.warpPerspective(self.alpha, transform, size).astype(np.float32) / 255
        original = image[y0:y1, x0:x1]
        # Match the blank paper margin to the light in this particular frame.
        margin = (alpha > .22) & (alpha < .85)
        if margin.sum() >= 20:
            drift = np.median(original[margin].astype(np.float32)-ink[margin], axis=0)
            ink = np.clip(ink + np.clip(drift,-30,30), 0, 255)
        alpha = alpha[:,:,None]
        original[:] = original * (1-alpha) + ink * alpha


class FilmInscriptions:
    def __init__(self):
        self.host = cv2.imread(str(ART / 'meadows-gilding.png'), cv2.IMREAD_GRAYSCALE)
        self.tag = cv2.imread(str(ART / 'tag-gilding.png'), cv2.IMREAD_GRAYSCALE)
        self.chair = PrintedPaper('chair')
        self.table = PrintedPaper('table')
        if self.host is None or self.tag is None:
            raise ValueError('Missing gilded lettering in film-source')

    def apply(self, image, take, frame):
        if take == '01-plate' and frame <= 69:
            strength = min(1, max(0, (69-frame)/5))
            self.gild(image, self.host, surface_marks(frame, PLATE), strength)
        if take in ('02-invitation', '03-second-place', '04-sweep'):
            time = frame + {'02-invitation':120, '03-second-place':264, '04-sweep':408}[take]
            self.chair.apply(image, time)
            self.table.apply(image, time)
        if take == '05-threshold' and frame >= 132:
            self.gild(image, self.tag, self.shard_marks(frame), min(1, (frame-132)/4))
        elif take == '06-bloom':
            self.gild(image, self.tag, self.shard_marks(168+frame), 1, foliage=True)

    @staticmethod
    def shard_marks(frame):
        marks = surface_marks(frame, SHARD)
        marks[-1] *= 1.39
        return marks

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
