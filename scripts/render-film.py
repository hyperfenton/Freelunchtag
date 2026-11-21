"""Render a 48-second optical tracking shot through a photographic miniature set.

Requires numpy, scipy, opencv-python, numba, and ffmpeg. From the repository root:
    python3 scripts/render-film.py --format portrait
    python3 scripts/render-film.py --format wide

The same lens rig, set coordinates and 1,000+ pieces of the original plate are
evaluated at every frame. The cameras differ only in sensor framing.
"""
import argparse
import math
import subprocess
from pathlib import Path

import cv2
import numpy as np
from numba import njit
from scipy.interpolate import PchipInterpolator
from scipy.spatial import Delaunay

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
FPS = 24
DURATION = 48
cv2.setNumThreads(2)

def ease(a, b, t):
    v = np.clip((t-a)/(b-a), 0, 1)
    return v*v*(3-2*v)

def path(points):
    keys = np.asarray(points)
    return PchipInterpolator(keys[:,0], keys[:,1:], axis=0)

# Lens center and horizontal span on the portrait sensor. Distances are set
# coordinates in the projection photographed for conservatory.webp.
TRACK = path([
    (0,440,224,227), (1.6,441,194,220), (2.85,443,159,216),
    (4.1,446,176,228), (5.25,449,177,196), (6,450,227,226),
    (6.85,438,380,260), (7.8,418,502,212), (8.7,419,515,178),
    (9.5,424,513,178), (10.65,550,499,211), (11.4,615,487,170),
    (13.1,618,486,163), (14.5,708,510,222), (15.8,793,507,196),
    (17.7,800,508,179), (18.9,914,498,224), (20.6,1051,456,230),
    (22.1,1167,445,246), (23.4,1228,486,252), (24.8,1284,519,200),
    (26.6,1296,532,174), (27.5,1303,530,179), (29,1436,544,188),
    (30.6,1460,545,180), (31.7,1475,543,186),
    (33.2,1601,526,185), (35.2,1619,526,162), (36.4,1642,524,179),
    (37.8,1748,516,198), (39.7,1772,516,178), (40.65,1783,521,185),
    (41.9,1880,571,215), (42.95,1949,575,214), (44.5,1956,540,224),
    (45.96,1956,523,225), (48,1956,519,221)])
POSTERS={'lift':0,'shatter':3.14,'emblem':4.9,'floor':8.7,'host':12,
         'broom':17,'toss':21.65,'story':26.5,'why':30.6,'claim':35.1,
         'visit':39.6,'close':46.8}

class Lens:
    def __init__(self, t, width, height):
        x,y,span = TRACK(min(t,DURATION))
        self.w,self.h=width,height
        self.x=x+.7*math.sin(t*.8)
        frame_width=span*(2.02 if width>height else 1.)
        self.scale=width/frame_width
        half_height=height/(2*self.scale)
        self.y=np.clip(y+.6*math.sin(t*.63),half_height+1,723-half_height)
        # A tiny roll as the lens rides the last broom pass.
        angle=.003*math.sin(t*.59)+.025*math.sin(math.pi*ease(18,23,t))
        self.c,self.s=math.cos(angle),math.sin(angle)
        self.distance=1650*span/200

    def factor(self,z):
        return self.scale*self.distance/(self.distance-z)

    def project(self,x,y,z=0):
        q=self.factor(z)
        dx,dy=x-self.x,y-self.y
        return self.w*.5+q*(self.c*dx+self.s*dy),self.h*.5+q*(-self.s*dx+self.c*dy)

def sprite_asset(folder,name):
    raw=cv2.imread(str(folder/(name+'.webp')),cv2.IMREAD_UNCHANGED)
    alpha=raw[:,:,3:4].astype(np.float32)/255
    return np.ascontiguousarray(np.concatenate((raw[:,:,:3]*alpha,alpha*255),axis=2).astype(np.uint8))

def composite(dst, asset, corners):
    """Project premultiplied photography into the current lens with physical occlusion."""
    h,w=asset.shape[:2]
    p=np.asarray(corners,np.float32)
    lo=np.maximum(np.floor(p.min(axis=0)).astype(int)-1,0)
    hi=np.minimum(np.ceil(p.max(axis=0)).astype(int)+2,[dst.shape[1],dst.shape[0]])
    ww,hh=hi-lo
    if min(ww,hh)<1:return
    roi=dst[lo[1]:hi[1],lo[0]:hi[0]]
    # The fourth corner is implicit for each planar prop.
    m=cv2.getAffineTransform(np.float32([[0,0],[w,0],[0,h]]),p[[0,1,3]]-lo.astype(np.float32))
    rendered=cv2.warpAffine(asset,m,(ww,hh),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    inv=cv2.bitwise_not(rendered[:,:,3])
    roi[:]=cv2.add(rendered[:,:,:3],cv2.multiply(roi,cv2.merge((inv,inv,inv)),scale=1/255))

def card(dst,lens,asset,x,base,w,z=0,angle=0,squash=1,lean=0):
    # (x,base) is the foot/contact point, not a screen coordinate.
    h=w*asset.shape[0]/asset.shape[1]*squash
    c,s=math.cos(angle),math.sin(angle)
    corners=[]
    for u,v in [(-.5,-1),(.5,-1),(.5,0),(-.5,0)]:
        dx=u*w+v*lean
        dy=v*h
        corners.append(lens.project(x+c*dx-s*dy,base+s*dx+c*dy,z))
    composite(dst,asset,corners)

# A soft floor-contact print for each prop. The low sunlight travels from the right.
yy,xx=np.mgrid[-1:1:72j,-1:1:160j]
SHADOW=np.zeros((72,160,4),np.uint8)
SHADOW[:,:,3]=np.uint8(105*np.exp(-3.8*xx**2-5*yy**2)*(1-xx**2)*(1-yy**2))
def shade(dst,lens,x,y,w,z=0,stretch=1):
    q=w*stretch*.16
    corners=[lens.project(x+u*w,y+v*q,z) for u,v in [(-.79,-.6),(.51,-.6),(.51,.7),(-.79,.7)]]
    composite(dst,SHADOW,corners)

@njit
def draw_triangles(dst, tex, projected, uv, gain):
    H,W=dst.shape[:2]
    for i in range(len(projected)):
        p=projected[i]; a,b,c=p[0],p[1],p[2]
        det=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        if abs(det)<.13:continue
        xmin=max(0,int(math.floor(min(a[0],b[0],c[0]))))
        xmax=min(W-1,int(math.ceil(max(a[0],b[0],c[0]))))
        ymin=max(0,int(math.floor(min(a[1],b[1],c[1]))))
        ymax=min(H-1,int(math.ceil(max(a[1],b[1],c[1]))))
        A,B,C=uv[i,0],uv[i,1],uv[i,2]
        for y in range(ymin,ymax+1):
            for x in range(xmin,xmax+1):
                dx,dy=x+.5-a[0],y+.5-a[1]
                v=(dx*(c[1]-a[1])-dy*(c[0]-a[0]))/det
                k=((b[0]-a[0])*dy-(b[1]-a[1])*dx)/det
                j=1-v-k
                if min(v,k,j)<0:continue
                u=min(tex.shape[1]-1,max(0,int(A[0]*j+B[0]*v+C[0]*k)))
                row=min(tex.shape[0]-1,max(0,int(A[1]*j+B[1]*v+C[1]*k)))
                color=tex[row,u]; alpha=color[3]/255
                for ch in range(3):
                    dst[y,x,ch]=min(255.,dst[y,x,ch]*(1-alpha)+color[ch]*gain[i])

class Fracture:
    def __init__(self,plate):
        self.tex=plate
        rng=np.random.default_rng(72067)
        H,W=plate.shape[:2]
        # Tessellate the complete rectangle, including the plate's alpha boundary.
        points=rng.random((870,2))*[W-1,H-1]
        edge=np.linspace(0,1,36)
        border=np.concatenate([np.c_[edge,np.zeros(36)],np.c_[edge,np.ones(36)],np.c_[np.zeros(36),edge],np.c_[np.ones(36),edge]])
        points=np.vstack([points,border*[W-1,H-1]])
        uv=points[Delaunay(points).simplices]
        self.uv=np.ascontiguousarray(uv)
        geo=(uv-[W/2,H])*[182/W,182/W*1.52]
        self.mid=geo.mean(1)
        self.local=geo-self.mid[:,None,:]
        n=len(uv)
        self.noise=rng.uniform(-1,1,(9,n))
        self.floorx=440+self.mid[:,0]*1.99+self.noise[1]*32
        self.floory=561+self.noise[2]*33
        self.release=2.88
        self.start_y=194
        self.gravity=393
        self.vy=-68+self.noise[3]*49
        self.landing=(-self.vy+np.sqrt(self.vy**2+2*self.gravity*(self.floory-(self.start_y+self.mid[:,1]))))/self.gravity
        self.garden_x=1200+(self.noise[0]+1)*387+self.noise[8]*35
        self.garden_y=566+self.noise[2]*51
        self.z=self.noise[4]*36
        a=np.abs(self.noise[0])
        self.colors=1+.45*a
        self.order=np.argsort(self.z)

    def draw(self,dst,lens,t,group=None):
        age=t-self.release
        if age<0:return
        m=self.mid;n=self.noise
        time=np.minimum(age,self.landing)
        impact=np.maximum(0,age-self.landing)
        hop=31*np.abs(np.sin(impact*9))*np.exp(-impact*2.6)
        x=441+m[:,0]+(self.floorx-441-m[:,0])*time/self.landing
        y=self.start_y+m[:,1]+self.vy*time+.5*self.gravity*time**2-hop
        # The same pieces follow the leading bristles to the pail, which then
        # carries them past the threshold. No particle system is restarted.
        swept=ease(12.7+(self.floorx-240)/83,18.75,t)
        bx,by,bang=pail_pose(t)
        pocket_x=bx+np.sin(bang)*55+n[1]*12
        pocket_y=by-np.cos(bang)*54+n[2]*8
        x=x*(1-swept)+pocket_x*swept
        y=y*(1-swept)+pocket_y*swept-11*np.sin(np.pi*swept)
        launched=ease(21.1+(n[5]+1)*.42,23.6+(n[7]+1)*1.36,t)
        x=x*(1-launched)+self.garden_x*launched
        y=y*(1-launched)+self.garden_y*launched-220*np.sin(np.pi*launched)
        spin=(np.minimum(time,1.9)+.14*(1-np.exp(-impact*3))+swept*1.8+launched*2)*(n[5]*4.6)
        cs,sn=np.cos(spin),np.sin(spin)
        # Pieces tip toward the floor after impact and catch the light as they turn.
        sy=1-ease(0,.86,age)*(.60+.30*np.cos(spin*1.4))
        local=self.local
        u=local[:,:,0];v=local[:,:,1]*sy[:,None]
        xx=x[:,None]+u*cs[:,None]-v*sn[:,None]
        yy=y[:,None]+u*sn[:,None]+v*cs[:,None]
        z=self.z*ease(0,1.1,age)+19*launched
        X,Y=lens.project(xx,yy,z[:,None])
        gain=1+(.21*np.sin(spin*2+n[6]*3)+.36*np.maximum(0,np.sin(spin*4+n[1]*6))**12)*ease(0,.6,age)
        inds=self.order
        if group=='flying':inds=inds[launched[inds]>.035]
        elif group=='inside':inds=inds[launched[inds]<=.035]
        draw_triangles(dst,self.tex,np.ascontiguousarray(np.stack((X[inds],Y[inds]),axis=-1)),self.uv[inds],gain[inds])

def pail_pose(t):
    carry=ease(18.0,22.25,t)
    tip=ease(20.4,22.5,t)*(1-ease(23.2,25.6,t))
    return 889+273*carry,566-92*carry-34*math.sin(math.pi*carry)+83*ease(23.2,25.6,t),1.62*tip-.11*math.sin(math.pi*carry)

class FloweringCredit:
    """Grow the photographed vines, then open clusters of petals about local buds."""
    def __init__(self, image):
        self.full=image
        h,w=image.shape[:2]
        self.y,self.x=np.indices((h,w),dtype=np.float32)
        self.root_y=h*.91
        b,g,r,alpha=cv2.split(image.astype(np.float32))
        # The green stems/leaves and root ball grow separately from the ivory petals.
        foliage=((g>r*.86)&(b<g*.77)) | (self.y>h*.696)
        self.stems=image.copy()
        self.stems[~foliage]=0
        self.petals=image.copy()
        self.petals[foliage]=0

        # Locate bud centers inside the photographed letterforms. A local maximum
        # of pistil warmth and distance inside the silhouette seeds each cluster.
        ivory=(~foliage)&(alpha>100)
        distance=cv2.distanceTransform(ivory.astype(np.uint8),cv2.DIST_L2,5)
        warmth=cv2.GaussianBlur(np.maximum(0,(r+g)*.5-b),(0,0),1.8)
        score=np.minimum(distance,12)+warmth*.15
        kernelsize=19
        peaks=(score==cv2.dilate(score,np.ones((kernelsize,kernelsize),np.uint8)))&(distance>2)
        bud_y,bud_x=np.nonzero(peaks)
        seeds=np.ones((h,w),np.uint8)
        seeds[bud_y,bud_x]=0
        _,labels=cv2.distanceTransformWithLabels(seeds,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
        self.labels=labels.astype(np.float32)
        ix=labels-1
        self.bud_x=bud_x[ix].astype(np.float32)
        self.bud_y=bud_y[ix].astype(np.float32)
        across=self.bud_x/w
        row=self.bud_y/h
        self.open_at=43.55+row*1.43+.25*across+.14*np.sin(across*19+row*12)
        self.open_seconds=.58+.28*(.5+.5*np.cos(across*31-row*17))

    def at(self,t):
        if t>=45.96:
            return self.full
        h,w=self.full.shape[:2]
        material=self.stems
        if t>43.25:
            progress=ease(self.open_at,self.open_at+self.open_seconds,t)
            opened=np.maximum(.012,progress)
            sx=self.bud_x+(self.x-self.bud_x)/opened
            sy=self.bud_y+(self.y-self.bud_y)/opened
            petal=cv2.remap(self.petals,sx,sy,cv2.INTER_LINEAR)
            belongs=cv2.remap(self.labels,sx,sy,cv2.INTER_NEAREST)
            petal[(belongs!=self.labels)|(progress<=0)]=0
            uncovered=np.repeat((255-petal[:,:,3])[:,:,None],4,axis=2)
            material=cv2.add(petal,cv2.multiply(self.stems,uncovered,scale=1/255))
        # Roots stay planted. Shoots extend vertically, then branches arch out from
        # the center as a slightly different tip reaches each side of the canopy.
        growing=float(ease(41.35,44.05,t))
        length=.52+.48*growing
        src_y=np.where(self.y<self.root_y,self.root_y+(self.y-self.root_y)/length,self.y).astype(np.float32)
        height=np.maximum(0,(self.root_y-src_y)/self.root_y)
        spread=1-(1-growing)*.58*height
        root_x=w*.466
        bend=height*(1-growing)*w*.078*np.sin(height*4.8)
        src_x=(root_x+(self.x-root_x-bend)/np.maximum(.42,spread)).astype(np.float32)
        plant=cv2.remap(material,src_x,src_y,cv2.INTER_LINEAR)
        tip=growing*1.09+.014*np.sin(src_x/w*13+height*7)
        hidden=(height>tip)&(src_y<self.root_y)
        plant[hidden]=0
        return plant


class Set:
    def __init__(self,root):
        self.root=root; folder=root/'assets/one-take'
        self.back=cv2.imread(str(folder/'conservatory.webp'))
        self.props={p.stem:sprite_asset(folder,p.stem) for p in folder.glob('*.webp') if p.stem!='conservatory' and not p.name.startswith('.')}
        self.credit=FloweringCredit(self.props['close'])
        self.glass=Fracture(self.props['plate'])
        angle=np.arctan2(yy,xx)
        radius=np.hypot(xx,yy)
        rim=np.exp(-((radius-(.65+.055*np.sin(18*angle)))/.15)**2)
        rays=(.72+.28*np.cos(24*angle))**3
        self.caustic=np.zeros((72,160,4),np.uint8)
        self.caustic[:,:,3]=np.uint8(62*rim*rays)
        for channel,value in enumerate((227,157,244)):
            self.caustic[:,:,channel]=self.caustic[:,:,3].astype(float)*value/255
        self.dust=np.random.default_rng(210).random((98,4))

    def frame(self,t,W,H):
        lens=Lens(t,W,H)
        # Map the conservatory as a fixed photographic set extension. All contact
        # points, actors and inscriptions stay in the same coordinate system.
        coords=np.asarray([lens.project(0,0),lens.project(1000,0),lens.project(0,700)],np.float32)
        m=cv2.getAffineTransform(np.float32([[0,0],[1000,0],[0,700]]),coords)
        # Pull focus off the distant garden as the flowering credit reaches the lens.
        focus=float(ease(41.7,44.1,t))
        back=cv2.GaussianBlur(self.back,(0,0),2.6*focus) if focus>.075 else self.back
        dst=cv2.warpAffine(back,m,(W,H),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT_101)
        a=self.props
        def prop(name,x,base,w,z=0,angle=0,squash=1,lean=0,shadow=True):
            if shadow:shade(dst,lens,x,base,w,z)
            card(dst,lens,a[name],x,base,w,z,angle,squash,lean)
        # Objects are always present, including outside the current field of view.
        prop('reel',1090,509,103,-21,-.07)
        prop('story',1296,589,112,8,-.05)
        prop('why',1460,601,132,13,.02)
        prop('claim',1618,604,100,17,-.06)
        # The bottom of the stake is buried in the flower bed.
        prop('visit',1775,605,145,0,-.035,.88)
        # Flower heads grow from ground and turn slightly with the glasshouse breeze.
        def flower(x,y,w,z,phase,growth=1):
            if growth<.015:return
            card(dst,lens,a['cosmos'],x,y,w*growth,z,.047*math.sin(t*.98+phase)+phase*.027,1,2.2*math.sin(t*.75+phase))
        flower(1889,603,85,-30,-1,.50+.50*ease(38.6,44,t))
        flower(2032,604,98,-24,1.2,.39+.61*ease(40.7,45.5,t))
        if t>36:
            # This is a flower bed: stems carry the actual white blossoms spelling the credit.
            shade(dst,lens,1959,608,69,15)
            # The buds ride the growing tips. The width opens more slowly than
            # the stem length, so the three stalks unfurl above a fixed root.
            reach=float(ease(41.48,43.85,t))
            branch_w=118*(.035+.965*reach**1.22)
            branch_h=143*(.025+.975*reach)
            stock=a['stock-buds']
            squash=branch_h/(branch_w*stock.shape[0]/stock.shape[1])
            card(dst,lens,stock,1950,601,branch_w,13,-.01+.012*math.sin(t*.8),
                 squash,6*math.sin(math.pi*reach))
            plant=self.credit.at(t)
            card(dst,lens,plant,1955,608,148,15,-.008+.006*math.sin(t*.87),1,-.7)
        flower(1859,618,65,37,-3,.2+.8*ease(40.3,44.7,t))
        flower(2070,622,76,46,1.8,.32+.68*ease(41.4,45.9,t))

        prop('lunch',417,572,111,0,-.06)
        prop('frame',616,565,106,-3,.02)
        # The carving emerges from under the rising plate, then stays on the table.
        grow=.006+.994*ease(2.32,3.78,t)
        if grow>.01:
            shade(dst,lens,444,236,124*grow,0)
            card(dst,lens,a['emblem'],444,236,121*grow,0,-.016)
        lift=ease(.18,2.84,t)
        if t<self.glass.release:
            shade(dst,lens,441,237,181,0,1.28)
            card(dst,lens,self.caustic,437-8*lift,241,193+21*lift,0,-.015,.34)
            card(dst,lens,a['plate'],441,237-43*lift,182,0,0,1+.52*lift)
        if t<21.1:
            self.glass.draw(dst,lens,t)
        else:
            self.glass.draw(dst,lens,t,'inside')

        # Swing the broom in a shallow arc. Its bristles stay on the floor for
        # the forward pass, then lift as the bucket and camera leave together.
        br=ease(12.4,18.62,t)
        backswing=math.sin(br*math.pi*5)*math.sin(br*math.pi)
        broomx=236+643*br+backswing*17
        broomy=563+10*br-8*max(0,-backswing)
        prop('broom',broomx,broomy,98,-8,-.32+.14*backswing+.16*br,.98)
        prop('spoon',801,573,127,4,-.075,.91)
        bx,by,ang=pail_pose(t)
        shade(dst,lens,bx,565,103,14)
        card(dst,lens,a['pail'],bx,by,109,17,ang)
        if t>=21.1:self.glass.draw(dst,lens,t,'flying')
        # Only individual motes in the same shafts catch the light.
        for xx,yy,zz,phase in self.dust:
            x=xx*2150+4*math.sin(.76*t+phase*13)
            y=yy*660+5*math.sin(.55*t+phase*7)
            px,py=lens.project(x,y,(zz-.5)*160)
            if 1<px<W-2 and 1<py<H-2:
                v=math.sin(phase*15+t*.55)**6
                if v>.35:
                    ix,iy=int(px),int(py)
                    dst[iy:iy+2,ix:ix+2]=np.minimum(255,dst[iy:iy+2,ix:ix+2].astype(float)+v*np.array([21,25,30])).astype(np.uint8)
        return dst

def render(args):
    stage=Set(args.root)
    wide=args.format=='wide'
    W,H=(1280,720) if wide else (720,1280)
    directory=args.root/'assets/film'
    if args.proof:
        sample=[.3,2.6,3.05,4.6,6.55,8.6,11.9,15.4,17.2,20.9,22.65,26.4,30.5,35,39.4,45.2]
        thumbs=[cv2.resize(stage.frame(t,W,H),(240,135) if wide else (135,240),interpolation=cv2.INTER_AREA) for t in sample]
        cv2.imwrite(str(args.proof),cv2.vconcat([cv2.hconcat(thumbs[i:i+4]) for i in range(0,len(thumbs),4)]))
        return
    output=directory/('free-lunch-'+args.format+'.mp4')
    rate,buffer=('3100k','4650k') if wide else ('2250k','3375k')
    proc=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pixel_format','bgr24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-threads','4','-preset','medium','-crf','21','-maxrate',rate,'-bufsize',buffer,'-pix_fmt','yuv420p','-g','24','-keyint_min','24','-sc_threshold','0','-movflags','+faststart',str(output)],stdin=subprocess.PIPE)
    posters={round(t*FPS):name for name,t in POSTERS.items()}
    try:
        for n in range(DURATION*FPS):
            frame=stage.frame(n/FPS,W,H)
            proc.stdin.write(frame.tobytes())
            if n in posters:
                suffix='-wide' if wide else ''
                cv2.imwrite(str(directory/('film-'+posters[n]+suffix+'.webp')),frame,[cv2.IMWRITE_WEBP_QUALITY,88])
    finally:
        proc.stdin.close()
        if proc.wait():raise RuntimeError('ffmpeg did not complete the encode')
    print(output)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--format',choices=['portrait','wide'],required=True)
    parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--proof',type=Path)
    render(parser.parse_args())
