#!/usr/bin/env python3
"""Reproducible existing-pixel repair of the first wide camera take.

Keep all 145 original camera frames at 24 fps. Composite only frames 100–131
using clean donor frames 99/135 and clean pixels from the current camera frame.
Frame 106 retains the native grounded lime; a fixed photographic sphere follows
the short visible flight in 107–113; the native landing remains from 114 onward
with a narrow left-rim correction in 128–131. Frames 0–99 and 132–144 are not
composited. No generative model, optical flow, frame retiming, or scene cut is
used. Each encoded result still requires the pipeline's independent media QA.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.interpolate import PchipInterpolator
from scipy.spatial import ConvexHull
from scipy.ndimage import binary_closing, binary_fill_holes, distance_transform_edt
from lime_surface import RigidLimeTurn


def track(points, frame):
    keys = np.array(sorted(map(int, points)), dtype=float)
    values = np.array([points[str(int(k))] for k in keys], dtype=float)
    return np.asarray(PchipInterpolator(keys, values, axis=0)(np.clip(frame, keys[0], keys[-1])))


def homography(source, target):
    rows, values = [], []
    for (x, y), (u, v) in zip(source, target):
        rows += [[x, y, 1, 0, 0, 0, -u*x, -u*y], [0, 0, 0, x, y, 1, -v*x, -v*y]]
        values += [u, v]
    return np.append(np.linalg.solve(np.asarray(rows), np.asarray(values)), 1).reshape(3, 3)


def warp(image, matrix, size):
    inverse = np.linalg.inv(matrix)
    inverse /= inverse[2, 2]
    return image.transform(size, Image.Transform.PERSPECTIVE, tuple(inverse.flat)[:8], Image.Resampling.BICUBIC)


def shape_mask(size, shapes, scale, feather=1):
    result = Image.new("L", size)
    draw = ImageDraw.Draw(result)
    for kind, coords in shapes:
        if kind == "polygon":
            draw.polygon([(round(x*scale), round(y*scale)) for x, y in coords], fill=255)
        else:
            getattr(draw, kind)(tuple(round(v*scale) for v in coords), fill=255)
    return result.filter(ImageFilter.GaussianBlur(feather*scale)) if feather else result


def overlay(base, image, mask):
    return Image.composite(image, base, mask)


def clone_patch(base, box, donor, scale, mask=None):
    box = tuple(round(v*scale) for v in box)
    donor = tuple(round(v*scale) for v in donor)
    result = base.copy()
    patch = base.crop(donor).resize((box[2]-box[0], box[3]-box[1]), Image.Resampling.BICUBIC)
    result.paste(patch, box[:2])
    return overlay(base, result, mask) if mask is not None else result


def frames(path, width, select=None):
    height = width*9//16
    vf = f"scale={width}:{height}:flags=lanczos"
    if select:
        vf = "select='" + "+".join(f"eq(n,{n})" for n in select) + "'," + vf
    command = ["ffmpeg", "-v", "error", "-nostdin", "-threads", "2", "-i", str(path),
               "-filter_threads", "1", "-vf", vf, "-fps_mode", "passthrough", "-an",
               "-pix_fmt", "rgb24", "-c:v", "rawvideo", "-threads", "1", "-f", "rawvideo", "pipe:1"]
    process = subprocess.Popen(command, stdout=subprocess.PIPE)
    count = len(select) if select else 145
    try:
        for _ in range(count):
            raw = process.stdout.read(width*height*3)
            if len(raw) != width*height*3:
                raise ValueError("Short source decode")
            yield Image.frombytes("RGB", (width, height), raw)
        if process.stdout.read(1):
            raise ValueError("Unexpected additional source frames")
        if process.wait():
            raise ValueError("Source decoder failed")
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.terminate()
            process.wait()


def clean_tag_fringe(result, original, transform, scale, frame, front_slope,
                     counter_left, counter_front, native_lime=None):
    if not 100 <= frame <= 131:
        return result
    # Coordinates are relative to the clean source135 tag, not the paper plane.
    corners = np.array([[265, 490], [390, 460], [390, 502], [265, 532]], float)
    mapped = np.c_[corners * scale, np.ones(4)] @ transform.T
    mapped = mapped[:, :2] / mapped[:, 2:]
    x0 = max(0, math.floor(mapped[:, 0].min()) - 8)
    y0 = max(0, math.floor(mapped[:, 1].min()) - 8)
    x1 = min(result.width, math.ceil(mapped[:, 0].max()) + 8)
    y1 = min(result.height, math.ceil(mapped[:, 1].max()) + 8)
    if x1 <= x0 or y1 <= y0:
        return result
    yy, xx = np.mgrid[y0:y1, x0:x1]
    inv = np.linalg.inv(transform)
    q = np.stack([xx, yy, np.ones_like(xx)], axis=-1) @ inv.T
    u, v = q[..., 0] / q[..., 2] / scale, q[..., 1] / q[..., 2] / scale
    bottom = 500 - (u - 274) * (24 / 107)
    band = (u >= 265) & (u <= 390) & (v >= bottom - 4) & (v <= bottom + 24)
    # Prevent any wood sample from crossing the front fascia or the arriving lime.
    front = counter_front + front_slope * (xx / scale - counter_left)
    band &= yy / scale < front - 1
    if native_lime is not None:
        lx, ly, lr = native_lime
        band &= ((xx / scale - lx) / (lr + 8)) ** 2 + ((yy / scale - ly) / (lr + 8)) ** 2 > 1
    rgb = np.asarray(original.crop((x0, y0, x1, y1)), dtype=np.float32)
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cyan = (blue > red * 1.10) & (blue > 65) & (blue - red > 18)
    rim = (red - green > 65) & (red - blue > 40) & (blue > green * .65)
    seed = (cyan | rim) & band
    if not seed.any():
        return result
    # Close the silhouette; do not leave black outline holes between color samples.
    close_n = max(1, round(1.5 * scale))
    yy_k, xx_k = np.mgrid[-close_n:close_n+1, -close_n:close_n+1]
    disk = xx_k**2 + yy_k**2 <= close_n**2
    mask = binary_closing(seed, structure=disk)
    mask = binary_fill_holes(mask)
    expand_n = max(1, round(8 * scale))
    mask = (distance_transform_edt(~mask) <= expand_n) & band
    alpha = Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.5 * scale))
    dx, dy = 30 * scale, (20 + 30 * front_slope) * scale
    donor = original.transform((x1-x0, y1-y0), Image.Transform.AFFINE,
                               (1, 0, x0+dx, 0, 1, y0+dy), Image.Resampling.BICUBIC)
    local = Image.composite(donor, result.crop((x0, y0, x1, y1)), alpha)
    out = result.copy()
    out.paste(local, (x0, y0))
    return out


class Repair:
    def __init__(self, source99, source135, params):
        self.p = params
        self.size = source99.size
        self.s = self.size[0]/960
        s = self.s
        self.original99 = source99
        self.arrival = source135
        self.lime_turn = RigidLimeTurn(source99,source135)
        yy,xx=np.mgrid[0:self.size[1],0:self.size[0]]
        rgb=np.asarray(source135).astype(float)
        silhouette=((xx/s-490.5)/64)**2+((yy/s-459)/63)**2<1
        green=(rgb[...,1]>rgb[...,0]*.9)&(rgb[...,1]>rgb[...,2]*1.5)
        points=np.column_stack(np.nonzero(silhouette&green))[:,::-1]
        hull=ConvexHull(points)
        matte=Image.new("L",self.size)
        ImageDraw.Draw(matte).polygon([tuple(point) for point in points[hull.vertices]],fill=255)
        self.arrival_lime_mask=matte.filter(ImageFilter.GaussianBlur(.6*s))
        rim=np.asarray(self.arrival_lime_mask).copy()
        rim[xx/s>470]=0
        self.arrival_lime_rim=Image.fromarray(rim).filter(ImageFilter.GaussianBlur(1.2*s))
        self.paper_mask = shape_mask(self.size, [("polygon", [(329,62),(635,62),(650,383),(326,383)])], s, .8)
        self.base_mask = shape_mask(self.size, [("polygon", [(326,383),(650,383),(675,472),(333,477)])], s, 1.2)
        # Remove the duplicate from its two distinct backing surfaces.
        self.empty = clone_patch(source135, (417,390,572,474), (560,390,645,474), s)
        self.empty = clone_patch(self.empty, (415,474,675,540), (690,474,950,540), s)
        # Existing plain panel/table texture supplies narrow old-tag edge gaps.
        self.empty = clone_patch(self.empty, (246,270,385,401), (720,270,859,401), s)
        self.empty = clone_patch(self.empty, (246,401,385,505), (740,401,879,505), s)
        # The old tag crosses the orange base as well as the tabletop. Keep
        # the orange plane and its lower stripe behind the independent tag.
        base_gap=shape_mask(self.size,[("rectangle",(326,378,390,477))],s,0)
        base_gap=Image.fromarray(np.minimum(np.asarray(base_gap),np.asarray(self.base_mask)))
        self.empty=clone_patch(self.empty,(326,378,390,477),(560,378,624,477),s,base_gap)
        body = [(286,327),(329,327),(350,361),(381,476),(274,500),(252,397),(259,366)]
        self.tag_mask = shape_mask(self.size, [("polygon", body)], s, .7)
        ring = shape_mask(self.size, [("polygon", [(305,269),(330,273),(337,286),(329,307),(315,331),(292,347),(277,340),(278,326),(289,300)])], s, .6)
        inner = shape_mask(self.size, [("polygon", [(306,279),(323,282),(326,292),(317,310),(306,326),(292,337),(284,331),(287,320),(298,296)])], s, .6)
        self.tag_mask = Image.fromarray(np.maximum(np.asarray(self.tag_mask), np.maximum(np.asarray(ring,dtype=int)-np.asarray(inner,dtype=int),0)).astype("uint8"))
        # Preserve the photographed orange plane, stripe and tag shadow wherever
        # the clean reference exposes them. Reconstruction is only needed under
        # its tag/lime footprints; rectangular clone boundaries stay covered.
        # The color-derived arrival matte is intentionally tight for rim repair.
        # Base restoration needs the whole photographed lime, including its
        # darker right peel/stem, excluded with a small photographic margin.
        reference_lime=shape_mask(self.size,[("ellipse",(425,395,557,524))],s,0)
        reference_lime=Image.fromarray(np.maximum(np.asarray(reference_lime),np.asarray(self.arrival_lime_mask)))
        occluders=Image.fromarray(np.maximum(np.asarray(self.tag_mask),np.asarray(reference_lime)))
        occluders=occluders.filter(ImageFilter.MaxFilter(2*round(2*s)+1)).filter(ImageFilter.GaussianBlur(.7*s))
        self.clean_base_mask=Image.fromarray(np.minimum(np.asarray(self.base_mask),255-np.asarray(occluders)))
        # Wheel backing plate is separate from both wooden surfaces.
        self.wheel = clone_patch(source99, (315,385,401,540), (617,385,703,540), s)
        geometry = params["wheel_geometry"]
        wm = shape_mask(self.size,[("polygon",geometry["source_outline"])],s,0)
        exclude = shape_mask(self.size,[("polygon",geometry["source_table_exclusion"]),("ellipse",geometry["source_lime_exclusion"])],s,0)
        exclude = exclude.filter(ImageFilter.MaxFilter(2*round(4*s)+1))
        self.wheel_mask = Image.fromarray(np.minimum(np.asarray(wm),255-np.asarray(exclude))).filter(ImageFilter.GaussianBlur(.7*s))
        self.green_valid = shape_mask(self.size,[("rectangle",(315,303,735,540))],s,2)

    def render(self, original, frame):
        if not self.p["repair_first"] <= frame <= self.p["repair_last"]:
            return original.copy()
        s = self.s
        source_quad = np.asarray(self.p["plate_quad"])*s
        target_quad = track(self.p["target_quads"], frame)*s
        H = homography(source_quad, target_quad)
        plate = warp(self.arrival, H, self.size)
        empty = warp(self.empty, H, self.size)
        valid = np.asarray(warp(Image.new("L",self.size,255),H,self.size)) > 250
        result = original.copy()
        yy, xx = np.mgrid[0:self.size[1],0:self.size[0]]
        X, Y = xx/s, yy/s
        left, back, front = track(self.p["counter"], frame)
        front_slope, thickness = track(self.p["counter_edge"],frame)
        table_end, old_back, old_slope = track(self.p["old_table"], frame)
        old_table = (X <= table_end) & (Y >= old_back+old_slope*X)
        front_line=front+front_slope*(X-left)
        counter_top = (X >= left) & (Y >= back-.055*(X-left)-8) & (Y <= front_line)
        counter_face = (X >= left) & (Y > front_line)
        dx,dy,dr=track(self.p["duplicate_lime"],frame)
        native_lime = shape_mask(self.size,[("ellipse",(dx-dr-3,dy-dr-3,dx+dr+3,dy+dr+3)),
                                          ("ellipse",(dx-8,dy+dr-8,dx+dr+80,dy+dr+24))],s,1)
        arrival_transform=None
        if 128<=frame<=131:
            z=dr/61.5
            arrival_transform=np.array([[z,0,(dx-z*490.5)*s],[0,z,(dy-z*459)*s],[0,0,1]])
            shadow_mask=shape_mask(self.size,[("ellipse",(dx-8,dy+dr-8,dx+dr+80,dy+dr+24))],s,1)
            precise=np.maximum(np.asarray(warp(self.arrival_lime_mask,arrival_transform,self.size)),np.asarray(shadow_mask))
            protection=np.asarray(native_lime).copy()
            only_left=X<dx-dr*.3
            protection[only_left]=precise[only_left]
            native_lime=Image.fromarray(protection)
        protect=np.asarray(native_lime) if frame>=self.p["landing"] else np.zeros((self.size[1],self.size[0]),dtype="uint8")

        # Track the original photographed wheel on its separate background plane.
        if frame <= 117:
            ax, ay = track(self.p["wheel_arch"], frame)
            geometry=self.p["wheel_geometry"]
            source_points=np.asarray(geometry["source_points"],float)
            original_offsets=source_points-[447,326]
            final_offsets=np.asarray(geometry["target_points"],float)-[194,388]
            amount=np.clip((frame-99)/13,0,1)
            target_points=[ax,ay]+(1-amount)*original_offsets+amount*final_offsets
            M=homography(source_points*s,target_points*s)
            wheel = warp(self.original99, M, self.size)
            mask = np.asarray(warp(self.wheel_mask, M, self.size)).copy()
            mask[old_table | counter_top | counter_face] = 0
            if frame <= self.p["takeoff"]:
                ox,oy,rr=track(self.p["moving_lime"],frame)
                mask[((X-ox)/(rr+5))**2+((Y-oy)/(rr+5))**2 <= 1] = 0
            else:
                ox,oy,rr=track(self.p["moving_lime"],frame)
                missing=shape_mask(self.size,[("ellipse",(ox-rr-7,oy-rr-7,ox+rr+7,oy+rr+7))],s,3)
                coverage=np.minimum(np.asarray(missing),np.asarray(warp(self.green_valid,M,self.size)))
                coverage[old_table | counter_top | counter_face]=0
                result=overlay(result,warp(self.wheel,M,self.size),Image.fromarray(coverage))
            result = overlay(result, wheel, Image.fromarray(mask))

        # Suppress the stationary duplicate, preserving orange base/table split.
        if 105 <= frame < self.p["landing"]:
            dx, dy, dr = track(self.p["duplicate_lime"], frame)
            dm = shape_mask(self.size, [("ellipse", (dx-dr-5,dy-dr-5,dx+dr+7,dy+dr+7)),
                                       ("ellipse", (dx-10,dy+dr-8,dx+dr+80,dy+dr+24))], s, 3)
            result = overlay(result, empty, Image.fromarray((np.asarray(dm)*valid).astype("uint8")))

        # Erase the old position only after takeoff. Each backing surface is
        # handled separately; no table rectangle is pasted across the tire.
        if frame > self.p["takeoff"]:
            ox, oy, radius = track(self.p["moving_lime"], frame)
            mask = shape_mask(self.size, [("ellipse", (ox-radius-5,oy-radius-5,ox+radius+5,oy+radius+7)),
                                         ("ellipse", (ox-radius+8,oy+radius-7,ox+radius+35,oy+radius+16))], s, 3)
            old_mask = np.asarray(mask)
            old_mask=np.minimum(old_mask,255-protect)
            # Old tabletop donor: existing wood from the same frame, left of
            # the lime. This provisional clone remains a visual-review gate.
            table_donor = original.transform(self.size, Image.Transform.AFFINE, (1,0,-180*s,0,1,0), Image.Resampling.BICUBIC)
            result = overlay(result, table_donor, Image.fromarray((old_mask*old_table).astype("uint8")))
            # Sample clean wood from the same camera frame, preserving each
            # surface's front/back geometry instead of using the paper plane.
            xl=max(left+1,ox-radius-9); xr=ox+radius+9
            if xl<xr:
                dl,dr=track(self.p["table_donor_x"],frame)
                def surface_quad(a,b,upper,lower):
                    return np.array([[a,upper(a)],[b,upper(b)],[b,lower(b)],[a,lower(a)]])*s
                upper=lambda x:back-.055*(x-left)
                lower=lambda x:front+front_slope*(x-left)
                W=homography(surface_quad(dl,dr,upper,lower),surface_quad(xl,xr,upper,lower))
                wood=warp(original,W,self.size)
                wm=(old_mask*counter_top).astype("uint8")
                result=overlay(result,wood,Image.fromarray(wm))
                # Fascia and dark vertical panel travel on their own plane.
                face_lower=lambda x:lower(x)+thickness+130
                F=homography(surface_quad(dl,dr,lower,face_lower),surface_quad(xl,xr,lower,face_lower))
                face=warp(original,F,self.size)
                face_valid=np.asarray(warp(Image.new("L",self.size,255),F,self.size))>250
                result=overlay(result,face,Image.fromarray((old_mask*counter_face*face_valid).astype("uint8")))

        # Stabilize lettering using the existing paper and orange front plane.
        result = overlay(result, plate, warp(self.paper_mask, H, self.size))
        # Tag gets its own rigid similarity track, independent of the paper.
        neck_x, neck_y, bottom_x, bottom_y = track(self.p["tag_pose"], frame)
        v0 = np.array([20.,151.]); v1 = np.array([bottom_x-neck_x,bottom_y-neck_y])
        scale = np.linalg.norm(v1)/np.linalg.norm(v0)
        angle = math.atan2(v1[1],v1[0])-math.atan2(v0[1],v0[0])
        a,b = scale*math.cos(angle), scale*math.sin(angle)
        tx = neck_x-(a*305-b*338); ty = neck_y-(b*305+a*338)
        T = np.array([[a,-b,tx*s],[b,a,ty*s],[0,0,1]])
        result=clean_tag_fringe(result,original,T,s,frame,front_slope,left,front,
                                track(self.p["duplicate_lime"],frame) if frame>=self.p["landing"] else None)
        # The orange base occludes the tabletop fringe cleanup.
        base_alpha=np.minimum(np.asarray(warp(self.base_mask,H,self.size)),255-protect)
        result = overlay(result, empty,Image.fromarray(base_alpha))
        clean_base_alpha=np.minimum(np.asarray(warp(self.clean_base_mask,H,self.size)),255-protect)
        result=overlay(result,plate,Image.fromarray(clean_base_alpha))
        result = overlay(result, warp(self.arrival,T,self.size), warp(self.tag_mask,T,self.size))

        if arrival_transform is not None:
            result=overlay(result,warp(self.arrival,arrival_transform,self.size),warp(self.arrival_lime_rim,arrival_transform,self.size))

        if self.p["takeoff"] < frame < self.p["landing"]:
            start, land = self.p["takeoff"], self.p["landing"]
            t = np.clip((frame-start)/(land-start),0,1)
            if frame <= land:
                x0,y0,r0 = track(self.p["moving_lime"],start)
                x1,y1,r1 = track(self.p["duplicate_lime"],land)
                # Linear projected travel + parabolic vertical flight. The
                # sprite remains rigid; only uniform scale/rotation changes.
                x = (1-t)*x0+t*x1
                ground_y = (1-t)*(y0+r0)+t*(y1+r1)
                radius = (1-t)*r0+t*r1
                height = self.p["jump_height"]*4*t*(1-t)
                y = ground_y-radius-height
            else:
                x,y,radius = track(self.p["duplicate_lime"],frame)
                ground_y=y+radius; height=0
            shadow = Image.new("L",self.size)
            draw = ImageDraw.Draw(shadow)
            opacity = round(72*(1-.65*min(height/self.p["jump_height"],1)))
            rx = radius*(.58+.25*min(height/self.p["jump_height"],1))
            ry = radius*.10
            draw.ellipse(((x-rx)*s,(ground_y-ry)*s,(x+rx)*s,(ground_y+ry)*s),fill=opacity)
            shadow=shadow.filter(ImageFilter.GaussianBlur(float((1.8+height*.04)*s)))
            result = overlay(result,Image.new("RGB",self.size,(20,25,6)),shadow)
            flight=land-start
            vx=(x1-x0)/flight
            vy=((y1-y0)-4*self.p["jump_height"]*(1-2*t))/flight
            sprite=self.lime_turn.exposed_sprite(radius*s,t,(vx*s,vy*s),flight_frames=flight)
            result.paste(sprite,(round(x*s-sprite.width/2),round(y*s-sprite.height/2)),sprite)
        return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--params",type=Path,default=Path(__file__).with_suffix(".json"))
    parser.add_argument("--width",type=int,default=960,choices=(960,3840))
    args=parser.parse_args()
    p=json.loads(args.params.read_text())
    refs=list(frames(args.input,args.width,[99,135]))
    repair=Repair(*refs,p)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    review=args.output.parent/(args.output.stem+"-review");review.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".repair-",dir=args.output.parent) as temp:
        target=Path(temp)/args.output.name
        crf=10 if args.width==3840 else 16
        encoder=subprocess.Popen(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{args.width}x{args.width*9//16}","-r","24","-i","pipe:0","-an","-c:v","libx264","-threads","2","-preset","fast","-crf",str(crf),"-pix_fmt","yuv420p","-movflags","+faststart",str(target)],stdin=subprocess.PIPE)
        for n,original in enumerate(frames(args.input,args.width)):
            output=repair.render(original,n)
            encoder.stdin.write(output.tobytes())
            if n in [99,100,104,105,106,107,108,110,112,113,114,115,116,120,124,128,130,131,132,134,135]:
                output.resize((960,540),Image.Resampling.LANCZOS).save(review/f"f-{n:03d}.jpg",quality=95)
            if n%24==0:print(f"Opening transition repair {n}/145",flush=True)
            output.close();original.close()
        encoder.stdin.close()
        if encoder.wait():raise RuntimeError("Repair encoder failed")
        target.replace(args.output)
    provenance={
        "status":"Rendered; requires independent media QA before release",
        "frames":145,"fps":24,"width":args.width,"height":args.width*9//16,"crf":crf,
        "source":str(args.input),"changed_frames":[p["repair_first"],p["repair_last"]],
        "uncomposited_source_frames":[[0,99],[132,144]],
        "clean_donor_frames":[99,135],"uses_current_frame_clean_donors":True,
        "native_grounded_takeoff_frame":106,"rigid_airborne_frames":[107,113],
        "native_arrival_frames":[114,144],"arrival_left_rim_repair_frames":[128,131],
        "retiming":False,"frame_interpolation":False,"scene_cuts_added":False,
        "review_gates":["native detail and clone boundaries","105–107 takeoff","113–114 landing","131–132 return to source"]
    }
    (review/"review-status.json").write_text(json.dumps(provenance,indent=2)+"\n")
    print(args.output,flush=True)


if __name__=="__main__":main()
