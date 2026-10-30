import { useMemo, useState } from 'react'
import { SegmentedControl } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { ACCENT, CONTEXT, DIMMED, INK, bracketLabelExpr } from '../lib/chess'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'

type Row = { elo_bracket: number; moves: number; termination: string; games: number }

// Time forfeits are the subject, so they get the accent; other endings stay as context.
const termination = {
  field: 'termination',
  type: 'nominal',
  title: null,
  scale: { domain: ['Time forfeit', 'Normal'], range: [ACCENT, CONTEXT] },
  legend: { orient: 'top', labelExpr: "datum.value === 'Normal' ? 'Checkmate, resignation, draw' : datum.value" },
} as const

// The last bin is open-ended (every game of 100+ moves), so it isn't as wide as the others.
// It gets a dashed outline and a gap before it, so its count isn't read as one more 5-move bin.
const OPEN_BIN = 100
const movesLabel = `datum.moves === ${OPEN_BIN} ? '100 or more (all longer games)' : datum.moves + '–' + (datum.moves + 4)`

const makeSpec = (normalize: boolean): VisualizationSpec => ({
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  hconcat: [
    {
      title: 'Lost on time, by rating (click to filter)',
      width: 260,
      height: 320,
      params: [{ name: 'pick', select: { type: 'point', fields: ['elo_bracket'] } }],
      transform: [
        { calculate: "datum.termination === 'Time forfeit' ? datum.games : 0", as: 'flagged' },
        { aggregate: [{ op: 'sum', field: 'games', as: 'total' }, { op: 'sum', field: 'flagged', as: 'flagged' }], groupby: ['elo_bracket'] },
        { calculate: 'datum.flagged / datum.total', as: 'share' },
        { calculate: bracketLabelExpr('datum.elo_bracket'), as: 'bracket_label' },
      ],
      mark: { type: 'bar', color: ACCENT, cornerRadiusEnd: 4, cursor: 'pointer' },
      encoding: {
        y: {
          field: 'elo_bracket',
          type: 'ordinal',
          title: 'Average Elo',
          sort: 'descending',
          axis: { labelExpr: bracketLabelExpr('datum.value', false) },
        },
        x: { field: 'share', type: 'quantitative', title: 'Share of games ending on time', axis: { format: '%' } },
        opacity: { condition: { param: 'pick', value: 1 }, value: DIMMED },
        tooltip: [
          { field: 'bracket_label', title: 'Elo bracket' },
          { field: 'share', title: 'Ended on time', format: '.1%' },
          { field: 'flagged', title: 'Time forfeits', format: ',' },
          { field: 'total', title: 'Games', format: ',' },
        ],
      },
    },
    {
      title: 'How games end, by length',
      width: 420,
      height: 320,
      transform: [
        { filter: { param: 'pick', empty: true } },
        { aggregate: [{ op: 'sum', field: 'games', as: 'games' }], groupby: ['moves', 'termination'] },
        { joinaggregate: [{ op: 'sum', field: 'games', as: 'bin_games' }], groupby: ['moves'] },
        { calculate: 'datum.games / datum.bin_games', as: 'share' },
        { calculate: movesLabel, as: 'moves_label' },
      ],
      mark: { type: 'bar', strokeWidth: 1 },
      encoding: {
        x: {
          field: 'moves',
          type: 'ordinal',
          title: 'Game length (full moves; last bar: 100 or more)',
          // A blank slot before the open bin separates it from the regular ones.
          scale: { domain: [...Array.from({ length: OPEN_BIN / 5 }, (_, i) => i * 5), -1, OPEN_BIN] },
          axis: {
            labelExpr: `datum.value === ${OPEN_BIN} ? '100+' : datum.value < 0 ? '' : datum.value`,
            labelAngle: 0,
            labelOverlap: true,
            ticks: false,
          },
        },
        stroke: { condition: { test: `datum.moves === ${OPEN_BIN}`, value: INK }, value: 'white' },
        strokeDash: { condition: { test: `datum.moves === ${OPEN_BIN}`, value: [3, 2] }, value: [1, 0] },
        y: {
          field: 'games',
          type: 'quantitative',
          stack: normalize ? 'normalize' : 'zero',
          title: normalize ? 'Share of games' : 'Games',
          axis: normalize ? { format: '%' } : {},
        },
        color: termination,
        order: { field: 'termination', sort: 'descending' },
        tooltip: [
          { field: 'moves_label', title: 'Moves' },
          { field: 'termination', title: 'Ending' },
          { field: 'games', title: 'Games', format: ',' },
          { field: 'share', title: 'Share of this length', format: '.1%' },
        ],
      },
    },
  ],
})

export default function TimeForfeits() {
  const rows = useData<Row[]>('time_forfeits.json')
  const [scale, setScale] = useState('count')
  const { inRange } = useEloFilter()

  const fullSpec = useMemo(
    () =>
      ({
        ...makeSpec(scale === 'share'),
        data: { values: (rows ?? []).filter((r) => inRange(r.elo_bracket)) },
      }) as VisualizationSpec,
    [rows, scale, inRange],
  )

  return (
    <TabSection
      title="Who runs out of time?"
      description="In 3-minute games many are decided by the clock, not the board. Click an Elo bracket to see how its games end by length; click empty space to reset."
      controls={
        <SegmentedControl
          data={[
            { value: 'count', label: 'Game counts' },
            { value: 'share', label: 'Share per length' },
          ]}
          value={scale}
          onChange={setScale}
        />
      }
      loading={!rows}
    >
      <VegaEmbed spec={fullSpec} />
    </TabSection>
  )
}
