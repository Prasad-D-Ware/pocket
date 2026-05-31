import { Pressable, Text, View } from 'react-native'

export type HeaderProps = {
  title: string
  subtitle?: string
  right?: React.ReactNode
  onRightPress?: () => void
  rightAccessibilityLabel?: string
}

export function Header({
  title,
  subtitle,
  right,
  onRightPress,
  rightAccessibilityLabel,
}: HeaderProps) {
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
      {right && (onRightPress ? (
        <Pressable
          onPress={onRightPress}
          accessibilityRole="button"
          accessibilityLabel={rightAccessibilityLabel}
          className="w-10 h-10 rounded-full bg-white/5 items-center justify-center active:bg-white/10"
        >
          {right}
        </Pressable>
      ) : (
        <View className="w-10 h-10 rounded-full bg-white/5 items-center justify-center">
          {right}
        </View>
      ))}
    </View>
  )
}
