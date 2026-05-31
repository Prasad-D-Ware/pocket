import '../global.css'

import { Stack } from 'expo-router'
import { AppIdentity, createSolanaDevnet, MobileWalletProvider } from '@wallet-ui/react-native-kit'

const cluster = createSolanaDevnet()
const identity: AppIdentity = { name: 'Pocket' }

export default function Layout() {
  return (
    <MobileWalletProvider cluster={cluster} identity={identity}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0F' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="receive" options={{ presentation: 'modal' }} />
      </Stack>
    </MobileWalletProvider>
  )
}
