#!/usr/bin/env python3
"""Render the selected Free Lunch film using five fixed enhanced photographs.

The source directory must contain wide/00.mp4 through wide/03.mp4 and/or
portrait/00.mp4 through portrait/03.mp4. Each take is exactly 145 frames at
24 fps. Only the requested framing is read. Example:

    python3 scripts/render-quality-editions.py wide --source-dir /path/to/enhanced

Only frame 0 of each take and frame 144 of take 03 can enter the output. The
generated motion between those anchors is never used. Every output frame is
one fixed photograph with, at most, a uniform 1.5% center zoom. Four hard cuts
replace transitions; there is no blending, optical flow, or object animation.
Each interactive reading window is completely stationary, at the same crop as
the previous hold-24 poster, including its fixed lens-match adjustment.

Requires FFmpeg, ffprobe, and Pillow. Frames are streamed through memory; no
lossless intermediate film is written. All deliverables are staged and checked
before replacing existing files. The duration remains 866 frames at 24 fps.
Use --plan-only to inspect and validate the deterministic frame plan without
reading source media or rendering files.
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
READING_BEFORE = Fraction(16, 100) * FPS
READING_AFTER = Fraction(257, 100) * FPS
MAX_ZOOM = 1.015


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


def validate_sources(folder):
    paths = [folder / f"{i:02d}.mp4" for i in range(4)]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise ValueError("Missing source takes: " + ", ".join(missing))
    sources = []
    for path in paths:
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
        log(f"Source {path.name}: {width} x {height}, {count} frames, {FPS} fps")
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


def compose_anchor(frame, rendition, index, portrait):
    """Freeze the old hold-24 poster composition once for each photograph."""
    width, height = frame.size
    w, h = rendition.width, rendition.height
    scale = min(width / w, height / h)
    scale *= 1 - .008 * math.sin(math.pi * FPS / (HOLD - 1)) ** 2
    if index == 1:
        magnification = .0105 if portrait else .0045
        scale /= 1 + magnification * (1 - ease(FPS / (HOLD - 1)))
    crop_width, crop_height = round(scale * w), round(scale * h)
    left, top = (width - crop_width) // 2, (height - crop_height) // 2
    with frame.crop((left, top, left + crop_width, top + crop_height)) as crop:
        return crop.resize((w, h), Image.Resampling.BICUBIC)


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


def encoder_options(rendition, threads, preset):
    # Frame-index expressions avoid timestamp rounding at the four hard cuts.
    # Force IDR pictures so a new photograph cannot reference the prior shot.
    forced_cuts = "expr:" + "+".join(f"eq(n,{number})" for number in CUT_FRAMES)
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


def save_posters(view, framing, shot, stage):
    for rendition in RENDITIONS[framing]:
        path = stage / poster_name(framing, rendition, shot)
        if view.size == (rendition.width, rendition.height):
            view.save(path, quality=93, method=6)
        else:
            with view.resize((rendition.width, rendition.height), Image.Resampling.LANCZOS) as still:
                still.save(path, quality=93, method=6)


def render_master(sources, framing, stage, threads, preset, plan):
    validate_frame_plan(plan)
    rendition = RENDITIONS[framing][0]
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
                save_posters(anchor, framing, STOPS[index], stage)
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


def derive_video(master, framing, rendition, stage, threads, preset):
    target = stage / video_name(framing, rendition)
    command = [
        "ffmpeg", "-hide_banner", "-v", "error", "-nostdin", "-y", "-xerror",
        "-threads", str(threads), "-i", str(master), "-map", "0:v:0",
        "-filter_threads", str(threads), "-vf",
        f"scale={rendition.width}:{rendition.height}:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1",
        "-fps_mode", "passthrough", *encoder_options(rendition, threads, preset),
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


def export(framing, source_dir, output_dir, threads, preset, validate_only=False):
    plan = build_frame_plan()
    for command in ("ffmpeg", "ffprobe"):
        if shutil.which(command) is None:
            raise ValueError(f"Required executable is missing: {command}")
    sources = validate_sources(source_dir / framing)
    if validate_only:
        log(f"Validated four {framing} sources and the fixed-photograph frame plan; no media rendered.")
        return
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f".quality-{framing}-", dir=output_dir) as temporary:
        stage = Path(temporary)
        renditions = RENDITIONS[framing]
        render_master(sources, framing, stage, threads, preset, plan)
        master = stage / video_name(framing, renditions[0])
        results = [validate_video(master, renditions[0])]
        for rendition in renditions[1:]:
            derive_video(master, framing, rendition, stage, threads, preset)
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
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets" / "pass-the-salsa")
    parser.add_argument("--threads", type=int, default=2,
                        help="Threads per FFmpeg process (default: 2)")
    parser.add_argument("--preset", choices=("fast", "medium"), default="fast")
    parser.add_argument("--validate-only", action="store_true",
                        help="Check source metadata without rendering or changing output files")
    parser.add_argument("--plan-only", action="store_true",
                        help="Validate and print the fixed-photograph frame plan without reading media")
    args = parser.parse_args()
    if args.threads < 1:
        parser.error("--threads must be at least 1")
    if not args.plan_only and args.source_dir is None:
        parser.error("--source-dir is required unless --plan-only is used")
    try:
        if args.plan_only:
            log(json.dumps(describe_plan(build_frame_plan()), indent=2))
            return 0
        export(args.framing, args.source_dir.resolve(), args.output_dir.resolve(),
               args.threads, args.preset, args.validate_only)
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f"Error: {error}", file=sys.stderr, flush=True)
        return 1
    except KeyboardInterrupt:
        print("Render cancelled; staged outputs discarded.", file=sys.stderr, flush=True)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
