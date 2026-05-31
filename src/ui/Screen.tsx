import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

export type ScreenProps = {
  scroll?: boolean
  children: React.ReactNode
}

export function Screen({ scroll = true, children }: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-[#0A0A0F]" edges={['top']}>
      <StatusBar style="light" />
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-4 pb-12"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-5 pt-4 pb-12">{children}</View>
      )}
    </SafeAreaView>
  )
}
