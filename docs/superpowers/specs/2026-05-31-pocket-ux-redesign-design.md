# Pocket UX Redesign — Design Spec

**Date:** 2026-05-31
**Status:** Approved by user, ready for implementation planning
**Replaces:** Days 17-19 of the original execution plan
                (`/Users/prasadware/.claude/plans/create-a-proper-execution-abstract-mitten.md`)

## Context

Days 1-16 shipped Pocket's full technical surface end-to-end: hardware
Keystore signing, x402 paid HTTP, on-chain `pocket_vault` policy
enforcement, sqlite agent inbox, on-device LLM intent parsing, and
a working "typed sentence → real Solana payment" demo. Every grant
claim is now demonstrably running on a real Android device.

The current home screen is a vertical stack of dev/debug buttons
linking to single-purpose test screens. This works for verification
but reads as a prototype, not a product. For grant submission the
app needs to look and feel like a real consumer wallet while keeping
every test surface accessible to a technical reviewer who wants to
poke at internals.

## Goals

1. Restructure into a proper bottom-tab app with four primary
   surfaces: Home / Pay / Inbox / Settings.
2. Apply a coherent Phantom/Backpack-style dark visual system —
   violet accent, monospace addresses, glassy cards.
3. Build a small reusable UI primitive library
   (`src/ui/`) so future screens are consistent and quick to add.
4. Preserve every functional path from Days 1-16 — all underlying
   logic modules are unchanged; only the presentation layer changes.
5. Keep all dev/test screens accessible under Settings → Developer
   so reviewers can verify each layer independently.

## Non-goals (out of scope for v1)

- Light mode (dark-only ships; light is a one-day add post-grant).
- First-launch onboarding wizard (the grant reviewer sees populated
  state; onboarding is week-5 polish).
- Custom font bundling (system fonts — SF Pro / Roboto — render fine
  and avoid bundle bloat / font-load flicker).
- Native splash screen / app icon polish (default Expo splash is fine
  for v1).
- Push notifications / background tasks (deferred — would require
  Day-1-onboarding-style consent flows).

## Information Architecture

### Bottom tab bar (4 tabs)

| Tab | Purpose | Primary content |
|---|---|---|
| **Home** | At-a-glance | Address card · combined balance · 3 quick actions (Pay / Receive / Vault) · pending-inbox banner if N>0 · 5 most recent activity rows |
| **Pay** | Headline interaction — natural-language payments | Big text input · 3 example chips · parsed-intent preview · Send button · collapsible Advanced (x402 demo URL) · recent payments feed |
| **Inbox** | Agent request queue | Status chips · Pending cards with Approve/Deny · paginated activity feed · (no canned simulators — those move to Dev) |
| **Settings** | Everything else | Account · Pocket Vault · Agent · Developer (collapsible) · About |

Pending-count badge appears on the Inbox tab icon when `usePendingCount > 0`.

### Settings sub-stack

```
(tabs)/settings/
├── _layout.tsx        # Stack navigator
├── index.tsx          # Settings home (list of sections)
├── policy.tsx         # was /policy-editor
├── vault.tsx          # was /vault, with vault-source toggle
└── dev/
    ├── _layout.tsx
    ├── index.tsx      # dev menu
    ├── signer.tsx     # was /signer-test
    ├── send.tsx       # was /send-test
    ├── x402.tsx       # was /x402-test
    ├── llm.tsx        # was /llm-test
    ├── parser.tsx     # was /parser-test
    ├── simulators.tsx # was the canned scenarios block in /inbox
    └── anchor.tsx     # new: program ID + IDL + explorer links
```

### Modal routes (not in tab bar)

- `/receive` — QR code + selectable address + "fund from CLI" snippet.

### Migration map (current → new)

| Current route | New location | Notes |
|---|---|---|
| `/index` (button tower) | `(tabs)/index` | Complete rewrite as proper Home |
| `/inbox` "Talk to Pocket" section | `(tabs)/pay` | Becomes the Pay tab content |
| `/inbox` pending + activity | `(tabs)/inbox` | Same logic, restyled, no simulators |
| `/inbox` canned simulators | `(tabs)/settings/dev/simulators` | Demo-only, hidden from users |
| `/vault` | `(tabs)/settings/vault` | Default to user's Keystore vault + toggle for test wallet |
| `/policy-editor` | `(tabs)/settings/policy` | Restyled, same logic |
| `/signer-test`, `/send-test`, `/x402-test`, `/llm-test`, `/parser-test` | `(tabs)/settings/dev/*` | Each restyled |

## Visual System

### Color palette (dark-first)

```
Background       #0A0A0F   deep almost-black (less harsh than pure #000)
Surface          #14141C   default card / input bg
Surface-2        #1E1E2A   elevated card (active tab, modal)
Border           rgba(255,255,255,0.06)   barely-there separators
Border-strong    rgba(255,255,255,0.12)   focus / active rings

Text             #FAFAFA   primary
Text-muted       #A1A1AA   labels, secondary
Text-faint       #71717A   timestamps, hints

Accent           #8B5CF6   violet-500 — primary actions, links, tab active
Accent-hover     #7C3AED   violet-600 — pressed state
Accent-soft      rgba(139,92,246,0.12)   tinted bg for accent-bearing UI

Positive         #10B981   signed / ok
Negative         #EF4444   denied / failed / destructive
Warning          #F59E0B   queued / pending / attention
Info             #3B82F6   neutral info links
```

Maps to existing Tailwind shades we already use: `violet-500`,
`emerald-500`, `red-500`, `amber-500`, `blue-500`. No new color
config beyond what's already in `src/global.css`.

### Typography

| Style | Size / Weight / Tracking | Use |
|---|---|---|
| Display (h1) | 32 / 700 / -0.02em | Balance numbers, screen titles |
| Title (h2) | 22 / 700 | Section headers, modal titles |
| Body | 15 / 400 / 1.5 line | Primary content |
| Body-strong | 15 / 600 | Labels, button text |
| Caption | 12 / 500 / 0.04em / UPPER | Section labels |
| Tiny | 11 / 400 | Timestamps, hints |
| Mono | 14 / 500 / SF Mono | Addresses, sigs, code |

Font stack: system default. Mono uses `'SF Mono', 'Fira Code', Consolas, monospace`.

### Spacing / radii

- Spacing scale (Tailwind defaults): 4 / 8 / 12 / 16 / 24 / 32 / 48
- Card padding: 16
- Screen edges: 20
- Section spacing: 24
- Radii: 8 (chips), 12 (buttons/inputs), 16 (cards), 24 (modal sheets)

### Component primitives (`src/ui/`)

| Component | Responsibility | API surface |
|---|---|---|
| `<Screen>` | SafeArea + scrollable container + 20px padding | `children`, optional `scroll` prop |
| `<Header>` | Title + optional right-action icon | `title`, `right?` |
| `<Card>` | Surface bg + border + 16 padding + 16 radius | `children`, variant `default \| elevated` |
| `<Button>` | All button needs | `variant: primary \| secondary \| ghost \| destructive`, `size: md \| lg`, `loading`, `disabled`, `onPress`, haptics |
| `<TextField>` | Styled TextInput | `value`, `onChange`, `label?`, `helper?`, `error?`, `multiline?` |
| `<Address>` | Abbreviated address with copy | `address`, `truncate?`, `withCopy?` (default true) |
| `<TxStatus>` | Pill: signed / pending / denied / failed | `status: InboxStatus` |
| `<EmptyState>` | Centered icon + title + body + CTA | `icon`, `title`, `body?`, `cta?` |
| `<Skeleton>` | Animated shimmer block | `width`, `height`, `radius?` |
| `<Pill>` | Small rounded label w/ tone | `tone: neutral \| ok \| warn \| bad \| info`, `children` |
| `<Stat>` | Big number + small label | `value`, `label`, `subtitle?` |
| `<ListItem>` | Padded row with left/right slots | `left?`, `title`, `subtitle?`, `right?`, `onPress?` |

All components use Tailwind/Uniwind classes. No external UI library.

### Interaction polish

- **Haptics** via `expo-haptics`: light impact on every primary tap;
  notification success on tx confirm; notification error on failure.
  Wrapped in `useHaptic()` hook.
- **Pressables**: `active:opacity-90` + `active:scale-[0.98]` on
  primary `<Button>`s for tactile feedback.
- **Loading**: `<Skeleton>` blocks replace `<ActivityIndicator>` for
  contentful loading states (balance, activity feed, parsed preview).
  ActivityIndicator only for "the whole screen is initializing."
- **No splash/screen-transition animations beyond default tab swap.**
  Expo Router's default handling is fine.

### Icons

`@expo/vector-icons` Feather set. Icons needed:
`home, arrow-up-right, inbox, settings, check, x, copy, external-link, chevron-right, loader, alert-triangle, clock, refresh-cw, qr-code, plus, more-horizontal`.

## Per-Screen Specifications

### Home (`(tabs)/index.tsx`)

**Sections, top to bottom:**

1. **Header** — "Pocket" title + gear icon (right) linking to Settings tab.
2. **Address + Balance card** — `<Card>` containing:
   - `<Address>` abbreviated, long-press to copy
   - `<Stat>` showing combined USD value (SOL × current price + USDC)
   - Sub-line with breakdown: `0.05 SOL · 1.00 fakeUSDC`
   - Real fetches via existing `Connection.getBalance` + USDC ATA query
3. **Quick actions row** — three icon+label `<Button>`s in a row:
   - "Pay" → tab swap to Pay
   - "Receive" → navigate to `/receive` modal
   - "Vault" → navigate to `(tabs)/settings/vault`
4. **Pending banner** (conditional, only if `usePendingCount > 0`):
   - Warning-tone `<Card>` with text + chevron, taps into Inbox tab.
5. **Recent activity** — section label + up to 5 inbox rows
   (reuses `useInbox({ limit: 5 })`) rendered via shared `ActivityRow`
   component. "See all activity →" link at bottom navigates to Inbox.

**Data fetches:**
- Balance: `Connection.getBalance(address)` + USDC ATA balance via existing helpers, polled on focus.
- Recent activity: `useInbox({ limit: 5, pollMs: 2000 })`.
- Pending count: `usePendingCount()` for the banner.

**Empty states:**
- No activity yet → `<EmptyState>` with "Your payments will appear here" + CTA "Send your first one →" to Pay tab.

### Pay (`(tabs)/pay.tsx`)

**Sections, top to bottom:**

1. **Header** — "Pay" title.
2. **Body text** — "What would you like to do?" (text-muted).
3. **Big input** — `<TextField multiline>`, 4 lines tall, auto-grow.
   Placeholder cycles through 3 examples when empty:
   `"pay api.helius.dev 0.5 USDC"`,
   `"send 1 USDC to alice.sol"`,
   `"send 5 USDC to bob.sol"`.
4. **Example chips** — 3 tappable pills below input that fill the input on tap.
5. **Parsed intent preview** — `<Card>` with `accent-soft` bg, appears after Send tap. Shows:
   - One-line summary (from `summarizeIntent`)
   - Policy verdict line (e.g., `Policy: allow (under daily cap)`)
6. **Send button** — primary `<Button>`, full width, large size.
   On tap: `parseIntent → llmIntentToIntent → routeSentence` (existing pipeline).
7. **Advanced section** — collapsible (default closed), holds the x402 demo URL `<TextField>` for power users.
8. **Recent Payments** — section label + signed-real-only rows from inbox, last 5.

**Data flow:**
- On Send tap: invoke `routeSentence(text, { runner, policy: defaultPolicy(), demoX402Url })` from `src/inbox/router.ts`.
- Result panel branches on `RouteResult.kind` using a shared `<RouteResultPanel>` extracted from current `inbox.tsx`.
- Parse-on-Send (one inference per tap), not live. Live parsing deferred — inference is ~3-4s, too slow to feel live.

**Empty states:**
- No recent payments → don't render the section.

### Inbox (`(tabs)/inbox.tsx`)

**Sections, top to bottom:**

1. **Header** — "Inbox" + filter dropdown (All / Pending / Signed / Denied).
2. **Status chips row** — 4 `<Pill>`s showing counts per status.
3. **Pending section** — pending rows as cards with prominent Approve/Deny buttons (existing `PendingCard` pattern, restyled with `<Card>` + `<Button>`).
4. **All Activity** — paginated feed (50 rows visible, "load more" pagination), reuses `ActivityRow`.

**Critical change vs current inbox screen:** removes the "Talk to Pocket" section (moved to Pay tab) and removes canned simulator buttons (moved to dev/). Inbox becomes a pure queue-management surface.

**Data flow:**
- `useInbox({ pollMs: 2000, limit: 50 })` for the list.
- Approve/Deny call `markSigned` / `markDenied` (existing) with `MANUAL_<rand>` / `"user denied from inbox"`.

**Empty states:**
- No pending → "No pending requests. Agent activity will appear here when it needs your review."
- No activity at all → "Nothing yet. Pay something from the Pay tab or trigger a canned simulator from Settings → Developer."

### Settings (`(tabs)/settings/index.tsx`)

**Sections, top to bottom (each a `<Card>` with `<ListItem>` rows):**

1. **Account** — Address row, Network row (devnet), Backup row (disabled, "Not set", grey).
2. **Pocket Vault** — Vault status row → `/settings/vault`, Policy row → `/settings/policy`.
3. **Agent** — Local intent parser row (status: Ready / Not downloaded) → `/settings/dev/llm`, Policy engine row (status: Local) → `/settings/policy`.
4. **Developer** — Collapsible `<Card>` (default expanded — this is a dev build). Rows for each dev sub-screen.
5. **About** — Version, Source (link to GitHub), License.

**Each `<ListItem>` row:**
- Left: optional small icon
- Center: title + optional subtitle
- Right: status text (e.g., "Opened", "5 USDC/tx") + chevron if pressable

### Sub-screen restyles

`policy.tsx`, `vault.tsx`, and each `dev/*.tsx` keep their current logic intact. The only changes are:
- Wrap in `<Screen>` instead of raw `ScrollView`.
- Replace ad-hoc `<View>` panels with `<Card>`.
- Replace ad-hoc `<Pressable>` with `<Button>`.
- Replace ad-hoc address/sig spans with `<Address>`.
- Replace ad-hoc `<Text>` headers with `<Header>`.

`vault.tsx` adds a small `<Pill>` toggle at top: "My vault" (default) vs "Test wallet vault" (legacy).

### Receive (`/receive.tsx`, modal route)

- Big QR code (200×200) rendered via `react-native-qrcode-svg`.
- Full selectable address below.
- "Fund from CLI" `<Card>` with pre-filled command:
  `cd pocket/tools/x402-server && npm run mint-to -- <address>`.
- Modal dismisses via swipe-down or X button.

## Implementation Order (5 phases, 4.5 days)

### Phase 1 — Foundation (1 day)

- `npx expo install expo-haptics` + `npm i react-native-qrcode-svg`
  (rebuild required for expo-haptics — last forced native rebuild)
- Create `src/ui/` with 12 primitives
- Add design tokens documentation comment to `src/global.css`
- Set up `src/app/(tabs)/_layout.tsx` with 4 tabs
- Create placeholder tabs (Home shows "Coming soon", others empty)
- Move all current screens to `src/app/(tabs)/settings/dev/*` so
  nothing breaks during the migration

**Acceptance:** app boots, four tabs render with icons, dev screens
reachable through Settings → Developer.

### Phase 2 — Home + Pay (1 day)

- Build `(tabs)/index.tsx` Home with all sections from spec.
- Build `(tabs)/pay.tsx` Pay with all sections from spec.
- Extract shared `ActivityRow` component (used by Home + Inbox).
- Extract shared `RouteResultPanel` from current `inbox.tsx`.

**Acceptance:** type sentence on Pay tab → green panel + Home's
Recent Activity updates.

### Phase 3 — Inbox + Settings home (1 day)

- Build `(tabs)/inbox.tsx` — pending + activity, no simulators.
- Build `(tabs)/settings/_layout.tsx` stack.
- Build `(tabs)/settings/index.tsx` with all sections.

**Acceptance:** tab swap is snappy; settings rows navigate to
sub-screens; pending badge on Inbox tab shows count when >0.

### Phase 4 — Sub-screen migration (1 day)

- Restyle `(tabs)/settings/policy.tsx` (from `policy-editor.tsx`).
- Restyle `(tabs)/settings/vault.tsx` with vault-source toggle.
- Restyle each `(tabs)/settings/dev/*.tsx`.
- New `(tabs)/settings/dev/simulators.tsx` lifted from current inbox.
- New `(tabs)/settings/dev/anchor.tsx` (program ID + IDL + links).

**Acceptance:** every Days-7-to-15 functional flow still works
through the new IA. No regression in test paths.

### Phase 5 — Receive + Polish (0.5 day)

- `/receive.tsx` modal with QR + fund snippet.
- Wire `useHaptic()` calls in primary actions.
- Replace remaining `<ActivityIndicator>` with `<Skeleton>` where
  contentful.
- Add `<EmptyState>`s for empty inbox / no activity / no payments.
- Fix the Day-16 polling race (`router.markSigned` triggers
  immediate `refresh()`).

**Acceptance:** app feels tactile; empty states are friendly; recent
activity updates instantly after Send.

### Phase 6 deferred

First-launch onboarding wizard (welcome → keygen → fund → first
policy) is real consumer-product polish but the grant reviewer
doesn't see fresh install. Ship in week 5 post-grant if traction
warrants.

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Tab bar regression breaks deep links to old `/inbox` `/vault` etc. | Add redirect routes (`<Redirect href="(tabs)/inbox" />` etc.) for each old path during Phase 1. Remove after one week. |
| `expo-haptics` adds another native rebuild step | Front-load in Phase 1 as the last native module. No further rebuilds expected through Phase 5. |
| Phantom-style dark feels "samey" vs other wallets | Acceptable for v1. Distinctive visual identity is a Phase 7+ topic — first prove the IA + primitives are solid. |
| QR code library bundle bloat | `react-native-qrcode-svg` is pure JS, ~15KB. Trivial. |
| Splitting `(tabs)/pay.tsx` from `(tabs)/inbox.tsx` duplicates router state | Both screens use the same singleton `openInbox()` runner + the same `routeSentence` from `src/inbox/router.ts`. State is in sqlite, not React — no duplication risk. |

## Verification

Each phase ends with a manual device check + the existing
55-test unit suite still passing. No new unit tests are required by
this redesign — the underlying logic is unchanged. After Phase 5:
record the demo video (original Day 20) with the new IA.

## What stays the same

All of these modules are unchanged by this redesign:
- `src/policy/{schema,guard,decode}.ts` and tests
- `src/inbox/{db,queue,hooks,router,simulator,format,sql,runner,types}.ts` and tests
- `src/anchor/{client,anchorWalletAdapter,constants,idl,types}.ts`
- `src/x402/{payClient,keystoreWalletAdapter}.ts`
- `src/signer/{keystore,pocketSigner}.ts`
- `src/llm/{model,download,grammar,parser,expander,constants}.ts` and tests
- `modules/pocket-keystore/` Expo local module
- `anchor/programs/pocket_vault/` Anchor program
- `tools/x402-server/` test server workspace

The redesign is purely the presentation layer.
