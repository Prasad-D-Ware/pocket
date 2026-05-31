import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import {
  appendTransactionMessageInstruction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'

import { createPocketKitSigner, type PocketSigner } from '../../../../signer/pocketSigner'
import { DEVNET_RPC } from '../../../../anchor/constants'

const LAMPORTS_PER_SOL = 1_000_000_000n
const SELF_TRANSFER_LAMPORTS = 1_000n // 0.000001 SOL — minimal but non-zero
// Devnet faucet caps individual requests; 0.5 SOL is reliably under
// the per-call limit and gives us 5+ tx-fees of headroom.
const AIRDROP_LAMPORTS = 500_000_000n // 0.5 SOL

type State =
  | { kind: 'loading'; label: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      signer: PocketSigner
      balanceLamports: bigint | null
      busy: 'idle' | 'airdropping' | 'sending'
      airdropSig: string | null
      sendSig: string | null
      lastError: string | null
    }

export default function SendTestScreen() {
  const [state, setState] = useState<State>({
    kind: 'loading',
    label: 'loading Keystore signer…',
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const signer = await createPocketKitSigner()
        if (cancelled) return
        const balance = await fetchBalance(signer.address)
        if (cancelled) return
        setState({
          kind: 'ready',
          signer,
          balanceLamports: balance,
          busy: 'idle',
          airdropSig: null,
          sendSig: null,
          lastError: null,
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

  async function reloadBalance() {
    if (state.kind !== 'ready') return
    const balance = await fetchBalance(state.signer.address)
    setState({ ...state, balanceLamports: balance })
  }

  async function onAirdrop() {
    if (state.kind !== 'ready' || state.busy !== 'idle') return
    setState({ ...state, busy: 'airdropping', lastError: null })
    try {
      const rpc = createSolanaRpc(DEVNET_RPC)
      const sig = await rpc
        .requestAirdrop(state.signer.address, lamports(AIRDROP_LAMPORTS))
        .send()
      // Tiny grace period for the airdrop to land on the RPC node.
      await sleep(2000)
      const balance = await fetchBalance(state.signer.address)
      setState({
        ...state,
        busy: 'idle',
        airdropSig: sig,
        balanceLamports: balance,
        lastError: null,
      })
    } catch (e) {
      setState({
        ...state,
        busy: 'idle',
        lastError: friendlyAirdropError(e),
      })
    }
  }

  async function onSend() {
    if (state.kind !== 'ready' || state.busy !== 'idle') return
    setState({ ...state, busy: 'sending', lastError: null })
    try {
      const sig = await sendSelfTransfer(state.signer, SELF_TRANSFER_LAMPORTS)
      await sleep(1500)
      const balance = await fetchBalance(state.signer.address)
      setState({
        ...state,
        busy: 'idle',
        sendSig: sig,
        balanceLamports: balance,
        lastError: null,
      })
    } catch (e) {
      setState({ ...state, busy: 'idle', lastError: errMsg(e) })
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="px-6 pt-16 pb-12"
    >
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
        Send Test
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Sign a real devnet SOL transfer with the Keystore key
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
            <Pair
              k="balance"
              v={
                state.balanceLamports === null
                  ? '—'
                  : fmtSol(state.balanceLamports)
              }
            />
            <Text className="text-gray-600 dark:text-gray-400 text-xs mt-2 mb-1">
              address (long-press to copy)
            </Text>
            <Text
              selectable
              className="text-gray-900 dark:text-white text-xs font-mono"
            >
              {state.signer.address}
            </Text>
          </Section>

          <Pressable
            onPress={onAirdrop}
            disabled={state.busy !== 'idle'}
            className={`px-6 py-4 rounded-xl mb-3 ${
              state.busy === 'idle'
                ? 'bg-blue-600 active:bg-blue-700'
                : 'bg-gray-300 dark:bg-gray-800'
            }`}
          >
            <Text className="text-white font-bold text-center">
              {state.busy === 'airdropping'
                ? 'requesting airdrop…'
                : '1) Airdrop 0.5 SOL (devnet)'}
            </Text>
          </Pressable>

          <Pressable
            onPress={onSend}
            disabled={
              state.busy !== 'idle' ||
              (state.balanceLamports ?? 0n) < SELF_TRANSFER_LAMPORTS + 5_000n
            }
            className={`px-6 py-4 rounded-xl mb-3 ${
              state.busy === 'idle' &&
              (state.balanceLamports ?? 0n) >= SELF_TRANSFER_LAMPORTS + 5_000n
                ? 'bg-gray-900 dark:bg-gray-100 active:opacity-80'
                : 'bg-gray-300 dark:bg-gray-800'
            }`}
          >
            <Text
              className={`font-bold text-center ${
                state.busy === 'idle' &&
                (state.balanceLamports ?? 0n) >= SELF_TRANSFER_LAMPORTS + 5_000n
                  ? 'text-white dark:text-gray-900'
                  : 'text-white'
              }`}
            >
              {state.busy === 'sending'
                ? 'signing + sending…'
                : '2) Send 0.000001 SOL to self (signed by Keystore)'}
            </Text>
          </Pressable>

          <Pressable
            onPress={reloadBalance}
            className="px-6 py-2 rounded-xl mb-6 bg-gray-200 dark:bg-gray-800 active:bg-gray-300"
          >
            <Text className="text-gray-800 dark:text-gray-200 font-semibold text-center text-xs">
              Refresh balance
            </Text>
          </Pressable>

          {state.lastError && <ErrorPanel message={state.lastError} />}

          {(state.lastError || (state.balanceLamports ?? 0n) === 0n) && (
            <View className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4">
              <Text className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 font-semibold">
                If devnet faucet is rate-limited
              </Text>
              <Text className="text-gray-700 dark:text-gray-300 text-xs mb-2">
                Fund this address manually with any of:
              </Text>
              <Text className="text-gray-700 dark:text-gray-300 text-xs mb-1">
                • Web faucet:{' '}
                <Text
                  className="underline text-blue-700 dark:text-blue-300"
                  onPress={() => Linking.openURL('https://faucet.solana.com')}
                >
                  faucet.solana.com
                </Text>{' '}
                (paste address, select devnet)
              </Text>
              <Text className="text-gray-700 dark:text-gray-300 text-xs mb-1">
                • CLI:{' '}
                <Text className="font-mono">
                  solana transfer{' '}
                  {state.signer.address.slice(0, 6)}…{' '}
                  0.1 --allow-unfunded-recipient -u devnet
                </Text>
              </Text>
              <Text className="text-gray-700 dark:text-gray-300 text-xs">
                Then tap Refresh balance.
              </Text>
            </View>
          )}

          {state.airdropSig && (
            <ResultPanel
              title="Airdrop landed"
              sig={state.airdropSig}
              tone="info"
            />
          )}

          {state.sendSig && (
            <ResultPanel
              title="✓ Transfer signed by Keystore + confirmed on devnet"
              sig={state.sendSig}
              tone="success"
              footer="The Keystore key produced a real Ed25519 signature that the Solana validator accepted. This is the full Day 8 path: Pocket → Kit signer → keystore.sign → Solana RPC."
            />
          )}
        </View>
      )}

      <StatusBar style="auto" />
    </ScrollView>
  )
}

async function fetchBalance(addr: Address): Promise<bigint | null> {
  try {
    const rpc = createSolanaRpc(DEVNET_RPC)
    const { value } = await rpc.getBalance(addr, { commitment: 'confirmed' }).send()
    return BigInt(value)
  } catch {
    return null
  }
}

async function sendSelfTransfer(
  signer: PocketSigner,
  amount: bigint,
): Promise<string> {
  const rpc = createSolanaRpc(DEVNET_RPC)
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({
          source: signer,
          destination: signer.address,
          amount,
        }),
        m,
      ),
  )

  const signedTx = await signTransactionMessageWithSigners(message)
  const wire = getBase64EncodedWireTransaction(signedTx)

  const signature = await rpc
    .sendTransaction(wire, {
      encoding: 'base64',
      preflightCommitment: 'confirmed',
      skipPreflight: false,
      maxRetries: 5n,
    })
    .send()

  return signature
}

function ResultPanel({
  title,
  sig,
  tone,
  footer,
}: {
  title: string
  sig: string
  tone: 'success' | 'info'
  footer?: string
}) {
  const url = `https://explorer.solana.com/tx/${sig}?cluster=devnet`
  return (
    <View
      className={`rounded-xl p-4 mb-4 ${
        tone === 'success'
          ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900'
          : 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900'
      }`}
    >
      <Text
        className={`font-bold mb-1 ${
          tone === 'success'
            ? 'text-green-800 dark:text-green-200'
            : 'text-blue-800 dark:text-blue-200'
        }`}
      >
        {title}
      </Text>
      <Text
        className={`text-xs mb-2 font-mono ${
          tone === 'success'
            ? 'text-green-700 dark:text-green-300'
            : 'text-blue-700 dark:text-blue-300'
        }`}
      >
        {short(sig)}
      </Text>
      <Pressable onPress={() => Linking.openURL(url)}>
        <Text
          className={`text-xs underline ${
            tone === 'success'
              ? 'text-green-700 dark:text-green-300'
              : 'text-blue-700 dark:text-blue-300'
          }`}
        >
          open on Solana Explorer
        </Text>
      </Pressable>
      {footer && (
        <Text
          className={`text-xs mt-2 ${
            tone === 'success'
              ? 'text-green-700 dark:text-green-300'
              : 'text-blue-700 dark:text-blue-300'
          }`}
        >
          {footer}
        </Text>
      )}
    </View>
  )
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
  if (s.length <= 16) return s
  return s.slice(0, 8) + '…' + s.slice(-6)
}

function fmtSol(l: bigint): string {
  const sol = Number(l) / Number(LAMPORTS_PER_SOL)
  return `${sol.toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL`
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

// Devnet airdrop failures usually come back as "Internal JSON-RPC
// error" with no detail. In practice that means one of:
//   - per-IP daily faucet cap reached
//   - per-call lamport limit exceeded
//   - faucet temporarily down
// Surface a useful next step instead of the raw RPC noise.
function friendlyAirdropError(e: unknown): string {
  const raw = errMsg(e)
  if (/Internal/.test(raw) || /rate.?limit/i.test(raw)) {
    return (
      'Devnet faucet rejected the request (likely rate-limited). ' +
      'Try again in a minute, or fund the address manually from ' +
      'faucet.solana.com or your CLI wallet — see the fallback below.'
    )
  }
  return raw
}
