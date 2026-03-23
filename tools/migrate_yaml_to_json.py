#!/usr/bin/env python3
"""One-time migration: convert timeline.yaml + asset_profiles/ -> timeline.json + asset-registry.json."""

import json
import sys
from pathlib import Path
from typing import Any

import yaml

from common import (
    ASSET_REGISTRY,
    PROFILES_DIR,
    ROOT,
    TIMELINE_JSON,
    TIMELINE_YAML,
    ffprobe_json,
    infer_asset_type,
    profile_to_registry_entry,
    save_asset_registry,
    save_timeline,
)


def load_profiles() -> dict[str, dict[str, Any]]:
    profiles: dict[str, dict[str, Any]] = {}
    for profile_path in sorted(PROFILES_DIR.glob("*.yaml")):
        try:
            profile = yaml.safe_load(profile_path.read_text())
        except Exception as exc:
            print(f"warning: could not load {profile_path.name}: {exc}", file=sys.stderr)
            continue
        if profile and profile.get("id"):
            profiles[profile["id"]] = profile
    return profiles


def normalize_effects(clip: dict[str, Any]) -> list[dict[str, float]]:
    effects = clip.get("effects")
    if isinstance(effects, list):
        return effects
    if isinstance(effects, dict):
        return [{key: value} for key, value in effects.items()]

    normalized: list[dict[str, float]] = []
    if "fade_in" in clip:
        normalized.append({"fade_in": clip["fade_in"]})
    if "fade_out" in clip:
        normalized.append({"fade_out": clip["fade_out"]})
    return normalized


def probe_fallback_metadata(relative_path: str) -> dict[str, Any]:
    path = ROOT / relative_path
    if not path.exists():
        return {}

    asset_type = infer_asset_type(relative_path)
    entry: dict[str, Any] = {"type": asset_type}
    try:
        probe = ffprobe_json(str(path))
    except Exception:
        return entry

    streams = probe.get("streams", [])
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if video_stream:
        width = video_stream.get("width")
        height = video_stream.get("height")
        if width and height:
            entry["resolution"] = f"{width}x{height}"
        fps = video_stream.get("r_frame_rate")
        if fps and fps != "0/0":
            num, den = fps.split("/")
            if asset_type == "video" and float(den) != 0:
                entry["fps"] = round(float(num) / float(den), 3)

    duration = probe.get("format", {}).get("duration")
    if duration is not None and asset_type in {"video", "audio"}:
        entry["duration"] = round(float(duration), 3)

    return entry


def build_asset_registry(asset_map: dict[str, str], profiles: dict[str, dict[str, Any]]) -> dict[str, Any]:
    assets: dict[str, dict[str, Any]] = {}

    for asset_id, relative_path in asset_map.items():
        profile = profiles.get(asset_id, {})
        entry = profile_to_registry_entry(profile, fallback_file=relative_path)
        fallback = probe_fallback_metadata(relative_path)
        merged = dict(fallback)
        merged.update(entry)
        merged["file"] = relative_path
        assets[asset_id] = merged

    return {"assets": assets}


def build_timeline_json(timeline: dict[str, Any]) -> dict[str, Any]:
    output = timeline.get("output", {})
    clips: list[dict[str, Any]] = []

    for index, clip in enumerate(timeline.get("clips", [])):
        migrated_clip: dict[str, Any] = {
            "id": clip.get("id", f"clip-{index}"),
            "at": clip["at"],
            "track": clip["track"],
            "asset": clip["asset"],
        }
        for field in ("from", "to", "speed", "hold", "volume", "x", "y", "width", "height", "opacity"):
            if field in clip:
                migrated_clip[field] = clip[field]

        effects = normalize_effects(clip)
        if effects:
            migrated_clip["effects"] = effects

        clips.append(migrated_clip)

    return {
        "output": {
            "resolution": output.get("resolution", "1280x720"),
            "fps": output.get("fps", 30),
            "file": output.get("file", "output/render.mp4"),
            "background": output.get("background"),
            "background_scale": output.get("background_scale"),
        },
        "clips": clips,
    }


def verify(timeline_yaml: dict[str, Any], timeline_json: dict[str, Any], registry: dict[str, Any]) -> None:
    asset_map = timeline_yaml.get("asset_map", {})
    clips = timeline_yaml.get("clips", [])

    print("--- Verification ---")
    print(f"Assets in YAML asset_map: {len(asset_map)}")
    print(f"Assets in registry:       {len(registry['assets'])}")
    print(f"Clips in YAML:            {len(clips)}")
    print(f"Clips in JSON:            {len(timeline_json['clips'])}")

    missing_assets = [
        clip["asset"]
        for clip in timeline_json["clips"]
        if clip["asset"] not in registry["assets"]
    ]
    if missing_assets:
        raise RuntimeError(f"Missing clip asset references in registry: {sorted(set(missing_assets))}")

    missing_background = timeline_json["output"].get("background")
    if missing_background and missing_background not in registry["assets"]:
        raise RuntimeError(f"Background asset '{missing_background}' missing from registry")

    print("All clip asset references resolved.")


def main() -> None:
    if not TIMELINE_YAML.exists():
        raise FileNotFoundError(f"Missing source timeline: {TIMELINE_YAML}")

    timeline_yaml = yaml.safe_load(TIMELINE_YAML.read_text())
    profiles = load_profiles()
    asset_map = timeline_yaml.get("asset_map", {})

    registry = build_asset_registry(asset_map, profiles)
    timeline_json = build_timeline_json(timeline_yaml)

    save_asset_registry(registry, ASSET_REGISTRY)
    save_timeline(timeline_json, TIMELINE_JSON)

    print(f"Wrote {ASSET_REGISTRY.relative_to(ROOT)}")
    print(f"Wrote {TIMELINE_JSON.relative_to(ROOT)}")
    verify(timeline_yaml, timeline_json, registry)


if __name__ == "__main__":
    main()
