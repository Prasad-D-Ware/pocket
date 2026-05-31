import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'

import { ensureModelLoaded, getModelStatus } from '../llm/model'
import { parseIntent, type ParseOutcome } from '../llm/parser'
import { BENCHMARK_PROMPTS } from '../llm/__benchmarks__/prompts'

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
    setParsing(true)
    setSingleResult(null)
    try {
      const result = await parseIntent(input.trim())
      setSingleResult(result)
    } finally {
      setParsing(false)
    }
  }

  async function onRunBenchmark() {
    if (load.kind !== 'ready' || bench.running) return
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
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="px-6 pt-16 pb-12"
    >
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
        Intent Parser
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        SmolLM2-360M · GBNF grammar · sentence → typed Intent
      </Text>

      {load.kind === 'probing' && (
        <View className="items-center mt-4">
          <ActivityIndicator />
        </View>
      )}

      {load.kind === 'no-model' && (
        <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl p-4 mb-4">
          <Text className="text-amber-800 dark:text-amber-200 font-semibold text-sm">
            Model not downloaded
          </Text>
          <Text className="text-amber-700 dark:text-amber-300 text-xs mt-1">
            Open the LLM Test screen first and download the SmolLM2
            model. Then come back.
          </Text>
        </View>
      )}

      {load.kind === 'loading' && (
        <View className="items-center mt-4">
          <ActivityIndicator />
          <Text className="text-gray-500 dark:text-gray-400 mt-3">
            loading model into RAM…
          </Text>
        </View>
      )}

      {load.kind === 'error' && (
        <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl p-4 mb-4">
          <Text className="text-red-800 dark:text-red-200 font-semibold">
            Error
          </Text>
          <Text className="text-red-700 dark:text-red-300 text-xs mt-1">
            {load.message}
          </Text>
        </View>
      )}

      {load.kind === 'ready' && (
        <>
          <Section title="Parse a sentence">
            <TextInput
              value={input}
              onChangeText={setInput}
              multiline
              autoCapitalize="sentences"
              placeholder="send 1 USDC to alice"
              placeholderTextColor="#9CA3AF"
              className="text-sm text-gray-900 dark:text-white py-2 min-h-[60px]"
            />
            <Pressable
              onPress={onParseSingle}
              disabled={parsing}
              className={`px-6 py-3 rounded-xl mt-2 ${
                parsing
                  ? 'bg-gray-300 dark:bg-gray-800'
                  : 'bg-emerald-600 active:bg-emerald-700'
              }`}
            >
              <Text className="text-white font-bold text-center">
                {parsing ? 'parsing…' : 'Parse'}
              </Text>
            </Pressable>
          </Section>

          {singleResult && (
            <View className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-6">
              {singleResult.ok ? (
                <>
                  <Text className="text-gray-700 dark:text-gray-300 text-xs uppercase mb-1">
                    parsed ({singleResult.durationMs} ms)
                  </Text>
                  <Text
                    selectable
                    className="text-gray-900 dark:text-white text-xs font-mono"
                  >
                    {JSON.stringify(singleResult.llm, null, 2)}
                  </Text>
                  {singleResult.intent && (
                    <>
                      <Text className="text-gray-700 dark:text-gray-300 text-xs uppercase mt-3 mb-1">
                        expanded → Intent
                      </Text>
                      <Text
                        selectable
                        className="text-gray-900 dark:text-white text-xs font-mono"
                      >
                        {JSON.stringify(singleResult.intent, null, 2)}
                      </Text>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Text className="text-red-700 dark:text-red-300 text-xs uppercase mb-1">
                    parse failed · {singleResult.reason} ({singleResult.durationMs} ms)
                  </Text>
                  <Text
                    selectable
                    className="text-red-900 dark:text-red-200 text-xs font-mono"
                  >
                    {singleResult.raw || '(empty)'}
                  </Text>
                </>
              )}
            </View>
          )}

          <Section title="20-prompt benchmark">
            <Pressable
              onPress={onRunBenchmark}
              disabled={bench.running}
              className={`px-6 py-3 rounded-xl mb-3 ${
                bench.running
                  ? 'bg-gray-300 dark:bg-gray-800'
                  : 'bg-indigo-600 active:bg-indigo-700'
              }`}
            >
              <Text className="text-white font-bold text-center">
                {bench.running
                  ? `running ${bench.idx + 1} / ${BENCHMARK_PROMPTS.length}…`
                  : bench.completed
                    ? `Re-run benchmark (${passCount}/${bench.rows.length} = ${passRate}%)`
                    : 'Run benchmark'}
              </Text>
            </Pressable>

            {bench.rows.length > 0 && (
              <>
                <Text
                  className={`text-sm font-bold mb-2 ${
                    passRate >= 90
                      ? 'text-green-700 dark:text-green-300'
                      : passRate >= 70
                        ? 'text-yellow-700 dark:text-yellow-300'
                        : 'text-red-700 dark:text-red-300'
                  }`}
                >
                  pass rate: {passCount}/{bench.rows.length} ({passRate}%)
                </Text>
                {bench.rows.map((r, i) => (
                  <BenchRowView key={i} row={r} />
                ))}
              </>
            )}
          </Section>
        </>
      )}

      <StatusBar style="auto" />
    </ScrollView>
  )
}

function BenchRowView({ row }: { row: BenchRow }) {
  const cls = row.passed
    ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900'
    : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900'
  const icon = row.passed ? '✓' : '✗'
  return (
    <View className={`border rounded-md p-2 mb-1 ${cls}`}>
      <Text className="text-gray-900 dark:text-white text-xs mb-0.5">
        {icon} {row.prompt}
      </Text>
      <Text className="text-gray-600 dark:text-gray-400 text-[10px]">
        expected: {row.expected} · got: {row.actual} · {row.durationMs}ms
      </Text>
      {!row.passed && row.raw && (
        <Text
          className="text-gray-700 dark:text-gray-300 text-[10px] font-mono mt-0.5"
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

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
