// RN hooks over the inbox. expo-sqlite doesn't ship change listeners,
// so for v1 the hooks poll on a tick + expose a refresh() function
// callers should invoke after every mutation (enqueue / markX).
// Day 12 UI can wire context-based invalidation if polling proves
// noisy.

import { useCallback, useEffect, useRef, useState } from 'react'

import { openInbox } from './db'
import * as queue from './queue'
import type { InboxRow, InboxStatus } from './types'

const DEFAULT_POLL_MS = 2000

export type UseInboxOptions = {
  status?: InboxStatus
  limit?: number
  pollMs?: number
}

export function useInbox(options: UseInboxOptions = {}): {
  rows: InboxRow[]
  loading: boolean
  refresh: () => void
} {
  const [rows, setRows] = useState<InboxRow[]>([])
  const [loading, setLoading] = useState(true)
  const optsRef = useRef(options)
  optsRef.current = options

  const refresh = useCallback(() => {
    try {
      const runner = openInbox()
      const next = queue.list(runner, {
        status: optsRef.current.status,
        limit: optsRef.current.limit,
      })
      setRows(next)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const ms = options.pollMs ?? DEFAULT_POLL_MS
    if (ms <= 0) return
    const t = setInterval(refresh, ms)
    return () => clearInterval(t)
  }, [refresh, options.pollMs])

  return { rows, loading, refresh }
}

export function usePendingCount(pollMs = DEFAULT_POLL_MS): {
  count: number
  refresh: () => void
} {
  const [count, setCount] = useState(0)

  const refresh = useCallback(() => {
    try {
      const runner = openInbox()
      setCount(queue.pendingCount(runner))
    } catch {
      // Keep last value on transient sqlite errors instead of
      // bouncing the count to 0.
    }
  }, [])

  useEffect(() => {
    refresh()
    if (pollMs <= 0) return
    const t = setInterval(refresh, pollMs)
    return () => clearInterval(t)
  }, [refresh, pollMs])

  return { count, refresh }
}
