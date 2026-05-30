import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { BN } from '@coral-xyz/anchor'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'

import { DEVNET_RPC } from '../anchor/constants'
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
} from '../anchor/client'
import {
  createAnchorWalletAdapter,
  type AnchorWalletAdapter,
} from '../anchor/anchorWalletAdapter'

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
    setAction({ busy: 'opening', lastSig: null, lastError: null })
    try {
      const client = createWritableClient(load.adapter, DEVNET_RPC)
      const sig = await openVault(
        client,
        load.adapter.publicKey,
        new PublicKey(FAKE_USDC_MINT),
      )
      setAction({ busy: 'idle', lastSig: sig, lastError: null })
      await refresh()
    } catch (e) {
      setAction({ busy: 'idle', lastSig: null, lastError: errMsg(e) })
    }
  }

  async function onSetPolicy() {
    if (load.kind !== 'ready' || action.busy !== 'idle') return
    const parsed = parseForm(form)
    if (!parsed.ok) {
      setAction({ ...action, lastError: parsed.error })
      return
    }
    setAction({ busy: 'setting', lastSig: null, lastError: null })
    try {
      const client = createWritableClient(load.adapter, DEVNET_RPC)
      const sig = await setPolicy(client, load.adapter.publicKey, parsed.args)
      setAction({ busy: 'idle', lastSig: sig, lastError: null })
      await refresh()
    } catch (e) {
      setAction({ busy: 'idle', lastSig: null, lastError: errMsg(e) })
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="px-6 pt-16 pb-12"
    >
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
        Policy Editor
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        devnet · pocket_vault · signed by Keystore
      </Text>

      {load.kind === 'loading' && (
        <View className="items-center mt-8">
          <ActivityIndicator />
          <Text className="text-gray-500 dark:text-gray-400 mt-3">
            {load.label}
          </Text>
        </View>
      )}

      {load.kind === 'error' && (
        <ErrorPanel title="Failed to load" message={load.message} />
      )}

      {load.kind === 'ready' && (
        <>
          <Section title="Authority">
            <Pair
              k="SOL"
              v={load.sol === null ? '—' : load.sol.toString()}
            />
            <Text className="text-gray-600 dark:text-gray-400 text-xs mt-2 mb-1">
              address (long-press to copy)
            </Text>
            <Text
              selectable
              className="text-gray-900 dark:text-white text-xs font-mono"
            >
              {load.adapter.address}
            </Text>
          </Section>

          {!load.vault?.data ? (
            <View>
              <View className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900 rounded-xl p-4 mb-4">
                <Text className="text-yellow-800 dark:text-yellow-200 font-semibold text-sm mb-1">
                  No vault yet for this authority
                </Text>
                <Text className="text-yellow-700 dark:text-yellow-300 text-xs leading-relaxed">
                  pocket_vault is a per-authority PDA. Opening the vault
                  initializes the PDA + a vault ATA for fake-USDC
                  ({short(FAKE_USDC_MINT)}). Rent ≈ 0.003 SOL.
                </Text>
              </View>

              {(load.sol ?? 0) < 0.01 && (
                <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl p-4 mb-4">
                  <Text className="text-red-800 dark:text-red-200 font-semibold text-sm mb-1">
                    Authority has 0 SOL — openVault will fail at simulation
                  </Text>
                  <Text className="text-red-700 dark:text-red-300 text-xs leading-relaxed mb-2">
                    Fund this address from your Mac (covers SOL + fake-USDC):
                  </Text>
                  <Text
                    selectable
                    className="text-red-900 dark:text-red-100 text-xs font-mono leading-relaxed"
                  >
                    cd pocket/tools/x402-server{'\n'}
                    npm run mint-to -- {load.adapter.address}
                  </Text>
                  <Text className="text-red-700 dark:text-red-300 text-xs mt-2 leading-relaxed">
                    Then tap Open vault again.
                  </Text>
                </View>
              )}

              <Pressable
                onPress={onOpenVault}
                disabled={action.busy !== 'idle' || (load.sol ?? 0) < 0.01}
                className={`px-6 py-4 rounded-xl mb-3 ${
                  action.busy === 'idle' && (load.sol ?? 0) >= 0.01
                    ? 'bg-blue-600 active:bg-blue-700'
                    : 'bg-gray-300 dark:bg-gray-800'
                }`}
              >
                <Text className="text-white font-bold text-center">
                  {action.busy === 'opening'
                    ? 'opening vault…'
                    : '1) Open vault'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Section title="Vault">
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
            </Section>
          )}

          {load.vault?.data && (
            <>
              <Section title="Policy form">
                <NumberField
                  label="max per tx (USDC)"
                  value={form.maxPerTx}
                  onChange={(v) => setForm({ ...form, maxPerTx: v })}
                />
                <NumberField
                  label="max per day (USDC)"
                  value={form.maxPerDay}
                  onChange={(v) => setForm({ ...form, maxPerDay: v })}
                />
                <NumberField
                  label="expiry slot (0 = never)"
                  value={form.expirySlot}
                  onChange={(v) => setForm({ ...form, expirySlot: v })}
                />
                <NumberField
                  label="slots per window (216000 ≈ 24h)"
                  value={form.slotsPerWindow}
                  onChange={(v) => setForm({ ...form, slotsPerWindow: v })}
                />
              </Section>

              <Pressable
                onPress={onSetPolicy}
                disabled={action.busy !== 'idle'}
                className={`px-6 py-4 rounded-xl mb-3 ${
                  action.busy === 'idle'
                    ? 'bg-emerald-600 active:bg-emerald-700'
                    : 'bg-gray-300 dark:bg-gray-800'
                }`}
              >
                <Text className="text-white font-bold text-center">
                  {action.busy === 'setting'
                    ? 'signing + sending…'
                    : load.policy
                      ? 'Update on-chain policy'
                      : 'Push policy on-chain'}
                </Text>
              </Pressable>

              {load.policy && (
                <Section title="Current on-chain policy">
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
                </Section>
              )}
            </>
          )}

          {action.lastError && (
            <ErrorPanel title="Error" message={action.lastError} />
          )}

          {action.lastSig && (
            <View className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl p-4 mt-2">
              <Text className="text-green-800 dark:text-green-200 font-bold mb-1">
                ✓ tx confirmed
              </Text>
              <Text className="text-green-900 dark:text-green-100 text-xs font-mono mb-1">
                {short(action.lastSig)}
              </Text>
              <Pressable
                onPress={() =>
                  Linking.openURL(
                    `https://explorer.solana.com/tx/${action.lastSig}?cluster=devnet`,
                  )
                }
              >
                <Text className="text-green-700 dark:text-green-300 text-xs underline">
                  open on Solana Explorer
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      <StatusBar style="auto" />
    </ScrollView>
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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <View className="mb-3">
      <Text className="text-gray-600 dark:text-gray-400 text-xs mb-1">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        autoCapitalize="none"
        autoCorrect={false}
        className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-md px-3 py-2 text-gray-900 dark:text-white text-sm font-mono"
      />
    </View>
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

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-gray-600 dark:text-gray-400 text-sm">{k}</Text>
      <Text className="text-gray-900 dark:text-white text-sm font-medium font-mono">
        {v}
      </Text>
    </View>
  )
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl p-4 mb-4">
      <Text className="text-red-800 dark:text-red-200 font-semibold mb-1">
        {title}
      </Text>
      <Text className="text-red-700 dark:text-red-300 text-xs">{message}</Text>
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
