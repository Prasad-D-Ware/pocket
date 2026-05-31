// parseIntent — natural-language → typed Intent via on-device LLM.
//
// Output is constrained by GBNF (src/llm/grammar.ts) to be a JSON
// object with one of three kinds (token_transfer / x402_payment /
// refuse). The expander (./expander.ts) fills in operational fields
// so downstream code never knows an LLM was involved.

import { ensureModelLoaded } from './model'
import { INTENT_GRAMMAR } from './grammar'
import {
  llmIntentToIntent,
  validateLLMIntent,
  type LLMIntent,
} from './expander'
import type { Intent } from '../policy/schema'

export { llmIntentToIntent } from './expander'
export type { LLMIntent } from './expander'

export type ParseOutcome =
  | {
      ok: true
      llm: LLMIntent
      intent: Intent | null // null when the LLM refused
      raw: string
      durationMs: number
    }
  | {
      ok: false
      reason: 'parse_failed' | 'unknown_kind' | 'invalid_amount'
      raw: string
      durationMs: number
    }

const SYSTEM_PROMPT = `You parse user requests into JSON for Pocket, a Solana wallet for AI agents.
Output ONLY one JSON object in one of these three shapes:

{"kind":"token_transfer","amount_usd":<number>,"recipient":"<string>"}
  Use when the user wants to send tokens to a recipient (a name like "alice", a domain like "bob.sol", or a base58 address).

{"kind":"x402_payment","amount_usd":<number>,"host":"<string>"}
  Use when the user wants to pay an API endpoint. The host is a domain like "api.helius.dev".

{"kind":"refuse","reason":"<short string>"}
  Use for anything else: questions, greetings, ambiguous requests, missing amount, missing recipient.

USDC is the implicit currency. No prose, no markdown, no code fences — just one JSON object.`

const FEW_SHOTS: Array<{ user: string; assistant: string }> = [
  {
    user: 'send 1 USDC to alice',
    assistant:
      '{"kind":"token_transfer","amount_usd":1,"recipient":"alice"}',
  },
  {
    user: 'transfer 5 USDC to bob.sol',
    assistant:
      '{"kind":"token_transfer","amount_usd":5,"recipient":"bob.sol"}',
  },
  {
    user: 'pay api.helius.dev 0.5 USDC',
    assistant:
      '{"kind":"x402_payment","amount_usd":0.5,"host":"api.helius.dev"}',
  },
  {
    user: 'give 2.5 to charlie',
    assistant:
      '{"kind":"token_transfer","amount_usd":2.5,"recipient":"charlie"}',
  },
  {
    user: 'pay 0.1 USDC to api.openai.com for an inference',
    assistant:
      '{"kind":"x402_payment","amount_usd":0.1,"host":"api.openai.com"}',
  },
  {
    user: 'send 100 USDC to 7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs',
    assistant:
      '{"kind":"token_transfer","amount_usd":100,"recipient":"7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs"}',
  },
  {
    user: "what's the weather like",
    assistant: '{"kind":"refuse","reason":"not a payment intent"}',
  },
  {
    user: 'show my balance',
    assistant:
      '{"kind":"refuse","reason":"balance lookups are not payment intents"}',
  },
  {
    user: 'hello',
    assistant: '{"kind":"refuse","reason":"greeting, no payment intent"}',
  },
  {
    user: '5 USDC',
    assistant:
      '{"kind":"refuse","reason":"missing recipient or destination"}',
  },
]

export type ParseOpts = {
  nPredict?: number
  temperature?: number
  source?: 'user' | 'agent' | 'inbox_replay'
}

export async function parseIntent(
  userText: string,
  opts: ParseOpts = {},
): Promise<ParseOutcome> {
  const ctx = await ensureModelLoaded()
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...FEW_SHOTS.flatMap((f) => [
      { role: 'user', content: f.user },
      { role: 'assistant', content: f.assistant },
    ]),
    { role: 'user', content: userText },
  ]

  const t0 = Date.now()
  const result = await ctx.completion({
    messages,
    jinja: true,
    grammar: INTENT_GRAMMAR,
    n_predict: opts.nPredict ?? 128,
    temperature: opts.temperature ?? 0.1,
    top_p: 0.9,
  })
  const durationMs = Date.now() - t0
  const raw = (result.text ?? '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'parse_failed', raw, durationMs }
  }

  const llm = validateLLMIntent(parsed)
  if (!llm) {
    return { ok: false, reason: 'unknown_kind', raw, durationMs }
  }
  if (
    llm.kind !== 'refuse' &&
    (!Number.isFinite(llm.amount_usd) || llm.amount_usd <= 0)
  ) {
    return { ok: false, reason: 'invalid_amount', raw, durationMs }
  }

  return {
    ok: true,
    llm,
    intent: llmIntentToIntent(llm, opts.source ?? 'user'),
    raw,
    durationMs,
  }
}
