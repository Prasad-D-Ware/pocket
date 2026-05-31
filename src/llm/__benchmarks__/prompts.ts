// 20 hand-written test prompts for the on-device parser. Used by
// the "Run benchmark" button on /parser-test. We're not asserting
// exact field values (the model can pick "alice" vs "@alice"
// reasonably); we just check the *kind* matches expectation.
//
// 10 should-parse + 10 should-refuse. 90% combined target is a
// stretch for a 360M model — failures cluster around ambiguity
// edge cases (e.g. "5 USDC" with no recipient) where reasonable
// people would disagree on the right answer.

import type { LLMIntent } from '../parser'

export type BenchPrompt = {
  prompt: string
  expectedKind: LLMIntent['kind']
  /** Optional note explaining what the prompt is probing. */
  note?: string
}

export const BENCHMARK_PROMPTS: BenchPrompt[] = [
  // ---- should parse as token_transfer ----
  { prompt: 'send 1 USDC to alice', expectedKind: 'token_transfer' },
  { prompt: 'transfer 5 USDC to bob.sol', expectedKind: 'token_transfer' },
  { prompt: 'give 2.50 USDC to charlie.sol', expectedKind: 'token_transfer' },
  {
    prompt: 'send 10 USDC to 7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs',
    expectedKind: 'token_transfer',
  },
  { prompt: 'transfer 0.5 to alice', expectedKind: 'token_transfer' },

  // ---- should parse as x402_payment ----
  { prompt: 'pay api.helius.dev 0.5 USDC', expectedKind: 'x402_payment' },
  {
    prompt: 'pay 0.01 USDC to api.openai.com',
    expectedKind: 'x402_payment',
  },
  {
    prompt: 'pay api.dune.com 1 USDC for analytics',
    expectedKind: 'x402_payment',
  },
  {
    prompt: 'pay 2.5 to api.helius.dev for a swap quote',
    expectedKind: 'x402_payment',
  },
  {
    prompt: 'pay 0.05 USDC to api.openai.com for an inference',
    expectedKind: 'x402_payment',
  },

  // ---- should refuse ----
  { prompt: "what's the weather like", expectedKind: 'refuse' },
  { prompt: 'tell me a joke', expectedKind: 'refuse' },
  { prompt: 'show my balance', expectedKind: 'refuse' },
  { prompt: 'how much is SOL today', expectedKind: 'refuse' },
  { prompt: 'hello', expectedKind: 'refuse', note: 'greeting' },
  {
    prompt: 'alice.sol',
    expectedKind: 'refuse',
    note: 'no amount, no verb',
  },
  {
    prompt: 'i need to send some money',
    expectedKind: 'refuse',
    note: 'no specifics',
  },
  { prompt: '5 USDC', expectedKind: 'refuse', note: 'no recipient' },
  {
    prompt: 'pay me back',
    expectedKind: 'refuse',
    note: 'no amount or destination',
  },
  {
    prompt: 'what can pocket do',
    expectedKind: 'refuse',
    note: 'meta question',
  },
]
