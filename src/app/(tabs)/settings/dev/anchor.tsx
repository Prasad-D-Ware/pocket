import { Linking, Text } from 'react-native'

import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { ListItem } from '../../../../ui/ListItem'
import { Address } from '../../../../ui/Address'
import { useHaptic } from '../../../../ui/useHaptic'
import { POCKET_VAULT_PROGRAM_ID } from '../../../../anchor/constants'

const EXPLORER = `https://explorer.solana.com/address/${POCKET_VAULT_PROGRAM_ID}?cluster=devnet`

export default function AnchorInfo() {
  const trigger = useHaptic()
  return (
    <Screen>
      <Header title="Anchor program" subtitle="pocket_vault" />
      <Card padding="sm">
        <ListItem
          title="Program ID"
          right={<Address address={POCKET_VAULT_PROGRAM_ID} withCopy={false} />}
        />
        <ListItem
          title="Cluster"
          right={<Text className="text-gray-400 text-sm">devnet</Text>}
        />
        <ListItem
          title="View on Explorer"
          onPress={() => {
            trigger('tap')
            void Linking.openURL(EXPLORER)
          }}
        />
      </Card>
      <Text className="text-xs text-gray-500 mt-4 leading-relaxed">
        pocket_vault is a per-authority PDA + Policy account. Instructions:
        open_vault, deposit, set_policy, withdraw_under_policy. IDL ships in
        src/anchor/idl/pocket_vault.json.
      </Text>
    </Screen>
  )
}
