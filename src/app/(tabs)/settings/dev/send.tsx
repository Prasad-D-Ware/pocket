import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'
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
  type Address as KitAddress,
} from '@solana/kit'
import { getTransferSolInstruction } from '@solana-program/system'

import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { Button } from '../../../../ui/Button'
import { Address } from '../../../../ui/Address'
import { useHaptic } from '../../../../ui/useHaptic'

import {
  createPocketKitSigner,
  type PocketSigner,
} from '../../../../signer/pocketSigner'
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
  const trigger = useHaptic()
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
    trigger('tap')
    const balance = await fetchBalance(state.signer.address)
    setState({ ...state, balanceLamports: balance })
  }

  async function onAirdrop() {
    if (state.kind !== 'ready' || state.busy !== 'idle') return
    trigger('tap')
    setState({ ...state, busy: 'airdropping', lastError: null })
    try {
      const rpc = createSolanaRpc(DEVNET_RPC)
      const sig = await rpc
        .requestAirdrop(state.signer.address, lamports(AIRDROP_LAMPORTS))
        .send()
      await sleep(2000)
      const balance = await fetchBalance(state.signer.address)
      trigger('success')
      setState({
        ...state,
        busy: 'idle',
        airdropSig: sig,
        balanceLamports: balance,
        lastError: null,
      })
    } catch (e) {
      trigger('error')
      setState({
        ...state,
        busy: 'idle',
        lastError: friendlyAirdropError(e),
      })
    }
  }

  async function onSend() {
    if (state.kind !== 'ready' || state.busy !== 'idle') return
    trigger('tap')
    setState({ ...state, busy: 'sending', lastError: null })
    try {
      const sig = await sendSelfTransfer(state.signer, SELF_TRANSFER_LAMPORTS)
      await sleep(1500)
      const balance = await fetchBalance(state.signer.address)
      trigger('success')
      setState({
        ...state,
        busy: 'idle',
        sendSig: sig,
        balanceLamports: balance,
        lastError: null,
      })
    } catch (e) {
      trigger('error')
      setState({ ...state, busy: 'idle', lastError: errMsg(e) })
    }
  }

  return (
    <Screen>
      <Header
        title="Send test"
        subtitle="Sign a real devnet SOL transfer with the Keystore key"
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
              <Pair
                k="balance"
                v={
                  state.balanceLamports === null
                    ? '—'
                    : fmtSol(state.balanceLamports)
                }
              />
              <View className="mt-2">
                <Text className="text-gray-500 text-xs mb-1">address</Text>
                <Address address={state.signer.address} truncate={false} />
              </View>
            </Card>
          </Section>

          <View className="gap-2 mb-4">
            <Button
              variant="primary"
              onPress={onAirdrop}
              loading={state.busy === 'airdropping'}
              disabled={state.busy !== 'idle'}
              haptic={false}
            >
              {state.busy === 'airdropping'
                ? 'requesting airdrop…'
                : '1) Airdrop 0.5 SOL (devnet)'}
            </Button>

            <Button
              variant="primary"
              onPress={onSend}
              loading={state.busy === 'sending'}
              disabled={
                state.busy !== 'idle' ||
                (state.balanceLamports ?? 0n) <
                  SELF_TRANSFER_LAMPORTS + 5_000n
              }
              haptic={false}
            >
              {state.busy === 'sending'
                ? 'signing + sending…'
                : '2) Send 0.000001 SOL to self (signed by Keystore)'}
            </Button>

            <Button variant="ghost" onPress={reloadBalance} haptic={false}>
              Refresh balance
            </Button>
          </View>

          {state.lastError && <ErrorCard message={state.lastError} />}

          {(state.lastError || (state.balanceLamports ?? 0n) === 0n) && (
            <View className="mb-4">
              <Card padding="md">
                <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
                  If devnet faucet is rate-limited
                </Text>
                <Text className="text-gray-300 text-xs mb-2">
                  Fund this address manually with any of:
                </Text>
                <Text className="text-gray-300 text-xs mb-1">
                  • Web faucet:{' '}
                  <Text
                    className="underline text-violet-300"
                    onPress={() => Linking.openURL('https://faucet.solana.com')}
                  >
                    faucet.solana.com
                  </Text>{' '}
                  (paste address, select devnet)
                </Text>
                <Text className="text-gray-300 text-xs mb-1">
                  • CLI:{' '}
                  <Text className="font-mono">
                    solana transfer{' '}
                    {state.signer.address.slice(0, 6)}…{' '}
                    0.1 --allow-unfunded-recipient -u devnet
                  </Text>
                </Text>
                <Text className="text-gray-300 text-xs">
                  Then tap Refresh balance.
                </Text>
              </Card>
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
              footer="The Keystore key produced a real Ed25519 signature that the Solana validator accepted. Full path: Pocket → Kit signer → keystore.sign → Solana RPC."
            />
          )}
        </View>
      )}
    </Screen>
  )
}

async function fetchBalance(addr: KitAddress): Promise<bigint | null> {
  try {
    const rpc = createSolanaRpc(DEVNET_RPC)
    const { value } = await rpc
      .getBalance(addr, { commitment: 'confirmed' })
      .send()
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
  const titleColor =
    tone === 'success' ? 'text-emerald-300' : 'text-violet-300'
  const bodyColor =
    tone === 'success' ? 'text-emerald-200/80' : 'text-violet-200/80'
  return (
    <View className="mb-4">
      <Card variant="accent" padding="md">
        <Text className={`font-bold mb-1 ${titleColor}`}>{title}</Text>
        <Text className={`text-xs mb-2 font-mono ${bodyColor}`}>
          {short(sig)}
        </Text>
        <Pressable onPress={() => Linking.openURL(url)}>
          <Text className={`text-xs underline ${titleColor}`}>
            open on Solana Explorer
          </Text>
        </Pressable>
        {footer && (
          <Text className={`text-xs mt-2 ${bodyColor}`}>{footer}</Text>
        )}
      </Card>
    </View>
  )
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
