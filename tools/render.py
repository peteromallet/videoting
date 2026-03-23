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


def clip_timeline_duration(clip: dict[str, Any]) -> float:
    return clip_src_duration(clip) / float(clip.get("speed", 1.0))


def extract_effect_value(clip: dict[str, Any], effect_name: str) -> float | None:
    effects = clip.get("effects", [])
    if isinstance(effects, dict):
        value = effects.get(effect_name)
        return None if value is None else float(value)
    for effect in effects:
        if effect_name in effect:
            return float(effect[effect_name])
    return None


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

    all_clips = timeline.get("clips", [])
    video_clips = sorted(
        [clip for clip in all_clips if clip.get("track") == "video"],
        key=lambda clip: float(clip["at"]),
    )
    audio_clips = sorted(
        [clip for clip in all_clips if clip.get("track") == "audio"],
        key=lambda clip: float(clip["at"]),
    )
    overlay_clips = sorted(
        [clip for clip in all_clips if clip.get("track") == "overlay"],
        key=lambda clip: float(clip["at"]),
    )

    input_files: list[Path] = []
    file_to_idx: dict[str, int] = {}

    def get_input_idx(path: Path) -> int:
        key = str(path)
        if key not in file_to_idx:
            file_to_idx[key] = len(input_files)
            input_files.append(path)
        return file_to_idx[key]

    for clip in video_clips + audio_clips + overlay_clips:
        get_input_idx(resolve_asset(clip["asset"], registry))

    background_asset = out_cfg.get("background")
    if background_asset:
        get_input_idx(resolve_asset(background_asset, registry))

    filters: list[str] = []
    has_bg = bool(background_asset)
    gap_color = "black@0.0" if has_bg else "black"
    pad_color = "black@0.0" if has_bg else "black"
    rgba_suffix = ",format=rgba" if has_bg else ""

    v_seg_labels: list[str] = []
    cursor_v = 0.0

    for index, clip in enumerate(video_clips):
        path = resolve_asset(clip["asset"], registry)
        input_idx = get_input_idx(path)
        at = float(clip["at"])
        src_start = float(clip.get("from", 0.0))
        src_dur = clip_src_duration(clip)
        speed = float(clip.get("speed", 1.0))
        tl_dur = clip_timeline_duration(clip)
        is_image = path.suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}

        if at > cursor_v + 0.01:
            gap = round(at - cursor_v, 3)
            pad_label = f"vblack{index}"
            filters.append(
                f"color=c={gap_color}:s={width}x{height}:r={fps}:d={gap}{rgba_suffix}[{pad_label}]"
            )
            v_seg_labels.append(f"[{pad_label}]")
            cursor_v = at

        label = f"vc{index}"
        fade_in = extract_effect_value(clip, "fade_in")
        fade_out = extract_effect_value(clip, "fade_out")
        pts = f"(PTS-STARTPTS)/{speed}" if speed != 1.0 else "PTS-STARTPTS"

        if is_image:
            filter_expr = (
                f"[{input_idx}:v]"
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={pad_color},"
                f"setsar=1,"
                f"trim=duration={src_dur},"
                f"setpts={pts}"
                f"{rgba_suffix}"
            )
        else:
            filter_expr = (
                f"[{input_idx}:v]"
                f"trim=start={src_start}:end={src_start + src_dur},"
                f"setpts={pts},"
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={pad_color},"
                f"setsar=1,"
                f"fps={fps}"
                f"{rgba_suffix}"
            )

        if fade_in is not None:
            filter_expr += f",fade=t=in:st=0:d={fade_in}"
        if fade_out is not None:
            filter_expr += f",fade=t=out:st={tl_dur - fade_out}:d={fade_out}"

        filter_expr += f"[{label}]"
        filters.append(filter_expr)
        v_seg_labels.append(f"[{label}]")
        cursor_v = round(at + tl_dur, 3)

    final_video_label: str | None
    if not v_seg_labels:
        final_video_label = None
    elif len(v_seg_labels) == 1:
        filters.append(f"{v_seg_labels[0]}null[vfinal]")
        final_video_label = "vfinal"
    else:
        filters.append(f"{''.join(v_seg_labels)}concat=n={len(v_seg_labels)}:v=1:a=0[vfinal]")
        final_video_label = "vfinal"

    if final_video_label and overlay_clips:
        current_label = final_video_label
        for index, clip in enumerate(overlay_clips):
            path = resolve_asset(clip["asset"], registry)
            input_idx = get_input_idx(path)
            at = float(clip["at"])
            ov_dur = clip_timeline_duration(clip)
            ov_w = int(clip.get("width", 320))
            ov_h = int(clip.get("height", 240))
            ov_x = int(clip.get("x", 0))
            ov_y = int(clip.get("y", 0))
            opacity = float(clip.get("opacity", 1.0))

            ov_label = f"ovs{index}"
            scale_filter = f"[{input_idx}:v]scale={ov_w}:{ov_h}"
            if opacity < 1.0:
                scale_filter += f",format=rgba,colorchannelmixer=aa={opacity}"
            scale_filter += f"[{ov_label}]"
            filters.append(scale_filter)

            out_label = f"vov{index}"
            end_t = round(at + ov_dur, 3)
            filters.append(
                f"[{current_label}][{ov_label}]"
                f"overlay=x={ov_x}:y={ov_y}:enable='between(t,{at},{end_t})'[{out_label}]"
            )
            current_label = out_label

        final_video_label = current_label

    audio_layers: dict[str, list[dict[str, Any]]] = {}
    for clip in audio_clips:
        audio_layers.setdefault(clip["asset"], []).append(clip)

    layer_labels: list[str] = []

    for layer_idx, layer_clips in enumerate(audio_layers.values()):
        seg_labels: list[str] = []
        cursor_a = 0.0

        for index, clip in enumerate(layer_clips):
            path = resolve_asset(clip["asset"], registry)
            input_idx = get_input_idx(path)
            at = float(clip["at"])
            src_start = float(clip.get("from", 0.0))
            src_dur = clip_src_duration(clip)
            tl_dur = clip_timeline_duration(clip)
            speed = float(clip.get("speed", 1.0))
            is_image = path.suffix.lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
            volume = float(clip.get("volume", 1.0))

            if at > cursor_a + 0.01:
                gap = round(at - cursor_a, 3)
                sil_label = f"asil{layer_idx}_{index}"
                filters.append(
                    f"aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration={gap}[{sil_label}]"
                )
                seg_labels.append(f"[{sil_label}]")
                cursor_a = at

            label = f"ac{layer_idx}_{index}"
            if is_image:
                filters.append(
                    f"aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration={tl_dur}[{label}]"
                )
            else:
                filter_expr = (
                    f"[{input_idx}:a]"
                    f"atrim=start={src_start}:end={src_start + src_dur},"
                    f"asetpts=PTS-STARTPTS"
                )
                atempo_chain = build_atempo_chain(speed)
                if atempo_chain:
                    filter_expr += f",{atempo_chain}"
                if volume != 1.0:
                    filter_expr += f",volume={volume}"
                filter_expr += f"[{label}]"
                filters.append(filter_expr)

            seg_labels.append(f"[{label}]")
            cursor_a = round(at + tl_dur, 3)

        if not seg_labels:
            continue
        layer_label = f"alayer{layer_idx}"
        if len(seg_labels) == 1:
            filters.append(f"{seg_labels[0]}anull[{layer_label}]")
        else:
            filters.append(f"{''.join(seg_labels)}concat=n={len(seg_labels)}:v=0:a=1[{layer_label}]")
        layer_labels.append(f"[{layer_label}]")

    final_audio_label: str | None
    if not layer_labels:
        final_audio_label = None
    elif len(layer_labels) == 1:
        filters.append(f"{layer_labels[0]}anull[afinal]")
        final_audio_label = "afinal"
    else:
        filters.append(
            f"{''.join(layer_labels)}amix=inputs={len(layer_labels)}:duration=longest:normalize=0[afinal]"
        )
        final_audio_label = "afinal"

    bg_scale = float(out_cfg.get("background_scale", 0.95))
    if background_asset and final_video_label:
        bg_path = resolve_asset(background_asset, registry)
        bg_input = get_input_idx(bg_path)
        scale_w = int(width * bg_scale)
        scale_h = int(height * bg_scale)
        pad_x = (width - scale_w) // 2
        pad_y = (height - scale_h) // 2

        filters.append(f"[{bg_input}:v]scale={width}:{height},setsar=1[bg]")
        filters.append(f"[{final_video_label}]scale={scale_w}:{scale_h}[vscaled]")
        filters.append(f"[bg][vscaled]overlay=x={pad_x}:y={pad_y}:shortest=1[vwithbg]")
        final_video_label = "vwithbg"

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
