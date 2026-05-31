import { Link } from 'expo-router'
import { Screen } from '../../../ui/Screen'
import { Header } from '../../../ui/Header'
import { Card } from '../../../ui/Card'
import { ListItem } from '../../../ui/ListItem'

export default function SettingsHome() {
  return (
    <Screen>
      <Header title="Settings" />
      <Card padding="sm">
        <Link href="/settings/dev" asChild>
          {/* onPress is required so ListItem renders Pressable + chevron;
              Link.asChild injects its own onPress that overrides this. */}
          <ListItem title="Developer" subtitle="Test screens and tools" onPress={() => {}} />
        </Link>
      </Card>
    </Screen>
  )
}
