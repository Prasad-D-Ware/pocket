import { StatusBar } from 'expo-status-bar'
import { Text, View, Pressable, ScrollView } from 'react-native'
import { Link } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { usePendingCount } from '../inbox/hooks'

export default function Home() {
  const { account, connect, disconnect } = useMobileWallet()
  const { count: pending } = usePendingCount(2000)

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerClassName="items-center justify-center px-8 py-16"
    >
      <Text className="text-4xl font-extrabold text-gray-900 dark:text-white mb-2 tracking-tight">
        Pocket
      </Text>
      <Text className="text-base text-gray-600 dark:text-gray-300 mb-10 text-center leading-relaxed">
        Mobile-native Solana wallet for AI agents{'\n'}
        Policy-bound signing · Pay.sh / x402 · devnet
      </Text>

      <Link href="/vault" asChild>
        <Pressable className="bg-blue-600 px-8 py-4 rounded-xl active:bg-blue-700 mb-2">
          <Text className="text-white font-bold text-base">Open Vault</Text>
        </Pressable>
      </Link>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        Reads live state from devnet
      </Text>

      <Link href="/signer-test" asChild>
        <Pressable className="bg-gray-900 dark:bg-gray-100 px-8 py-4 rounded-xl active:opacity-80 mb-2">
          <Text className="text-white dark:text-gray-900 font-bold text-base">
            Keystore signer test
          </Text>
        </Pressable>
      </Link>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        Generate + sign + verify (Android 13+)
      </Text>

      <Link href="/send-test" asChild>
        <Pressable className="bg-emerald-600 px-8 py-4 rounded-xl active:bg-emerald-700 mb-2">
          <Text className="text-white font-bold text-base">
            Send test (devnet)
          </Text>
        </Pressable>
      </Link>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        Airdrop + Keystore-signed SOL transfer
      </Text>

      <Link href="/x402-test" asChild>
        <Pressable className="bg-purple-600 px-8 py-4 rounded-xl active:bg-purple-700 mb-2">
          <Text className="text-white font-bold text-base">
            x402 paid request
          </Text>
        </Pressable>
      </Link>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        Pay an endpoint in fake-USDC, signed by Keystore
      </Text>

      <Link href="/inbox" asChild>
        <Pressable className="bg-amber-600 px-8 py-4 rounded-xl active:bg-amber-700 mb-2 flex-row items-center">
          <Text className="text-white font-bold text-base">
            Agent Inbox
          </Text>
          {pending > 0 && (
            <View className="ml-2 bg-white/20 px-2 py-0.5 rounded-full">
              <Text className="text-white font-bold text-xs">
                {pending} pending
              </Text>
            </View>
          )}
        </Pressable>
      </Link>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        Queue + auto-route via PolicyGuard (sqlite)
      </Text>

      <Link href="/policy-editor" asChild>
        <Pressable className="bg-rose-600 px-8 py-4 rounded-xl active:bg-rose-700 mb-2">
          <Text className="text-white font-bold text-base">
            Policy Editor
          </Text>
        </Pressable>
      </Link>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        Open vault + push on-chain policy (Keystore-signed Anchor)
      </Text>

      <Link href="/llm-test" asChild>
        <Pressable className="bg-indigo-600 px-8 py-4 rounded-xl active:bg-indigo-700 mb-2">
          <Text className="text-white font-bold text-base">
            LLM Test
          </Text>
        </Pressable>
      </Link>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        Download SmolLM2-360M + on-device inference
      </Text>

      <Link href="/parser-test" asChild>
        <Pressable className="bg-violet-600 px-8 py-4 rounded-xl active:bg-violet-700 mb-2">
          <Text className="text-white font-bold text-base">
            Intent Parser
          </Text>
        </Pressable>
      </Link>
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-10">
        Grammar-constrained sentence → Intent + 20-prompt benchmark
      </Text>

      <View className="items-center">
        {account ? (
          <View className="items-center">
            <Text className="text-gray-600 dark:text-gray-400 text-sm mb-2">
              Wallet: {account.address.toString().slice(0, 8)}…
            </Text>
            <Pressable
              onPress={disconnect}
              className="bg-red-500 px-5 py-2.5 rounded-xl active:bg-red-600"
            >
              <Text className="text-white font-semibold text-sm">
                Disconnect Wallet
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={connect}
            className="bg-gray-200 dark:bg-gray-800 px-5 py-2.5 rounded-xl active:bg-gray-300 dark:active:bg-gray-700"
          >
            <Text className="text-gray-800 dark:text-gray-200 font-semibold text-sm">
              Connect external wallet (legacy)
            </Text>
          </Pressable>
        )}
      </View>

      <StatusBar style="auto" />
    </ScrollView>
  )
}
