import { useMemo, useState } from 'react'
import { Group, RangeSlider, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import {
  ACCENT,
  DIMMED,
  ELO_BANDS,
  RESULT_MARK,
  bandIndex,
  bracketLabel,
  resultColor,
  shareWithCI,
  sumResults,
  toResultRows,
} from '../lib/chess'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'
import { VEGA_OPTIONS } from '../lib/theme'

type Row = { elo_bracket: number; time_class: string; games: number; white: number; draw: number; black: number }

const TIME_CLASSES = ['bullet', 'blitz', 'rapid', 'classical']

// Brackets with fewer games get confidence intervals too wide to read (±3 points and more).
const MIN_DRAW_GAMES = 1000

const FULL: [number, number] = [0, 100]

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  width: 'container',
  height: 360,
  // clip: when the y axis is zoomed, bars are cut at the plot's edges instead of spilling out.
  mark: { ...RESULT_MARK, clip: true },
  encoding: {
    x: {
      field: 'band',
      type: 'ordinal',
      sort: ELO_BANDS.map((b) => b.label),
      title: 'Average Elo of both players',
      axis: { labelAngle: 0 },
    },
    y: { field: 'count', type: 'quantitative', stack: 'normalize', title: 'Share of games', axis: { format: '%' } },
    color: resultColor,
    order: { field: 'order' },
    // The x axis is Elo itself, so brackets outside the global filter are dimmed, not removed.
    opacity: { condition: { test: 'datum.inRange', value: 1 }, value: DIMMED },
    tooltip: [
      { field: 'band', title: 'Elo range' },
      { field: 'result', title: 'Result' },
      { field: 'share', title: 'Share', format: '.1%' },
      { field: 'count', title: 'Games', format: ',' },
      { field: 'games', title: 'Games in range', format: ',' },
    ],
  },
}

// Draw rate per 200-wide bracket. x is the bracket's midpoint, so each point sits in the
// middle of its column between gridlines at the bracket edges.
const drawX = {
  field: 'mid',
  type: 'quantitative',
  title: 'Average Elo of both players',
  axis: { format: 'd', labelExpr: "datum.value % 400 == 0 ? datum.label : ''" },
} as const
const drawY = { field: 'share', type: 'quantitative', title: 'Games drawn', axis: { format: '%' } } as const
const drawOpacity = { condition: { test: 'datum.inRange', value: 1 }, value: DIMMED }
const drawTooltip = [
  { field: 'label', title: 'Elo range' },
  { field: 'share', title: 'Draw rate', format: '.1%' },
  { field: 'lo', title: '95% CI from', format: '.1%' },
  { field: 'hi', title: '95% CI to', format: '.1%' },
  { field: 'games', title: 'Games', format: ',' },
]
const drawSpec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' },
  width: 'container',
  height: 260,
  encoding: { x: drawX, y: drawY },
  layer: [
    { mark: { type: 'line', color: ACCENT, strokeWidth: 2, opacity: 0.6 } },
    {
      mark: { type: 'rule', color: ACCENT, strokeWidth: 2, opacity: 0.55 },
      encoding: { y: { ...drawY, field: 'lo' }, y2: { field: 'hi' }, opacity: drawOpacity, tooltip: drawTooltip },
    },
    {
      mark: { type: 'point', filled: true, color: ACCENT, size: 70 },
      encoding: {
        opacity: drawOpacity,
        tooltip: drawTooltip,
      },
    },
  ],
}

export default function ResultsByElo() {
  const rows = useData<Row[]>('results_by_elo.json')
  const [timeClass, setTimeClass] = useState('all')
  // The slider moves `zoomDraft` while dragging; the chart only re-embeds on release.
  const [zoomDraft, setZoomDraft] = useState(FULL)
  const [zoom, setZoom] = useState(FULL)
  const { range, inRange } = useEloFilter()
  const zoomed = zoom[0] > 0 || zoom[1] < 100

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => timeClass === 'all' || r.time_class === timeClass),
    [rows, timeClass],
  )

  const fullSpec = useMemo(() => {
    const banded = filtered.map((r) => ({ ...r, band: ELO_BANDS[bandIndex(r.elo_bracket)].label }))
    // The Elo filter snaps to these same ranges, so a range is either wholly in or out.
    const bandsInRange = new Set(banded.filter((r) => inRange(r.elo_bracket)).map((r) => r.band))
    const values = toResultRows(sumResults(banded, 'band')).map((r) => ({ ...r, inRange: bandsInRange.has(r.band) }))
    const y = { ...(spec as { encoding: { y: object } }).encoding.y, scale: { domain: [zoom[0] / 100, zoom[1] / 100] } }
    return { ...spec, data: { values }, encoding: { ...(spec as { encoding: object }).encoding, y } } as VisualizationSpec
  }, [filtered, inRange, zoom])

  const drawFullSpec = useMemo(() => {
    const values = sumResults(filtered, 'elo_bracket')
      .filter((r) => r.games >= MIN_DRAW_GAMES)
      .sort((a, b) => a.elo_bracket - b.elo_bracket)
      .map((r) => ({
        ...shareWithCI(r.draw, r.games),
        mid: r.elo_bracket + 100,
        label: bracketLabel(r.elo_bracket),
        games: r.games,
        inRange: inRange(r.elo_bracket),
      }))
    // Gridlines on every bracket edge, so the axis matches the data's own bins.
    const edges = values.length ? [values[0].mid - 100, ...values.map((v) => v.mid + 100)] : []
    const x = { ...drawX, scale: { domain: [edges[0], edges.at(-1)] }, axis: { ...drawX.axis, values: edges } }
    return {
      ...drawSpec,
      data: { values },
      encoding: { ...(drawSpec as { encoding: object }).encoding, x },
    } as VisualizationSpec
  }, [filtered, inRange])

  // Only offer the time classes the current sample actually contains.
  const present = TIME_CLASSES.filter((tc) => rows?.some((r) => r.time_class === tc))

  return (
    <TabSection
      title="Who wins, by rating?"
      description={`Share of white wins, draws and black wins for each Elo range. Hover a segment for counts. Use the slider to zoom the y axis on the small differences.${range ? ' Ranges outside the Elo filter are dimmed.' : ''}`}
      controls={
        <>
          {present.length > 1 && (
            <SegmentedControl data={['all', ...present]} value={timeClass} onChange={setTimeClass} />
          )}
          <Group gap="sm" wrap="nowrap" w={340} maw="100%">
            <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
              Y axis
            </Text>
            <RangeSlider
              flex={1}
              min={0}
              max={100}
              step={1}
              minRange={5}
              value={zoomDraft}
              onChange={setZoomDraft}
              onChangeEnd={setZoom}
              label={(v) => `${v}%`}
              marks={[0, 25, 50, 75, 100].map((v) => ({ value: v, label: `${v}%` }))}
            />
          </Group>
        </>
      }
      loading={!rows}
    >
      {zoomed && (
        <Text size="sm" c="orange.8" fw={600}>
          Zoomed to {zoom[0]}%–{zoom[1]}%. Bars no longer start at 0, so compare where the boundaries sit, not the bar
          lengths.{' '}
          <Text
            span
            inherit
            td="underline"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setZoom(FULL)
              setZoomDraft(FULL)
            }}
          >
            Reset
          </Text>
        </Text>
      )}
      <VegaEmbed spec={fullSpec} options={VEGA_OPTIONS} style={{ width: '100%' }} />
      <Stack gap={4} mt="lg">
        <Title order={4}>Draws become more common with rating</Title>
        <Text size="sm" c="dimmed">
          Share of games drawn per 200-Elo bracket. Bars show the 95% confidence interval. Brackets with fewer than{' '}
          {MIN_DRAW_GAMES.toLocaleString()} games are hidden.
        </Text>
      </Stack>
      <VegaEmbed spec={drawFullSpec} options={VEGA_OPTIONS} style={{ width: '100%' }} />
    </TabSection>
  )
}
