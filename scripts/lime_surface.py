"""Rigid lime turn from two existing photographic hemispheres.

This helper projects a fixed sphere, rotating its material coordinates. It does
not dissolve or warp whole frames. Both texture faces come from the original
camera take. A fixed lighting field compensates for the photographs' broad
shading so it does not rotate with the material. The source images still limit
the accuracy of the inferred unseen surface and specular lighting.
"""

from __future__ import annotations

import math
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_closing, binary_dilation, binary_fill_holes, distance_transform_edt, gaussian_filter, label, map_coordinates
from scipy.spatial import ConvexHull


def _disk(side):
    q = (np.arange(side, dtype=np.float32) + .5) / side * 2 - 1
    x, y = np.meshgrid(q, q)
    r2 = x*x+y*y
    z = np.sqrt(np.maximum(0, 1-r2))
    return x, y, z, r2


def _light(x, y, z):
    return .36 + .64*np.maximum(0, -.32*x-.48*y+.816*z)


def _photo(frame, bounds, side):
    scale = frame.width/960
    crop = frame.crop(tuple(round(v*scale) for v in bounds)).resize((side, side), Image.Resampling.LANCZOS)
    rgb = np.asarray(crop).astype(np.float32)/255
    x,y,z,r2 = _disk(side)
    green = (rgb[...,1] > rgb[...,0]*.91) & (rgb[...,1] > rgb[...,2]*1.45) & (r2<.97)
    components,n = label(green)
    if not n:
        raise ValueError('Photographic lime silhouette could not be found')
    counts = np.bincount(components.ravel()); counts[0]=0
    mask = components==counts.argmax()
    mask = binary_fill_holes(binary_closing(mask, iterations=max(1,side//150)))
    points = np.column_stack(np.nonzero(mask))[:,::-1]
    hull = ConvexHull(points)
    silhouette = Image.new('L',(side,side))
    ImageDraw.Draw(silhouette).polygon([tuple(p) for p in points[hull.vertices]],fill=255)
    mask = (np.asarray(silhouette)>0) & (r2<.90)
    # White specular highlights and the brown stem remain opaque. Extend the
    # material into excluded background pixels so sphere rims cannot pick up
    # orange sign or wooden table colors during a turn.
    indices = distance_transform_edt(~mask, return_distances=False, return_indices=True)
    linear = rgb**2.2
    material = linear/_light(x,y,z)[...,None]
    # Fill bright neutral reflections from neighboring peel before relighting.
    # This is deterministic local filtering of the photographed surface.
    specular = (linear.min(axis=-1)>.1) & (linear.mean(axis=-1)>.3)
    specular = binary_dilation(specular,iterations=max(2,side//30))
    weights = ((~specular) & mask).astype(np.float32)
    sigma = max(2,side*.065)
    denominator = np.maximum(gaussian_filter(weights,sigma),.001)
    filled = gaussian_filter(material*weights[...,None],(sigma,sigma,0))/denominator[...,None]
    feather = gaussian_filter(specular.astype(np.float32),max(1,side*.015))[...,None]
    material = material*(1-feather)+filled*feather
    return material[indices[0],indices[1]]


class RigidLimeTurn:
    """Photograph-backed sphere with the start face at 0 and arrival at pi."""

    def __init__(self, frame99, frame135, texture_size=None):
        side = texture_size or max(192,round(144*frame99.width/960))
        self.side = side
        self.start = _photo(frame99, (261,402,397,532), side)
        self.finish = _photo(frame135, (428,398,553,520), side)
        # The grazing-angle rims of a photograph contain too few surface
        # samples for a side view. Fill that fixed equatorial material strip
        # with a small clean peel patch from the same arrival photograph.
        self.peel = self.finish[round(side*.26):round(side*.47),round(side*.58):round(side*.74)].copy()
        broad = gaussian_filter(self.peel, sigma=(max(1,side*.025),max(1,side*.025),0))
        self.peel = self.peel/np.maximum(broad,.0001)*self.peel.mean((0,1))
        central = (self.start[side//3:side*2//3,side//3:side*2//3].mean((0,1))+
                   self.finish[side//3:side*2//3,side//3:side*2//3].mean((0,1)))/2
        self.peel *= np.clip(central/np.maximum(self.peel.mean((0,1)),.0001),.7,1.3)
        top = np.concatenate((self.peel,self.peel[:,::-1]),axis=1)
        self.peel = np.concatenate((top,top[::-1]),axis=0)

    def sprite(self, radius, turn):
        # Render with two pixels of transparent padding. The body never changes
        # into another silhouette; the photographed hemispheres rotate on it.
        side = max(12, int(math.ceil(radius*2)))
        x,y,z,r2 = _disk(side)
        angle = math.pi*max(0,min(float(turn),1))
        c,s = math.cos(angle),math.sin(angle)
        ox = c*x-s*z
        oz = s*x+c*z
        # The second donor faces the opposite direction on the same sphere.
        u1 = (ox+1)*.5*(self.side-1)
        u2 = (-ox+1)*.5*(self.side-1)
        v = (y+1)*.5*(self.side-1)
        a = np.stack([map_coordinates(self.start[...,ch],[v,u1],order=1,mode='nearest') for ch in range(3)],axis=-1)
        b = np.stack([map_coordinates(self.finish[...,ch],[v,u2],order=1,mode='nearest') for ch in range(3)],axis=-1)
        # A narrow fixed texture seam is part of the material map, not a timed
        # image dissolve. It rotates across the surface with the object.
        mix = np.clip((oz+.035)/.07,0,1)
        mix = mix*mix*(3-2*mix)
        material = a*mix[...,None]+b*(1-mix[...,None])
        longitude = np.arctan2(ox,oz)
        # Fixed, smoothly irregular UV placement avoids a visible grid from
        # repeating a small photographic peel donor around the equator.
        u_phase = longitude*7.317+.45*np.sin(5*y+2*longitude)+.12*np.sin(13*y-4*longitude)
        v_phase = (y+1)*1.7+.27*np.sin(3*longitude+7*y)+.08*np.sin(11*longitude+19*y)
        pu = (u_phase%(2*math.pi))/(2*math.pi)*(self.peel.shape[1]-1)
        pv = (v_phase%1)*(self.peel.shape[0]-1)
        peel = np.stack([map_coordinates(self.peel[...,ch],[pv,pu],order=1,mode='wrap') for ch in range(3)],axis=-1)
        face = np.clip((np.abs(oz)-.15)/.4,0,1)
        face = face*face*(3-2*face)
        material = material*face[...,None]+peel*(1-face[...,None])
        linear = np.maximum(0,material*_light(x,y,z)[...,None])
        half_dot = np.maximum(0,-.35*x-.53*y+.772*z)
        reflection = (.42*mix*half_dot**24+.12*(1-mix)*half_dot**10)
        linear += reflection[...,None]
        rgb = np.clip(linear**(1/2.2)*255,0,255).astype(np.uint8)
        alpha = np.clip((1-np.sqrt(r2))*side/2+.5,0,1)
        rgba = np.dstack((rgb,(alpha*255).astype(np.uint8)))
        result = Image.fromarray(rgba,'RGBA')
        padded = Image.new('RGBA',(side+4,side+4))
        padded.paste(result,(2,2))
        return padded

    def exposed_sprite(self, radius, turn, velocity, flight_frames=8, shutter=.5):
        """Integrate a half-frame exposure of the same rigid rotating surface."""
        if turn<=0 or turn>=1:
            return self.sprite(radius,turn)
        pad = int(math.ceil(max(abs(v) for v in velocity)*shutter/2))+3
        side = max(12,int(math.ceil(radius*2)))+4
        total = np.zeros((side+2*pad,side+2*pad,4),np.float32)
        samples=max(16,min(96,int(math.ceil(max(abs(v) for v in velocity)*shutter))))
        for delta in np.linspace(-shutter/2,shutter/2,samples):
            picture = np.asarray(self.sprite(radius,turn+delta/flight_frames)).astype(np.float32)/255
            picture[...,:3] = picture[...,:3]**2.2*picture[...,3,None]
            x=pad+round(velocity[0]*delta);y=pad+round(velocity[1]*delta)
            total[y:y+side,x:x+side] += picture/samples
        alpha = total[...,3]
        total[...,:3] = (total[...,:3]/np.maximum(alpha[...,None],1e-6))**(1/2.2)
        return Image.fromarray(np.clip(total*255,0,255).astype(np.uint8),'RGBA')
