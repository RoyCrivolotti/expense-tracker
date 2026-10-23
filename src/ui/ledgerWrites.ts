import { useCallback, useState } from 'react'
import { applyWrite } from '../data/applyWrite'
import type { LedgerPartsSource } from '../data/dataSource'
import { LedgerSession, type SessionOptions } from '../data/ledgerSession'
import { LedgerUsage, touchesUsage } from '../data/ledgerUsage'
import { rowChangesOf } from '../data/pagerPatch'
import type { TransactionPager } from '../data/transactionPager'
import type { ExpenseData } from './useExpenseData'

/** What is said of a list that could not be read again, when the server did not say why. */
const LIST_FAILED = 'The list could not be read again.'

/**
 * The session, and the counts of what names each record, which are read apart from it and told of the writes that could
 * change them. A write also goes to the list read in pages at once, as what it did to rows, and the list is read again
 * after it (`applyWrite`).
 */
export function sessionWithCounts(source: LedgerPartsSource, pager: TransactionPager, options: SessionOptions | undefined) {
  const counts = new LedgerUsage(source)
  const onWrite: SessionOptions['onWrite'] = (write) => {
    counts.noteWrite(touchesUsage(write))
    pager.patchRows(rowChangesOf(write.before.transactions, write.after.transactions))
  }
  return [new LedgerSession(source, { ...options, onWrite }), counts] as const
}

/**
 * Why the list could not be read again after the last write or refresh that needed it, or null, and the write that says
 * so. A read that worked takes the failure away, and a write that needed no read leaves it as it was.
 */
export function useListFailure(session: LedgerSession, pager: TransactionPager) {
  const [failure, setFailure] = useState<string | null>(null)
  const noteRead = useCallback(
    (worked: boolean | null) => {
      if (worked !== null) setFailure(worked ? null : (pager.getState().error ?? LIST_FAILED))
    },
    [pager],
  )
  const applyPatch = useCallback<ExpenseData['applyPatch']>(
    (patch, reach) => void applyWrite(session, pager, patch, reach).then(noteRead),
    [session, pager, noteRead],
  )
  return { failure, noteRead, applyPatch }
}
