import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { EmptyState } from '../../ui/EmptyState'
import { useHaptic } from '../../ui/useHaptic'
import { ActivityRow } from '../../components/ActivityRow'
import { openInbox } from '../../inbox/db'
import { useInbox } from '../../inbox/hooks'
import {
  decodeIntent,
  decodePolicyResult,
  markDenied,
  markSigned,
} from '../../inbox/queue'
import { summarizeIntent } from '../../inbox/format'
import type { InboxRow, InboxStatus } from '../../inbox/types'

type Filter = 'all' | InboxStatus

export default function Inbox() {
  const { rows, refresh } = useInbox({ limit: 100, pollMs: 2000 })
  const [filter, setFilter] = useState<Filter>('all')
  const trigger = useHaptic()

  const pending = useMemo(
    () => rows.filter((r) => r.status === 'pending'),
    [rows],
  )
  const visible = useMemo(() => {
    if (filter === 'all') return rows.filter((r) => r.status !== 'pending')
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const counts = useMemo(() => {
    const c = { pending: 0, signed: 0, denied: 0, failed: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  function onApprove(row: InboxRow) {
    trigger('success')
    markSigned(openInbox(), row.id, `MANUAL_${shortRandom()}`)
    refresh()
  }

  function onDeny(row: InboxRow) {
    trigger('warning')
    markDenied(openInbox(), row.id, 'user denied from inbox')
    refresh()
  }

  return (
    <Screen>
      <Header title="Inbox" subtitle="Local sqlite queue · PolicyGuard auto-routes" />

      <View className="flex-row gap-2 mb-6">
        <Pill tone="warn">{counts.pending} pending</Pill>
        <Pill tone="ok">{counts.signed} signed</Pill>
        <Pill tone="bad">{counts.denied} denied</Pill>
        {counts.failed > 0 && <Pill tone="bad">{counts.failed} failed</Pill>}
      </View>

      <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
        Pending ({pending.length})
      </Text>
      {pending.length === 0 ? (
        <Card>
          <Text className="text-gray-500 text-sm italic">
            No pending requests. Agent activity will appear here when it needs your review.
          </Text>
        </Card>
      ) : (
        <View className="gap-3">
          {pending.map((row) => (
            <PendingCard
              key={row.id}
              row={row}
              onApprove={() => onApprove(row)}
              onDeny={() => onDeny(row)}
            />
          ))}
        </View>
      )}

      <View className="mt-6">
        <Text className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">
          Activity
        </Text>
        <View className="mb-2">
          <FilterDropdown value={filter} onChange={setFilter} />
        </View>
        {visible.length === 0 ? (
          <EmptyState
            icon={<Feather name="inbox" size={36} color="#A1A1AA" />}
            title="Nothing here yet"
            body="Type something in the Pay tab, or trigger a canned simulator from Settings → Developer."
          />
        ) : (
          <Card padding="md">
            {visible.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  )
}

function PendingCard({
  row,
  onApprove,
  onDeny,
}: {
  row: InboxRow
  onApprove: () => void
  onDeny: () => void
}) {
  const intent = decodeIntent(row)
  const policy = decodePolicyResult(row)
  const summary = row.decoded_summary ?? (intent && summarizeIntent(intent))
  return (
    <Card variant="accent">
      <Text className="text-white font-semibold text-sm mb-1">
        {summary ?? '(unparseable intent)'}
      </Text>
      <Text className="text-violet-300/70 text-xs mb-3">
        {row.source} · {relTime(row.created_at_ms)}
      </Text>
      {policy && policy.action === 'queue' && (
        <Text className="text-violet-200 text-xs mb-3 italic">
          {policy.reason}
        </Text>
      )}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button variant="destructive" onPress={onDeny}>
            Deny
          </Button>
        </View>
        <View className="flex-1">
          <Button variant="primary" onPress={onApprove}>
            Approve
          </Button>
        </View>
      </View>
    </Card>
  )
}

function FilterDropdown({
  value,
  onChange,
}: {
  value: Filter
  onChange: (v: Filter) => void
}) {
  const FILTERS: Filter[] = ['all', 'signed', 'denied', 'failed']
  return (
    <View className="flex-row gap-1">
      {FILTERS.map((f) => (
        <Pressable
          key={f}
          onPress={() => onChange(f)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: value === f ? 'rgba(139,92,246,0.2)' : 'transparent',
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: value === f ? '#C4B5FD' : '#71717A',
            }}
          >
            {f}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function relTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 10)
}
