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
