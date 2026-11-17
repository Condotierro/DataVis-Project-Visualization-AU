import { useMemo, useState } from 'react'
import { SegmentedControl } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { DIMMED, ELO_BANDS, RESULT_MARK, bandIndex, resultColor, sumResults, toResultRows } from '../lib/chess'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'
import { VEGA_OPTIONS } from '../lib/theme'

type Row = { elo_bracket: number; time_class: string; games: number; white: number; draw: number; black: number }

const TIME_CLASSES = ['bullet', 'blitz', 'rapid', 'classical']

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  width: 'container',
  height: 360,
  mark: RESULT_MARK,
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

export default function ResultsByElo() {
  const rows = useData<Row[]>('results_by_elo.json')
  const [timeClass, setTimeClass] = useState('all')
  const { range, inRange } = useEloFilter()

  const fullSpec = useMemo(() => {
    const filtered = (rows ?? []).filter((r) => timeClass === 'all' || r.time_class === timeClass)
    const banded = filtered.map((r) => ({ ...r, band: ELO_BANDS[bandIndex(r.elo_bracket)].label }))
    // The Elo filter snaps to these same ranges, so a range is either wholly in or out.
    const bandsInRange = new Set(banded.filter((r) => inRange(r.elo_bracket)).map((r) => r.band))
    const values = toResultRows(sumResults(banded, 'band')).map((r) => ({ ...r, inRange: bandsInRange.has(r.band) }))
    return { ...spec, data: { values } } as VisualizationSpec
  }, [rows, timeClass, inRange])

  // Only offer the time classes the current sample actually contains.
  const present = TIME_CLASSES.filter((tc) => rows?.some((r) => r.time_class === tc))

  return (
    <TabSection
      title="Who wins, by rating?"
      description={`Share of white wins, draws and black wins for each Elo range. Hover a segment for counts.${range ? ' Ranges outside the Elo filter are dimmed.' : ''}`}
      controls={
        present.length > 1 && (
          <SegmentedControl data={['all', ...present]} value={timeClass} onChange={setTimeClass} />
        )
      }
      loading={!rows}
    >
      <VegaEmbed spec={fullSpec} options={VEGA_OPTIONS} style={{ width: '100%' }} />
    </TabSection>
  )
}
