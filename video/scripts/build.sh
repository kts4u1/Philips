#!/usr/bin/env bash
# Full rebuild: map tiles -> soundtrack -> frames -> MP4.
# Needs node + playwright (Chromium), python3 with numpy/scipy, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p output
node scripts/render.js --collect output/tiles.txt
./scripts/fetch_tiles.sh output/tiles.txt
python3 scripts/make_audio.py output/audio.wav
rm -rf output/frames
node scripts/render.js --out output/frames --workers "${WORKERS:-4}"
./scripts/encode.sh
