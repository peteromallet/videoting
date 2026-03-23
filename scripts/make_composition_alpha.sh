#!/bin/bash
# Creates the composition video with transparent background:
# image1 (top-left) + image2 (bottom-left) + video (right)
# Images fade in sequentially, then the video fades in and plays
# Output: WebM VP9 with alpha channel

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT_DIR="$SCRIPT_DIR/../inputs"

ffmpeg -y \
  -f lavfi -i "color=c=black@0.0:s=1920x1080:d=7,format=rgba" \
  -loop 1 -t 7 -i "$INPUT_DIR/example-image1.jpg" \
  -loop 1 -t 7 -i "$INPUT_DIR/example-image2.jpg" \
  -i "$INPUT_DIR/example-video.mp4" \
  -filter_complex "\
    [1:v]scale=640:476,format=rgba,fade=t=in:st=0:d=0.4:alpha=1[img1];\
    [2:v]scale=640:476,format=rgba,fade=t=in:st=0.5:d=0.4:alpha=1[img2];\
    [3:v]scale=1160:876,format=rgba,setpts=PTS+1.0/TB,fade=t=in:st=1.0:d=0.4:alpha=1[vid];\
    [0:v][img1]overlay=40:54[t1];\
    [t1][img2]overlay=40:550[t2];\
    [t2][vid]overlay=720:102:eof_action=pass[out]\
  " \
  -map "[out]" \
  -t 6.37 \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 4M -auto-alt-ref 0 \
  "$INPUT_DIR/output_composition.webm"
