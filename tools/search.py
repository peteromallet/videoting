#!/usr/bin/env python3
"""
Search across asset profiles for transcript text, visual descriptions, or prompts.

Usage:
    python3 tools/search.py transcript "announcement"
    python3 tools/search.py visual "dashboard"
    python3 tools/search.py prompt "venn diagram"
    python3 tools/search.py all "login"
    python3 tools/search.py all "logo" --recent
"""

import argparse
import os
import re
import sys

from common import PROFILES_DIR, load_all_profiles


def search_transcript(query: str, profiles: list[dict]) -> list[dict]:
    """Find segments in transcripts matching the query (case-insensitive)."""
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    results = []

    for profile in profiles:
        transcript = profile.get("transcript", {})
        segments = transcript.get("segments", [])
        for seg in segments:
            if pattern.search(seg["text"]):
                results.append({
                    "asset": profile["id"],
                    "file": profile["file"],
                    "type": "transcript",
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"],
                })

    return results


def search_visual(query: str, profiles: list[dict]) -> list[dict]:
    """Find visual segments matching the query (case-insensitive)."""
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    results = []

    for profile in profiles:
        # Video visual segments
        for seg in profile.get("visual_segments", []):
            if pattern.search(seg["description"]):
                results.append({
                    "asset": profile["id"],
                    "file": profile["file"],
                    "type": "visual",
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["description"],
                })
        # Image description
        if profile.get("type") == "image":
            desc = profile.get("description", "")
            if pattern.search(desc):
                results.append({
                    "asset": profile["id"],
                    "file": profile["file"],
                    "type": "image_description",
                    "start": 0.0,
                    "end": None,
                    "text": desc,
                })

    return results


def search_prompt(query: str, profiles: list[dict]) -> list[dict]:
    """Find assets whose generation_prompt matches the query (case-insensitive)."""
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    results = []

    for profile in profiles:
        prompt = profile.get("generation_prompt", "")
        if prompt and pattern.search(prompt):
            mode = profile.get("generation_mode", "generate")
            results.append({
                "asset": profile["id"],
                "file": profile["file"],
                "type": f"prompt ({mode})",
                "start": 0.0,
                "end": None,
                "text": prompt,
            })

    return results


def format_results(results: list[dict], query: str) -> str:
    if not results:
        return f"No results for \"{query}\""

    lines = [f"Results for \"{query}\"  ({len(results)} match{'es' if len(results) != 1 else ''})\n"]
    for r in results:
        end_str = f"{r['end']:.2f}s" if r["end"] is not None else "—"
        lines.append(f"  [{r['type']}]  {r['asset']}  @  {r['start']:.2f}s – {end_str}")
        lines.append(f"    \"{r['text']}\"")
        lines.append("")

    return "\n".join(lines)


# ── standard interface ───────────────────────────────────────────────────────


def add_arguments(parser: argparse.ArgumentParser):
    parser.add_argument("mode", choices=["transcript", "visual", "prompt", "all"],
                        help="What to search: transcript, visual, prompt, or all")
    parser.add_argument("query", nargs="+", help="Search query")
    parser.add_argument("--recent", action="store_true",
                        help="Sort results by most recently created file first")


def run(args: argparse.Namespace):
    query = " ".join(args.query)

    if not PROFILES_DIR.exists() or not list(PROFILES_DIR.glob("*.yaml")):
        print("No asset profiles found. Run: python3 tools/ingest.py <file>")
        sys.exit(1)

    profiles = load_all_profiles()

    if args.recent:
        # Sort profiles by file modification time (newest first)
        def _mtime(p: dict) -> float:
            try:
                return os.path.getmtime(PROFILES_DIR / (p["file"].split("/")[-1] + ".yaml"))
            except OSError:
                return 0.0
        profiles = sorted(profiles, key=_mtime, reverse=True)

    results = []

    if args.mode in ("transcript", "all"):
        results += search_transcript(query, profiles)
    if args.mode in ("visual", "all"):
        results += search_visual(query, profiles)
    if args.mode in ("prompt", "all"):
        results += search_prompt(query, profiles)

    print(format_results(results, query))


def main():
    parser = argparse.ArgumentParser(
        description="Search across asset profiles for transcript text or visual descriptions."
    )
    add_arguments(parser)
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()
