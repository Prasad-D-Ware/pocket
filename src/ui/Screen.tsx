import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { COLORS } from './tokens'

export type ScreenProps = {
  scroll?: boolean
  children: React.ReactNode
}

export function Screen({ scroll = true, children }: ScreenProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }} edges={['top']}>
      <StatusBar style="light" />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}>
          {children}
        </View>
      )}
    </SafeAreaView>
  )
}
