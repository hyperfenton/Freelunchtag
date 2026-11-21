#!/usr/bin/env python3
"""Render the Free Lunch Tag photographic film from its 24 portrait/wide WebP masters.

Requires Python 3.10+, numpy, opencv-python and an ffmpeg build with libx264.
Example: python render-film.py --input assets/film --portrait assets/free-lunch-portrait.mp4 --wide assets/free-lunch-wide.mp4
The source files are film-SHOT.webp and film-SHOT-wide.webp. All animation is
deterministic and reversible in the resulting short-GOP, silent MP4.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import math
import shutil
import subprocess
import sys
import cv2
import numpy as np

FPS = 24
TIMELINE = [
    ('lift',60), ('shatter',30), ('emblem',54), ('floor',96), ('host',96),
    ('broom',144), ('toss',96), ('story',96), ('why',96), ('claim',96),
    ('night',24), ('visit',96), ('close',120),
]


def sat(x):
    return min(1.,max(0.,x))


def ease(x):
    t=sat(x)
    return t*t*(3.-2.*t)


def lerp(a,b,t):
    return a+(b-a)*t


def color_fade(a,b,t):
    return cv2.addWeighted(a,1-t,b,t,0)


def camera(frame, zoom, pan_x=0., pan_y=0., roll=0., anchor=(.5,.5)):
    h,w=frame.shape[:2]
    m=cv2.getRotationMatrix2D((w*anchor[0],h*anchor[1]),roll,zoom)
    m[:,2]+=np.array([pan_x*w,pan_y*h])
    return cv2.warpAffine(frame,m,(w,h),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT101)


def load_frame(path,size):
    photo=cv2.imread(str(path),cv2.IMREAD_COLOR)
    if photo is None:
        raise FileNotFoundError(path)
    w,h=size
    oh,ow=photo.shape[:2]
    ratio=max(w/ow,h/oh)
    sw,sh=round(ow*ratio),round(oh*ratio)
    resized=cv2.resize(photo,(sw,sh),interpolation=cv2.INTER_AREA if ratio<1 else cv2.INTER_CUBIC)
    x,y=(sw-w)//2,(sh-h)//2
    return resized[y:y+h,x:x+w].copy()


def polish_background(image,mask):
    # The removed region is mostly hidden by the displaced object. Inpaint the
    # narrow exposed strip using the local blue light and reflections beneath it.
    h,w=image.shape[:2]
    reduced=(max(1,w//3),max(1,h//3))
    small=cv2.resize(image,reduced,interpolation=cv2.INTER_AREA)
    solid=cv2.dilate(mask,np.ones((5,5),np.uint8))
    mini=cv2.resize(solid,reduced,interpolation=cv2.INTER_AREA)
    clean=cv2.inpaint(small,np.uint8(mini>7)*255,4,cv2.INPAINT_TELEA)
    back=cv2.resize(clean,(w,h),interpolation=cv2.INTER_CUBIC)
    a=cv2.GaussianBlur(solid,(5,5),1.1)
    return cv2.blendLinear(image,back,1.-a.astype(np.float32)/255.,a.astype(np.float32)/255.)


class Cutout:
    """A photograph's original color and matte, rendered as premultiplied pixels."""
    def __init__(self, image, mask):
        x,y,w,h=cv2.boundingRect(mask)
        self.x,self.y=x,y
        a=cv2.GaussianBlur(mask,(3,3),.62)[y:y+h,x:x+w]
        rgb=image[y:y+h,x:x+w]
        pm=cv2.multiply(rgb,cv2.merge([a,a,a]),scale=1./255.)
        self.rgba=cv2.merge([*cv2.split(pm),a])
        self.w,self.h=w,h

    def place(self, dest, pivot, angle=0., stretch=(1.,1.), offset=(0.,0.),alpha=1.,warp=0.):
        if alpha<.005:return
        h,w=dest.shape[:2]
        s,c=math.sin(math.radians(angle)),math.cos(math.radians(angle))
        transform=np.array([[c*stretch[0],-s*stretch[1]+warp],[s*stretch[0],c*stretch[1]]],np.float32)
        p=np.float32(pivot)
        tr=p+np.float32(offset)+transform@(np.float32([self.x,self.y])-p)
        corners=np.array([[0,0],[self.w,0],[0,self.h],[self.w,self.h]],np.float32)@transform.T+tr
        lo=np.maximum([0,0],np.floor(corners.min(axis=0)-1)).astype(int)
        hi=np.minimum([w,h],np.ceil(corners.max(axis=0)+1)).astype(int)
        if (hi<=lo).any():return
        m=np.column_stack((transform,tr-lo)).astype(np.float32)
        layer=cv2.warpAffine(self.rgba,m,tuple(hi-lo),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        roi=dest[lo[1]:hi[1],lo[0]:hi[0]]
        a=layer[:,:,3]
        if alpha<.999:
            layer=cv2.convertScaleAbs(layer,alpha=alpha);a=layer[:,:,3]
        np.copyto(roi,cv2.add(layer[:,:,:3],cv2.multiply(roi,cv2.merge([255-a]*3),scale=1./255.)))


def brush_matte(source, contour, warm_only=False):
    h,w=source.shape[:2]
    poly=np.int32(np.array(contour)*[w,h])
    initial=np.zeros((h,w),np.uint8)
    cv2.fillPoly(initial,[poly],255)
    # Warm broomcorn has a clean chromatic separation from both violet tile and
    # galvanized steel. GrabCut preserves the ragged ends and strands of the broom.
    small=cv2.resize(source,(w//2,h//2),interpolation=cv2.INTER_AREA)
    pm=cv2.resize(initial,(w//2,h//2),interpolation=cv2.INTER_NEAREST)
    sel=np.where(pm,cv2.GC_PR_FGD,cv2.GC_BGD).astype(np.uint8)
    if warm_only:
        hsv=cv2.cvtColor(small,cv2.COLOR_BGR2HSV)
        fiber=((hsv[:,:,0] < 30) | (hsv[:,:,0] > 169)) & (hsv[:,:,1]>57) & (pm>0)
        sel[fiber]=cv2.GC_FGD
        sel[(pm!=0)&~fiber]=cv2.GC_PR_BGD
    else:
        middle=cv2.erode(pm,np.ones((9,9),np.uint8))
        sel[middle>0]=cv2.GC_FGD
    model=(np.zeros((1,65),np.float64),np.zeros((1,65),np.float64))
    cv2.grabCut(small,sel,None,*model,2,cv2.GC_INIT_WITH_MASK)
    out=cv2.resize(np.uint8((sel==1)|(sel==3))*255,(w,h),interpolation=cv2.INTER_LINEAR)
    return cv2.bitwise_and(out,initial)


class Fracture:
    def __init__(self,image,center,axes):
        rng=np.random.default_rng(1703)
        self.pieces=[]
        cx,cy=center;rx,ry=axes
        # An initial 40 triangles and twelve 80-triangle annuli exactly tile the plate.
        rings=[np.repeat([[cx,cy]],40,axis=0)]
        for ring in range(1,14):
            theta=(np.arange(40)+((ring%2)*.42)+rng.uniform(-.20,.20,40))*math.tau/40
            radius=math.sqrt(ring/13)*(1+rng.uniform(-.018,.018,40)*(ring<13))
            rings.append(np.column_stack((cx+rx*radius*np.cos(theta),cy+ry*radius*np.sin(theta))))
        tri=[]
        for j in range(1,14):
            a,b=rings[j-1],rings[j]
            for k in range(40):
                n=(k+1)%40
                tri.append(np.array([a[k],b[k],b[n]]))
                if j>1:tri.append(np.array([a[k],b[n],a[n]]))
        h,w=image.shape[:2]
        for points in tri:
            p=np.mean(points,axis=0)
            lx,ly=(p-[cx,cy])/[rx,ry]
            lo=np.maximum([0,0],np.floor(points.min(axis=0)-1)).astype(int)
            hi=np.minimum([w,h],np.ceil(points.max(axis=0)+1)).astype(int)
            mask=np.zeros((hi[1]-lo[1],hi[0]-lo[0]),np.uint8)
            cv2.fillConvexPoly(mask,np.int32((points-lo)*16),255,lineType=cv2.LINE_AA,shift=4)
            piece=Cutout(image[lo[1]:hi[1],lo[0]:hi[0]],mask)
            piece.x+=lo[0];piece.y+=lo[1]
            vx=lx*rng.uniform(.10,.30)+rng.normal(0,.085)
            vy=-rng.uniform(.22,.52)+ly*.06
            self.pieces.append((piece,p,vx,vy,rng.uniform(-180,180),rng.uniform(.5,3.8),rng.uniform(.17,.98)))
        assert len(self.pieces)==1000
        self.w,self.h=w,h

    def render(self,frame,t):
        if t>.93:return
        for piece,p,vx,vy,rotation,flutter,life in self.pieces:
            fade=1-ease((t-(.30+life*.28))/.32)
            if fade<.02:continue
            sx=.24+.76*abs(math.cos(t*flutter*2.8))
            sy=1.-.34*t
            piece.place(frame,p,rotation*t,(sx,sy),(vx*t*self.w,(vy*t+.30*t*t)*self.h),fade)


def trajectory(keys,t):
    for (a,va),(b,vb) in zip(keys,keys[1:]):
        if t<=b:return lerp(va,vb,ease((t-a)/(b-a)))
    return keys[-1][1]


class Film:
    def __init__(self,source,wide):
        self.wide=wide
        self.w,self.h=(1280,720) if wide else (720,1280)
        self.images={k:load_frame(source/f"film-{k}{'-wide' if wide else ''}.webp",(self.w,self.h)) for k,_ in TIMELINE if k!='night'}
        w,h=self.w,self.h
        yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
        self.xy=(xx,yy)
        self.u,self.v=xx/w,yy/h
        scene=self.images['lift']
        center=(.493*w,.315*h) if wide else (.490*w,.359*h)
        axes=(.218*w,.181*h) if wide else (.413*w,.116*h)
        self.center=center
        mask=np.zeros((h,w),np.uint8)
        cv2.ellipse(mask,tuple(round(v) for v in center),tuple(round(v) for v in axes),0,0,360,255,-1,cv2.LINE_AA)
        self.plate=Cutout(scene,mask);self.table=polish_background(scene,mask)
        self.fracture=Fracture(scene,center,axes)
        u,v=self.u,self.v
        self.under_glass=np.exp(-(((u-center[0]/w)/(axes[0]/w*.93))**2+((v-center[1]/h-.055)/(axes[1]/h*.75))**2)*1.7).astype(np.float32)
        broom_poly=([(0.078,0),(.115,0),(.259,.426),(.297,.443),(.308,.510),(.362,.592),(.479,.695),(.567,.731),(.594,.773),(.551,.824),(.367,.899),(.145,.956),(.163,.803),(.200,.59),(.230,.52),(.220,.46)] if wide else
                [(0,.18),(.014,.207),(.204,.515),(.249,.528),(.281,.586),(.348,.657),(.475,.713),(.640,.760),(.696,.783),(.642,.821),(.392,.872),(.105,.898),(0,.913),(0,.619),(.088,.558),(.091,.530),(0,.371)])
        broom=self.images['broom'];bm=brush_matte(broom,broom_poly,True)
        self.broom=Cutout(broom,bm);self.floor=polish_background(broom,bm)
        points=([( .364,.042),(.393,.016),(.467,.009),(.493,.038),(.513,.079),(.508,.148),(.490,.191),(.473,.210),(.470,.248),(.435,.302),(.388,.225),(.337,.129),(.327,.110)]
                 if wide else
                [(.334,.051),(.371,.026),(.442,.018),(.540,.037),(.579,.066),(.623,.095),(.629,.121),(.608,.173),(.594,.190),(.546,.223),(.500,.239),(.464,.270),(.292,.209),(.281,.190)])
        toss=self.images['toss'];tm=brush_matte(toss,points)
        self.bucket=Cutout(toss,tm);self.doorway=polish_background(toss,tm)
        self.spout=(.452,.182) if wide else (.568,.160)
        self.target=(.620,.633) if wide else (.856,.568)
        # The airborne glass is displaced inside a narrow band along its physical
        # path; the brass inscription and architecture remain fixed in the frame.
        sx,sy=self.spout;ex,ey=self.target
        q=np.clip(((u-sx)*(ex-sx)+(v-sy)*(ey-sy))/((ex-sx)**2+(ey-sy)**2),0,1)
        dist=((u-sx-q*(ex-sx))/.115)**2+((v-sy-q*(ey-sy))/.12)**2
        self.stream=np.exp(-dist*2.1)*np.maximum(0.,np.sin(np.pi*q))**.75
        self.along=q
        self.rng=np.random.default_rng(38)
        # Wide graphic shapes are never added; the closing motion acts only on
        # real photographed petals and leaves surrounding the inscribed glass.
        self.flower_motion=np.clip((abs(u-.50)-.13)/.26,0,1)*np.clip((.85-v)/.55,0,1)
        self.flow_x=(np.sin(v*11+u*5)*self.flower_motion).astype(np.float32)
        self.flow_y=((.45+.55*np.sin(u*13+v*4)**2)*self.flower_motion).astype(np.float32)

    def lift(self,t):
        w,h=self.w,self.h
        if t<=.004:return self.images['lift'].copy()
        height=trajectory([(0,0),(.16,.08),(.63,1),(.78,1.04),(.86,1.0),(1,0)],t)
        canvas=self.table.copy()
        cast=cv2.convertScaleAbs(self.under_glass,alpha=18*height)
        # The contact shadow stays on the table and softens as the plate clears it.
        canvas=cv2.subtract(canvas,cv2.merge([cast,cast,cast]))
        self.plate.place(canvas,self.center,angle=-3.9*height,stretch=(1+.015*height,1-.115*height),offset=(w*.007*height,-h*(.088 if self.wide else .061)*height))
        return canvas

    def broom_pass(self,t):
        w,h=self.w,self.h
        stroke=trajectory([(0,-.26),(.08,-.50),(.26,.43),(.40,-.42),(.64,.71),(.76,-.17),(.97,1),(1,.91)],t)
        floor=self.floor.copy()
        pivot=(w*(.13 if self.wide else .03),h*(.13 if self.wide else .27))
        self.broom.place(floor,pivot,angle=-stroke*(7.2 if self.wide else 5.8),
                         offset=(w*stroke*.056, -h*.009*max(0,-stroke)),warp=stroke*.012)
        return camera(floor,1.023+.022*ease(t),-.010*t,-.007*t,-.32*ease(t))

    def pour(self,t):
        w,h=self.w,self.h
        xx,yy=self.xy;q=self.along
        ripple=np.sin((q*2.5-t*2.75)*math.tau)*self.stream
        x=xx-ripple*w*(.007 if self.wide else .014)
        y=yy-ripple*h*.013
        canvas=cv2.remap(self.doorway,x,y,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT101)
        pour=ease(t/.65);pivot=(self.spout[0]*w,self.spout[1]*h)
        self.bucket.place(canvas,pivot,angle=lerp(-14,7.8,pour),
                          offset=(w*(1-pour)*-.02,h*(1-pour)*.018))
        return camera(canvas,1.012+.055*ease(t),-.026*ease(t),-.02*ease(t),-.4*ease(t),(.55,.58))

    def close(self,image,t,visit=False):
        w,h=self.w,self.h;xx,yy=self.xy
        grow=1-ease(min(1,t*(1.4 if visit else 1.55)))
        wind=np.sin(t*2.3+self.u*2)*.004
        map_x=xx+(self.flow_x*grow*.035+self.flower_motion*wind)*w
        map_y=yy-self.flow_y*(grow*.045+.0025*math.sin(t*3.5))*h
        garden=cv2.remap(image,map_x,map_y,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT101)
        return camera(garden,1.01+.035*ease(t),.002*t,-.006*t,lerp(.34,-.15,t),(.5,.57))

    def frame(self,name,t):
        w,h=self.w,self.h
        if name=='night':return np.zeros((h,w,3),np.uint8)
        image=self.images[name]
        if name=='lift':return self.lift(t)
        if name=='shatter':
            # Practical high-speed still is revealed behind the outward trajectories.
            base=color_fade(self.table,image,ease(t/.42))
            self.fracture.render(base,t)
            shock=.007*(1-t)**3*math.sin(t*54)
            return camera(base,1.015+.052*ease(t),shock,shock*.35,-.4*(1-t),(.50,.36))
        if name=='broom':return self.broom_pass(t)
        if name=='toss':return self.pour(t)
        if name in ['close','visit']:return self.close(image,t,name=='visit')
        # Short camera moves vary in angle and direction and stay framed on the
        # source's own photographed lettering. There is no overlaid title track.
        direction={'emblem':(1.08,1.018,-.013,-.022,.90,-.20),
                   'floor':(1.022,1.057,.010,-.013,-.70,.15),
                   'host':(1.012,1.049,-.012,-.010,.40,-.12),
                   'story':(1.056,1.015,.011,.012,-.60,.18),
                   'why':(1.016,1.052,-.010,-.009,.23,-.31),
                   'claim':(1.049,1.009,.008,.010,-.30,.10)}
        z0,z1,px,py,r0,r1=direction[name]
        step=ease(t)
        return camera(image,lerp(z0,z1,step),px*(step-.5),py*(step-.5),lerp(r0,r1,step))

    def frames(self):
        previous=None
        for name,count in TIMELINE:
            print(name,flush=True)
            for i in range(count):
                t=i/(count-1)
                frame=self.frame(name,t)
                if name not in ['lift','shatter','night'] and previous is not None:
                    length={'emblem':7,'floor':10,'host':10,'broom':8,'toss':7,'visit':19,'close':15}.get(name,9)
                    if i<length:frame=color_fade(previous,frame,ease((i+1)/length))
                if name=='claim' and i>=count-8:
                    frame=cv2.convertScaleAbs(frame,alpha=1-ease((i-(count-8))/7))
                yield frame
            previous=frame


def encode(source,output,wide):
    width,height=(1280,720) if wide else (720,1280)
    film=Film(source,wide)
    output.parent.mkdir(parents=True,exist_ok=True)
    temp=output.with_name(output.stem+'.rendering.mp4')
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','bgr24','-video_size',f'{width}x{height}','-framerate','24','-i','-','-an','-vf','scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-c:v','libx264','-threads','3','-preset','fast','-crf','21','-maxrate','1650k','-bufsize','3000k','-g','12','-keyint_min','12','-sc_threshold','0','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(temp)]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for frame in film.frames():
            proc.stdin.write(memoryview(np.ascontiguousarray(frame)).cast('B'))
        proc.stdin.close()
        if proc.wait()!=0:raise RuntimeError('ffmpeg encode failed')
        temp.replace(output)
    except BaseException:
        if proc.stdin and not proc.stdin.closed:proc.stdin.close()
        proc.wait()
        if temp.exists():temp.unlink()
        raise
    print(f'{output} ({output.stat().st_size:,} bytes)',flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--input',type=Path,required=True,help='Directory containing film-SHOT.webp and film-SHOT-wide.webp')
    p.add_argument('--portrait',type=Path,help='720×1280 output')
    p.add_argument('--wide',type=Path,help='1280×720 output')
    args=p.parse_args()
    if not(args.portrait or args.wide):p.error('choose at least one output')
    if args.portrait and args.wide and args.portrait.resolve()==args.wide.resolve():p.error('choose different output paths')
    if not shutil.which('ffmpeg'):p.error('ffmpeg must be available on PATH')
    cv2.setNumThreads(2)
    for dest,wide in [(args.portrait,False),(args.wide,True)]:
        if dest:encode(args.input,dest,wide)


if __name__=='__main__':
    main()
