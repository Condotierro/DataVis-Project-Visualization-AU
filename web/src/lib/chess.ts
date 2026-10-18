// Shared encodings so every tab colors results the same way.
// White/black wins use the piece colors themselves; draws sit in between.
export const RESULT_DOMAIN = ['White wins', 'Draw', 'Black wins']
export const RESULT_COLORS = ['#e9e4d8', '#9a9890', '#2b2a28']

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
