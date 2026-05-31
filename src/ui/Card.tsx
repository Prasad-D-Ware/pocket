import { View, type ViewStyle } from 'react-native'
import { COLORS, RADIUS } from './tokens'

export type CardProps = {
  variant?: 'default' | 'elevated' | 'accent'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

const VARIANT_STYLE: Record<NonNullable<CardProps['variant']>, ViewStyle> = {
  default: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  elevated: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderStrong },
  accent: { backgroundColor: 'rgba(139,92,246,0.12)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
}

const PAD: Record<NonNullable<CardProps['padding']>, number> = {
  none: 0,
  sm: 12,
  md: 16,
  lg: 20,
}

export function Card({ variant = 'default', padding = 'md', children }: CardProps) {
  return (
    <View style={[VARIANT_STYLE[variant], { padding: PAD[padding], borderRadius: RADIUS.card }]}>
      {children}
    </View>
  )
}
