import { AppShell, Burger, Group, NavLink, Stack, Text, Title } from '@mantine/core'
import { useDisclosure, useHash } from '@mantine/hooks'
import { tabs } from './tabs'
import { useData } from './lib/data'
import { EloBrush, EloFilterProvider } from './lib/eloFilter'

type Meta = { games: number; first_date: string; last_date: string; time_controls: string[] }

/** The site mark: a corner of a board, in the same colors as the favicon. */
function Mark() {
  return <img src="./favicon.svg" width={28} height={28} alt="" />
}

export default function App() {
  // The active tab lives in the URL hash (e.g. .../#openings) so tabs can be linked directly.
  const [hash, setHash] = useHash()
  const active = tabs.find((t) => `#${t.id}` === hash)?.id ?? tabs[0].id
  const ActiveTab = tabs.find((t) => t.id === active)!.component
  const meta = useData<Meta>('meta.json')
  const [opened, { toggle, close }] = useDisclosure()

  return (
    <EloFilterProvider>
      <AppShell
        header={{ height: { base: 56, sm: 0 } }}
        navbar={{ width: 232, breakpoint: 'sm', collapsed: { mobile: !opened } }}
        padding="lg"
      >
        <AppShell.Header bg="dark.8" withBorder={false} hiddenFrom="sm">
          <Group h="100%" px="md" gap="sm">
            <Burger opened={opened} onClick={toggle} size="sm" aria-label="Show views" />
            <Mark />
            <Title order={1}>ChessViz</Title>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar bg="dark.8" withBorder={false} p="md">
          <Group gap="sm" mb="xl" visibleFrom="sm">
            <Mark />
            <Title order={1}>ChessViz</Title>
          </Group>
          <Stack gap={4}>
            {tabs.map((t) => (
              <NavLink
                key={t.id}
                href={`#${t.id}`}
                label={t.title}
                active={t.id === active}
                variant="filled"
                color="dark.5"
                fw={700}
                styles={{ root: { borderRadius: 'var(--mantine-radius-md)' } }}
                onClick={(e) => {
                  e.preventDefault()
                  setHash(`#${t.id}`)
                  close()
                }}
              />
            ))}
          </Stack>
          {meta && (
            <Text size="xs" c="dimmed" mt="auto" lh={1.5}>
              {meta.games.toLocaleString()} rated {meta.time_controls.join(', ')} games from Lichess, played{' '}
              {meta.first_date} to {meta.last_date}.
            </Text>
          )}
        </AppShell.Navbar>

        <AppShell.Main maw={1180 + 232}>
          {/* Above the tab, so the brush survives switching tabs and filters all of them. */}
          <EloBrush />
          <ActiveTab key={active} />
        </AppShell.Main>
      </AppShell>
    </EloFilterProvider>
  )
}
