#!/usr/bin/env python3
"""
Generate a human/agent-readable view of the current timeline.

Usage:
    python3 tools/view.py                    # full view (all keyframe descriptions)
    python3 tools/view.py --summary          # compact view with API-summarised visuals
    python3 tools/view.py --at 10.5         # snapshot at a specific timestamp
"""

import argparse
import sys
from pathlib import Path

from common import (
    ASSET_REGISTRY,
    TIMELINE_JSON,
    get_openai_client,
    get_profile_path,
    load_asset_registry,
    load_profile,
    load_timeline,
    resolve_asset_path,
    save_yaml,
)


# ── visual summarisation ──────────────────────────────────────────────────────

def _call_llm_summary(descriptions: list[str]) -> str:
    client = get_openai_client()
    if not client:
        return descriptions[0] if descriptions else "(no description)"
    bullets = "\n".join(f"- {d}" for d in descriptions)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=80,
        messages=[{"role": "user", "content":
            "Summarise what's shown in this video clip in one concise sentence. "
            "Focus on the main on-screen content (UI, action, subject). No fluff.\n\n"
            f"Frame descriptions:\n{bullets}"
        }],
    )
    return response.choices[0].message.content.strip()


def get_visual_summary(asset_id: str, src_s: float, src_e: float) -> str:
    """
    Return a one-sentence visual summary for a source range. Priority:
      1. Range-specific cache: visual_summaries["{src_s:.2f}-{src_e:.2f}"] in profile
      2. Whole-asset summary:  visual_summary in profile (written by ingest)
      3. Generate via API for this range, then cache it
    """
    profile = load_profile(asset_id)
    if not profile:
        return "(no profile)"

    # 1. Range-specific cache
    cache_key = f"{src_s:.2f}-{src_e:.2f}"
    cached = profile.get("visual_summaries", {}).get(cache_key)
    if cached:
        return cached

    # 2. Whole-asset summary from ingest
    if profile.get("visual_summary"):
        return profile["visual_summary"]

    # 3. Generate for this range and cache
    segs = visual_in_range(profile, src_s, src_e)
    if not segs:
        return "(no visual description)"

    print(f"  [summarising {asset_id} {src_s:.1f}s–{src_e:.1f}s via API…]", file=sys.stderr)
    summary = _call_llm_summary([s["description"] for s in segs])

    if "visual_summaries" not in profile:
        profile["visual_summaries"] = {}
    profile["visual_summaries"][cache_key] = summary
    path = get_profile_path(asset_id)
    if path:
        save_yaml(profile, path)

    return summary


# ── time formatting ───────────────────────────────────────────────────────────

def fmt_t(seconds: float) -> str:
    m = int(seconds) // 60
    s = seconds - m * 60
    return f"{m:02d}:{s:06.3f}"


# ── transcript helpers ────────────────────────────────────────────────────────

def transcript_in_range(profile: dict, start: float, end: float) -> str:
    """Return the words spoken between start and end seconds in the asset."""
    transcript = profile.get("transcript", {})
    words = transcript.get("words", [])
    if not words:
        segments = transcript.get("segments", [])
        parts = []
        for seg in segments:
            if seg["end"] <= start or seg["start"] >= end:
                continue
            parts.append(seg["text"])
        return " ".join(parts).strip()

    clipped = [w["word"] for w in words if w["start"] >= start and w["end"] <= end]
    return " ".join(clipped).strip()


def sentence_boundary_check(profile: dict, clip_start: float, clip_end: float) -> dict:
    transcript = profile.get("transcript", {})
    segments = transcript.get("segments", [])
    silence = profile.get("silence_regions", [])

    def in_silence(t: float) -> bool:
        return any(r["start"] <= t <= r["end"] for r in silence)

    def at_sentence_start(t: float) -> bool:
        return any(abs(seg["start"] - t) < 0.15 for seg in segments)

    def at_sentence_end(t: float) -> bool:
        return any(abs(seg["end"] - t) < 0.15 for seg in segments)

    def surrounding_sentence(t: float) -> str | None:
        for seg in segments:
            if seg["start"] <= t <= seg["end"]:
                return seg["text"]
        return None

    return {
        "start_clean":    in_silence(clip_start) or at_sentence_start(clip_start),
        "end_clean":      in_silence(clip_end)   or at_sentence_end(clip_end),
        "start_sentence": surrounding_sentence(clip_start),
        "end_sentence":   surrounding_sentence(clip_end),
    }


# ── visual helpers ────────────────────────────────────────────────────────────

def preroll_silence(profile: dict, src_s: float, src_e: float) -> dict | None:
    """Return info about silence before the first word in this source range, if any."""
    words = profile.get("transcript", {}).get("words", [])
    in_range = [w for w in words if w["start"] >= src_s and w["start"] < src_e]
    if not in_range:
        return None
    first = in_range[0]
    gap = round(first["start"] - src_s, 3)
    if gap > 0.05:
        return {"gap": gap, "word": first["word"], "src_at": first["start"]}
    return None


def visual_in_range(profile: dict, start: float, end: float) -> list[dict]:
    return [s for s in profile.get("visual_segments", [])
            if not (s["end"] <= start or s["start"] >= end)]


# ── timeline computation ──────────────────────────────────────────────────────

def compute_timeline_positions(timeline: dict) -> tuple[list[dict], list[dict]]:
    """
    Returns (video_clips, audio_clips), each clip enriched with:
      timeline_start, timeline_end, source_start, source_end
    """
    video_clips: list[dict] = []
    audio_clips: list[dict] = []

    for clip in timeline.get("clips", []):
        c = dict(clip)
        at = float(c["at"])
        src_start = float(c.get("from", 0.0))
        if "hold" in c:
            src_end = src_start + float(c["hold"])
            c["to"] = src_end
        else:
            src_end = float(c.get("to", src_start))
        src_dur = src_end - src_start
        speed = float(c.get("speed", 1.0))
        tl_dur = src_dur / speed

        c["timeline_start"] = round(at, 3)
        c["timeline_end"]   = round(at + tl_dur, 3)
        c["source_start"]   = src_start
        c["source_end"]     = src_end
        c["speed"]          = speed

        if c.get("track") == "audio":
            audio_clips.append(c)
        else:
            video_clips.append(c)

    return (
        sorted(video_clips, key=lambda c: c["timeline_start"]),
        sorted(audio_clips, key=lambda c: c["timeline_start"]),
    )


# ── issues detection ──────────────────────────────────────────────────────────

def find_issues(video_clips: list[dict], audio_clips: list[dict]) -> list[str]:
    issues = []

    video_end = max((c["timeline_end"] for c in video_clips), default=0.0)
    audio_end = max((c["timeline_end"] for c in audio_clips), default=0.0)

    if abs(video_end - audio_end) > 0.5:
        longer  = "audio" if audio_end > video_end else "video"
        shorter = "video" if audio_end > video_end else "audio"
        issues.append(
            f"{longer} track is {abs(audio_end - video_end):.1f}s longer than {shorter} "
            f"({audio_end:.1f}s audio vs {video_end:.1f}s video)"
        )

    # Gaps in video track
    for i in range(1, len(video_clips)):
        gap = video_clips[i]["timeline_start"] - video_clips[i - 1]["timeline_end"]
        if gap > 0.05:
            issues.append(
                f"Video gap of {gap:.2f}s: {fmt_t(video_clips[i-1]['timeline_end'])} → "
                f"{fmt_t(video_clips[i]['timeline_start'])} "
                f"(black screen — assign a clip)"
            )

    # Cut quality
    for clip in video_clips:
        profile = load_profile(clip["asset"])
        if not profile or "transcript" not in profile:
            continue
        check = sentence_boundary_check(profile, clip["source_start"], clip["source_end"])
        if not check["start_clean"]:
            issues.append(
                f"Clip '{clip['asset']}' starts mid-sentence at src {clip['source_start']:.1f}s"
            )
        if not check["end_clean"]:
            issues.append(
                f"Clip '{clip['asset']}' ends mid-sentence at src {clip['source_end']:.1f}s"
            )

    return issues


# ── main view rendering ───────────────────────────────────────────────────────

def render_view(timeline: dict, at: float | None = None, summary: bool = False) -> str:
    video_clips, audio_clips = compute_timeline_positions(timeline)

    if not video_clips and not audio_clips:
        return "Timeline is empty."

    total_duration = max(
        (c["timeline_end"] for c in video_clips + audio_clips), default=0.0
    )
    out_cfg = timeline.get("output", {})
    resolution = out_cfg.get("resolution", "?")
    fps = out_cfg.get("fps", "?")

    lines = []
    lines.append("═" * 70)
    lines.append(f"VIDEO TIMELINE VIEW  |  Total: {total_duration:.2f}s  |  {resolution} @ {fps}fps")
    lines.append("═" * 70)

    if at is not None:
        lines.append(f"\nSNAPSHOT @ {fmt_t(at)} ({at:.3f}s)")
        lines.append("─" * 70)

        active_v = [c for c in video_clips if c["timeline_start"] <= at < c["timeline_end"]]
        active_a = [c for c in audio_clips if c["timeline_start"] <= at < c["timeline_end"]]

        if active_v:
            for clip in active_v:
                src_t = clip["source_start"] + (at - clip["timeline_start"])
                profile = load_profile(clip["asset"])
                lines.append(f"  VIDEO  {clip['asset']}  src:{src_t:.2f}s")
                if profile:
                    for seg in visual_in_range(profile, src_t - 0.1, src_t + 0.1):
                        lines.append(f"    Visual: \"{seg['description']}\"")
        else:
            lines.append("  VIDEO: (black)")

        if active_a:
            for clip in active_a:
                src_t = clip["source_start"] + (at - clip["timeline_start"])
                profile = load_profile(clip["asset"])
                vol_str = f"  vol:{clip.get('volume', 1.0)}" if float(clip.get("volume", 1.0)) != 1.0 else ""
                lines.append(f"  AUDIO  {clip['asset']}  src:{src_t:.2f}s{vol_str}")
                if profile:
                    word_range = transcript_in_range(profile, max(0, src_t - 2), src_t + 2)
                    if word_range:
                        lines.append(f"    Speaking: \"{word_range}\"")
        else:
            lines.append("  AUDIO: (silence)")

        return "\n".join(lines)

    # Full view: walk through time segments defined by clip boundaries
    boundaries: set[float] = set()
    for c in video_clips + audio_clips:
        boundaries.add(c["timeline_start"])
        boundaries.add(c["timeline_end"])
    sorted_boundaries = sorted(boundaries)

    for i in range(len(sorted_boundaries) - 1):
        seg_start = sorted_boundaries[i]
        seg_end   = sorted_boundaries[i + 1]
        mid       = (seg_start + seg_end) / 2

        def _clip_sort_key(c):
            return (c["timeline_start"], -(c["timeline_end"] - c["timeline_start"]))

        active_v = sorted([c for c in video_clips if c["timeline_start"] <= mid < c["timeline_end"]], key=_clip_sort_key)
        active_a = sorted([c for c in audio_clips if c["timeline_start"] <= mid < c["timeline_end"]], key=_clip_sort_key)

        if not active_v and not active_a:
            continue

        dur = seg_end - seg_start
        lines.append(f"\n[{fmt_t(seg_start)} → {fmt_t(seg_end)}]  ({dur:.2f}s)")

        # Video clips
        for clip in active_v:
            src_s = clip["source_start"] + (seg_start - clip["timeline_start"])
            src_e = clip["source_start"] + (seg_end   - clip["timeline_start"])
            profile = load_profile(clip["asset"])

            speed_str = f"  [{clip['speed']:.2f}x]" if clip.get("speed", 1.0) != 1.0 else ""
            lines.append(f"  VIDEO  {clip['asset']}  [src: {src_s:.2f}s → {src_e:.2f}s]{speed_str}")

            if profile:
                if summary:
                    vis = get_visual_summary(clip["asset"], src_s, src_e)
                    lines.append(f"    \"{vis}\"")
                else:
                    for seg in visual_in_range(profile, src_s, src_e):
                        rel_t = seg["start"] - clip["source_start"] + clip["timeline_start"]
                        lines.append(f"    {fmt_t(rel_t)}  \"{seg['description']}\"")

                if profile.get("type") in ("video+audio",):
                    spoken = transcript_in_range(profile, src_s, src_e)
                    if spoken:
                        lines.append(f"    (embedded audio) \"{_wrap(spoken, 60)}\"")

        # Audio clips
        for clip in active_a:
            src_s = clip["source_start"] + (seg_start - clip["timeline_start"])
            src_e = clip["source_start"] + (seg_end   - clip["timeline_start"])
            profile = load_profile(clip["asset"])
            vol_str = f"  vol:{clip.get('volume', 1.0)}" if float(clip.get("volume", 1.0)) != 1.0 else ""

            lines.append(f"  AUDIO  {clip['asset']}  [src: {src_s:.2f}s → {src_e:.2f}s]{vol_str}")

            if profile:
                # Pre-roll silence only worth flagging if gap is noticeable (>0.5s)
                pr = preroll_silence(profile, src_s, src_e)
                if pr and pr["gap"] >= 0.5:
                    lines.append(f"    ~ pre-roll silence: {pr['gap']:.2f}s  (first word '{pr['word']}' at src {pr['src_at']:.2f}s)")

                spoken = transcript_in_range(profile, src_s, src_e)
                if spoken:
                    lines.append(f"    \"{_wrap(spoken, 64)}\"")

                # Only show silence markers >1s and only when video is also present
                # (short pauses are natural; silence without video isn't a cut decision)
                if active_v:
                    for r in profile.get("silence_regions", []):
                        dur_r = r["end"] - r["start"]
                        if dur_r >= 1.0 and r["start"] >= src_s and r["end"] <= src_e:
                            tl_s = clip["timeline_start"] + (r["start"] - clip["source_start"])
                            tl_e = clip["timeline_start"] + (r["end"]   - clip["source_start"])
                            lines.append(f"    ~ silence {fmt_t(tl_s)} → {fmt_t(tl_e)}"
                                         f"  ({dur_r:.2f}s)")

        lines.append("─" * 70)

    # Issues summary
    issues = find_issues(video_clips, audio_clips)
    lines.append("")
    if issues:
        lines.append("ISSUES:")
        for iss in issues:
            lines.append(f"  ⚠  {iss}")
    else:
        lines.append("ISSUES:  none")
    lines.append("═" * 70)

    return "\n".join(lines)


def _wrap(text: str, width: int) -> str:
    words = text.split()
    lines, current, length = [], [], 0
    for w in words:
        if length + len(w) + 1 > width and current:
            lines.append(" ".join(current))
            current, length = [], 0
        current.append(w)
        length += len(w) + 1
    if current:
        lines.append(" ".join(current))
    return "\n             ".join(lines)


# ── standard interface ───────────────────────────────────────────────────────


def add_arguments(parser: argparse.ArgumentParser):
    parser.add_argument("--at", type=float, default=None,
                        help="Show snapshot at this timestamp (seconds)")
    parser.add_argument("--summary", "-s", action="store_true",
                        help="Compact view: one summarised visual per clip (cached via API)")
    parser.add_argument("--timeline", default=str(TIMELINE_JSON),
                        help="Path to timeline.json")
    parser.add_argument("--asset-registry", default=str(ASSET_REGISTRY),
                        help="Path to asset-registry.json")


def run(args: argparse.Namespace):
    tl_path = Path(args.timeline)
    if not tl_path.exists():
        print(f"No timeline found at {tl_path}. Run tools/migrate_yaml_to_json.py first.")
        sys.exit(1)

    registry_path = Path(args.asset_registry)
    if not registry_path.exists():
        print(f"No asset registry found at {registry_path}. Run tools/migrate_yaml_to_json.py first.")
        sys.exit(1)

    timeline = load_timeline(tl_path)
    registry = load_asset_registry(registry_path)

    for clip in timeline.get("clips", []):
        resolve_asset_path(clip["asset"], registry=registry)

    background = timeline.get("output", {}).get("background")
    if background:
        resolve_asset_path(background, registry=registry)

    print(render_view(timeline, at=args.at, summary=args.summary))


def main():
    parser = argparse.ArgumentParser(
        description="Generate a human/agent-readable view of the current timeline."
    )
    add_arguments(parser)
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
