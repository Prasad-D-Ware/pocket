import { Pressable, Text, View, Linking } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { decodeIntent } from '../inbox/queue'
import { summarizeIntent } from '../inbox/format'
import type { InboxRow } from '../inbox/types'

const STATUS_META = {
  pending: { icon: 'clock', color: '#FBBF24' },
  signed: { icon: 'check', color: '#34D399' },
  denied: { icon: 'x', color: '#F87171' },
  failed: { icon: 'alert-triangle', color: '#F87171' },
} as const

export function ActivityRow({ row }: { row: InboxRow }) {
  const intent = decodeIntent(row)
  const summary = row.decoded_summary ?? (intent && summarizeIntent(intent))
  const meta = STATUS_META[row.status]
  const sig = row.signed_tx
  const explorerUrl = sig && !sig.startsWith('SIMULATED_') && !sig.startsWith('MANUAL_') && !sig.startsWith('EXECUTED_')
    ? `https://explorer.solana.com/tx/${sig}?cluster=devnet`
    : null

  return (
    <View className="py-3 border-b border-white/[0.04] last:border-0">
      <View className="flex-row items-start gap-3">
        <Feather name={meta.icon as never} size={16} color={meta.color} style={{ marginTop: 2 }} />
        <View className="flex-1">
          <Text className="text-white text-sm">
            {summary ?? '(unparseable intent)'}
          </Text>
          <Text className="text-gray-500 text-xs mt-0.5">
            {row.source} · {relTime(row.created_at_ms)}
          </Text>
          {row.denied_reason && (
            <Text className="text-red-300 text-xs mt-1">{row.denied_reason}</Text>
          )}
          {sig && (
            <View className="flex-row items-center gap-2 mt-1">
              <Text className="text-gray-500 text-xs font-mono">
                {sig.length > 16 ? `${sig.slice(0, 8)}…${sig.slice(-6)}` : sig}
              </Text>
              {explorerUrl && (
                <Pressable onPress={() => Linking.openURL(explorerUrl)}>
                  <Feather name="external-link" size={12} color="#71717A" />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
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
