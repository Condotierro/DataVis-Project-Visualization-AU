import { createTheme, type MantineColorsTuple } from '@mantine/core'
import type { EmbedOptions } from 'vega-embed'

// One palette for the UI (Mantine) and the charts (Vega). It's a dark, warm board-room look:
// charcoal page, darker panels, and the green of a tournament board.

export const FONT = "'Figtree Variable', system-ui, sans-serif"

export const PAGE = '#312e2b'
export const PANEL = '#262421' // chart backgrounds sit on this
export const TEXT = '#e8e6e1'
export const MUTED = '#a19e98'
export const GRID = '#3d3a36'
export const BOARD_LIGHT = '#eeeed2'
export const BOARD_DARK = '#769656'

// Mantine's dark scale: 0 is text, 7 is the body, 8 the panels.
const dark: MantineColorsTuple = [
  TEXT,
  '#c9c6bd',
  MUTED,
  '#7c7973',
  '#4b4844',
  '#403d39',
  '#3a3733',
  PAGE,
  PANEL,
  '#1d1b19',
]

const leaf: MantineColorsTuple = [
  '#f1f8e8',
  '#e2efd2',
  '#c4dea5',
  '#a4cc76',
  '#8abd4e',
  '#7ab336',
  '#6a9f2b',
  '#5e8d24',
  '#527b1e',
  '#446816',
]
export const LEAF = leaf[4]

export const theme = createTheme({
  fontFamily: FONT,
  headings: {
    fontFamily: FONT,
    fontWeight: '800',
    sizes: {
      h1: { fontSize: '1.5rem', lineHeight: '1.1' },
      h2: { fontSize: '1.75rem', lineHeight: '1.15' },
      h4: { fontSize: '1.125rem', lineHeight: '1.3' },
    },
  },
  colors: { dark, leaf },
  primaryColor: 'leaf',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  components: {
    Paper: { defaultProps: { bg: 'dark.8' } },
  },
})

// Vega-Lite's config for every chart, so they share the page's type and colors.
const label = { labelColor: MUTED, titleColor: TEXT, labelFont: FONT, titleFont: FONT }
export const VEGA_OPTIONS: EmbedOptions = {
  tooltip: { theme: 'dark' },
  config: {
    background: null as unknown as string, // transparent: the panel shows through
    font: FONT,
    view: { stroke: null },
    axis: {
      ...label,
      labelFontSize: 12,
      titleFontSize: 12,
      titleFontWeight: 600,
      gridColor: GRID,
      domainColor: '#5a5651',
      tickColor: '#5a5651',
    },
    // Outlined swatches, like the bars, so a near-black one doesn't vanish into the panel.
    legend: { ...label, labelFontSize: 12, titleFontSize: 12, titleFontWeight: 600, symbolStrokeColor: '#7c7973', symbolStrokeWidth: 0.75 },
    title: { color: TEXT, font: FONT, fontSize: 14, fontWeight: 700, anchor: 'start' },
    text: { font: FONT, color: TEXT },
  },
}
