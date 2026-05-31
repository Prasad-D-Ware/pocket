import { Text, View } from 'react-native'

export type PillTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'accent'

export type PillProps = {
  tone?: PillTone
  children: React.ReactNode
}

const TONE = {
  neutral: { bg: 'rgba(255,255,255,0.06)', fg: '#D4D4D8' },
  ok:      { bg: 'rgba(16,185,129,0.15)',  fg: '#6EE7B7' },
  warn:    { bg: 'rgba(245,158,11,0.15)',  fg: '#FCD34D' },
  bad:     { bg: 'rgba(239,68,68,0.15)',   fg: '#FCA5A5' },
  info:    { bg: 'rgba(59,130,246,0.15)',  fg: '#93C5FD' },
  accent:  { bg: 'rgba(139,92,246,0.15)',  fg: '#C4B5FD' },
} as const

export function Pill({ tone = 'neutral', children }: PillProps) {
  const { bg, fg } = TONE[tone]
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{children}</Text>
    </View>
  )
}
