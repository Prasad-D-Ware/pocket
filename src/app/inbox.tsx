import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'

import { openInbox } from '../inbox/db'
import { useInbox } from '../inbox/hooks'
import {
  decodeIntent,
  decodePolicyResult,
  list as listRows,
  markDenied,
  markSigned,
  pendingCount as pendingCountFn,
} from '../inbox/queue'
import {
  SCENARIOS,
  defaultPolicy,
  evaluateAndEnqueue,
} from '../inbox/simulator'
import type { InboxRow, InboxStatus } from '../inbox/types'
import { summarizeIntent } from '../inbox/format'

export default function InboxScreen() {
  const { rows, loading, refresh } = useInbox({ limit: 100, pollMs: 2000 })
  const [busy, setBusy] = useState<string | null>(null)
  const [lastDecision, setLastDecision] = useState<string | null>(null)

  const pending = useMemo(
    () => rows.filter((r) => r.status === 'pending'),
    [rows],
  )
  const recent = useMemo(
    () => rows.filter((r) => r.status !== 'pending').slice(0, 20),
    [rows],
  )
  const counts = useMemo(() => countByStatus(rows), [rows])

  function onSimulate(key: string) {
    const scenario = SCENARIOS.find((s) => s.key === key)
    if (!scenario) return
    setBusy(key)
    try {
      const runner = openInbox()
      const result = evaluateAndEnqueue(runner, scenario.build(), defaultPolicy())
      setLastDecision(
        `${scenario.label} → ${result.action.toUpperCase()}` +
          (result.reason ? ` (${result.reason})` : ''),
      )
      refresh()
    } catch (e) {
      setLastDecision(`error: ${errMsg(e)}`)
    } finally {
      setBusy(null)
    }
  }

  function onApprove(row: InboxRow) {
    try {
      const runner = openInbox()
      markSigned(runner, row.id, `MANUAL_${shortRandom()}`)
      refresh()
    } catch (e) {
      setLastDecision(`error: ${errMsg(e)}`)
    }
  }

  function onDeny(row: InboxRow) {
    try {
      const runner = openInbox()
      markDenied(runner, row.id, 'user denied from inbox')
      refresh()
    } catch (e) {
      setLastDecision(`error: ${errMsg(e)}`)
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="px-6 pt-16 pb-12"
    >
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
        Agent Inbox
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Local sqlite queue · auto-routes via PolicyGuard
      </Text>

      <View className="flex-row gap-2 mb-6">
        <StatusChip label="pending" count={counts.pending} tone="warn" />
        <StatusChip label="signed" count={counts.signed} tone="ok" />
        <StatusChip label="denied" count={counts.denied} tone="bad" />
        {counts.failed > 0 && (
          <StatusChip label="failed" count={counts.failed} tone="bad" />
        )}
      </View>

      {loading && rows.length === 0 ? (
        <View className="items-center mt-8">
          <ActivityIndicator />
          <Text className="text-gray-500 dark:text-gray-400 mt-3">
            loading…
          </Text>
        </View>
      ) : (
        <>
          <SectionLabel title={`Pending (${pending.length})`} />
          {pending.length === 0 ? (
            <Text className="text-gray-500 dark:text-gray-400 text-sm italic mb-4">
              No pending requests. Try one of the simulators below.
            </Text>
          ) : (
            pending.map((row) => (
              <PendingCard
                key={row.id}
                row={row}
                onApprove={() => onApprove(row)}
                onDeny={() => onDeny(row)}
              />
            ))
          )}

          <SectionLabel title="Recent activity" />
          {recent.length === 0 ? (
            <Text className="text-gray-500 dark:text-gray-400 text-sm italic mb-4">
              Nothing here yet.
            </Text>
          ) : (
            recent.map((row) => <HistoryCard key={row.id} row={row} />)
          )}
        </>
      )}

      <SectionLabel title="Simulate agent request" />
      <Text className="text-gray-500 dark:text-gray-400 text-xs mb-3 leading-relaxed">
        Each button enqueues a canned Intent + runs PolicyGuard
        against the default policy. Allowed requests auto-sign with a
        SIMULATED sig (real Keystore signing through the inbox lands
        Day 13); denied requests appear in Recent activity; mid-range
        requests stay pending until you approve.
      </Text>
      {SCENARIOS.map((s) => (
        <Pressable
          key={s.key}
          onPress={() => onSimulate(s.key)}
          disabled={busy !== null}
          className={`px-4 py-3 rounded-xl mb-2 ${
            busy === s.key
              ? 'bg-gray-300 dark:bg-gray-800'
              : 'bg-gray-100 dark:bg-gray-900 active:opacity-70'
          }`}
        >
          <Text className="text-gray-900 dark:text-white text-sm">
            {s.label}
          </Text>
        </Pressable>
      ))}

      {lastDecision && (
        <View className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900 rounded-xl p-3 mt-3">
          <Text className="text-blue-800 dark:text-blue-200 text-xs">
            {lastDecision}
          </Text>
        </View>
      )}

      <StatusBar style="auto" />
    </ScrollView>
  )
}

type Counts = Record<InboxStatus, number>
function countByStatus(rows: InboxRow[]): Counts {
  const c: Counts = { pending: 0, signed: 0, denied: 0, failed: 0 }
  for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1
  return c
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 mt-4 font-semibold">
      {title}
    </Text>
  )
}

function StatusChip({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: 'ok' | 'warn' | 'bad'
}) {
  const bg = {
    ok: 'bg-green-100 dark:bg-green-950',
    warn: 'bg-yellow-100 dark:bg-yellow-950',
    bad: 'bg-red-100 dark:bg-red-950',
  }[tone]
  const fg = {
    ok: 'text-green-800 dark:text-green-200',
    warn: 'text-yellow-800 dark:text-yellow-200',
    bad: 'text-red-800 dark:text-red-200',
  }[tone]
  return (
    <View className={`px-3 py-1.5 rounded-full ${bg}`}>
      <Text className={`text-xs font-semibold ${fg}`}>
        {count} {label}
      </Text>
    </View>
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
    <View className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900 rounded-xl p-4 mb-3">
      <Text className="text-gray-900 dark:text-white font-semibold text-sm mb-1">
        {summary ?? '(unparseable intent)'}
      </Text>
      <Text className="text-gray-500 dark:text-gray-400 text-xs mb-3">
        source: {row.source} · {relTime(row.created_at_ms)}
      </Text>
      {policy && policy.action === 'queue' && (
        <Text className="text-yellow-700 dark:text-yellow-300 text-xs mb-3 italic">
          PolicyGuard: queue — {policy.reason}
        </Text>
      )}
      <View className="flex-row gap-2">
        <Pressable
          onPress={onApprove}
          className="flex-1 bg-emerald-600 active:bg-emerald-700 py-2.5 rounded-lg"
        >
          <Text className="text-white font-bold text-center text-sm">
            Approve
          </Text>
        </Pressable>
        <Pressable
          onPress={onDeny}
          className="flex-1 bg-red-500 active:bg-red-600 py-2.5 rounded-lg"
        >
          <Text className="text-white font-bold text-center text-sm">
            Deny
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function HistoryCard({ row }: { row: InboxRow }) {
  const intent = decodeIntent(row)
  const summary = row.decoded_summary ?? (intent && summarizeIntent(intent))
  const tones = {
    signed: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900',
    denied: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900',
    failed: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900',
    pending: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800',
  } as const
  const icon = { signed: '✓', denied: '✗', failed: '⚠', pending: '⋯' }[
    row.status
  ]
  return (
    <View className={`border rounded-xl p-3 mb-2 ${tones[row.status]}`}>
      <Text className="text-gray-900 dark:text-white text-sm mb-0.5">
        {icon} {summary ?? '(unparseable intent)'}
      </Text>
      <Text className="text-gray-500 dark:text-gray-400 text-xs">
        {row.source} · {relTime(row.created_at_ms)}
      </Text>
      {row.signed_tx && (
        <Text
          selectable
          className="text-gray-700 dark:text-gray-300 text-xs font-mono mt-1"
        >
          {row.signed_tx}
        </Text>
      )}
      {row.denied_reason && (
        <Text className="text-red-700 dark:text-red-300 text-xs mt-1">
          {row.denied_reason}
        </Text>
      )}
      {row.error && (
        <Text className="text-red-700 dark:text-red-300 text-xs mt-1">
          error: {row.error}
        </Text>
      )}
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

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
