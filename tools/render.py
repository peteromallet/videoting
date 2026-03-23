#!/usr/bin/env python3
"""
Render the timeline using Remotion (default) or the legacy ffmpeg comparison path.

Usage:
    python3 tools/render.py
    python3 tools/render.py --preview
    python3 tools/render.py --engine ffmpeg
    python3 tools/render.py --dry-run
    python3 tools/render.py --output custom.mp4
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from common import (
    ASSET_REGISTRY,
    ROOT,
    TIMELINE_JSON,
    clip_timeline_duration,
    get_audio_tracks,
    get_track_by_id,
    get_visual_tracks,
    load_asset_registry,
    load_timeline,
    resolve_asset_path,
)

DEFAULT_OUTPUT = ROOT / "output" / "render.mp4"
PREVIEW_OUTPUT = ROOT / "output" / "preview.mp4"
REMOTION_DIR = ROOT / "remotion"


def parse_resolution(value: Any) -> tuple[int, int]:
    if isinstance(value, str) and "x" in value:
        width, height = value.lower().split("x", 1)
        return int(width), int(height)
    if isinstance(value, (list, tuple)) and len(value) == 2:
        return int(value[0]), int(value[1])
    raise ValueError(f"Unsupported resolution value: {value!r}")


def resolve_asset(asset_id: str, registry: dict[str, Any]) -> Path:
    return resolve_asset_path(asset_id, registry=registry)


def clip_src_duration(clip: dict[str, Any]) -> float:
    if "hold" in clip:
        return float(clip["hold"])
    return float(clip.get("to", 0.0)) - float(clip.get("from", 0.0))


def build_atempo_chain(speed: float) -> str:
    if speed <= 0:
        raise ValueError("Audio speed must be > 0")

    remaining = speed
    filters: list[str] = []
    while remaining < 0.5:
        filters.append("atempo=0.5")
        remaining /= 0.5
    while remaining > 2.0:
        filters.append("atempo=2.0")
        remaining /= 2.0
    if abs(remaining - 1.0) > 1e-6:
        filters.append(f"atempo={remaining:.5f}".rstrip("0").rstrip("."))
    return ",".join(filters)


def build_ffmpeg_command(
    timeline: dict[str, Any],
    registry: dict[str, Any],
    output_path: Path,
    preview: bool = False,
) -> list[str]:
    out_cfg = timeline.get("output", {})
    width, height = parse_resolution(out_cfg.get("resolution", "1280x720"))
    fps = out_cfg.get("fps", 30)
    tracks = timeline.get("tracks", [])
    total_duration = max(
        (float(clip.get("at", 0.0)) + clip_timeline_duration(clip) for clip in timeline.get("clips", [])),
        default=1.0,
    )
    visual_tracks = get_visual_tracks(timeline)
    audio_tracks = get_audio_tracks(timeline)

    input_files: list[Path] = []
    file_to_idx: dict[str, int] = {}

    def get_input_idx(path: Path) -> int:
        key = str(path)
        if key not in file_to_idx:
            file_to_idx[key] = len(input_files)
            input_files.append(path)
        return file_to_idx[key]

    for clip in timeline.get("clips", []):
        asset_id = clip.get("asset")
        if asset_id:
            get_input_idx(resolve_asset(asset_id, registry))

    filters: list[str] = []
    filters.append(f"color=c=black:s={width}x{height}:r={fps}:d={total_duration}[vbase0]")
    current_video_label = "vbase0"
    visual_index = 0

    def extract_fade_in(clip: dict[str, Any]) -> float | None:
        entrance = clip.get("entrance")
        if isinstance(entrance, dict) and entrance.get("type") == "fade":
            return float(entrance.get("duration", 0))
        return None

    def extract_fade_out(clip: dict[str, Any]) -> float | None:
        exit_effect = clip.get("exit")
        if isinstance(exit_effect, dict) and exit_effect.get("type") == "fade-out":
            return float(exit_effect.get("duration", 0))
        return None

    def warn_for_unsupported_effects(clip: dict[str, Any]) -> None:
        entrance = clip.get("entrance", {})
        exit_effect = clip.get("exit", {})
        continuous = clip.get("continuous", {})
        if entrance and entrance.get("type") not in (None, "fade"):
            print(f"Warning: ffmpeg engine only supports fade entrance; ignoring {entrance.get('type')} on {clip.get('id')}", file=sys.stderr)
        if exit_effect and exit_effect.get("type") not in (None, "fade-out"):
            print(f"Warning: ffmpeg engine only supports fade exit; ignoring {exit_effect.get('type')} on {clip.get('id')}", file=sys.stderr)
        if continuous:
            print(f"Warning: ffmpeg engine does not support continuous effect {continuous.get('type')} on {clip.get('id')}", file=sys.stderr)
        if clip.get("transition"):
            print(f"Warning: ffmpeg engine ignores transition {clip['transition'].get('type')} on {clip.get('id')}", file=sys.stderr)

    for track in visual_tracks:
        track_id = track["id"]
        track_clips = sorted(
            [clip for clip in timeline.get("clips", []) if clip.get("track") == track_id],
            key=lambda clip: float(clip.get("at", 0.0)),
        )

        for clip in track_clips:
            if clip.get("clipType") == "text":
                print(f"Warning: ffmpeg engine skips text clip {clip.get('id')}; use Remotion for text rendering.", file=sys.stderr)
                continue
            if not clip.get("asset"):
                continue

            warn_for_unsupported_effects(clip)

            asset_path = resolve_asset(clip["asset"], registry)
            input_idx = get_input_idx(asset_path)
            at = float(clip.get("at", 0.0))
            src_start = float(clip.get("from", 0.0))
            src_dur = clip_src_duration(clip)
            tl_dur = clip_timeline_duration(clip)
            speed = float(clip.get("speed", 1.0))
            fit = str(track.get("fit", "contain"))
            track_scale = float(track.get("scale", 1.0) or 1.0)
            target_opacity = float(track.get("opacity", 1.0) or 1.0) * float(clip.get("opacity", 1.0) or 1.0)
            is_image = asset_path.suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}

            if track.get("blendMode") not in (None, "normal"):
                print(f"Warning: ffmpeg engine ignores blend mode {track.get('blendMode')} on {track_id}", file=sys.stderr)

            label = f"vclip{visual_index}"
            visual_index += 1
            filters_chain: list[str] = []

            if is_image:
                filters_chain.append(f"[{input_idx}:v]")
                if fit == "manual":
                    filters_chain.append(f"scale={int(clip.get('width', 320))}:{int(clip.get('height', 240))}")
                elif fit == "cover":
                    filters_chain.append(f"scale={width}:{height}:force_original_aspect_ratio=increase")
                    filters_chain.append(f"crop={width}:{height}")
                else:
                    scaled_width = int(width * track_scale) if track_id != "V1" else width
                    scaled_height = int(height * track_scale) if track_id != "V1" else height
                    filters_chain.append(f"scale={scaled_width}:{scaled_height}:force_original_aspect_ratio=decrease")
                    filters_chain.append(f"pad={scaled_width}:{scaled_height}:(ow-iw)/2:(oh-ih)/2:color=black@0.0")
                    if track_id != "V1":
                        filters_chain.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0.0")
                filters_chain.append("setsar=1")
                filters_chain.append(f"trim=duration={src_dur}")
                filters_chain.append("setpts=PTS-STARTPTS")
            else:
                filters_chain.append(f"[{input_idx}:v]")
                filters_chain.append(f"trim=start={src_start}:end={src_start + src_dur}")
                pts = f"(PTS-STARTPTS)/{speed}" if speed != 1.0 else "PTS-STARTPTS"
                filters_chain.append(f"setpts={pts}")
                if fit == "manual":
                    filters_chain.append(f"scale={int(clip.get('width', 320))}:{int(clip.get('height', 240))}")
                elif fit == "cover":
                    filters_chain.append(f"scale={width}:{height}:force_original_aspect_ratio=increase")
                    filters_chain.append(f"crop={width}:{height}")
                else:
                    scaled_width = int(width * track_scale) if track_id != "V1" else width
                    scaled_height = int(height * track_scale) if track_id != "V1" else height
                    filters_chain.append(f"scale={scaled_width}:{scaled_height}:force_original_aspect_ratio=decrease")
                    filters_chain.append(f"pad={scaled_width}:{scaled_height}:(ow-iw)/2:(oh-ih)/2:color=black@0.0")
                    if track_id != "V1":
                        filters_chain.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0.0")
                filters_chain.append("setsar=1")
                filters_chain.append(f"fps={fps}")

            filters_chain.append("format=rgba")
            if target_opacity < 1.0:
                filters_chain.append(f"colorchannelmixer=aa={target_opacity}")

            fade_in = extract_fade_in(clip)
            fade_out = extract_fade_out(clip)
            if fade_in:
                filters_chain.append(f"fade=t=in:st=0:d={fade_in}:alpha=1")
            if fade_out:
                filters_chain.append(f"fade=t=out:st={max(0, tl_dur - fade_out)}:d={fade_out}:alpha=1")

            filters_chain.append(f"setpts=PTS+{at}/TB")
            filters.append(",".join(filters_chain) + f"[{label}]")

            out_label = f"vbase{visual_index}"
            overlay_x = int(clip.get("x", 0)) if fit == "manual" else 0
            overlay_y = int(clip.get("y", 0)) if fit == "manual" else 0
            filters.append(f"[{current_video_label}][{label}]overlay=x={overlay_x}:y={overlay_y}:eof_action=pass[{out_label}]")
            current_video_label = out_label

    final_video_label: str | None = current_video_label

    audio_labels: list[str] = []
    audio_index = 0
    for track in audio_tracks:
        track_clips = sorted(
            [clip for clip in timeline.get("clips", []) if clip.get("track") == track["id"]],
            key=lambda clip: float(clip.get("at", 0.0)),
        )
        for clip in track_clips:
            if clip.get("clipType") == "text":
                continue
            asset_id = clip.get("asset")
            if not asset_id:
                continue
            asset_path = resolve_asset(asset_id, registry)
            if asset_path.suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
                continue

            input_idx = get_input_idx(asset_path)
            src_start = float(clip.get("from", 0.0))
            src_dur = clip_src_duration(clip)
            speed = float(clip.get("speed", 1.0))
            at_ms = int(float(clip.get("at", 0.0)) * 1000)
            volume = float(clip.get("volume", 1.0))

            label = f"audio{audio_index}"
            audio_index += 1
            filter_expr = (
                f"[{input_idx}:a]"
                f"atrim=start={src_start}:end={src_start + src_dur},"
                "asetpts=PTS-STARTPTS"
            )
            atempo_chain = build_atempo_chain(speed)
            if atempo_chain:
                filter_expr += f",{atempo_chain}"
            if volume != 1.0:
                filter_expr += f",volume={volume}"
            filter_expr += f",adelay={at_ms}|{at_ms}[{label}]"
            filters.append(filter_expr)
            audio_labels.append(f"[{label}]")

    final_audio_label: str | None = None
    if audio_labels:
        final_audio_label = "afinal"
        filters.append(f"{''.join(audio_labels)}amix=inputs={len(audio_labels)}:duration=longest:normalize=0[{final_audio_label}]")

    cmd = ["ffmpeg", "-y"]
    for input_file in input_files:
        if input_file.suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
            cmd += ["-loop", "1"]
        cmd += ["-i", str(input_file)]

    cmd += ["-filter_complex", "; ".join(filters)]
    if final_video_label:
        cmd += ["-map", f"[{final_video_label}]"]
    if final_audio_label:
        cmd += ["-map", f"[{final_audio_label}]"]

    if preview:
        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "28"]
    else:
        cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "18"]

    if final_audio_label:
        cmd += ["-c:a", "aac", "-b:a", "192k"]

    cmd += ["-pix_fmt", "yuv420p", str(output_path)]
    return cmd


def ensure_json_sources(timeline_path: Path, registry_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    if not timeline_path.exists():
        print(
            f"Missing {timeline_path}. Run python3 tools/migrate_yaml_to_json.py first.",
            file=sys.stderr,
        )
        sys.exit(1)
    if not registry_path.exists():
        print(
            f"Missing {registry_path}. Run python3 tools/migrate_yaml_to_json.py first.",
            file=sys.stderr,
        )
        sys.exit(1)
    return load_timeline(timeline_path), load_asset_registry(registry_path)


def setup_remotion_public() -> None:
    script = REMOTION_DIR / "setup-public.sh"
    if not script.exists():
        raise FileNotFoundError(f"Missing Remotion public setup script: {script}")
    subprocess.run([str(script)], cwd=REMOTION_DIR, check=True)


def build_remotion_command(output_path: Path, preview: bool) -> list[str]:
    props = {"preview": preview}
    return [
        "npx",
        "remotion",
        "render",
        "Timeline",
        str(output_path),
        "--props",
        json.dumps(props, separators=(",", ":")),
    ]


def stream_subprocess(cmd: list[str], cwd: Path | None = None) -> int:
    process = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="")
    return process.wait()


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--engine", choices=["remotion", "ffmpeg"], default="remotion")
    parser.add_argument("--preview", action="store_true", help="Lower-res preview render")
    parser.add_argument("--dry-run", action="store_true", help="Print the command without running it")
    parser.add_argument("--output", default=None, help="Output file path")
    parser.add_argument("--timeline", default=str(TIMELINE_JSON), help="Path to timeline.json")
    parser.add_argument(
        "--asset-registry",
        default=str(ASSET_REGISTRY),
        help="Path to asset-registry.json",
    )


def run(args: argparse.Namespace) -> None:
    timeline_path = Path(args.timeline)
    registry_path = Path(args.asset_registry)
    timeline, registry = ensure_json_sources(timeline_path, registry_path)

    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = ROOT / output_path
    elif args.preview:
        output_path = PREVIEW_OUTPUT
    else:
        output_path = ROOT / timeline.get("output", {}).get("file", str(DEFAULT_OUTPUT.relative_to(ROOT)))

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if args.engine == "ffmpeg":
        try:
            cmd = build_ffmpeg_command(timeline, registry, output_path, preview=args.preview)
        except (FileNotFoundError, ValueError) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            sys.exit(1)

        if args.dry_run:
            print("ffmpeg command:")
            print("  " + " \\\n  ".join(cmd))
            return

        print(f"Rendering with ffmpeg -> {output_path}")
        return_code = subprocess.run(cmd, check=False).returncode
        if return_code != 0:
            sys.exit(return_code)
        return

    try:
        setup_remotion_public()
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        print(f"Error preparing Remotion public directory: {exc}", file=sys.stderr)
        sys.exit(1)

    cmd = build_remotion_command(output_path, preview=args.preview)
    if args.dry_run:
        print(f"(cd {REMOTION_DIR} && {' '.join(cmd)})")
        return

    print(f"Rendering with Remotion -> {output_path}")
    return_code = stream_subprocess(cmd, cwd=REMOTION_DIR)
    if return_code != 0:
        sys.exit(return_code)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Render the timeline using Remotion (default) or ffmpeg."
    )
    add_arguments(parser)
    run(parser.parse_args())


if __name__ == "__main__":
    main()
