// src/inbox/router.ts
//
// End-to-end router: typed sentence → LLM intent → PolicyGuard
// evaluation → inbox row → real execution (where supported).
//
// Composition of pieces that already exist:
//   parseIntent       (Day 15)    — LLM grammar-constrained JSON
//   llmIntentToIntent (Day 15)    — fill operational fields
//   evaluate          (Day 2)     — off-chain policy
//   enqueue/markSigned/markDenied (Day 11) — sqlite queue
//   createKeystoreWalletAdapter   (Day 10) — Anchor-shaped signer
//   createPocketPayClient         (Day 9)  — x402 client
//
// Day 16 supports REAL execution for x402_payment only. token_transfer
// falls back to SIMULATED_<rand> until Day 17+ wires the SPL transfer
// path (recipient ATA discovery / init, fee-payer handling, error
// surfaces). Refuse and deny short-circuit before any execution.

import { parseIntent } from '../llm/parser'
import { llmIntentToIntent } from '../llm/expander'
import { evaluate } from '../policy/guard'
import type { Intent, Policy, PolicyResult } from '../policy/schema'
import { createKeystoreWalletAdapter } from '../x402/keystoreWalletAdapter'
import { createPocketPayClient } from '../x402/payClient'
import { DEVNET_RPC } from '../anchor/constants'
import { computeLedger } from './simulator'
import { summarizeIntent } from './format'
import * as queue from './queue'
import type { SqliteRunner } from './runner'

export type RouterDeps = {
  runner: SqliteRunner
  policy: Policy
  /** URL hit for x402_payment intents. Model's host is shown in the
   *  inbox summary, but the actual HTTP call goes here — typical for
   *  a local-server demo where the model says "api.helius.dev" but
   *  we hit http://10.0.2.2:4242/api/quote. */
  demoX402Url: string
  /** Called immediately after any markSigned/markDenied/markFailed
   *  transition so the caller's useInbox hook re-reads instead of
   *  waiting for the next 2 s poll. */
  onMutate?: () => void
}

export type RouteStage = 'parse' | 'expand' | 'enqueue' | 'execute'

export type RouteResult =
  | { kind: 'refused'; reason: string; durationMs: number }
  | {
      kind: 'parse-failed'
      reason: string
      raw: string
      durationMs: number
    }
  | { kind: 'expand-failed'; reason: string }
  | {
      kind: 'denied'
      inboxId: string
      intent: Intent
      policyResult: PolicyResult
    }
  | {
      kind: 'queued'
      inboxId: string
      intent: Intent
      policyResult: PolicyResult
    }
  | {
      kind: 'signed-simulated'
      inboxId: string
      intent: Intent
      sig: string
      reason: string
    }
  | {
      kind: 'signed-real'
      inboxId: string
      intent: Intent
      sig: string
      body: unknown
    }
  | {
      kind: 'execute-failed'
      inboxId: string
      intent: Intent
      reason: string
    }

export async function routeSentence(
  text: string,
  deps: RouterDeps,
): Promise<RouteResult> {
  // 1. Parse via LLM.
  const parsed = await parseIntent(text)
  if (!parsed.ok) {
    return {
      kind: 'parse-failed',
      reason: parsed.reason,
      raw: parsed.raw,
      durationMs: parsed.durationMs,
    }
  }
  if (parsed.llm.kind === 'refuse') {
    return {
      kind: 'refused',
      reason: parsed.llm.reason,
      durationMs: parsed.durationMs,
    }
  }
  if (!parsed.intent) {
    return { kind: 'expand-failed', reason: 'expander returned null for non-refuse intent' }
  }
  const intent = parsed.intent

  // 2. Evaluate policy against the current ledger window.
  const ledger = computeLedger(deps.runner)
  const policyResult = evaluate(intent, deps.policy, ledger)

  // 3. Enqueue regardless — every routed sentence becomes an audit
  //    record. Subsequent transitions update the same row.
  const inboxId = queue.enqueue(deps.runner, {
    intent,
    policy_result: policyResult,
    decoded_summary: summarizeIntent(intent),
  })

  // 4. Branch on the policy decision.
  if (policyResult.action === 'deny') {
    queue.markDenied(deps.runner, inboxId, policyResult.reason)
    deps.onMutate?.()
    return { kind: 'denied', inboxId, intent, policyResult }
  }

  if (policyResult.action === 'queue') {
    // Stay pending — user approves manually from the inbox.
    return { kind: 'queued', inboxId, intent, policyResult }
  }

  // policyResult.action === 'allow' — execute.
  if (intent.kind === 'x402_payment') {
    try {
      const adapter = await createKeystoreWalletAdapter()
      const client = createPocketPayClient({
        wallet: adapter,
        network: 'solana-devnet',
        rpcUrl: DEVNET_RPC,
      })
      const res = await client.fetch(deps.demoX402Url)
      if (res.status !== 200) {
        const reason = `server returned ${res.status}`
        queue.markFailed(deps.runner, inboxId, reason)
        deps.onMutate?.()
        return { kind: 'execute-failed', inboxId, intent, reason }
      }
      const body = await res.json().catch(() => ({}))
      const sig = extractPaymentSig(body) ?? `EXECUTED_${shortRandom()}`
      queue.markSigned(deps.runner, inboxId, sig)
      deps.onMutate?.()
      return { kind: 'signed-real', inboxId, intent, sig, body }
    } catch (e) {
      const reason = errMsg(e)
      queue.markFailed(deps.runner, inboxId, reason)
      deps.onMutate?.()
      return { kind: 'execute-failed', inboxId, intent, reason }
    }
  }

  // token_transfer + vault_withdraw: real SPL / Anchor execution is
  // Day 17+ work (recipient ATA discovery, fee-payer handling,
  // failure surfaces). For Day 16, mark with SIMULATED_ so the
  // inbox still reflects the policy decision honestly.
  const sig = `SIMULATED_${shortRandom()}`
  queue.markSigned(deps.runner, inboxId, sig)
  deps.onMutate?.()
  return {
    kind: 'signed-simulated',
    inboxId,
    intent,
    sig,
    reason:
      `${intent.kind} execution is pending — Day 16 only wires real signing for x402_payment. ` +
      'The policy decision is real; the chain action is a placeholder.',
  }
}

// Pulls the on-chain tx sig out of our x402 demo server's response
// shape (set in tools/x402-server/server.ts). Defensive against
// future shape changes — if the field moves, returns null and the
// caller falls back to an EXECUTED_ sentinel.
function extractPaymentSig(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const payment = b.payment as Record<string, unknown> | undefined
  const facResp = payment?.facilitator_response as
    | Record<string, unknown>
    | undefined
  const tx = facResp?.transaction
  return typeof tx === 'string' ? tx : null
}

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 10)
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
