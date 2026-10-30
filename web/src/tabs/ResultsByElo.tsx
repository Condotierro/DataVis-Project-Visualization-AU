import { useMemo, useState } from 'react'
import { SegmentedControl } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { DIMMED, RESULT_MARK, bracketLabel, bracketLabelExpr, resultColor, sumResults, toResultRows } from '../lib/chess'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'

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
      field: 'elo_bracket',
      type: 'ordinal',
      title: 'Average Elo of both players',
      axis: { labelExpr: bracketLabelExpr('datum.value', false), labelAngle: 0 },
    },
    y: { field: 'count', type: 'quantitative', stack: 'normalize', title: 'Share of games', axis: { format: '%' } },
    color: resultColor,
    order: { field: 'order' },
    // The x axis is Elo itself, so brackets outside the global filter are dimmed, not removed.
    opacity: { condition: { test: 'datum.inRange', value: 1 }, value: DIMMED },
    tooltip: [
      { field: 'bracket_label', title: 'Elo bracket' },
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
  const { range, inRange } = useEloFilter()

  const fullSpec = useMemo(() => {
    const filtered = (rows ?? []).filter((r) => timeClass === 'all' || r.time_class === timeClass)
    const values = toResultRows(sumResults(filtered, 'elo_bracket')).map((r) => ({
      ...r,
      inRange: inRange(r.elo_bracket),
      bracket_label: bracketLabel(r.elo_bracket),
    }))
    return { ...spec, data: { values } } as VisualizationSpec
  }, [rows, timeClass, inRange])

  // Only offer the time classes the current sample actually contains.
  const present = TIME_CLASSES.filter((tc) => rows?.some((r) => r.time_class === tc))

  return (
    <TabSection
      title="Who wins, by rating?"
      description={`Share of white wins, draws and black wins for each Elo bracket. Hover a segment for counts.${range ? ' Brackets outside the Elo filter are dimmed.' : ''}`}
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
