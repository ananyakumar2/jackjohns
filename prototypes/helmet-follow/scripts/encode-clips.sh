#!/usr/bin/env bash
# Downloads the placeholder footage and encodes one short, seamlessly looping
# H.264 clip per pillar into public/content/clips/.
#
#   bash scripts/encode-clips.sh
#
# Jack's own clips don't need this script: see "Swapping clips and livery" in the README.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
cache="$here/.cache/clips"
out="$here/public/content/clips"
mkdir -p "$cache" "$out"
ua="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"

fetch() { # name url
  [ -s "$cache/$1" ] || curl -fsSL -A "$ua" -o "$cache/$1" "$2"
}

fetch sim-racing.src.mp4   "https://videos.pexels.com/video-files/6498252/6498252-hd_1280_720_25fps.mp4"
fetch racing.src.webm      "https://upload.wikimedia.org/wikipedia/commons/8/8e/2023_TCR_World_Tour_at_El_Pinar_-_Afternoon_race_Video_01.webm"
fetch commentating.src.mp4 "https://assets.mixkit.co/videos/2963/2963-720.mp4"
fetch coaching.src.mp4     "https://assets.mixkit.co/videos/72/72-720.mp4"

XF=0.5 # loop crossfade, seconds

# encode <name> <src> <start> <duration> <crop/scale filter> [crf]
# Output is <duration> long. Its first XF seconds blend the source's tail into its
# head, so the last frame flows straight into the first and the loop has no cut.
encode() {
  local name="$1" src="$2" start="$3" dur="$4" vf="$5" crf="${6:-24}"
  local total; total=$(awk -v d="$dur" -v x="$XF" 'BEGIN{print d + x}')
  ffmpeg -v error -y -ss "$start" -t "$total" -i "$cache/$src" -filter_complex "
    [0:v]$vf,setsar=1,format=yuv420p,split=3[a][b][c];
    [a]trim=0:$XF,setpts=PTS-STARTPTS[head];
    [b]trim=$XF:$dur,setpts=PTS-STARTPTS[body];
    [c]trim=$dur:$total,setpts=PTS-STARTPTS[tail];
    [tail][head]xfade=transition=fade:duration=$XF:offset=0[seam];
    [seam][body]concat=n=2:v=1[v]" \
    -map "[v]" -an -c:v libx264 -profile:v high -preset slow -crf "$crf" \
    -g 25 -keyint_min 25 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart \
    "$out/$name.mp4"
  printf '%-14s %6.0f KB\n' "$name" "$(($(stat -c%s "$out/$name.mp4") / 1024))"
}

encode sim-racing   sim-racing.src.mp4   2.0  4.5 "scale=1280:720"
encode racing       racing.src.webm      41.6 4.0 "scale=1280:720:flags=lanczos" 28
# portrait source: a landscape band around the face and microphone
encode commentating commentating.src.mp4 2.0  4.5 "crop=720:404:0:170"
encode coaching     coaching.src.mp4     6.0  4.5 "scale=1280:720"
