import type { LedgerPartsSource } from '../data/dataSource'
import { exportAllTransactions } from '../data/exportAllTransactions'
import { recentActivityOf } from '../data/recentActivity'
import { newestChargesOfSeries } from '../domain/engine/recurringSeries'
import { type HeldLedger, ledgerOfHeld, receiptsPending } from '../data/ledgerHold'
import type { LedgerSession, SessionState } from '../data/ledgerSession'
import { buildLedgerModel, withHistory } from './buildLedgerModel'
import { BROWSER_LOCALE, olderThan, withOlderDescriptions } from './ledgerDescriptions'
import { HISTORY_WORDS } from './historyWords'
import { ledgerUsageHook } from './ledgerUsage'
import type { PagedList } from './transactionListView'
import type { ExpenseModel } from './useExpenseData'

/** What a windowed model says about having no history: it is being read, the read failed, or there is no one to ask. */
export function historyNoteOf(
  missing: boolean,
  { offline, seriesFailed }: SessionState,
): string | undefined {
  if (!missing) return undefined
  return HISTORY_WORDS[offline ? 'offline' : seriesFailed ? 'failed' : 'loading']
}

interface LedgerModelInput {
  held: HeldLedger | null
  series: SessionState['series']
  /** A window of the ledger, not all of it: the screens are given what the rows held cannot tell them. */
  windowed: boolean
  offline: boolean
  note: string | undefined
  session: LedgerSession
  usage: Parameters<typeof ledgerUsageHook>[0]
  pagedList: PagedList
  source: LedgerPartsSource
}

/** The model the screens are given of what the session holds, or nothing before it holds anything. */
export function ledgerModelOf({
  held,
  series,
  windowed,
  offline,
  note,
  session,
  usage,
  pagedList,
  source,
}: LedgerModelInput): ExpenseModel | undefined {
  if (!held) return undefined
  // A window's older descriptions are the server's, asked for in the browser's locale and merged into its own.
  const older = olderThan(held)
  const descriptions = older
    ? {
        index: { locale: BROWSER_LOCALE },
        wrap: (index: Parameters<typeof withOlderDescriptions>[0]) =>
          withOlderDescriptions(index, source, { before: older.before, locale: BROWSER_LOCALE }),
      }
    : undefined
  const built = buildLedgerModel(ledgerOfHeld(held), {
    attachmentCounts: held.attachmentCounts,
    ...(descriptions ? { descriptions } : {}),
  })
  const withSeries = windowed && series ? withHistory(built, series) : built
  return {
    ...withSeries,
    receiptsPending: receiptsPending(held),
    ensureReceipts: session.loadReceipts,
    watchHistory: session.watchSeries,
    useUsage: ledgerUsageHook(usage, held.revision),
    pagedList,
    ...(windowed
      ? {
          exportAll: { count: held.rowCount, read: () => exportAllTransactions(source) },
          recent: recentActivityOf(source),
        }
      : {}),
    ...(windowed && series ? { newestCharges: newestChargesOfSeries(series) } : {}),
    ...(windowed && offline ? { savedMonths: new Set(held.rows.keys()) } : {}),
    ...(note ? { historyNote: note } : {}),
  }
}
