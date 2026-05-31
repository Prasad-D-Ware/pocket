import { Link } from 'expo-router'
import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { ListItem } from '../../../../ui/ListItem'

const DEV_SCREENS = [
  { href: '/settings/policy', title: 'Policy editor', subtitle: 'On-chain set_policy' },
  { href: '/settings/vault', title: 'Vault state', subtitle: 'Read-only vault PDA + policy' },
  { href: '/settings/dev/signer', title: 'Keystore signer test', subtitle: 'Generate + sign + tweetnacl verify' },
  { href: '/settings/dev/send', title: 'Send test (devnet)', subtitle: 'Airdrop + SOL transfer signed by Keystore' },
  { href: '/settings/dev/x402', title: 'x402 paid request', subtitle: 'Pay an endpoint with Keystore-signed Solana' },
  { href: '/settings/dev/llm', title: 'LLM test', subtitle: 'SmolLM2-360M raw inference' },
  { href: '/settings/dev/parser', title: 'Intent parser benchmark', subtitle: '20-prompt grammar benchmark' },
]

export default function DevIndex() {
  return (
    <Screen>
      <Header title="Developer" subtitle="Test screens preserved from Days 1-16" />
      <Card padding="sm">
        {DEV_SCREENS.map((s) => (
          <Link key={s.href} href={s.href} asChild>
            {/* onPress is required so ListItem renders Pressable + chevron;
                Link.asChild injects its own onPress that overrides this. */}
            <ListItem title={s.title} subtitle={s.subtitle} onPress={() => {}} />
          </Link>
        ))}
      </Card>
    </Screen>
  )
}
