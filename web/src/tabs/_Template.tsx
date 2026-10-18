import { useMemo } from 'react'
import { VegaEmbed } from 'react-vega'
import type { VisualizationSpec } from 'vega-embed'
import { useData } from '../lib/data'
import { TabSection } from '../lib/TabSection'

// Copy this file to start a new visualization, then register it in ./index.ts.
// Not registered itself, so it doesn't show up in the app.
//
// Specs are plain Vega-Lite: try them in https://vega.github.io/editor first, or build
// them in Python with Altair and paste the output of `chart.to_dict()`.

type Row = { elo_bracket: number; time_class: string; games: number }

const spec: VisualizationSpec = {
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  data: { name: 'table' }, // placeholder, filled in below
  width: 'container',
  height: 300,
  mark: { type: 'bar', tooltip: true },
  encoding: {
    x: { field: 'elo_bracket', type: 'ordinal' },
    y: { field: 'games', type: 'quantitative', aggregate: 'sum' },
  },
}

export default function Template() {
  const rows = useData<Row[]>('results_by_elo.json')
  // Memoize: react-vega re-renders the chart from scratch whenever the spec object changes.
  const fullSpec = useMemo(() => ({ ...spec, data: { values: rows ?? [] } }) as VisualizationSpec, [rows])

  return (
    <TabSection title="My new visualization" description="What question does this chart answer?" loading={!rows}>
      <VegaEmbed spec={fullSpec} style={{ width: '100%' }} />
    </TabSection>
  )
}
