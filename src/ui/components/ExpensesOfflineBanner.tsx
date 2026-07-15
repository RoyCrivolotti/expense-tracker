import { OfflineBanner } from './OfflineBanner'

export function ExpensesOfflineBanner({
  readOnly,
  online,
  snapshotAt,
}: {
  readOnly: boolean
  online: boolean
  snapshotAt?: string
}) {
  if (!readOnly) return null
  return <OfflineBanner online={online} {...(snapshotAt ? { snapshotAt } : {})} />
}
