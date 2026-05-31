import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'
import { BN } from '@coral-xyz/anchor'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'

import { Screen } from '../../../ui/Screen'
import { Header } from '../../../ui/Header'
import { Card } from '../../../ui/Card'
import { Button } from '../../../ui/Button'
import { TextField } from '../../../ui/TextField'
import { Address } from '../../../ui/Address'
import { useHaptic } from '../../../ui/useHaptic'

import { DEVNET_RPC } from '../../../anchor/constants'
import {
  createReadOnlyClient,
  createWritableClient,
  deriveVaultPda,
  derivePolicyPda,
  fetchPolicy,
  fetchVault,
  openVault,
  setPolicy,
  type PolicyAccount,
  type VaultAccount,
} from '../../../anchor/client'
import {
  createAnchorWalletAdapter,
  type AnchorWalletAdapter,
} from '../../../anchor/anchorWalletAdapter'

const FAKE_USDC_MINT = 'BofnM1aZaTJfxpoDD82oDJQEcSEyKtHjEEEUujCmE29v'
const USDC_DECIMALS = 6
const SLOTS_PER_DAY_DEFAULT = '216000' // ~24h at 400 ms / slot

type LoadState =
  | { kind: 'loading'; label: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      adapter: AnchorWalletAdapter
      sol: number | null
      vault: { pda: PublicKey; data: VaultAccount } | null
      policy: { pda: PublicKey; data: PolicyAccount } | null
    }

type Form = {
  maxPerTx: string
  maxPerDay: string
  expirySlot: string
  slotsPerWindow: string
}

type Action = {
  busy: 'idle' | 'opening' | 'setting'
  lastSig: string | null
  lastError: string | null
}

export default function PolicyEditorScreen() {
  const trigger = useHaptic()
  const [load, setLoad] = useState<LoadState>({
    kind: 'loading',
    label: 'loading Keystore + vault state…',
  })
  const [form, setForm] = useState<Form>({
    maxPerTx: '5',
    maxPerDay: '50',
    expirySlot: '0',
    slotsPerWindow: SLOTS_PER_DAY_DEFAULT,
  })
  const [action, setAction] = useState<Action>({
    busy: 'idle',
    lastSig: null,
    lastError: null,
  })

  async function refresh() {
    try {
      const adapter = await createAnchorWalletAdapter()
      const ro = createReadOnlyClient(DEVNET_RPC)
      const [vaultPda] = deriveVaultPda(adapter.publicKey)
      const [policyPda] = derivePolicyPda(vaultPda)
      const vaultResult = await fetchVault(ro, adapter.publicKey)
      const policyResult = vaultResult
        ? await fetchPolicy(ro, vaultPda)
        : null
      const sol = await fetchSol(adapter.publicKey)

      if (policyResult?.data) {
        // Hydrate the form from the on-chain policy so updates start
        // from the user's last-saved values, not the defaults.
        const p = policyResult.data
        setForm({
          maxPerTx: fmtUsdcFromBn(p.maxPerTxBaseUnits),
          maxPerDay: fmtUsdcFromBn(p.maxPerDayBaseUnits),
          expirySlot: p.expirySlot.toString(),
          slotsPerWindow: p.slotsPerWindow.toString(),
        })
      }

      setLoad({
        kind: 'ready',
        adapter,
        sol,
        vault: vaultResult
          ? { pda: vaultResult.vault, data: vaultResult.data }
          : { pda: vaultPda, data: null as unknown as VaultAccount }, // sentinel
        policy: policyResult
          ? { pda: policyResult.policy, data: policyResult.data }
          : null,
      })
    } catch (e) {
      setLoad({ kind: 'error', message: errMsg(e) })
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onOpenVault() {
    if (load.kind !== 'ready' || action.busy !== 'idle') return
    trigger('tap')
    setAction({ busy: 'opening', lastSig: null, lastError: null })
    try {
      const client = createWritableClient(load.adapter, DEVNET_RPC)
      const sig = await openVault(
        client,
        load.adapter.publicKey,
        new PublicKey(FAKE_USDC_MINT),
      )
      trigger('success')
      setAction({ busy: 'idle', lastSig: sig, lastError: null })
      await refresh()
    } catch (e) {
      trigger('error')
      setAction({ busy: 'idle', lastSig: null, lastError: errMsg(e) })
    }
  }

  async function onSetPolicy() {
    if (load.kind !== 'ready' || action.busy !== 'idle') return
    trigger('tap')
    const parsed = parseForm(form)
    if (!parsed.ok) {
      trigger('error')
      setAction({ ...action, lastError: parsed.error })
      return
    }
    setAction({ busy: 'setting', lastSig: null, lastError: null })
    try {
      const client = createWritableClient(load.adapter, DEVNET_RPC)
      const sig = await setPolicy(client, load.adapter.publicKey, parsed.args)
      trigger('success')
      setAction({ busy: 'idle', lastSig: sig, lastError: null })
      await refresh()
    } catch (e) {
      trigger('error')
      setAction({ busy: 'idle', lastSig: null, lastError: errMsg(e) })
    }
  }

  return (
    <Screen>
      <Header
        title="Policy editor"
        subtitle="devnet · pocket_vault · signed by Keystore"
      />

      {load.kind === 'loading' && (
        <View className="items-center mt-8">
          <ActivityIndicator color="#A78BFA" />
          <Text className="text-gray-400 mt-3 text-sm">{load.label}</Text>
        </View>
      )}

      {load.kind === 'error' && (
        <ErrorCard title="Failed to load" message={load.message} />
      )}

      {load.kind === 'ready' && (
        <>
          <Section title="Authority">
            <Card padding="md">
              <Pair k="SOL" v={load.sol === null ? '—' : load.sol.toString()} />
              <View className="mt-2">
                <Text className="text-gray-500 text-xs mb-1">address</Text>
                <Address address={load.adapter.address} truncate={false} />
              </View>
            </Card>
          </Section>

          {!load.vault?.data ? (
            <>
              <Card variant="accent" padding="md">
                <Text className="text-violet-200 font-semibold text-sm mb-1">
                  No vault yet for this authority
                </Text>
                <Text className="text-violet-200/80 text-xs leading-relaxed">
                  pocket_vault is a per-authority PDA. Opening the vault
                  initializes the PDA + a vault ATA for fake-USDC
                  ({short(FAKE_USDC_MINT)}). Rent ≈ 0.003 SOL.
                </Text>
              </Card>

              {(load.sol ?? 0) < 0.01 && (
                <View className="mt-3">
                  <Card padding="md">
                    <Text className="text-red-300 font-semibold text-sm mb-1">
                      Authority has 0 SOL — openVault will fail at simulation
                    </Text>
                    <Text className="text-gray-400 text-xs leading-relaxed mb-2">
                      Fund this address from your Mac (covers SOL + fake-USDC):
                    </Text>
                    <Text
                      selectable
                      className="text-gray-200 text-xs font-mono leading-relaxed"
                    >
                      cd pocket/tools/x402-server{'\n'}
                      npm run mint-to -- {load.adapter.address}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-2 leading-relaxed">
                      Then tap Open vault again.
                    </Text>
                  </Card>
                </View>
              )}

              <View className="mt-3">
                <Button
                  variant="primary"
                  onPress={onOpenVault}
                  loading={action.busy === 'opening'}
                  disabled={action.busy !== 'idle' || (load.sol ?? 0) < 0.01}
                  haptic={false}
                >
                  {action.busy === 'opening' ? 'opening vault…' : '1) Open vault'}
                </Button>
              </View>
            </>
          ) : (
            <Section title="Vault">
              <Card padding="md">
                <Pair k="PDA" v={short(load.vault.pda.toBase58())} />
                <Pair k="mint" v={short(load.vault.data.mint.toBase58())} />
                <Pair
                  k="policy set?"
                  v={load.vault.data.policySet ? 'yes' : 'no'}
                />
                <Pair
                  k="opened at slot"
                  v={load.vault.data.openedAtSlot.toString()}
                />
              </Card>
            </Section>
          )}

          {load.vault?.data && (
            <>
              <Section title="Policy form">
                <Card padding="md">
                  <TextField
                    label="max per tx (USDC)"
                    value={form.maxPerTx}
                    onChangeText={(v) => setForm({ ...form, maxPerTx: v })}
                    keyboardType="decimal-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextField
                    label="max per day (USDC)"
                    value={form.maxPerDay}
                    onChangeText={(v) => setForm({ ...form, maxPerDay: v })}
                    keyboardType="decimal-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextField
                    label="expiry slot (0 = never)"
                    value={form.expirySlot}
                    onChangeText={(v) => setForm({ ...form, expirySlot: v })}
                    keyboardType="decimal-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextField
                    label="slots per window (216000 ≈ 24h)"
                    value={form.slotsPerWindow}
                    onChangeText={(v) =>
                      setForm({ ...form, slotsPerWindow: v })
                    }
                    keyboardType="decimal-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Card>
              </Section>

              <View className="mb-4">
                <Button
                  variant="primary"
                  onPress={onSetPolicy}
                  loading={action.busy === 'setting'}
                  disabled={action.busy !== 'idle'}
                  haptic={false}
                >
                  {action.busy === 'setting'
                    ? 'signing + sending…'
                    : load.policy
                      ? 'Update on-chain policy'
                      : 'Push policy on-chain'}
                </Button>
              </View>

              {load.policy && (
                <Section title="Current on-chain policy">
                  <Card padding="md">
                    <Pair
                      k="max per tx"
                      v={`${fmtUsdcFromBn(load.policy.data.maxPerTxBaseUnits)} USDC`}
                    />
                    <Pair
                      k="max per day"
                      v={`${fmtUsdcFromBn(load.policy.data.maxPerDayBaseUnits)} USDC`}
                    />
                    <Pair
                      k="spent in window"
                      v={`${fmtUsdcFromBn(load.policy.data.spentInWindow)} USDC`}
                    />
                    <Pair
                      k="window start slot"
                      v={load.policy.data.dailyWindowStartSlot.toString()}
                    />
                    <Pair
                      k="slots per window"
                      v={load.policy.data.slotsPerWindow.toString()}
                    />
                    <Pair
                      k="expiry slot"
                      v={
                        load.policy.data.expirySlot.toString() === '0'
                          ? 'never'
                          : load.policy.data.expirySlot.toString()
                      }
                    />
                  </Card>
                </Section>
              )}
            </>
          )}

          {action.lastError && (
            <ErrorCard title="Error" message={action.lastError} />
          )}

          {action.lastSig && (
            <Card variant="accent" padding="md">
              <Text className="text-emerald-300 font-bold mb-1">
                ✓ tx confirmed
              </Text>
              <Text className="text-gray-200 text-xs font-mono mb-1">
                {short(action.lastSig)}
              </Text>
              <Pressable
                onPress={() =>
                  Linking.openURL(
                    `https://explorer.solana.com/tx/${action.lastSig}?cluster=devnet`,
                  )
                }
              >
                <Text className="text-violet-300 text-xs underline">
                  open on Solana Explorer
                </Text>
              </Pressable>
            </Card>
          )}
        </>
      )}
    </Screen>
  )
}

type ParseResult =
  | {
      ok: true
      args: {
        maxPerTxBaseUnits: BN
        maxPerDayBaseUnits: BN
        expirySlot: BN
        slotsPerWindow: BN
      }
    }
  | { ok: false; error: string }

function parseForm(f: Form): ParseResult {
  const maxPerTx = Number(f.maxPerTx)
  const maxPerDay = Number(f.maxPerDay)
  const expirySlot = Number(f.expirySlot)
  const slotsPerWindow = Number(f.slotsPerWindow)
  if (!Number.isFinite(maxPerTx) || maxPerTx < 0) {
    return { ok: false, error: 'max per tx must be a non-negative number' }
  }
  if (!Number.isFinite(maxPerDay) || maxPerDay < 0) {
    return { ok: false, error: 'max per day must be a non-negative number' }
  }
  if (maxPerDay < maxPerTx) {
    return { ok: false, error: 'max per day must be ≥ max per tx' }
  }
  if (!Number.isFinite(expirySlot) || expirySlot < 0 || !Number.isInteger(expirySlot)) {
    return { ok: false, error: 'expiry slot must be a non-negative integer' }
  }
  if (
    !Number.isFinite(slotsPerWindow) ||
    slotsPerWindow <= 0 ||
    !Number.isInteger(slotsPerWindow)
  ) {
    return { ok: false, error: 'slots per window must be a positive integer' }
  }
  return {
    ok: true,
    args: {
      maxPerTxBaseUnits: new BN(Math.round(maxPerTx * 10 ** USDC_DECIMALS)),
      maxPerDayBaseUnits: new BN(Math.round(maxPerDay * 10 ** USDC_DECIMALS)),
      expirySlot: new BN(expirySlot),
      slotsPerWindow: new BN(slotsPerWindow),
    },
  }
}

async function fetchSol(addr: PublicKey): Promise<number | null> {
  try {
    const conn = new Connection(DEVNET_RPC, 'confirmed')
    const lamports = await conn.getBalance(addr, 'confirmed')
    return lamports / LAMPORTS_PER_SOL
  } catch {
    return null
  }
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
      <Text className="text-white text-sm font-medium font-mono">{v}</Text>
    </View>
  )
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <View className="mb-4">
      <Card padding="md">
        <Text className="text-red-300 font-semibold mb-1">{title}</Text>
        <Text className="text-gray-300 text-xs">{message}</Text>
      </Card>
    </View>
  )
}

function short(s: string): string {
  if (s.length <= 16) return s
  return s.slice(0, 8) + '…' + s.slice(-6)
}

function fmtUsdcFromBn(bn: { toString: () => string }): string {
  const raw = bn.toString()
  const n = Number(raw) / 10 ** USDC_DECIMALS
  if (!Number.isFinite(n)) return raw
  return n.toFixed(USDC_DECIMALS).replace(/\.?0+$/, '')
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
