import { useMemo, useState } from 'react'
import { Select } from '@mantine/core'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { resultColor, sumResults, toResultRows } from '../lib/chess'
import { TabSection } from '../lib/TabSection'

type Row = { opening_family: string; elo_bracket: number; games: number; white: number; draw: number; black: number }

const sortByPopularity = { field: 'games', op: 'max', order: 'descending' } as const

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  spacing: 8,
  hconcat: [
    {
      title: 'Games played',
      width: 220,
      height: { step: 22 },
      transform: [{ filter: 'datum.order === 0' }],
      mark: { type: 'bar', color: '#2a78d6', cornerRadiusEnd: 4 },
      encoding: {
        y: { field: 'opening_family', type: 'nominal', title: null, sort: sortByPopularity },
        x: { field: 'games', type: 'quantitative', title: 'Games' },
        tooltip: [
          { field: 'opening_family', title: 'Opening' },
          { field: 'games', title: 'Games', format: ',' },
        ],
      },
    },
    {
      title: 'Result share',
      width: 320,
      height: { step: 22 },
      mark: { type: 'bar', stroke: 'white', strokeWidth: 2 },
      encoding: {
        y: { field: 'opening_family', type: 'nominal', title: null, sort: sortByPopularity, axis: null },
        x: { field: 'count', type: 'quantitative', stack: 'normalize', title: 'Share', axis: { format: '%' } },
        color: resultColor,
        order: { field: 'order' },
        tooltip: [
          { field: 'opening_family', title: 'Opening' },
          { field: 'result', title: 'Result' },
          { field: 'share', title: 'Share', format: '.1%' },
          { field: 'count', title: 'Games', format: ',' },
        ],
      },
    },
  ],
}

export default function Openings() {
  const rows = useData<Row[]>('openings_by_elo.json')
  const [bracket, setBracket] = useState<string>('all')

  const bracketOptions = useMemo(() => {
    const brackets = [...new Set(rows?.map((r) => r.elo_bracket))].sort((a, b) => a - b)
    return [{ value: 'all', label: 'All ratings' }, ...brackets.map((b) => ({ value: String(b), label: `${b}–${b + 199}` }))]
  }, [rows])

  const fullSpec = useMemo(() => {
    const filtered = (rows ?? []).filter((r) => bracket === 'all' || r.elo_bracket === Number(bracket))
    const values = toResultRows(sumResults(filtered, 'opening_family'))
    return { ...spec, data: { values } } as VisualizationSpec
  }, [rows, bracket])

  return (
    <TabSection
      title="Openings"
      description="The most played opening families and how they turn out. Filter by Elo bracket to compare skill levels."
      controls={
        <Select
          label="Elo bracket"
          data={bracketOptions}
          value={bracket}
          onChange={(v) => setBracket(v ?? 'all')}
          allowDeselect={false}
          w={180}
        />
      }
      loading={!rows}
    >
      <VegaEmbed spec={fullSpec} />
    </TabSection>
  )
}
