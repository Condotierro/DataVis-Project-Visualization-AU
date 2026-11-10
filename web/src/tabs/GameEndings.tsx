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

// Game length, in 5-move bins. The axis ends where the games do: past the last bin, at most
// TAIL of all games are left (a handful of very long games, up to ~185 moves, too few to see
// as bars). They are left out rather than lumped into an open "N+" bin, and the description
// says how many.
const MOVES_BIN = 5
const TAIL = 0.001
const movesLabel = `datum.moves + '–' + (datum.moves + ${MOVES_BIN - 1})`

/** The last length bin to plot, and how many games lie beyond it. */
function lengthCut(rows: Row[]) {
  const byBin = new Map<number, number>()
  for (const r of rows) byBin.set(r.moves, (byBin.get(r.moves) ?? 0) + r.games)
  const bins = [...byBin].sort((a, b) => a[0] - b[0])
  const total = bins.reduce((n, [, g]) => n + g, 0)
  let beyond = 0
  let i = bins.length - 1
  // Drop bins from the end while what's dropped stays within TAIL.
  while (i > 0 && beyond + bins[i][1] <= TAIL * total) beyond += bins[i--][1]
  return { last: bins[i]?.[0] ?? 0, hidden: beyond }
}

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

/**
 * Toggle expression for a single-pick point selection: clicking the picked bar again clears
 * it, and clicking another bar replaces it. Vega-Lite only toggles when this is true, and it's
 * evaluated on the click, before the selection changes, so `param` still holds the old pick.
 */
const reclickClears = (param: string, field: string) =>
  `!!datum && isArray(${param}.${field}) && indexof(${param}.${field}, datum.${field}) >= 0`

const makeSpec = (normalize: boolean, openings: string[], picks: Picks, container: number, lastBin: number) => {
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
                select: { type: 'point', fields: ['elo_bracket'], toggle: reclickClears('pickBracket', 'elo_bracket') },
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
                select: { type: 'point', fields: ['opening'], toggle: reclickClears('pickOpening', 'opening') },
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
          { filter: `datum.moves <= ${lastBin}` },
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
            title: w.sideBySide
              ? 'Game length, in moves (1 move = one turn each for white and black)'
              : ['Game length, in moves', '(1 move = one turn each for white and black)'],
            // A blank slot before the open bin separates it from the regular ones.
            // Every bin up to the cut, so a length with no games still gets its slot.
            scale: { domain: Array.from({ length: lastBin / MOVES_BIN + 1 }, (_, i) => i * MOVES_BIN) },
            axis: {
              labelAngle: 0,
              labelOverlap: true,
              ticks: false,
            },
          },
          y: {
            field: 'games',
            type: 'quantitative',
            stack: normalize ? 'normalize' : 'zero',
            title: normalize ? 'Share of games (%)' : 'Number of games',
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

  // From every game, not the Elo filter, so the axis doesn't change length as the filter moves.
  const cut = useMemo(() => lengthCut(rows ?? []), [rows])

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
    const spec = makeSpec(scale === 'share', openings, kept, container, cut.last)
    /* oxlint-enable react/refs */
    return {
      ...spec,
      data: { values: (rows ?? []).filter((r) => inRange(r.elo_bracket)) },
    } as VisualizationSpec
  }, [rows, scale, inRange, container, cut])

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
      description={`In 3-minute games many are decided by the clock, not the board. A decisive game that ends without mate or a flag counts as a resignation. Click a rating or an opening to filter the other charts; click it again, or empty space in that chart, to reset it. Groups with fewer than ${MIN_BRACKET_GAMES} games are left out of the top charts, and lengths with fewer than ${MIN_GAMES} from the share view. The length chart stops at ${cut.last + MOVES_BIN - 1} moves; the ${cut.hidden.toLocaleString('en')} longer games (under ${TAIL * 100}% of all) are too few to show.`}
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
