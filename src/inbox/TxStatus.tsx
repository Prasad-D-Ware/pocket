import { Pill, type PillTone } from '../ui/Pill'
import type { InboxStatus } from './types'

const TONE: Record<InboxStatus, PillTone> = {
  pending: 'warn',
  signed: 'ok',
  denied: 'bad',
  failed: 'bad',
}

const LABEL: Record<InboxStatus, string> = {
  pending: 'pending',
  signed: 'signed',
  denied: 'denied',
  failed: 'failed',
}

export function TxStatus({ status }: { status: InboxStatus }) {
  return <Pill tone={TONE[status]}>{LABEL[status]}</Pill>
}
