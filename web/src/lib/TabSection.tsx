import type { ReactNode } from 'react'
import { Group, Loader, Stack, Text, Title } from '@mantine/core'

/** Common layout for a tab: title, one-line description, a row of filters, then the chart. */
export function TabSection(props: {
  title: string
  description: string
  controls?: ReactNode
  loading?: boolean
  children: ReactNode
}) {
  return (
    <Stack gap="md">
      <div>
        <Title order={2} size="h3">
          {props.title}
        </Title>
        <Text c="dimmed">{props.description}</Text>
      </div>
      {props.controls && <Group gap="md">{props.controls}</Group>}
      {props.loading ? <Loader size="sm" /> : props.children}
    </Stack>
  )
}
