#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/public"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

mkdir -p "$PUBLIC_DIR"

for asset in example-image1.jpg example-image2.jpg example-video.mp4; do
  if [ -f "$PUBLIC_DIR/$asset" ]; then
    rm -f "$PUBLIC_DIR/$asset"
  fi
done

ln -sfn ../../inputs "$PUBLIC_DIR/inputs"
ln -sfn ../../output "$PUBLIC_DIR/output"
# Copy JSON config files (symlinks don't work with Remotion's static file server)
cp "$ROOT_DIR/timeline.json" "$PUBLIC_DIR/timeline.json"
cp "$ROOT_DIR/asset-registry.json" "$PUBLIC_DIR/asset-registry.json"

if [ ! -e "$ROOT_DIR/inputs/example-image1.jpg" ] || [ ! -e "$ROOT_DIR/inputs/example-image2.jpg" ] || [ ! -e "$ROOT_DIR/inputs/example-video.mp4" ]; then
  echo "Expected composition assets in inputs/ are missing." >&2
  exit 1
fi
