import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Button, Group, Paper, Text } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { VegaEmbed } from 'react-vega'
import type { Result, VisualizationSpec } from 'vega-embed'
import { useData } from './data'
import { CONTEXT, INK, bracketLabel, bracketLabelExpr, sumResults } from './chess'
import { EloContext, type Range } from './eloRange'

// The global Elo filter: a brushable histogram of games per bracket, and the provider
// that shares the picked range with every tab (read it with useEloFilter()).

export function EloFilterProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<Range>(null)
  // The brush fires on every mouse move; only re-render the tabs when the snapped range changes.
  const setRange = useCallback(
    (r: Range) => setRangeState((old) => (old?.lo === r?.lo && old?.hi === r?.hi ? old : r)),
    [],
  )
  const value = useMemo(() => ({ range, setRange }), [range, setRange])
  return <EloContext.Provider value={value}>{children}</EloContext.Provider>
}

type Row = { elo_bracket: number; games: number; white: number; draw: number; black: number }

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  height: 60,
  transform: [
    { calculate: 'datum.elo_bracket + 200', as: 'end' },
    { calculate: bracketLabelExpr('datum.elo_bracket'), as: 'label' },
  ],
  // Bars span their bracket on a quantitative axis, so the brush can be dragged freely.
  mark: { type: 'bar', stroke: 'white', strokeWidth: 1, cursor: 'col-resize' },
  encoding: {
    x: {
      field: 'elo_bracket',
      type: 'quantitative',
      scale: { domain: [600, 3000], nice: false },
      title: null,
      axis: { values: [800, 1200, 1600, 2000, 2400, 2800], labelExpr: "datum.value + ''" },
    },
    x2: { field: 'end' },
    y: { field: 'games', type: 'quantitative', title: null, axis: null },
    y2: { datum: 0 }, // with x2 set, bars need an explicit base
    // Selection by lightness, not hue: the accent is kept for the data itself.
    // Same rule as snap(): a bracket is in when the brush covers its middle.
    color: {
      condition: {
        test: '!brush.elo_bracket || inrange(datum.elo_bracket + 100, brush.elo_bracket)',
        value: INK,
      },
      value: CONTEXT,
    },
    tooltip: [
      { field: 'label', title: 'Average Elo' },
      { field: 'games', title: 'Games', format: ',' },
    ],
  },
  config: { view: { stroke: null } },
}

/** Snap a dragged interval to the brackets whose middle it covers. */
function snap(interval: [number, number] | undefined): Range {
  if (!interval) return null
  const [a, b] = interval[0] < interval[1] ? interval : [interval[1], interval[0]]
  const starts = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800].filter(
    (s) => s + 100 >= a && s + 100 <= b,
  )
  return starts.length ? { lo: starts[0], hi: starts[starts.length - 1] } : null
}

function rangeLabel(range: Range) {
  if (!range) return 'All ratings'
  if (range.lo === range.hi) return `Elo ${bracketLabel(range.lo)}`
  const from = range.lo > 600 ? range.lo : null // the ends are open (see bracketLabel)
  const to = range.hi < 2800 ? range.hi + 199 : null
  if (from && to) return `Elo ${from}–${to}`
  if (from) return `Elo ${from}+`
  if (to) return `Elo below ${to + 1}`
  return 'All ratings'
}

export function EloBrush() {
  const rows = useData<Row[]>('results_by_elo.json')
  const { range, setRange } = useContext(EloContext)
  const [resetKey, setResetKey] = useState(0)
  const { ref, width } = useElementSize()

  const brackets = useMemo(() => sumResults(rows ?? [], 'elo_bracket'), [rows])
  // The picked range lives in React state, not in the chart: whenever the chart is
  // re-embedded (resize, reset) the brush is redrawn from it, snapped to whole brackets.
  // `range` is left out of the deps on purpose, so brushing itself doesn't re-embed.
  const fullSpec = useMemo(() => {
    const brush = {
      name: 'brush',
      select: { type: 'interval', encodings: ['x'] },
      ...(range && { value: { x: [range.lo, range.hi + 200] } }),
    }
    return { ...spec, width, params: [brush], data: { values: brackets } } as VisualizationSpec
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brackets, width, resetKey])

  const onEmbed = useCallback(
    ({ view }: Result) =>
      view.addSignalListener('brush', (_, value: { elo_bracket?: [number, number] }) => setRange(snap(value.elo_bracket))),
    [setRange],
  )

  const total = brackets.reduce((n, r) => n + r.games, 0)
  const picked = brackets.filter((r) => !range || (r.elo_bracket >= range.lo && r.elo_bracket <= range.hi))
  const pickedGames = picked.reduce((n, r) => n + r.games, 0)

  return (
    <Paper withBorder p="sm" mb="lg">
      <Group justify="space-between" align="baseline" mb={4}>
        <Text size="sm" fw={600}>
          {rangeLabel(range)}
          <Text span c="dimmed" fw={400}>
            {' '}
            · {pickedGames.toLocaleString()} games ({total ? ((pickedGames / total) * 100).toFixed(0) : 0}%)
          </Text>
        </Text>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Drag across the histogram to filter every view by average Elo
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            disabled={!range}
            onClick={() => {
              setRange(null)
              setResetKey((k) => k + 1) // re-embed to clear the brush
            }}
          >
            Reset
          </Button>
        </Group>
      </Group>
      <div ref={ref}>
        {/* A fixed pixel width (instead of 'container'), and none at all while unmeasured. */}
        {rows && width > 0 && <VegaEmbed key={resetKey} spec={fullSpec} onEmbed={onEmbed} options={EMBED_OPTIONS} />}
      </div>
    </Paper>
  )
}

const EMBED_OPTIONS = { actions: false }
