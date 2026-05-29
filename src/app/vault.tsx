import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { PublicKey } from '@solana/web3.js'
import {
  createReadOnlyClient,
  deriveVaultPda,
  derivePolicyPda,
  fetchPolicy,
  fetchVault,
  fetchVaultAtaBalance,
  type PolicyAccount,
  type VaultAccount,
} from '../anchor/client'
import { DAY_6_TEST_AUTHORITY, POCKET_VAULT_PROGRAM_ID } from '../anchor/constants'

const USDC_DECIMALS = 6

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ok'
      authority: PublicKey
      vaultPda: PublicKey
      policyPda: PublicKey
      vault: VaultAccount | null
      policy: PolicyAccount | null
      ata: { ata: PublicKey; raw: string; uiAmount: number | null } | null
    }

export default function VaultScreen() {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const authority = new PublicKey(DAY_6_TEST_AUTHORITY)
        const client = createReadOnlyClient()
        const [vaultPda] = deriveVaultPda(authority)
        const [policyPda] = derivePolicyPda(vaultPda)
        const vaultResult = await fetchVault(client, authority)
        const vault = vaultResult?.data ?? null
        const policyResult = vault ? await fetchPolicy(client, vaultPda) : null
        const policy = policyResult?.data ?? null
        const ata = vault
          ? await fetchVaultAtaBalance(client, vaultPda, vault.mint)
          : null
        if (cancelled) return
        setState({
          kind: 'ok',
          authority,
          vaultPda,
          policyPda,
          vault,
          policy,
          ata,
        })
      } catch (e) {
        if (cancelled) return
        setState({
          kind: 'error',
          message: String((e as Error)?.message ?? e),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="px-6 pt-16 pb-12"
    >
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
        Pocket Vault
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        devnet · program {short(POCKET_VAULT_PROGRAM_ID)}
      </Text>

      {state.kind === 'loading' && (
        <View className="items-center justify-center mt-12">
          <ActivityIndicator />
          <Text className="text-gray-500 dark:text-gray-400 mt-3">
            Reading vault state from devnet…
          </Text>
        </View>
      )}

      {state.kind === 'error' && (
        <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl p-4">
          <Text className="text-red-800 dark:text-red-200 font-semibold mb-1">
            Failed to load vault
          </Text>
          <Text className="text-red-700 dark:text-red-300 text-xs">
            {state.message}
          </Text>
        </View>
      )}

      {state.kind === 'ok' && (
        <View>
          <Section title="Authority (Day 6 hardcoded)">
            <Pair k="address" v={short(state.authority.toBase58())} mono />
          </Section>

          <Section title="Vault PDA">
            <Pair k="address" v={short(state.vaultPda.toBase58())} mono />
            {state.vault ? (
              <>
                <Pair k="mint" v={short(state.vault.mint.toBase58())} mono />
                <Pair
                  k="opened at slot"
                  v={state.vault.openedAtSlot.toString()}
                />
                <Pair
                  k="total deposited"
                  v={fmtUsdc(state.vault.totalDeposited)}
                />
                <Pair
                  k="total withdrawn"
                  v={fmtUsdc(state.vault.totalWithdrawn)}
                />
                <Pair
                  k="policy set?"
                  v={state.vault.policySet ? 'yes' : 'no'}
                />
                <Pair
                  k="vault ATA"
                  v={state.ata ? short(state.ata.ata.toBase58()) : '—'}
                  mono
                />
                <Pair
                  k="vault ATA balance"
                  v={state.ata ? fmtUsdcRaw(state.ata.raw) : '—'}
                />
              </>
            ) : (
              <Text className="text-gray-500 dark:text-gray-400 italic mt-1">
                Vault PDA does not exist yet for this authority.
              </Text>
            )}
          </Section>

          <Section title="Policy PDA">
            <Pair k="address" v={short(state.policyPda.toBase58())} mono />
            {state.policy ? (
              <>
                <Pair
                  k="max per tx"
                  v={fmtUsdc(state.policy.maxPerTxBaseUnits)}
                />
                <Pair
                  k="max per day"
                  v={fmtUsdc(state.policy.maxPerDayBaseUnits)}
                />
                <Pair
                  k="spent in window"
                  v={fmtUsdc(state.policy.spentInWindow)}
                />
                <Pair
                  k="window start slot"
                  v={state.policy.dailyWindowStartSlot.toString()}
                />
                <Pair
                  k="slots per window"
                  v={state.policy.slotsPerWindow.toString()}
                />
                <Pair
                  k="expiry slot"
                  v={
                    state.policy.expirySlot.toString() === '0'
                      ? 'never'
                      : state.policy.expirySlot.toString()
                  }
                />
              </>
            ) : (
              <Text className="text-gray-500 dark:text-gray-400 italic mt-1">
                No policy installed on this vault yet.
              </Text>
            )}
          </Section>

          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-6 leading-relaxed">
            Day 6: read-only client. Writes (set_policy, deposit,
            withdraw_under_policy) arrive on Day 8 with the Android
            Keystore signer.
          </Text>
        </View>
      )}

      <StatusBar style="auto" />
    </ScrollView>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <View className="mb-6">
      <Text className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 font-semibold">
        {title}
      </Text>
      <View className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
        {children}
      </View>
    </View>
  )
}

function Pair({
  k,
  v,
  mono,
}: {
  k: string
  v: string
  mono?: boolean
}) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-gray-600 dark:text-gray-400 text-sm">{k}</Text>
      <Text
        className={`text-gray-900 dark:text-white text-sm ${mono ? 'font-mono' : 'font-medium'}`}
      >
        {v}
      </Text>
    </View>
  )
}

function short(s: string): string {
  if (s.length <= 12) return s
  return s.slice(0, 6) + '…' + s.slice(-4)
}

// Vault account fields come back as Anchor BN; toString() gives base
// units. We format as fake-USDC (6 decimals).
function fmtUsdc(bn: { toString: () => string }): string {
  return fmtUsdcRaw(bn.toString())
}

function fmtUsdcRaw(raw: string): string {
  const n = Number(raw) / 10 ** USDC_DECIMALS
  if (!Number.isFinite(n)) return raw
  return `${n.toFixed(USDC_DECIMALS).replace(/\.?0+$/, '')} fakeUSDC`
}
