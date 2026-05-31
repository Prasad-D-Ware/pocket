// Model lifecycle: where it lives on disk, how to detect it, how to
// init / release the in-memory context.
//
// Singleton context — once loaded, every screen reuses it. Day 15+
// can swap to per-screen lifecycle with explicit release on
// unmount if memory pressure becomes a real problem on low-end
// devices; for now the simpler shape is fine.

// SDK 55 split expo-file-system into a class-based API + a legacy
// procedural submodule. The legacy one keeps createDownloadResumable
// with a progress callback, which we need for the 271 MB download.
// The new API's File.downloadFileAsync has no progress hook.
import * as FileSystem from 'expo-file-system/legacy'
import { initLlama, releaseAllLlama, type LlamaContext } from 'llama.rn'

import {
  MODEL_FILENAME,
  MODEL_MIN_VALID_BYTES,
  N_CTX,
  N_GPU_LAYERS,
} from './constants'

export function modelPath(): string {
  // documentDirectory is app-private storage on Android. The model
  // survives app updates and is wiped only on "Clear data" or
  // uninstall.
  const dir = FileSystem.documentDirectory ?? ''
  return `${dir}${MODEL_FILENAME}`
}

export type ModelStatus =
  | { state: 'missing' }
  | { state: 'partial'; bytes: number } // download interrupted
  | { state: 'ready'; bytes: number }

export async function getModelStatus(): Promise<ModelStatus> {
  const info = await FileSystem.getInfoAsync(modelPath())
  if (!info.exists) return { state: 'missing' }
  const bytes = info.size ?? 0
  if (bytes < MODEL_MIN_VALID_BYTES) return { state: 'partial', bytes }
  return { state: 'ready', bytes }
}

let cached: LlamaContext | null = null
let initInFlight: Promise<LlamaContext> | null = null

/**
 * Lazy-init the in-memory model. Returns the same context across
 * calls so multiple screens / hooks don't fight over RAM.
 *
 * `onProgress` reports model-load progress (0..1) — not the same as
 * download progress; this fires while the GGUF is being mapped into
 * RAM. On the emulator this can take 5-15s the first time.
 */
export async function ensureModelLoaded(
  onProgress?: (progress: number) => void,
): Promise<LlamaContext> {
  if (cached) return cached
  if (initInFlight) return initInFlight

  const status = await getModelStatus()
  if (status.state !== 'ready') {
    throw new Error(
      `Model not ready (state: ${status.state}). Download it from the LLM Test screen first.`,
    )
  }

  initInFlight = (async () => {
    try {
      const ctx = await initLlama(
        {
          model: modelPath(),
          n_ctx: N_CTX,
          n_gpu_layers: N_GPU_LAYERS,
        },
        onProgress,
      )
      cached = ctx
      return ctx
    } finally {
      initInFlight = null
    }
  })()

  return initInFlight
}

/**
 * Release the in-memory model. Call from screen onUnmount or on a
 * "Free RAM" toggle. Disk file is untouched.
 */
export async function releaseModel(): Promise<void> {
  if (cached) {
    try {
      await cached.release()
    } catch {
      // Best-effort — if the native side already cleaned up, ignore.
    }
    cached = null
  }
}

/** Aggressive cleanup — release every llama.rn context across the app. */
export async function releaseAllModels(): Promise<void> {
  cached = null
  await releaseAllLlama()
}

/** Delete the on-disk model. Caller should ensure RAM is released first. */
export async function deleteModelFile(): Promise<void> {
  await releaseModel()
  const info = await FileSystem.getInfoAsync(modelPath())
  if (info.exists) {
    await FileSystem.deleteAsync(modelPath(), { idempotent: true })
  }
}
