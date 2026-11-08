#!/usr/bin/env bash
# Downloads the satellite tiles listed in tiles.txt (z/y/x per line) from Esri World Imagery.
set -euo pipefail
cd "$(dirname "$0")/.."
LIST=${1:-output/tiles.txt}
export URL="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile"
grep -v '^$' "$LIST" | xargs -P 8 -I{} sh -c '
  f="assets/tiles/{}.jpg"
  if [ ! -s "$f" ]; then
    mkdir -p "$(dirname "$f")"
    for i in 1 2 3; do
      curl -sSf --max-time 30 -A "philips-south-video/1.0" -o "$f.part" "$URL/{}" && mv "$f.part" "$f" && break
      sleep $i
    done
  fi'
echo "tiles on disk: $(find assets/tiles -name '*.jpg' | wc -l)"
