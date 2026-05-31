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
