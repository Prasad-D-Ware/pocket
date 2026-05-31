import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'

import { openInbox } from '../inbox/db'
import { useInbox } from '../inbox/hooks'
import {
  decodeIntent,
  decodePolicyResult,
  markDenied,
  markSigned,
} from '../inbox/queue'
import {
  SCENARIOS,
  defaultPolicy,
  evaluateAndEnqueue,
} from '../inbox/simulator'
import { routeSentence, type RouteResult } from '../inbox/router'
import type { InboxRow, InboxStatus } from '../inbox/types'
import { summarizeIntent } from '../inbox/format'
import { getModelStatus } from '../llm/model'

const DEFAULT_X402_DEMO_URL = 'http://10.0.2.2:4242/api/quote'

export default function InboxScreen() {
  const { rows, loading, refresh } = useInbox({ limit: 100, pollMs: 2000 })
  const [busy, setBusy] = useState<string | null>(null)
  const [lastDecision, setLastDecision] = useState<string | null>(null)
  // "Talk to Pocket" state.
  const [sentence, setSentence] = useState('pay api.helius.dev 0.5 USDC for a query')
  const [x402Url, setX402Url] = useState(DEFAULT_X402_DEMO_URL)
  const [routing, setRouting] = useState(false)
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)

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

  async function onRouteSentence() {
    if (routing) return
    if (!sentence.trim()) return
    // Model has to be downloaded — the LLM Test screen does this.
    const status = await getModelStatus()
    if (status.state !== 'ready') {
      setRouteResult({
        kind: 'parse-failed',
        reason: 'model not downloaded',
        raw: 'Open LLM Test from home, download SmolLM2 (~271 MB), then come back.',
        durationMs: 0,
      })
      return
    }
    setRouting(true)
    setRouteResult(null)
    try {
      const runner = openInbox()
      const result = await routeSentence(sentence.trim(), {
        runner,
        policy: defaultPolicy(),
        demoX402Url: x402Url.trim() || DEFAULT_X402_DEMO_URL,
      })
      setRouteResult(result)
      refresh()
    } catch (e) {
      setRouteResult({
        kind: 'parse-failed',
        reason: 'unhandled',
        raw: errMsg(e),
        durationMs: 0,
      })
    } finally {
      setRouting(false)
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

      <SectionLabel title="Talk to Pocket" />
      <Text className="text-gray-500 dark:text-gray-400 text-xs mb-3 leading-relaxed">
        Type a payment in English. The on-device LLM parses it, PolicyGuard
        decides, and an allowed x402 payment hits the demo URL below with a
        real Keystore-signed Solana payment.
      </Text>
      <View className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-4">
        <Text className="text-gray-600 dark:text-gray-400 text-xs mb-1">
          sentence
        </Text>
        <TextInput
          value={sentence}
          onChangeText={setSentence}
          multiline
          autoCapitalize="sentences"
          placeholder="pay api.helius.dev 0.5 USDC"
          placeholderTextColor="#9CA3AF"
          className="text-sm text-gray-900 dark:text-white py-2 min-h-[50px]"
        />
        <Text className="text-gray-600 dark:text-gray-400 text-xs mt-2 mb-1">
          x402 demo URL
        </Text>
        <TextInput
          value={x402Url}
          onChangeText={setX402Url}
          autoCapitalize="none"
          autoCorrect={false}
          className="text-xs text-gray-900 dark:text-white font-mono py-2"
        />
      </View>
      <Pressable
        onPress={() => void onRouteSentence()}
        disabled={routing}
        className={`px-6 py-4 rounded-xl mb-3 ${
          routing
            ? 'bg-gray-300 dark:bg-gray-800'
            : 'bg-violet-600 active:bg-violet-700'
        }`}
      >
        <Text className="text-white font-bold text-center">
          {routing ? 'parsing + routing…' : 'Send'}
        </Text>
      </Pressable>
      {routeResult && <RouteResultPanel result={routeResult} />}

      <SectionLabel title="Simulate agent request (canned scenarios)" />
      <Text className="text-gray-500 dark:text-gray-400 text-xs mb-3 leading-relaxed">
        Pre-baked Intents that bypass the LLM. Useful for testing
        PolicyGuard's allow / queue / deny branches deterministically.
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

function RouteResultPanel({ result }: { result: RouteResult }) {
  const tone =
    result.kind === 'signed-real'
      ? 'green'
      : result.kind === 'signed-simulated' || result.kind === 'queued'
        ? 'blue'
        : result.kind === 'denied' || result.kind === 'refused'
          ? 'amber'
          : 'red'
  const bg = {
    green:
      'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900',
    blue:
      'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900',
    amber:
      'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900',
    red: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900',
  }[tone]
  const fg = {
    green: 'text-green-800 dark:text-green-200',
    blue: 'text-blue-800 dark:text-blue-200',
    amber: 'text-amber-800 dark:text-amber-200',
    red: 'text-red-800 dark:text-red-200',
  }[tone]
  return (
    <View className={`border rounded-xl p-4 mb-6 ${bg}`}>
      <Text className={`font-bold text-sm mb-1 ${fg}`}>
        {labelFor(result)}
      </Text>
      <Text className={`text-xs ${fg}`}>{detailFor(result)}</Text>
    </View>
  )
}

function labelFor(r: RouteResult): string {
  switch (r.kind) {
    case 'signed-real':
      return '✓ Signed + executed on-chain'
    case 'signed-simulated':
      return '✓ Signed (SIMULATED — execution pending Day 17+)'
    case 'queued':
      return '⋯ Queued for manual review'
    case 'denied':
      return '✗ Denied by policy'
    case 'refused':
      return '✗ Refused by parser'
    case 'parse-failed':
      return '✗ Parse failed'
    case 'expand-failed':
      return '✗ Expand failed'
    case 'execute-failed':
      return '✗ Execution failed'
  }
}

function detailFor(r: RouteResult): string {
  switch (r.kind) {
    case 'signed-real':
      return `tx: ${r.sig.slice(0, 12)}…${r.sig.slice(-6)}`
    case 'signed-simulated':
      return `${r.reason}\nsig: ${r.sig}`
    case 'queued':
      return r.policyResult.action === 'queue' && r.policyResult.reason
        ? r.policyResult.reason
        : 'awaiting your tap in Pending above'
    case 'denied':
      return r.policyResult.action === 'deny'
        ? `${r.policyResult.denied_by}: ${r.policyResult.reason}`
        : 'denied'
    case 'refused':
      return `${r.reason} (${r.durationMs}ms)`
    case 'parse-failed':
      return `${r.reason}: ${r.raw}`
    case 'expand-failed':
      return r.reason
    case 'execute-failed':
      return r.reason
  }
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
