import { useCallback, useMemo, useRef, useState } from 'react'
import { SegmentedControl } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { VegaEmbed } from 'react-vega'
import type { Result, VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { ACCENT, CONTEXT, DIMMED, INK, MIN_BRACKET_GAMES, MIN_GAMES, RESULT_MARK, bracketLabelExpr } from '../lib/chess'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'

type Row = { elo_bracket: number; opening: string; moves: number; ending: string; games: number }
type Picks = { bracket: number | null; opening: string | null }

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
const endingOrder = { calculate: `indexof(${JSON.stringify(ENDINGS)}, datum.ending)`, as: 'order' }
const OTHER = 'Other openings'

// The last bin is open-ended (every game of 100+ moves), so it isn't as wide as the others.
// It gets a dashed outline and a gap before it, so its count isn't read as one more 5-move bin.
const OPEN_BIN = 100
const movesLabel = `datum.moves === ${OPEN_BIN} ? '100 or more (all longer games)' : datum.moves + '–' + (datum.moves + 4)`

/** Share of each ending within `field`. A share of few games looks like a finding but is mostly noise. */
const sharesBy = (field: string) => [
  { aggregate: [{ op: 'sum', field: 'games', as: 'games' }], groupby: [field, 'ending'] },
  { joinaggregate: [{ op: 'sum', field: 'games', as: 'total' }], groupby: [field] },
  { filter: `datum.total >= ${MIN_BRACKET_GAMES}` },
  { calculate: 'datum.games / datum.total', as: 'share' },
  endingOrder,
]

const shareX = { field: 'games', type: 'quantitative', stack: 'normalize', title: 'Share of games', axis: { format: '%' } } as const

// Vega-Lite's width: 'container' doesn't work in a concat, so panel widths are pixels measured
// from the page: the container minus what the axes, labels and gaps between panels take.
const BRACKET_AXIS = 75 // y axis of the rating panel (labels + title)
const OPENING_AXIS = 150 // y axis of the opening panel (opening names)
const LENGTH_AXIS = 70 // y axis of the length panel
const PANEL_GAP = 20 // Vega-Lite's default concat spacing
const SIDE_BY_SIDE = 720 // below this container width, the two top panels are stacked

function panelWidths(container: number) {
  const sideBySide = container >= SIDE_BY_SIDE
  if (!sideBySide) {
    // Stacked panels are left-aligned, so all of them leave room for the widest axis.
    const width = Math.max(120, container - OPENING_AXIS)
    return { sideBySide, top: width, length: width }
  }
  const top = Math.floor((container - BRACKET_AXIS - OPENING_AXIS - PANEL_GAP) / 2)
  return { sideBySide, top, length: container - Math.max(BRACKET_AXIS, LENGTH_AXIS) }
}

const makeSpec = (normalize: boolean, openings: string[], picks: Picks, container: number) => {
  const w = panelWidths(container)
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    data: { name: 'table' }, // placeholder, filled in below
    // On narrow screens the legend of the four endings wraps onto two rows.
    config: { legend: { columns: w.sideBySide ? 4 : 2 } },
    vconcat: [
      {
        [w.sideBySide ? 'hconcat' : 'vconcat']: [
          {
            title: 'By rating (click to filter)',
            width: w.top,
            height: 300,
            params: [
              {
                name: 'pickBracket',
                select: { type: 'point', fields: ['elo_bracket'] },
                ...(picks.bracket !== null && { value: [{ elo_bracket: picks.bracket }] }),
              },
            ],
            transform: [
              { filter: { param: 'pickOpening', empty: true } },
              ...sharesBy('elo_bracket'),
              { calculate: bracketLabelExpr('datum.elo_bracket'), as: 'bracket_label' },
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
              x: shareX,
              color: ending,
              order: { field: 'order' },
              opacity: { condition: { param: 'pickBracket', value: 1 }, value: DIMMED },
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
            title: 'By opening (click to filter)',
            width: w.top,
            height: 300,
            params: [
              {
                name: 'pickOpening',
                select: { type: 'point', fields: ['opening'] },
                ...(picks.opening !== null && { value: [{ opening: picks.opening }] }),
              },
            ],
            transform: [{ filter: { param: 'pickBracket', empty: true } }, ...sharesBy('opening')],
            mark: { ...RESULT_MARK, cursor: 'pointer' },
            encoding: {
              // A fixed order, so the rows don't jump around when a bracket is picked.
              y: { field: 'opening', type: 'nominal', title: null, scale: { domain: openings } },
              x: shareX,
              color: ending,
              order: { field: 'order' },
              opacity: { condition: { param: 'pickOpening', value: 1 }, value: DIMMED },
              tooltip: [
                { field: 'opening', title: 'Opening' },
                { field: 'ending', title: 'Ending' },
                { field: 'share', title: 'Share', format: '.1%' },
                { field: 'games', title: 'Games', format: ',' },
                { field: 'total', title: 'Games of this opening', format: ',' },
              ],
            },
          },
        ],
      },
      {
        title: w.sideBySide
        ? 'By game length, for the rating and opening picked above'
        : ['By game length, for the rating', 'and opening picked above'],
        width: w.length,
        height: 260,
        transform: [
          { filter: { param: 'pickBracket', empty: true } },
          { filter: { param: 'pickOpening', empty: true } },
          { aggregate: [{ op: 'sum', field: 'games', as: 'games' }], groupby: ['moves', 'ending'] },
          { joinaggregate: [{ op: 'sum', field: 'games', as: 'bin_games' }], groupby: ['moves'] },
          // One game in a bin would otherwise draw a full-height bar of a single ending.
          ...(normalize ? [{ filter: `datum.bin_games >= ${MIN_GAMES}` }] : []),
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
  } as VisualizationSpec
}

export default function GameEndings() {
  const rows = useData<Row[]>('game_endings.json')
  const [scale, setScale] = useState('count')
  const { inRange } = useEloFilter()
  // Any change to the spec re-embeds the chart, which would drop what was clicked. So the
  // clicks are kept here (a ref: they don't need a render) and passed back in the new spec.
  const picks = useRef<Picks>({ bracket: null, opening: null })

  const { ref, width: container } = useElementSize()

  const fullSpec = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of rows ?? []) totals.set(r.opening, (totals.get(r.opening) ?? 0) + r.games)
    const openings = [...totals]
      .filter(([name]) => name !== OTHER)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
    if (totals.has(OTHER)) openings.push(OTHER)

    // Read on purpose without a dependency: a click must not cause a re-embed by itself.
    /* oxlint-disable react/refs */
    const { bracket, opening } = picks.current
    // A bracket the Elo filter just removed would leave every chart empty.
    const kept = { opening, bracket: bracket !== null && inRange(bracket) ? bracket : null }
    const spec = makeSpec(scale === 'share', openings, kept, container)
    /* oxlint-enable react/refs */
    return {
      ...spec,
      data: { values: (rows ?? []).filter((r) => inRange(r.elo_bracket)) },
    } as VisualizationSpec
  }, [rows, scale, inRange, container])

  const onEmbed = useCallback(({ view }: Result) => {
    view.addSignalListener('pickBracket', (_, value) => {
      picks.current.bracket = value?.elo_bracket?.[0] ?? null
    })
    view.addSignalListener('pickOpening', (_, value) => {
      picks.current.opening = value?.opening?.[0] ?? null
    })
  }, [])

  return (
    <TabSection
      title="How do games end?"
      description={`In 3-minute games many are decided by the clock, not the board. A decisive game that ends without mate or a flag counts as a resignation. Click a rating or an opening to filter the other charts; click empty space in that chart to reset it. Groups with fewer than ${MIN_BRACKET_GAMES} games are left out of the top charts, and lengths with fewer than ${MIN_GAMES} from the share view.`}
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
      <div ref={ref}>
        {container > 0 && <VegaEmbed spec={fullSpec} onEmbed={onEmbed} style={{ width: '100%' }} />}
      </div>
    </TabSection>
  )
}
