import { useCallback, useMemo, useState } from 'react'
import { Text, Title } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { Result, VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { ACCENT, CONTEXT, DIMMED, INK, MIN_GAMES, bracketLabel, bracketLabelExpr, scoreWithCI, sumResults } from '../lib/chess'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'

type Row = { opening_family: string; elo_bracket: number; games: number; white: number; draw: number; black: number }

const LABELED = 6 // name the most played openings on the chart; the rest are in tooltips

const x = {
  field: 'games',
  type: 'quantitative' as const,
  scale: { type: 'log' as const, nice: false, padding: 24 },
  title: 'Games played (log scale)',
  axis: { values: [300, 500, 1000, 2000, 5000, 10000, 20000], format: '~s' },
}

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  width: 'container',
  height: 440,
  encoding: {
    y: {
      field: 'score',
      type: 'quantitative',
      scale: { zero: false },
      title: "White's score (win = 1, draw = ½)",
      axis: { format: '.0%' },
    },
  },
  layer: [
    {
      // Helper line: the average over all games in the Elo filter. It splits the plot into
      // openings that do better or worse for white than chess in general.
      data: { name: 'mean' },
      mark: { type: 'rule', color: INK, strokeDash: [6, 4] },
      encoding: { y: { field: 'score', type: 'quantitative' } },
    },
    {
      data: { name: 'mean' },
      mark: { type: 'text', color: INK, align: 'left', baseline: 'top', dy: 3, x: 4 },
      encoding: {
        y: { field: 'score', type: 'quantitative' },
        text: { value: 'average of all games' },
      },
    },
    {
      // 95% interval, subordinate to the points.
      mark: { type: 'rule', color: CONTEXT, strokeWidth: 1.5 },
      encoding: { x, y: { field: 'lo' }, y2: { field: 'hi' } },
    },
    {
      mark: { type: 'circle', color: ACCENT, size: 70, opacity: 1, cursor: 'pointer' },
      encoding: {
        x,
        // The opening shown in the chart below gets a dark ring.
        stroke: { condition: { test: 'datum.picked', value: INK }, value: 'white' },
        strokeWidth: { condition: { test: 'datum.picked', value: 2.5 }, value: 1 },
        tooltip: [
          { field: 'opening_family', title: 'Opening' },
          { field: 'games', title: 'Games', format: ',' },
          { field: 'score', title: "White's score", format: '.1%' },
          { field: 'ci', title: '95% interval' },
          { field: 'white_share', title: 'White wins', format: '.1%' },
          { field: 'draw_share', title: 'Draws', format: '.1%' },
          { field: 'black_share', title: 'Black wins', format: '.1%' },
        ],
      },
    },
    {
      transform: [{ filter: `datum.rank <= ${LABELED} || datum.picked` }],
      mark: { type: 'text', align: 'left', dx: 7, fontSize: 11, color: INK, fontWeight: { expr: "datum.picked ? 'bold' : 'normal'" } },
      encoding: { x, text: { field: 'opening_family' } },
    },
  ],
}

// One opening across Elo brackets: does it work better for weaker or stronger players?
// Same y as the scatterplot, and the dashed line is again all games, now per bracket.
const detailSpec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  width: 'container',
  height: 240,
  encoding: {
    x: {
      field: 'elo_bracket',
      type: 'ordinal',
      title: 'Average Elo of both players',
      axis: { labelExpr: bracketLabelExpr('datum.value', false), labelAngle: 0 },
    },
    y: { type: 'quantitative', scale: { zero: false }, title: "White's score", axis: { format: '.0%' } },
    // The x axis is Elo itself, so brackets outside the global filter are dimmed, not removed.
    opacity: { condition: { test: 'datum.inRange', value: 1 }, value: DIMMED },
  },
  layer: [
    {
      data: { name: 'overall' },
      mark: { type: 'line', color: INK, strokeDash: [6, 4] },
      encoding: { y: { field: 'score' }, opacity: { value: 1 } },
    },
    {
      mark: { type: 'rule', color: CONTEXT, strokeWidth: 1.5 },
      encoding: { y: { field: 'lo' }, y2: { field: 'hi' } },
    },
    { mark: { type: 'line', color: ACCENT, strokeWidth: 2 }, encoding: { y: { field: 'score' }, opacity: { value: 1 } } },
    {
      mark: { type: 'circle', color: ACCENT, size: 60, opacity: 1 },
      encoding: {
        y: { field: 'score' },
        tooltip: [
          { field: 'bracket_label', title: 'Elo bracket' },
          { field: 'score', title: "White's score", format: '.1%' },
          { field: 'ci', title: '95% interval' },
          { field: 'overall', title: 'All games', format: '.1%' },
          { field: 'games', title: 'Games', format: ',' },
        ],
      },
    },
  ],
}

const ciLabel = (s: { lo: number; hi: number }) => `${(s.lo * 100).toFixed(1)}–${(s.hi * 100).toFixed(1)}%`

export default function Openings() {
  const rows = useData<Row[]>('openings_by_elo.json')
  const all = useData<Row[]>('results_by_elo.json')
  const { inRange } = useEloFilter()
  const [picked, setPicked] = useState<string | null>(null)

  const fullSpec = useMemo(() => {
    const values = sumResults((rows ?? []).filter((r) => inRange(r.elo_bracket)), 'opening_family')
      .filter((r) => r.games >= MIN_GAMES)
      .sort((a, b) => b.games - a.games)
      .map((r, i) => {
        const s = scoreWithCI(r)
        return {
          ...r,
          ...s,
          rank: i + 1,
          ci: ciLabel(s),
          white_share: r.white / r.games,
          draw_share: r.draw / r.games,
          black_share: r.black / r.games,
        }
      })
    // The reference is every game in the filter, not just the top openings plotted.
    const [total] = sumResults(
      (all ?? []).filter((r) => inRange(r.elo_bracket)).map((r) => ({ ...r, key: 0 })),
      'key',
    )
    const mean = total ? [{ score: scoreWithCI(total).score }] : []
    // Until something is clicked, show the most played opening.
    const shown = values.find((r) => r.opening_family === picked) ?? values[0]
    const marked = values.map((r) => ({ ...r, picked: r === shown }))
    return { spec: { ...spec, datasets: { mean }, data: { values: marked } } as VisualizationSpec, shown: shown?.opening_family }
  }, [rows, all, inRange, picked])

  const shown = fullSpec.shown
  const detail = useMemo(() => {
    const overall = new Map(sumResults(all ?? [], 'elo_bracket').map((r) => [r.elo_bracket, scoreWithCI(r).score]))
    const values = (rows ?? [])
      .filter((r) => r.opening_family === shown && r.games >= MIN_GAMES)
      .map((r) => {
        const s = scoreWithCI(r)
        return {
          ...r,
          ...s,
          ci: ciLabel(s),
          overall: overall.get(r.elo_bracket),
          inRange: inRange(r.elo_bracket),
          bracket_label: bracketLabel(r.elo_bracket),
        }
      })
    // The reference line only spans the brackets this opening has.
    const brackets = new Set(values.map((r) => r.elo_bracket))
    const reference = [...overall]
      .filter(([b]) => brackets.has(b))
      .map(([elo_bracket, score]) => ({ elo_bracket, score, inRange: inRange(elo_bracket) }))
    return { ...detailSpec, datasets: { overall: reference }, data: { values } } as VisualizationSpec
  }, [rows, all, shown, inRange])

  // Clicking a dot picks that opening for the chart below.
  const onEmbed = useCallback(({ view }: Result) => {
    view.addEventListener('click', (_, item) => {
      const name = (item?.datum as { opening_family?: string } | undefined)?.opening_family
      if (name) setPicked(name)
    })
  }, [])

  return (
    <TabSection
      title="Which openings are good for white?"
      description={`Each dot is an opening family: how often it's played against how well white scores with it. Openings above the dashed line do better for white than the average game. Bars are 95% intervals: an opening whose bar crosses the line isn't clearly different from average. Openings with fewer than ${MIN_GAMES} games in the Elo filter are hidden. Click a dot to see that opening by rating below.`}
      loading={!rows || !all}
    >
      <VegaEmbed spec={fullSpec.spec} onEmbed={onEmbed} style={{ width: '100%' }} />
      <Title order={4} mt="lg">
        {shown}: white's score by rating
      </Title>
      <Text size="sm" c="dimmed" mb="xs">
        Dashed: all games in the same bracket. Above it, the opening helps white at that level; below it, black.
        Brackets with fewer than {MIN_GAMES} games of this opening are left out.
      </Text>
      <VegaEmbed spec={detail} style={{ width: '100%' }} />
    </TabSection>
  )
}
