#!/usr/bin/env python3
"""Download checksum-verified homepage sources and prepare reviewed motion.

The original enhanced takes supply the sharp photographs. Accepted replacement
camera takes live separately under motion/. Four-second replacements receive
48 exact copies of their final frame to preserve the existing six-second slot;
there is no interpolation, retiming, or change to the moving frames' cadence.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request


ROOT = Path(__file__).resolve().parents[1]


def verified(path, source):
    if not path.is_file() or path.stat().st_size != source["bytes"]:
        return False
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest() == source["sha256"]


def download(source, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not verified(path, source):
        temporary = path.with_suffix(path.suffix + ".download")
        try:
            with urllib.request.urlopen(source["url"], timeout=120) as response, temporary.open("wb") as output:
                shutil.copyfileobj(response, output, 1024 * 1024)
            if not verified(temporary, source):
                raise ValueError(f"Source checksum or length mismatch: {source['path']}")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
    print(f"Verified {path}", flush=True)
    return path


def inspect(path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "json", str(path),
    ], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)["streams"][0]


def prepare_motion(source, root, threads):
    raw = download(source, root / "motion-raw" / source["path"])
    metadata = inspect(raw)
    for key in ("width", "height", "r_frame_rate", "nb_frames"):
        if str(metadata[key]) != str(source[key]):
            raise ValueError(f"Unexpected {key} in {raw}: {metadata[key]}")
    padding = source.get("normalization", {}).get("append_final_frames", 0)
    if metadata["r_frame_rate"] != "24/1" or int(metadata["nb_frames"]) + padding != 145:
        raise ValueError(f"Motion source cannot fill the native-rate 145-frame slot: {raw}")
    target = root / "motion" / source["path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    if not padding:
        shutil.copy2(raw, target)
    else:
        temporary = target.with_name(target.stem + ".preparing.mp4")
        try:
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-threads", str(threads), "-i", str(raw),
                "-vf", f"tpad=stop_mode=clone:stop={padding}", "-frames:v", "145", "-an",
                "-c:v", "libx264", "-preset", "fast", "-crf", "10", "-pix_fmt", "yuv420p",
                "-threads", str(threads), "-movflags", "+faststart", str(temporary),
            ], check=True)
            result = inspect(temporary)
            if result["r_frame_rate"] != "24/1" or int(result["nb_frames"]) != 145:
                raise ValueError(f"Invalid prepared motion: {temporary}")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    print(f"Prepared {target} with {padding} final-frame copies", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--manifest", type=Path,
                        default=ROOT / "film-source/pass-the-salsa/quality-sources.json")
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda source: download(source, args.destination / source["path"]), manifest["sources"]))
    for source in manifest.get("motion_overrides", []):
        prepare_motion(source, args.destination, args.threads)


if __name__ == "__main__":
    main()
