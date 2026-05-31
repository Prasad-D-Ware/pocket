# Pocket

> A mobile-native Solana wallet for AI agents. On-device LLM intent parser + Android Keystore-backed Ed25519 + on-chain `pocket_vault` Anchor program + x402 / Pay.sh client.

Reference implementation of MoonPay's [Open Wallet Standard](https://www.moonpay.com/) and the Solana Foundation + Google Cloud [Pay.sh](https://solana.com/x402/what-is-x402) protocol on Solana.

**Status:** v0.1 · Android 13+ · devnet · MIT
**End-to-end pipeline:** working (typed sentence → on-device LLM → policy guard → Keystore-signed x402 payment → on-chain confirmation)

---

## Why this exists

The Solana Foundation + Google Cloud launched [Pay.sh](https://solana.com/x402/what-is-x402) on 2026-05-05 as the official agentic payment rails on Solana. MoonPay's [Open Wallet Standard (OWS)](https://www.moonpay.com/) defines the policy + dual-key architecture for agent wallets. The [x402 protocol](https://www.x402.org/) defines how an HTTP server demands payment for an API call. All three efforts are explicitly **server-side and standards-level**. The mobile-native, user-owned-keys layer that an autonomous agent actually spends *from* — keys never leaving hardware, policy enforced on-chain, intent parsed on-device — was unbuilt.

Pocket is that device. A self-custodial Solana wallet that lets an autonomous AI agent on the phone spend stablecoins under policies the user sets:

- `max_per_tx`, `max_per_day` USD limits
- Allowed program IDs (e.g. only Jupiter, Pay.sh)
- Allowed token mints (e.g. USDC only)
- Allowed x402 hosts
- Expiry slot

The wallet auto-signs requests that fit, queues the rest, and rejects anything outside the policy. Keys are hardware-backed in Android Keystore (Ed25519, API 33+). Policies live on-chain in an Anchor sub-account vault. An on-device LLM (SmolLM2-360M Q4_K_M) parses natural-language intent ("pay api.helius.dev 0.5 USDC") into structured, grammar-constrained transactions — no LLM round-trip to a remote server.

---

## How it works

```
  Typed sentence                                       Signed devnet tx
        │                                                       ▲
        ▼                                                       │
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐│
│  on-device LLM   │  │  PolicyGuard     │  │ Keystore Ed25519 ││
│ (SmolLM2-360M)   │─▶│ (pure TS, on-    │─▶│   + Kit Signer    │┘
│  → intent JSON   │  │  chain policy)   │  │  → x402 payment  │
└──────────────────┘  └────────┬─────────┘  └──────────────────┘
                               │
                  ┌────────────▼────────────┐
                  │   Agent Inbox (sqlite)   │
                  │  logs every request as   │
                  │  signed | queued | denied│
                  └─────────────────────────┘
```

| Stage | Module | What it does |
|-------|--------|--------------|
| **01 · Intent** | `src/app/(tabs)/pay.tsx` | User types a natural-language sentence and taps Send |
| **02 · Parse** | `src/llm/parser.ts` + `src/llm/model.ts` | llama.rn runs SmolLM2-360M with a GBNF grammar; output is schema-valid intent JSON. ~3 s inference. Zero network. |
| **03 · Guard** | `src/policy/guard.ts` + `src/policy/schema.ts` | Pure-TS evaluator. Checks the intent against the policy (`max_per_tx`, `max_per_day`, mint allowlist, program allowlist, x402-host allowlist, expiry). Returns `allow` / `queue` / `deny`. |
| **04 · Sign** | `src/signer/pocketSigner.ts` + `modules/pocket-keystore/` | Custom `@solana/kit` TransactionSigner hands the digest to a Kotlin native module. Key is generated with `ECGenParameterSpec("ed25519")` in `AndroidKeyStore`; signing happens inside the secure container. Private key never materializes in JS. |
| **05 · Pay** | `src/x402/payClient.ts` + `src/x402/keystoreWalletAdapter.ts` | Signed payment goes to the x402 facilitator (PayAI) or directly to the `pocket_vault` `withdraw_under_policy` instruction. Transaction lands on devnet, signature is returned. |
| **06 · Log** | `src/inbox/router.ts` + `src/inbox/queue.ts` + `src/inbox/hooks.ts` | Every request — signed, queued, or denied — is written to a local `expo-sqlite` queue with the decoded summary, policy result, and tx signature. The Inbox tab renders them with status pills. |

---

## Architecture

```
              ┌──────────────────────────────────────────────────────────┐
              │  Pocket  (Expo SDK 55 + RN 0.83.6, Android 13+)          │
              │                                                          │
              │  ┌────────────────┐    ┌─────────────────────────────┐   │
              │  │ Voice / text   │───▶│ llama.rn · SmolLM2-360M Q4  │   │
              │  │   input        │    │  → grammar-constrained JSON │   │
              │  └────────────────┘    └──────────────┬──────────────┘   │
              │                                       │                  │
              │  ┌────────────────┐    ┌──────────────▼──────────────┐   │
              │  │ Policy editor  │    │  Agent Inbox                │   │
              │  │  (RN screens)  │    │  (expo-sqlite queue)        │   │
              │  └────────┬───────┘    └──────────────┬──────────────┘   │
              │           │                           │                  │
              │  ┌────────▼───────────────────────────▼──────────────┐   │
              │  │  PolicyGuard  (pure TS · zod-validated)            │   │
              │  │  evaluate(intent, policy)  →  allow|queue|deny     │   │
              │  └────────┬─────────────────────────┬────────────────┘   │
              │           │                         │                    │
              │  ┌────────▼─────────┐  ┌────────────▼──────────────┐     │
              │  │  x402 client     │  │  Kit TransactionSigner    │     │
              │  │  (PayAI facil.)  │  │  via PolicyGuard           │     │
              │  └────────┬─────────┘  └────────────┬──────────────┘     │
              │           │              ┌──────────▼──────────────┐     │
              │           │              │  Android Keystore       │     │
              │           │              │  Ed25519 · StrongBox    │     │
              │           │              └──────────┬──────────────┘     │
              └───────────┼─────────────────────────┼────────────────────┘
                          │                         │
                          ▼                         ▼
                  ┌──────────────────────────────────────────────────┐
                  │  Solana devnet  (Helius RPC)                     │
                  │   • pocket_vault Anchor program                  │
                  │     ID: jt6kDwFrRiZdgGZiDdD3o5jLq9NfNN8MWyC1BXC1pXu │
                  │   • x402-paid endpoints (e.g. api.helius.dev)    │
                  │   • SPL fakeUSDC mint                            │
                  └──────────────────────────────────────────────────┘
```

### Module map

```
src/
├── app/                       Expo Router screens (file-based)
│   ├── _layout.tsx            Root Stack — registers (tabs) + receive modal
│   ├── receive.tsx            Modal QR + fund-snippet sheet
│   └── (tabs)/                Bottom-tab navigator
│       ├── _layout.tsx        Tabs config (Home / Pay / Inbox / Settings)
│       ├── index.tsx          Home — balance, address, quick-actions, recent activity
│       ├── pay.tsx            Pay — typed-sentence → LLM → guard → payment
│       ├── inbox.tsx          Inbox — pending approval, signed, denied, failed
│       └── settings/          Account, vault, agent, developer, about
│           ├── index.tsx      Settings home
│           ├── policy.tsx     On-chain policy editor (set_policy)
│           ├── vault.tsx      Read-only vault state + My/Test source toggle
│           └── dev/           Developer-mode screens preserved from Days 1-16
│               ├── signer.tsx       Keystore generate+sign+verify
│               ├── send.tsx         Airdrop + SOL transfer signed by Keystore
│               ├── x402.tsx         Direct x402 paid request test
│               ├── llm.tsx          Raw LLM inference
│               ├── parser.tsx       20-prompt parser benchmark
│               ├── simulators.tsx   5 canned agent intents
│               └── anchor.tsx       Program info + explorer link
│
├── ui/                        Design-system primitives (12 files)
│   ├── tokens.ts              COLORS + RADIUS reference
│   ├── Screen.tsx · Header.tsx · Card.tsx · Button.tsx · TextField.tsx
│   ├── Pill.tsx · ListItem.tsx · Stat.tsx · Address.tsx · EmptyState.tsx
│   ├── Skeleton.tsx · useHaptic.ts
│
├── components/                Shared feature-coupled UI
│   ├── ActivityRow.tsx        Inbox row with status icon + tx link
│   └── RouteResultPanel.tsx   Pay-tab result panel (tone-mapped)
│
├── policy/                    Pure-TS PolicyGuard (zero RN imports)
│   ├── schema.ts              zod schemas for Policy + Intent
│   ├── guard.ts               evaluate(intent, policy, ledger) → action
│   ├── decode.ts              CompilableTransaction → structured DecodedTx
│   └── __tests__/             20+ unit tests (Node-runnable)
│
├── signer/                    Hardware-backed signing
│   ├── keystore.ts            TS interface
│   ├── keystore.android.ts    Bridge to native module
│   └── pocketSigner.ts        @solana/kit TransactionSigner (PolicyGuard-gated)
│
├── llm/                       On-device LLM
│   ├── model.ts               llama.rn init + lazy load (downloaded to sandbox)
│   ├── parser.ts              Grammar-constrained intent parsing
│   └── prompts.ts             System prompt + 10 few-shot examples
│
├── x402/                      x402 / Pay.sh client
│   ├── payClient.ts           fetchWithPay(url, opts, policy)
│   ├── keystoreWalletAdapter.ts   Wraps Keystore as a wallet for x402-solana
│   └── endpoints.ts           Curated x402 host allowlist
│
├── inbox/                     Agent Inbox queue
│   ├── db.ts                  expo-sqlite schema
│   ├── queue.ts               enqueue / markSigned / markDenied / markFailed
│   ├── router.ts              Routes intent → guard → signer → x402 / vault
│   ├── simulator.ts           5 canned scenarios for testing PolicyGuard branches
│   ├── format.ts              summarizeIntent for display
│   ├── hooks.ts               useInbox / usePendingCount
│   └── types.ts               InboxRow + InboxStatus
│
└── anchor/                    Anchor client
    ├── client.ts              @coral-xyz/anchor wrapper
    ├── constants.ts           Program ID + devnet RPC
    └── idl/pocket_vault.json  Generated IDL

anchor/                        Anchor workspace
└── programs/pocket_vault/     Five instructions: open_vault, set_policy,
                               deposit, withdraw_under_policy, close_vault

modules/pocket-keystore/       Native Kotlin module
└── android/                   AndroidKeyStore Ed25519 generate + sign

tools/x402-server/             Local x402-paying test endpoint
```

---

## Get started

### Prerequisites

- macOS or Linux dev machine
- Android Studio + an Android 13+ (API 33+) emulator or physical device
- Node 20+
- Rust + Solana CLI + Anchor 0.32 (only needed if you want to rebuild the program; pre-deployed devnet program ID is in `src/anchor/constants.ts`)

### Run the wallet

```bash
git clone https://github.com/Prasad-D-Ware/pocket.git
cd pocket
npm install
npm run android      # first run prebuilds android/ from app.json
```

First boot will take ~3-5 min as Expo prebuilds the Android project. Subsequent runs are fast.

### One-time setup inside the app

1. Open **Settings → Developer → LLM Test** and tap **Download model** (~271 MB SmolLM2-360M Q4_K_M, one-time).
2. Open **Settings → Developer → Send test (devnet)** and tap **Airdrop** to fund your Keystore-generated wallet with devnet SOL.
3. Open **Settings → Vault status → Open vault**, then **Settings → On-chain policy → Set policy** (e.g. 1 USDC / tx).
4. Tap the **Pay** tab, type a sentence ("pay api.helius.dev 0.5 USDC for a query"), tap **Send**.

That's the full pipeline. Check the Inbox tab to see the signed transaction with a devnet explorer link.

---

## Verification

| Layer | How |
|-------|-----|
| **PolicyGuard** | `npm test` — 70 unit tests, pure-TS, no device |
| **Decoder** | Unit tests against fixture txs (SOL transfer, USDC transfer, vault deposit/withdraw, x402 payment) |
| **Anchor program** | `cd anchor && anchor test` — local validator allow + deny paths; live on devnet |
| **Keystore signer** | In-app: **Settings → Developer → Keystore signer test** — generate + sign + `tweetnacl.sign.detached.verify` |
| **x402 client** | In-app: **Settings → Developer → x402 paid request** — direct facilitator pay against `tools/x402-server/` or a real endpoint |
| **LLM parser** | In-app: **Settings → Developer → Intent parser benchmark** — 20 prompts, 80% pass on current SmolLM2-360M Q4 |
| **End-to-end** | Live demo on devnet — see [pocket-site](https://github.com/Prasad-D-Ware/pocket-site) for video |

---

## Stack

| Layer | Library |
|-------|---------|
| App | Expo SDK 55, React Native 0.83.6, Expo Router |
| Solana | `@solana/kit` 6.1, `@coral-xyz/anchor` 0.32, `@solana/web3.js`, `x402-solana` + PayAI facilitator |
| Crypto | Android Keystore (Ed25519 / StrongBox), `tweetnacl` (verify), `react-native-quick-crypto` (polyfill) |
| LLM | `llama.rn` 0.12.4, SmolLM2-360M-Instruct Q4_K_M, GBNF grammar |
| Storage | `expo-sqlite` (inbox queue), `expo-file-system` (model cache) |
| UI | Uniwind (Tailwind for RN), `@expo/vector-icons`, `expo-haptics`, `expo-clipboard`, `react-native-qrcode-svg` |

---

## Standards Pocket implements

- [**MoonPay Open Wallet Standard**](https://www.moonpay.com/) — policy + dual-key architecture for agent wallets. Pocket implements the policy half on the device, with on-chain enforcement at the vault.
- [**x402 protocol**](https://www.x402.org/) — HTTP 402 Payment Required for paid APIs. Pocket's client wraps `x402-solana` and routes through PayAI's facilitator.
- [**Solana Pay.sh**](https://solana.com/x402/what-is-x402) — Solana Foundation + Google Cloud agentic payment rails (launched 2026-05-05). Pocket is the device-side reference implementation.
- [**Anchor**](https://github.com/anza-xyz/anchor) — `pocket_vault` is a 5-instruction Anchor program with the policy stored as an on-chain account.

---

## Roadmap

**v0.1 (this repo)**
Android, devnet, single agent, single SPL token (fakeUSDC), on-chain policy enforcement, on-device LLM intent parsing, hardware-backed Ed25519, x402 / Pay.sh client.

**v1.0 (post-grant)**
- Onboarding wizard (key generation + first policy + airdrop in <90s)
- Production failure-path polish
- 90-second demo video committed to repo
- Mainnet support
- Multi-asset baskets beyond USDC

**v2.0 (future)**
- iOS support (MPC or on-chain secp256r1 verifier program — Secure Enclave does not support Ed25519)
- MWA wallet-responder mode (external dApps requesting signing from Pocket)
- Multi-agent sub-accounts (multiple vaults per wallet)
- LLM tool-calling / multi-turn dialogue
- On-chain policy registry for cross-device sync

---

## License

MIT — see [LICENSE](./LICENSE).
