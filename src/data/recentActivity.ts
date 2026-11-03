import { RECENT_ACTIVITY_LIMIT } from '../domain/engine/transactions'
import type { Transaction } from '../domain/types'
import type { LedgerPartsSource } from './dataSource'

/** What the Dashboard's recent activity reads from the server when the browser holds only a window. */
export interface RecentActivity {
  /** The newest rows by date. */
  latest: () => Promise<Transaction[]>
  /** The rows saved last, whatever their date. */
  added: () => Promise<Transaction[]>
}

export function recentActivityOf(source: Pick<LedgerPartsSource, 'readTransactionPage' | 'readRecentTransactions'>): RecentActivity {
  return {
    latest: () => source.readTransactionPage({}, { limit: RECENT_ACTIVITY_LIMIT }).then((page) => page.items),
    added: () => source.readRecentTransactions({ limit: RECENT_ACTIVITY_LIMIT }).then((part) => part.items),
  }
}
