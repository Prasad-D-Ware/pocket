# pocket-x402-server

Local x402 demo server + Node smoke client. Used to verify Pocket's
x402 client wrapper (`src/x402/payClient.ts`) end-to-end without
needing a phone (that's Day 10).

## Pieces

- `server.ts` — Hono app with one paid route, `GET /api/quote`. Uses
  `X402PaymentHandler` from `x402-solana` + PayAI facilitator. Treasury
  address and accepted token are configured in `constants.ts`.
- `fund-test-wallet.ts` — generates `test-wallet.json` (gitignored) on
  first run; airdrops devnet SOL and mints fake-USDC to it. The mint
  authority is the user's `~/.config/solana/id.json` keypair.
- `test-client.ts` — Node smoke. Loads the test wallet, builds a
  Keypair-backed `WalletAdapter`, calls `payClient.fetch` against the
  server. On success the x402 client auto-pays the 402 response and
  retries; we see a 200 with the resource body.

## One-time setup

The test authority wallet at `~/.config/solana/id.json` must have:
- Some devnet SOL (≥ 1) — for treasury operations + minting fees.
- Mint authority over the fake-USDC mint at
  `BofnM1aZaTJfxpoDD82oDJQEcSEyKtHjEEEUujCmE29v`. (It does, because
  that mint was created on Day 4 with this wallet as authority.)

```bash
cd tools/x402-server
npm install
```

## Run the smoke

Three terminals (or run server in background):

```bash
# T1 — one-time, top up the test wallet with fake-USDC
npm run fund

# T2 — start the server
npm run server

# T3 — fire the smoke
npm run smoke
```

Expected `npm run smoke` output ends with:

```
✓ smoke passed — server returned the paid resource after x402 settlement.
```

The test wallet's fake-USDC balance should drop by ~0.01 between the
pre/post lines.

## Config knobs (env)

| Env | Default | What it does |
|-----|---------|--------------|
| `PORT` | `4242` | Server port. |
| `FACILITATOR_URL` | `https://facilitator.payai.network` | PayAI hosted facilitator. Override if you self-host. |
| `TREASURY_ADDRESS` | `7RKbeEC9...nbV` | Where x402 payments are sent. |
| `SOLANA_CLI_KEYPAIR` | `~/.config/solana/id.json` | Path to the mint authority / treasury keypair. |
| `TEST_WALLET_PATH` | `./test-wallet.json` | Generated test buyer keypair. |
| `SERVER_URL` | `http://localhost:$PORT/api/quote` | Smoke target. |
| `VERBOSE` | `0` | Set to `1` to enable x402-solana's verbose logging. |

## Notes

- We target devnet (`solana-devnet`). Mainnet is a one-line flip in
  `constants.ts` post-grant.
- PayAI's facilitator is free-tier without API keys for low volume.
  When traffic ramps, generate keys in the PayAI dashboard and set
  `FACILITATOR_API_KEY_ID` + `FACILITATOR_API_KEY_SECRET` env (then
  wire them in `server.ts`'s `X402PaymentHandler` config).
- The fake-USDC mint is *our* mint, not real devnet USDC. Real devnet
  USDC has no public faucet so it's unreliable for demos.
