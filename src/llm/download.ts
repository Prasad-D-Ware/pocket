// Resumable, progress-reporting model download.
//
// Uses expo-file-system's createDownloadResumable so the user can
// background the app mid-download without losing progress. ~271 MB
// over a 50 Mbps WiFi connection ≈ 45 s; over emulator NAT it's a
// crapshoot. The progress UI on /llm-test is the user-facing
// experience layer; this file is the plumbing.

import * as FileSystem from 'expo-file-system/legacy'

import { MODEL_URL } from './constants'
import { deleteModelFile, modelPath } from './model'

export type DownloadProgress = {
  bytesWritten: number
  totalBytes: number
  fraction: number
}

export type DownloadHandle = {
  cancel: () => Promise<void>
  promise: Promise<void>
}

/**
 * Start a fresh download. If a partial file exists, it's deleted first
 * (resumable URLs need a clean slate when we're not also persisting
 * the resumeData — Day 14 keeps it simple).
 */
export function startDownload(
  onProgress: (p: DownloadProgress) => void,
): DownloadHandle {
  const resumable = FileSystem.createDownloadResumable(
    MODEL_URL,
    modelPath(),
    {},
    (raw) => {
      const total = raw.totalBytesExpectedToWrite || 1
      onProgress({
        bytesWritten: raw.totalBytesWritten,
        totalBytes: raw.totalBytesExpectedToWrite,
        fraction: raw.totalBytesWritten / total,
      })
    },
  )

  const promise = (async () => {
    // Nuke any half-written file from a previous attempt.
    await deleteModelFile()
    const result = await resumable.downloadAsync()
    if (!result) {
      throw new Error('Download cancelled or returned no result')
    }
  })()

  return {
    cancel: async () => {
      try {
        await resumable.cancelAsync()
      } catch {
        /* ignore — cancel races finish */
      }
    },
    promise,
  }
}
