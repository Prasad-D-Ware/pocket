import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import nacl from 'tweetnacl'
import bs58 from 'bs58'

import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { Button } from '../../../../ui/Button'
import { Address } from '../../../../ui/Address'
import { useHaptic } from '../../../../ui/useHaptic'

import {
  deleteKey,
  generateOrGetKey,
  hasKey,
  isAvailable,
  POCKET_SIGNER_ALIAS,
  sign,
  type PocketKey,
} from '../../../../signer/keystore'

type Status =
  | { kind: 'idle'; available: boolean; hasExistingKey: boolean }
  | { kind: 'busy'; label: string }
  | {
      kind: 'ready'
      key: PocketKey
      message: Uint8Array
      signature: Uint8Array
      verified: boolean
    }
  | { kind: 'error'; message: string }

const TEST_MESSAGE = 'pocket-keystore verification v1'

export default function SignerTestScreen() {
  const trigger = useHaptic()
  const [status, setStatus] = useState<Status>({
    kind: 'busy',
    label: 'checking platform support…',
  })

  useEffect(() => {
    try {
      const available = isAvailable()
      const hasExistingKey = available && hasKey()
      setStatus({ kind: 'idle', available, hasExistingKey })
    } catch (e) {
      setStatus({ kind: 'error', message: errMsg(e) })
    }
  }, [])

  async function onRunVerification() {
    trigger('tap')
    setStatus({ kind: 'busy', label: 'generating / fetching key…' })
    try {
      const key = await generateOrGetKey()
      setStatus({ kind: 'busy', label: 'signing test message…' })
      const message = new TextEncoder().encode(TEST_MESSAGE)
      const signature = await sign(message)
      const verified = nacl.sign.detached.verify(
        message,
        signature,
        key.publicKey,
      )
      if (verified) trigger('success')
      else trigger('error')
      setStatus({ kind: 'ready', key, message, signature, verified })
    } catch (e) {
      trigger('error')
      setStatus({ kind: 'error', message: errMsg(e) })
    }
  }

  async function onReset() {
    trigger('tap')
    try {
      deleteKey()
    } catch {
      // swallow — alias may not exist
    }
    setStatus({
      kind: 'idle',
      available: isAvailable(),
      hasExistingKey: false,
    })
  }

  return (
    <Screen>
      <Header
        title="Keystore signer test"
        subtitle={`Android Keystore Ed25519 · alias ${POCKET_SIGNER_ALIAS}`}
      />

      {status.kind === 'busy' && (
        <View className="items-center mt-8">
          <ActivityIndicator color="#A78BFA" />
          <Text className="text-gray-400 mt-3 text-sm">{status.label}</Text>
        </View>
      )}

      {status.kind === 'error' && (
        <Card padding="md">
          <Text className="text-red-300 font-semibold mb-1">Error</Text>
          <Text className="text-gray-300 text-xs">{status.message}</Text>
        </Card>
      )}

      {status.kind === 'idle' && (
        <View>
          <Section title="Platform">
            <Card padding="md">
              <Pair k="available?" v={status.available ? 'yes' : 'no'} />
              <Pair
                k="existing key?"
                v={
                  status.hasExistingKey
                    ? 'yes (will reuse)'
                    : 'no (will create)'
                }
              />
              <Pair k="alias" v={POCKET_SIGNER_ALIAS} mono />
            </Card>
          </Section>

          {!status.available && (
            <View className="mb-4">
              <Card variant="accent" padding="md">
                <Text className="text-amber-300 text-sm">
                  Requires Android 13 (API 33+) for Ed25519 in Keystore. This
                  device is on an older Android — the module will refuse.
                </Text>
              </Card>
            </View>
          )}

          <View className="gap-2">
            <Button
              variant="primary"
              onPress={onRunVerification}
              disabled={!status.available}
              haptic={false}
            >
              Run signature verification
            </Button>

            {status.hasExistingKey && (
              <Button variant="secondary" onPress={onReset} haptic={false}>
                Delete existing key
              </Button>
            )}
          </View>
        </View>
      )}

      {status.kind === 'ready' && (
        <View>
          <View className="mb-4">
            <Card variant={status.verified ? 'accent' : 'default'} padding="md">
              <Text
                className={`text-base font-bold mb-1 ${status.verified ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {status.verified
                  ? '✓ Signature verified by tweetnacl'
                  : '✗ Verification failed'}
              </Text>
              <Text
                className={`text-xs ${status.verified ? 'text-emerald-200/80' : 'text-gray-300'}`}
              >
                {status.verified
                  ? 'Sig is real Ed25519 — Solana would accept this signature.'
                  : 'Sig did not round-trip. Check Keystore wiring.'}
              </Text>
            </Card>
          </View>

          <Section title="Key">
            <Card padding="md">
              <View className="flex-row justify-between items-center py-1.5">
                <Text className="text-gray-400 text-sm">address (base58)</Text>
                <Address address={status.key.address} />
              </View>
              <Pair
                k="public key (hex)"
                v={short(toHex(status.key.publicKey))}
                mono
              />
              <Pair
                k="public key bytes"
                v={String(status.key.publicKey.length)}
              />
            </Card>
          </Section>

          <Section title="Signature">
            <Card padding="md">
              <Pair k="message" v={`"${TEST_MESSAGE}"`} />
              <Pair
                k="signature bytes"
                v={String(status.signature.length)}
              />
              <Pair
                k="signature (hex)"
                v={short(toHex(status.signature))}
                mono
              />
              <Pair
                k="signature (base58)"
                v={short(bs58.encode(status.signature))}
                mono
              />
            </Card>
          </Section>

          <Button variant="secondary" onPress={onReset} haptic={false}>
            Reset (delete key, start over)
          </Button>
        </View>
      )}
    </Screen>
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

function Pair({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-gray-400 text-sm">{k}</Text>
      <Text
        className={`text-white text-sm ${mono ? 'font-mono' : 'font-medium'}`}
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

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, '0')
  }
  return s
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
