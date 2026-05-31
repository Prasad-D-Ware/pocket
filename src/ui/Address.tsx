import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { useHaptic } from './useHaptic'

export type AddressProps = {
  address: string
  truncate?: boolean // default true
  withCopy?: boolean // default true
  mono?: boolean // default true
}

export function Address({
  address,
  truncate = true,
  withCopy = true,
  mono = true,
}: AddressProps) {
  const trigger = useHaptic()
  const display = truncate ? short(address) : address

  async function handleCopy() {
    trigger('tap')
    try {
      await Clipboard.setStringAsync(address)
    } catch {
      // silent — most copy failures are simulator-only
    }
  }

  return (
    <View className="flex-row items-center gap-2">
      <Text
        selectable
        className={`${mono ? 'font-mono' : ''} text-white text-sm`}
      >
        {display}
      </Text>
      {withCopy && (
        <Pressable onPress={() => void handleCopy()} className="active:opacity-60">
          <Feather name="copy" size={14} color="#A1A1AA" />
        </Pressable>
      )}
    </View>
  )
}

function short(s: string): string {
  if (s.length <= 12) return s
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}
