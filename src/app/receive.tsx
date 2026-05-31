import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'

import { Screen } from '../ui/Screen'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import {
  createKeystoreWalletAdapter,
  type KeystoreWalletAdapter,
} from '../x402/keystoreWalletAdapter'

export default function Receive() {
  const router = useRouter()
  const [adapter, setAdapter] = useState<KeystoreWalletAdapter | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const a = await createKeystoreWalletAdapter()
      if (!cancelled) setAdapter(a)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen>
      <View className="flex-row items-center justify-between mb-6">
        <Text className="text-3xl font-extrabold text-white">Receive</Text>
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.06)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="x" size={18} color="#FAFAFA" />
        </Pressable>
      </View>

      <Card padding="lg">
        <View className="items-center py-4">
          {adapter ? (
            <QRCode
              value={adapter.address}
              size={220}
              color="#FAFAFA"
              backgroundColor="#14141C"
            />
          ) : (
            <Skeleton width={220} height={220} radius={12} />
          )}
        </View>
        <Text className="text-xs uppercase tracking-wider text-gray-400 mb-1 mt-3 font-semibold text-center">
          your address
        </Text>
        {adapter ? (
          <Text
            selectable
            className="text-white text-xs font-mono text-center"
          >
            {adapter.address}
          </Text>
        ) : (
          <Skeleton height={14} />
        )}
      </Card>

      {adapter && (
        <Card variant="accent" padding="md">
          <Text className="text-violet-200 text-xs font-semibold mb-2">
            Fund this address from your Mac
          </Text>
          <Text className="text-violet-300/80 text-xs font-mono leading-relaxed">
            cd pocket/tools/x402-server{'\n'}
            npm run mint-to -- {adapter.address}
          </Text>
        </Card>
      )}
    </Screen>
  )
}
