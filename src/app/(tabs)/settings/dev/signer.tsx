import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
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
      setStatus({ kind: 'ready', key, message, signature, verified })
    } catch (e) {
      setStatus({ kind: 'error', message: errMsg(e) })
    }
  }

  async function onReset() {
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
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="px-6 pt-16 pb-12"
    >
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
        Keystore Signer Test
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Android Keystore Ed25519 · alias {POCKET_SIGNER_ALIAS}
      </Text>

      {status.kind === 'busy' && (
        <View className="items-center mt-8">
          <ActivityIndicator />
          <Text className="text-gray-500 dark:text-gray-400 mt-3">
            {status.label}
          </Text>
        </View>
      )}

      {status.kind === 'error' && (
        <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl p-4">
          <Text className="text-red-800 dark:text-red-200 font-semibold mb-1">
            Error
          </Text>
          <Text className="text-red-700 dark:text-red-300 text-xs">
            {status.message}
          </Text>
        </View>
      )}

      {status.kind === 'idle' && (
        <View>
          <Section title="Platform">
            <Pair k="available?" v={status.available ? 'yes' : 'no'} />
            <Pair
              k="existing key?"
              v={status.hasExistingKey ? 'yes (will reuse)' : 'no (will create)'}
            />
            <Pair k="alias" v={POCKET_SIGNER_ALIAS} mono />
          </Section>

          {!status.available && (
            <View className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900 rounded-xl p-4 mb-4">
              <Text className="text-yellow-800 dark:text-yellow-200 text-sm">
                Requires Android 13 (API 33+) for Ed25519 in Keystore. This
                device is on an older Android — the module will refuse.
              </Text>
            </View>
          )}

          <Pressable
            onPress={onRunVerification}
            disabled={!status.available}
            className={`px-6 py-4 rounded-xl mt-4 ${
              status.available
                ? 'bg-blue-600 active:bg-blue-700'
                : 'bg-gray-300 dark:bg-gray-800'
            }`}
          >
            <Text className="text-white font-bold text-center">
              Run signature verification
            </Text>
          </Pressable>

          {status.hasExistingKey && (
            <Pressable
              onPress={onReset}
              className="px-6 py-3 rounded-xl mt-3 bg-gray-200 dark:bg-gray-800 active:bg-gray-300 dark:active:bg-gray-700"
            >
              <Text className="text-gray-800 dark:text-gray-200 font-semibold text-center text-sm">
                Delete existing key
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {status.kind === 'ready' && (
        <View>
          <View
            className={`rounded-xl p-4 mb-6 ${
              status.verified
                ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900'
                : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900'
            }`}
          >
            <Text
              className={`text-base font-bold mb-1 ${
                status.verified
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}
            >
              {status.verified
                ? '✓ Signature verified by tweetnacl'
                : '✗ Verification failed'}
            </Text>
            <Text
              className={`text-xs ${
                status.verified
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-red-700 dark:text-red-300'
              }`}
            >
              {status.verified
                ? 'Sig is real Ed25519 — Solana would accept this signature.'
                : 'Sig did not round-trip. Check Keystore wiring.'}
            </Text>
          </View>

          <Section title="Key">
            <Pair k="address (base58)" v={short(status.key.address)} mono />
            <Pair
              k="public key (hex)"
              v={short(toHex(status.key.publicKey))}
              mono
            />
            <Pair k="public key bytes" v={String(status.key.publicKey.length)} />
          </Section>

          <Section title="Signature">
            <Pair k="message" v={`"${TEST_MESSAGE}"`} />
            <Pair k="signature bytes" v={String(status.signature.length)} />
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
          </Section>

          <Pressable
            onPress={onReset}
            className="px-6 py-3 rounded-xl mt-2 bg-gray-200 dark:bg-gray-800 active:bg-gray-300 dark:active:bg-gray-700"
          >
            <Text className="text-gray-800 dark:text-gray-200 font-semibold text-center text-sm">
              Reset (delete key, start over)
            </Text>
          </Pressable>
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
        className={`text-gray-900 dark:text-white text-sm ${
          mono ? 'font-mono' : 'font-medium'
        }`}
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
