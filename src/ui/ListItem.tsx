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
