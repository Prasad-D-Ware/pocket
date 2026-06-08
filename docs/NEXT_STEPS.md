# Pocket — Next Steps

> Living roadmap. Last updated 2026-05-31. Owner: Prasad.
> This is the "what now" doc — the build history is in git, the architecture is in the [README](../README.md), and the spec/plan are under `docs/superpowers/`.

---

## Where we are today

**Shipped (v0.1, devnet, Android):**

- Full technical stack working end-to-end: typed sentence → on-device LLM → PolicyGuard → Android Keystore Ed25519 signature → x402 payment → confirmed devnet tx.
- `pocket_vault` Anchor program deployed to devnet (`jt6kDwFrRiZdgGZiDdD3o5jLq9NfNN8MWyC1BXC1pXu`), 5 instructions, allow + deny paths tested.
- Full UX redesign: 4-tab IA (Home / Pay / Inbox / Settings), 12 UI primitives, Phantom-style dark aesthetic, Receive modal, vault source toggle, restyled dev screens.
- 70/70 unit tests pass, tsc clean.
- Public repo: https://github.com/Prasad-D-Ware/pocket
- Landing site: https://github.com/Prasad-D-Ware/pocket-site (deployed to Vercel)

**Known gaps:**

- No demo video yet (site compensates with screenshots + sample-data trace).
- No onboarding flow — cold install requires manual model download + airdrop + vault open + policy set.
- Failure-path UI not hardened.
- Android-only, devnet-only.
- LLM parser at 80% (below the 90% stretch target).

---

## Priority order

The order below assumes the goal is: **grant submission strong now, real-user path open later.** Re-rank freely if the deadline shifts.

| # | Task | Effort | Blocks | Status |
|---|------|--------|--------|--------|
| 1 | End-to-end device review | 0.5 day | confidence in everything below | ⏳ next |
| 2 | Demo video (Loom, 60s) | 0.5 day | best grant artifact | ⏳ |
| 3 | Onboarding wizard | 1–1.5 days | real-user usability | ⏳ |
| 4 | Failure-path polish | 0.5 day | demo robustness | ⏳ |
| 5 | Grant submissions | 0.5 day | the actual goal | ⏳ |
| 6 | Outreach | 0.5 day | grant signal | ⏳ |
| — | *v2 roadmap (post-grant)* | — | — | parked |

---

## 1 · End-to-end device review (next)

Walk every flow on a real device. Goal: catch anything the screenshots don't show before recording the demo.

Checklist (full version lives in the chat, condensed here):

- [ ] **Nav smoke** — all 4 tabs + every Settings/Developer row opens (no 404)
- [ ] **Receive modal** — slides up, QR renders the bare address, X closes it
- [ ] **Vault toggle** — My / Test wallet pills re-fetch on switch
- [ ] **Canned simulators** — 5 scenarios run, allow→signed appears in Inbox *immediately* (validates Phase-5 `onMutate` fix), deny→denied entry
- [ ] **End-to-end payment** — Pay tab: type `pay api.helius.dev 0.5 USDC` → green result + tx sig → Inbox row → explorer link works

**If anything breaks:** screenshot + step number, fix before moving on. Don't record the demo over a broken flow.

---

## 2 · Demo video (60 seconds)

The single highest-leverage grant artifact. Script (from the chat):

| Sec | Tab | Action | Voiceover beat |
|-----|-----|--------|----------------|
| 0–5 | Home | balance + address | "Pocket — a Solana wallet your AI agent spends from, under policies you set." |
| 5–15 | Settings | vault opened, parser Ready | "Keys are hardware-backed in Android Keystore. The parser is a 360M model running fully on-device." |
| 15–35 | Pay | type sentence → Send | "I type plain English. On-device model parses it, policy guard checks it, Keystore signs it." |
| 35–50 | Pay | signed-real result + sig | "Real Ed25519 signature, real Solana transaction, real x402 paid endpoint." |
| 50–60 | Inbox | new signed entry → explorer | "Every request is queued, evaluated, logged. Tap to verify on-chain." |

**Tooling:** Loom desktop (free, gives shareable URL) or QuickTime → upload to Loom for the URL. Record on a physical device if possible (looks more legit than the emulator).

**After recording:**
1. Paste the Loom URL into the grant form's "Demo Video" field.
2. Embed it in the landing site — open `pocket-site/index.html`, find the `60-second walkthrough video` callout in the Screens section, replace it with the Loom `<iframe>`, then:
   ```bash
   cd ../pocket-site && git add index.html && git commit -m "embed demo video" && git push
   ```
   Vercel auto-deploys on push.

---

## 3 · Onboarding wizard

This is the gap between "grant demo" and "a stranger can use it." Cold install today needs four manual steps scattered across Settings. The wizard orchestrates them.

**Scope (one screen, 4 steps, ~1–1.5 days):**

`src/app/onboarding.tsx` — first-launch modal/stack that runs on cold start when no Keystore key exists:

1. **Generate key** — call the Keystore module, show the new address.
2. **Download model** — trigger the SmolLM2 download with the existing progress bar; can run in background while user continues.
3. **Fund wallet** — airdrop devnet SOL + fakeUSDC (reuse the Day-8 send-test airdrop logic).
4. **Set first policy** — a friendly version of the policy editor (e.g. "Let agents spend up to ___ USDC per transaction"), then `open_vault` + `set_policy` in sequence.

**Acceptance:** cold install → ready-to-use in under 90 seconds (model download excluded, since it's 271 MB).

**Where to gate it:** in `src/app/_layout.tsx`, check for an existing Keystore key on mount; if absent, redirect to `/onboarding` before the tabs render. Add a "redo onboarding" entry under Settings → Developer for testing.

---

## 4 · Failure-path polish

Make the four failure states non-broken (Day-18 of the original plan):

- [ ] **Model not downloaded** — Pay tab already surfaces a message; verify it routes to the download screen.
- [ ] **x402 timeout / endpoint down** — show a retryable error in `RouteResultPanel`, not a silent failure.
- [ ] **Policy deny** — Pay screen should explain *which rule* denied (PolicyGuard already returns `reason`; surface it).
- [ ] **Keystore unavailable (API < 33)** — detect at startup, show a clear "Android 13+ required" screen instead of a crash.

---

## 5 · Grant submissions

The actual goal. Submit in this order (strongest fit first):

1. **Solana Foundation Grants** — `solana.org/grants`. Lead with: device-side reference implementation of OWS + Pay.sh, on-chain policy enforcement (defense in depth), on-device LLM (privacy + zero cost). One-pager: problem / what we built / why now / ask.
2. **Superteam Earn** — relevant bounty. Use the `/apply-grant` skill if it fits (Agentic Engineering Grant / ST Earn).
3. **Colosseum Radar / active hackathon** — check `colosseum-copilot` skill for similar-project landscape + winner patterns first.

**Materials needed (most already exist):**
- ✅ Public repo + README with architecture
- ✅ Landing site
- ⏳ Demo video (task 2)
- ⏳ One-pager PDF — derive from the landing site's Problem + What's-novel + Verification sections

**Form answers (capstone tone, paste-ready):**
- Title: `Pocket`
- GitHub: `https://github.com/Prasad-D-Ware/pocket`
- Website: *(Vercel URL)*
- Description: the capstone-tone paragraph already drafted in chat
- Demo: *(Loom URL after task 2)*

---

## 6 · Outreach

DM ~10 named people once the grant is in. Targets: Pay.sh integrators, a MoonPay OWS contributor, the Solana Mobile DevRel, 2 Helius DAs, capstone advisors. Post an X launch thread tagging @solana, @helius_labs, @moonpay. Track replies.

---

## v2 roadmap (parked until post-grant)

Mention these in the grant one-pager — committees fund roadmaps, not single points.

- **iOS support** — Secure Enclave lacks Ed25519; needs MPC or an on-chain secp256r1-verifier program. Biggest single piece of v2.
- **MWA wallet-responder mode** — external dApps request signing from Pocket through its policy.
- **Multi-agent sub-accounts** — multiple vaults per wallet, one per agent.
- **Mainnet** — requires an Anchor audit first.
- **LLM upgrade** — bump past 80% parse rate (larger model, better grammar, or fine-tune). Current failure mode: model refuses long base58 recipients.
- **On-chain policy registry** — cross-device policy sync.
- **Recurring / scheduled txs, DCA, multi-asset baskets** — natural agent-economy extensions.

---

## Quick reference

| Thing | Where |
|-------|-------|
| Run the app | `npm run android` (Android 13+ device/emulator) |
| Run tests | `npm test` (70 tests) · `npx tsc --noEmit` |
| Anchor program ID | `src/anchor/constants.ts` |
| Devnet RPC | Helius (in `constants.ts`) |
| Repo | https://github.com/Prasad-D-Ware/pocket |
| Site | https://github.com/Prasad-D-Ware/pocket-site |
| Spec / plan | `docs/superpowers/specs/` · `docs/superpowers/plans/` |
| End-to-end proof tx | `3YJiYN7fddnq...qKB8tC` (devnet) |
