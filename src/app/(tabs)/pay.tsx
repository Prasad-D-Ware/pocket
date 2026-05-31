import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/TextField'
import { EmptyState } from '../../ui/EmptyState'
import { useHaptic } from '../../ui/useHaptic'
import { ActivityRow } from '../../components/ActivityRow'
import { RouteResultPanel } from '../../components/RouteResultPanel'
import { openInbox } from '../../inbox/db'
import { useInbox } from '../../inbox/hooks'
import { defaultPolicy } from '../../inbox/simulator'
import { routeSentence, type RouteResult } from '../../inbox/router'
import { getModelStatus } from '../../llm/model'

const DEFAULT_X402_DEMO_URL = 'http://10.0.2.2:4242/api/quote'
const EXAMPLES = [
  'pay api.helius.dev 0.5 USDC for a query',
  'send 1 USDC to alice.sol',
  'send 5 USDC to bob.sol',
]

export default function Pay() {
  const [text, setText] = useState('')
  const [demoUrl, setDemoUrl] = useState(DEFAULT_X402_DEMO_URL)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [routing, setRouting] = useState(false)
  const [result, setResult] = useState<RouteResult | null>(null)
  const trigger = useHaptic()
  const { rows } = useInbox({ status: 'signed', limit: 5, pollMs: 2000 })

  const paymentRows = rows.filter((r) => {
    const sig = r.signed_tx ?? ''
    return sig && !sig.startsWith('SIMULATED_') && !sig.startsWith('MANUAL_')
  })

  async function onSend() {
    if (routing || !text.trim()) return
    const status = await getModelStatus()
    if (status.state !== 'ready') {
      setResult({
        kind: 'parse-failed',
        reason: 'model not downloaded',
        raw: 'Open Settings → Developer → LLM test and download the model.',
        durationMs: 0,
      })
      trigger('warning')
      return
    }
    setRouting(true)
    setResult(null)
    try {
      const r = await routeSentence(text.trim(), {
        runner: openInbox(),
        policy: defaultPolicy(),
        demoX402Url: demoUrl.trim() || DEFAULT_X402_DEMO_URL,
      })
      setResult(r)
      trigger(r.kind === 'signed-real' ? 'success' : 'tap')
    } catch (e) {
      setResult({
        kind: 'parse-failed',
        reason: 'unhandled',
        raw: String((e as Error).message ?? e),
        durationMs: 0,
      })
      trigger('error')
    } finally {
      setRouting(false)
    }
  }

  return (
    <Screen>
      <Header title="Pay" subtitle="What would you like to do?" />

      <TextField
        value={text}
        onChangeText={setText}
        multiline
        placeholder="pay api.helius.dev 0.5 USDC"
        autoCapitalize="sentences"
        autoCorrect={false}
      />

      <View className="flex-row flex-wrap gap-2 mb-4">
        {EXAMPLES.map((ex) => (
          <Pressable
            key={ex}
            onPress={() => setText(ex)}
            className="bg-white/5 px-3 py-2 rounded-full active:opacity-60"
          >
            <Text className="text-gray-300 text-xs">{ex}</Text>
          </Pressable>
        ))}
      </View>

      <View className="mb-4">
        <Button onPress={onSend} variant="primary" size="lg" loading={routing}>
          {routing ? 'parsing + routing…' : 'Send'}
        </Button>
      </View>

      {result && <RouteResultPanel result={result} />}

      <Pressable
        onPress={() => setAdvancedOpen((v) => !v)}
        className="flex-row items-center gap-2 mb-3"
      >
        <Feather
          name={advancedOpen ? 'chevron-down' : 'chevron-right'}
          size={14}
          color="#A1A1AA"
        />
        <Text className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
          Advanced
        </Text>
      </Pressable>
      {advancedOpen && (
        <Card>
          <TextField
            label="x402 demo URL"
            value={demoUrl}
            onChangeText={setDemoUrl}
            autoCapitalize="none"
            autoCorrect={false}
            helper="Where your local x402 server is reachable. Default is the Android emulator → host loopback. Use your Mac's LAN IP or an ngrok URL for a physical device."
          />
        </Card>
      )}

      {paymentRows.length > 0 && (
        <View className="mt-6">
          <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
            Recent payments
          </Text>
          <Card padding="md">
            {paymentRows.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </Card>
        </View>
      )}

      {paymentRows.length === 0 && (
        <View className="mt-6">
          <EmptyState
            icon={<Feather name="zap" size={28} color="#A1A1AA" />}
            title="No paid requests yet"
            body="Tap Send above to make your first on-chain payment."
          />
        </View>
      )}
    </Screen>
  )
}
