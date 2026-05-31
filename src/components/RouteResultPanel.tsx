import { Text, View } from 'react-native'
import type { RouteResult } from '../inbox/router'

export function RouteResultPanel({ result }: { result: RouteResult }) {
  const tone =
    result.kind === 'signed-real'
      ? 'green'
      : result.kind === 'signed-simulated' || result.kind === 'queued'
        ? 'blue'
        : result.kind === 'denied' || result.kind === 'refused'
          ? 'amber'
          : 'red'
  const bg = {
    green: 'bg-emerald-500/10 border-emerald-500/30',
    blue: 'bg-blue-500/10 border-blue-500/30',
    amber: 'bg-amber-500/10 border-amber-500/30',
    red: 'bg-red-500/10 border-red-500/30',
  }[tone]
  const fg = {
    green: 'text-emerald-300',
    blue: 'text-blue-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
  }[tone]
  return (
    <View className={`border rounded-2xl p-4 mb-4 ${bg}`}>
      <Text className={`font-bold text-sm mb-1 ${fg}`}>{labelFor(result)}</Text>
      <Text className={`text-xs ${fg}`}>{detailFor(result)}</Text>
    </View>
  )
}

function labelFor(r: RouteResult): string {
  switch (r.kind) {
    case 'signed-real':
      return '✓ Signed + executed on-chain'
    case 'signed-simulated':
      return '✓ Signed (SIMULATED — execution pending)'
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
        : 'awaiting your tap in Inbox'
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
