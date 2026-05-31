import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { PublicKey } from '@solana/web3.js'

import { Screen } from '../../../ui/Screen'
import { Header } from '../../../ui/Header'
import { Card } from '../../../ui/Card'
import { Pill } from '../../../ui/Pill'
import { Address } from '../../../ui/Address'
import {
  createReadOnlyClient,
  deriveVaultPda,
  derivePolicyPda,
  fetchPolicy,
  fetchVault,
  fetchVaultAtaBalance,
  type PolicyAccount,
  type VaultAccount,
} from '../../../anchor/client'
import {
  DAY_6_TEST_AUTHORITY,
  POCKET_VAULT_PROGRAM_ID,
} from '../../../anchor/constants'
import { createKeystoreWalletAdapter } from '../../../x402/keystoreWalletAdapter'

const USDC_DECIMALS = 6

type Source = 'mine' | 'test'

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
  const [source, setSource] = useState<Source>('mine')
  const [state, setState] = useState<ScreenState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    setState({ kind: 'loading' })

    void (async () => {
      try {
        let authority: PublicKey
        if (source === 'mine') {
          const adapter = await createKeystoreWalletAdapter()
          authority = adapter.publicKey
        } else {
          authority = new PublicKey(DAY_6_TEST_AUTHORITY)
        }
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
  }, [source])

  return (
    <Screen>
      <Header
        title="Pocket Vault"
        subtitle={`devnet · program ${short(POCKET_VAULT_PROGRAM_ID)}`}
      />

      <View className="flex-row gap-2 mb-5">
        <SourcePill
          label="My vault"
          active={source === 'mine'}
          onPress={() => setSource('mine')}
        />
        <SourcePill
          label="Test wallet vault"
          active={source === 'test'}
          onPress={() => setSource('test')}
        />
      </View>

      {state.kind === 'loading' && (
        <View className="items-center justify-center mt-12">
          <ActivityIndicator color="#A78BFA" />
          <Text className="text-gray-400 mt-3 text-sm">
            Reading vault state from devnet…
          </Text>
        </View>
      )}

      {state.kind === 'error' && (
        <Card padding="md">
          <Text className="text-red-300 font-semibold mb-1">
            Failed to load vault
          </Text>
          <Text className="text-gray-300 text-xs">{state.message}</Text>
        </Card>
      )}

      {state.kind === 'ok' && (
        <View>
          <Section
            title={
              source === 'mine' ? 'Authority (Keystore)' : 'Authority (test wallet)'
            }
          >
            <Card padding="md">
              <View className="flex-row justify-between items-center py-1.5">
                <Text className="text-gray-400 text-sm">address</Text>
                <Address address={state.authority.toBase58()} />
              </View>
            </Card>
          </Section>

          <Section title="Vault PDA">
            <Card padding="md">
              <View className="flex-row justify-between items-center py-1.5">
                <Text className="text-gray-400 text-sm">address</Text>
                <Address address={state.vaultPda.toBase58()} />
              </View>
              {state.vault ? (
                <>
                  <View className="flex-row justify-between items-center py-1.5">
                    <Text className="text-gray-400 text-sm">mint</Text>
                    <Address address={state.vault.mint.toBase58()} />
                  </View>
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
                  {state.ata ? (
                    <View className="flex-row justify-between items-center py-1.5">
                      <Text className="text-gray-400 text-sm">vault ATA</Text>
                      <Address address={state.ata.ata.toBase58()} />
                    </View>
                  ) : (
                    <Pair k="vault ATA" v="—" />
                  )}
                  <Pair
                    k="vault ATA balance"
                    v={state.ata ? fmtUsdcRaw(state.ata.raw) : '—'}
                  />
                </>
              ) : (
                <Text className="text-gray-500 italic mt-1 text-sm">
                  Vault PDA does not exist yet for this authority.
                </Text>
              )}
            </Card>
          </Section>

          <Section title="Policy PDA">
            <Card padding="md">
              <View className="flex-row justify-between items-center py-1.5">
                <Text className="text-gray-400 text-sm">address</Text>
                <Address address={state.policyPda.toBase58()} />
              </View>
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
                <Text className="text-gray-500 italic mt-1 text-sm">
                  No policy installed on this vault yet.
                </Text>
              )}
            </Card>
          </Section>

          <Text className="text-xs text-gray-500 mt-2 leading-relaxed">
            Read-only view. Writes (set_policy, deposit, withdraw_under_policy)
            go through the Policy editor screen.
          </Text>
        </View>
      )}
    </Screen>
  )
}

function SourcePill({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress}>
      <Pill tone={active ? 'accent' : 'neutral'}>{label}</Pill>
    </Pressable>
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
    <View className="mb-5">
      <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
        {title}
      </Text>
      {children}
    </View>
  )
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-gray-400 text-sm">{k}</Text>
      <Text className="text-white text-sm font-medium">{v}</Text>
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
