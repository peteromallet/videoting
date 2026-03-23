#!/usr/bin/env python3
"""
Move a clip on the timeline and resolve overlaps/gaps with neighbors.

Usage:
    python3 tools/cli.py place --clip demo-one --at 9.16
    python3 tools/cli.py place --clip demo-one --at-word "so i"
    python3 tools/cli.py place --clip demo-one --at 9.16 --overlap trim
    python3 tools/cli.py place --clip demo-one --at 9.16 --overlap speed
"""

import argparse
import sys

from common import TIMELINE_JSON, get_asset_entry, load_asset_registry, load_profile, load_timeline, save_timeline


# ── helpers ──────────────────────────────────────────────────────────────────


def clip_span(clip: dict) -> tuple[float, float]:
    """Return (timeline_start, timeline_end) for a clip."""
    at = float(clip["at"])
    src_start = float(clip.get("from", 0.0))
    if "hold" in clip:
        src_end = src_start + float(clip["hold"])
    else:
        src_end = float(clip.get("to", src_start))
    speed = float(clip.get("speed", 1.0))
    tl_dur = (src_end - src_start) / speed
    return (at, round(at + tl_dur, 6))


def resolve_at_word(timeline: dict, phrase: str, index: int = 0) -> float:
    """Find a word/phrase in the audio transcript and return its timeline time."""
    # Find the audio clip on the timeline
    audio_clip = None
    for clip in timeline.get("clips", []):
        if str(clip.get("track", "")).startswith("A"):
            audio_clip = clip
            break

    if audio_clip is None:
        print("ERROR: No audio clip found on the timeline.", file=sys.stderr)
        sys.exit(1)

    profile = load_profile(audio_clip["asset"])
    if not profile:
        print(f"ERROR: No profile found for audio asset '{audio_clip['asset']}'.", file=sys.stderr)
        sys.exit(1)

    words_list = profile.get("transcript", {}).get("words", [])
    if not words_list:
        print("ERROR: No word-level transcript found in audio profile.", file=sys.stderr)
        sys.exit(1)

    # Search for phrase (case-insensitive, multi-word)
    phrase_words = phrase.lower().split()
    phrase_len = len(phrase_words)
    matches = []

    for i in range(len(words_list) - phrase_len + 1):
        candidate = [words_list[i + j]["word"].lower() for j in range(phrase_len)]
        if candidate == phrase_words:
            matches.append(words_list[i])

    if not matches:
        print(f"ERROR: Phrase '{phrase}' not found in audio transcript.", file=sys.stderr)
        sys.exit(1)

    if len(matches) > 1:
        print(f"  WARNING: '{phrase}' appears {len(matches)} times in transcript. "
              f"Using occurrence #{index} (--at-word-index to change).", file=sys.stderr)

    if index >= len(matches):
        print(f"ERROR: Only {len(matches)} occurrence(s) of '{phrase}', "
              f"but --at-word-index {index} requested.", file=sys.stderr)
        sys.exit(1)

    match = matches[index]
    source_time = match["start"]

    # Convert source time → timeline time
    audio_at = float(audio_clip["at"])
    audio_from = float(audio_clip.get("from", 0.0))
    audio_speed = float(audio_clip.get("speed", 1.0))
    timeline_time = audio_at + (source_time - audio_from) / audio_speed

    print(f"  Resolved '{phrase}' → source {source_time:.2f}s → timeline {timeline_time:.2f}s")

    return round(timeline_time, 3)


# ── conflict detection & resolution ──────────────────────────────────────────


def find_conflicts(clips: list[dict], moved_clip: dict) -> list[dict]:
    """Find overlaps and gaps between adjacent clips on the same track."""
    track = moved_clip.get("track", "V2")
    track_clips = [c for c in clips if c.get("track", "V2") == track]
    track_clips.sort(key=lambda c: float(c["at"]))

    conflicts = []
    for i in range(len(track_clips) - 1):
        prev = track_clips[i]
        nxt = track_clips[i + 1]
        _, prev_end = clip_span(prev)
        nxt_start = float(nxt["at"])

        diff = nxt_start - prev_end
        if abs(diff) > 0.001:
            conflicts.append({
                "prev": prev,
                "next": nxt,
                "overlap": -diff if diff < 0 else 0,
                "gap": diff if diff > 0 else 0,
            })

    return conflicts


def compute_trim_fix(conflict: dict) -> dict:
    """Compute the trim adjustment for a conflict."""
    overlap = conflict["overlap"]
    prev = conflict["prev"]
    nxt = conflict["next"]

    if overlap > 0:
        # prev overlaps into nxt — shorten prev by reducing its 'to'
        prev_speed = float(prev.get("speed", 1.0))
        src_trim = overlap * prev_speed
        old_to = float(prev.get("to", 0))
        new_to = round(old_to - src_trim, 2)
        return {
            "clip": prev["asset"],
            "field": "to",
            "old": old_to,
            "new": new_to,
        }

    # gap: advance nxt's 'from' and 'at' to close the gap
    gap = conflict["gap"]
    nxt_speed = float(nxt.get("speed", 1.0))
    src_advance = gap * nxt_speed
    old_from = float(nxt.get("from", 0))
    new_from = round(old_from - src_advance, 2)
    old_at = float(nxt["at"])
    new_at = round(old_at - gap, 2)
    return {
        "clip": nxt["asset"],
        "field": "from+at",
        "old_from": old_from,
        "new_from": new_from,
        "old_at": old_at,
        "new_at": new_at,
    }


def compute_speed_fix(conflict: dict) -> dict:
    """Compute the speed adjustment for a conflict."""
    overlap = conflict["overlap"]
    prev = conflict["prev"]
    nxt = conflict["next"]

    if overlap > 0:
        # Speed up prev so it finishes before nxt starts
        prev_start, prev_end = clip_span(prev)
        current_duration = prev_end - prev_start
        target_duration = current_duration - overlap
        if target_duration <= 0:
            return {"clip": prev["asset"], "error": "overlap exceeds clip duration"}
        old_speed = float(prev.get("speed", 1.0))
        new_speed = round(old_speed * (current_duration / target_duration), 2)
        return {
            "clip": prev["asset"],
            "field": "speed",
            "old": old_speed,
            "new": new_speed,
        }

    # gap: slow down prev to fill gap
    gap = conflict["gap"]
    prev_start, prev_end = clip_span(prev)
    current_duration = prev_end - prev_start
    target_duration = current_duration + gap
    old_speed = float(prev.get("speed", 1.0))
    new_speed = round(old_speed * (current_duration / target_duration), 2)
    return {
        "clip": prev["asset"],
        "field": "speed",
        "old": old_speed,
        "new": new_speed,
    }


def apply_fix(clip: dict, fix: dict):
    """Apply a fix to a clip dict in-place."""
    if fix.get("error"):
        return
    if fix["field"] == "to":
        clip["to"] = fix["new"]
    elif fix["field"] == "speed":
        clip["speed"] = fix["new"]
    elif fix["field"] == "from+at":
        clip["from"] = fix["new_from"]
        clip["at"] = fix["new_at"]


# ── main ─────────────────────────────────────────────────────────────────────


def add_arguments(parser: argparse.ArgumentParser):
    parser.add_argument("--clip", required=True, help="Asset ID of clip to move")
    parser.add_argument("--at", type=float, default=None, help="Target timeline position (seconds)")
    parser.add_argument("--track", default=None, help="Target track ID (for example: V2, V3, A1)")
    parser.add_argument("--at-word", default=None, help="Word/phrase in audio transcript to align to")
    parser.add_argument("--at-word-index", type=int, default=0,
                        help="Which occurrence if phrase appears multiple times (default: 0)")
    parser.add_argument("--overlap", choices=["trim", "speed"], default=None,
                        help="Conflict resolution: trim adjacent clip or speed it up")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without saving")


def run(args: argparse.Namespace):
    if not TIMELINE_JSON.exists():
        print(f"No timeline found at {TIMELINE_JSON}.")
        sys.exit(1)

    timeline = load_timeline(TIMELINE_JSON)
    clips = timeline.get("clips", [])
    registry = load_asset_registry()

    # 1. Find the clip
    target = None
    for clip in clips:
        if clip.get("asset") == args.clip:
            target = clip
            break

    if target is None:
        print(f"ERROR: Clip '{args.clip}' not found in timeline.")
        sys.exit(1)

    # 2. Resolve position
    if args.at is not None and args.at_word is not None:
        print("ERROR: Specify --at or --at-word, not both.")
        sys.exit(1)
    if args.at is None and args.at_word is None:
        print("ERROR: Specify --at or --at-word.")
        sys.exit(1)

    if args.at_word:
        new_at = resolve_at_word(timeline, args.at_word, args.at_word_index)
    else:
        new_at = args.at

    if args.track:
        target["track"] = args.track
    elif not target.get("track"):
        asset_type = str(get_asset_entry(target["asset"], registry=registry).get("type", "video"))
        target["track"] = "A1" if asset_type == "audio" else "V2"

    track = target.get("track", "V2")
    old_at = float(target["at"])

    print(f"PLACE: Moving '{args.clip}' on {track} track\n")

    # 3. Move the clip
    target["at"] = new_at
    _, new_end = clip_span(target)
    print(f"  {args.clip}: at {old_at} → {new_at}  (span: {new_at}s–{new_end:.2f}s)")

    # 4. Detect conflicts
    conflicts = find_conflicts(clips, target)

    if not conflicts:
        print("\n  ✓ No conflicts detected. Timeline is clean.")
        if not args.dry_run:
            save_timeline(timeline, TIMELINE_JSON)
            print(f"\nSaved to {TIMELINE_JSON}")
        else:
            print("\n(dry-run — no changes written)")
        return

    # 5. Display / resolve conflicts
    print()
    for conflict in conflicts:
        prev = conflict["prev"]
        nxt = conflict["next"]

        if conflict["overlap"] > 0:
            prev_start, prev_end = clip_span(prev)
            nxt_start = float(nxt["at"])
            print(f"  ⚠ OVERLAP: '{prev['asset']}' (ends {prev_end:.2f}s) overlaps '{nxt['asset']}' (starts {nxt_start:.2f}s) by {conflict['overlap']:.2f}s")

            if args.overlap is None:
                trim_fix = compute_trim_fix(conflict)
                speed_fix = compute_speed_fix(conflict)
                print(f"    → --overlap trim:  shorten '{trim_fix['clip']}' by trimming source (from {trim_fix['old']:.2f}s to {trim_fix['new']:.2f}s)")
                if speed_fix.get("error"):
                    print(f"    → --overlap speed: {speed_fix['clip']}: {speed_fix['error']}")
                else:
                    print(f"    → --overlap speed: speed up '{speed_fix['clip']}' (from {speed_fix['old']:.2f}x to {speed_fix['new']:.2f}x)")

        elif conflict["gap"] > 0:
            prev_start, prev_end = clip_span(prev)
            nxt_start = float(nxt["at"])
            print(f"  ⚠ GAP: '{prev['asset']}' ends at {prev_end:.2f}s, '{nxt['asset']}' starts at {nxt_start:.2f}s — {conflict['gap']:.2f}s apart")

            if args.overlap is None:
                trim_fix = compute_trim_fix(conflict)
                speed_fix = compute_speed_fix(conflict)
                if trim_fix["field"] == "from+at":
                    print(f"    → --overlap trim:  advance '{trim_fix['clip']}' earlier (from {trim_fix['old_at']:.2f}s to {trim_fix['new_at']:.2f}s)")
                else:
                    print(f"    → --overlap trim:  shorten '{trim_fix['clip']}' by trimming source")
                print(f"    → --overlap speed: slow down '{speed_fix['clip']}' (from {speed_fix['old']:.2f}x to {speed_fix['new']:.2f}x)")

    # 6. Apply fixes if --overlap is set
    if args.overlap:
        print()
        for conflict in conflicts:
            if args.overlap == "trim":
                fix = compute_trim_fix(conflict)
            else:
                fix = compute_speed_fix(conflict)

            if fix.get("error"):
                print(f"  SKIPPED {fix['clip']}: {fix['error']}")
                continue

            # Find the actual clip in the list and apply
            for clip in clips:
                if clip.get("asset") == fix["clip"]:
                    apply_fix(clip, fix)
                    if fix["field"] == "from+at":
                        print(f"  Applied: {fix['clip']}.from: {fix['old_from']} → {fix['new_from']}, "
                              f".at: {fix['old_at']} → {fix['new_at']}")
                    else:
                        print(f"  Applied: {fix['clip']}.{fix['field']}: {fix['old']} → {fix['new']}")
                    break

        print(f"\n✓ All conflicts resolved. Timeline is clean.")
        if not args.dry_run:
            save_timeline(timeline, TIMELINE_JSON)
            print(f"Saved to {TIMELINE_JSON}")
        else:
            print("(dry-run — no changes written)")
    else:
        # Revert the move since we're just reporting
        target["at"] = old_at
        print(f"\n⚠ CONFLICTS DETECTED — move reverted (not saved).")
        print(f"Re-run with --overlap trim or --overlap speed to fix.")


def main():
    parser = argparse.ArgumentParser(
        description="Move a clip on timeline.json and resolve overlaps or gaps."
    )
    add_arguments(parser)
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
