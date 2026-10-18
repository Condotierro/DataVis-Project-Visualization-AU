import type { ComponentType } from 'react'
import ResultsByElo from './ResultsByElo'
import Openings from './Openings'
import BoardHeatmap from './BoardHeatmap'

// To add a visualization: copy _Template.tsx, then add one line here.
// `id` becomes the URL hash (e.g. .../#openings), so tabs can be linked directly.
export const tabs: { id: string; title: string; component: ComponentType }[] = [
  { id: 'results', title: 'Results by Elo', component: ResultsByElo },
  { id: 'openings', title: 'Openings', component: Openings },
  { id: 'board', title: 'Board heatmap', component: BoardHeatmap },
]
