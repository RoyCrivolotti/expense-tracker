import { useEffect, useState } from 'react'
import { currentLedgerMode } from '../../config/ledgerMode'
import type { ExpenseDataSource } from '../../data/dataSource'
import { AppLoadingSkeleton } from '../components/AppLoadingSkeleton'
import { AccessConnectionError } from './AccessConnectionError'
import { AllowedAccessView } from './AccessGateViews'
import { classifyAccessError } from './accessErrorKind'

/**
 * What a person with a saved copy may open when the server cannot say: Expenses, and no link to another app, whose
 * own gate would refuse it.
 */
const OFFLINE_GROUPS = { expenses: true, finance: false, legacy: false, oncall: false }

interface Props {
  message: string
  /** The server replied (with a refusal or an error), so this is not a network that failed. */
  answered: boolean
  source: ExpenseDataSource
  onRetry: () => void
}

/**
 * The access check failed. When the network did not answer and this device holds a saved copy, the app opens on it
 * for the person it names, read-only (the data hook shows the copy and the offline banner says so); otherwise the
 * screen that says what went wrong. The server cannot confirm who is holding the phone, so this trusts the device.
 */
export function AccessFailure({ message, answered, source, onRetry }: Props) {
  const unreachable = !answered && classifyAccessError(message) === 'connection'
  const [owner, setOwner] = useState<string | null | undefined>(unreachable ? undefined : null)

  useEffect(() => {
    if (!unreachable) return
    let active = true
    void import('../../data/savedCopy')
      .then((copy) => copy.savedCopyOwner(currentLedgerMode() !== 'off'))
      .catch(() => null)
      .then((found) => {
        if (active) setOwner(found)
      })
    return () => {
      active = false
    }
  }, [unreachable])

  if (owner === undefined) return <AppLoadingSkeleton label="Checking access" />
  if (owner) return <AllowedAccessView access={{ status: 'allowed', email: owner, groups: OFFLINE_GROUPS }} source={source} />
  return <AccessConnectionError error={message} onRetry={onRetry} />
}
