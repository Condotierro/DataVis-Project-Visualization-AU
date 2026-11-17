// Shared encodings so every tab colors things the same way.

import { BLUE, MUTED, PAGE, TEXT } from './theme'

// One accent with one meaning across all tabs: the observed data a chart is about
// (actual score, time forfeits, openings). Everything else is grey: CONTEXT for the
// data it's read against, INK for helper lines (predictions, means), drawn dashed.
// Selections dim what's left out instead of adding a hue.
export const ACCENT = BLUE
export const CONTEXT = '#cfcecb'
export const INK = MUTED
export const DIMMED = 0.25

// White/black wins use the piece colors themselves; draws sit in between. The result
// is ordinal (score 1 / ½ / 0), so a monotone lightness ramp fits it.
export const RESULT_DOMAIN = ['White wins', 'Draw', 'Black wins']
export const RESULT_COLORS = [PAGE, '#a3a29f', TEXT]
// "White wins" is barely darker than the white panel, so an INK outline keeps the
// segment from reading as background.
export const RESULT_MARK = { type: 'bar', stroke: INK, strokeWidth: 0.75 } as const

// Elo brackets are 200 wide; the ends are clipped in aggregate.py (below 800 lands in 600).
export const bracketLabel = (b: number) => (b <= 600 ? '<800' : b >= 2800 ? '2800+' : `${b}–${b + 199}`)
/** bracketLabel() as a Vega expression on `field` (e.g. 'datum.value' for axis labels). */
export const bracketLabelExpr = (field: string, full = true) =>
  `${field} <= 600 ? '<800' : ${field} >= 2800 ? '2800+' : ${full ? `${field} + '–' + (${field} + 199)` : `${field} + ''`}`

// Coarser Elo ranges for the header filter and "Who wins, by rating?". `lo` and `hi` are the
// first and last 200-wide bracket each holds; every boundary is a multiple of 200, so each
// bracket falls entirely inside one range.
export const ELO_BANDS = [
  { label: 'Under 1000', lo: 600, hi: 800 },
  { label: '1000–1399', lo: 1000, hi: 1200 },
  { label: '1400–1799', lo: 1400, hi: 1600 },
  { label: '1800–2199', lo: 1800, hi: 2000 },
  { label: '2200 and over', lo: 2200, hi: 2800 },
]
/** Index into ELO_BANDS of the range holding a 200-wide bracket. */
export const bandIndex = (bracket: number) => ELO_BANDS.findIndex((b) => bracket <= b.hi)

// Groups with fewer games are too noisy to plot.
export const MIN_GAMES = 30
// Same idea for the share of a whole group (2800+ has only 54 games).
export const MIN_BRACKET_GAMES = 100

export const resultColor = {
  field: 'result',
  type: 'nominal',
  title: null,
  scale: { domain: RESULT_DOMAIN, range: RESULT_COLORS },
  sort: RESULT_DOMAIN,
} as const

type ResultCounts = { white: number; draw: number; black: number; games: number }

/** Add up result counts of rows sharing the same `key` (e.g. collapse time classes). */
export function sumResults<T extends ResultCounts>(rows: T[], key: keyof T): T[] {
  const groups = new Map<unknown, T>()
  for (const r of rows) {
    const acc = groups.get(r[key]) ?? { ...r, games: 0, white: 0, draw: 0, black: 0 }
    acc.games += r.games
    acc.white += r.white
    acc.draw += r.draw
    acc.black += r.black
    groups.set(r[key], acc)
  }
  return [...groups.values()]
}

/** Turn {white, draw, black} columns into long rows Vega-Lite can stack. */
export function toResultRows<T extends ResultCounts>(rows: T[]) {
  return rows.flatMap((r) =>
    (
      [
        ['White wins', r.white],
        ['Draw', r.draw],
        ['Black wins', r.black],
      ] as const
    ).map(([result, count], order) => ({ ...r, result, count, order, share: count / r.games })),
  )
}

/** White's score (win = 1, draw = ½) with a normal-approximation 95% interval. */
export function scoreWithCI(r: ResultCounts) {
  const score = (r.white + r.draw / 2) / r.games
  const half = 1.96 * Math.sqrt((score * (1 - score)) / r.games)
  return { score, lo: score - half, hi: score + half }
}
