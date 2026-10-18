# ChessViz

Interactive visualization of Lichess rated games (September 2026), for the AU Data Visualization course.

```
dataset/            raw Lichess dump (.pgn.zst, ~30 GB) -- not committed
data/interim/       extracted games table (Parquet)   -- not committed
preprocessing/      Python: dump -> Parquet -> small JSON files
web/                React app (Vite + Mantine + Vega-Lite), one tab per visualization
web/public/data/    the JSON files the app reads       -- committed, so the site can build without the dump
```

Pushing to `main` builds `web/` and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).

## Quick start

You need [Node.js](https://nodejs.org) 20+ and [uv](https://docs.astral.sh/uv/getting-started/installation/).

**Just want to see or work on the charts?** The processed data is already committed, so this is all you need:

```bash
cd web
npm install
npm run dev        # open http://localhost:5173
```

**Want to regenerate the data?**

```bash
# 1. Download the dump (~30 GB) into dataset/
mkdir -p dataset
curl -L -o dataset/lichess_db_standard_rated_2026-09.pgn.zst \
  https://database.lichess.org/standard/lichess_db_standard_rated_2026-09.pgn.zst

# 2. Extract games. Start small: --limit 100000 takes a few seconds
cd preprocessing
uv run extract.py ../dataset/lichess_db_standard_rated_2026-09.pgn.zst --limit 100000

# 3. Build the JSON the web app reads
uv run aggregate.py ../data/interim/games.parquet
```

Then refresh the page in the browser. Commit the changed files in `web/public/data/` so the website gets the new data too.

## 1. Preprocessing (Python, [uv](https://docs.astral.sh/uv/))

Download `lichess_db_standard_rated_2026-09.pgn.zst` from https://database.lichess.org into `dataset/`, then:

```bash
cd preprocessing
uv run extract.py ../dataset/lichess_db_standard_rated_2026-09.pgn.zst --limit 1000000   # -> ../data/interim/games.parquet
uv run aggregate.py ../data/interim/games.parquet                                        # -> ../web/public/data/*.json
```

- `extract.py` streams the dump (never fully decompressed, ~25k games/s) and keeps one row per game:
  ratings, result, time class, ECO/opening, termination, and the moves as SAN. **Sampling goes in `keep_game()`**;
  it currently keeps every `--every`-th game.
- `aggregate.py` turns that table into small JSON files, one function per file. Add a function there when a new
  visualization needs data in a different shape.

## 2. Web app

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

### Adding a visualization

1. Copy `web/src/tabs/_Template.tsx` to e.g. `web/src/tabs/TimeOfDay.tsx`.
2. Register it in `web/src/tabs/index.ts`: `{ id: 'time', title: 'Time of day', component: TimeOfDay }`.
3. Push. It's live on the Pages site a minute later at `.../#time`.

Charts are [Vega-Lite](https://vega.github.io/vega-lite/) specs rendered with `react-vega`. You can prototype a
spec in the [online editor](https://vega.github.io/editor) or in Python with Altair (`chart.to_dict()`) and paste it
in. Anything Vega-Lite can't draw can be its own React component; `BoardHeatmap.tsx` uses `react-chessboard`, for example.
UI controls (selects, toggles, layout) come from [Mantine](https://mantine.dev/core/package/).
