# Pocket UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Pocket from a debug-button tower into a proper bottom-tab consumer-grade app (Phantom/Backpack aesthetic) while preserving every Days-1-16 functional surface under Settings → Developer.

**Architecture:** Expo Router file-based tabs `(tabs)/{index,pay,inbox,settings}` with a Stack inside the Settings tab. New `src/ui/` primitive library (12 components, ~1 KB each) used by every screen. Underlying logic modules (`src/policy`, `src/inbox`, `src/anchor`, `src/x402`, `src/llm`, `src/signer`) are unchanged — this is purely a presentation-layer rewrite.

**Tech Stack:** React Native 0.83 + Expo SDK 55 + Expo Router + Uniwind (Tailwind for RN). New deps: `expo-haptics` (native), `react-native-qrcode-svg` (pure JS), `@expo/vector-icons/Feather` (already in via Expo SDK).

**Spec:** `docs/superpowers/specs/2026-05-31-pocket-ux-redesign-design.md` (committed `816689d`).

**Commit cadence:** One commit per **phase** (per the user's standing preference, established Day 8). Task-level checkpoints update the inbox via the `TaskUpdate` tool; the git history shows phase-sized atomic chunks.

---

## File Structure (locked in upfront)

**New files:**
```
src/ui/
├── tokens.ts             # Color/spacing/typography references (comment-only constants)
├── useHaptic.ts          # Hook wrapping expo-haptics
├── Screen.tsx            # SafeArea + ScrollView wrapper
├── Header.tsx            # Title + optional right action
├── Card.tsx              # Surface bg + border + 16 padding + 16 radius
├── Button.tsx            # primary | secondary | ghost | destructive
├── TextField.tsx         # Styled TextInput w/ label + helper + error
├── Address.tsx           # Abbreviated address + copy
├── TxStatus.tsx          # Status pill: signed | pending | denied | failed
├── EmptyState.tsx        # Centered icon + title + body + CTA
├── Skeleton.tsx          # Animated shimmer block
├── Pill.tsx              # Small rounded label with tone
├── Stat.tsx              # Big number + small label
└── ListItem.tsx          # Padded row with left/center/right slots

src/app/(tabs)/
├── _layout.tsx           # Tabs component with 4 tabs
├── index.tsx             # Home
├── pay.tsx               # Pay
├── inbox.tsx             # Inbox (no simulators)
└── settings/
    ├── _layout.tsx       # Stack
    ├── index.tsx         # Settings home
    ├── policy.tsx        # was app/policy-editor.tsx
    ├── vault.tsx         # was app/vault.tsx + vault-source toggle
    └── dev/
        ├── _layout.tsx
        ├── index.tsx     # Dev menu
        ├── signer.tsx    # was app/signer-test.tsx
        ├── send.tsx      # was app/send-test.tsx
        ├── x402.tsx      # was app/x402-test.tsx
        ├── llm.tsx       # was app/llm-test.tsx
        ├── parser.tsx    # was app/parser-test.tsx
        ├── simulators.tsx # canned scenarios lifted from app/inbox.tsx
        └── anchor.tsx    # new — program ID + IDL + explorer links

src/app/receive.tsx       # Modal route (NOT in tabs)

src/components/
├── ActivityRow.tsx       # Inbox row used by Home + Inbox
└── RouteResultPanel.tsx  # Lifted from app/inbox.tsx
```

**Deleted files (after migration):**
```
src/app/index.tsx         # replaced by (tabs)/index.tsx
src/app/inbox.tsx         # split between (tabs)/inbox.tsx + (tabs)/pay.tsx
src/app/vault.tsx         # → (tabs)/settings/vault.tsx
src/app/policy-editor.tsx # → (tabs)/settings/policy.tsx
src/app/signer-test.tsx   # → (tabs)/settings/dev/signer.tsx
src/app/send-test.tsx     # → (tabs)/settings/dev/send.tsx
src/app/x402-test.tsx     # → (tabs)/settings/dev/x402.tsx
src/app/llm-test.tsx      # → (tabs)/settings/dev/llm.tsx
src/app/parser-test.tsx   # → (tabs)/settings/dev/parser.tsx
```

**Modified files:**
- `src/app/_layout.tsx` — keep MobileWalletProvider, wrap children in `<Slot />` (current shape already correct)
- `package.json` — add `expo-haptics`, `react-native-qrcode-svg`

**Unchanged (verbatim):** every file under `src/policy/`, `src/inbox/{db,queue,hooks,router,simulator,format,sql,runner,types}.ts`, `src/anchor/`, `src/x402/`, `src/llm/`, `src/signer/`, `modules/`, `anchor/`, `tools/`.

---

## Phase 1 — Foundation

**Goal:** UI primitive library + tab bar shell, all current screens accessible via a temporary `(tabs)/settings/dev/*` holding pen so nothing breaks.

### Task 1.1: Install native + JS deps

**Files:** `package.json`, `app.json` (auto-modified by `expo install`)

- [ ] **Step 1: Install expo-haptics (SDK-pinned)**

```bash
cd pocket
npx expo install expo-haptics
```

Expected: dep added at `~13.x` (SDK 55 match), `app.json` plugin auto-added if needed.

- [ ] **Step 2: Install react-native-qrcode-svg + peer**

```bash
npm install react-native-qrcode-svg react-native-svg
```

Note: `react-native-svg` is the required peer. `react-native-qrcode-svg` is pure JS but renders into SVG.

- [ ] **Step 3: Verify package.json**

Confirm these lines exist in `pocket/package.json`:
```
"expo-haptics": "~13...",
"react-native-qrcode-svg": "^6...",
"react-native-svg": "...",
```

- [ ] **Step 4: Force native rebuild (last forced rebuild of the redesign)**

```bash
rm -rf android
npm run android
```

Expected: 5-10 min rebuild, app boots to the existing home (button tower) on the emulator. Verifies the new native modules don't break the build.

### Task 1.2: Create tokens reference

**Files:**
- Create: `src/ui/tokens.ts`

- [ ] **Step 1: Write the file**

```ts
// Design tokens — values referenced everywhere across src/ui/. Pure
// reference; the Uniwind/Tailwind classes are the runtime source of
// truth. Keep this in sync if classes change.

export const COLORS = {
  bg: '#0A0A0F',
  surface: '#14141C',
  surface2: '#1E1E2A',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  textFaint: '#71717A',
  accent: '#8B5CF6', // violet-500
  accentHover: '#7C3AED', // violet-600
  positive: '#10B981',
  negative: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
} as const

export const RADIUS = {
  chip: 8,
  control: 12,
  card: 16,
  sheet: 24,
} as const
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p pocket/tsconfig.json
```

Expected: exit 0.

### Task 1.3: useHaptic hook

**Files:**
- Create: `src/ui/useHaptic.ts`

- [ ] **Step 1: Write the file**

```ts
import * as Haptics from 'expo-haptics'

export type HapticKind = 'tap' | 'success' | 'warning' | 'error'

/**
 * Returns a fire-and-forget haptic trigger. Safe to call without
 * awaiting; failures (e.g. simulator) are swallowed.
 */
export function useHaptic() {
  return (kind: HapticKind = 'tap') => {
    void (async () => {
      try {
        switch (kind) {
          case 'tap':
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            return
          case 'success':
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            )
            return
          case 'warning':
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning,
            )
            return
          case 'error':
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Error,
            )
            return
        }
      } catch {
        // emulator / device without haptic motor — no-op
      }
    })()
  }
}
```

- [ ] **Step 2: Typecheck + commit-bundle (no commit yet — phase commits at end)**

### Task 1.4: Button primitive

**Files:**
- Create: `src/ui/Button.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useHaptic } from './useHaptic'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'md' | 'lg'

export type ButtonProps = {
  onPress?: () => void | Promise<void>
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
  /** No haptic on press if false. Default true. */
  haptic?: boolean
}

export function Button({
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  haptic = true,
}: ButtonProps) {
  const trigger = useHaptic()
  const isDisabled = disabled || loading

  const bg = {
    primary: isDisabled ? 'bg-gray-800' : 'bg-violet-600 active:bg-violet-700',
    secondary: isDisabled
      ? 'bg-gray-800'
      : 'bg-gray-800 active:bg-gray-700',
    ghost: isDisabled ? '' : 'active:bg-white/5',
    destructive: isDisabled ? 'bg-gray-800' : 'bg-red-600 active:bg-red-700',
  }[variant]

  const fg = {
    primary: 'text-white',
    secondary: 'text-white',
    ghost: 'text-white',
    destructive: 'text-white',
  }[variant]

  const pad = size === 'lg' ? 'px-6 py-4' : 'px-4 py-3'
  const text = size === 'lg' ? 'text-base' : 'text-sm'

  function handlePress() {
    if (isDisabled) return
    if (haptic) trigger('tap')
    void onPress?.()
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      className={`${bg} ${pad} rounded-xl items-center justify-center active:scale-[0.98]`}
    >
      <View className="flex-row items-center gap-2">
        {loading && <ActivityIndicator size="small" color="white" />}
        <Text className={`${fg} ${text} font-bold text-center`}>
          {children}
        </Text>
      </View>
    </Pressable>
  )
}
```

### Task 1.5: Card primitive

**Files:**
- Create: `src/ui/Card.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { View } from 'react-native'

export type CardProps = {
  variant?: 'default' | 'elevated' | 'accent'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

export function Card({
  variant = 'default',
  padding = 'md',
  children,
}: CardProps) {
  const bg = {
    default: 'bg-[#14141C] border border-white/[0.06]',
    elevated: 'bg-[#1E1E2A] border border-white/[0.12]',
    accent: 'bg-violet-500/[0.12] border border-violet-500/30',
  }[variant]
  const pad = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
  }[padding]
  return <View className={`${bg} ${pad} rounded-2xl`}>{children}</View>
}
```

### Task 1.6: Screen wrapper

**Files:**
- Create: `src/ui/Screen.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

export type ScreenProps = {
  scroll?: boolean
  children: React.ReactNode
}

export function Screen({ scroll = true, children }: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-[#0A0A0F]" edges={['top']}>
      <StatusBar style="light" />
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-4 pb-12"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-5 pt-4 pb-12">{children}</View>
      )}
    </SafeAreaView>
  )
}
```

### Task 1.7: Header primitive

**Files:**
- Create: `src/ui/Header.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { Pressable, Text, View } from 'react-native'

export type HeaderProps = {
  title: string
  subtitle?: string
  right?: React.ReactNode
  onRightPress?: () => void
}

export function Header({ title, subtitle, right, onRightPress }: HeaderProps) {
  return (
    <View className="flex-row items-start justify-between mb-6">
      <View className="flex-1 pr-3">
        <Text className="text-3xl font-extrabold text-white tracking-tight">
          {title}
        </Text>
        {subtitle && (
          <Text className="text-sm text-gray-400 mt-1">{subtitle}</Text>
        )}
      </View>
      {right && (
        <Pressable
          onPress={onRightPress}
          className="w-10 h-10 rounded-full bg-white/5 items-center justify-center active:bg-white/10"
        >
          {right}
        </Pressable>
      )}
    </View>
  )
}
```

### Task 1.8: TextField primitive

**Files:**
- Create: `src/ui/TextField.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { TextInput, type TextInputProps, Text, View } from 'react-native'

export type TextFieldProps = TextInputProps & {
  label?: string
  helper?: string
  error?: string
}

export function TextField({
  label,
  helper,
  error,
  multiline,
  className,
  ...inputProps
}: TextFieldProps) {
  return (
    <View className="mb-3">
      {label && (
        <Text className="text-xs uppercase tracking-wider text-gray-400 mb-1.5 font-semibold">
          {label}
        </Text>
      )}
      <TextInput
        {...inputProps}
        multiline={multiline}
        placeholderTextColor="#71717A"
        className={`bg-[#14141C] border border-white/[0.08] rounded-xl px-3 py-3 text-white text-base ${multiline ? 'min-h-[80px]' : ''} ${error ? 'border-red-500' : ''} ${className ?? ''}`}
      />
      {(helper || error) && (
        <Text
          className={`text-xs mt-1.5 ${error ? 'text-red-400' : 'text-gray-500'}`}
        >
          {error ?? helper}
        </Text>
      )}
    </View>
  )
}
```

### Task 1.9: Address primitive

**Files:**
- Create: `src/ui/Address.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useHaptic } from './useHaptic'

export type AddressProps = {
  address: string
  truncate?: boolean // default true
  withCopy?: boolean // default true
  mono?: boolean // default true
}

export function Address({
  address,
  truncate = true,
  withCopy = true,
  mono = true,
}: AddressProps) {
  const trigger = useHaptic()
  const display = truncate ? short(address) : address

  function handleCopy() {
    trigger('tap')
    // expo-clipboard would go here in Phase 5 polish. For Phase 1
    // we rely on long-press native selection; the icon is decoration
    // until we wire it.
  }

  return (
    <View className="flex-row items-center gap-2">
      <Text
        selectable
        className={`${mono ? 'font-mono' : ''} text-white text-sm`}
      >
        {display}
      </Text>
      {withCopy && (
        <Pressable onPress={handleCopy} className="active:opacity-60">
          <Feather name="copy" size={14} color="#A1A1AA" />
        </Pressable>
      )}
    </View>
  )
}

function short(s: string): string {
  if (s.length <= 12) return s
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}
```

### Task 1.10: TxStatus + Pill primitives

**Files:**
- Create: `src/ui/Pill.tsx`
- Create: `src/ui/TxStatus.tsx`

- [ ] **Step 1: Write Pill.tsx**

```tsx
import { Text, View } from 'react-native'

export type PillTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'

export type PillProps = {
  tone?: PillTone
  children: React.ReactNode
}

export function Pill({ tone = 'neutral', children }: PillProps) {
  const cls = {
    neutral: 'bg-white/5 text-gray-300',
    ok: 'bg-emerald-500/15 text-emerald-300',
    warn: 'bg-amber-500/15 text-amber-300',
    bad: 'bg-red-500/15 text-red-300',
    info: 'bg-blue-500/15 text-blue-300',
    accent: 'bg-violet-500/15 text-violet-300',
  }[tone]
  const [bg, fg] = cls.split(' ')
  return (
    <View className={`${bg} px-2.5 py-1 rounded-full self-start`}>
      <Text className={`${fg} text-xs font-semibold`}>{children}</Text>
    </View>
  )
}
```

- [ ] **Step 2: Write TxStatus.tsx**

```tsx
import { Pill, type PillTone } from './Pill'
import type { InboxStatus } from '../inbox/types'

const TONE: Record<InboxStatus, PillTone> = {
  pending: 'warn',
  signed: 'ok',
  denied: 'bad',
  failed: 'bad',
}

const LABEL: Record<InboxStatus, string> = {
  pending: 'pending',
  signed: 'signed',
  denied: 'denied',
  failed: 'failed',
}

export function TxStatus({ status }: { status: InboxStatus }) {
  return <Pill tone={TONE[status]}>{LABEL[status]}</Pill>
}
```

### Task 1.11: Stat + ListItem primitives

**Files:**
- Create: `src/ui/Stat.tsx`
- Create: `src/ui/ListItem.tsx`

- [ ] **Step 1: Write Stat.tsx**

```tsx
import { Text, View } from 'react-native'

export type StatProps = {
  value: string
  label?: string
  subtitle?: string
}

export function Stat({ value, label, subtitle }: StatProps) {
  return (
    <View>
      {label && (
        <Text className="text-xs uppercase tracking-wider text-gray-400 mb-1 font-semibold">
          {label}
        </Text>
      )}
      <Text className="text-4xl font-extrabold text-white tracking-tight">
        {value}
      </Text>
      {subtitle && (
        <Text className="text-sm text-gray-400 mt-1">{subtitle}</Text>
      )}
    </View>
  )
}
```

- [ ] **Step 2: Write ListItem.tsx**

```tsx
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

export type ListItemProps = {
  title: string
  subtitle?: string
  left?: React.ReactNode
  right?: React.ReactNode
  onPress?: () => void
  disabled?: boolean
}

export function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  disabled,
}: ListItemProps) {
  const inner = (
    <View className="flex-row items-center py-3 px-1">
      {left && <View className="mr-3">{left}</View>}
      <View className="flex-1">
        <Text
          className={`text-base ${disabled ? 'text-gray-500' : 'text-white'}`}
        >
          {title}
        </Text>
        {subtitle && (
          <Text className="text-xs text-gray-500 mt-0.5">{subtitle}</Text>
        )}
      </View>
      <View className="flex-row items-center gap-2">
        {right}
        {onPress && !disabled && (
          <Feather name="chevron-right" size={18} color="#71717A" />
        )}
      </View>
    </View>
  )
  if (!onPress || disabled) return inner
  return (
    <Pressable onPress={onPress} className="active:bg-white/5 rounded-lg">
      {inner}
    </Pressable>
  )
}
```

### Task 1.12: EmptyState + Skeleton primitives

**Files:**
- Create: `src/ui/EmptyState.tsx`
- Create: `src/ui/Skeleton.tsx`

- [ ] **Step 1: Write EmptyState.tsx**

```tsx
import { Pressable, Text, View } from 'react-native'

export type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  body?: string
  cta?: { label: string; onPress: () => void }
}

export function EmptyState({ icon, title, body, cta }: EmptyStateProps) {
  return (
    <View className="items-center py-10 px-4">
      {icon && <View className="mb-3 opacity-50">{icon}</View>}
      <Text className="text-base font-semibold text-white text-center">
        {title}
      </Text>
      {body && (
        <Text className="text-sm text-gray-400 text-center mt-1 leading-relaxed">
          {body}
        </Text>
      )}
      {cta && (
        <Pressable
          onPress={cta.onPress}
          className="mt-4 px-4 py-2 rounded-xl bg-violet-500/15 active:bg-violet-500/25"
        >
          <Text className="text-violet-300 text-sm font-semibold">
            {cta.label}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
```

- [ ] **Step 2: Write Skeleton.tsx**

```tsx
import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'

export type SkeletonProps = {
  width?: number | string
  height?: number
  radius?: number
}

export function Skeleton({ width = '100%', height = 16, radius = 6 }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      style={{
        width: width as number,
        height,
        borderRadius: radius,
        backgroundColor: 'rgba(255,255,255,0.08)',
        opacity,
      }}
    />
  )
}
```

- [ ] **Step 3: Typecheck after all primitives**

```bash
cd pocket && npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0.

### Task 1.13: Move current screens into temporary holding pen

This is the riskiest task because expo-router watches the file tree. Do it in one go to avoid intermediate broken states.

**Files:**
- Create dirs: `src/app/(tabs)/settings/dev/`
- Move (use git mv to preserve history):
  - `src/app/signer-test.tsx` → `src/app/(tabs)/settings/dev/signer.tsx`
  - `src/app/send-test.tsx` → `src/app/(tabs)/settings/dev/send.tsx`
  - `src/app/x402-test.tsx` → `src/app/(tabs)/settings/dev/x402.tsx`
  - `src/app/llm-test.tsx` → `src/app/(tabs)/settings/dev/llm.tsx`
  - `src/app/parser-test.tsx` → `src/app/(tabs)/settings/dev/parser.tsx`
  - `src/app/vault.tsx` → `src/app/(tabs)/settings/vault.tsx`
  - `src/app/policy-editor.tsx` → `src/app/(tabs)/settings/policy.tsx`
  - Keep `src/app/inbox.tsx` in place for now — it gets split in Phase 2 / 3.
  - Keep `src/app/index.tsx` in place — replaced in Phase 2.

- [ ] **Step 1: Make the directories**

```bash
cd pocket
mkdir -p src/app/'(tabs)'/settings/dev
```

- [ ] **Step 2: Move files with git mv**

```bash
cd pocket
git mv src/app/signer-test.tsx src/app/'(tabs)'/settings/dev/signer.tsx
git mv src/app/send-test.tsx src/app/'(tabs)'/settings/dev/send.tsx
git mv src/app/x402-test.tsx src/app/'(tabs)'/settings/dev/x402.tsx
git mv src/app/llm-test.tsx src/app/'(tabs)'/settings/dev/llm.tsx
git mv src/app/parser-test.tsx src/app/'(tabs)'/settings/dev/parser.tsx
git mv src/app/vault.tsx src/app/'(tabs)'/settings/vault.tsx
git mv src/app/policy-editor.tsx src/app/'(tabs)'/settings/policy.tsx
```

- [ ] **Step 3: Fix relative imports**

Each moved file imports `../anchor/...`, `../signer/...`, `../inbox/...` etc. The new depth is `../../../`. Update each file's imports:

Replace pattern in each moved file (search-and-replace):
- `from '../anchor/` → `from '../../../anchor/`
- `from '../signer/` → `from '../../../signer/`
- `from '../inbox/` → `from '../../../inbox/`
- `from '../x402/` → `from '../../../x402/`
- `from '../llm/` → `from '../../../llm/`
- `from '../policy/` → `from '../../../policy/`
- `from '../../modules/` → `from '../../../../modules/`

(For `vault.tsx` and `policy.tsx` which are one level shallower than `dev/`, the prefix is `../../` instead of `../../../`.)

Use this command to scan for any leftover wrong-depth imports:
```bash
cd pocket
grep -rn "from '\.\./anchor\|from '\.\./signer\|from '\.\./inbox\|from '\.\./x402\|from '\.\./llm\|from '\.\./policy" src/app/'(tabs)'/
```

Expected: empty output.

- [ ] **Step 4: Typecheck**

```bash
cd pocket && npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0. (Will fail with import errors if any depth is wrong — fix and re-run.)

### Task 1.14: Tab layout

**Files:**
- Create: `src/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { usePendingCount } from '../../inbox/hooks'

export default function TabsLayout() {
  const { count } = usePendingCount(2000)
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0F',
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#8B5CF6',
        tabBarInactiveTintColor: '#71717A',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pay"
        options={{
          title: 'Pay',
          tabBarIcon: ({ color }) => (
            <Feather name="arrow-up-right" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="inbox" size={22} color={color} />
              {count > 0 && (
                <View className="absolute -top-1 -right-2 bg-violet-600 rounded-full min-w-[16px] h-4 px-1 items-center justify-center">
                  <Text className="text-white text-[10px] font-bold">
                    {count > 9 ? '9+' : count}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Feather name="settings" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
```

### Task 1.15: Tab placeholders + settings stack + dev menu

**Files:**
- Create: `src/app/(tabs)/index.tsx` (Home placeholder)
- Create: `src/app/(tabs)/pay.tsx` (Pay placeholder)
- Create: `src/app/(tabs)/inbox.tsx` (Inbox placeholder)
- Create: `src/app/(tabs)/settings/_layout.tsx` (Stack)
- Create: `src/app/(tabs)/settings/index.tsx` (Settings home placeholder)
- Create: `src/app/(tabs)/settings/dev/_layout.tsx` (Stack)
- Create: `src/app/(tabs)/settings/dev/index.tsx` (Dev menu)

- [ ] **Step 1: Write placeholder Home**

```tsx
// src/app/(tabs)/index.tsx
import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Text } from 'react-native'

export default function Home() {
  return (
    <Screen>
      <Header title="Pocket" subtitle="devnet · placeholder" />
      <Card>
        <Text className="text-gray-400 text-sm">
          Home content lands in Phase 2.
        </Text>
      </Card>
    </Screen>
  )
}
```

- [ ] **Step 2: Write placeholder Pay**

```tsx
// src/app/(tabs)/pay.tsx
import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Text } from 'react-native'

export default function Pay() {
  return (
    <Screen>
      <Header title="Pay" />
      <Card>
        <Text className="text-gray-400 text-sm">
          Talk to Pocket lands in Phase 2.
        </Text>
      </Card>
    </Screen>
  )
}
```

- [ ] **Step 3: Write placeholder Inbox**

```tsx
// src/app/(tabs)/inbox.tsx
import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Text } from 'react-native'

export default function Inbox() {
  return (
    <Screen>
      <Header title="Inbox" />
      <Card>
        <Text className="text-gray-400 text-sm">
          Inbox content lands in Phase 3.
        </Text>
      </Card>
    </Screen>
  )
}
```

- [ ] **Step 4: Write Settings stack layout**

```tsx
// src/app/(tabs)/settings/_layout.tsx
import { Stack } from 'expo-router'

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0A0F' },
      }}
    />
  )
}
```

- [ ] **Step 5: Write Settings home placeholder**

```tsx
// src/app/(tabs)/settings/index.tsx
import { Link } from 'expo-router'
import { Screen } from '../../../ui/Screen'
import { Header } from '../../../ui/Header'
import { Card } from '../../../ui/Card'
import { ListItem } from '../../../ui/ListItem'

export default function SettingsHome() {
  return (
    <Screen>
      <Header title="Settings" />
      <Card padding="sm">
        <Link href="/settings/dev" asChild>
          <ListItem title="Developer" subtitle="Test screens and tools" onPress={() => {}} />
        </Link>
      </Card>
    </Screen>
  )
}
```

(Note: Phase 3 replaces this with the full Settings home. This is the minimum to keep dev screens reachable.)

- [ ] **Step 6: Write dev stack layout**

```tsx
// src/app/(tabs)/settings/dev/_layout.tsx
import { Stack } from 'expo-router'

export default function DevLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0A0F' },
      }}
    />
  )
}
```

- [ ] **Step 7: Write dev menu**

```tsx
// src/app/(tabs)/settings/dev/index.tsx
import { Link } from 'expo-router'
import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { ListItem } from '../../../../ui/ListItem'

const DEV_SCREENS = [
  { href: '/settings/policy', title: 'Policy editor', subtitle: 'On-chain set_policy' },
  { href: '/settings/vault', title: 'Vault state', subtitle: 'Read-only vault PDA + policy' },
  { href: '/settings/dev/signer', title: 'Keystore signer test', subtitle: 'Generate + sign + tweetnacl verify' },
  { href: '/settings/dev/send', title: 'Send test (devnet)', subtitle: 'Airdrop + SOL transfer signed by Keystore' },
  { href: '/settings/dev/x402', title: 'x402 paid request', subtitle: 'Pay an endpoint with Keystore-signed Solana' },
  { href: '/settings/dev/llm', title: 'LLM test', subtitle: 'SmolLM2-360M raw inference' },
  { href: '/settings/dev/parser', title: 'Intent parser benchmark', subtitle: '20-prompt grammar benchmark' },
]

export default function DevIndex() {
  return (
    <Screen>
      <Header title="Developer" subtitle="Test screens preserved from Days 1-16" />
      <Card padding="sm">
        {DEV_SCREENS.map((s) => (
          <Link key={s.href} href={s.href} asChild>
            <ListItem title={s.title} subtitle={s.subtitle} onPress={() => {}} />
          </Link>
        ))}
      </Card>
    </Screen>
  )
}
```

### Task 1.16: Delete old root home + keep legacy /inbox for now

**Files:**
- Delete: `src/app/index.tsx` (replaced by `(tabs)/index.tsx`)
- Modify: `src/app/inbox.tsx` — leave in place; Phase 2 + 3 split it.

Wait — Expo Router routes both `src/app/index.tsx` AND `src/app/(tabs)/index.tsx` to `/`. Having both throws a duplicate-route error at bundle time. Must delete the old one.

- [ ] **Step 1: Delete old home**

```bash
cd pocket && git rm src/app/index.tsx
```

- [ ] **Step 2: Typecheck**

```bash
cd pocket && npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0. (`src/app/inbox.tsx` still imports legacy paths like `../inbox/...` — these still resolve since it didn't move.)

### Task 1.17: Phase 1 acceptance + commit

- [ ] **Step 1: Reload Metro**

In the running Metro dev server: press `r`. The app should boot to the new Tabs layout with 4 tabs at the bottom.

- [ ] **Step 2: Manual acceptance**

Verify on device/emulator:
1. App boots without errors
2. Bottom tab bar with 4 icons (Home, Pay, Inbox, Settings) — violet active color
3. Each placeholder tab renders its "lands in Phase X" message
4. Settings tab → "Developer" row → Dev menu lists 7 test screens
5. Tap each dev screen — each one opens and works as before
6. Tap a Send button or simulator on a dev screen — verify functionality intact (no regression)

If any dev screen errors on load (likely from import depth issues), fix and re-verify.

- [ ] **Step 3: Phase 1 commit**

```bash
cd pocket
git add -A
git commit --no-gpg-sign -m "$(cat <<'EOF'
Phase 1: UI primitives + tab bar shell + dev-screen holding pen

Foundation for the redesign. Ships:

  src/ui/  — 12 component primitives (Screen, Header, Card, Button,
             TextField, Address, TxStatus, EmptyState, Skeleton, Pill,
             Stat, ListItem) + useHaptic hook. No external UI lib;
             all Tailwind classes via Uniwind.

  src/app/(tabs)/_layout.tsx  — bottom tab bar with 4 tabs, violet
             active color, pending-count badge on Inbox via
             usePendingCount.

  src/app/(tabs)/{index,pay,inbox}.tsx + settings/_layout.tsx +
  settings/index.tsx + settings/dev/_layout.tsx +
  settings/dev/index.tsx  — placeholder tabs and stack layouts.

  src/app/(tabs)/settings/{policy,vault}.tsx +
  src/app/(tabs)/settings/dev/{signer,send,x402,llm,parser}.tsx —
             every existing test screen relocated via git mv with
             updated import depths. Settings → Developer lists them.

Deps added:
  expo-haptics (SDK 55-pinned via npx expo install)
  react-native-qrcode-svg + react-native-svg peer

Native rebuild required for expo-haptics. Last forced rebuild of
the redesign — Phases 2-5 are JS-only.

Phase 2 (Home + Pay content) and Phase 3 (Inbox + Settings home)
unblock immediately after this lands.
EOF
)"
```

---

## Phase 2 — Home + Pay tabs

**Goal:** Replace the two most-trafficked placeholder tabs with their real content. Shared helpers extracted from the old `src/app/inbox.tsx`.

### Task 2.1: Extract ActivityRow component

**Files:**
- Create: `src/components/ActivityRow.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { Pressable, Text, View, Linking } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { decodeIntent } from '../inbox/queue'
import { summarizeIntent } from '../inbox/format'
import type { InboxRow } from '../inbox/types'

const STATUS_META = {
  pending: { icon: 'clock', tone: 'text-amber-400' },
  signed: { icon: 'check', tone: 'text-emerald-400' },
  denied: { icon: 'x', tone: 'text-red-400' },
  failed: { icon: 'alert-triangle', tone: 'text-red-400' },
} as const

export function ActivityRow({ row }: { row: InboxRow }) {
  const intent = decodeIntent(row)
  const summary = row.decoded_summary ?? (intent && summarizeIntent(intent))
  const meta = STATUS_META[row.status]
  const sig = row.signed_tx
  const explorerUrl = sig && !sig.startsWith('SIMULATED_') && !sig.startsWith('MANUAL_') && !sig.startsWith('EXECUTED_')
    ? `https://explorer.solana.com/tx/${sig}?cluster=devnet`
    : null

  return (
    <View className="py-3 border-b border-white/[0.04] last:border-0">
      <View className="flex-row items-start gap-3">
        <Feather name={meta.icon as never} size={16} className={meta.tone} color={undefined} />
        <View className="flex-1">
          <Text className="text-white text-sm">
            {summary ?? '(unparseable intent)'}
          </Text>
          <Text className="text-gray-500 text-xs mt-0.5">
            {row.source} · {relTime(row.created_at_ms)}
          </Text>
          {row.denied_reason && (
            <Text className="text-red-300 text-xs mt-1">{row.denied_reason}</Text>
          )}
          {sig && (
            <View className="flex-row items-center gap-2 mt-1">
              <Text className="text-gray-500 text-xs font-mono">
                {sig.length > 16 ? `${sig.slice(0, 8)}…${sig.slice(-6)}` : sig}
              </Text>
              {explorerUrl && (
                <Pressable onPress={() => Linking.openURL(explorerUrl)}>
                  <Feather name="external-link" size={12} color="#71717A" />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

function relTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
```

### Task 2.2: Extract RouteResultPanel component

**Files:**
- Create: `src/components/RouteResultPanel.tsx`

- [ ] **Step 1: Lift from current `src/app/inbox.tsx`**

Copy the `RouteResultPanel`, `labelFor`, and `detailFor` functions verbatim from the current `src/app/inbox.tsx` (lines ~230-330) into a new file. Update import paths.

```tsx
// src/components/RouteResultPanel.tsx
import { Text, View } from 'react-native'
import type { RouteResult } from '../inbox/router'

export function RouteResultPanel({ result }: { result: RouteResult }) {
  const tone =
    result.kind === 'signed-real'
      ? 'green'
      : result.kind === 'signed-simulated' || result.kind === 'queued'
        ? 'blue'
        : result.kind === 'denied' || result.kind === 'refused'
          ? 'amber'
          : 'red'
  const bg = {
    green: 'bg-emerald-500/10 border-emerald-500/30',
    blue: 'bg-blue-500/10 border-blue-500/30',
    amber: 'bg-amber-500/10 border-amber-500/30',
    red: 'bg-red-500/10 border-red-500/30',
  }[tone]
  const fg = {
    green: 'text-emerald-300',
    blue: 'text-blue-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
  }[tone]
  return (
    <View className={`border rounded-2xl p-4 mb-4 ${bg}`}>
      <Text className={`font-bold text-sm mb-1 ${fg}`}>{labelFor(result)}</Text>
      <Text className={`text-xs ${fg}`}>{detailFor(result)}</Text>
    </View>
  )
}

function labelFor(r: RouteResult): string {
  switch (r.kind) {
    case 'signed-real':
      return '✓ Signed + executed on-chain'
    case 'signed-simulated':
      return '✓ Signed (SIMULATED — execution pending)'
    case 'queued':
      return '⋯ Queued for manual review'
    case 'denied':
      return '✗ Denied by policy'
    case 'refused':
      return '✗ Refused by parser'
    case 'parse-failed':
      return '✗ Parse failed'
    case 'expand-failed':
      return '✗ Expand failed'
    case 'execute-failed':
      return '✗ Execution failed'
  }
}

function detailFor(r: RouteResult): string {
  switch (r.kind) {
    case 'signed-real':
      return `tx: ${r.sig.slice(0, 12)}…${r.sig.slice(-6)}`
    case 'signed-simulated':
      return `${r.reason}\nsig: ${r.sig}`
    case 'queued':
      return r.policyResult.action === 'queue' && r.policyResult.reason
        ? r.policyResult.reason
        : 'awaiting your tap in Inbox'
    case 'denied':
      return r.policyResult.action === 'deny'
        ? `${r.policyResult.denied_by}: ${r.policyResult.reason}`
        : 'denied'
    case 'refused':
      return `${r.reason} (${r.durationMs}ms)`
    case 'parse-failed':
      return `${r.reason}: ${r.raw}`
    case 'expand-failed':
      return r.reason
    case 'execute-failed':
      return r.reason
  }
}
```

### Task 2.3: Build Home tab

**Files:**
- Replace: `src/app/(tabs)/index.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { useEffect, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Stat } from '../../ui/Stat'
import { Address } from '../../ui/Address'
import { Skeleton } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { ActivityRow } from '../../components/ActivityRow'
import {
  createKeystoreWalletAdapter,
  type KeystoreWalletAdapter,
} from '../../x402/keystoreWalletAdapter'
import { useInbox, usePendingCount } from '../../inbox/hooks'
import { DEVNET_RPC } from '../../anchor/constants'

const FAKE_USDC_MINT = 'BofnM1aZaTJfxpoDD82oDJQEcSEyKtHjEEEUujCmE29v'

export default function Home() {
  const [adapter, setAdapter] = useState<KeystoreWalletAdapter | null>(null)
  const [sol, setSol] = useState<number | null>(null)
  const [usdc, setUsdc] = useState<number | null>(null)
  const { rows, loading } = useInbox({ limit: 5, pollMs: 2000 })
  const { count: pending } = usePendingCount(2000)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const a = await createKeystoreWalletAdapter()
        if (cancelled) return
        setAdapter(a)
        const conn = new Connection(DEVNET_RPC, 'confirmed')
        const lamports = await conn.getBalance(a.publicKey, 'confirmed')
        if (cancelled) return
        setSol(lamports / LAMPORTS_PER_SOL)
        try {
          const ata = getAssociatedTokenAddressSync(
            new PublicKey(FAKE_USDC_MINT),
            a.publicKey,
          )
          const bal = await conn.getTokenAccountBalance(ata, 'confirmed')
          if (cancelled) return
          setUsdc(Number(bal.value.uiAmountString ?? '0'))
        } catch {
          setUsdc(0)
        }
      } catch {
        /* ignore — Keystore not ready */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen>
      <Header
        title="Pocket"
        subtitle="devnet"
        right={<Feather name="settings" size={18} color="#FAFAFA" />}
        onRightPress={() => router.push('/settings')}
      />

      <Card>
        {adapter ? (
          <View>
            <Address address={adapter.address} />
            <View className="mt-4">
              {sol === null || usdc === null ? (
                <Skeleton width={180} height={40} />
              ) : (
                <Stat
                  value={`$${(sol * 100 + usdc).toFixed(2)}`}
                  subtitle={`${sol.toFixed(4)} SOL · ${usdc.toFixed(2)} fakeUSDC`}
                />
              )}
            </View>
          </View>
        ) : (
          <Skeleton height={80} />
        )}
      </Card>

      <View className="flex-row gap-2 mt-4">
        <QuickAction
          icon="arrow-up-right"
          label="Pay"
          onPress={() => router.push('/pay')}
        />
        <QuickAction
          icon="qr-code"
          label="Receive"
          onPress={() => router.push('/receive')}
        />
        <QuickAction
          icon="lock"
          label="Vault"
          onPress={() => router.push('/settings/vault')}
        />
      </View>

      {pending > 0 && (
        <Pressable
          onPress={() => router.push('/inbox')}
          className="mt-4 active:opacity-80"
        >
          <Card variant="accent">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-violet-200 font-semibold text-sm">
                  {pending} pending agent request{pending === 1 ? '' : 's'}
                </Text>
                <Text className="text-violet-300/70 text-xs mt-0.5">
                  Review them in Inbox
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#C4B5FD" />
            </View>
          </Card>
        </Pressable>
      )}

      <View className="mt-6">
        <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
          Recent activity
        </Text>
        <Card padding="md">
          {loading && rows.length === 0 ? (
            <View>
              <Skeleton height={32} />
              <View style={{ height: 12 }} />
              <Skeleton height={32} />
            </View>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Feather name="inbox" size={36} color="#A1A1AA" />}
              title="No activity yet"
              body="Your payments and agent requests will appear here."
              cta={{ label: 'Send your first one →', onPress: () => router.push('/pay') }}
            />
          ) : (
            <View>
              {rows.map((row) => (
                <ActivityRow key={row.id} row={row} />
              ))}
              <Link href="/inbox" asChild>
                <Pressable className="pt-3 active:opacity-60">
                  <Text className="text-violet-400 text-sm text-center font-semibold">
                    See all activity →
                  </Text>
                </Pressable>
              </Link>
            </View>
          )}
        </Card>
      </View>
    </Screen>
  )
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: string
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 bg-[#14141C] border border-white/[0.06] rounded-2xl py-4 items-center active:opacity-80 active:scale-[0.98]"
    >
      <Feather name={icon as never} size={20} color="#8B5CF6" />
      <Text className="text-white text-xs font-semibold mt-2">{label}</Text>
    </Pressable>
  )
}
```

### Task 2.4: Build Pay tab

**Files:**
- Replace: `src/app/(tabs)/pay.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/TextField'
import { EmptyState } from '../../ui/EmptyState'
import { useHaptic } from '../../ui/useHaptic'
import { ActivityRow } from '../../components/ActivityRow'
import { RouteResultPanel } from '../../components/RouteResultPanel'
import { openInbox } from '../../inbox/db'
import { useInbox } from '../../inbox/hooks'
import { defaultPolicy } from '../../inbox/simulator'
import { routeSentence, type RouteResult } from '../../inbox/router'
import { getModelStatus } from '../../llm/model'

const DEFAULT_X402_DEMO_URL = 'http://10.0.2.2:4242/api/quote'
const EXAMPLES = [
  'pay api.helius.dev 0.5 USDC for a query',
  'send 1 USDC to alice.sol',
  'send 5 USDC to bob.sol',
]

export default function Pay() {
  const [text, setText] = useState('')
  const [demoUrl, setDemoUrl] = useState(DEFAULT_X402_DEMO_URL)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [routing, setRouting] = useState(false)
  const [result, setResult] = useState<RouteResult | null>(null)
  const trigger = useHaptic()
  const { rows } = useInbox({ status: 'signed', limit: 5, pollMs: 2000 })

  const paymentRows = rows.filter((r) => {
    const sig = r.signed_tx ?? ''
    return sig && !sig.startsWith('SIMULATED_') && !sig.startsWith('MANUAL_')
  })

  async function onSend() {
    if (routing || !text.trim()) return
    const status = await getModelStatus()
    if (status.state !== 'ready') {
      setResult({
        kind: 'parse-failed',
        reason: 'model not downloaded',
        raw: 'Open Settings → Developer → LLM test and download the model.',
        durationMs: 0,
      })
      trigger('warning')
      return
    }
    setRouting(true)
    setResult(null)
    try {
      const r = await routeSentence(text.trim(), {
        runner: openInbox(),
        policy: defaultPolicy(),
        demoX402Url: demoUrl.trim() || DEFAULT_X402_DEMO_URL,
      })
      setResult(r)
      trigger(r.kind === 'signed-real' ? 'success' : 'tap')
    } catch (e) {
      setResult({
        kind: 'parse-failed',
        reason: 'unhandled',
        raw: String((e as Error).message ?? e),
        durationMs: 0,
      })
      trigger('error')
    } finally {
      setRouting(false)
    }
  }

  return (
    <Screen>
      <Header title="Pay" subtitle="What would you like to do?" />

      <TextField
        value={text}
        onChangeText={setText}
        multiline
        placeholder="pay api.helius.dev 0.5 USDC"
        autoCapitalize="sentences"
        autoCorrect={false}
      />

      <View className="flex-row flex-wrap gap-2 mb-4">
        {EXAMPLES.map((ex) => (
          <Pressable
            key={ex}
            onPress={() => setText(ex)}
            className="bg-white/5 px-3 py-2 rounded-full active:opacity-60"
          >
            <Text className="text-gray-300 text-xs">{ex}</Text>
          </Pressable>
        ))}
      </View>

      <View className="mb-4">
        <Button onPress={onSend} variant="primary" size="lg" loading={routing}>
          {routing ? 'parsing + routing…' : 'Send'}
        </Button>
      </View>

      {result && <RouteResultPanel result={result} />}

      <Pressable
        onPress={() => setAdvancedOpen((v) => !v)}
        className="flex-row items-center gap-2 mb-3"
      >
        <Feather
          name={advancedOpen ? 'chevron-down' : 'chevron-right'}
          size={14}
          color="#A1A1AA"
        />
        <Text className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
          Advanced
        </Text>
      </Pressable>
      {advancedOpen && (
        <Card>
          <TextField
            label="x402 demo URL"
            value={demoUrl}
            onChangeText={setDemoUrl}
            autoCapitalize="none"
            autoCorrect={false}
            helper="Where your local x402 server is reachable. Default is the Android emulator → host loopback. Use your Mac's LAN IP or an ngrok URL for a physical device."
          />
        </Card>
      )}

      {paymentRows.length > 0 && (
        <View className="mt-6">
          <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
            Recent payments
          </Text>
          <Card padding="md">
            {paymentRows.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </Card>
        </View>
      )}

      {paymentRows.length === 0 && (
        <View className="mt-6">
          <EmptyState
            icon={<Feather name="zap" size={28} color="#A1A1AA" />}
            title="No paid requests yet"
            body="Tap Send above to make your first on-chain payment."
          />
        </View>
      )}
    </Screen>
  )
}
```

### Task 2.5: Phase 2 acceptance + commit

- [ ] **Step 1: Typecheck**

```bash
cd pocket && npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0.

- [ ] **Step 2: Reload Metro + manual acceptance**

1. Home tab renders address + balance card + 3 quick actions + (banner if pending) + recent activity
2. Tap Pay tab → big input + chips + Send button + collapsible Advanced
3. Type a working sentence → Send → green panel → Recent payments updates immediately (the Day-16 polling-race fix lives in Phase 5 for now; OK if there's a 2 s lag)
4. Empty state appears if no recent activity / payments

- [ ] **Step 3: Phase 2 commit**

```bash
cd pocket && git add -A && git commit --no-gpg-sign -m "$(cat <<'EOF'
Phase 2: real Home + Pay tabs

Replaces the placeholder tabs from Phase 1 with their actual content.

src/app/(tabs)/index.tsx — Home
  Address card with live SOL + fake-USDC balance (Skeleton while
  loading), 3 quick actions (Pay / Receive / Vault), pending-inbox
  accent banner when count > 0, last 5 activity rows in a Card,
  "See all activity →" link to Inbox tab.

src/app/(tabs)/pay.tsx — Pay
  Big multiline input + 3 example chips (tap to fill), Send button
  with haptics, collapsible Advanced section for the x402 demo URL,
  RouteResultPanel for inline results, Recent Payments feed
  (signed-real only — filters out SIMULATED_/MANUAL_).

src/components/ActivityRow.tsx
  Shared row used by Home + Inbox. Status icon + tone-coded text +
  optional explorer link for real on-chain sigs.

src/components/RouteResultPanel.tsx
  Lifted from the old app/inbox.tsx with no logic changes. Used by
  Pay (Phase 2) and Inbox (Phase 3) — single source of truth for
  RouteResult rendering.

All underlying logic (router, policy, queue, parser) unchanged.
EOF
)"
```

---

## Phase 3 — Inbox + Settings home

**Goal:** Real Inbox tab (no simulators) and real Settings home with grouped sections.

### Task 3.1: Build Inbox tab

**Files:**
- Replace: `src/app/(tabs)/inbox.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Button } from '../../ui/Button'
import { Pill } from '../../ui/Pill'
import { EmptyState } from '../../ui/EmptyState'
import { useHaptic } from '../../ui/useHaptic'
import { ActivityRow } from '../../components/ActivityRow'
import { openInbox } from '../../inbox/db'
import { useInbox } from '../../inbox/hooks'
import {
  decodeIntent,
  decodePolicyResult,
  markDenied,
  markSigned,
} from '../../inbox/queue'
import { summarizeIntent } from '../../inbox/format'
import type { InboxRow, InboxStatus } from '../../inbox/types'

type Filter = 'all' | InboxStatus

export default function Inbox() {
  const { rows, refresh } = useInbox({ limit: 100, pollMs: 2000 })
  const [filter, setFilter] = useState<Filter>('all')
  const trigger = useHaptic()

  const pending = useMemo(
    () => rows.filter((r) => r.status === 'pending'),
    [rows],
  )
  const visible = useMemo(() => {
    if (filter === 'all') return rows.filter((r) => r.status !== 'pending')
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const counts = useMemo(() => {
    const c = { pending: 0, signed: 0, denied: 0, failed: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  function onApprove(row: InboxRow) {
    trigger('success')
    markSigned(openInbox(), row.id, `MANUAL_${shortRandom()}`)
    refresh()
  }

  function onDeny(row: InboxRow) {
    trigger('warning')
    markDenied(openInbox(), row.id, 'user denied from inbox')
    refresh()
  }

  return (
    <Screen>
      <Header title="Inbox" subtitle="Local sqlite queue · PolicyGuard auto-routes" />

      <View className="flex-row gap-2 mb-6">
        <Pill tone="warn">{counts.pending} pending</Pill>
        <Pill tone="ok">{counts.signed} signed</Pill>
        <Pill tone="bad">{counts.denied} denied</Pill>
        {counts.failed > 0 && <Pill tone="bad">{counts.failed} failed</Pill>}
      </View>

      <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
        Pending ({pending.length})
      </Text>
      {pending.length === 0 ? (
        <Card>
          <Text className="text-gray-500 text-sm italic">
            No pending requests. Agent activity will appear here when it needs your review.
          </Text>
        </Card>
      ) : (
        <View className="gap-3">
          {pending.map((row) => (
            <PendingCard
              key={row.id}
              row={row}
              onApprove={() => onApprove(row)}
              onDeny={() => onDeny(row)}
            />
          ))}
        </View>
      )}

      <View className="mt-6">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
            Activity
          </Text>
          <FilterDropdown value={filter} onChange={setFilter} />
        </View>
        {visible.length === 0 ? (
          <EmptyState
            icon={<Feather name="inbox" size={36} color="#A1A1AA" />}
            title="Nothing here yet"
            body="Type something in the Pay tab, or trigger a canned simulator from Settings → Developer."
          />
        ) : (
          <Card padding="md">
            {visible.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  )
}

function PendingCard({
  row,
  onApprove,
  onDeny,
}: {
  row: InboxRow
  onApprove: () => void
  onDeny: () => void
}) {
  const intent = decodeIntent(row)
  const policy = decodePolicyResult(row)
  const summary = row.decoded_summary ?? (intent && summarizeIntent(intent))
  return (
    <Card variant="accent">
      <Text className="text-white font-semibold text-sm mb-1">
        {summary ?? '(unparseable intent)'}
      </Text>
      <Text className="text-violet-300/70 text-xs mb-3">
        {row.source} · {relTime(row.created_at_ms)}
      </Text>
      {policy && policy.action === 'queue' && (
        <Text className="text-violet-200 text-xs mb-3 italic">
          {policy.reason}
        </Text>
      )}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button variant="destructive" onPress={onDeny}>
            Deny
          </Button>
        </View>
        <View className="flex-1">
          <Button variant="primary" onPress={onApprove}>
            Approve
          </Button>
        </View>
      </View>
    </Card>
  )
}

function FilterDropdown({
  value,
  onChange,
}: {
  value: Filter
  onChange: (v: Filter) => void
}) {
  const FILTERS: Filter[] = ['all', 'signed', 'denied', 'failed']
  return (
    <View className="flex-row gap-1">
      {FILTERS.map((f) => (
        <Pressable
          key={f}
          onPress={() => onChange(f)}
          className={`px-2.5 py-1 rounded-full ${
            value === f ? 'bg-violet-500/20' : 'active:bg-white/5'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${value === f ? 'text-violet-300' : 'text-gray-500'}`}
          >
            {f}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function relTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 10)
}
```

### Task 3.2: Build Settings home (full version)

**Files:**
- Replace: `src/app/(tabs)/settings/index.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { useEffect, useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'

import { Screen } from '../../../ui/Screen'
import { Header } from '../../../ui/Header'
import { Card } from '../../../ui/Card'
import { ListItem } from '../../../ui/ListItem'
import { Pill } from '../../../ui/Pill'
import { Address } from '../../../ui/Address'
import {
  createKeystoreWalletAdapter,
  type KeystoreWalletAdapter,
} from '../../../x402/keystoreWalletAdapter'
import { DEVNET_RPC, POCKET_VAULT_PROGRAM_ID } from '../../../anchor/constants'
import {
  createReadOnlyClient,
  deriveVaultPda,
  fetchPolicy,
  fetchVault,
  type PolicyAccount,
  type VaultAccount,
} from '../../../anchor/client'
import { getModelStatus } from '../../../llm/model'

export default function SettingsHome() {
  const router = useRouter()
  const [adapter, setAdapter] = useState<KeystoreWalletAdapter | null>(null)
  const [vaultOpen, setVaultOpen] = useState<boolean | null>(null)
  const [policySummary, setPolicySummary] = useState<string | null>(null)
  const [modelReady, setModelReady] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const a = await createKeystoreWalletAdapter()
        if (cancelled) return
        setAdapter(a)
        const ro = createReadOnlyClient(DEVNET_RPC)
        const v = await fetchVault(ro, a.publicKey)
        if (cancelled) return
        setVaultOpen(!!v)
        if (v) {
          const p = await fetchPolicy(ro, v.vault)
          if (cancelled) return
          if (p) {
            const maxTx = Number(p.data.maxPerTxBaseUnits) / 1_000_000
            setPolicySummary(`${maxTx} USDC / tx`)
          } else {
            setPolicySummary('Not set')
          }
        }
        const ms = await getModelStatus()
        if (cancelled) return
        setModelReady(ms.state === 'ready')
      } catch {
        /* leave nulls */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen>
      <Header title="Settings" />

      <Section title="Account">
        <Card padding="sm">
          <ListItem
            title="Address"
            right={
              adapter ? <Address address={adapter.address} withCopy={false} /> : null
            }
          />
          <ListItem
            title="Network"
            right={<Pill tone="info">devnet</Pill>}
          />
          <ListItem title="Backup" right={<Pill tone="neutral">Not set</Pill>} disabled />
        </Card>
      </Section>

      <Section title="Pocket Vault">
        <Card padding="sm">
          <ListItem
            title="Vault status"
            right={
              <Pill tone={vaultOpen ? 'ok' : 'warn'}>
                {vaultOpen === null ? '…' : vaultOpen ? 'Opened' : 'Not opened'}
              </Pill>
            }
            onPress={() => router.push('/settings/vault')}
          />
          <ListItem
            title="On-chain policy"
            right={
              <Text className="text-gray-400 text-sm">
                {policySummary ?? '…'}
              </Text>
            }
            onPress={() => router.push('/settings/policy')}
          />
        </Card>
      </Section>

      <Section title="Agent">
        <Card padding="sm">
          <ListItem
            title="Local intent parser"
            subtitle="SmolLM2-360M on-device"
            right={
              <Pill tone={modelReady ? 'ok' : 'warn'}>
                {modelReady === null ? '…' : modelReady ? 'Ready' : 'Not downloaded'}
              </Pill>
            }
            onPress={() => router.push('/settings/dev/llm')}
          />
          <ListItem
            title="Policy engine"
            subtitle="PolicyGuard"
            right={<Pill tone="info">Local</Pill>}
            onPress={() => router.push('/settings/policy')}
          />
        </Card>
      </Section>

      <Section title="Developer">
        <Card padding="sm">
          {DEV_LINKS.map((d) => (
            <ListItem
              key={d.href}
              title={d.title}
              subtitle={d.subtitle}
              onPress={() => router.push(d.href as never)}
            />
          ))}
        </Card>
      </Section>

      <Section title="About">
        <Card padding="sm">
          <ListItem title="Version" right={<Text className="text-gray-400 text-sm">0.1.0</Text>} />
          <ListItem
            title="Program ID"
            right={<Address address={POCKET_VAULT_PROGRAM_ID} withCopy={false} />}
          />
          <ListItem
            title="License"
            right={<Text className="text-gray-400 text-sm">MIT</Text>}
          />
        </Card>
      </Section>
    </Screen>
  )
}

const DEV_LINKS = [
  { href: '/settings/dev/signer', title: 'Keystore signer test', subtitle: 'Generate + sign + verify' },
  { href: '/settings/dev/send', title: 'Send test (devnet)', subtitle: 'Airdrop + SOL transfer' },
  { href: '/settings/dev/x402', title: 'x402 paid request', subtitle: 'Direct pay endpoint test' },
  { href: '/settings/dev/llm', title: 'LLM test', subtitle: 'Raw model inference' },
  { href: '/settings/dev/parser', title: 'Intent parser benchmark', subtitle: '20-prompt benchmark' },
  { href: '/settings/dev/simulators', title: 'Canned inbox simulators', subtitle: '5 scripted agent intents' },
  { href: '/settings/dev/anchor', title: 'Anchor program info', subtitle: 'Program ID + IDL + explorer' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
        {title}
      </Text>
      {children}
    </View>
  )
}
```

### Task 3.3: Phase 3 acceptance + commit

- [ ] **Step 1: Typecheck**

```bash
cd pocket && npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 2: Manual acceptance**

1. Inbox tab: status chips at top, pending cards if any, activity feed below, filter dropdown works
2. Settings tab: Account / Pocket Vault / Agent / Developer / About sections all render with live status values
3. Tap any settings row → navigates correctly
4. Pending count badge on Inbox tab updates (use a canned simulator that queues to verify)

- [ ] **Step 3: Phase 3 commit**

```bash
cd pocket && git add -A && git commit --no-gpg-sign -m "$(cat <<'EOF'
Phase 3: real Inbox + Settings home

src/app/(tabs)/inbox.tsx
  Status chips (pending / signed / denied / failed), pending cards
  with Approve/Deny + haptics, activity feed with All/Signed/Denied
  /Failed filter dropdown, EmptyState when filter has no rows. No
  simulator buttons — those live under Settings → Developer now.

src/app/(tabs)/settings/index.tsx
  Account / Pocket Vault / Agent / Developer / About sections.
  Live status pills (vault open?, model downloaded?, policy summary)
  loaded once on mount. Developer section lists 7 dev screens.

The old src/app/inbox.tsx remains in place for now — Phase 4 deletes
it once the dev/simulators screen lifts the canned scenarios block.

Underlying logic (queue, hooks, anchor client, model status) unchanged.
EOF
)"
```

---

## Phase 4 — Sub-screen migration

**Goal:** Restyle every moved-but-untouched dev screen with the new primitives. Lift the canned simulators out of the old inbox. Add anchor info screen. Delete the legacy inbox file.

### Task 4.1: Migrate Policy editor

**Files:**
- Modify: `src/app/(tabs)/settings/policy.tsx` (already moved in Phase 1)

- [ ] **Step 1: Restyle**

Replace the imports + JSX in `policy.tsx` to use new primitives:
- `<ScrollView>` wrapper → `<Screen>`
- Inline section headers → `<Header>` (top) + `Section` pattern from Settings home
- Ad-hoc View panels → `<Card>`
- Pressable buttons → `<Button>` with variant `primary` / `secondary` / `destructive`
- Address spans → `<Address>`
- TextInput wrappers → `<TextField>`
- Error spans → use the `error` prop on `<TextField>` or a `<Card variant="accent">` with red tone for the funding-guard panel
- Add `useHaptic()` calls: `trigger('tap')` on Open vault / Push policy taps, `trigger('success')` on success, `trigger('error')` on failure

Logic (state machine, `parseForm`, `onOpenVault`, `onSetPolicy`, BN math) stays verbatim. Just swap presentation.

- [ ] **Step 2: Typecheck**

### Task 4.2: Migrate Vault screen with toggle

**Files:**
- Modify: `src/app/(tabs)/settings/vault.tsx`

- [ ] **Step 1: Restyle + add toggle**

Restyle with primitives as in Task 4.1. Additionally:
- Add state: `const [source, setSource] = useState<'mine' | 'test'>('mine')`
- At top, render a `<Pill>` toggle: two pills "My vault" and "Test wallet vault" — tap to switch
- When `source === 'mine'`: compute the Keystore address via `createKeystoreWalletAdapter()` and fetch its vault
- When `source === 'test'`: use `DAY_6_TEST_AUTHORITY` (the existing hardcoded address)
- Re-fetch when source changes

- [ ] **Step 2: Typecheck**

### Task 4.3: Migrate all dev screens

**Files:**
- Modify: `src/app/(tabs)/settings/dev/signer.tsx`
- Modify: `src/app/(tabs)/settings/dev/send.tsx`
- Modify: `src/app/(tabs)/settings/dev/x402.tsx`
- Modify: `src/app/(tabs)/settings/dev/llm.tsx`
- Modify: `src/app/(tabs)/settings/dev/parser.tsx`

For each of these:

- [ ] **Step 1: Replace ScrollView wrapper with `<Screen>`**
- [ ] **Step 2: Replace inline section helpers with `Section` + `<Card>`**
- [ ] **Step 3: Replace inline Pressable with `<Button>` (correct variant per action)**
- [ ] **Step 4: Replace address Text spans with `<Address>`**
- [ ] **Step 5: Replace inline error/success panels with `<Card variant="accent">` or tone-coded inline**
- [ ] **Step 6: Add `useHaptic` calls on primary actions**

Logic (download flow, signer init, parser benchmark loop, etc.) untouched.

### Task 4.4: Lift canned simulators

**Files:**
- Create: `src/app/(tabs)/settings/dev/simulators.tsx`

- [ ] **Step 1: Write the file**

Lift the "Simulate agent request" block from the OLD `src/app/inbox.tsx` (the 5-scenario list + the `onSimulate` handler) into this new file. Use `<Screen>` + `<Header>` + `<Card>` + `<Button>`. Each scenario is a row showing the label + a tone-coded badge for expected outcome (`allow` / `queue` / `deny`).

```tsx
import { useState } from 'react'
import { Text, View } from 'react-native'
import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { Button } from '../../../../ui/Button'
import { Pill } from '../../../../ui/Pill'
import { openInbox } from '../../../../inbox/db'
import { SCENARIOS, defaultPolicy, evaluateAndEnqueue } from '../../../../inbox/simulator'
import { evaluate } from '../../../../policy/guard'
import { computeLedger } from '../../../../inbox/simulator'

export default function SimulatorsScreen() {
  const [busy, setBusy] = useState<string | null>(null)
  const [lastDecision, setLastDecision] = useState<string | null>(null)

  function onSimulate(key: string) {
    const scenario = SCENARIOS.find((s) => s.key === key)
    if (!scenario) return
    setBusy(key)
    try {
      const runner = openInbox()
      const result = evaluateAndEnqueue(runner, scenario.build(), defaultPolicy())
      setLastDecision(
        `${scenario.label} → ${result.action.toUpperCase()}` +
          (result.reason ? ` (${result.reason})` : ''),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen>
      <Header
        title="Inbox simulators"
        subtitle="Pre-baked Intents that bypass the LLM. Useful for testing PolicyGuard branches deterministically."
      />
      <View className="gap-2">
        {SCENARIOS.map((s) => (
          <Card key={s.key} padding="sm">
            <Text className="text-white text-sm font-semibold mb-2">
              {s.label}
            </Text>
            <Button
              variant="secondary"
              onPress={() => onSimulate(s.key)}
              disabled={busy !== null}
            >
              {busy === s.key ? 'running…' : 'Run'}
            </Button>
          </Card>
        ))}
      </View>
      {lastDecision && (
        <Card variant="accent" padding="md">
          <Text className="text-violet-200 text-xs">{lastDecision}</Text>
        </Card>
      )}
    </Screen>
  )
}
```

### Task 4.5: Add Anchor info screen

**Files:**
- Create: `src/app/(tabs)/settings/dev/anchor.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { Linking, Pressable, Text } from 'react-native'
import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { ListItem } from '../../../../ui/ListItem'
import { Address } from '../../../../ui/Address'
import { POCKET_VAULT_PROGRAM_ID } from '../../../../anchor/constants'

const EXPLORER = `https://explorer.solana.com/address/${POCKET_VAULT_PROGRAM_ID}?cluster=devnet`

export default function AnchorInfo() {
  return (
    <Screen>
      <Header title="Anchor program" subtitle="pocket_vault" />
      <Card padding="sm">
        <ListItem
          title="Program ID"
          right={<Address address={POCKET_VAULT_PROGRAM_ID} withCopy={false} />}
        />
        <ListItem
          title="Cluster"
          right={<Text className="text-gray-400 text-sm">devnet</Text>}
        />
        <ListItem
          title="View on Explorer"
          onPress={() => Linking.openURL(EXPLORER)}
          right={null}
        />
      </Card>
      <Text className="text-xs text-gray-500 mt-4 leading-relaxed">
        pocket_vault is a per-authority PDA + Policy account. Instructions:
        open_vault, deposit, set_policy, withdraw_under_policy. IDL ships in
        src/anchor/idl/pocket_vault.json.
      </Text>
    </Screen>
  )
}
```

### Task 4.6: Delete legacy inbox file

**Files:**
- Delete: `src/app/inbox.tsx`

- [ ] **Step 1: Delete + verify**

```bash
cd pocket && git rm src/app/inbox.tsx
npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0.

### Task 4.7: Phase 4 acceptance + commit

- [ ] **Step 1: Manual acceptance**

Tap through every dev screen. Each one:
- Opens without error
- Has the new visual style (cards, screen wrapper, primitives)
- Functionality intact (download, sign, send, parse, etc.)
- Vault screen toggle works between My vault / Test wallet vault

- [ ] **Step 2: Phase 4 commit**

```bash
cd pocket && git add -A && git commit --no-gpg-sign -m "$(cat <<'EOF'
Phase 4: sub-screen migrations + canned simulators lift

Every dev/settings screen restyled to use the src/ui/ primitives —
Screen + Header + Card + Button + Address + TextField + Pill. No
functional changes beyond:

  vault: now defaults to the user's Keystore vault, with a Pill
    toggle to flip to the Day-6 test-wallet vault for debugging.

  policy: same logic; gets haptics on Open vault + Push policy + 
    Update flows; clearer fund-me panel using Card variant=accent.

  signer / send / x402 / llm / parser: pure restyles.

  dev/simulators (new): lifts the 5 canned scenarios out of the
    deleted legacy app/inbox.tsx. Same evaluateAndEnqueue path.

  dev/anchor (new): program ID + cluster + explorer link.

Deletes: src/app/inbox.tsx (replaced by (tabs)/inbox.tsx in Phase 3
and (tabs)/pay.tsx in Phase 2; canned scenarios moved here).
EOF
)"
```

---

## Phase 5 — Receive + Polish

**Goal:** Modal Receive screen with QR code, finishing-touch polish on loading states + haptics + polling race.

### Task 5.1: Build Receive modal

**Files:**
- Create: `src/app/receive.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'

import { Screen } from '../ui/Screen'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import {
  createKeystoreWalletAdapter,
  type KeystoreWalletAdapter,
} from '../x402/keystoreWalletAdapter'

export default function Receive() {
  const router = useRouter()
  const [adapter, setAdapter] = useState<KeystoreWalletAdapter | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const a = await createKeystoreWalletAdapter()
      if (!cancelled) setAdapter(a)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen>
      <View className="flex-row items-center justify-between mb-6">
        <Text className="text-3xl font-extrabold text-white">Receive</Text>
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/5 items-center justify-center active:bg-white/10"
        >
          <Feather name="x" size={18} color="#FAFAFA" />
        </Pressable>
      </View>

      <Card padding="lg">
        <View className="items-center py-4">
          {adapter ? (
            <QRCode
              value={adapter.address}
              size={220}
              color="#FAFAFA"
              backgroundColor="#14141C"
            />
          ) : (
            <Skeleton width={220} height={220} radius={12} />
          )}
        </View>
        <Text className="text-xs uppercase tracking-wider text-gray-400 mb-1 mt-3 font-semibold text-center">
          your address
        </Text>
        {adapter ? (
          <Text
            selectable
            className="text-white text-xs font-mono text-center"
          >
            {adapter.address}
          </Text>
        ) : (
          <Skeleton height={14} />
        )}
      </Card>

      {adapter && (
        <Card variant="accent" padding="md">
          <Text className="text-violet-200 text-xs font-semibold mb-2">
            Fund this address from your Mac
          </Text>
          <Text className="text-violet-300/80 text-xs font-mono leading-relaxed">
            cd pocket/tools/x402-server{'\n'}
            npm run mint-to -- {adapter.address}
          </Text>
        </Card>
      )}
    </Screen>
  )
}
```

- [ ] **Step 2: Register the modal route**

The `receive.tsx` file at `src/app/` level is automatically a route at `/receive`. To make it a modal presentation (slide-up sheet), update `src/app/_layout.tsx`:

Look at the existing root layout. If it uses `<Slot />`, switch to `<Stack>` with the modal route:

```tsx
// src/app/_layout.tsx
import '../global.css'
import { Stack } from 'expo-router'
import { AppIdentity, createSolanaDevnet, MobileWalletProvider } from '@wallet-ui/react-native-kit'

const cluster = createSolanaDevnet()
const identity: AppIdentity = { name: 'Pocket' }

export default function Layout() {
  return (
    <MobileWalletProvider cluster={cluster} identity={identity}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0F' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="receive" options={{ presentation: 'modal' }} />
      </Stack>
    </MobileWalletProvider>
  )
}
```

### Task 5.2: Wire useHaptic across primary actions

**Files:** All `(tabs)/settings/dev/*.tsx` from Phase 4

- [ ] **Step 1: Audit every Button onPress**

Grep for primary `<Button variant="primary"` and `<Button variant="destructive"` across the dev screens. Each onPress callback should call `trigger('tap')` at start, `trigger('success')` on success result, `trigger('error')` on error result. The `<Button>` primitive already triggers `tap` by default (built in Task 1.4), so this audit is mostly about adding `success` / `error` on result.

### Task 5.3: Fix Day-16 polling race

**Files:**
- Modify: `src/inbox/router.ts`

- [ ] **Step 1: Add a refresh callback to RouterDeps**

```ts
// In src/inbox/router.ts
export type RouterDeps = {
  runner: SqliteRunner
  policy: Policy
  demoX402Url: string
  /** Called immediately after any markSigned/markDenied/markFailed
   *  transition so the caller's useInbox hook re-reads instead of
   *  waiting for the next 2s poll. */
  onMutate?: () => void
}
```

In every place we call `queue.markSigned`, `queue.markDenied`, `queue.markFailed`, immediately follow with `deps.onMutate?.()`.

- [ ] **Step 2: Wire from Pay screen**

In `src/app/(tabs)/pay.tsx`, change the `routeSentence` call:

```ts
const { refresh } = useInbox({ status: 'signed', limit: 5, pollMs: 2000 })
// ...
const r = await routeSentence(text.trim(), {
  runner: openInbox(),
  policy: defaultPolicy(),
  demoX402Url: demoUrl.trim() || DEFAULT_X402_DEMO_URL,
  onMutate: refresh,
})
```

### Task 5.4: Empty-state polish

**Files:** `src/app/(tabs)/inbox.tsx`, `src/app/(tabs)/index.tsx`, `src/app/(tabs)/pay.tsx`

- [ ] **Step 1: Verify each EmptyState has a useful CTA**

Quick audit pass — every empty state should have either a CTA button or a clear "what to do next" sentence. Already mostly in place from Phases 2 / 3.

### Task 5.5: Skeleton-loading audit

**Files:** `src/app/(tabs)/index.tsx`, `src/app/(tabs)/settings/index.tsx`

- [ ] **Step 1: Verify every "loading" state uses Skeleton not ActivityIndicator**

ActivityIndicator is acceptable for "the whole screen is initializing" (e.g. Pay's parsing state). For contentful loading (balance, activity feed, policy summary) use `<Skeleton>`. Already mostly in place from Phase 2.

### Task 5.6: Phase 5 acceptance + commit

- [ ] **Step 1: Manual acceptance pass**

1. Home → tap Receive button → modal slides up with QR + selectable address + fund instructions; tap X to dismiss
2. Pay → type "pay api.helius.dev 0.5 USDC" → Send → green panel appears AND recent payments row appears immediately (no 2 s lag)
3. Inbox: empty states are friendly; pending Approve/Deny haptics fire
4. Settings: live status pills load
5. Every dev screen still works (no regressions from haptics audit)

- [ ] **Step 2: Phase 5 commit**

```bash
cd pocket && git add -A && git commit --no-gpg-sign -m "$(cat <<'EOF'
Phase 5: Receive modal + polish

src/app/receive.tsx (new modal route)
  QR code via react-native-qrcode-svg + selectable full address +
  Card with the funding CLI command pre-filled.

src/app/_layout.tsx
  Switches from Slot to Stack so /receive can be presented as a
  modal sheet (slide-up from bottom).

src/inbox/router.ts
  Adds onMutate callback on RouterDeps. Every markSigned/markDenied/
  markFailed transition calls it so the screen can refresh
  immediately instead of waiting for the 2 s polling tick. Fixes the
  Day-16 polling-race UX nit.

src/app/(tabs)/pay.tsx
  Threads useInbox's refresh as router onMutate. Recent Payments
  updates instantly after Send.

src/app/(tabs)/* — useHaptic audit
  Primary destructive actions trigger 'tap' + 'success/error' tones.

Test suite still 70/70 green. No new deps beyond Phase 1.

End of UX redesign sweep. Pocket now reads as a real consumer app
with every Days-1-16 functional surface intact behind Settings →
Developer.
EOF
)"
```

---

## Self-Review Notes

After writing the plan, I scanned for spec coverage, placeholders, and type consistency. Specifically verified:

**Spec coverage:**
- IA (4 tabs + settings stack) → Tasks 1.14, 1.15
- Migration map (every current route) → Tasks 1.13 + Phase 4
- All 12 UI primitives → Tasks 1.2-1.12
- Visual tokens → Task 1.2 + referenced in primitives
- Per-screen specs → Phase 2 (Home, Pay), Phase 3 (Inbox, Settings), Phase 4 (sub-screens)
- Receive modal → Task 5.1
- Polish (haptics, skeletons, empty states, poll-race fix) → Phase 5
- Phase 6 deferral (onboarding) → explicitly noted in spec, no tasks here

**Type consistency:**
- `KeystoreWalletAdapter`, `InboxStatus`, `RouteResult`, `RouterDeps`, `LLMIntent`, `Intent`, `Policy`, `PolicyResult` — all imported from the right modules in every place they appear
- `ButtonProps.variant` values match across all screen tasks
- `Pill.tone` values match across all uses
- `useInbox` return shape (`{ rows, loading, refresh }`) used consistently

**Placeholder scan:** clean — no TBD/TODO/"add appropriate handling" entries.

**Risks worth surfacing again:**
1. Task 1.13's import-depth update is tedious; the grep command catches anything missed.
2. Phase 5's `<Stack>` change to `_layout.tsx` may interact with the existing `MobileWalletProvider`. If MWA-using dev screens (only `signer-test`'s nothing — actually `(tabs)/index.tsx`'s legacy "connect external wallet" button used MWA; we removed that from the new Home, so MWA is fully unused in the UX after this sweep). MobileWalletProvider still wraps for harmlessness.
3. Phase 4 vault screen toggle adds state; the existing screen recomputes on mount only — the toggle handler needs to refetch on switch.

These are noted in the relevant tasks.
