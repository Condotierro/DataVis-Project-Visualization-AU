import { useMemo, useState } from 'react'
import { SegmentedControl } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { ACCENT, CONTEXT, INK, MIN_GAMES, scoreWithCI, sumResults } from '../lib/chess'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'

type Row = { gap: number; elo_bracket: number; games: number; white: number; draw: number; black: number }


const VIEWS = [
  { value: 'white', label: "White's score" },
  { value: 'favorite', label: "Higher-rated player's score" },
]

const series = {
  scale: { domain: ['Actual score', 'Elo prediction'], range: [ACCENT, INK] },
  legend: { title: null, orient: 'top-left' },
} as const

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  vconcat: [
    {
      width: 680,
      height: 340,
      layer: [
        {
          mark: { type: 'rule', color: '#d8d6d0' },
          encoding: { y: { datum: 0.5 } },
        },
        {
          // Expected score under the Elo formula, drawn as a smooth curve.
          data: { sequence: { start: -400, stop: 401, step: 5, as: 'gap' } },
          transform: [{ calculate: '1 / (1 + pow(10, -datum.gap / 400))', as: 'expected' }],
          mark: { type: 'line', strokeWidth: 2, strokeDash: [6, 4] },
          encoding: {
            x: { field: 'gap', type: 'quantitative' },
            y: { field: 'expected', type: 'quantitative' },
            color: { datum: 'Elo prediction', ...series },
          },
        },
        {
          mark: { type: 'area', opacity: 0.18, color: ACCENT },
          encoding: {
            x: { field: 'gap', type: 'quantitative' },
            y: { field: 'lo', type: 'quantitative' },
            y2: { field: 'hi' },
          },
        },
        {
          mark: { type: 'line', strokeWidth: 2, point: { size: 64, filled: true } },
          encoding: {
            x: {
              field: 'gap',
              type: 'quantitative',
              title: null,
              scale: { domain: [-400, 400] },
              axis: { labels: false, ticks: false },
            },
            y: {
              field: 'score',
              type: 'quantitative',
              title: 'Score (win = 1, draw = ½)',
              scale: { domain: [0, 1] },
              axis: { format: '.0%' },
            },
            color: { datum: 'Actual score', ...series },
            tooltip: [
              { field: 'gap', title: 'Rating gap' },
              { field: 'score', title: 'Actual score', format: '.1%' },
              { field: 'expected', title: 'Elo prediction', format: '.1%' },
              { field: 'games', title: 'Games', format: ',' },
            ],
          },
        },
      ],
    },
    {
      // The difference itself: the curves above sit close together, so the gap between
      // them is hard to judge by eye. Here it is on its own common baseline (0 = as predicted).
      width: 680,
      height: 150,
      layer: [
        {
          mark: { type: 'rule', color: INK, strokeDash: [6, 4] },
          encoding: { y: { datum: 0 } },
        },
        {
          mark: { type: 'rule', color: CONTEXT, strokeWidth: 1.5 },
          encoding: {
            x: { field: 'gap', type: 'quantitative' },
            y: { field: 'diff_lo', type: 'quantitative' },
            y2: { field: 'diff_hi' },
          },
        },
        {
          mark: { type: 'circle', color: ACCENT, size: 40, opacity: 1 },
          encoding: {
            x: {
              field: 'gap',
              type: 'quantitative',
              title: null,
              scale: { domain: [-400, 400] },
              axis: { labels: false, ticks: false },
            },
            y: {
              field: 'diff',
              type: 'quantitative',
              title: ['Actual − predicted', '(0 = as Elo predicts)'],
              axis: { format: '+.0%', tickCount: 4 },
            },
            tooltip: [
              { field: 'gap', title: 'Rating gap' },
              { field: 'diff', title: 'Actual − predicted', format: '+.1%' },
              { field: 'diff_ci', title: '95% interval' },
              { field: 'games', title: 'Games', format: ',' },
            ],
          },
        },
      ],
    },
    {
      width: 680,
      height: 70,
      mark: { type: 'bar', color: CONTEXT, cornerRadiusEnd: 2 },
      encoding: {
        x: {
          field: 'gap',
          type: 'quantitative',
          bin: { step: 25, anchor: -12.5, extent: [-412.5, 412.5] },
          scale: { domain: [-400, 400] },
          title: 'Rating gap',
        },
        y: { field: 'games', type: 'quantitative', aggregate: 'sum', title: 'Games', axis: { tickCount: 2 } },
        tooltip: [
          { field: 'gap', title: 'Rating gap' },
          { field: 'games', aggregate: 'sum', title: 'Games', format: ',' },
        ],
      },
    },
  ],
}

export default function RatingGap() {
  const rows = useData<Row[]>('rating_gap.json')
  const [view, setView] = useState('white')
  const { inRange } = useEloFilter()

  const fullSpec = useMemo(() => {
    let filtered = (rows ?? []).filter((r) => inRange(r.elo_bracket))
    if (view === 'favorite') {
      // Look at every game from the higher-rated side: a black favorite becomes a positive gap.
      filtered = filtered.map((r) => (r.gap < 0 ? { ...r, gap: -r.gap, white: r.black, black: r.white } : r))
    }
    const values = sumResults(filtered, 'gap')
      .filter((r) => r.games >= MIN_GAMES)
      .map((r) => {
        const s = scoreWithCI(r)
        const expected = 1 / (1 + 10 ** (-r.gap / 400))
        const [diff_lo, diff_hi] = [s.lo - expected, s.hi - expected]
        const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
        return { ...r, ...s, expected, diff: s.score - expected, diff_lo, diff_hi, diff_ci: `${pct(diff_lo)} to ${pct(diff_hi)}` }
      })
    return { ...spec, data: { values } } as VisualizationSpec
  }, [rows, inRange, view])

  return (
    <TabSection
      title="Does the higher-rated player win as often as predicted?"
      description={`Actual score by rating gap (with a 95% interval) against what the Elo formula expects. Gap = white − black, in 25-point bins; bins with fewer than ${MIN_GAMES} games are hidden. The middle panel shows the difference, actual minus predicted: points above the dashed line mean white (or the favorite) scores more than Elo expects. The bars at the bottom show how many games each gap has.`}
      controls={<SegmentedControl data={VIEWS} value={view} onChange={setView} />}
      loading={!rows}
    >
      <VegaEmbed spec={fullSpec} />
    </TabSection>
  )
}
