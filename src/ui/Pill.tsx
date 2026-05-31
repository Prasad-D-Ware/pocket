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
