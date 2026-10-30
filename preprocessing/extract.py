"""Stream a Lichess .pgn.zst dump and write one row per game to Parquet.

The raw dump is ~30 GB compressed, so we never decompress it to disk: games are
parsed on the fly and only the fields we need are kept. Moves are stored as a
space-separated SAN string (clock/eval comments stripped).

Sampling lives in `keep_game()` -- swap in whatever strategy the group agrees on
(stratified by Elo, by time control, ...).

Usage:
    uv run extract.py ../dataset/lichess_db_standard_rated_2026-09.pgn.zst \
        --out ../data/interim/games.parquet --limit 200000
"""

import argparse
import io
import re
import sys
import time
from pathlib import Path

import polars as pl
import pyarrow.parquet as pq
import zstandard

HEADER_RE = re.compile(r'^\[(\w+) "(.*)"\]$')
COMMENT_RE = re.compile(r"\{[^}]*\}")
MOVE_NUMBER_RE = re.compile(r"\d+\.(?:\.\.)?")
RESULTS = {"1-0", "0-1", "1/2-1/2", "*"}

SCHEMA = {
    "game_id": pl.String,
    "time_class": pl.String,  # bullet / blitz / rapid / classical / correspondence
    "utc_date": pl.String,
    "utc_time": pl.String,
    "white_elo": pl.Int16,
    "black_elo": pl.Int16,
    "result": pl.String,  # "1-0", "0-1", "1/2-1/2"
    "eco": pl.String,
    "opening": pl.String,
    "time_control": pl.String,
    "termination": pl.String,
    "has_eval": pl.Boolean,
    "num_plies": pl.Int16,
    "moves": pl.String,  # SAN, space-separated, e.g. "e4 c5 Nf3 d6"
}


def keep_game(index: int, headers: dict[str, str], args: argparse.Namespace) -> bool:
    """Sampling hook. Default: keep every `args.every`-th game."""
    return index % args.every == 0


def time_class(time_control: str) -> str:
    """Lichess's own rule: estimated duration = base + 40 * increment (seconds)."""
    if time_control == "-":
        return "correspondence"
    base, _, inc = time_control.partition("+")
    estimate = int(base) + 40 * int(inc or 0)
    if estimate < 29:
        return "ultrabullet"
    if estimate < 179:
        return "bullet"
    if estimate < 479:
        return "blitz"
    if estimate < 1499:
        return "rapid"
    return "classical"


def parse_moves(movetext: str) -> list[str]:
    text = COMMENT_RE.sub(" ", movetext)
    text = MOVE_NUMBER_RE.sub(" ", text)
    # Lichess appends ?, ?!, !? ... to moves in games with computer analysis.
    return [tok.rstrip("?!") for tok in text.split() if tok not in RESULTS]


def to_row(headers: dict[str, str], movetext: str) -> dict | None:
    try:
        white_elo = int(headers["WhiteElo"])
        black_elo = int(headers["BlackElo"])
    except (KeyError, ValueError):
        return None  # unrated / "?" ratings
    if headers.get("Result") not in ("1-0", "0-1", "1/2-1/2"):
        return None

    moves = parse_moves(movetext)
    return {
        "game_id": headers.get("Site", "").rsplit("/", 1)[-1],
        "time_class": time_class(headers.get("TimeControl", "-")),
        "utc_date": headers.get("UTCDate"),
        "utc_time": headers.get("UTCTime"),
        "white_elo": white_elo,
        "black_elo": black_elo,
        "result": headers["Result"],
        "eco": headers.get("ECO"),
        "opening": headers.get("Opening"),
        "time_control": headers.get("TimeControl"),
        "termination": headers.get("Termination"),
        "has_eval": "[%eval" in movetext,
        "num_plies": len(moves),
        "moves": " ".join(moves),
    }


def iter_games(path: Path):
    """Yield (headers, movetext) for each game in the dump."""
    with path.open("rb") as fh:
        reader = zstandard.ZstdDecompressor().stream_reader(fh, read_size=1 << 20)
        text = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
        headers: dict[str, str] = {}
        for line in text:
            line = line.rstrip("\n")
            if not line:
                continue
            if line.startswith("["):
                m = HEADER_RE.match(line)
                if m:
                    headers[m.group(1)] = m.group(2)
            else:
                # Lichess puts the whole movetext on a single line.
                yield headers, line
                headers = {}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pgn", type=Path, help="path to lichess_db_*.pgn.zst")
    ap.add_argument("--out", type=Path, default=Path("../data/interim/games.parquet"))
    ap.add_argument("--limit", type=int, default=None, help="stop after keeping this many games")
    ap.add_argument("--every", type=int, default=1, help="keep every N-th game (systematic sample)")
    ap.add_argument("--chunk", type=int, default=500_000, help="rows per Parquet row group")
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    writer = None
    buffer: list[dict] = []
    kept = 0
    start = time.time()

    def flush():
        nonlocal writer
        if not buffer:
            return
        df = pl.DataFrame(buffer, schema=SCHEMA)
        if writer is None:
            writer = pq.ParquetWriter(args.out, df.to_arrow().schema, compression="zstd")
        writer.write_table(df.to_arrow())
        buffer.clear()

    try:
        for i, (headers, movetext) in enumerate(iter_games(args.pgn)):
            if not keep_game(i, headers, args):
                continue
            row = to_row(headers, movetext)
            if row is None:
                continue
            buffer.append(row)
            kept += 1
            if len(buffer) >= args.chunk:
                flush()
                rate = (i + 1) / (time.time() - start)
                print(f"read {i + 1:,} games, kept {kept:,} ({rate:,.0f} games/s)", file=sys.stderr)
            if args.limit and kept >= args.limit:
                break
    finally:
        flush()
        if writer is not None:
            writer.close()

    print(f"done: kept {kept:,} games -> {args.out} in {time.time() - start:.0f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
