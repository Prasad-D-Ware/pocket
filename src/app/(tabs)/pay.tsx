import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Text } from 'react-native'

export default function Pay() {
  return (
    <Screen>
      <Header title="Pay" />
      <Card>
        <Text className="text-gray-400 text-sm">
          Talk to Pocket lands in Phase 2.
        </Text>
      </Card>
    </Screen>
  )
}
