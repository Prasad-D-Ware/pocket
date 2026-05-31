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
          style={{
            marginTop: 16,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: 'rgba(139,92,246,0.15)',
          }}
        >
          <Text className="text-violet-300 text-sm font-semibold">
            {cta.label}
          </Text>
        </Pressable>
      )}
    </View>
  )
}
