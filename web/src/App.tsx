import { Container, Group, Tabs, Text, Title } from '@mantine/core'
import { useHash } from '@mantine/hooks'
import { tabs } from './tabs'
import { useData } from './lib/data'

type Meta = { games: number; first_date: string; last_date: string }

export default function App() {
  // The active tab lives in the URL hash (e.g. .../#openings) so tabs can be linked directly.
  const [hash, setHash] = useHash()
  const active = tabs.find((t) => `#${t.id}` === hash)?.id ?? tabs[0].id
  const meta = useData<Meta>('meta.json')

  return (
    <Container size="lg" py="lg">
      <Group align="baseline" gap="md" mb="md">
        <Title order={1}>ChessViz</Title>
        {meta && (
          <Text c="dimmed" size="sm">
            {meta.games.toLocaleString()} Lichess rated games · {meta.first_date} – {meta.last_date}
          </Text>
        )}
      </Group>

      <Tabs value={active} onChange={(id) => setHash(`#${id}`)} keepMounted={false}>
        <Tabs.List mb="lg">
          {tabs.map((t) => (
            <Tabs.Tab key={t.id} value={t.id}>
              {t.title}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {tabs.map((t) => (
          <Tabs.Panel key={t.id} value={t.id}>
            <t.component />
          </Tabs.Panel>
        ))}
      </Tabs>
    </Container>
  )
}
