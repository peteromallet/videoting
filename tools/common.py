"""
Shared utilities for all video editor tools.

Importing this module auto-loads .env from the project root.
"""

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import yaml

# ── paths ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent
PROFILES_DIR = ROOT / "asset_profiles"
TIMELINE_YAML = ROOT / "timeline.yaml"
TIMELINE_JSON = ROOT / "timeline.json"
ASSET_REGISTRY = ROOT / "asset-registry.json"

# ── auto-load .env ───────────────────────────────────────────────────────────

_env_file = ROOT / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

# ── subprocess helpers ───────────────────────────────────────────────────────


def run_cmd(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)


def ffprobe_json(path: str) -> dict:
    r = run_cmd(["ffprobe", "-v", "quiet", "-print_format", "json",
                 "-show_format", "-show_streams", path])
    return json.loads(r.stdout)


def audio_duration(audio_path: str) -> float:
    """Return duration of audio file in seconds via ffprobe."""
    r = run_cmd(["ffprobe", "-v", "quiet", "-print_format", "json",
                 "-show_format", audio_path])
    return float(json.loads(r.stdout)["format"]["duration"])


# ── profile helpers ──────────────────────────────────────────────────────────

_profile_cache: dict[str, dict] = {}
_profile_paths: dict[str, Path] = {}


def load_profile(asset_id: str) -> dict | None:
    if asset_id in _profile_cache:
        return _profile_cache[asset_id]
    for f in PROFILES_DIR.glob("*.yaml"):
        p = yaml.safe_load(f.read_text())
        if p.get("id") == asset_id:
            _profile_cache[asset_id] = p
            _profile_paths[asset_id] = f
            return p
    return None


def get_profile_path(asset_id: str) -> Path | None:
    if asset_id not in _profile_paths:
        load_profile(asset_id)
    return _profile_paths.get(asset_id)


def load_all_profiles() -> list[dict]:
    profiles = []
    for f in PROFILES_DIR.glob("*.yaml"):
        try:
            p = yaml.safe_load(f.read_text())
            profiles.append(p)
        except Exception:
            pass
    return sorted(profiles, key=lambda p: p.get("file", ""))


# ── yaml helpers ─────────────────────────────────────────────────────────────


def _atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", delete=False, dir=path.parent) as tmp:
        tmp.write(text)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def save_yaml(data: Any, path: Path) -> None:
    _atomic_write_text(
        path,
        yaml.dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False),
    )


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def save_json(data: Any, path: Path) -> None:
    _atomic_write_text(path, json.dumps(data, indent=2) + "\n")


def load_timeline(path: Path = TIMELINE_JSON) -> dict[str, Any]:
    return load_json(path)


def save_timeline(data: dict[str, Any], path: Path = TIMELINE_JSON) -> None:
    save_json(data, path)


def load_asset_registry(path: Path = ASSET_REGISTRY) -> dict[str, Any]:
    if not path.exists():
        return {"assets": {}}
    data = load_json(path)
    data.setdefault("assets", {})
    return data


def save_asset_registry(data: dict[str, Any], path: Path = ASSET_REGISTRY) -> None:
    data.setdefault("assets", {})
    save_json(data, path)


# ── asset map helpers ────────────────────────────────────────────────────────


def infer_asset_type(asset_path: str) -> str:
    suffix = Path(asset_path).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}:
        return "image"
    if suffix in {".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"}:
        return "audio"
    if suffix in {".mp4", ".mov", ".mkv", ".avi", ".webm"}:
        return "video"
    return "unknown"


def profile_to_registry_entry(profile: dict[str, Any], fallback_file: str | None = None) -> dict[str, Any]:
    entry: dict[str, Any] = {}

    file_value = profile.get("file") or fallback_file
    if file_value:
        entry["file"] = file_value

    asset_type = profile.get("type")
    if asset_type:
        entry["type"] = asset_type
    elif fallback_file:
        entry["type"] = infer_asset_type(fallback_file)

    if "duration_s" in profile:
        entry["duration"] = profile["duration_s"]
    if "resolution" in profile:
        entry["resolution"] = profile["resolution"]
    elif "dimensions" in profile:
        entry["resolution"] = profile["dimensions"]
    if "fps" in profile:
        entry["fps"] = profile["fps"]

    return entry


def register_asset(asset_key: str, asset_path: str, metadata: dict[str, Any] | None = None) -> bool:
    """Upsert an asset in asset-registry.json. Returns True if newly added."""
    registry = load_asset_registry()
    assets = registry.setdefault("assets", {})
    existing = dict(assets.get(asset_key, {}))

    entry = dict(existing)
    entry["file"] = asset_path
    entry.setdefault("type", infer_asset_type(asset_path))
    if metadata:
        for key, value in metadata.items():
            if value is not None:
                entry[key] = value

    added = asset_key not in assets
    if entry != existing:
        assets[asset_key] = entry
        save_asset_registry(registry)
    return added


def get_asset_entry(asset_id: str, registry: dict[str, Any] | None = None) -> dict[str, Any]:
    registry = registry or load_asset_registry()
    assets = registry.get("assets", {})
    if asset_id not in assets:
        raise FileNotFoundError(f"Asset '{asset_id}' not found in asset-registry.json")
    return assets[asset_id]


def resolve_asset_path(asset_id: str, registry: dict[str, Any] | None = None) -> Path:
    entry = get_asset_entry(asset_id, registry=registry)
    asset_path = ROOT / entry["file"]
    if not asset_path.exists():
        raise FileNotFoundError(
            f"Asset '{asset_id}' points to missing file '{entry['file']}' in asset-registry.json"
        )
    return asset_path


# ── openai client ────────────────────────────────────────────────────────────


def get_openai_client():
    import openai
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return None
    return openai.OpenAI(api_key=api_key)
