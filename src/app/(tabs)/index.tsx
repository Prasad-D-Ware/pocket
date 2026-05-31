import { useEffect, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Stat } from '../../ui/Stat'
import { Address } from '../../ui/Address'
import { Skeleton } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { ActivityRow } from '../../components/ActivityRow'
import {
  createKeystoreWalletAdapter,
  type KeystoreWalletAdapter,
} from '../../x402/keystoreWalletAdapter'
import { useInbox, usePendingCount } from '../../inbox/hooks'
import { DEVNET_RPC } from '../../anchor/constants'

const FAKE_USDC_MINT = 'BofnM1aZaTJfxpoDD82oDJQEcSEyKtHjEEEUujCmE29v'

export default function Home() {
  const [adapter, setAdapter] = useState<KeystoreWalletAdapter | null>(null)
  const [sol, setSol] = useState<number | null>(null)
  const [usdc, setUsdc] = useState<number | null>(null)
  const { rows, loading } = useInbox({ limit: 5, pollMs: 2000 })
  const { count: pending } = usePendingCount(2000)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const a = await createKeystoreWalletAdapter()
        if (cancelled) return
        setAdapter(a)
        const conn = new Connection(DEVNET_RPC, 'confirmed')
        const lamports = await conn.getBalance(a.publicKey, 'confirmed')
        if (cancelled) return
        setSol(lamports / LAMPORTS_PER_SOL)
        try {
          const ata = getAssociatedTokenAddressSync(
            new PublicKey(FAKE_USDC_MINT),
            a.publicKey,
          )
          const bal = await conn.getTokenAccountBalance(ata, 'confirmed')
          if (cancelled) return
          setUsdc(Number(bal.value.uiAmountString ?? '0'))
        } catch {
          setUsdc(0)
        }
      } catch {
        /* ignore — Keystore not ready */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen>
      <Header
        title="Pocket"
        subtitle="devnet"
        right={<Feather name="settings" size={18} color="#FAFAFA" />}
        onRightPress={() => router.push('/settings')}
      />

      <Card>
        {adapter ? (
          <View>
            <Address address={adapter.address} />
            <View className="mt-4">
              {sol === null || usdc === null ? (
                <Skeleton width={180} height={40} />
              ) : (
                <Stat
                  value={`$${(sol * 100 + usdc).toFixed(2)}`}
                  subtitle={`${sol.toFixed(4)} SOL · ${usdc.toFixed(2)} fakeUSDC`}
                />
              )}
            </View>
          </View>
        ) : (
          <Skeleton height={80} />
        )}
      </Card>

      <View className="flex-row gap-2 mt-4">
        <QuickAction
          icon="arrow-up-right"
          label="Pay"
          onPress={() => router.push('/pay')}
        />
        <QuickAction
          icon="qr-code"
          label="Receive"
          onPress={() => router.push('/receive')}
        />
        <QuickAction
          icon="lock"
          label="Vault"
          onPress={() => router.push('/settings/vault')}
        />
      </View>

      {pending > 0 && (
        <Pressable
          onPress={() => router.push('/inbox')}
          className="mt-4 active:opacity-80"
        >
          <Card variant="accent">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-violet-200 font-semibold text-sm">
                  {pending} pending agent request{pending === 1 ? '' : 's'}
                </Text>
                <Text className="text-violet-300/70 text-xs mt-0.5">
                  Review them in Inbox
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#C4B5FD" />
            </View>
          </Card>
        </Pressable>
      )}

      <View className="mt-6">
        <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
          Recent activity
        </Text>
        <Card padding="md">
          {loading && rows.length === 0 ? (
            <View>
              <Skeleton height={32} />
              <View style={{ height: 12 }} />
              <Skeleton height={32} />
            </View>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Feather name="inbox" size={36} color="#A1A1AA" />}
              title="No activity yet"
              body="Your payments and agent requests will appear here."
              cta={{ label: 'Send your first one →', onPress: () => router.push('/pay') }}
            />
          ) : (
            <View>
              {rows.map((row) => (
                <ActivityRow key={row.id} row={row} />
              ))}
              <Link href="/inbox" asChild>
                <Pressable className="pt-3 active:opacity-60">
                  <Text className="text-violet-400 text-sm text-center font-semibold">
                    See all activity →
                  </Text>
                </Pressable>
              </Link>
            </View>
          )}
        </Card>
      </View>
    </Screen>
  )
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: string
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 bg-[#14141C] border border-white/[0.06] rounded-2xl py-4 items-center active:opacity-80 active:scale-[0.98]"
    >
      <Feather name={icon as never} size={20} color="#8B5CF6" />
      <Text className="text-white text-xs font-semibold mt-2">{label}</Text>
    </Pressable>
  )
}
