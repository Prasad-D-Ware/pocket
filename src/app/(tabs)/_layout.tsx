import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { usePendingCount } from '../../inbox/hooks'

export default function TabsLayout() {
  const { count } = usePendingCount(2000)
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0F',
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#8B5CF6',
        tabBarInactiveTintColor: '#71717A',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pay"
        options={{
          title: 'Pay',
          tabBarIcon: ({ color }) => (
            <Feather name="arrow-up-right" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => (
            <View>
              <Feather name="inbox" size={22} color={color} />
              {count > 0 && (
                <View className="absolute -top-1 -right-2 bg-violet-600 rounded-full min-w-[16px] h-4 px-1 items-center justify-center">
                  <Text className="text-white text-[10px] font-bold">
                    {count > 9 ? '9+' : count}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Feather name="settings" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
