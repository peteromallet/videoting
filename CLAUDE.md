# Announcement Video

Open-source announcement video project with a JSON timeline, Python editing tools, and Remotion Studio as the render and preview engine.

## Source of truth

- `timeline.json` is the authoritative timeline. Clips reference assets by ID only.
- `asset-registry.json` is the authoritative asset ID -> file mapping.
- `asset_profiles/*.yaml` remain the detailed per-asset profiles for transcripts, silence regions, visual descriptions, and generation metadata.
- `timeline.yaml` is now a frozen legacy reference for the old viewer path and one-time migration input. Python tools no longer write to it.

## Project structure

- `timeline.json` - Remotion/Python timeline config
- `asset-registry.json` - asset registry used by Remotion and Python tools
- `timeline.yaml` - legacy YAML timeline kept for the old viewer only
- `inputs/` - source media files
- `output/` - rendered outputs
- `asset_profiles/` - YAML asset profiles
- `tools/` - Python CLI tools
- `remotion/` - Remotion Studio project and compositions
- `viewer/` - primary Vite editor that reads/writes `timeline.json` + `asset-registry.json`
- `shared/` - shared TypeScript types, serialization helpers, editor utilities, and Remotion composition pieces
- `scripts/` - one-off generation scripts

## Core workflow

1. Ingest or generate assets. This updates `asset-registry.json` and writes/updates the asset profile YAML.
2. Edit `timeline.json` directly, via Python tools, or via natural-language instructions to an agent.
3. Edit in `viewer/` for timeline, overlay, split, mute, and property changes.
4. Preview in Remotion Studio when you want the standalone composition view.
4. Render with `python3 tools/render.py`.

## Python tools

All tools run from the project root and share helpers from `tools/common.py`.

### Migrate YAML -> JSON

```bash
python3 tools/migrate_yaml_to_json.py
```

One-time migration from `timeline.yaml` + `asset_profiles/` into `timeline.json` and `asset-registry.json`.

### Ingest

```bash
python3 tools/ingest.py inputs/demo-one.mp4
python3 tools/ingest.py inputs/audio.MP3
python3 tools/ingest.py inputs/example-image1.jpg
```

Writes the asset profile YAML and upserts the asset into `asset-registry.json`.

### View

```bash
python3 tools/view.py
python3 tools/view.py --summary
python3 tools/view.py --at 10.5
```

Reads `timeline.json` + `asset-registry.json` and renders a text timeline view.

### Place

```bash
python3 tools/place.py --clip demo-one --at 12.0
python3 tools/place.py --clip demo-one --at-word "creative control"
python3 tools/place.py --clip demo-one --at 12.0 --overlap trim
```

Moves a clip in `timeline.json` and optionally resolves gaps/overlaps.

### Render

```bash
python3 tools/render.py
python3 tools/render.py --preview
python3 tools/render.py --dry-run
python3 tools/render.py --engine ffmpeg
```

- Default engine: Remotion
- Comparison engine: ffmpeg
- Remotion reads `timeline.json` and `asset-registry.json` directly and does not auto-migrate from YAML

### Search

```bash
python3 tools/search.py transcript "announcement"
python3 tools/search.py visual "dashboard"
python3 tools/search.py all "logo"
```

Searches the asset profile YAML files.

### Image generation

```bash
python3 tools/imagegen.py "a venn diagram of creative control and AI magic"
python3 tools/imagegen.py "make the sky sunset orange" --edit inputs/photo.png
```

Generates or edits images in `inputs/`, ingests them, and registers them in `asset-registry.json`.

### TTS

```bash
python3 tools/tts.py \
  --audio inputs/audio.MP3 \
  --start 9.64 --end 13.14 \
  --original "So I built a tool and made a video for a poem" \
  --target "So I made a tool and produced a video for a poem" \
  --out inputs/edited-intro.mp3
```

Produces edited audio, then ingest it and add a new clip to `timeline.json`.

## Remotion Studio

```bash
cd remotion
npm install
npx remotion studio
```

Or:

```bash
cd remotion
npm run dev
```

Notes:

- `remotion/setup-public.sh` creates symlinks from `remotion/public/` to `../inputs/`, `../output/`, `../timeline.json`, and `../asset-registry.json`.
- The existing `CompositionVideo` composition is preserved for the intro layout asset.
- The `Timeline` composition reads the shared JSON config and is preview-only in Studio.
- `CompositionVideo` now loads its sample assets from `staticFile("inputs/...")`.

## Natural-language editing

Phase 1 is intentionally simple:

- edit `timeline.json`
- edit `asset-registry.json` only for asset registration changes
- preview immediately in Remotion Studio
- render with Remotion

This keeps the config easy for both an AI agent and Python tools to read/write.

## Viewer editor

`viewer/` is now the main editor:

- it reads `timeline.json` and `asset-registry.json`
- it previews the actual shared Remotion composition through `@remotion/player`
- it saves JSON back to disk and stays compatible with the Python tools and Studio
- uploads should go through `python3 tools/ingest.py` so `asset_profiles/*.yaml` stay in sync

`timeline.yaml` remains in the repo only as a frozen legacy artifact and should not be used for new edits.
