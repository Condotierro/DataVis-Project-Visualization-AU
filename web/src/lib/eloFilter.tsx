import { useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Button, Group, Paper, Text } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { VegaEmbed } from 'react-vega'
import type { Result, VisualizationSpec } from 'vega-embed'
import { useData } from './data'
import { CONTEXT, ELO_BANDS, INK, bandIndex, sumResults } from './chess'
import { EloContext, type Range } from './eloRange'

// The global Elo filter: a brushable histogram of games per Elo range (ELO_BANDS), and the provider
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
  transform: [{ calculate: 'datum.band + 1', as: 'end' }],
  // One equal-width bar per range: the ranges differ in Elo width, so on a true Elo axis bar area
  // wouldn't match game counts. The axis is the range index, quantitative so the brush drags freely.
  mark: { type: 'bar', stroke: 'white', strokeWidth: 1, cursor: 'col-resize' },
  encoding: {
    x: {
      field: 'band',
      type: 'quantitative',
      scale: { domain: [0, ELO_BANDS.length], nice: false },
      title: null,
      axis: {
        values: ELO_BANDS.map((_, i) => i + 0.5),
        labelExpr: `${JSON.stringify(ELO_BANDS.map((b) => b.label))}[floor(datum.value)]`,
        ticks: false,
      },
    },
    x2: { field: 'end' },
    y: { field: 'games', type: 'quantitative', title: null, axis: null },
    y2: { datum: 0 }, // with x2 set, bars need an explicit base
    // Selection by lightness, not hue: the accent is kept for the data itself.
    // Same rule as snap(): a range is in when the brush covers its middle.
    color: {
      condition: {
        test: '!brush.band || inrange(datum.band + 0.5, brush.band)',
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

/** Snap a dragged interval to the ranges whose middle it covers, as 200-wide bracket starts. */
function snap(interval: [number, number] | undefined): Range {
  if (!interval) return null
  const [a, b] = interval[0] < interval[1] ? interval : [interval[1], interval[0]]
  const picked = ELO_BANDS.filter((_, i) => i + 0.5 >= a && i + 0.5 <= b)
  return picked.length ? { lo: picked[0].lo, hi: picked[picked.length - 1].hi } : null
}

function rangeLabel(range: Range) {
  if (!range) return 'All ratings'
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
  const bands = useMemo(
    () =>
      sumResults(
        brackets.map((r) => ({ ...r, band: bandIndex(r.elo_bracket) })),
        'band',
      ).map((r) => ({ band: r.band, games: r.games, label: ELO_BANDS[r.band].label })),
    [brackets],
  )
  // The picked range lives in React state, not in the chart: whenever the chart is
  // re-embedded (resize, reset) the brush is redrawn from it, snapped to whole brackets.
  // `range` is left out of the deps on purpose, so brushing itself doesn't re-embed.
  const fullSpec = useMemo(() => {
    const brush = {
      name: 'brush',
      select: { type: 'interval', encodings: ['x'] },
      ...(range && { value: { x: [bandIndex(range.lo), bandIndex(range.hi) + 1] } }),
    }
    return { ...spec, width, params: [brush], data: { values: bands } } as VisualizationSpec
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, width, resetKey])

  const onEmbed = useCallback(
    ({ view }: Result) =>
      view.addSignalListener('brush', (_, value: { band?: [number, number] }) => setRange(snap(value.band))),
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
