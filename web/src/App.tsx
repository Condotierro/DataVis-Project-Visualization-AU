import { AppShell, Burger, Group, NavLink, Stack, Text, Title } from '@mantine/core'
import { useDisclosure, useHash } from '@mantine/hooks'
import { tabs } from './tabs'
import { ORANGE, PAGE, TEXT } from './lib/theme'
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
        <AppShell.Header bg={TEXT} withBorder={false} hiddenFrom="sm">
          <Group h="100%" px="md" gap="sm">
            <Burger opened={opened} onClick={toggle} size="sm" color={PAGE} aria-label="Show views" />
            <Mark />
            <Title order={1} c={PAGE}>
              ChessViz
            </Title>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar bg={TEXT} withBorder={false} p="md">
          <Group gap="sm" mb="xl" visibleFrom="sm">
            <Mark />
            <Title order={1} c={PAGE}>
              ChessViz
            </Title>
          </Group>
          <Stack gap={4}>
            {tabs.map((t) => (
              <NavLink
                key={t.id}
                href={`#${t.id}`}
                label={t.title}
                active={t.id === active}
                fw={700}
                // On the dark sidebar: light labels, and the open view in orange on a faint tint.
                styles={{
                  root: {
                    borderRadius: 'var(--mantine-radius-md)',
                    color: t.id === active ? ORANGE : PAGE,
                    background: t.id === active ? 'rgba(254, 254, 254, 0.08)' : undefined,
                  },
                }}
                onClick={(e) => {
                  e.preventDefault()
                  setHash(`#${t.id}`)
                  close()
                }}
              />
            ))}
          </Stack>
          {meta && (
            <Text size="xs" c="#a3a29f" mt="auto" lh={1.5}>
              {meta.games.toLocaleString()} rated {meta.time_controls.join(', ')} games from Lichess, played{' '}
              {meta.first_date} to {meta.last_date}.
            </Text>
          )}
        </AppShell.Navbar>

        <AppShell.Main>
          {/* Above the tab, so the brush survives switching tabs and filters all of them. */}
          <EloBrush />
          <ActiveTab key={active} />
        </AppShell.Main>
      </AppShell>
    </EloFilterProvider>
  )
}
