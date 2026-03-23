#!/usr/bin/env python3
"""
Video editor agent tools — unified CLI.

Commands:
    python3 tools/cli.py ingest  <file> [<file2> ...]
    python3 tools/cli.py view    [--at S] [--summary]
    python3 tools/cli.py search  <transcript|visual|all> <query>
    python3 tools/cli.py render  [--preview] [--dry-run] [--output FILE]
    python3 tools/cli.py tts     --audio FILE --start S --end E --original TEXT --target TEXT --out FILE
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from ingest import add_arguments as ingest_args, run as ingest_run
from view import add_arguments as view_args, run as view_run
from search import add_arguments as search_args, run as search_run
from render import add_arguments as render_args, run as render_run
from tts import add_arguments as tts_args, run as tts_run
from place import add_arguments as place_args, run as place_run


def main():
    parser = argparse.ArgumentParser(
        prog="cli.py",
        description="Video editor agent tools — unified CLI.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    p = subparsers.add_parser("ingest", help="Ingest asset, produce profile")
    ingest_args(p)
    p.set_defaults(func=ingest_run)

    p = subparsers.add_parser("view", help="Show timeline view")
    view_args(p)
    p.set_defaults(func=view_run)

    p = subparsers.add_parser("search", help="Search across asset profiles")
    search_args(p)
    p.set_defaults(func=search_run)

    p = subparsers.add_parser("render", help="Compile timeline to ffmpeg and render")
    render_args(p)
    p.set_defaults(func=render_run)

    p = subparsers.add_parser("tts", help="Edit audio via Resemble AI")
    tts_args(p)
    p.set_defaults(func=tts_run)

    p = subparsers.add_parser("place", help="Move clip and resolve conflicts")
    place_args(p)
    p.set_defaults(func=place_run)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
