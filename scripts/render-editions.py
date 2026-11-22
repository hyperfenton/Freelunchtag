"""Master the alternative films. Inputs are the four matched-camera takes in
film-source/<edition>/. Outputs are self-hosted H.264 movies and reading stills."""
import argparse
import math
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FPS = 24
FLIGHT = 144
HOLD = 58
STOPS = ('offer', 'lookup', 'text', 'swap', 'close')
# Portrait centre/width and landscape centre/height, in the square source frame.
COMPOSITION = {
    'lunch-line': [(0.50,.73,.37,.70),(.51,.75,.42,.76),(.50,.67,.48,.79),
                   (.51,.79,.48,.79),(.50,.78,.53,.79)],
    'found-tag':  [(.50,.66,.53,1.05),(.51,.78,.52,1.02),(.60,.80,.52,1.02),
                   (.50,.68,.52,1.02),(.50,.65,.53,1.05)]
}

def ease(x):
    return (1-math.cos(math.pi * min(1,max(0,x))))/2

def source_frames(folder):
    for i in range(4):
        cap=cv2.VideoCapture(str(folder / f'{i:02d}.mp4'))
        if not cap.isOpened() or round(cap.get(cv2.CAP_PROP_FPS))!=FPS:
            raise ValueError(f'Cannot read camera move {i}')
        try:
            for n in range(FLIGHT+1):
                ok, frame=cap.read()
                if not ok: raise ValueError(f'Short move {i} at {n}')
                if n==0:
                    for h in range(HOLD):
                        yield frame,i,0.0,h
                if n<FLIGHT:
                    yield frame,i,n/FLIGHT,None
                elif i==3:
                    for h in range(HOLD):
                        yield frame,4,0.0,h
        finally: cap.release()

def export(edition,framing):
    portrait=framing=='portrait'
    w,h=(720,1560) if portrait else (1280,720)
    out=ROOT/'assets'/edition
    out.mkdir(parents=True,exist_ok=True)
    target=out/f'free-lunch-{framing}.mp4'
    tmp=target.with_suffix('.new.mp4')
    native_phone=portrait and edition in ('found-tag','pass-the-salsa')
    native=edition=='pass-the-salsa' or native_phone
    source=ROOT/'film-source'/edition
    if native_phone:
        source=source/'portrait'
    command=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24',
             '-s',f'{w}x{h}','-r',str(FPS),'-i','-','-an','-c:v','libx264',
             '-threads','2','-preset','fast','-crf','19','-maxrate','3200k' if portrait else '3800k',
             '-bufsize','6000k','-g','6','-keyint_min','6','-sc_threshold','0','-bf','0',
             '-pix_fmt','yuv420p','-vf','scale=out_color_matrix=bt709','-colorspace','bt709',
             '-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',str(tmp)]
    u=(np.arange(w,dtype='float32')+.5)/w-.5
    v=(np.arange(h,dtype='float32')+.5)/h-.5
    # Place the steepest part of the optical mapping over the subject and let
    # peripheral surface texture fill tall phones and wide monitors.
    if portrait:
        v=np.tanh(2.65*v)/(2*np.tanh(2.65/2))
    else:
        u=np.tanh(2.55*u)/(2*np.tanh(2.55/2))
    stops=np.asarray(COMPOSITION.get(edition, []))
    with subprocess.Popen(command,stdin=subprocess.PIPE) as encoder:
        for count,(frame,i,travel,hold) in enumerate(source_frames(source)):
            if native:
                # Both salsa compositions and the portrait Found Tag take were
                # generated at their own aspect ratios. Centre-crop to the master.
                height,width=frame.shape[:2]
                scale=min(width/w,height/h)
                if hold is not None:
                    scale*=1-.008*math.sin(math.pi*hold/(HOLD-1))**2
                crop_width,crop_height=round(scale*w),round(scale*h)
                left,top=(width-crop_width)//2,(height-crop_height)//2
                view=cv2.resize(frame[top:top+crop_height,left:left+crop_width],(w,h),
                                interpolation=cv2.INTER_CUBIC)
            else:
                mix=ease(travel)
                cx,sx,cy,sy=stops[i]*(1-mix)+stops[min(4,i+1)]*mix
                time=count/FPS
                if portrait:
                    cy,sy=(.50,.997) if edition=='found-tag' else (.495,.987)
                else:
                    cx,sx=.50,1.0
                    sy=min(.993,sy)
                if edition=='found-tag':
                    # Read the genuine printed takeout slip without losing the fob.
                    detail=ease(min((time-14.75)/2.15,(21.25-time)/2.0))
                    cx+=detail*(.077 if portrait else .07)
                    cy+=detail*.10
                    sx-=detail*(.12 if portrait else .15)
                    sy-=detail*(.24 if portrait else .20)
                if hold is not None:
                    breath=.012*math.sin(math.pi*hold/(HOLD-1))**2
                    sx*=1-breath
                    sy*=1-breath
                # Preserve photographed material at the edges throughout the move.
                cx=max(sx/2,min(1-sx/2,cx))
                cy=max(sy/2,min(1-sy/2,cy))
                size=frame.shape[0]
                x,y=np.meshgrid(np.float32((cx+sx*u)*size-.5),np.float32((cy+sy*v)*size-.5))
                view=cv2.remap(frame,x,y,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
            encoder.stdin.write(view.tobytes())
            if hold==FPS:
                suffix='' if portrait else '-wide'
                Image.fromarray(view[:,:,::-1]).save(out/f'film-{STOPS[i]}{suffix}.webp',quality=91)
        encoder.stdin.close()
        if encoder.wait() or count+1 != FLIGHT*4+HOLD*5:
            raise RuntimeError('Incomplete film export')
    tmp.replace(target)
    print(f'{edition}/{framing}: {count+1} frames',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('edition',choices=[*COMPOSITION,'pass-the-salsa'])
    parser.add_argument('framing',choices=['wide','portrait'])
    args=parser.parse_args()
    cv2.setNumThreads(1)
    export(args.edition,args.framing)
