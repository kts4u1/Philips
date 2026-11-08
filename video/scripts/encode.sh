#!/usr/bin/env bash
# Joins rendered frames and the soundtrack into the final MP4.
# Usage: [FRAMES=output/frames_en] scripts/encode.sh [output.mp4]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:-output/philips_ccj_engineers.mp4}
FRAMES=${FRAMES:-output/frames}
ffmpeg -hide_banner -loglevel warning -nostats -y \
  -framerate 30 -i "$FRAMES/f%05d.jpg" -i output/audio.wav \
  -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf "${CRF:-22}" -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -af "volume=-2.8dB" -c:a aac -b:a 192k -shortest "$OUT"
ls -lh "$OUT"
