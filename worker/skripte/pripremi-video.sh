#!/usr/bin/env bash
# Pretvara video u HLS (delovi od 6 s) i salje ga u R2 bucket "vebinar-video".
#
#   ./skripte/pripremi-video.sh putanja/do/videa.mp4            -> pravi Cloudflare
#   ./skripte/pripremi-video.sh putanja/do/videa.mp4 --local    -> lokalni test (wrangler dev)
#
# Video ide u 1080p ako je izvor toliki, inace u izvornoj velicini. H.264 + AAC,
# sto radi u svakom pregledacu, ukljucujuci iPhone. Zvuk se normalizuje na
# standardnu jacinu za govor (-16 LUFS), da tih snimak ne bude tezak za slusanje.
set -euo pipefail
ULAZ="${1:?Navedi putanju do videa}"
MOD="${2:---remote}"
CILJ="$(cd "$(dirname "$0")/.." && pwd)/.hls"
rm -rf "$CILJ" && mkdir -p "$CILJ"

ffmpeg -hide_banner -loglevel warning -stats -i "$ULAZ" \
  -vf "scale='min(1920,iw)':-2" -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p -crf 21 \
  -maxrate 4500k -bufsize 9000k -g 48 -keyint_min 48 -sc_threshold 0 -force_key_frames "expr:gte(t,n_forced*6)" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 160k -ac 2 -ar 48000 \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_filename "$CILJ/d%05d.ts" "$CILJ/index.m3u8"

echo "Trajanje: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ULAZ") s, delova: $(ls "$CILJ"/*.ts | wc -l)"

FLAG="--remote"; [ "$MOD" = "--local" ] && FLAG="--local"
for f in "$CILJ"/*.ts "$CILJ/index.m3u8"; do
  ime="$(basename "$f")"
  tip="video/mp2t"; [ "$ime" = "index.m3u8" ] && tip="application/vnd.apple.mpegurl"
  npx wrangler r2 object put "vebinar-video/video/$ime" --file "$f" --content-type "$tip" $FLAG >/dev/null
  printf "."
done
echo; echo "Gotovo. Video je u R2 ($FLAG)."
