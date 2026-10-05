import type { TxnType } from '../../types'
import type { StatusFilter } from './TxnFilters'

/**
 * A filter preset another tab hands to Transactions on the way in — the
 * Analytics drill-down's "show me the rows behind this number". Applied once on
 * arrival (replacing the secondary filters), then the list is the user's again;
 * `month` is navigated by the shell before the tab opens. The Goals `goalsEntry`
 * channel is the precedent.
 */
export interface TransactionsEntry {
  categoryId?: number
  labelIds?: number[]
  query?: string
  type?: TxnType
  status?: StatusFilter
  month?: string
}
