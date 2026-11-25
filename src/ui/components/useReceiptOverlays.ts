import { useState } from 'react'
import type { TransactionAttachment } from '../../types'

/** Which receipt is open in the viewer or up for removal, and the focus trap told when either changes. */
export function useReceiptOverlays(onTrapPausedChange: ((paused: boolean) => void) | undefined) {
  const [viewing, setViewing] = useState<TransactionAttachment | null>(null)
  const [removing, setRemoving] = useState<TransactionAttachment | null>(null)

  const setOverlay = (
    next: TransactionAttachment | null,
    kind: 'view' | 'remove',
  ) => {
    if (kind === 'view') setViewing(next)
    else setRemoving(next)
    onTrapPausedChange?.(next !== null)
  }
  return { viewing, removing, setOverlay }
}
