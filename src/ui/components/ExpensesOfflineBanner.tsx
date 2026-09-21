import { EXIT_MS } from '../hooks/motion'
import { OfflineBanner } from './OfflineBanner'
import { PresenceValue } from './Presence'

export function ExpensesOfflineBanner({
  readOnly,
  online,
  snapshotAt,
}: {
  readOnly: boolean
  online: boolean
  snapshotAt?: string
}) {
  // Held while it folds away, so coming back online does not change what it says on the
  // way out.
  const shown = readOnly ? { online, snapshotAt } : null
  return (
    <PresenceValue value={shown} exitMs={EXIT_MS.fold}>
      {(state) => <OfflineBanner online={state.online} {...(state.snapshotAt ? { snapshotAt: state.snapshotAt } : {})} />}
    </PresenceValue>
  )
}
