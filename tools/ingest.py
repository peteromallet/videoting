#!/usr/bin/env python3
"""
Ingest a source asset and produce an asset profile YAML.

Usage:
    python3 tools/ingest.py inputs/input.MP3
    python3 tools/ingest.py inputs/demo-one.mp4
    python3 tools/ingest.py inputs/example-image1.jpg
"""

import argparse
import base64
import os
import re
import subprocess
import sys
from pathlib import Path

from common import (
    ROOT,
    PROFILES_DIR,
    ffprobe_json,
    get_openai_client,
    profile_to_registry_entry,
    register_asset,
    run_cmd,
    save_yaml,
)

PROFILES_DIR.mkdir(exist_ok=True)


# ── helpers ──────────────────────────────────────────────────────────────────

def detect_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
        return "image"
    if suffix in {".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"}:
        return "audio"
    if suffix in {".mp4", ".mov", ".mkv", ".avi", ".webm"}:
        info = ffprobe_json(str(path))
        has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
        has_video = any(s["codec_type"] == "video" for s in info["streams"])
        if has_video and has_audio:
            return "video+audio"
        if has_video:
            return "video"
        return "audio"
    return "unknown"


# ── silence detection ─────────────────────────────────────────────────────────

def detect_silence(path: str, noise_db: float = -40.0, min_duration: float = 0.3) -> list[dict]:
    """Return list of {start, end} silence regions."""
    cmd = [
        "ffmpeg", "-i", path,
        "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
        "-f", "null", "-"
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    output = r.stderr

    regions = []
    starts = re.findall(r"silence_start: ([0-9.]+)", output)
    ends   = re.findall(r"silence_end: ([0-9.]+)", output)
    for s, e in zip(starts, ends):
        regions.append({"start": round(float(s), 3), "end": round(float(e), 3)})
    return regions


# ── transcription ─────────────────────────────────────────────────────────────

def transcribe(path: str) -> dict:
    """Transcribe audio using OpenAI Whisper API, return {words, segments}."""
    client = get_openai_client()
    if not client:
        print("  [Transcription skipped — set OPENAI_API_KEY]")
        return {"words": [], "segments": []}

    print(f"  Transcribing {Path(path).name} with OpenAI Whisper API...")

    with open(path, "rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"],
        )

    words = []
    for w in (response.words or []):
        words.append({
            "start": round(float(w.start), 3),
            "end":   round(float(w.end), 3),
            "word":  str(w.word).strip(),
        })

    segments_out = []
    for seg in (response.segments or []):
        segments_out.append({
            "start": round(float(seg.start), 3),
            "end":   round(float(seg.end), 3),
            "text":  str(seg.text).strip(),
        })

    return {"words": words, "segments": segments_out}


# ── video keyframe extraction ─────────────────────────────────────────────────

def extract_keyframes(path: str, scene_threshold: float = 0.3, max_interval: float = 1.0) -> list[float]:
    """
    Return sorted list of timestamps (seconds) for keyframes.
    Uses scene change detection + a floor keyframe every max_interval seconds.
    """
    info = ffprobe_json(path)
    duration = float(info["format"]["duration"])

    # Scene change timestamps via ffprobe
    cmd = [
        "ffprobe", "-v", "quiet",
        "-show_frames",
        "-select_streams", "v",
        "-print_format", "json",
        "-f", "lavfi",
        f"movie={path},select=gt(scene\\,{scene_threshold})"
    ]
    r = run_cmd(cmd)
    scene_times = set()
    try:
        import json
        frames = json.loads(r.stdout).get("frames", [])
        for f in frames:
            t = float(f.get("best_effort_timestamp_time", f.get("pkt_pts_time", 0)))
            scene_times.add(round(t, 3))
    except Exception:
        pass

    # Floor: one keyframe every max_interval seconds
    t = 0.0
    while t < duration:
        scene_times.add(round(t, 3))
        t += max_interval

    return sorted(scene_times)


def extract_frame_image(video_path: str, timestamp: float, out_path: str):
    """Extract a single frame from video at timestamp, save as JPEG."""
    run_cmd([
        "ffmpeg", "-y", "-ss", str(timestamp),
        "-i", video_path,
        "-frames:v", "1",
        "-q:v", "4",
        out_path
    ])


# ── claude vision ─────────────────────────────────────────────────────────────

def describe_image_with_openai(image_path: str, context: str = "") -> str:
    """Send an image to GPT-4o and get a concise visual description."""
    client = get_openai_client()
    if not client:
        return "[VLM description unavailable — set OPENAI_API_KEY]"

    with open(image_path, "rb") as f:
        img_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

    suffix = Path(image_path).suffix.lower()
    media_type = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                  ".png": "image/png", ".gif": "image/gif",
                  ".webp": "image/webp"}.get(suffix, "image/jpeg")

    prompt = (
        "Describe what is visible in this image/video frame in 1-2 concise sentences. "
        "Focus on what is on screen: UI elements, content being shown, actions occurring. "
        "Be specific and factual. No fluff."
    )
    if context:
        prompt += f" Context: {context}"

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=150,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{img_b64}"}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    return response.choices[0].message.content.strip()


# ── visual summarisation ─────────────────────────────────────────────────────

def _summarize_visual_segments(visual_segments: list[dict]) -> str:
    """Summarise all visual_segments into one sentence using the OpenAI API."""
    client = get_openai_client()
    if not client:
        return ""
    bullets = "\n".join(f"- {s['description']}" for s in visual_segments)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=80,
        messages=[{"role": "user", "content":
            "Summarise what's shown in this video in one concise sentence. "
            "Focus on the main on-screen content (UI, subject, action). No fluff.\n\n"
            f"Frame descriptions:\n{bullets}"
        }],
    )
    return response.choices[0].message.content.strip()


# ── per-type ingest ───────────────────────────────────────────────────────────

def ingest_audio(path: Path) -> dict:
    info = ffprobe_json(str(path))
    duration = float(info["format"]["duration"])

    print("  Detecting silence...")
    silence = detect_silence(str(path))

    print("  Transcribing...")
    transcript = transcribe(str(path))

    return {
        "id": path.stem.lower().replace(" ", "-").replace(".", "-"),
        "file": str(path.relative_to(ROOT)),
        "type": "audio",
        "duration_s": round(duration, 3),
        "silence_regions": silence,
        "transcript": transcript,
    }


def ingest_video(path: Path, has_audio: bool) -> dict:
    info = ffprobe_json(str(path))
    duration = float(info["format"]["duration"])
    vstream = next(s for s in info["streams"] if s["codec_type"] == "video")
    resolution = f"{vstream['width']}x{vstream['height']}"

    # Parse fps
    fps_str = vstream.get("r_frame_rate", "30/1")
    num, den = fps_str.split("/")
    fps = round(float(num) / float(den), 3)

    result: dict = {
        "id": path.stem.lower().replace(" ", "-").replace(".", "-"),
        "file": str(path.relative_to(ROOT)),
        "type": "video+audio" if has_audio else "video",
        "duration_s": round(duration, 3),
        "resolution": resolution,
        "fps": fps,
    }

    if has_audio:
        print("  Detecting silence...")
        result["silence_regions"] = detect_silence(str(path))
        print("  Transcribing audio track...")
        result["transcript"] = transcribe(str(path))

    # Visual keyframes
    print("  Extracting keyframes...")
    timestamps = extract_keyframes(str(path))
    print(f"  Found {len(timestamps)} keyframes. Describing with Claude...")

    import tempfile
    visual_segments = []
    frames_dir = Path(tempfile.mkdtemp())

    for i, t in enumerate(timestamps):
        frame_path = str(frames_dir / f"frame_{i:04d}.jpg")
        extract_frame_image(str(path), t, frame_path)
        if not Path(frame_path).exists():
            continue

        desc = describe_image_with_openai(frame_path, context=f"Video: {path.name}")
        end_t = timestamps[i + 1] if i + 1 < len(timestamps) else round(duration, 3)
        visual_segments.append({
            "start": round(t, 3),
            "end":   round(end_t, 3),
            "description": desc,
        })
        print(f"    [{t:.1f}s] {desc[:80]}")

        # Clean up frame
        try:
            os.unlink(frame_path)
        except Exception:
            pass

    result["visual_segments"] = visual_segments

    if visual_segments:
        print("  Summarising visual content...")
        result["visual_summary"] = _summarize_visual_segments(visual_segments)
        print(f"    {result['visual_summary'][:100]}")

    return result


def ingest_image(path: Path) -> dict:
    from PIL import Image
    img = Image.open(str(path))
    width, height = img.size

    print("  Describing image with Claude...")
    desc = describe_image_with_openai(str(path))

    return {
        "id": path.stem.lower().replace(" ", "-").replace(".", "-"),
        "file": str(path.relative_to(ROOT)),
        "type": "image",
        "dimensions": f"{width}x{height}",
        "description": desc,
    }


# ── yaml serialization ────────────────────────────────────────────────────────

def _to_native(obj):
    """Recursively convert numpy/non-standard types to plain Python for YAML."""
    if isinstance(obj, dict):
        return {k: _to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_native(v) for v in obj]
    # numpy scalars
    try:
        import numpy as np
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
    except ImportError:
        pass
    return obj


# ── main ──────────────────────────────────────────────────────────────────────

def ingest(file_path: str) -> Path:
    path = Path(file_path)
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()

    if not path.exists():
        print(f"Error: file not found: {path}", file=sys.stderr)
        sys.exit(1)

    asset_type = detect_type(path)
    print(f"Ingesting {path.name} (type: {asset_type})")

    if asset_type == "audio":
        profile = ingest_audio(path)
    elif asset_type == "video":
        profile = ingest_video(path, has_audio=False)
    elif asset_type == "video+audio":
        profile = ingest_video(path, has_audio=True)
    elif asset_type == "image":
        profile = ingest_image(path)
    else:
        print(f"Error: unsupported file type: {path.suffix}", file=sys.stderr)
        sys.exit(1)

    out_path = PROFILES_DIR / f"{path.name}.yaml"
    save_yaml(_to_native(profile), out_path)
    register_asset(
        profile["id"],
        profile["file"],
        metadata=profile_to_registry_entry(profile),
    )

    print(f"  -> Saved: {out_path.relative_to(ROOT)}")
    print(f"  -> Updated: asset-registry.json ({profile['id']})")
    return out_path


# ── standard interface ───────────────────────────────────────────────────────


def add_arguments(parser: argparse.ArgumentParser):
    parser.add_argument("files", nargs="+", help="Files to ingest")


def run(args: argparse.Namespace):
    for f in args.files:
        ingest(f)


def main():
    parser = argparse.ArgumentParser(
        description="Ingest a source asset and produce an asset profile YAML."
    )
    add_arguments(parser)
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
