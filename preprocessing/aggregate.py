"""Turn a games table into small JSON files for the web app.

Each output file feeds one (or more) tabs in web/src/tabs/. Keep them small --
they're committed to git and shipped to GitHub Pages as-is.

The input is either the Parquet written by extract.py or the group's sampled
CSV (Sampling_100k.zip at the repo root, or the unzipped .csv).

Usage:
    uv run aggregate.py ../Sampling_100k.zip --out ../web/public/data
    uv run aggregate.py ../data/interim/games.parquet --out ../web/public/data
"""

import argparse
import io
import json
import zipfile
from multiprocessing import Pool
from pathlib import Path

import polars as pl

from extract import time_class
from openings import opening_name

ELO_BIN = 200
TOP_OPENINGS = 40  # enough points for the openings scatterplot
GAP_BIN = 25  # rating gap (white - black) bin width
MAX_GAP = 400  # games with a wider gap are too rare per bin; dropped, not clipped
BOARD_OPENINGS = 10  # openings that can be picked on the board heatmap and in game endings
MOVES_BIN = 5  # game length bin width, in full moves
MAX_MOVES = 100  # longer games go in the last bin, labeled "100+" in the app


def read_sample_csv(path: Path) -> pl.DataFrame:
    """Read the sampled CSV (optionally zipped) and rename it to extract.py's schema.

    The CSV has no Opening header, so the opening is named from the moves.
    """
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as zf:
            (name,) = [n for n in zf.namelist() if n.endswith(".csv")]
            raw = pl.read_csv(io.BytesIO(zf.read(name)))
    else:
        raw = pl.read_csv(path)

    with Pool() as pool:
        openings = pool.map(opening_name, raw["Moves"], chunksize=1000)

    return raw.select(
        game_id=pl.col("GameID"),
        time_class=pl.col("TimeControl").map_elements(time_class, return_dtype=pl.String),
        utc_date=pl.col("UTCDate"),
        white_elo=pl.col("WhiteElo").cast(pl.Int16),
        black_elo=pl.col("BlackElo").cast(pl.Int16),
        result=pl.col("Result"),
        eco=pl.col("ECO"),
        opening=pl.Series(openings, dtype=pl.String),
        time_control=pl.col("TimeControl"),
        termination=pl.col("Termination"),
        num_plies=pl.col("Moves").str.count_matches(r"\S+").cast(pl.Int16),
        moves=pl.col("Moves"),
    )


def load_games(path: Path) -> pl.LazyFrame:
    if path.suffix == ".parquet":
        return pl.scan_parquet(path)
    return read_sample_csv(path).lazy()


def with_common_columns(games: pl.LazyFrame) -> pl.LazyFrame:
    avg_elo = (pl.col("white_elo").cast(pl.Int32) + pl.col("black_elo")) // 2
    return games.with_columns(
        elo_bracket=(avg_elo // ELO_BIN * ELO_BIN).clip(600, 2800),
        # "Sicilian Defense: Najdorf Variation, English Attack" -> "Sicilian Defense"
        opening_family=pl.col("opening").str.split(":").list.first().str.strip_chars(),
        white_win=pl.col("result") == "1-0",
        draw=pl.col("result") == "1/2-1/2",
        black_win=pl.col("result") == "0-1",
    )


def result_counts() -> list[pl.Expr]:
    return [
        pl.len().alias("games"),
        pl.col("white_win").sum().alias("white"),
        pl.col("draw").sum().alias("draw"),
        pl.col("black_win").sum().alias("black"),
    ]


def results_by_elo(games: pl.LazyFrame) -> pl.DataFrame:
    return (
        games.group_by("elo_bracket", "time_class")
        .agg(result_counts())
        .sort("elo_bracket", "time_class")
        .collect()
    )


def openings_by_elo(games: pl.LazyFrame) -> pl.DataFrame:
    return (
        games.join(top_openings(games, TOP_OPENINGS), on="opening_family")
        .group_by("opening_family", "elo_bracket")
        .agg(result_counts())
        .sort("opening_family", "elo_bracket")
        .collect()
    )


def rating_gap(games: pl.LazyFrame) -> pl.DataFrame:
    """Results by rating gap, to compare against the score the Elo formula predicts."""
    gap = pl.col("white_elo").cast(pl.Int32) - pl.col("black_elo")
    return (
        games.filter(gap.abs() < MAX_GAP + GAP_BIN // 2)
        # Bins centered on multiples of GAP_BIN, so a gap of 0 is its own bin.
        .with_columns(gap=((gap + GAP_BIN // 2) // GAP_BIN * GAP_BIN))
        .group_by("gap", "elo_bracket")
        .agg(result_counts())
        .sort("gap", "elo_bracket")
        .collect()
    )


def game_endings(games: pl.LazyFrame) -> pl.DataFrame:
    """How games end, by game length, Elo bracket and opening.

    Openings outside the top BOARD_OPENINGS are pooled, so each view's totals stay complete.

    The dump's "Normal" termination covers mates, resignations and draws, so they are
    told apart here: a decisive game that doesn't end on "#" was resigned.
    """
    full_moves = (pl.col("num_plies") + 1) // 2
    top = top_openings(games, BOARD_OPENINGS).collect()["opening_family"].to_list()
    return (
        # Dropped: the full dump's few aborted or rule-breaking games ("Abandoned", ...).
        games.filter(pl.col("termination").is_in(["Normal", "Time forfeit", "Insufficient material"]))
        .with_columns(
            moves_bin=(full_moves // MOVES_BIN * MOVES_BIN).clip(0, MAX_MOVES),
            opening=pl.when(pl.col("opening_family").is_in(top))
            .then(pl.col("opening_family"))
            .otherwise(pl.lit("Other openings")),
            # Lichess's "Insufficient material" termination is a flag fall against a
            # side that can't mate (scored a draw), so it's a time forfeit too.
            ending=pl.when(pl.col("termination") != "Normal")
            .then(pl.lit("Time forfeit"))
            .when(pl.col("draw"))
            .then(pl.lit("Draw"))
            .when(pl.col("moves").str.strip_chars().str.ends_with("#"))
            .then(pl.lit("Checkmate"))
            .otherwise(pl.lit("Resignation")),
        )
        .group_by("elo_bracket", "opening", "moves_bin", "ending")
        .agg(games=pl.len())
        .rename({"moves_bin": "moves"})
        .sort("elo_bracket", "opening", "moves", "ending")
        .collect()
    )


SQUARES = [f"{f}{r}" for r in "12345678" for f in "abcdefgh"]  # a1, b1, ..., h8


def top_openings(games: pl.LazyFrame, n: int) -> pl.LazyFrame:
    return games.group_by("opening_family").len().sort("len", descending=True).head(n).select("opening_family")


def parsed_moves(games: pl.LazyFrame, *extra: str) -> pl.LazyFrame:
    """One row per move, parsed straight from SAN (no board replay needed).

    The destination is the last square in the token; castling is mapped to the king's
    target square. `extra` names game columns to carry along.
    """
    return (
        games.with_row_index("gid")
        .select("gid", "elo_bracket", *extra, san=pl.col("moves").str.split(" "))
        .explode("san")
        .filter(pl.col("san").is_not_null() & (pl.col("san") != ""))
        .with_columns(ply=pl.int_range(pl.len()).over("gid"))
        .with_columns(
            side=pl.when(pl.col("ply") % 2 == 0).then(pl.lit("white")).otherwise(pl.lit("black")),
            piece=pl.when(pl.col("san").str.starts_with("O-O"))
            .then(pl.lit("K"))
            .when(pl.col("san").str.slice(0, 1).is_in(["N", "B", "R", "Q", "K"]))
            .then(pl.col("san").str.slice(0, 1))
            .otherwise(pl.lit("P")),
            square=pl.col("san").str.extract(r"([a-h][1-8])(?:=[NBRQ])?[+#]?$", 1),
        )
        .with_columns(
            square=pl.when(pl.col("san").str.starts_with("O-O-O"))
            .then(pl.when(pl.col("side") == "white").then(pl.lit("c1")).otherwise(pl.lit("c8")))
            .when(pl.col("san").str.starts_with("O-O"))
            .then(pl.when(pl.col("side") == "white").then(pl.lit("g1")).otherwise(pl.lit("g8")))
            .otherwise(pl.col("square"))
        )
        .filter(pl.col("square").is_not_null())
    )


def square_rows(counts: pl.DataFrame, key: list[str]) -> pl.DataFrame:
    """Turn (key, square, count) rows into one row per key with a 64-long `counts` list.

    The list is in SQUARES order; one row per square would be ~10x larger.
    """
    squares = pl.DataFrame({"square": SQUARES, "idx": range(len(SQUARES))})
    return (
        counts.select(key).unique()
        .join(squares, how="cross")
        .join(counts, on=[*key, "square"], how="left")
        .sort("idx")
        .group_by(key, maintain_order=True)
        .agg(counts=pl.col("count").fill_null(0))
        .sort(key)
    )


def square_heatmap(games: pl.LazyFrame, by: str | None = None) -> pl.DataFrame:
    """Destination square of every move, split by side, piece and Elo bracket.

    With `by`, that column is one more key (e.g. opening_family, for games already
    narrowed to the top openings).
    """
    extra = [by] if by else []
    key = [*extra, "side", "piece", "elo_bracket"]
    counts = parsed_moves(games, *extra).group_by(*key, "square").agg(count=pl.len()).collect()
    return square_rows(counts, key)


def square_events(games: pl.LazyFrame) -> pl.DataFrame:
    """What happens on each square: captures, checks and checkmates.

    Same shape as square_heatmap, with `metric` as one more key. `side` and `piece` always
    describe the move: for a capture or check, `square` is where that piece landed. For a
    checkmate, `square` is where the mated king stood, which is the more telling place.
    A king only moves by a king move or castling, so its last such move (or its starting
    square) gives that without replaying the board.
    """
    key = ["metric", "side", "piece", "elo_bracket"]
    moves = parsed_moves(games).cache()
    captures = moves.filter(pl.col("san").str.contains("x", literal=True)).with_columns(metric=pl.lit("captures"))
    checks = moves.filter(pl.col("san").str.contains(r"[+#]$")).with_columns(metric=pl.lit("checks"))

    king_moves = (
        moves.filter(pl.col("piece") == "K")
        .group_by("gid", "side")
        .agg(king_square=pl.col("square").sort_by("ply").last())
    )
    mates = (
        moves.filter(pl.col("san").str.ends_with("#"))
        .with_columns(
            metric=pl.lit("mates"),
            mated_side=pl.when(pl.col("side") == "white").then(pl.lit("black")).otherwise(pl.lit("white")),
        )
        .join(king_moves, left_on=["gid", "mated_side"], right_on=["gid", "side"], how="left")
        .with_columns(
            square=pl.col("king_square").fill_null(
                pl.when(pl.col("mated_side") == "white").then(pl.lit("e1")).otherwise(pl.lit("e8"))
            )
        )
    )
    columns = [*key, "square"]
    counts = (
        pl.concat([captures.select(columns), checks.select(columns), mates.select(columns)])
        .group_by(columns)
        .agg(count=pl.len())
        .collect()
    )
    return square_rows(counts, key)


def write_json(df: pl.DataFrame, path: Path) -> None:
    path.write_text(json.dumps(df.to_dicts(), separators=(",", ":")))
    print(f"wrote {path} ({len(df):,} rows, {path.stat().st_size / 1024:.1f} KB)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("games", type=Path, help="Parquet from extract.py, or the sampled .csv/.zip")
    ap.add_argument("--out", type=Path, default=Path("../web/public/data"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    games = with_common_columns(load_games(args.games)).cache()
    write_json(results_by_elo(games), args.out / "results_by_elo.json")
    write_json(openings_by_elo(games), args.out / "openings_by_elo.json")
    write_json(square_heatmap(games), args.out / "square_heatmap.json")
    # The board for single openings, picked in the app; "All openings" uses the file above.
    write_json(
        square_heatmap(games.join(top_openings(games, BOARD_OPENINGS), on="opening_family"), by="opening_family"),
        args.out / "square_heatmap_openings.json",
    )
    write_json(square_events(games), args.out / "square_events.json")
    write_json(rating_gap(games), args.out / "rating_gap.json")
    write_json(game_endings(games), args.out / "game_endings.json")

    meta = games.select(
        games=pl.len(),
        first_date=pl.col("utc_date").min(),
        last_date=pl.col("utc_date").max(),
        time_controls=pl.col("time_control").unique().sort().implode(),
    ).collect()
    # The app lists these before (and without) loading square_heatmap_openings.json.
    board_openings = top_openings(games, BOARD_OPENINGS).collect()["opening_family"].to_list()
    (args.out / "meta.json").write_text(json.dumps({**meta.to_dicts()[0], "board_openings": board_openings}))
    print(f"wrote {args.out / 'meta.json'}")


if __name__ == "__main__":
    main()
