# Pocket

**A self-custodial Solana wallet for autonomous AI agents.** Hardware-backed keys, on-device LLM intent parsing, policy-enforced spending — all on your phone, all under your control.

> Reference implementation of MoonPay's [Open Wallet Standard](https://www.moonpay.com/) and the Solana Foundation + Google Cloud [Pay.sh](https://solana.com/x402/what-is-x402) protocol.

**Status:** v0.1 · Android 13+ · devnet · MIT
**End-to-end:** ✅ Typed sentence → on-device LLM → PolicyGuard → Android Keystore Ed25519 → x402 payment → devnet confirmation

---

## Why this exists

Three major Solana infrastructure projects launched in 2026:

1. **Solana Foundation + Google Cloud** — [Pay.sh](https://solana.com/x402/what-is-x402) (May 2026), the official agentic payment rails on Solana
2. **MoonPay** — [Open Wallet Standard (OWS)](https://www.moonpay.com/), policy + dual-key architecture for agent wallets
3. **x402 Working Group** — [x402 protocol](https://www.x402.org/), HTTP 402 Payment Required for paid APIs

All three are **server-side and standards-level**. But the device-side reference implementation was missing: a mobile-native wallet where an autonomous agent can spend from hardware-backed keys, under user policies, with intent parsed on-device—keys never leaving the phone, policy enforced on-chain, everything verifiable on-chain.

Pocket fills that gap.

### How it works

| Layer | What |
|-------|------|
| **Keys** | Hardware-backed Ed25519 in Android Keystore (API 33+). Private key never materializes in JavaScript. |
| **Intent** | Natural language → on-device LLM (SmolLM2-360M, ~3s, ~271 MB) → grammar-constrained intent JSON. |
| **Policy** | User-defined spending rules live on-chain in `pocket_vault` (Anchor). Checked locally on every request. |
| **Signing** | PolicyGuard approves/queues/denies. Approved requests are signed by Keystore, sent to x402 facilitator or vault. |
| **Logging** | Every request—signed, queued, denied—is logged locally with signature and on-chain proof. Tap any row to verify on Solana Explorer. |

User policies:
- `max_per_tx`, `max_per_day` USD limits
- Allowed program IDs (e.g., only Jupiter, Pay.sh)
- Allowed token mints (e.g., USDC only)
- Allowed x402 hosts
- Expiry slot

### Pipeline diagram

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
                  │  Solana devnet  (api.devnet.solana.com)          │
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

## Try it

### Prerequisites

- macOS or Linux dev machine
- Android Studio + an Android 13+ (API 33+) emulator or physical device
- Node 20+
- Rust + Solana CLI + Anchor 0.32 (optional; only if you want to rebuild `pocket_vault`)

### Run locally (5 minutes)

```bash
git clone https://github.com/Prasad-D-Ware/pocket.git
cd pocket
npm install
npm run android      # first run prebuilds android/ from app.json
```

First boot: ~3–5 min (Expo prebuild). Subsequent runs are fast.

### Walk the end-to-end pipeline (2-3 minutes per step)

1. **Generate key & view address**  
   Settings → Developer → Keystore signer test → tap **Run signature verification**. Your hardware-backed Ed25519 address is generated (or loaded if it exists) and displayed.

2. **Download the LLM model** (~271 MB, one-time)  
   Settings → Developer → LLM Test → tap **Download model**. SmolLM2-360M-Instruct Q4_K_M is now cached locally.

3. **Fund your wallet with SOL**  
   Settings → Developer → Send test (devnet) → tap **Airdrop**. 0.5 devnet SOL arrives instantly.

4. **Get fakeUSDC** (optional, for USDC examples)  
   `cd anchor && anchor test` — the test suite mints fakeUSDC to your authority's token account. Subsequent commands will mint more via `devnet-deposit.ts` if needed.

5. **Open a vault & set policy**  
   Settings → Vault status → tap **Open vault** → Settings → On-chain policy → tap **Set policy** (e.g., 1 USDC max per tx, or use SOL if fakeUSDC unavailable).

6. **Send your first AI-signed payment**  
   Pay tab → type `pay api.helius.dev 0.0001 SOL for a query` → tap **Send** → 3–5 seconds inference → real Ed25519 signature → Solana devnet confirmation. (Use USDC if fakeUSDC is available.)

7. **Verify on-chain**  
   Inbox tab → tap the signed row → Solana Explorer link opens showing the actual tx with your real Ed25519 signature.

**That's the full pipeline.** Every part—LLM, policy check, signing, payment—is real and runs on your device.

---

## Verification

Every layer is testable end-to-end:

| Layer | Test | Evidence |
|-------|------|----------|
| **PolicyGuard** | `npm test` | 28 unit tests in guard.test.ts, pure-TS, no device required |
| **Decoder** | `npm test` | 228-line fixture suite: SOL transfer, USDC transfer, vault deposit/withdraw, x402 payment |
| **Anchor program** | `cd anchor && anchor test` | Allow + deny paths on local validator; live on devnet |
| **Keystore signer** | In-app → Settings → Developer → Keystore signer test | Generate + sign + `tweetnacl.sign.detached.verify` |
| **x402 client** | In-app → Settings → Developer → x402 paid request | Direct call to facilitator or test endpoint |
| **LLM parser** | In-app → Settings → Developer → Intent parser benchmark | 20 prompts, 80% success rate on SmolLM2-360M Q4 |
| **End-to-end** | Pay tab → type sentence → sign → Inbox | Real Ed25519 signature, real devnet transaction, real explorer link |

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

**v0.1 (shipped)**  
✅ Full technical stack (typed sentence → LLM → guard → sign → pay → confirm).  
✅ 70+ unit tests.  
✅ Public repo with full architecture docs.  

**v1.0 (next, ~3 weeks)**  
- Onboarding wizard (generate key → download model → fund wallet → set policy in <90s)
- Failure-path hardening (model not downloaded, endpoint timeout, policy denial, API < 33)
- 60-second demo video (recorded + embedded)
- Grant submissions (Solana Foundation, Superteam Earn, hackathons)

**v2.0 (post-grant)**  
- iOS support (Secure Enclave MPC or on-chain secp256r1-verifier)
- MWA wallet-responder (external dApps request signing through Pocket's policy)
- Mainnet support (post-Anchor audit)
- Multi-agent sub-accounts (one vault per AI agent)
- LLM upgrade (>90% parse rate + tool-calling)

**Full roadmap:** See [`docs/NEXT_STEPS.md`](./docs/NEXT_STEPS.md) for detailed priorities, blockers, and effort estimates.

---

## Resources

| | |
|---|---|
| **Repository** | [`Prasad-D-Ware/pocket`](https://github.com/Prasad-D-Ware/pocket) |
| **Landing site** | [`pocket-site`](https://github.com/Prasad-D-Ware/pocket-site) — deployed to Vercel |
| **Roadmap & priorities** | [`docs/NEXT_STEPS.md`](./docs/NEXT_STEPS.md) |
| **Design & spec** | [`docs/superpowers/specs/`](./docs/superpowers/specs/) |
| **Program ID (devnet)** | `jt6kDwFrRiZdgGZiDdD3o5jLq9NfNN8MWyC1BXC1pXu` |
| **Devnet RPC** | `https://api.devnet.solana.com` (configured in `src/anchor/constants.ts`) |
| **Verify on-chain** | Inbox tab → tap any signed row → Solana Explorer link opens to show the actual tx |

### Run tests

```bash
npm test                  # 70 unit tests (PolicyGuard, decoder, parser)
npx tsc --noEmit         # TypeScript check
cd anchor && anchor test # Anchor program tests (allow + deny paths)
```

---

## License

MIT — see [LICENSE](./LICENSE).
