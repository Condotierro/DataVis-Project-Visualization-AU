import { createContext, useCallback, useContext } from 'react'

// The Elo range picked on the histogram in the header (see eloFilter.tsx). Every tab
// filters (or dims) by it, so all views always show the same games.

export type Range = { lo: number; hi: number } | null // bracket starts, inclusive; null = all

export const EloContext = createContext<{ range: Range; setRange: (r: Range) => void }>({
  range: null,
  setRange: () => {},
})

/** `inRange(bracket)` for filtering rows; it changes identity with the range, so use it in useMemo deps. */
export function useEloFilter() {
  const { range } = useContext(EloContext)
  const inRange = useCallback((b: number) => !range || (b >= range.lo && b <= range.hi), [range])
  return { range, inRange }
}
