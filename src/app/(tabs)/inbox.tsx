import { Screen } from '../../ui/Screen'
import { Header } from '../../ui/Header'
import { Card } from '../../ui/Card'
import { Text } from 'react-native'

export default function Inbox() {
  return (
    <Screen>
      <Header title="Inbox" />
      <Card>
        <Text className="text-gray-400 text-sm">
          Inbox content lands in Phase 3.
        </Text>
      </Card>
    </Screen>
  )
}
