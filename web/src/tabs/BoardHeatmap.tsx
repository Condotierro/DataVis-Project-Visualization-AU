import { useMemo, useState } from 'react'
import { Group, Paper, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import { Chessboard } from 'react-chessboard'
import { scaleSequentialSqrt, scaleSqrt } from 'd3-scale'
import { interpolateBlues } from 'd3-scale-chromatic'
import { useData } from '../lib/data'
import { useEloFilter } from '../lib/eloRange'
import { TabSection } from '../lib/TabSection'

// Example of a non-Vega tab: react-chessboard draws the board, we only color the squares.

// counts[i] is the number of moves to SQUARES[i]; opening_family only in square_heatmap_openings.json
type Row = { side: 'white' | 'black'; piece: string; elo_bracket: number; counts: number[]; opening_family?: string }
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

const EMPTY_BOARD = '8/8/8/8/8/8/8/8 w - - 0 1'
// Readable on both light and dark heatmap cells
const NOTATION_STYLE = { color: '#fff', textShadow: '0 0 2px #000', fontWeight: 600 }

export default function BoardHeatmap() {
  const [opening, setOpening] = useState('all')
  const meta = useData<Meta>('meta.json')
  const allRows = useData<Row[]>('square_heatmap.json')
  // Per-opening counts are a much bigger file, so it's only fetched once an opening is picked.
  const openingRows = useData<Row[]>(opening === 'all' ? null : 'square_heatmap_openings.json')
  const rows = opening === 'all' ? allRows : openingRows
  const [side, setSide] = useState('both')
  const [piece, setPiece] = useState('all')
  const [hovered, setHovered] = useState<string | null>(null)
  const { inRange } = useEloFilter()

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) {
      if (opening !== 'all' && r.opening_family !== opening) continue
      if (side !== 'both' && r.side !== side) continue
      if (piece !== 'all' && r.piece !== piece) continue
      if (!inRange(r.elo_bracket)) continue
      r.counts.forEach((n, i) => m.set(SQUARES[i], (m.get(SQUARES[i]) ?? 0) + n))
    }
    return m
  }, [rows, opening, side, piece, inRange])

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
      title="Where do pieces move?"
      description="Destination square of every move: darker squares get more traffic. Pick an opening and a piece to see where that opening sends it (all moves of those games, not only the opening moves). Color grows with the square root of the count, so the few very busy central squares don't wash out the rest; the legend shows the actual counts."
      controls={
        <>
          <SegmentedControl data={['both', 'white', 'black']} value={side} onChange={setSide} />
          <Select
            data={[{ value: 'all', label: 'All openings' }, ...(meta?.board_openings ?? [])]}
            value={opening}
            onChange={(v) => setOpening(v ?? 'all')}
            allowDeselect={false}
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
                <Text>{(counts.get(hovered) ?? 0).toLocaleString()} moves</Text>
                <Text size="sm" c="dimmed">
                  {(((counts.get(hovered) ?? 0) / Math.max(total, 1)) * 100).toFixed(2)}% of selection
                </Text>
              </>
            ) : (
              <Text c="dimmed">Hover a square</Text>
            )}
            <Text size="sm" c="dimmed" mt="sm">
              {total.toLocaleString()} moves in selection
            </Text>
            <Legend color={color} hovered={hovered ? (counts.get(hovered) ?? 0) : null} />
          </Stack>
        </Paper>
      </Group>
    </TabSection>
  )
}

const LEGEND_WIDTH = 200

/** Color ramp with count ticks placed on the same sqrt scale as the squares. */
function Legend({ color, hovered }: { color: ReturnType<typeof scaleSequentialSqrt<string>>; hovered: number | null }) {
  const [, max] = color.domain()
  const x = scaleSqrt([0, max], [0, LEGEND_WIDTH])
  const format = x.tickFormat(3, '~s')
  const ramp = Array.from({ length: 11 }, (_, i) => `${color.interpolator()(i / 10)} ${i * 10}%`).join(', ')
  return (
    <Stack gap={2} mt="md">
      <Text size="xs" c="dimmed">
        Moves to a square (square-root scale)
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
