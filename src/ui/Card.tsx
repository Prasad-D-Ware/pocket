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
