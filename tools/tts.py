#!/usr/bin/env python3
"""
Edit a section of audio using Resemble AI's Audio Edit API.

The API replaces specific words/phrases in an existing recording while keeping
the surrounding audio and voice consistent. Input segment must be < 20 seconds.

On first run (no RESEMBLE_VOICE_UUID in .env), the script will automatically
clone the voice from the source audio and save the UUID to .env.

Setup (one-time):
  1. Sign up at app.resemble.ai
  2. Add your API key to .env:
       RESEMBLE_API_KEY=...
  3. Run the script — it will clone the voice and save RESEMBLE_VOICE_UUID automatically.

Usage:
    # Edit words in a specific time range of the source audio
    python3 tools/tts.py \\
        --audio  inputs/audio.MP3 \\
        --start  9.64 \\
        --end    13.14 \\
        --original "So I built a tool and made a video for a poem" \\
        --target   "So I made a tool and produced a video for a poem" \\
        --out    inputs/edited-intro.mp3

    # Then ingest the result and add it to timeline.json
    python3 tools/ingest.py inputs/edited-intro.mp3
"""

import argparse
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

from common import ROOT, audio_duration

API_BASE = "https://app.resemble.ai/api/v2"
MAX_SEGMENT_SECONDS = 19  # Edit API requires < 20s
CLONE_SEGMENT_SECONDS = 10  # Each recording upload: 1–12s
CLONE_NUM_SEGMENTS = 3  # Rapid clone needs >= 3 recordings


# ── .env helpers ──────────────────────────────────────────────────────────────

def save_env(key: str, value: str):
    """Write or update KEY=value in .env, preserving other lines."""
    env_file = ROOT / ".env"
    lines = env_file.read_text().splitlines() if env_file.exists() else []

    updated = False
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(f"{key}=") or stripped == key:
            new_lines.append(f"{key}={value}")
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        new_lines.append(f"{key}={value}")

    env_file.write_text("\n".join(new_lines) + "\n")
    os.environ[key] = value


# ── audio helpers ──────────────────────────────────────────────────────────────

def extract_wav(audio_path: str, start: float, duration: float) -> str:
    """Extract a segment from audio_path to a temp WAV file. Returns path."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    subprocess.run(
        ["ffmpeg", "-y", "-i", audio_path,
         "-ss", str(start), "-t", str(duration),
         "-ar", "44100", "-ac", "1",
         tmp.name],
        check=True, capture_output=True,
    )
    return tmp.name


def extract_segment(audio_path: str, start: float, end: float) -> str:
    """Extract [start, end] for the Edit API (enforces < 20s). Returns WAV path."""
    dur = end - start
    if dur > MAX_SEGMENT_SECONDS:
        raise ValueError(
            f"Segment is {dur:.1f}s — Resemble Edit requires < {MAX_SEGMENT_SECONDS}s. "
            f"Narrow the --start/--end range."
        )
    return extract_wav(audio_path, start, dur)


# ── voice cloning ──────────────────────────────────────────────────────────────

def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}"}


def create_voice(name: str, api_key: str) -> str:
    """Create a new rapid voice shell. Returns voice UUID."""
    resp = requests.post(
        f"{API_BASE}/voices",
        headers=_headers(api_key),
        json={"name": name, "voice_type": "rapid"},
    )
    if not resp.ok:
        raise RuntimeError(f"Create voice error {resp.status_code}: {resp.text}")
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"Create voice failed: {body}")
    return body["item"]["uuid"]


def upload_recording(voice_uuid: str, wav_path: str, name: str, api_key: str):
    """Upload one recording segment for voice training."""
    with open(wav_path, "rb") as f:
        resp = requests.post(
            f"{API_BASE}/voices/{voice_uuid}/recordings",
            headers=_headers(api_key),
            data={
                "name": name,
                "text": "audio sample",
                "emotion": "neutral",
                "is_active": "true",
            },
            files={"file": (Path(wav_path).name, f, "audio/wav")},
        )
    if not resp.ok:
        raise RuntimeError(f"Upload recording error {resp.status_code}: {resp.text}")
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"Upload recording failed: {body}")


def build_voice(voice_uuid: str, api_key: str):
    """Kick off rapid voice training."""
    resp = requests.post(
        f"{API_BASE}/voices/{voice_uuid}/build",
        headers=_headers(api_key),
        json={},
    )
    if not resp.ok:
        raise RuntimeError(f"Build voice error {resp.status_code}: {resp.text}")
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"Build voice failed: {body}")


def poll_voice_ready(voice_uuid: str, api_key: str, timeout: int = 300):
    """Poll GET /voices/{uuid} until status == 'finished'."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = requests.get(
            f"{API_BASE}/voices/{voice_uuid}",
            headers=_headers(api_key),
        )
        if not resp.ok:
            raise RuntimeError(f"Voice status error {resp.status_code}: {resp.text}")
        item = resp.json().get("item", {})
        status = item.get("status", "unknown")
        if status == "finished":
            return
        print(f"  voice status: {status}…")
        time.sleep(5)
    raise TimeoutError(f"Voice {voice_uuid} not ready after {timeout}s")


def clone_voice(audio_path: str, api_key: str, voice_name: str = "narrator") -> str:
    """
    Clone a voice from audio_path.
    Extracts CLONE_NUM_SEGMENTS × CLONE_SEGMENT_SECONDS segments spread across
    the file, uploads them, builds the rapid clone, and returns the voice UUID.
    """
    total_dur = audio_duration(audio_path)

    # Spread segments evenly, skipping the first/last 2s
    usable_start = 2.0
    usable_end = total_dur - 2.0
    usable_dur = usable_end - usable_start
    seg_dur = min(CLONE_SEGMENT_SECONDS, usable_dur / CLONE_NUM_SEGMENTS)

    offsets = [
        usable_start + i * (usable_dur / CLONE_NUM_SEGMENTS)
        for i in range(CLONE_NUM_SEGMENTS)
    ]

    print(f"Creating voice '{voice_name}'…")
    voice_uuid = create_voice(voice_name, api_key)
    print(f"  Voice UUID: {voice_uuid}")

    tmp_files = []
    try:
        for i, offset in enumerate(offsets):
            wav = extract_wav(audio_path, offset, seg_dur)
            tmp_files.append(wav)
            print(f"  Uploading segment {i+1}/{CLONE_NUM_SEGMENTS} "
                  f"({offset:.1f}s – {offset+seg_dur:.1f}s)…")
            upload_recording(voice_uuid, wav, f"sample-{i+1}", api_key)

        print("Building rapid clone (usually < 1 min)…")
        build_voice(voice_uuid, api_key)

        print("Waiting for voice to be ready…")
        poll_voice_ready(voice_uuid, api_key)
        print("  Voice ready!")

    finally:
        for f in tmp_files:
            Path(f).unlink(missing_ok=True)

    return voice_uuid


# ── Resemble Edit API ──────────────────────────────────────────────────────────

def create_edit(audio_path: str, original: str, target: str,
                api_key: str, voice_uuid: str) -> str:
    """Submit an edit job. Returns the edit UUID."""
    with open(audio_path, "rb") as f:
        resp = requests.post(
            f"{API_BASE}/edit",
            headers=_headers(api_key),
            data={
                "original_transcript": original,
                "target_transcript":   target,
                "voice_uuid":          voice_uuid,
            },
            files={"input_audio": (Path(audio_path).name, f, "audio/wav")},
        )

    if not resp.ok:
        raise RuntimeError(f"API error {resp.status_code}: {resp.text}")

    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"API returned failure: {body}")

    return body["item"]["uuid"]


def poll_edit(uuid: str, api_key: str, timeout: int = 180) -> str:
    """Poll until result_audio_url is ready. Returns the download URL."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = requests.get(
            f"{API_BASE}/edit/{uuid}",
            headers=_headers(api_key),
        )
        if not resp.ok:
            raise RuntimeError(f"Poll error {resp.status_code}: {resp.text}")

        item = resp.json().get("item", {})
        url = item.get("result_audio_url")
        if url:
            return url

        print("  waiting for result…")
        time.sleep(4)

    raise TimeoutError(f"Edit {uuid} not ready after {timeout}s")


def download_result(url: str, out_path: Path):
    resp = requests.get(url, stream=True)
    resp.raise_for_status()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)


# ── standard interface ───────────────────────────────────────────────────────


def add_arguments(parser: argparse.ArgumentParser):
    parser.add_argument("--audio",    required=True,  help="Source audio file (e.g. inputs/audio.MP3)")
    parser.add_argument("--start",    type=float, required=True, help="Segment start in source (seconds)")
    parser.add_argument("--end",      type=float, required=True, help="Segment end in source (seconds)")
    parser.add_argument("--original", required=True,  help="Exact current transcript of the segment")
    parser.add_argument("--target",   required=True,  help="Replacement text")
    parser.add_argument("--out",      required=True,  help="Output path (e.g. inputs/fix-intro.mp3)")
    parser.add_argument("--voice",    default=None,   help="Resemble voice UUID (overrides RESEMBLE_VOICE_UUID in .env)")
    parser.add_argument("--clone-from", default=None, help="Audio to clone voice from (defaults to --audio)")


def run(args: argparse.Namespace):
    api_key    = os.environ.get("RESEMBLE_API_KEY", "")
    voice_uuid = args.voice or os.environ.get("RESEMBLE_VOICE_UUID", "")

    if not api_key:
        print("Error: set RESEMBLE_API_KEY in .env")
        sys.exit(1)

    # ── auto-clone if no voice UUID ──────────────────────────────────────────
    if not voice_uuid:
        clone_src = args.clone_from or args.audio
        print(f"No RESEMBLE_VOICE_UUID found — cloning voice from {clone_src}")
        voice_uuid = clone_voice(clone_src, api_key)
        print(f"\nSaving RESEMBLE_VOICE_UUID={voice_uuid} to .env")
        save_env("RESEMBLE_VOICE_UUID", voice_uuid)

    # ── edit ─────────────────────────────────────────────────────────────────
    dur = args.end - args.start
    print(f"\nSource segment: {args.start:.2f}s – {args.end:.2f}s  ({dur:.2f}s)")
    print(f"  Original: \"{args.original}\"")
    print(f"  Target:   \"{args.target}\"")

    print("\nExtracting segment…")
    tmp = extract_segment(args.audio, args.start, args.end)

    try:
        print("Submitting to Resemble AI…")
        edit_uuid = create_edit(tmp, args.original, args.target, api_key, voice_uuid)
        print(f"  Edit UUID: {edit_uuid}")

        print("Polling for result…")
        result_url = poll_edit(edit_uuid, api_key)

        out_path = Path(args.out)
        print(f"Downloading → {out_path}")
        download_result(result_url, out_path)

        print(f"\nDone: {out_path}")
        print(f"Next steps:")
        print(f"  python3 tools/ingest.py {out_path}")
        print("  Then add it to timeline.json as a new audio clip with the right 'at' position")

    finally:
        Path(tmp).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(
        description="Clone voice + edit a word/phrase in a source audio clip via Resemble AI"
    )
    add_arguments(parser)
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
