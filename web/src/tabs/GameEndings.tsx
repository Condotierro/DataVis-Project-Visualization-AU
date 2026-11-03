import { useMemo, useState } from 'react'
import { SegmentedControl } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { ACCENT, CONTEXT, DIMMED, INK, RESULT_MARK, bracketLabelExpr } from '../lib/chess'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'

type Row = { elo_bracket: number; moves: number; ending: string; games: number }

// Stack order: checkmates and time forfeits sit at the two ends of a full bar, so both
// are read from a common baseline. Time forfeits keep the accent; the rest is a grey ramp.
const ENDINGS = ['Checkmate', 'Resignation', 'Draw', 'Time forfeit']
const ending = {
  field: 'ending',
  type: 'nominal',
  title: null,
  scale: { domain: ENDINGS, range: [INK, '#9a978e', CONTEXT, ACCENT] },
  legend: { orient: 'top' },
} as const
// A share of so few games looks like a finding but is mostly noise (2800+ has 54 games).
const MIN_BRACKET_GAMES = 100
const endingOrder = { calculate: `indexof(${JSON.stringify(ENDINGS)}, datum.ending)`, as: 'order' }

// The last bin is open-ended (every game of 100+ moves), so it isn't as wide as the others.
// It gets a dashed outline and a gap before it, so its count isn't read as one more 5-move bin.
const OPEN_BIN = 100
const movesLabel = `datum.moves === ${OPEN_BIN} ? '100 or more (all longer games)' : datum.moves + '–' + (datum.moves + 4)`

const makeSpec = (normalize: boolean): VisualizationSpec => ({
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  hconcat: [
    {
      title: 'How games end, by rating (click to filter)',
      width: 340,
      height: 320,
      params: [{ name: 'pick', select: { type: 'point', fields: ['elo_bracket'] } }],
      transform: [
        { aggregate: [{ op: 'sum', field: 'games', as: 'games' }], groupby: ['elo_bracket', 'ending'] },
        { joinaggregate: [{ op: 'sum', field: 'games', as: 'total' }], groupby: ['elo_bracket'] },
        { filter: `datum.total >= ${MIN_BRACKET_GAMES}` },
        { calculate: 'datum.games / datum.total', as: 'share' },
        { calculate: bracketLabelExpr('datum.elo_bracket'), as: 'bracket_label' },
        endingOrder,
      ],
      mark: { ...RESULT_MARK, cursor: 'pointer' },
      encoding: {
        y: {
          field: 'elo_bracket',
          type: 'ordinal',
          title: 'Average Elo',
          sort: 'descending',
          axis: { labelExpr: bracketLabelExpr('datum.value', false) },
        },
        x: { field: 'games', type: 'quantitative', stack: 'normalize', title: 'Share of games', axis: { format: '%' } },
        color: ending,
        order: { field: 'order' },
        opacity: { condition: { param: 'pick', value: 1 }, value: DIMMED },
        tooltip: [
          { field: 'bracket_label', title: 'Elo bracket' },
          { field: 'ending', title: 'Ending' },
          { field: 'share', title: 'Share', format: '.1%' },
          { field: 'games', title: 'Games', format: ',' },
          { field: 'total', title: 'Games in bracket', format: ',' },
        ],
      },
    },
    {
      title: 'How games end, by length',
      width: 420,
      height: 320,
      transform: [
        { filter: { param: 'pick', empty: true } },
        { aggregate: [{ op: 'sum', field: 'games', as: 'games' }], groupby: ['moves', 'ending'] },
        { joinaggregate: [{ op: 'sum', field: 'games', as: 'bin_games' }], groupby: ['moves'] },
        { calculate: 'datum.games / datum.bin_games', as: 'share' },
        { calculate: movesLabel, as: 'moves_label' },
        endingOrder,
      ],
      mark: RESULT_MARK,
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
        strokeDash: { condition: { test: `datum.moves === ${OPEN_BIN}`, value: [3, 2] }, value: [1, 0] },
        y: {
          field: 'games',
          type: 'quantitative',
          stack: normalize ? 'normalize' : 'zero',
          title: normalize ? 'Share of games' : 'Games',
          axis: normalize ? { format: '%' } : {},
        },
        color: ending,
        order: { field: 'order' },
        tooltip: [
          { field: 'moves_label', title: 'Moves' },
          { field: 'ending', title: 'Ending' },
          { field: 'games', title: 'Games', format: ',' },
          { field: 'share', title: 'Share of this length', format: '.1%' },
        ],
      },
    },
  ],
})

export default function GameEndings() {
  const rows = useData<Row[]>('game_endings.json')
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
      title="How do games end?"
      description={`In 3-minute games many are decided by the clock, not the board. A decisive game that ends without mate or a flag counts as a resignation. Elo brackets with fewer than ${MIN_BRACKET_GAMES} games are left out of the left chart. Click a bracket to see how its games end by length; click empty space to reset.`}
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
