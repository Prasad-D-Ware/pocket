import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { Button } from '../../../../ui/Button'
import { TextField } from '../../../../ui/TextField'
import { useHaptic } from '../../../../ui/useHaptic'

import { ensureModelLoaded, getModelStatus } from '../../../../llm/model'
import { parseIntent, type ParseOutcome } from '../../../../llm/parser'
import { BENCHMARK_PROMPTS } from '../../../../llm/__benchmarks__/prompts'

type LoadState =
  | { kind: 'probing' }
  | { kind: 'no-model' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

type BenchRow = {
  prompt: string
  expected: 'token_transfer' | 'x402_payment' | 'refuse'
  actual: 'token_transfer' | 'x402_payment' | 'refuse' | 'error'
  raw: string
  durationMs: number
  passed: boolean
}

export default function ParserTestScreen() {
  const trigger = useHaptic()
  const [load, setLoad] = useState<LoadState>({ kind: 'probing' })
  const [input, setInput] = useState('pay api.helius.dev 0.5 USDC')
  const [singleResult, setSingleResult] = useState<ParseOutcome | null>(null)
  const [parsing, setParsing] = useState(false)
  const [bench, setBench] = useState<{
    rows: BenchRow[]
    idx: number
    running: boolean
    completed: boolean
  }>({ rows: [], idx: 0, running: false, completed: false })

  useEffect(() => {
    void (async () => {
      try {
        const status = await getModelStatus()
        if (status.state !== 'ready') {
          setLoad({ kind: 'no-model' })
          return
        }
        setLoad({ kind: 'loading' })
        await ensureModelLoaded()
        setLoad({ kind: 'ready' })
      } catch (e) {
        setLoad({ kind: 'error', message: errMsg(e) })
      }
    })()
  }, [])

  async function onParseSingle() {
    if (load.kind !== 'ready' || parsing) return
    if (!input.trim()) return
    trigger('tap')
    setParsing(true)
    setSingleResult(null)
    try {
      const result = await parseIntent(input.trim())
      if (result.ok) trigger('success')
      else trigger('error')
      setSingleResult(result)
    } finally {
      setParsing(false)
    }
  }

  async function onRunBenchmark() {
    if (load.kind !== 'ready' || bench.running) return
    trigger('tap')
    setBench({ rows: [], idx: 0, running: true, completed: false })
    const rows: BenchRow[] = []
    for (let i = 0; i < BENCHMARK_PROMPTS.length; i++) {
      const p = BENCHMARK_PROMPTS[i]!
      setBench({ rows: [...rows], idx: i, running: true, completed: false })
      let actual: BenchRow['actual'] = 'error'
      let raw = ''
      let durationMs = 0
      try {
        const r = await parseIntent(p.prompt)
        durationMs = r.durationMs
        raw = r.raw
        if (r.ok) actual = r.llm.kind
      } catch (e) {
        raw = errMsg(e)
      }
      rows.push({
        prompt: p.prompt,
        expected: p.expectedKind,
        actual,
        raw,
        durationMs,
        passed: actual === p.expectedKind,
      })
    }
    trigger('success')
    setBench({
      rows,
      idx: BENCHMARK_PROMPTS.length,
      running: false,
      completed: true,
    })
  }

  const passCount = bench.rows.filter((r) => r.passed).length
  const passRate =
    bench.rows.length > 0
      ? Math.round((passCount / bench.rows.length) * 100)
      : 0

  return (
    <Screen>
      <Header
        title="Intent parser"
        subtitle="SmolLM2-360M · GBNF grammar · sentence → typed Intent"
      />

      {load.kind === 'probing' && (
        <View className="items-center mt-4">
          <ActivityIndicator color="#A78BFA" />
        </View>
      )}

      {load.kind === 'no-model' && (
        <Card variant="accent" padding="md">
          <Text className="text-amber-300 font-semibold text-sm">
            Model not downloaded
          </Text>
          <Text className="text-amber-200/80 text-xs mt-1">
            Open the LLM Test screen first and download the SmolLM2 model.
            Then come back.
          </Text>
        </Card>
      )}

      {load.kind === 'loading' && (
        <View className="items-center mt-4">
          <ActivityIndicator color="#A78BFA" />
          <Text className="text-gray-400 mt-3 text-sm">
            loading model into RAM…
          </Text>
        </View>
      )}

      {load.kind === 'error' && (
        <Card padding="md">
          <Text className="text-red-300 font-semibold">Error</Text>
          <Text className="text-gray-300 text-xs mt-1">{load.message}</Text>
        </Card>
      )}

      {load.kind === 'ready' && (
        <>
          <Section title="Parse a sentence">
            <Card padding="md">
              <TextField
                value={input}
                onChangeText={setInput}
                multiline
                autoCapitalize="sentences"
                placeholder="send 1 USDC to alice"
              />
              <Button
                variant="primary"
                onPress={onParseSingle}
                loading={parsing}
                disabled={parsing}
                haptic={false}
              >
                {parsing ? 'parsing…' : 'Parse'}
              </Button>
            </Card>
          </Section>

          {singleResult && (
            <View className="mb-5">
              <Card padding="md">
                {singleResult.ok ? (
                  <>
                    <Text className="text-gray-400 text-xs uppercase mb-1">
                      parsed ({singleResult.durationMs} ms)
                    </Text>
                    <Text
                      selectable
                      className="text-white text-xs font-mono"
                    >
                      {JSON.stringify(singleResult.llm, null, 2)}
                    </Text>
                    {singleResult.intent && (
                      <>
                        <Text className="text-gray-400 text-xs uppercase mt-3 mb-1">
                          expanded → Intent
                        </Text>
                        <Text
                          selectable
                          className="text-white text-xs font-mono"
                        >
                          {JSON.stringify(singleResult.intent, null, 2)}
                        </Text>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Text className="text-red-300 text-xs uppercase mb-1">
                      parse failed · {singleResult.reason} (
                      {singleResult.durationMs} ms)
                    </Text>
                    <Text
                      selectable
                      className="text-gray-300 text-xs font-mono"
                    >
                      {singleResult.raw || '(empty)'}
                    </Text>
                  </>
                )}
              </Card>
            </View>
          )}

          <Section title="20-prompt benchmark">
            <Card padding="md">
              <Button
                variant="primary"
                onPress={onRunBenchmark}
                loading={bench.running}
                disabled={bench.running}
                haptic={false}
              >
                {bench.running
                  ? `running ${bench.idx + 1} / ${BENCHMARK_PROMPTS.length}…`
                  : bench.completed
                    ? `Re-run benchmark (${passCount}/${bench.rows.length} = ${passRate}%)`
                    : 'Run benchmark'}
              </Button>

              {bench.rows.length > 0 && (
                <View className="mt-3">
                  <Text
                    className={`text-sm font-bold mb-2 ${
                      passRate >= 90
                        ? 'text-emerald-300'
                        : passRate >= 70
                          ? 'text-amber-300'
                          : 'text-red-300'
                    }`}
                  >
                    pass rate: {passCount}/{bench.rows.length} ({passRate}%)
                  </Text>
                  {bench.rows.map((r, i) => (
                    <BenchRowView key={i} row={r} />
                  ))}
                </View>
              )}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  )
}

function BenchRowView({ row }: { row: BenchRow }) {
  const colorClass = row.passed ? 'text-emerald-300' : 'text-red-300'
  const icon = row.passed ? '✓' : '✗'
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 6,
        padding: 8,
        marginBottom: 4,
      }}
    >
      <Text className={`text-xs mb-0.5 ${colorClass}`}>
        {icon}{' '}
        <Text className="text-white">{row.prompt}</Text>
      </Text>
      <Text style={{ color: '#71717A', fontSize: 10 }}>
        expected: {row.expected} · got: {row.actual} · {row.durationMs}ms
      </Text>
      {!row.passed && row.raw && (
        <Text
          style={{ color: '#A1A1AA', fontSize: 10, marginTop: 2, fontFamily: 'monospace' }}
          numberOfLines={2}
        >
          {row.raw}
        </Text>
      )}
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

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
