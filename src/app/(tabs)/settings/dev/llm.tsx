import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'

import { MODEL_FILENAME, MODEL_SIZE_MB, MODEL_URL } from '../../../../llm/constants'
import {
  deleteModelFile,
  ensureModelLoaded,
  getModelStatus,
  releaseModel,
  type ModelStatus,
} from '../../../../llm/model'
import { startDownload, type DownloadHandle, type DownloadProgress } from '../../../../llm/download'

type Screen =
  | { kind: 'probing' }
  | { kind: 'idle'; status: ModelStatus }
  | { kind: 'downloading'; progress: DownloadProgress }
  | { kind: 'download-failed'; message: string }
  | { kind: 'loading'; loadFraction: number }
  | { kind: 'load-failed'; message: string }
  | {
      kind: 'ready'
      prompt: string
      output: string | null
      durationMs: number | null
      tokensPerSec: number | null
      generating: boolean
    }

const DEFAULT_PROMPT = 'Write a one-sentence haiku about a small wallet.'

export default function LlmTestScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: 'probing' })
  const dlRef = useRef<DownloadHandle | null>(null)

  async function refresh() {
    setScreen({ kind: 'probing' })
    try {
      const status = await getModelStatus()
      setScreen({ kind: 'idle', status })
    } catch (e) {
      setScreen({ kind: 'idle', status: { state: 'missing' } })
    }
  }

  useEffect(() => {
    void refresh()
    return () => {
      // Free model RAM when leaving the screen — be a good citizen.
      void releaseModel()
    }
  }, [])

  async function onDownload() {
    setScreen({
      kind: 'downloading',
      progress: { bytesWritten: 0, totalBytes: 0, fraction: 0 },
    })
    const handle = startDownload((p) =>
      setScreen({ kind: 'downloading', progress: p }),
    )
    dlRef.current = handle
    try {
      await handle.promise
      dlRef.current = null
      await refresh()
    } catch (e) {
      dlRef.current = null
      setScreen({ kind: 'download-failed', message: errMsg(e) })
    }
  }

  async function onCancelDownload() {
    if (dlRef.current) await dlRef.current.cancel()
    dlRef.current = null
    await refresh()
  }

  async function onDelete() {
    await deleteModelFile()
    await refresh()
  }

  async function onLoad() {
    setScreen({ kind: 'loading', loadFraction: 0 })
    try {
      await ensureModelLoaded((fraction) =>
        setScreen({ kind: 'loading', loadFraction: fraction }),
      )
      setScreen({
        kind: 'ready',
        prompt: DEFAULT_PROMPT,
        output: null,
        durationMs: null,
        tokensPerSec: null,
        generating: false,
      })
    } catch (e) {
      setScreen({ kind: 'load-failed', message: errMsg(e) })
    }
  }

  async function onGenerate() {
    if (screen.kind !== 'ready' || screen.generating) return
    const prompt = screen.prompt.trim()
    if (!prompt) return
    setScreen({ ...screen, generating: true, output: null, durationMs: null, tokensPerSec: null })
    try {
      const ctx = await ensureModelLoaded()
      const t0 = Date.now()
      // SmolLM2-Instruct expects ChatML formatting. Passing `messages`
      // + `jinja: true` makes llama.rn apply the GGUF's stored chat
      // template (and pick up its eos_token), so we get the assistant
      // reply back as plain text instead of an immediate <|im_end|>.
      const result = await ctx.completion({
        messages: [
          {
            role: 'system',
            content:
              'You are a concise assistant. Answer in one short sentence.',
          },
          { role: 'user', content: prompt },
        ],
        jinja: true,
        n_predict: 96,
        temperature: 0.7,
        top_p: 0.9,
      })
      const durationMs = Date.now() - t0
      const tokens = result.tokens_predicted ?? 0
      setScreen({
        ...screen,
        generating: false,
        output: result.text ?? '',
        durationMs,
        tokensPerSec: tokens > 0 ? Math.round((tokens / durationMs) * 1000) : null,
      })
    } catch (e) {
      setScreen({
        ...screen,
        generating: false,
        output: `Error: ${errMsg(e)}`,
      })
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="px-6 pt-16 pb-12"
    >
      <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mb-1">
        LLM Test
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        SmolLM2-360M Q4_K_M · llama.rn · on-device, no API
      </Text>

      <Section title="Model">
        <Pair k="file" v={MODEL_FILENAME} mono />
        <Pair k="approx size" v={`${MODEL_SIZE_MB} MB`} />
        <Pair k="status" v={screenLabel(screen)} />
        {screen.kind === 'idle' && screen.status.state !== 'missing' && (
          <Pair
            k="on disk"
            v={`${(screen.status.bytes / 1024 / 1024).toFixed(1)} MB`}
          />
        )}
      </Section>

      {screen.kind === 'probing' && (
        <View className="items-center mt-4">
          <ActivityIndicator />
        </View>
      )}

      {screen.kind === 'idle' && screen.status.state === 'missing' && (
        <View>
          <View className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-xl p-4 mb-4">
            <Text className="text-amber-800 dark:text-amber-200 font-semibold text-sm mb-1">
              One-time download (~{MODEL_SIZE_MB} MB)
            </Text>
            <Text className="text-amber-700 dark:text-amber-300 text-xs leading-relaxed">
              Downloads from huggingface.co/bartowski to your device's
              app-private storage. Stays there across sessions. Wifi
              recommended.
            </Text>
          </View>
          <Pressable
            onPress={onDownload}
            className="bg-blue-600 active:bg-blue-700 px-6 py-4 rounded-xl mb-2"
          >
            <Text className="text-white font-bold text-center">
              Download model
            </Text>
          </Pressable>
        </View>
      )}

      {screen.kind === 'idle' && screen.status.state === 'partial' && (
        <View>
          <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl p-4 mb-4">
            <Text className="text-red-800 dark:text-red-200 font-semibold text-sm">
              Partial download detected — file is smaller than expected. Re-download.
            </Text>
          </View>
          <Pressable
            onPress={onDownload}
            className="bg-blue-600 active:bg-blue-700 px-6 py-4 rounded-xl mb-2"
          >
            <Text className="text-white font-bold text-center">
              Re-download
            </Text>
          </Pressable>
        </View>
      )}

      {screen.kind === 'idle' && screen.status.state === 'ready' && (
        <View>
          <Pressable
            onPress={onLoad}
            className="bg-blue-600 active:bg-blue-700 px-6 py-4 rounded-xl mb-2"
          >
            <Text className="text-white font-bold text-center">
              Load model into memory
            </Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            className="bg-gray-200 dark:bg-gray-800 active:bg-gray-300 px-6 py-2 rounded-xl"
          >
            <Text className="text-gray-700 dark:text-gray-200 font-semibold text-center text-xs">
              Delete model file
            </Text>
          </Pressable>
        </View>
      )}

      {screen.kind === 'downloading' && (
        <View>
          <ProgressBar fraction={screen.progress.fraction} />
          <Text className="text-gray-600 dark:text-gray-400 text-xs mt-2 text-center">
            {bytesLabel(screen.progress.bytesWritten)} /{' '}
            {bytesLabel(screen.progress.totalBytes)}{' '}
            ({(screen.progress.fraction * 100).toFixed(1)}%)
          </Text>
          <Pressable
            onPress={onCancelDownload}
            className="bg-gray-200 dark:bg-gray-800 active:bg-gray-300 px-6 py-2 rounded-xl mt-3"
          >
            <Text className="text-gray-700 dark:text-gray-200 font-semibold text-center text-xs">
              Cancel
            </Text>
          </Pressable>
        </View>
      )}

      {screen.kind === 'download-failed' && (
        <ErrorPanel title="Download failed" message={screen.message} />
      )}

      {screen.kind === 'loading' && (
        <View>
          <Text className="text-gray-600 dark:text-gray-400 text-sm text-center mb-2">
            Loading model into RAM…
          </Text>
          <ProgressBar fraction={screen.loadFraction} />
          <Text className="text-gray-500 dark:text-gray-400 text-xs mt-2 text-center">
            First load can take 5–15s on the emulator.
          </Text>
        </View>
      )}

      {screen.kind === 'load-failed' && (
        <ErrorPanel title="Load failed" message={screen.message} />
      )}

      {screen.kind === 'ready' && (
        <View>
          <Section title="Prompt">
            <TextInput
              value={screen.prompt}
              onChangeText={(t) => setScreen({ ...screen, prompt: t })}
              multiline
              autoCapitalize="sentences"
              className="text-sm text-gray-900 dark:text-white py-2 min-h-[60px]"
              placeholderTextColor="#9CA3AF"
            />
          </Section>
          <Pressable
            onPress={onGenerate}
            disabled={screen.generating}
            className={`px-6 py-4 rounded-xl mb-3 ${
              screen.generating
                ? 'bg-gray-300 dark:bg-gray-800'
                : 'bg-emerald-600 active:bg-emerald-700'
            }`}
          >
            <Text className="text-white font-bold text-center">
              {screen.generating ? 'generating…' : 'Generate'}
            </Text>
          </Pressable>

          {screen.output !== null && (
            <View className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl p-4 mt-2">
              <Text className="text-green-800 dark:text-green-200 font-bold mb-2">
                Output
              </Text>
              <Text
                selectable
                className="text-green-900 dark:text-green-100 text-sm"
              >
                {screen.output}
              </Text>
              {screen.durationMs !== null && (
                <Text className="text-green-700 dark:text-green-300 text-xs mt-3">
                  {screen.durationMs} ms
                  {screen.tokensPerSec !== null
                    ? ` · ${screen.tokensPerSec} tok/s`
                    : ''}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      <StatusBar style="auto" />
    </ScrollView>
  )
}

function screenLabel(s: Screen): string {
  switch (s.kind) {
    case 'probing':
      return 'checking…'
    case 'idle':
      return s.status.state === 'ready'
        ? 'on disk, not loaded'
        : s.status.state === 'partial'
          ? 'partial (corrupted?)'
          : 'not downloaded'
    case 'downloading':
      return 'downloading'
    case 'download-failed':
      return 'download failed'
    case 'loading':
      return 'loading into RAM'
    case 'load-failed':
      return 'load failed'
    case 'ready':
      return 'loaded · ready'
  }
}

function bytesLabel(b: number): string {
  if (b <= 0) return '?'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <View className="h-3 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
      <View
        className="h-3 bg-blue-600"
        style={{ width: `${pct}%` }}
      />
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function Pair({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
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

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <View className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl p-4">
      <Text className="text-red-800 dark:text-red-200 font-semibold mb-1">
        {title}
      </Text>
      <Text
        selectable
        className="text-red-700 dark:text-red-300 text-xs font-mono"
      >
        {message}
      </Text>
    </View>
  )
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
