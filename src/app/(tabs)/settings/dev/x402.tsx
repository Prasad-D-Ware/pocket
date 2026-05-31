import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { Button } from '../../../../ui/Button'
import { TextField } from '../../../../ui/TextField'
import { Address } from '../../../../ui/Address'
import { useHaptic } from '../../../../ui/useHaptic'

import { DEVNET_RPC } from '../../../../anchor/constants'
import { createPocketPayClient } from '../../../../x402/payClient'
import {
  createKeystoreWalletAdapter,
  type KeystoreWalletAdapter,
} from '../../../../x402/keystoreWalletAdapter'

// Same mint the Day 9 server expects. Treasury also matches —
// see tools/x402-server/constants.ts.
const FAKE_USDC_MINT = 'BofnM1aZaTJfxpoDD82oDJQEcSEyKtHjEEEUujCmE29v'
// Belt against a misconfig serving an absurd amount. The Day 9 route
// is 0.01 fake-USDC.
const MAX_AMOUNT_ATOMIC = 50_000n // 0.05 fake-USDC
const DEFAULT_SERVER_URL = 'http://10.0.2.2:4242/api/quote'

type State =
  | { kind: 'loading'; label: string }
  | {
      kind: 'ready'
      adapter: KeystoreWalletAdapter
      sol: number | null
      usdc: { ui: string; atomic: string } | null
      url: string
      busy: 'idle' | 'paying' | 'refreshing'
      result:
        | { kind: 'idle' }
        | { kind: 'ok'; body: unknown; paymentSig: string | null }
        | { kind: 'err'; message: string }
    }
  | { kind: 'error'; message: string }

export default function X402TestScreen() {
  const trigger = useHaptic()
  const [state, setState] = useState<State>({
    kind: 'loading',
    label: 'loading Keystore key…',
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const adapter = await createKeystoreWalletAdapter()
        if (cancelled) return
        const balances = await fetchBalances(adapter.publicKey)
        if (cancelled) return
        setState({
          kind: 'ready',
          adapter,
          sol: balances.sol,
          usdc: balances.usdc,
          url: DEFAULT_SERVER_URL,
          busy: 'idle',
          result: { kind: 'idle' },
        })
      } catch (e) {
        if (cancelled) return
        setState({ kind: 'error', message: errMsg(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onRefresh() {
    if (state.kind !== 'ready' || state.busy !== 'idle') return
    trigger('tap')
    setState({ ...state, busy: 'refreshing' })
    const balances = await fetchBalances(state.adapter.publicKey)
    setState({ ...state, busy: 'idle', sol: balances.sol, usdc: balances.usdc })
  }

  async function onPay() {
    if (state.kind !== 'ready' || state.busy !== 'idle') return
    trigger('tap')
    if (!state.url.trim()) {
      trigger('error')
      setState({
        ...state,
        result: { kind: 'err', message: 'enter a server URL' },
      })
      return
    }
    setState({ ...state, busy: 'paying', result: { kind: 'idle' } })
    try {
      const client = createPocketPayClient({
        wallet: state.adapter,
        network: 'solana-devnet',
        rpcUrl: DEVNET_RPC,
        maxAmountAtomic: MAX_AMOUNT_ATOMIC,
      })
      const res = await client.fetch(state.url.trim())
      const body = await res
        .json()
        .catch(() => ({ rawText: '<non-json body>' }))
      const balances = await fetchBalances(state.adapter.publicKey)
      if (res.status !== 200) {
        trigger('error')
        setState({
          ...state,
          busy: 'idle',
          sol: balances.sol,
          usdc: balances.usdc,
          result: {
            kind: 'err',
            message: `server returned ${res.status}: ${JSON.stringify(body)}`,
          },
        })
        return
      }
      trigger('success')
      setState({
        ...state,
        busy: 'idle',
        sol: balances.sol,
        usdc: balances.usdc,
        result: {
          kind: 'ok',
          body,
          paymentSig: extractPaymentSig(body),
        },
      })
    } catch (e) {
      trigger('error')
      setState({
        ...state,
        busy: 'idle',
        result: { kind: 'err', message: errMsg(e) },
      })
    }
  }

  return (
    <Screen>
      <Header
        title="x402 test"
        subtitle="Pay a real x402 endpoint with the Keystore key"
      />

      {state.kind === 'loading' && (
        <View className="items-center mt-8">
          <ActivityIndicator color="#A78BFA" />
          <Text className="text-gray-400 mt-3 text-sm">{state.label}</Text>
        </View>
      )}

      {state.kind === 'error' && <ErrorCard message={state.message} />}

      {state.kind === 'ready' && (
        <View>
          <Section title="Signer">
            <Card padding="md">
              <Pair k="SOL" v={state.sol === null ? '—' : `${state.sol}`} />
              <Pair k="fake-USDC" v={state.usdc?.ui ?? '— (no ATA)'} />
              <View className="mt-2">
                <Text className="text-gray-500 text-xs mb-1">address</Text>
                <Address address={state.adapter.address} truncate={false} />
              </View>
            </Card>
          </Section>

          {(state.usdc === null ||
            Number(state.usdc?.atomic ?? '0') < 10_000) && (
            <View className="mb-5">
              <Card variant="accent" padding="md">
                <Text className="text-amber-300 text-xs font-semibold mb-1">
                  Address needs fake-USDC before paying
                </Text>
                <Text className="text-amber-200/80 text-xs leading-relaxed">
                  From your Mac, run:{'\n'}
                  <Text className="font-mono">
                    cd tools/x402-server{'\n'}
                    npm run mint-to -- {state.adapter.address.slice(0, 12)}…
                  </Text>
                  {'\n'}Then tap Refresh.
                </Text>
              </Card>
            </View>
          )}

          <Section title="Server URL">
            <Card padding="md">
              <TextField
                value={state.url}
                onChangeText={(t) => setState({ ...state, url: t })}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="http://10.0.2.2:4242/api/quote"
              />
              <Text className="text-gray-500 text-xs leading-relaxed">
                Defaults to <Text className="font-mono">10.0.2.2:4242</Text>{' '}
                (Android emulator → host loopback). For a physical device, use
                your Mac's LAN IP or an ngrok tunnel URL.
              </Text>
            </Card>
          </Section>

          <View className="gap-2 mb-4">
            <Button
              variant="primary"
              onPress={onPay}
              loading={state.busy === 'paying'}
              disabled={state.busy !== 'idle'}
              haptic={false}
            >
              {state.busy === 'paying'
                ? 'building + signing payment…'
                : 'Make paid request'}
            </Button>

            <Button
              variant="ghost"
              onPress={onRefresh}
              disabled={state.busy !== 'idle'}
              haptic={false}
            >
              {state.busy === 'refreshing'
                ? 'refreshing…'
                : 'Refresh balance'}
            </Button>
          </View>

          {state.result.kind === 'err' && (
            <ErrorCard message={state.result.message} />
          )}

          {state.result.kind === 'ok' && (
            <View className="mb-4">
              <Card variant="accent" padding="md">
                <Text className="text-emerald-300 font-bold mb-2">
                  ✓ Paid + got 200 from x402 endpoint
                </Text>
                {state.result.paymentSig && (
                  <View className="mb-3">
                    <Text className="text-emerald-200/80 text-xs mb-1">
                      payment tx
                    </Text>
                    <Text className="text-white text-xs font-mono mb-1">
                      {short(state.result.paymentSig)}
                    </Text>
                    <Pressable
                      onPress={() =>
                        Linking.openURL(
                          `https://explorer.solana.com/tx/${state.result.kind === 'ok' ? state.result.paymentSig : ''}?cluster=devnet`,
                        )
                      }
                    >
                      <Text className="text-violet-300 text-xs underline">
                        open on Solana Explorer
                      </Text>
                    </Pressable>
                  </View>
                )}
                <Text className="text-emerald-200/80 text-xs mb-1">
                  response body
                </Text>
                <Text className="text-white text-xs font-mono">
                  {JSON.stringify(state.result.body, null, 2)}
                </Text>
              </Card>
            </View>
          )}
        </View>
      )}
    </Screen>
  )
}

async function fetchBalances(addr: PublicKey): Promise<{
  sol: number | null
  usdc: { ui: string; atomic: string } | null
}> {
  const conn = new Connection(DEVNET_RPC, 'confirmed')
  let sol: number | null = null
  let usdc: { ui: string; atomic: string } | null = null
  try {
    const lamports = await conn.getBalance(addr, 'confirmed')
    sol = lamports / LAMPORTS_PER_SOL
  } catch {
    /* leave null */
  }
  try {
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(FAKE_USDC_MINT),
      addr,
    )
    const bal = await conn.getTokenAccountBalance(ata, 'confirmed')
    usdc = { ui: bal.value.uiAmountString ?? '0', atomic: bal.value.amount }
  } catch {
    /* leave null — ATA not initialized yet is the common case */
  }
  return { sol, usdc }
}

// Server.ts puts the facilitator response (with the on-chain tx sig)
// at body.payment.facilitator_response.transaction. Future endpoints
// may put it elsewhere — dig defensively.
function extractPaymentSig(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const payment = b.payment as Record<string, unknown> | undefined
  const facResp = payment?.facilitator_response as
    | Record<string, unknown>
    | undefined
  const tx = facResp?.transaction
  if (typeof tx === 'string') return tx
  return null
}

function short(s: string): string {
  if (s.length <= 16) return s
  return s.slice(0, 8) + '…' + s.slice(-6)
}

function ErrorCard({ message }: { message: string }) {
  return (
    <View className="mb-4">
      <Card padding="md">
        <Text className="text-red-300 font-semibold mb-1">Error</Text>
        <Text className="text-gray-300 text-xs">{message}</Text>
      </Card>
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

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
