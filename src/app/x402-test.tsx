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
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import { DEVNET_RPC } from '../anchor/constants'
import { createPocketPayClient } from '../x402/payClient'
import {
  createKeystoreWalletAdapter,
  type KeystoreWalletAdapter,
} from '../x402/keystoreWalletAdapter'

// Same mint the Day 9 server expects. Treasury also matches —
// see tools/x402-server/constants.ts.
const FAKE_USDC_MINT = 'BofnM1aZaTJfxpoDD82oDJQEcSEyKtHjEEEUujCmE29v'
const FAKE_USDC_DECIMALS = 6
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
    setState({ ...state, busy: 'refreshing' })
    const balances = await fetchBalances(state.adapter.publicKey)
    setState({ ...state, busy: 'idle', sol: balances.sol, usdc: balances.usdc })
  }

  async function onPay() {
    if (state.kind !== 'ready' || state.busy !== 'idle') return
    if (!state.url.trim()) {
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
      setState({
        ...state,
        busy: 'idle',
        result: { kind: 'err', message: errMsg(e) },
      })
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="px-6 pt-16 pb-12"
    >
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
        x402 Test
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Pay a real x402 endpoint with the Keystore key
      </Text>

      {state.kind === 'loading' && (
        <View className="items-center mt-8">
          <ActivityIndicator />
          <Text className="text-gray-500 dark:text-gray-400 mt-3">
            {state.label}
          </Text>
        </View>
      )}

      {state.kind === 'error' && <ErrorPanel message={state.message} />}

      {state.kind === 'ready' && (
        <View>
          <Section title="Signer">
            <Pair k="SOL" v={state.sol === null ? '—' : `${state.sol}`} />
            <Pair
              k="fake-USDC"
              v={state.usdc?.ui ?? '— (no ATA)'}
            />
            <Text className="text-gray-600 dark:text-gray-400 text-xs mt-2 mb-1">
              address (long-press to copy)
            </Text>
            <Text
              selectable
              className="text-gray-900 dark:text-white text-xs font-mono"
            >
              {state.adapter.address}
            </Text>
          </Section>

          {(state.usdc === null ||
            Number(state.usdc?.atomic ?? '0') < 10_000) && (
            <View className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900 rounded-xl p-4 mb-6">
              <Text className="text-yellow-800 dark:text-yellow-200 text-xs font-semibold mb-1">
                Address needs fake-USDC before paying
              </Text>
              <Text className="text-yellow-700 dark:text-yellow-300 text-xs leading-relaxed">
                From your Mac, run:{'\n'}
                <Text className="font-mono">
                  cd tools/x402-server{'\n'}
                  npm run mint-to -- {state.adapter.address.slice(0, 12)}…
                </Text>
                {'\n'}Then tap Refresh.
              </Text>
            </View>
          )}

          <Section title="Server URL">
            <TextInput
              value={state.url}
              onChangeText={(t) => setState({ ...state, url: t })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://10.0.2.2:4242/api/quote"
              placeholderTextColor="#9CA3AF"
              className="text-sm font-mono text-gray-900 dark:text-white py-2"
            />
            <Text className="text-gray-500 dark:text-gray-400 text-xs mt-2 leading-relaxed">
              Defaults to <Text className="font-mono">10.0.2.2:4242</Text>{' '}
              (Android emulator → host loopback). For a physical device, use
              your Mac's LAN IP or an ngrok tunnel URL.
            </Text>
          </Section>

          <Pressable
            onPress={onPay}
            disabled={state.busy !== 'idle'}
            className={`px-6 py-4 rounded-xl mb-3 ${
              state.busy === 'idle'
                ? 'bg-emerald-600 active:bg-emerald-700'
                : 'bg-gray-300 dark:bg-gray-800'
            }`}
          >
            <Text className="text-white font-bold text-center">
              {state.busy === 'paying'
                ? 'building + signing payment…'
                : 'Make paid request'}
            </Text>
          </Pressable>

          <Pressable
            onPress={onRefresh}
            disabled={state.busy !== 'idle'}
            className="px-6 py-2 rounded-xl mb-6 bg-gray-200 dark:bg-gray-800 active:bg-gray-300"
          >
            <Text className="text-gray-800 dark:text-gray-200 font-semibold text-center text-xs">
              {state.busy === 'refreshing' ? 'refreshing…' : 'Refresh balance'}
            </Text>
          </Pressable>

          {state.result.kind === 'err' && (
            <ErrorPanel message={state.result.message} />
          )}

          {state.result.kind === 'ok' && (
            <View className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl p-4 mb-4">
              <Text className="text-green-800 dark:text-green-200 font-bold mb-2">
                ✓ Paid + got 200 from x402 endpoint
              </Text>
              {state.result.paymentSig && (
                <View className="mb-3">
                  <Text className="text-green-700 dark:text-green-300 text-xs mb-1">
                    payment tx
                  </Text>
                  <Text className="text-green-900 dark:text-green-100 text-xs font-mono mb-1">
                    {short(state.result.paymentSig)}
                  </Text>
                  <Pressable
                    onPress={() =>
                      Linking.openURL(
                        `https://explorer.solana.com/tx/${state.result.kind === 'ok' ? state.result.paymentSig : ''}?cluster=devnet`,
                      )
                    }
                  >
                    <Text className="text-green-700 dark:text-green-300 text-xs underline">
                      open on Solana Explorer
                    </Text>
                  </Pressable>
                </View>
              )}
              <Text className="text-green-700 dark:text-green-300 text-xs mb-1">
                response body
              </Text>
              <Text className="text-green-900 dark:text-green-100 text-xs font-mono">
                {JSON.stringify(state.result.body, null, 2)}
              </Text>
            </View>
          )}
        </View>
      )}

      <StatusBar style="auto" />
    </ScrollView>
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

function ErrorPanel({ message }: { message: string }) {
  return (
    <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl p-4 mb-4">
      <Text className="text-red-800 dark:text-red-200 font-semibold mb-1">
        Error
      </Text>
      <Text className="text-red-700 dark:text-red-300 text-xs">{message}</Text>
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
      <Text className="text-gray-900 dark:text-white text-sm font-medium">
        {v}
      </Text>
    </View>
  )
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
