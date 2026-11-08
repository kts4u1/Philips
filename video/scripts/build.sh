#!/usr/bin/env bash
# Full rebuild: map tiles -> soundtrack -> frames -> MP4.
# Usage: scripts/build.sh [ko|en]   (default ko)
# Needs node + playwright (Chromium), python3 with numpy/scipy, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
L=${1:-ko}
if [ "$L" = ko ]; then FR=output/frames; OUT=output/philips_ccj_engineers.mp4
else FR=output/frames_$L; OUT=output/philips_ccj_engineers_$L.mp4; fi
mkdir -p output
node scripts/render.js --collect output/tiles.txt
./scripts/fetch_tiles.sh output/tiles.txt
[ -s output/audio.wav ] || python3 scripts/make_audio.py output/audio.wav
rm -rf "$FR"
node scripts/render.js --lang "$L" --out "$FR" --workers "${WORKERS:-4}"
FRAMES="$FR" ./scripts/encode.sh "$OUT"
