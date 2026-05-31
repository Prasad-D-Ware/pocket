import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Text } from 'react-native'

export default function Home() {
  return (
    <Screen>
      <Header title="Pocket" subtitle="devnet" />
      <Card>
        <Text className="text-gray-400 text-sm">
          Home content lands in Phase 2.
        </Text>
      </Card>
    </Screen>
  )
}
