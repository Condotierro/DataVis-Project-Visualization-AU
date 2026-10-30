# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ChessViz is a group project for the Aarhus University Data Visualization course. It's an interactive visualization of Lichess rated games from September 2026. The deliverables are a report of at most 6 pages and a video of at most 5 minutes, due 2026-12-11. Course requirements are in `docs/project_specs.md` and `docs/tools_specs.md`. Grading weighs correctness of the visualization, design decisions argued from lecture principles, and real interactivity. The LaTeX report template is in `docs/course-material/report-template/` (build with `latexmk`, which runs xelatex + biber).

`chessviz_dashboard_prototype.html` is an early static mockup, kept only for reference.

## Pipeline

Data flows one way. Every stage is a separate step that you run by hand:

```
dataset/*.pgn.zst  (raw Lichess dump, ~30 GB, gitignored)
  → preprocessing/extract.py   → data/interim/games.parquet   (one row per game, gitignored)
  → preprocessing/aggregate.py → web/public/data/*.json       (small, COMMITTED)
  → web/ (React)               → GitHub Pages
```

The app currently runs on `Sampling_100k.zip` at the repo root, which is the group's sample: 100k rated 3+0 blitz games spread over all of September, as a CSV. `aggregate.py` reads it directly, zipped or not, so the extract step is skipped. The CSV has no `Opening` header, so `preprocessing/openings.py` names each opening from its moves. It uses Lichess's own opening table (`preprocessing/openings/*.tsv`, CC0) and matches by position, as Lichess does. On games that do have the header it agrees on 98.6% of exact names and 99.7% of families.

The JSON in `web/public/data/` is committed on purpose. CI builds the site from it and never sees the raw dump. After changing `aggregate.py`, rerun it and commit the regenerated JSON. Keep these files small, in the tens of KB. The one exception is `square_heatmap_openings.json` (~360 KB, ~90 KB gzipped): the board tab fetches it only after the user picks an opening.

`data/raw/dev_sample_100k.pgn.zst` holds the first 100k games of the dump, all from Sept 1. Use it for fast iteration.

## Commands

Preprocessing (Python ≥3.12, managed by uv; run from `preprocessing/`):

```bash
uv run extract.py ../data/raw/dev_sample_100k.pgn.zst          # or ../dataset/lichess_db_standard_rated_2026-09.pgn.zst [--limit N] [--every K]
uv run aggregate.py ../Sampling_100k.zip                       # writes ../web/public/data/*.json (~20 s)
uv run aggregate.py ../data/interim/games.parquet              # same, from extract.py output
```

Web (run from `web/`):

```bash
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build. This is the type check; CI runs it too
npm run lint       # oxlint
npm run preview    # serve the built dist/
```

There are no tests.

## Architecture notes

**Preprocessing**
- `extract.py` parses PGN with regexes, not python-chess, for speed: about 25k games/s, roughly an hour for the full month. Each Lichess game is a block of header lines followed by its movetext on a single line.
- Sampling goes in `keep_game()`. Two teammates own the sampling strategy (stratified, by Elo, and so on), so keep that hook intact.
- Time class is computed from `TimeControl` with Lichess's rule (estimated duration = base + 40 × increment). It is not taken from `Event`, because Swiss and arena events break that header.
- `aggregate.py` has one function per output JSON file and uses polars lazy frames. It derives `elo_bracket` (average of both players, 200-wide bins clipped to 600–2800) and `opening_family` (the opening name before the `:`).
- Board-square stats come straight from the move notation. The destination square is the last square in the move token, and castling is mapped to the king's target square. No board replay is needed.

**Web**
- Stack: Vite + React 19 + TS, Mantine for UI, react-vega (Vega-Lite) for charts, SWR for data loading, and react-chessboard + d3-scale for the board.
- Each visualization is one tab. New tabs start as a copy of `src/tabs/_Template.tsx` and get registered in `src/tabs/index.ts`. A tab's `id` becomes the URL hash; `App.tsx` syncs it through Mantine's `useHash`.
- `src/lib/data.ts` has `useData<T>(file)`, an SWR-cached fetch of `public/data/<file>`. It prefixes `import.meta.env.BASE_URL`, and Vite's `base` is `'./'`, so the same build works locally and under the Pages subpath. Don't use absolute `/...` asset paths.
- `src/lib/chess.ts` holds the shared result encoding: the white/draw/black color scale, `sumResults()` to collapse rows over a dimension, and `toResultRows()` to convert wide counts to long rows for Vega stacking. Reuse it so every tab colors results the same way.
- Vega-Lite specs are module-level constants with a placeholder `data: { name: 'table' }`. Each tab injects `data: { values }` inside a `useMemo`. react-vega v8 tears down and re-embeds the chart whenever the spec object identity changes, so memoize the spec.
- `src/lib/TabSection.tsx` provides the standard layout for a tab: title, description, a row of controls, and the chart.

**Deploy**: `.github/workflows/deploy.yml` builds `web/` and publishes it to Pages on every push to `main`. The work branch is `chess-project`. The repo is private, which means Pages needs the owner (Condotierro) to have GitHub Pro and to set Pages Source to "GitHub Actions".

## Conventions

- Prefer an existing library over hand-rolled components or utilities. The user feels strongly about this.
- The root `.gitignore` started from the GitHub Python template. Check that new paths aren't caught by its rules, which is how `lib/` once hid `web/src/lib/`. `*.mp4` files go through Git LFS (`.gitattributes`).
