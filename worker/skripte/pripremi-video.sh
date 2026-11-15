#!/usr/bin/env bash
# Pretvara video u HLS (delovi od 6 s) i salje ga u R2 bucket "vebinar-video".
#
#   ./skripte/pripremi-video.sh putanja/do/videa.mp4            -> pravi Cloudflare
#   ./skripte/pripremi-video.sh putanja/do/videa.mp4 --local    -> lokalni test (wrangler dev)
#
# Video ide u 720p (kao Zoom webinar), najvise 2,5 Mbit/s, da i telefon na slabijem
# mobilnom internetu stigne da ga ucita bez zastoja. H.264 + AAC,
# sto radi u svakom pregledacu, ukljucujuci iPhone. Tih snimak se pojaca jednim
# stalnim pojacanjem (vidi ispod), da bude jacine uobicajene za govor.
set -euo pipefail
ULAZ="${1:?Navedi putanju do videa}"
MOD="${2:---remote}"
CILJ="$(cd "$(dirname "$0")/.." && pwd)/.hls"
rm -rf "$CILJ" && mkdir -p "$CILJ"

# Jacina zvuka: prvo se izmeri ceo snimak, pa se pojaca JEDNIM stalnim pojacanjem
# (cilj -16 LUFS, ali tako da najglasniji deo ostane ispod -1 dBTP). Bez normalizacije
# u hodu: ona na pocetku snimka naglo pojacava i stisava glas i zvuci kao robot.
MERA="$(ffmpeg -hide_banner -nostats -i "$ULAZ" -vn -af loudnorm=I=-16:TP=-1.5:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')"
POJACANJE="$(python3 -c '
import json,sys
m=json.loads(sys.argv[1]); i=float(m["input_i"]); tp=float(m["input_tp"])
g=min(-16.0-i, -1.0-tp)
print(f"{max(-10.0,min(g,15.0)):.2f}")
' "$MERA")"
echo "Zvuk: izmereno $(echo "$MERA" | grep input_i) / $(echo "$MERA" | grep input_tp) -> pojacanje ${POJACANJE} dB"

ffmpeg -hide_banner -loglevel warning -stats -i "$ULAZ" \
  -vf "scale='min(1280,iw)':-2" -c:v libx264 -preset medium -profile:v high -pix_fmt yuv420p -crf 21 \
  -maxrate 2500k -bufsize 5000k -g 48 -keyint_min 48 -sc_threshold 0 -force_key_frames "expr:gte(t,n_forced*6)" \
  -af "volume=${POJACANJE}dB" -c:a aac -b:a 160k -ac 2 -ar 48000 \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_filename "$CILJ/d%05d.ts" "$CILJ/index.m3u8"

echo "Trajanje: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ULAZ") s, delova: $(ls "$CILJ"/*.ts | wc -l)"

FLAG="--remote"; [ "$MOD" = "--local" ] && FLAG="--local"
cd "$(dirname "$0")/.."

# Delovi idu 8 paralelno; playlista ide poslednja, tek kad su svi delovi gore.
posalji() {
  local f="$1" ime tip
  ime="$(basename "$f")"; tip="video/mp2t"
  for pokusaj in 1 2 3; do
    npx wrangler r2 object put "vebinar-video/video/$ime" --file "$f" --content-type "$tip" $FLAG >/dev/null 2>&1 && { printf "."; return 0; }
    sleep 2
  done
  echo; echo "NIJE POSLATO: $ime"; return 1
}
export -f posalji; export FLAG
ls "$CILJ"/*.ts | xargs -P 8 -I{} bash -c 'posalji "$@"' _ {}
npx wrangler r2 object put "vebinar-video/video/index.m3u8" --file "$CILJ/index.m3u8" --content-type "application/vnd.apple.mpegurl" $FLAG >/dev/null
echo; echo "Gotovo. Video je u R2 ($FLAG)."
