#!/usr/bin/env python3
"""Render the selected Free Lunch film from enhanced camera takes.

The source directory must contain wide/00.mp4 through wide/03.mp4 and/or
portrait/00.mp4 through portrait/03.mp4. Each take is exactly 145 frames at
24 fps. Only the requested framing is read. Example:

    python3 scripts/render-quality-editions.py wide --source-dir /path/to/enhanced

The default camera mode keeps native-rate camera travel, the five 58-frame
reading holds, the original breathing crop, and the lookup lens match. Reviewed
defect intervals can be removed with --cuts-config; retained frames remain at
24 fps, and the clean final photograph fills the removed time. There is no
frame interpolation, speed change, crossfade, or additional reframing.
Use --source-override TAKE=PATH to replace only a reviewed, repaired take;
overrides must already have the same 24 fps / 145-frame source timing. Reading
holds and posters always use the photographs in --source-dir, even when a
moving take is overridden. When all four wide takes are overridden, reading
photographs stay at the approved hold-24 poster crop with a shared 2% overscan.
Reviewed whole-image scale and translation align the original opening and the
three replacement camera takes to those photographs without exposing an image
edge. There is no additional breathing zoom or lookup lens adjustment. Local
source compositing is performed separately by the documented repair script.

The previous five-photograph treatment remains available with --motion fixed.
That archival mode selects only frame 0 of each take and frame 144 of take 03,
using hard cuts and a uniform center zoom of at most 1.5% between reading stops.

Requires FFmpeg, ffprobe, and Pillow. Frames are streamed through memory; no
lossless intermediate film is written. All deliverables are staged and checked
before replacing existing files. The duration remains 866 frames at 24 fps.
Use --plan-only to inspect and validate either frame plan without reading
source media or rendering files. This renderer does not repair source defects;
camera-mode source replacements must pass their motion review before export.
"""

from __future__ import annotations

import argparse
from contextlib import ExitStack, closing, suppress
from dataclasses import dataclass
from fractions import Fraction
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import time

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FPS = 24
FLIGHT = 144
HOLD = 58
TOTAL_FRAMES = 4 * FLIGHT + 5 * HOLD
STOPS = ("offer", "lookup", "text", "swap", "close")
MAX_BYTES = 100_000_000
CUT_FRAMES = (136, 353, 548, 730)
READING_FRAMES = (0, 202, 404, 606, 808)
CAMERA_CUT_FRAMES = READING_FRAMES[1:]
READING_BEFORE = Fraction(16, 100) * FPS
READING_AFTER = Fraction(257, 100) * FPS
MAX_ZOOM = 1.015
# The original first wide take and three replacement takes each receive one
# CONSTANT uniform transform, averaged from their two endpoint fits:
# (scale, horizontal translation / width, vertical translation / height).
# A common 2% overscan on both photographs and motion provides genuine image
# pixels around the translated edges. No transform changes during a take, and
# no individual object is warped. These values apply only to all-four-wide
# override exports; original/partial source exports and portrait are unchanged.
WIDE_POSTER_OVERSCAN = 1.02
WIDE_MOTION_ALIGNMENT = (
    (1.00593465, -.00000032, -.00006128),
    (1.01879, .00909, .01699),
    (1.01859, .00902, .01681),
    (1.01946, .00842, .01613),
)
# Inclusive source-frame exclusions. Supplied JSON entries override this map;
# it uses {"wide":{"00":[[start,end],...]},"portrait":{...}}. Empty lists
# explicitly retain a fully reviewed take, including a clean replacement.
DEFAULT_EXCLUSIONS = {
    "wide": {0: ((96, 134),), 1: ((72, 120),), 2: ((84, 113),), 3: ((42, 122),)},
    "portrait": {0: ((66, 111),), 1: (), 2: (), 3: ((31, 62), (106, 122))},
}


@dataclass(frozen=True)
class Rendition:
    suffix: str
    width: int
    height: int
    level: str
    maxrate: int


@dataclass(frozen=True)
class PlannedFrame:
    number: int
    anchor: int
    zoom: float


@dataclass(frozen=True)
class CameraPlannedFrame:
    number: int
    take: int
    source_frame: int
    anchor: int
    hold: int | None
    padding: bool = False


# The 1080 x 2340 portrait exceeds Level 4.1's 8,192 macroblocks per frame;
# Level 5.0 is required for a compliant full-height portrait master.
RENDITIONS = {
    "wide": (
        Rendition("-4k", 3840, 2160, "5.1", 18_000),
        Rendition("", 1920, 1080, "4.1", 8_000),
        Rendition("-720", 1280, 720, "4.1", 4_000),
    ),
    "portrait": (
        Rendition("", 1080, 2340, "5.0", 7_000),
        Rendition("-720", 720, 1560, "4.1", 3_200),
    ),
}


def log(message):
    print(message, flush=True)


def probe(path, *, count_frames=False):
    command = ["ffprobe", "-v", "error", "-select_streams", "v:0"]
    if count_frames:
        command.append("-count_frames")
    command += ["-show_streams", "-show_format", "-of", "json", str(path)]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise ValueError(f"Cannot probe {path}: {result.stderr.strip()}")
    data = json.loads(result.stdout)
    if not data.get("streams"):
        raise ValueError(f"No video stream in {path}")
    return data["streams"][0], data.get("format", {})


def integer(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def frame_count(path, stream):
    count = integer(stream.get("nb_frames"))
    if count is None:
        counted, _ = probe(path, count_frames=True)
        count = integer(counted.get("nb_read_frames"))
    if count is None:
        raise ValueError(f"Cannot determine frame count for {path}")
    return count


def require_fps(path, stream):
    for field in ("r_frame_rate", "avg_frame_rate"):
        try:
            rate = Fraction(stream[field])
        except (KeyError, ValueError, ZeroDivisionError):
            raise ValueError(f"Invalid {field} in {path}") from None
        if rate != FPS:
            raise ValueError(f"Expected {FPS} fps in {path}, got {field}={rate}")


def validate_sources(folder, overrides=None):
    overrides = overrides or {}
    paths = [overrides.get(i, folder / f"{i:02d}.mp4") for i in range(4)]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise ValueError("Missing source takes: " + ", ".join(missing))
    sources = []
    for index, path in enumerate(paths):
        stream, _ = probe(path)
        require_fps(path, stream)
        count = frame_count(path, stream)
        if count != FLIGHT + 1:
            raise ValueError(f"Expected {FLIGHT + 1} frames in {path}, got {count}")
        width, height = int(stream["width"]), int(stream["height"])
        if width < 2 or height < 2:
            raise ValueError(f"Invalid dimensions in {path}: {width} x {height}")
        if stream.get("sample_aspect_ratio", "1:1") not in ("1:1", "N/A"):
            raise ValueError(f"Expected square source pixels in {path}")
        rotations = [side.get("rotation", 0) for side in stream.get("side_data_list", [])]
        rotations.append(stream.get("tags", {}).get("rotate", 0))
        if any(float(rotation) % 360 for rotation in rotations):
            raise ValueError(f"Bake the source rotation into its pixels first: {path}")
        log(f"Source {index:02d}: {path} ({width} x {height}, {count} frames, {FPS} fps)")
        sources.append((path, width, height))
    return sources


def error_tail(logfile):
    logfile.flush()
    logfile.seek(0, 2)
    logfile.seek(max(0, logfile.tell() - 8_000))
    return logfile.read().decode("utf-8", errors="replace").strip()


def stop_process(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def source_frames(sources, threads, plan):
    """Decode native frames once, selecting the explicit cut/arrival-hold plan."""
    for index, (path, width, height) in enumerate(sources):
        selections = [[] for _ in range(FLIGHT + 1)]
        for planned in plan:
            if planned.take == index:
                selections[planned.source_frame].append(planned)
        command = [
            "ffmpeg", "-hide_banner", "-v", "error", "-nostdin", "-xerror",
            "-threads", str(threads), "-noautorotate", "-i", str(path),
            "-map", "0:v:0", "-an", "-sn", "-dn", "-fps_mode", "passthrough",
            "-pix_fmt", "rgb24", "-c:v", "rawvideo", "-threads", str(threads),
            "-f", "rawvideo", "pipe:1",
        ]
        frame_bytes = width * height * 3
        with tempfile.TemporaryFile() as errors:
            decoder = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors)
            try:
                for number in range(FLIGHT + 1):
                    data = decoder.stdout.read(frame_bytes)
                    if len(data) != frame_bytes:
                        raise RuntimeError(
                            f"Short source {path} at frame {number}: {error_tail(errors)}"
                        )
                    with Image.frombytes("RGB", (width, height), data) as frame:
                        for planned in selections[number]:
                            yield frame, planned
                if decoder.stdout.read(1):
                    raise RuntimeError(f"More than {FLIGHT + 1} decoded frames in {path}")
                if decoder.wait():
                    raise RuntimeError(f"Decoder failed for {path}: {error_tail(errors)}")
            finally:
                decoder.stdout.close()
                stop_process(decoder)


def source_anchors(sources, threads):
    """Decode only four opening photographs and the last closing photograph.

    FFmpeg discards all other source frames before they can reach this process.
    The two selected frames of take 03 become separate fixed anchors.
    """
    for index, (path, width, height) in enumerate(sources):
        numbers = (0, FLIGHT) if index == 3 else (0,)
        selection = "+".join(f"eq(n,{number})" for number in numbers)
        command = [
            "ffmpeg", "-hide_banner", "-v", "error", "-nostdin", "-xerror",
            "-threads", str(threads), "-noautorotate", "-i", str(path),
            "-map", "0:v:0", "-an", "-sn", "-dn", "-fps_mode", "passthrough",
            "-filter_threads", str(threads), "-vf", f"select='{selection}'",
            "-frames:v", str(len(numbers)),
            "-pix_fmt", "rgb24", "-c:v", "rawvideo", "-threads", str(threads),
            "-f", "rawvideo", "pipe:1",
        ]
        frame_bytes = width * height * 3
        with tempfile.TemporaryFile() as errors:
            decoder = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors)
            try:
                for number in numbers:
                    data = decoder.stdout.read(frame_bytes)
                    if len(data) != frame_bytes:
                        raise RuntimeError(
                            f"Short source {path} at frame {number}: {error_tail(errors)}"
                        )
                    with Image.frombytes("RGB", (width, height), data) as frame:
                        yield frame, index if number == 0 else 4
                if decoder.stdout.read(1):
                    raise RuntimeError(f"Unexpected additional anchor from {path}")
                if decoder.wait():
                    raise RuntimeError(f"Decoder failed for {path}: {error_tail(errors)}")
            finally:
                decoder.stdout.close()
                stop_process(decoder)


def ease(value):
    return (1 - math.cos(math.pi * min(1, max(0, value)))) / 2


def normalize_intervals(intervals):
    if not isinstance(intervals, (list, tuple)):
        raise ValueError("Excluded intervals must be a list of [first,last] source-frame pairs")
    checked = []
    for pair in intervals:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2 or any(type(n) is not int for n in pair):
            raise ValueError(f"Invalid inclusive excluded interval: {pair}")
        first, last = pair
        if not 1 <= first <= last < FLIGHT:
            raise ValueError(f"Exclusions must preserve source frames 0 and {FLIGHT}: {pair}")
        checked.append((first, last))
    merged = []
    for first, last in sorted(checked):
        if merged and first <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(last, merged[-1][1]))
        else:
            merged.append((first, last))
    return tuple(merged)


def load_exclusions(path=None):
    """JSON entries override reviewed defaults; [] explicitly clears one take."""
    result = {framing: {take: normalize_intervals(intervals) for take, intervals in cuts.items()}
              for framing, cuts in DEFAULT_EXCLUSIONS.items()}
    if path is None:
        return result
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict) or any(key not in RENDITIONS for key in data):
        raise ValueError("Cut configuration must contain only wide and/or portrait objects")
    for framing, takes in data.items():
        if not isinstance(takes, dict):
            raise ValueError(f"Cut configuration for {framing} must be an object keyed by take")
        seen = set()
        for take, intervals in takes.items():
            index = integer(take)
            if index not in range(4) or index in seen:
                raise ValueError(f"Invalid or repeated take in {framing} cuts: {take}")
            seen.add(index)
            result[framing][index] = normalize_intervals(intervals)
    return result


def build_camera_plan(exclusions=None):
    exclusions = exclusions or {}
    plan = []
    for take in range(4):
        intervals = normalize_intervals(exclusions.get(take, ()))
        excluded = {number for first, last in intervals for number in range(first, last + 1)}
        for hold in range(HOLD):
            plan.append(CameraPlannedFrame(len(plan), take, 0, take, hold))
        # Source frame zero is already present in the reading hold. Native
        # moving frames 1..144 occupy exactly 144 slots before any exclusions.
        for source_frame in range(1, FLIGHT + 1):
            if source_frame not in excluded:
                plan.append(CameraPlannedFrame(len(plan), take, source_frame, take, None))
        for _ in range(len(excluded)):
            plan.append(CameraPlannedFrame(len(plan), take, FLIGHT, take, None, True))
    for hold in range(HOLD):
        plan.append(CameraPlannedFrame(len(plan), 3, FLIGHT, 4, hold))
    result = tuple(plan)
    validate_camera_plan(result, exclusions)
    return result


def validate_camera_plan(plan, exclusions=None):
    if len(plan) != TOTAL_FRAMES:
        raise ValueError(f"Camera plan must contain {TOTAL_FRAMES} frames")
    for number, frame in enumerate(plan):
        if frame.number != number or frame.take not in range(4):
            raise ValueError(f"Invalid camera frame at {number}")
        if not 0 <= frame.source_frame <= FLIGHT or frame.anchor not in range(5):
            raise ValueError(f"Invalid source selection at {number}")
    for take in range(4):
        flight = [frame for frame in plan if frame.take == take and frame.hold is None]
        native = [frame.source_frame for frame in flight if not frame.padding]
        padding = [frame for frame in flight if frame.padding]
        if not native or native != sorted(set(native)) or native[0] < 1 or native[-1] != FLIGHT:
            raise ValueError(f"Camera move {take:02d} has reordered frames or a missing clean arrival")
        if any(frame.anchor != take for frame in flight):
            raise ValueError(f"Camera move {take:02d} selects a different shot")
        if [frame.padding for frame in flight] != [False] * len(native) + [True] * len(padding):
            raise ValueError(f"Camera move {take:02d} inserts held frames inside native travel")
        if any(frame.source_frame != FLIGHT for frame in padding):
            raise ValueError(f"Camera move {take:02d} pads with a frame other than the clean arrival")
        if exclusions is not None:
            intervals = normalize_intervals(exclusions.get(take, ()))
            excluded = {n for first, last in intervals for n in range(first, last + 1)}
            if native != [n for n in range(1, FLIGHT + 1) if n not in excluded] or len(padding) != len(excluded):
                raise ValueError(f"Camera move {take:02d} does not match its reviewed exclusions")
        if [frame.number for frame in flight] != list(range(take * (HOLD + FLIGHT) + HOLD,
                                                           (take + 1) * (HOLD + FLIGHT))):
            raise ValueError(f"Camera move {take:02d} has changed timing")
    for anchor, reading in enumerate(READING_FRAMES):
        hold = plan[reading:reading + HOLD]
        if [frame.hold for frame in hold] != list(range(HOLD)):
            raise ValueError(f"Reading hold {anchor} has changed timing")
        expected_source = FLIGHT if anchor == 4 else 0
        if any(frame.anchor != anchor or frame.take != min(anchor, 3) or
               frame.source_frame != expected_source or frame.padding for frame in hold):
            raise ValueError(f"Reading hold {anchor} uses the wrong photograph")


def camera_keyframes(plan):
    cuts = set(CAMERA_CUT_FRAMES)
    for previous, frame in zip(plan, plan[1:]):
        if frame.take == previous.take and frame.hold is None and not frame.padding:
            if frame.source_frame > previous.source_frame + 1:
                cuts.add(frame.number)
    return tuple(sorted(cuts))


def consecutive_ranges(numbers):
    result = []
    for number in numbers:
        if result and number == result[-1][1] + 1:
            result[-1][1] = number
        else:
            result.append([number, number])
    return result


def describe_camera_plan(plan):
    validate_camera_plan(plan)
    moves = []
    for take in range(4):
        flight = [frame for frame in plan if frame.take == take and frame.hold is None]
        native = [frame.source_frame for frame in flight if not frame.padding]
        moves.append({
            "take": f"{take:02d}.mp4", "retained_source_ranges": consecutive_ranges(native),
            "excluded_source_ranges": consecutive_ranges([n for n in range(1, FLIGHT + 1) if n not in native]),
            "native_frames": len(native), "clean_arrival_padding_frames": FLIGHT - len(native),
            "output_first_frame": flight[0].number, "output_last_frame": flight[-1].number,
        })
    return {
        "mode": "camera", "frames": len(plan), "fps": FPS,
        "flight_slots": 4 * FLIGHT, "reading_hold_frames": 5 * HOLD,
        "native_camera_frames": sum(move["native_frames"] for move in moves),
        "arrival_padding_frames": sum(move["clean_arrival_padding_frames"] for move in moves),
        "forced_keyframes": camera_keyframes(plan), "moves": moves,
        "holds": [{
            "shot": STOPS[anchor], "take": f"{min(anchor, 3):02d}.mp4",
            "source_frame": FLIGHT if anchor == 4 else 0,
            "output_first_frame": reading, "output_last_frame": reading + HOLD - 1,
            "poster_frame": reading + FPS,
        } for anchor, reading in enumerate(READING_FRAMES)],
    }


def build_frame_plan():
    """A pure, inspectable plan: one anchor index and one scalar zoom per frame.

    Segments are half-open intervals beginning at the hard-cut frame. Easing
    operates only outside the original interactive reading windows. Exact
    rational bounds avoid rounding a frame into or out of a reading window.
    """
    plan = []
    boundaries = (0, *CUT_FRAMES, TOTAL_FRAMES)
    for anchor, (start, stop) in enumerate(zip(boundaries, boundaries[1:])):
        reading_start = READING_FRAMES[anchor] - READING_BEFORE
        reading_end = READING_FRAMES[anchor] + READING_AFTER
        for number in range(start, stop):
            amount = 0.0
            if number < reading_start:
                progress = float((number - start) / (reading_start - start))
                amount = 1 - ease(progress)
            elif number > reading_end:
                progress = float((number - reading_end) / (stop - 1 - reading_end))
                amount = ease(progress)
            plan.append(PlannedFrame(number, anchor, 1 + (MAX_ZOOM - 1) * amount))
    result = tuple(plan)
    validate_frame_plan(result)
    return result


def validate_frame_plan(plan):
    if len(plan) != TOTAL_FRAMES:
        raise ValueError(f"Frame plan must contain {TOTAL_FRAMES} frames")
    observed_cuts = []
    for number, frame in enumerate(plan):
        if frame.number != number or frame.anchor not in range(len(STOPS)):
            raise ValueError(f"Invalid planned frame at {number}")
        if not math.isfinite(frame.zoom) or not 1 <= frame.zoom <= MAX_ZOOM:
            raise ValueError(f"Zoom exceeds its uniform 1.5% limit at frame {number}")
        if number and frame.anchor != plan[number - 1].anchor:
            observed_cuts.append(number)
        expected_anchor = sum(number >= cut for cut in CUT_FRAMES)
        if frame.anchor != expected_anchor:
            raise ValueError(f"Wrong anchor at frame {number}")
        for anchor, reading in enumerate(READING_FRAMES):
            if reading - READING_BEFORE <= number <= reading + READING_AFTER:
                if frame.anchor != anchor or frame.zoom != 1.0:
                    raise ValueError(f"Reading window moves at frame {number}")
    if tuple(observed_cuts) != CUT_FRAMES:
        raise ValueError(f"Incorrect hard cuts: {observed_cuts}")


def describe_plan(plan):
    validate_frame_plan(plan)
    segments = []
    for anchor, shot in enumerate(STOPS):
        frames = [frame for frame in plan if frame.anchor == anchor]
        reading = READING_FRAMES[anchor]
        locked = [frame.number for frame in frames
                  if reading - READING_BEFORE <= frame.number <= reading + READING_AFTER]
        segments.append({
            "shot": shot,
            "source": f"{min(anchor, 3):02d}.mp4",
            "source_frame": FLIGHT if anchor == 4 else 0,
            "first_frame": frames[0].number,
            "last_frame": frames[-1].number,
            "reading_first_frame": locked[0],
            "reading_last_frame": locked[-1],
            "minimum_zoom": min(frame.zoom for frame in frames),
            "maximum_zoom": max(frame.zoom for frame in frames),
        })
    return {
        "mode": "fixed-photographs", "frames": len(plan), "fps": FPS,
        "hard_cut_frames": CUT_FRAMES, "maximum_zoom": MAX_ZOOM,
        "transform": "input = center + (output - center) / zoom",
        "crossfades": False, "optical_flow": False,
        "generated_intermediate_frames": False, "segments": segments,
    }


def compose_frame(frame, rendition, index, hold, portrait, extra_zoom=1.0):
    """Original center crop, 0.8% reading breath, and lookup lens matching."""
    width, height = frame.size
    w, h = rendition.width, rendition.height
    scale = min(width / w, height / h)
    if hold is not None:
        scale *= 1 - .008 * math.sin(math.pi * hold / (HOLD - 1)) ** 2
        if index == 1:
            magnification = .0105 if portrait else .0045
            scale /= 1 + magnification * (1 - ease(hold / (HOLD - 1)))
    scale /= extra_zoom
    crop_width, crop_height = round(scale * w), round(scale * h)
    left, top = (width - crop_width) // 2, (height - crop_height) // 2
    with frame.crop((left, top, left + crop_width, top + crop_height)) as crop:
        return crop.resize((w, h), Image.Resampling.BICUBIC)


def compose_anchor(frame, rendition, index, portrait, extra_zoom=1.0):
    """Freeze the old hold-24 poster composition once for each photograph."""
    return compose_frame(frame, rendition, index, FPS, portrait, extra_zoom)


def compose_aligned_wide_motion(frame, rendition, take):
    """One whole-image uniform transform, with no temporal or object warping."""
    width, height = frame.size
    w, h = rendition.width, rendition.height
    scale, tx, ty = WIDE_MOTION_ALIGNMENT[take]
    zoom = WIDE_POSTER_OVERSCAN * scale
    tx *= WIDE_POSTER_OVERSCAN * w
    ty *= WIDE_POSTER_OVERSCAN * h
    sample_scale = min(width / w, height / h) / zoom
    left = width / 2 - (w / 2 + tx) * sample_scale
    top = height / 2 - (h / 2 + ty) * sample_scale
    if left < 0 or top < 0 or left + w * sample_scale > width or top + h * sample_scale > height:
        raise ValueError(f"Wide alignment for take {take:02d} would expose an image edge")
    return frame.transform((w, h), Image.Transform.AFFINE,
                           (sample_scale, 0, left, 0, sample_scale, top),
                           resample=Image.Resampling.BICUBIC)


def uniform_transform(size, zoom):
    """Output-to-input affine matrix: identical x/y scale, no shear/rotation."""
    if not math.isfinite(zoom) or not 1 <= zoom <= MAX_ZOOM:
        raise ValueError(f"Invalid uniform zoom: {zoom}")
    width, height = size
    scale = 1 / zoom
    return (scale, 0.0, width * (1 - scale) / 2,
            0.0, scale, height * (1 - scale) / 2)


def render_planned_frame(anchor, frame):
    # No frame ever sees a second anchor. The affine matrix's linear part is
    # diag(1 / zoom, 1 / zoom): all distances scale equally, angles are fixed,
    # and every object shares exactly the same transform. Reading frames are
    # copied byte-for-byte before video compression, without resampling.
    if frame.zoom == 1.0:
        return anchor.copy()
    return anchor.transform(anchor.size, Image.Transform.AFFINE,
                            uniform_transform(anchor.size, frame.zoom),
                            resample=Image.Resampling.BICUBIC)


def video_name(framing, rendition):
    return f"free-lunch-{framing}{rendition.suffix}.mp4"


def poster_name(framing, rendition, shot):
    wide = "-wide" if framing == "wide" else ""
    return f"film-{shot}{wide}{rendition.suffix}.webp"


def encoder_options(rendition, threads, preset, cut_frames=CUT_FRAMES):
    # Frame-index expressions avoid timestamp rounding at the four hard cuts.
    # Force IDR pictures so a new photograph cannot reference the prior shot.
    forced_cuts = "expr:" + "+".join(f"eq(n,{number})" for number in cut_frames)
    return [
        "-an", "-c:v", "libx264", "-tag:v", "avc1", "-threads", str(threads),
        "-preset", preset, "-crf", "18", "-profile:v", "high",
        "-level:v", rendition.level, "-maxrate", f"{rendition.maxrate}k",
        "-bufsize", f"{rendition.maxrate * 2}k", "-g", "6", "-keyint_min", "6",
        "-sc_threshold", "0", "-bf", "0", "-force_key_frames", forced_cuts,
        "-forced-idr", "1", "-pix_fmt", "yuv420p",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-color_range", "tv", "-video_track_timescale", "24000",
        "-movflags", "+faststart", "-map_metadata", "-1",
    ]


def save_posters(view, framing, shot, stage, renditions=None):
    for rendition in renditions or RENDITIONS[framing]:
        path = stage / poster_name(framing, rendition, shot)
        if view.size == (rendition.width, rendition.height):
            view.save(path, quality=93, method=6)
        else:
            with view.resize((rendition.width, rendition.height), Image.Resampling.LANCZOS) as still:
                still.save(path, quality=93, method=6)


def render_camera_master(sources, framing, stage, threads, preset, plan,
                         anchor_sources=None, renditions=None, poster_framed=False):
    validate_camera_plan(plan)
    renditions = renditions or RENDITIONS[framing]
    rendition = renditions[0]
    cut_frames = camera_keyframes(plan)
    target = stage / video_name(framing, rendition)
    command = [
        "ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "rawvideo",
        "-pix_fmt", "rgb24", "-s", f"{rendition.width}x{rendition.height}",
        "-r", str(FPS), "-i", "pipe:0", "-filter_threads", str(threads),
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,setsar=1",
        *encoder_options(rendition, threads, preset, cut_frames), str(target),
    ]
    summary = describe_camera_plan(plan)
    log(f"Rendering {target.name}: {summary['native_camera_frames']} native camera frames, "
        f"{summary['arrival_padding_frames']} clean-arrival frames, five reading holds")
    log(f"Forced keyframes at edited source jumps and reading starts: {cut_frames}")
    started = time.monotonic()
    count = 0
    with ExitStack() as resources, tempfile.TemporaryFile() as errors:
        anchors = []
        if anchor_sources is not None:
            with closing(source_anchors(anchor_sources, threads)) as photographs:
                for photograph, index in photographs:
                    if index != len(anchors):
                        raise RuntimeError("Protected photographs arrived in the wrong order")
                    anchor = (compose_anchor(photograph, rendition, index, framing == "portrait", WIDE_POSTER_OVERSCAN)
                              if poster_framed else photograph.copy())
                    anchors.append(resources.enter_context(anchor))
            if len(anchors) != len(STOPS):
                raise RuntimeError("Incomplete protected photographs")
            log("Reading holds and posters use the original source photographs")
            if poster_framed:
                log("All wide overrides use poster keyframes: stationary hold-24 photographs, "
                    "2% shared overscan, and constant whole-image motion alignment")
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=errors)
        try:
            with closing(source_frames(sources, threads, plan)) as frames:
                for frame, planned in frames:
                    if count >= len(plan):
                        raise RuntimeError("More decoded output frames than the camera plan")
                    expected = plan[count]
                    if planned != expected:
                        raise RuntimeError(f"Decoded camera edit diverges at frame {count}")
                    picture = anchors[planned.anchor] if anchors and planned.hold is not None else frame
                    # All-wide replacements were generated from hold-24 posters.
                    # These anchors are already composed once above. Copy them
                    # without a second crop. A single constant uniform transform
                    # aligns each native move; there is no time-varying correction.
                    if poster_framed:
                        view = (picture.copy() if planned.hold is not None else
                                compose_aligned_wide_motion(frame, rendition, planned.take))
                    else:
                        view = compose_frame(picture, rendition, planned.anchor, planned.hold, framing == "portrait")
                    with view:
                        if planned.hold == FPS:
                            save_posters(view, framing, STOPS[planned.anchor], stage, renditions)
                        encoder.stdin.write(view.tobytes())
                    count += 1
                    if count % 48 == 0 or count == TOTAL_FRAMES:
                        elapsed = time.monotonic() - started
                        log(f"{target.name}: {count}/{TOTAL_FRAMES} frames ({elapsed:.0f}s)")
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError(f"Encoder failed: {error_tail(errors)}")
            if count != TOTAL_FRAMES:
                raise RuntimeError(f"Incomplete camera film: {count}/{TOTAL_FRAMES} frames")
        except BrokenPipeError:
            raise RuntimeError(f"Encoder pipe closed: {error_tail(errors)}") from None
        finally:
            with suppress(BrokenPipeError):
                encoder.stdin.close()
            stop_process(encoder)


def render_master(sources, framing, stage, threads, preset, plan, renditions=None):
    validate_frame_plan(plan)
    renditions = renditions or RENDITIONS[framing]
    rendition = renditions[0]
    target = stage / video_name(framing, rendition)
    command = [
        "ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "rawvideo",
        "-pix_fmt", "rgb24", "-s", f"{rendition.width}x{rendition.height}",
        "-r", str(FPS), "-i", "pipe:0", "-filter_threads", str(threads),
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,setsar=1",
        *encoder_options(rendition, threads, preset), str(target),
    ]
    log(f"Rendering {target.name}: {TOTAL_FRAMES} frames from five fixed photographs")
    log(f"Hard cuts: {CUT_FRAMES}; maximum uniform zoom: {MAX_ZOOM}; reading windows stationary")
    started = time.monotonic()
    count = 0
    with ExitStack() as resources, tempfile.TemporaryFile() as errors:
        anchors = []
        with closing(source_anchors(sources, threads)) as photographs:
            for photograph, index in photographs:
                if index != len(anchors):
                    raise RuntimeError("Fixed photographs arrived in the wrong order")
                anchor = resources.enter_context(compose_anchor(
                    photograph, rendition, index, framing == "portrait"))
                anchors.append(anchor)
                save_posters(anchor, framing, STOPS[index], stage, renditions)
                log(f"Prepared fixed photograph: {STOPS[index]}")
        if len(anchors) != len(STOPS):
            raise RuntimeError("Incomplete set of fixed photographs")
        encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=errors)
        try:
            for frame in plan:
                with render_planned_frame(anchors[frame.anchor], frame) as view:
                    encoder.stdin.write(view.tobytes())
                count += 1
                if count % 48 == 0 or count == TOTAL_FRAMES:
                    elapsed = time.monotonic() - started
                    log(f"{target.name}: {count}/{TOTAL_FRAMES} frames ({elapsed:.0f}s)")
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError(f"Encoder failed: {error_tail(errors)}")
            if count != TOTAL_FRAMES:
                raise RuntimeError(f"Incomplete film: {count}/{TOTAL_FRAMES} frames")
        except BrokenPipeError:
            raise RuntimeError(f"Encoder pipe closed: {error_tail(errors)}") from None
        finally:
            with suppress(BrokenPipeError):
                encoder.stdin.close()
            stop_process(encoder)


def derive_video(master, framing, rendition, stage, threads, preset, cut_frames=CUT_FRAMES):
    target = stage / video_name(framing, rendition)
    command = [
        "ffmpeg", "-hide_banner", "-v", "error", "-nostdin", "-y", "-xerror",
        "-threads", str(threads), "-i", str(master), "-map", "0:v:0",
        "-filter_threads", str(threads), "-vf",
        f"scale={rendition.width}:{rendition.height}:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1",
        "-fps_mode", "passthrough", *encoder_options(rendition, threads, preset, cut_frames),
        "-progress", "pipe:1", "-stats_period", "1", str(target),
    ]
    log(f"Deriving {target.name}")
    last_report = 0
    with tempfile.TemporaryFile() as errors:
        encoder = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, text=True)
        try:
            for line in encoder.stdout:
                if line.startswith("frame="):
                    count = int(line.partition("=")[2])
                    if count >= last_report + 96 or count == TOTAL_FRAMES:
                        log(f"{target.name}: {count}/{TOTAL_FRAMES} frames")
                        last_report = count
            if encoder.wait():
                raise RuntimeError(f"Transcode failed: {error_tail(errors)}")
        finally:
            encoder.stdout.close()
            stop_process(encoder)


def require_faststart(path):
    """Check MP4 atom order without loading the encoded movie into memory."""
    with path.open("rb") as handle:
        while header := handle.read(8):
            if len(header) != 8:
                break
            size, kind = struct.unpack(">I4s", header)
            header_size = 8
            if size == 1:
                extended = handle.read(8)
                if len(extended) != 8:
                    break
                size = struct.unpack(">Q", extended)[0]
                header_size = 16
            if kind == b"moov":
                return
            if kind == b"mdat" or size < header_size:
                break
            handle.seek(size - header_size, 1)
    raise ValueError(f"Missing faststart movie header in {path}")


def validate_video(path, rendition):
    stream, metadata = probe(path)
    require_fps(path, stream)
    expected = {
        "width": rendition.width, "height": rendition.height,
        "codec_name": "h264", "pix_fmt": "yuv420p", "profile": "High",
        "level": round(float(rendition.level) * 10), "has_b_frames": 0,
    }
    for field, value in expected.items():
        if stream.get(field) != value:
            raise ValueError(f"{path.name}: expected {field}={value}, got {stream.get(field)}")
    if frame_count(path, stream) != TOTAL_FRAMES:
        raise ValueError(f"Incorrect output frame count in {path}")
    duration = float(stream.get("duration", metadata.get("duration", 0)))
    if abs(duration - TOTAL_FRAMES / FPS) > .001:
        raise ValueError(f"Incorrect output duration in {path}: {duration}")
    size = path.stat().st_size
    if not 0 < size < MAX_BYTES:
        raise ValueError(f"{path.name} must be below 100 MB, got {size:,} bytes")
    require_faststart(path)
    return {
        "file": path.name, "width": rendition.width, "height": rendition.height,
        "frames": TOTAL_FRAMES, "fps": FPS, "bytes": size,
        "average_kbps": round(size * 8 / duration / 1000), "level": rendition.level,
    }


def export(framing, source_dir, output_dir, threads, preset, validate_only=False,
           motion="camera", source_overrides=None, cuts_config=None, preview=False):
    if motion not in ("camera", "fixed"):
        raise ValueError(f"Unknown motion mode: {motion}")
    exclusions = load_exclusions(cuts_config)[framing]
    plan = build_camera_plan(exclusions) if motion == "camera" else build_frame_plan()
    cut_frames = camera_keyframes(plan) if motion == "camera" else CUT_FRAMES
    for command in ("ffmpeg", "ffprobe"):
        if shutil.which(command) is None:
            raise ValueError(f"Required executable is missing: {command}")
    anchor_sources = validate_sources(source_dir / framing)
    sources = validate_sources(source_dir / framing, source_overrides) if source_overrides else anchor_sources
    if not preview:
        minimum_width, minimum_height = (3840, 2160) if framing == "wide" else (1080, 1920)
        for path, width, height in [*anchor_sources, *sources]:
            if width < minimum_width or height < minimum_height:
                raise ValueError(f"Full-quality {framing} requires at least {minimum_width} x {minimum_height} "
                                 f"sources; {path} is {width} x {height}. Use --preview only for draft review.")
    if validate_only:
        log(f"Validated four {framing} sources and the {motion} frame plan; no media rendered.")
        return
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f".quality-{framing}-", dir=output_dir) as temporary:
        stage = Path(temporary)
        if preview:
            width, height = (960, 540) if framing == "wide" else (360, 780)
            renditions = (Rendition("-preview", width, height, "4.1", 2500),)
        else:
            renditions = RENDITIONS[framing]
        if motion == "camera":
            poster_framed = framing == "wide" and set(source_overrides or {}) == set(range(4))
            render_camera_master(sources, framing, stage, threads, preset, plan,
                                 anchor_sources if source_overrides else None, renditions, poster_framed)
        else:
            render_master(anchor_sources, framing, stage, threads, preset, plan, renditions)
        master = stage / video_name(framing, renditions[0])
        results = [validate_video(master, renditions[0])]
        for rendition in renditions[1:]:
            derive_video(master, framing, rendition, stage, threads, preset, cut_frames)
            results.append(validate_video(stage / video_name(framing, rendition), rendition))
        for rendition in renditions:
            for shot in STOPS:
                path = stage / poster_name(framing, rendition, shot)
                with Image.open(path) as image:
                    if image.size != (rendition.width, rendition.height):
                        raise ValueError(f"Incorrect poster dimensions in {path}")
                    image.verify()
        # Staging is on the destination filesystem. Each rename is atomic, and
        # nothing is replaced until the entire requested framing has passed QA.
        for path in sorted(stage.iterdir()):
            path.replace(output_dir / path.name)
        log(f"Published {len(results)} videos and {len(renditions) * len(STOPS)} posters to {output_dir}")
        log(json.dumps(results, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("framing", choices=RENDITIONS)
    parser.add_argument("--source-dir", type=Path,
                        help="Root containing wide/ and/or portrait/ enhanced camera takes")
    parser.add_argument("--source-override", action="append", default=[], metavar="TAKE=PATH",
                        help="Replace one reviewed take, e.g. 03=/path/to/repaired.mp4; repeat as needed")
    parser.add_argument("--motion-override-dir", type=Path,
                        help="Optional root containing only accepted moving takes at wide/NN.mp4 or portrait/NN.mp4")
    parser.add_argument("--cuts-config", type=Path,
                        help="JSON overrides for reviewed inclusive skips; [] clears a repaired take's skips")
    parser.add_argument("--motion", choices=("camera", "fixed"), default="camera",
                        help="Full camera travel (default), or the archived fixed-photo treatment")
    parser.add_argument("--output-dir", type=Path,
                        help="Destination (default: assets/pass-the-salsa; required for previews)")
    parser.add_argument("--preview", action="store_true",
                        help="Render only a 960x540 wide or 360x780 phone review movie; allows draft-size motion overrides")
    parser.add_argument("--threads", type=int, default=2,
                        help="Threads per FFmpeg process (default: 2)")
    parser.add_argument("--preset", choices=("fast", "medium"), default="fast")
    parser.add_argument("--validate-only", action="store_true",
                        help="Check source metadata without rendering or changing output files")
    parser.add_argument("--plan-only", action="store_true",
                        help="Validate and print the selected motion plan without reading media")
    args = parser.parse_args()
    if args.threads < 1:
        parser.error("--threads must be at least 1")
    if not args.plan_only and args.source_dir is None:
        parser.error("--source-dir is required unless --plan-only is used")
    if args.preview and args.output_dir is None and not args.plan_only:
        parser.error("--preview requires an explicit --output-dir outside production media")
    overrides = {}
    if args.motion_override_dir is not None and not args.plan_only:
        if not args.motion_override_dir.is_dir():
            parser.error("--motion-override-dir must be an existing directory")
        overrides.update({index: path.resolve() for index in range(4)
                          if (path := args.motion_override_dir / args.framing / f"{index:02d}.mp4").is_file()})
    explicit_overrides = set()
    for value in args.source_override:
        take, separator, path = value.partition("=")
        index = integer(take)
        if not separator or not path or index not in range(4):
            parser.error("--source-override must be TAKE=PATH, with TAKE from 00 through 03")
        if index in explicit_overrides:
            parser.error(f"Source {index:02d} was overridden more than once")
        explicit_overrides.add(index)
        overrides[index] = Path(path).resolve()
    try:
        if args.plan_only:
            description = (describe_camera_plan(build_camera_plan(load_exclusions(args.cuts_config)[args.framing])) if args.motion == "camera"
                           else describe_plan(build_frame_plan()))
            log(json.dumps(description, indent=2))
            return 0
        output_dir = (args.output_dir or ROOT / "assets" / "pass-the-salsa").resolve()
        if args.preview and output_dir == (ROOT / "assets" / "pass-the-salsa").resolve():
            parser.error("Preview output must be outside production media")
        export(args.framing, args.source_dir.resolve(), output_dir,
               args.threads, args.preset, args.validate_only, args.motion, overrides,
               args.cuts_config, args.preview)
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f"Error: {error}", file=sys.stderr, flush=True)
        return 1
    except KeyboardInterrupt:
        print("Render cancelled; staged outputs discarded.", file=sys.stderr, flush=True)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
