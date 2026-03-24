#!/usr/bin/env python3
"""
Generate or edit images using fal.ai's Nano Banana 2 model.

Images are saved to inputs/ and automatically ingested to create asset profiles.
The generation prompt is saved in the asset profile for easy identification.

Setup:
  Add your fal.ai API key to .env:
    FAL_KEY=...

Usage (generate):
    python3 tools/imagegen.py "a venn diagram of creative control and AI magic"
    python3 tools/imagegen.py "a logo" --name my-logo --aspect 16:9 --resolution 2K
    python3 tools/imagegen.py "a scene" --num 3 --format jpeg

Usage (edit — provide source images):
    python3 tools/imagegen.py "make the sky sunset orange" --edit inputs/photo.png
    python3 tools/imagegen.py "combine these into a collage" --edit inputs/a.png inputs/b.png
"""

import argparse
import base64
import os
import sys
from pathlib import Path

import requests
import yaml

from common import ROOT, PROFILES_DIR, download_file, save_yaml

FAL_GENERATE_ENDPOINT = "https://fal.run/fal-ai/nano-banana-2"
FAL_EDIT_ENDPOINT = "https://fal.run/fal-ai/nano-banana-2/edit"
INPUTS_DIR = ROOT / "inputs"

ASPECT_CHOICES = [
    "auto", "21:9", "16:9", "3:2", "4:3", "5:4",
    "1:1", "4:5", "3:4", "2:3", "9:16", "4:1", "1:4", "8:1", "1:8",
]
RESOLUTION_CHOICES = ["0.5K", "1K", "2K", "4K"]
FORMAT_CHOICES = ["png", "jpeg", "webp"]


# ── helpers ──────────────────────────────────────────────────────────────────


def file_to_data_uri(path: Path) -> str:
    """Convert a local image file to a data URI for the fal.ai API."""
    suffix = path.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(suffix, "image/png")
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("utf-8")
    return f"data:{mime};base64,{b64}"


def slugify(text: str) -> str:
    """Turn a prompt into a filename-safe slug."""
    slug = text.lower().strip()
    slug = slug.replace(" ", "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug[:60].strip("-")


def pick_output_path(name: str, suffix: str, ext: str) -> Path:
    """Choose an output path in inputs/, avoiding overwrites."""
    out_path = INPUTS_DIR / f"{name}{suffix}.{ext}"
    counter = 1
    while out_path.exists():
        out_path = INPUTS_DIR / f"{name}{suffix}-{counter}.{ext}"
        counter += 1
    return out_path


def save_generation_metadata(
    profile_path: Path,
    prompt: str,
    mode: str,
    source_images: list[str] | None = None,
):
    """Add generation metadata (prompt, mode, source images) to an asset profile."""
    if not profile_path.exists():
        return
    profile = yaml.safe_load(profile_path.read_text())
    profile["generation_prompt"] = prompt
    profile["generation_mode"] = mode
    if source_images:
        profile["generation_source_images"] = source_images
    save_yaml(profile, profile_path)


# ── API calls ────────────────────────────────────────────────────────────────


def call_fal_generate(
    prompt: str,
    api_key: str,
    num_images: int = 1,
    aspect_ratio: str = "auto",
    resolution: str = "1K",
    output_format: str = "png",
    seed: int | None = None,
) -> list[dict]:
    """Call fal.ai Nano Banana 2 text-to-image."""
    payload: dict = {
        "prompt": prompt,
        "num_images": num_images,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "output_format": output_format,
        "limit_generations": True,
    }
    if seed is not None:
        payload["seed"] = seed

    resp = requests.post(
        FAL_GENERATE_ENDPOINT,
        headers={
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
    )
    if not resp.ok:
        raise RuntimeError(f"fal.ai API error {resp.status_code}: {resp.text}")
    return resp.json().get("images", [])


def call_fal_edit(
    prompt: str,
    image_paths: list[Path],
    api_key: str,
    num_images: int = 1,
    aspect_ratio: str = "auto",
    resolution: str = "1K",
    output_format: str = "png",
    seed: int | None = None,
) -> list[dict]:
    """Call fal.ai Nano Banana 2 image edit endpoint."""
    image_urls = []
    for p in image_paths:
        p = p.resolve()
        if not p.exists():
            raise FileNotFoundError(f"Source image not found: {p}")
        print(f"  Encoding {p.name} as data URI...")
        image_urls.append(file_to_data_uri(p))

    payload: dict = {
        "prompt": prompt,
        "image_urls": image_urls,
        "num_images": num_images,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "output_format": output_format,
        "limit_generations": True,
    }
    if seed is not None:
        payload["seed"] = seed

    resp = requests.post(
        FAL_EDIT_ENDPOINT,
        headers={
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
    )
    if not resp.ok:
        raise RuntimeError(f"fal.ai API error {resp.status_code}: {resp.text}")
    return resp.json().get("images", [])


# ── standard interface ───────────────────────────────────────────────────────


def add_arguments(parser: argparse.ArgumentParser):
    parser.add_argument("prompt", help="Text prompt for image generation or editing")
    parser.add_argument("--edit", nargs="+", metavar="IMAGE",
                        help="Source image(s) to edit (enables edit mode)")
    parser.add_argument("--name", default=None,
                        help="Output filename stem (default: derived from prompt)")
    parser.add_argument("--num", type=int, default=1, choices=[1, 2, 3, 4],
                        help="Number of images to generate (default: 1)")
    parser.add_argument("--aspect", default="auto", choices=ASPECT_CHOICES,
                        help="Aspect ratio (default: auto)")
    parser.add_argument("--resolution", default="1K", choices=RESOLUTION_CHOICES,
                        help="Resolution (default: 1K)")
    parser.add_argument("--format", default="png", choices=FORMAT_CHOICES,
                        help="Output format (default: png)")
    parser.add_argument("--seed", type=int, default=None,
                        help="Random seed for reproducibility")
    parser.add_argument("--no-ingest", action="store_true",
                        help="Skip auto-ingest after download")


def run(args: argparse.Namespace):
    api_key = os.environ.get("FAL_KEY", "")
    if not api_key:
        print("Error: set FAL_KEY in .env")
        sys.exit(1)

    is_edit = bool(args.edit)
    name = args.name or slugify(args.prompt)
    ext = args.format

    if is_edit:
        source_paths = [Path(p) for p in args.edit]
        for p in source_paths:
            resolved = p if p.is_absolute() else ROOT / p
            if not resolved.exists():
                print(f"Error: source image not found: {resolved}")
                sys.exit(1)

        source_names = [p.name for p in source_paths]
        print(f"Editing image(s): {', '.join(source_names)}")
        print(f"  Prompt: \"{args.prompt}\"")
        print(f"  aspect={args.aspect}  resolution={args.resolution}  format={ext}")

        resolved_paths = [
            p if p.is_absolute() else ROOT / p for p in source_paths
        ]
        images = call_fal_edit(
            prompt=args.prompt,
            image_paths=resolved_paths,
            api_key=api_key,
            num_images=args.num,
            aspect_ratio=args.aspect,
            resolution=args.resolution,
            output_format=ext,
            seed=args.seed,
        )
    else:
        print(f"Generating image: \"{args.prompt}\"")
        print(f"  aspect={args.aspect}  resolution={args.resolution}  format={ext}")

        images = call_fal_generate(
            prompt=args.prompt,
            api_key=api_key,
            num_images=args.num,
            aspect_ratio=args.aspect,
            resolution=args.resolution,
            output_format=ext,
            seed=args.seed,
        )

    if not images:
        print("Error: no images returned")
        sys.exit(1)

    saved_paths: list[Path] = []
    for i, img in enumerate(images):
        url = img.get("url")
        if not url:
            print(f"  Warning: image {i} has no URL, skipping")
            continue

        suffix = f"-{i + 1}" if len(images) > 1 else ""
        out_path = pick_output_path(name, suffix, ext)

        print(f"  Downloading → {out_path.relative_to(ROOT)}")
        download_file(url, out_path)
        saved_paths.append(out_path)

    print(f"\nSaved {len(saved_paths)} image(s) to inputs/")

    # Auto-ingest and then add generation metadata to the profile
    if not args.no_ingest and saved_paths:
        from ingest import ingest
        print()
        for p in saved_paths:
            profile_path = ingest(str(p))
            save_generation_metadata(
                profile_path,
                prompt=args.prompt,
                mode="edit" if is_edit else "generate",
                source_images=[str(s) for s in args.edit] if is_edit else None,
            )
            print(f"  -> Added generation metadata to profile")

    # Auto-register in asset-registry.json
    if saved_paths:
        from common import register_asset
        for p in saved_paths:
            rel = str(p.relative_to(ROOT))
            asset_name = p.stem.lower().replace(" ", "-")
            if register_asset(asset_name, rel):
                print(f"  -> Registered '{asset_name}' in asset-registry.json")
            else:
                print(f"  -> '{asset_name}' already in asset-registry.json")


def main():
    parser = argparse.ArgumentParser(
        description="Generate or edit images with fal.ai Nano Banana 2."
    )
    add_arguments(parser)
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
