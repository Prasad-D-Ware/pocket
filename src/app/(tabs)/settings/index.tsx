import { useEffect, useState } from 'react'
import { Linking, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'

import { Screen } from '../../../ui/Screen'
import { Header } from '../../../ui/Header'
import { Card } from '../../../ui/Card'
import { ListItem } from '../../../ui/ListItem'
import { Pill } from '../../../ui/Pill'
import { Address } from '../../../ui/Address'
import {
  createKeystoreWalletAdapter,
  type KeystoreWalletAdapter,
} from '../../../x402/keystoreWalletAdapter'
import { DEVNET_RPC, POCKET_VAULT_PROGRAM_ID } from '../../../anchor/constants'
import {
  createReadOnlyClient,
  deriveVaultPda,
  fetchPolicy,
  fetchVault,
  type PolicyAccount,
  type VaultAccount,
} from '../../../anchor/client'
import { getModelStatus } from '../../../llm/model'

export default function SettingsHome() {
  const router = useRouter()
  const [adapter, setAdapter] = useState<KeystoreWalletAdapter | null>(null)
  const [vaultOpen, setVaultOpen] = useState<boolean | null>(null)
  const [policySummary, setPolicySummary] = useState<string | null>(null)
  const [modelReady, setModelReady] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const a = await createKeystoreWalletAdapter()
        if (cancelled) return
        setAdapter(a)
        const ro = createReadOnlyClient(DEVNET_RPC)
        const v = await fetchVault(ro, a.publicKey)
        if (cancelled) return
        setVaultOpen(!!v)
        if (v) {
          const p = await fetchPolicy(ro, v.vault)
          if (cancelled) return
          if (p) {
            const maxTx = Number(p.data.maxPerTxBaseUnits) / 1_000_000
            setPolicySummary(`${maxTx} USDC / tx`)
          } else {
            setPolicySummary('Not set')
          }
        }
        const ms = await getModelStatus()
        if (cancelled) return
        setModelReady(ms.state === 'ready')
      } catch {
        /* leave nulls */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen>
      <Header title="Settings" />

      <Section title="Account">
        <Card padding="sm">
          <ListItem
            title="Address"
            right={
              adapter ? <Address address={adapter.address} withCopy={false} /> : null
            }
          />
          <ListItem
            title="Network"
            right={<Pill tone="info">devnet</Pill>}
          />
          <ListItem title="Backup" right={<Pill tone="neutral">Not set</Pill>} disabled />
        </Card>
      </Section>

      <Section title="Pocket Vault">
        <Card padding="sm">
          <ListItem
            title="Vault status"
            right={
              <Pill tone={vaultOpen ? 'ok' : 'warn'}>
                {vaultOpen === null ? '…' : vaultOpen ? 'Opened' : 'Not opened'}
              </Pill>
            }
            onPress={() => router.push('/settings/vault')}
          />
          <ListItem
            title="On-chain policy"
            right={
              <Text className="text-gray-400 text-sm">
                {policySummary ?? '…'}
              </Text>
            }
            onPress={() => router.push('/settings/policy')}
          />
        </Card>
      </Section>

      <Section title="Agent">
        <Card padding="sm">
          <ListItem
            title="Local intent parser"
            subtitle="SmolLM2-360M on-device"
            right={
              <Pill tone={modelReady ? 'ok' : 'warn'}>
                {modelReady === null ? '…' : modelReady ? 'Ready' : 'Not downloaded'}
              </Pill>
            }
            onPress={() => router.push('/settings/dev/llm')}
          />
          <ListItem
            title="Policy engine"
            subtitle="PolicyGuard"
            right={<Pill tone="info">Local</Pill>}
            onPress={() => router.push('/settings/policy')}
          />
        </Card>
      </Section>

      <Section title="Developer">
        <Card padding="sm">
          {DEV_LINKS.map((d) => (
            <ListItem
              key={d.href}
              title={d.title}
              subtitle={d.subtitle}
              onPress={() => router.push(d.href as never)}
            />
          ))}
        </Card>
      </Section>

      <Section title="About">
        <Card padding="sm">
          <ListItem title="Version" right={<Text className="text-gray-400 text-sm">0.1.0</Text>} />
          <ListItem
            title="Program ID"
            right={<Address address={POCKET_VAULT_PROGRAM_ID} withCopy={false} />}
          />
          <ListItem
            title="License"
            right={<Text className="text-gray-400 text-sm">MIT</Text>}
          />
        </Card>
      </Section>
    </Screen>
  )
}

const DEV_LINKS = [
  { href: '/settings/dev/signer', title: 'Keystore signer test', subtitle: 'Generate + sign + verify' },
  { href: '/settings/dev/send', title: 'Send test (devnet)', subtitle: 'Airdrop + SOL transfer' },
  { href: '/settings/dev/x402', title: 'x402 paid request', subtitle: 'Direct pay endpoint test' },
  { href: '/settings/dev/llm', title: 'LLM test', subtitle: 'Raw model inference' },
  { href: '/settings/dev/parser', title: 'Intent parser benchmark', subtitle: '20-prompt benchmark' },
  { href: '/settings/dev/simulators', title: 'Canned inbox simulators', subtitle: '5 scripted agent intents' },
  { href: '/settings/dev/anchor', title: 'Anchor program info', subtitle: 'Program ID + IDL + explorer' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="text-xs uppercase tracking-wider text-gray-400 mb-2 font-semibold">
        {title}
      </Text>
      {children}
    </View>
  )
}
