import type { ReactNode } from 'react'
import { Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'

/** Common layout for a tab: title, one-line description, a row of filters, then the chart on a panel. */
export function TabSection(props: {
  title: string
  description: ReactNode
  controls?: ReactNode
  loading?: boolean
  children: ReactNode
}) {
  return (
    <Stack gap="md">
      <div>
        <Title order={2}>{props.title}</Title>
        <Text c="dimmed" component="div" maw="72ch" mt={6} lh={1.55}>
          {props.description}
        </Text>
      </div>
      {props.controls && <Group gap="md">{props.controls}</Group>}
      <Paper p="lg">
        <Stack gap="md">{props.loading ? <Loader size="sm" /> : props.children}</Stack>
      </Paper>
    </Stack>
  )
}
