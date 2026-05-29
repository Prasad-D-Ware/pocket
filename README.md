# Pocket

> A mobile-native Solana wallet for AI agents. Policy-bound signing, Pay.sh / x402 client, on-device LLM intent parser, Android Keystore-backed Ed25519. Reference implementation of MoonPay's Open Wallet Standard on Solana.

## What this is

The Solana Foundation + Google Cloud launched **Pay.sh** on 2026-05-05 as the official agentic payment rails on Solana. MoonPay's **Open Wallet Standard (OWS)** defines the policy + dual-key architecture for agent wallets. Both efforts are server-side and standards-level — nobody owns the device.

Pocket is the device. A self-custodial Solana wallet that lets agents spend stablecoins under user-defined policies you set once:

- `max_per_tx`, `max_per_day` USD limits
- Allowed program IDs (e.g. only Jupiter, Pay.sh)
- Allowed token mints (e.g. USDC only)
- Allowed x402 hosts
- Expiry slot

The wallet auto-signs requests that fit, queues the rest, and rejects anything outside the policy. Keys are hardware-backed in Android Keystore (Ed25519, API 33+). Policies live on-chain in an Anchor sub-account vault. An on-device LLM (Llama 3.2 1B Q4) parses natural-language intent into structured transactions.

## Stack

- Expo ~55 + React Native 0.83 + Expo Router (file-based routing)
- `@solana/kit` ^6.1.0 (modular Solana TS SDK)
- `@coral-xyz/anchor` for the `pocket_vault` program
- `react-native-quick-crypto` polyfill
- `expo-sqlite` (Agent Inbox queue)
- `expo-local-authentication` (biometric gate)
- `llama.rn` (on-device LLM)
- Native Kotlin module for Android Keystore Ed25519 signing
- Uniwind (Tailwind for React Native)

## Get started

```bash
npm install
npm run android
```

First boot will prebuild the Android project from `app.json`.

## Status

v1 (in progress) — Android-only, devnet. See the execution plan for the day-by-day build.

## Standards Pocket implements

- [MoonPay Open Wallet Standard](https://www.moonpay.com/) — policy-bound agent wallets
- [x402 protocol](https://www.x402.org/) — HTTP 402 payment-required for paid APIs
- [Solana Pay.sh](https://solana.com/x402/what-is-x402) — Solana Foundation + Google Cloud agentic payment rails
- [Solana Vault Standard (SVS)](https://github.com/solanabr/solana-vault-standard) — tokenized vault standard

## License

MIT.
