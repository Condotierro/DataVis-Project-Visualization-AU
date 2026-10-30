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
TOP_OPENINGS = 15


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
    top = (
        games.group_by("opening_family")
        .len()
        .sort("len", descending=True)
        .head(TOP_OPENINGS)
        .select("opening_family")
    )
    return (
        games.join(top, on="opening_family")
        .group_by("opening_family", "elo_bracket")
        .agg(result_counts())
        .sort("opening_family", "elo_bracket")
        .collect()
    )


def square_heatmap(games: pl.LazyFrame) -> pl.DataFrame:
    """Destination square of every move, split by side and piece.

    Parsed straight from SAN (no board replay needed): the destination is the
    last square in the token; castling is mapped to the king's target square.
    """
    moves = (
        games.with_row_index("gid")
        .select("gid", "time_class", san=pl.col("moves").str.split(" "))
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
    )
    return (
        moves.filter(pl.col("square").is_not_null())
        .group_by("side", "piece", "square")
        .agg(count=pl.len())
        .sort("side", "piece", "square")
        .collect()
    )


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

    meta = games.select(
        games=pl.len(),
        first_date=pl.col("utc_date").min(),
        last_date=pl.col("utc_date").max(),
        time_controls=pl.col("time_control").unique().sort().implode(),
    ).collect()
    (args.out / "meta.json").write_text(json.dumps(meta.to_dicts()[0]))
    print(f"wrote {args.out / 'meta.json'}")


if __name__ == "__main__":
    main()
