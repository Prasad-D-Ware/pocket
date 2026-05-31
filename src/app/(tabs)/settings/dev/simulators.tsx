import { useState } from 'react'
import { Text, View } from 'react-native'

import { Screen } from '../../../../ui/Screen'
import { Header } from '../../../../ui/Header'
import { Card } from '../../../../ui/Card'
import { Button } from '../../../../ui/Button'
import { Pill, type PillTone } from '../../../../ui/Pill'
import { useHaptic } from '../../../../ui/useHaptic'

import { openInbox } from '../../../../inbox/db'
import {
  SCENARIOS,
  defaultPolicy,
  evaluateAndEnqueue,
} from '../../../../inbox/simulator'

type Decision = {
  scenario: string
  action: 'allow' | 'queue' | 'deny'
  reason?: string
}

export default function SimulatorsScreen() {
  const trigger = useHaptic()
  const [busy, setBusy] = useState<string | null>(null)
  const [lastDecision, setLastDecision] = useState<Decision | null>(null)

  function onSimulate(key: string) {
    const scenario = SCENARIOS.find((s) => s.key === key)
    if (!scenario) return
    trigger('tap')
    setBusy(key)
    try {
      const runner = openInbox()
      const result = evaluateAndEnqueue(
        runner,
        scenario.build(),
        defaultPolicy(),
      )
      if (result.action === 'allow') trigger('success')
      else if (result.action === 'deny') trigger('error')
      else trigger('warning')
      setLastDecision({
        scenario: scenario.label,
        action: result.action,
        reason: result.reason,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen>
      <Header
        title="Inbox simulators"
        subtitle="Pre-baked Intents that bypass the LLM. Useful for testing PolicyGuard branches deterministically."
      />
      <View className="gap-2">
        {SCENARIOS.map((s) => (
          <Card key={s.key} padding="sm">
            <View className="flex-row items-center justify-between mb-2">
              <Text
                className="text-white text-sm font-semibold flex-1 pr-2"
                numberOfLines={2}
              >
                {s.label}
              </Text>
              <Pill tone={expectedTone(s.key)}>{expectedLabel(s.key)}</Pill>
            </View>
            <Button
              variant="secondary"
              onPress={() => onSimulate(s.key)}
              loading={busy === s.key}
              disabled={busy !== null}
              haptic={false}
            >
              {busy === s.key ? 'running…' : 'Run'}
            </Button>
          </Card>
        ))}
      </View>

      {lastDecision && (
        <View className="mt-4">
          <Card variant="accent" padding="md">
            <Text className="text-violet-200 text-xs uppercase tracking-wider mb-1 font-semibold">
              Last decision
            </Text>
            <Text className="text-white text-sm mb-1">
              {lastDecision.scenario}
            </Text>
            <Text className="text-violet-200 text-xs">
              → {lastDecision.action.toUpperCase()}
              {lastDecision.reason ? ` (${lastDecision.reason})` : ''}
            </Text>
          </Card>
        </View>
      )}
    </Screen>
  )
}

// Map a scenario key to its expected outcome — visible in the row so
// the tester knows what should happen before they tap Run.
function expectedTone(key: string): PillTone {
  if (key.endsWith('-allow')) return 'ok'
  if (key.endsWith('-queue')) return 'warn'
  if (key.endsWith('-deny')) return 'bad'
  return 'neutral'
}

function expectedLabel(key: string): string {
  if (key.endsWith('-allow')) return 'allow'
  if (key.endsWith('-queue')) return 'queue'
  if (key.endsWith('-deny')) return 'deny'
  return '—'
}
