import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { Button } from '../../../../ui/Button'
import { TextField } from '../../../../ui/TextField'
import { useHaptic } from '../../../../ui/useHaptic'

import {
  MODEL_FILENAME,
  MODEL_SIZE_MB,
} from '../../../../llm/constants'
import {
  deleteModelFile,
  ensureModelLoaded,
  getModelStatus,
  releaseModel,
  type ModelStatus,
} from '../../../../llm/model'
import {
  startDownload,
  type DownloadHandle,
  type DownloadProgress,
} from '../../../../llm/download'

type ScreenStatus =
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
  const trigger = useHaptic()
  const [screen, setScreen] = useState<ScreenStatus>({ kind: 'probing' })
  const dlRef = useRef<DownloadHandle | null>(null)

  async function refresh() {
    setScreen({ kind: 'probing' })
    try {
      const status = await getModelStatus()
      setScreen({ kind: 'idle', status })
    } catch {
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
    trigger('tap')
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
      trigger('success')
      await refresh()
    } catch (e) {
      dlRef.current = null
      trigger('error')
      setScreen({ kind: 'download-failed', message: errMsg(e) })
    }
  }

  async function onCancelDownload() {
    trigger('tap')
    if (dlRef.current) await dlRef.current.cancel()
    dlRef.current = null
    await refresh()
  }

  async function onDelete() {
    trigger('tap')
    await deleteModelFile()
    await refresh()
  }

  async function onLoad() {
    trigger('tap')
    setScreen({ kind: 'loading', loadFraction: 0 })
    try {
      await ensureModelLoaded((fraction) =>
        setScreen({ kind: 'loading', loadFraction: fraction }),
      )
      trigger('success')
      setScreen({
        kind: 'ready',
        prompt: DEFAULT_PROMPT,
        output: null,
        durationMs: null,
        tokensPerSec: null,
        generating: false,
      })
    } catch (e) {
      trigger('error')
      setScreen({ kind: 'load-failed', message: errMsg(e) })
    }
  }

  async function onGenerate() {
    if (screen.kind !== 'ready' || screen.generating) return
    const prompt = screen.prompt.trim()
    if (!prompt) return
    trigger('tap')
    setScreen({
      ...screen,
      generating: true,
      output: null,
      durationMs: null,
      tokensPerSec: null,
    })
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
      trigger('success')
      setScreen({
        ...screen,
        generating: false,
        output: result.text ?? '',
        durationMs,
        tokensPerSec:
          tokens > 0 ? Math.round((tokens / durationMs) * 1000) : null,
      })
    } catch (e) {
      trigger('error')
      setScreen({
        ...screen,
        generating: false,
        output: `Error: ${errMsg(e)}`,
      })
    }
  }

  return (
    <Screen>
      <Header
        title="LLM test"
        subtitle="SmolLM2-360M Q4_K_M · llama.rn · on-device, no API"
      />

      <Section title="Model">
        <Card padding="md">
          <Pair k="file" v={MODEL_FILENAME} mono />
          <Pair k="approx size" v={`${MODEL_SIZE_MB} MB`} />
          <Pair k="status" v={screenLabel(screen)} />
          {screen.kind === 'idle' && screen.status.state !== 'missing' && (
            <Pair
              k="on disk"
              v={`${(screen.status.bytes / 1024 / 1024).toFixed(1)} MB`}
            />
          )}
        </Card>
      </Section>

      {screen.kind === 'probing' && (
        <View className="items-center mt-4">
          <ActivityIndicator color="#A78BFA" />
        </View>
      )}

      {screen.kind === 'idle' && screen.status.state === 'missing' && (
        <View>
          <View className="mb-4">
            <Card variant="accent" padding="md">
              <Text className="text-amber-300 font-semibold text-sm mb-1">
                One-time download (~{MODEL_SIZE_MB} MB)
              </Text>
              <Text className="text-amber-200/80 text-xs leading-relaxed">
                Downloads from huggingface.co/bartowski to your device's
                app-private storage. Stays there across sessions. Wifi
                recommended.
              </Text>
            </Card>
          </View>
          <Button variant="primary" onPress={onDownload} haptic={false}>
            Download model
          </Button>
        </View>
      )}

      {screen.kind === 'idle' && screen.status.state === 'partial' && (
        <View>
          <View className="mb-4">
            <Card padding="md">
              <Text className="text-red-300 font-semibold text-sm">
                Partial download detected — file is smaller than expected.
                Re-download.
              </Text>
            </Card>
          </View>
          <Button variant="primary" onPress={onDownload} haptic={false}>
            Re-download
          </Button>
        </View>
      )}

      {screen.kind === 'idle' && screen.status.state === 'ready' && (
        <View className="gap-2">
          <Button variant="primary" onPress={onLoad} haptic={false}>
            Load model into memory
          </Button>
          <Button variant="destructive" onPress={onDelete} haptic={false}>
            Delete model file
          </Button>
        </View>
      )}

      {screen.kind === 'downloading' && (
        <View>
          <ProgressBar fraction={screen.progress.fraction} />
          <Text className="text-gray-400 text-xs mt-2 text-center">
            {bytesLabel(screen.progress.bytesWritten)} /{' '}
            {bytesLabel(screen.progress.totalBytes)} (
            {(screen.progress.fraction * 100).toFixed(1)}%)
          </Text>
          <View className="mt-3">
            <Button variant="secondary" onPress={onCancelDownload} haptic={false}>
              Cancel
            </Button>
          </View>
        </View>
      )}

      {screen.kind === 'download-failed' && (
        <ErrorCard title="Download failed" message={screen.message} />
      )}

      {screen.kind === 'loading' && (
        <View>
          <Text className="text-gray-300 text-sm text-center mb-2">
            Loading model into RAM…
          </Text>
          <ProgressBar fraction={screen.loadFraction} />
          <Text className="text-gray-500 text-xs mt-2 text-center">
            First load can take 5–15s on the emulator.
          </Text>
        </View>
      )}

      {screen.kind === 'load-failed' && (
        <ErrorCard title="Load failed" message={screen.message} />
      )}

      {screen.kind === 'ready' && (
        <View>
          <Section title="Prompt">
            <Card padding="md">
              <TextField
                value={screen.prompt}
                onChangeText={(t) => setScreen({ ...screen, prompt: t })}
                multiline
                autoCapitalize="sentences"
                placeholder="send 1 USDC to alice"
              />
            </Card>
          </Section>

          <Button
            variant="primary"
            onPress={onGenerate}
            loading={screen.generating}
            disabled={screen.generating}
            haptic={false}
          >
            {screen.generating ? 'generating…' : 'Generate'}
          </Button>

          {screen.output !== null && (
            <View className="mt-3">
              <Card variant="accent" padding="md">
                <Text className="text-emerald-300 font-bold mb-2">Output</Text>
                <Text selectable className="text-white text-sm">
                  {screen.output}
                </Text>
                {screen.durationMs !== null && (
                  <Text className="text-emerald-200/80 text-xs mt-3">
                    {screen.durationMs} ms
                    {screen.tokensPerSec !== null
                      ? ` · ${screen.tokensPerSec} tok/s`
                      : ''}
                  </Text>
                )}
              </Card>
            </View>
          )}
        </View>
      )}
    </Screen>
  )
}

function screenLabel(s: ScreenStatus): string {
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
    <View className="h-3 bg-white/10 rounded-full overflow-hidden">
      <View className="h-3 bg-violet-500" style={{ width: `${pct}%` }} />
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

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <View className="mb-4">
      <Card padding="md">
        <Text className="text-red-300 font-semibold mb-1">{title}</Text>
        <Text selectable className="text-gray-300 text-xs font-mono">
          {message}
        </Text>
      </Card>
    </View>
  )
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
