import { useMemo, useState } from 'react'
import { Group, Paper, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import { Chessboard } from 'react-chessboard'
import { scaleSequentialSqrt, scaleSqrt } from 'd3-scale'
import { interpolateBlues } from 'd3-scale-chromatic'
import { useData } from '../lib/data'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'

// Example of a non-Vega tab: react-chessboard draws the board, we only color the squares.

// counts[i] is the number of events on SQUARES[i]. opening_family is only in
// square_heatmap_openings.json, metric only in square_events.json.
type Row = {
  side: 'white' | 'black'
  piece: string
  elo_bracket: number
  counts: number[]
  opening_family?: string
  metric?: string
}
type Meta = { board_openings: string[] }

// Same order as SQUARES in preprocessing/aggregate.py: a1, b1, ..., h1, a2, ..., h8
const SQUARES = [...'12345678'].flatMap((rank) => [...'abcdefgh'].map((file) => file + rank))

const PIECES = [
  { value: 'all', label: 'All pieces' },
  { value: 'P', label: 'Pawn' },
  { value: 'N', label: 'Knight' },
  { value: 'B', label: 'Bishop' },
  { value: 'R', label: 'Rook' },
  { value: 'Q', label: 'Queen' },
  { value: 'K', label: 'King' },
]

const METRICS: Record<string, { label: string; noun: string; legend: string; description: string }> = {
  moves: {
    label: 'Moves',
    noun: 'moves',
    legend: 'Moves to a square',
    description:
      'Destination square of every move. Pick an opening and a piece to see where that opening sends it (all moves of those games, not only the opening moves).',
  },
  captures: {
    label: 'Captures',
    noun: 'captures',
    legend: 'Captures on a square',
    description: 'Where captures happen: the square the capturing piece lands on.',
  },
  checks: {
    label: 'Checks',
    noun: 'checks',
    legend: 'Checks from a move to a square',
    description: 'Where a checking move lands, checkmates included. Side and piece are those giving check.',
  },
  mates: {
    label: 'Checkmates',
    noun: 'checkmates',
    legend: 'Kings mated on a square',
    description:
      'Where the king stood when it was mated. Side and piece are those giving mate, so "white" shows black kings being mated.',
  },
}

const EMPTY_BOARD = '8/8/8/8/8/8/8/8 w - - 0 1'
// Readable on both light and dark heatmap cells
const NOTATION_STYLE = { color: '#fff', textShadow: '0 0 2px #000', fontWeight: 600 }

export default function BoardHeatmap() {
  const [metric, setMetric] = useState('moves')
  const [opening, setOpening] = useState('all')
  const meta = useData<Meta>('meta.json')
  const allRows = useData<Row[]>('square_heatmap.json')
  // These bigger files are only fetched once they're needed. An opening can only be combined
  // with plain moves: per-opening captures, checks and mates would add over 1 MB of data.
  const openingRows = useData<Row[]>(opening === 'all' ? null : 'square_heatmap_openings.json')
  const eventRows = useData<Row[]>(metric === 'moves' ? null : 'square_events.json')
  const rows = metric !== 'moves' ? eventRows : opening === 'all' ? allRows : openingRows
  const { noun, legend, description } = METRICS[metric]
  const [side, setSide] = useState('both')
  const [piece, setPiece] = useState('all')
  const [hovered, setHovered] = useState<string | null>(null)
  const { inRange } = useEloFilter()

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) {
      if (metric !== 'moves' && r.metric !== metric) continue
      if (opening !== 'all' && r.opening_family !== opening) continue
      if (side !== 'both' && r.side !== side) continue
      if (piece !== 'all' && r.piece !== piece) continue
      if (!inRange(r.elo_bracket)) continue
      r.counts.forEach((n, i) => m.set(SQUARES[i], (m.get(SQUARES[i]) ?? 0) + n))
    }
    return m
  }, [rows, metric, opening, side, piece, inRange])

  const total = [...counts.values()].reduce((a, b) => a + b, 0)

  // sqrt scale so a few very busy squares (e4, d4, ...) don't wash out the rest
  const color = useMemo(
    () => scaleSequentialSqrt([0, Math.max(1, ...counts.values())], (t) => interpolateBlues(0.05 + 0.9 * t)),
    [counts],
  )
  const squareStyles = useMemo(
    () => Object.fromEntries([...counts].map(([sq, n]) => [sq, { background: color(n) }])),
    [counts, color],
  )

  return (
    <TabSection
      title="What happens on each square?"
      description={`${description} Darker squares get more. Color grows with the square root of the count, so a few very busy squares don't wash out the rest; the legend shows the actual counts.`}
      controls={
        <>
          <SegmentedControl
            data={Object.entries(METRICS).map(([value, m]) => ({
              value,
              label: m.label,
              disabled: opening !== 'all' && value !== 'moves',
            }))}
            value={metric}
            onChange={setMetric}
          />
          <SegmentedControl data={['both', 'white', 'black']} value={side} onChange={setSide} />
          <Select
            data={[{ value: 'all', label: 'All openings' }, ...(meta?.board_openings ?? [])]}
            value={opening}
            onChange={(v) => setOpening(v ?? 'all')}
            allowDeselect={false}
            disabled={metric !== 'moves'}
            w={220}
          />
          <Select data={PIECES} value={piece} onChange={(v) => setPiece(v ?? 'all')} allowDeselect={false} w={160} />
        </>
      }
      loading={!rows}
    >
      <Group align="flex-start" gap="xl">
        <div style={{ width: 'min(480px, 100%)' }}>
          <Chessboard
            options={{
              position: EMPTY_BOARD,
              allowDragging: false,
              squareStyles,
              darkSquareNotationStyle: NOTATION_STYLE,
              lightSquareNotationStyle: NOTATION_STYLE,
              onMouseOverSquare: ({ square }) => setHovered(square),
              onMouseOutSquare: () => setHovered(null),
            }}
          />
        </div>
        <Paper withBorder p="md" miw={200}>
          <Stack gap={4}>
            {hovered ? (
              <>
                <Text fw={700}>{hovered}</Text>
                <Text>
                  {(counts.get(hovered) ?? 0).toLocaleString()} {noun}
                </Text>
                <Text size="sm" c="dimmed">
                  {(((counts.get(hovered) ?? 0) / Math.max(total, 1)) * 100).toFixed(2)}% of selection
                </Text>
              </>
            ) : (
              <Text c="dimmed">Hover a square</Text>
            )}
            <Text size="sm" c="dimmed" mt="sm">
              {total.toLocaleString()} {noun} in selection
            </Text>
            <Legend color={color} title={legend} hovered={hovered ? (counts.get(hovered) ?? 0) : null} />
          </Stack>
        </Paper>
      </Group>
    </TabSection>
  )
}

const LEGEND_WIDTH = 200

/** Color ramp with count ticks placed on the same sqrt scale as the squares. */
function Legend({
  color,
  title,
  hovered,
}: {
  color: ReturnType<typeof scaleSequentialSqrt<string>>
  title: string
  hovered: number | null
}) {
  const [, max] = color.domain()
  const x = scaleSqrt([0, max], [0, LEGEND_WIDTH])
  const format = x.tickFormat(3, '~s')
  const ramp = Array.from({ length: 11 }, (_, i) => `${color.interpolator()(i / 10)} ${i * 10}%`).join(', ')
  return (
    <Stack gap={2} mt="md">
      <Text size="xs" c="dimmed">
        {title} (square-root scale)
      </Text>
      <div style={{ position: 'relative', width: LEGEND_WIDTH, height: 12, background: `linear-gradient(to right, ${ramp})` }}>
        {hovered !== null && (
          <div style={{ position: 'absolute', left: x(hovered) - 1, top: -3, width: 2, height: 18, background: '#000' }} />
        )}
      </div>
      <div style={{ position: 'relative', width: LEGEND_WIDTH, height: 16 }}>
        {x.ticks(3).map((t) => (
          <Text key={t} size="xs" c="dimmed" style={{ position: 'absolute', left: x(t), transform: 'translateX(-50%)' }}>
            {t === 0 ? '0' : format(t)}
          </Text>
        ))}
      </div>
    </Stack>
  )
}
