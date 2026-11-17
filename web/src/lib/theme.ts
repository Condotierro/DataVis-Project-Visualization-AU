import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core'
import type { EmbedOptions } from 'vega-embed'

// One palette for the UI (Mantine) and the charts (Vega), from the group's color palette
// (`color palette` at the repo root): light neutrals for the page, lichess black for the
// sidebar and text, orange for the UI's own highlights, blue for the data.

export const FONT = "'Figtree Variable', system-ui, sans-serif"

export const PAGE = '#e7e6e3' // light gray
export const PANEL = '#fefefe' // white: charts sit on this
export const TEXT = '#2a2a31' // lichess black, also the sidebar
export const MUTED = '#5b5b5a' // dark gray
export const GRID = '#ebeae7'
export const BOARD_LIGHT = '#eed7b3' // light brown
export const BOARD_DARK = '#b38865' // brown
export const ORANGE = '#e19801'
export const BLUE = '#1c77cf'
export const LIGHT_BLUE = '#64a3dd'
export const TRUE_BLUE = '#195cab'

const orange: MantineColorsTuple = [
  '#fff6e1',
  '#ffebcc',
  '#fdd59b',
  '#fbbe64',
  '#f9aa37',
  '#e19801',
  '#d3993f',
  '#b37a01',
  '#9c6a00',
  '#875b00',
]

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
  colors: { orange },
  primaryColor: 'orange',
  primaryShade: 7, // orange brown: white text on it stays readable
  defaultRadius: 'md',
  black: TEXT,
  white: PANEL,
  components: {
    Paper: { defaultProps: { bg: PANEL } },
  },
})

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': PAGE,
    '--mantine-color-text': TEXT,
    '--mantine-color-dimmed': MUTED,
  },
  dark: {},
})

// Vega-Lite's config for every chart, so they share the page's type and colors.
const label = { labelColor: MUTED, titleColor: TEXT, labelFont: FONT, titleFont: FONT }
export const VEGA_OPTIONS: EmbedOptions = {
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
      domainColor: '#b9b8b5',
      tickColor: '#b9b8b5',
    },
    // Outlined swatches, like the bars, so the near-white one doesn't vanish into the panel.
    legend: {
      ...label,
      labelFontSize: 12,
      titleFontSize: 12,
      titleFontWeight: 600,
      symbolStrokeColor: MUTED,
      symbolStrokeWidth: 0.75,
    },
    title: { color: TEXT, font: FONT, fontSize: 14, fontWeight: 700, anchor: 'start' },
    text: { font: FONT, color: TEXT },
  },
}
