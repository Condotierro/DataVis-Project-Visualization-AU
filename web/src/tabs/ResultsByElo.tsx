import { useMemo, useState } from 'react'
import { SegmentedControl } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { resultColor, sumResults, toResultRows } from '../lib/chess'
import { TabSection } from '../lib/TabSection'

type Row = { elo_bracket: number; time_class: string; games: number; white: number; draw: number; black: number }

const TIME_CLASSES = ['bullet', 'blitz', 'rapid', 'classical']

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  width: 'container',
  height: 360,
  mark: { type: 'bar', stroke: 'white', strokeWidth: 2 },
  encoding: {
    x: { field: 'elo_bracket', type: 'ordinal', title: 'Average Elo of both players (bracket start)' },
    y: { field: 'count', type: 'quantitative', stack: 'normalize', title: 'Share of games', axis: { format: '%' } },
    color: resultColor,
    order: { field: 'order' },
    tooltip: [
      { field: 'elo_bracket', title: 'Elo bracket' },
      { field: 'result', title: 'Result' },
      { field: 'share', title: 'Share', format: '.1%' },
      { field: 'count', title: 'Games', format: ',' },
      { field: 'games', title: 'Games in bracket', format: ',' },
    ],
  },
}

export default function ResultsByElo() {
  const rows = useData<Row[]>('results_by_elo.json')
  const [timeClass, setTimeClass] = useState('all')

  const fullSpec = useMemo(() => {
    const filtered = (rows ?? []).filter((r) => timeClass === 'all' || r.time_class === timeClass)
    const values = toResultRows(sumResults(filtered, 'elo_bracket'))
    return { ...spec, data: { values } } as VisualizationSpec
  }, [rows, timeClass])

  // Only offer the time classes the current sample actually contains.
  const present = TIME_CLASSES.filter((tc) => rows?.some((r) => r.time_class === tc))

  return (
    <TabSection
      title="Who wins, by rating?"
      description="Share of white wins, draws and black wins for each Elo bracket. Hover a segment for counts."
      controls={
        present.length > 1 && (
          <SegmentedControl data={['all', ...present]} value={timeClass} onChange={setTimeClass} />
        )
      }
      loading={!rows}
    >
      <VegaEmbed spec={fullSpec} style={{ width: '100%' }} />
    </TabSection>
  )
}
