"""Name a game's opening from its moves, the way Lichess does.

The TSVs in openings/ are Lichess's own opening table (CC0, from
https://github.com/lichess-org/chess-openings). Lichess names a game after the
deepest position in its opening that appears in that table, matched by
position rather than by move order, so transpositions get the right name.
"""

import csv
from functools import cache
from pathlib import Path

import chess

TABLE_DIR = Path(__file__).parent / "openings"


def position_key(board: chess.Board) -> str:
    # EPD = the position without the move counters, so transpositions match.
    return board.epd()


@cache
def table() -> tuple[dict[str, str], int]:
    """Position -> opening name, plus the longest line in plies."""
    names: dict[str, str] = {}
    max_plies = 0
    for path in sorted(TABLE_DIR.glob("*.tsv")):
        with path.open(newline="") as f:
            for row in csv.DictReader(f, delimiter="\t"):
                board = chess.Board()
                plies = 0
                for token in row["pgn"].split():
                    if not token[0].isdigit():
                        board.push_san(token)
                        plies += 1
                names[position_key(board)] = row["name"]
                max_plies = max(max_plies, plies)
    return names, max_plies


def opening_name(moves: str) -> str | None:
    """Opening name for a space-separated SAN move string, or None."""
    names, max_plies = table()
    board = chess.Board()
    found = None
    for san in moves.split()[:max_plies]:
        try:
            board.push_san(san)
        except ValueError:
            break
        found = names.get(position_key(board), found)
    return found
