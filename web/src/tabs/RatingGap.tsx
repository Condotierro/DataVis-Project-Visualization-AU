import { useMemo, useState } from 'react'
import { SegmentedControl, Select } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { sumResults } from '../lib/chess'
import { TabSection } from '../lib/TabSection'

type Row = { gap: number; elo_bracket: number; games: number; white: number; draw: number; black: number }

const MIN_GAMES = 30 // bins with fewer games are too noisy to plot
const ACTUAL = '#2a78d6'
const PREDICTED = '#5f5d57'

const VIEWS = [
  { value: 'white', label: "White's score" },
  { value: 'favorite', label: "Higher-rated player's score" },
]

const series = {
  scale: { domain: ['Actual score', 'Elo prediction'], range: [ACTUAL, PREDICTED] },
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
          mark: { type: 'area', opacity: 0.18, color: ACTUAL },
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
      width: 680,
      height: 70,
      mark: { type: 'bar', color: '#c9c6bd', cornerRadiusEnd: 2 },
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
  const [bracket, setBracket] = useState('all')
  const [view, setView] = useState('white')

  const bracketOptions = useMemo(() => {
    const brackets = [...new Set(rows?.map((r) => r.elo_bracket))].sort((a, b) => a - b)
    return [{ value: 'all', label: 'All ratings' }, ...brackets.map((b) => ({ value: String(b), label: `${b}–${b + 199}` }))]
  }, [rows])

  const fullSpec = useMemo(() => {
    let filtered = (rows ?? []).filter((r) => bracket === 'all' || r.elo_bracket === Number(bracket))
    if (view === 'favorite') {
      // Look at every game from the higher-rated side: a black favorite becomes a positive gap.
      filtered = filtered.map((r) => (r.gap < 0 ? { ...r, gap: -r.gap, white: r.black, black: r.white } : r))
    }
    const values = sumResults(filtered, 'gap')
      .filter((r) => r.games >= MIN_GAMES)
      .map((r) => {
        const score = (r.white + r.draw / 2) / r.games
        // Normal-approximation 95% interval for the mean score.
        const half = 1.96 * Math.sqrt((score * (1 - score)) / r.games)
        return { ...r, score, lo: score - half, hi: score + half, expected: 1 / (1 + 10 ** (-r.gap / 400)) }
      })
    return { ...spec, data: { values } } as VisualizationSpec
  }, [rows, bracket, view])

  return (
    <TabSection
      title="Does the higher-rated player win as often as predicted?"
      description={`Actual score by rating gap (with a 95% interval) against what the Elo formula expects. Gap = white − black, in 25-point bins; bins with fewer than ${MIN_GAMES} games are hidden. The bars below show how many games each gap has.`}
      controls={
        <>
          <SegmentedControl data={VIEWS} value={view} onChange={setView} />
          <Select
            data={bracketOptions}
            value={bracket}
            onChange={(v) => setBracket(v ?? 'all')}
            allowDeselect={false}
            w={180}
            aria-label="Elo bracket"
          />
        </>
      }
      loading={!rows}
    >
      <VegaEmbed spec={fullSpec} />
    </TabSection>
  )
}
