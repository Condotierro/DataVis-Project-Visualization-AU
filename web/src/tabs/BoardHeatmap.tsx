import { useMemo, useState } from 'react'
import { Group, Paper, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import { Chessboard } from 'react-chessboard'
import { scaleSequentialSqrt } from 'd3-scale'
import { interpolateBlues } from 'd3-scale-chromatic'
import { useData } from '../lib/data'
import { TabSection } from '../lib/TabSection'

// Example of a non-Vega tab: react-chessboard draws the board, we only color the squares.

type Row = { side: 'white' | 'black'; piece: string; square: string; count: number }

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
  const rows = useData<Row[]>('square_heatmap.json')
  const [side, setSide] = useState('both')
  const [piece, setPiece] = useState('all')
  const [hovered, setHovered] = useState<string | null>(null)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) {
      if (side !== 'both' && r.side !== side) continue
      if (piece !== 'all' && r.piece !== piece) continue
      m.set(r.square, (m.get(r.square) ?? 0) + r.count)
    }
    return m
  }, [rows, side, piece])

  const total = [...counts.values()].reduce((a, b) => a + b, 0)

  const squareStyles = useMemo(() => {
    // sqrt scale so a few very busy squares (e4, d4, ...) don't wash out the rest
    const color = scaleSequentialSqrt([0, Math.max(1, ...counts.values())], (t) => interpolateBlues(0.05 + 0.9 * t))
    return Object.fromEntries([...counts].map(([sq, n]) => [sq, { background: color(n) }]))
  }, [counts])

  return (
    <TabSection
      title="Where do pieces move?"
      description="Destination square of every move. Darker squares get more traffic."
      controls={
        <>
          <SegmentedControl data={['both', 'white', 'black']} value={side} onChange={setSide} />
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
          </Stack>
        </Paper>
      </Group>
    </TabSection>
  )
}
