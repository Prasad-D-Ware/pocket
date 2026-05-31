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
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
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
