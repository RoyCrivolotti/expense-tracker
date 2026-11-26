import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttachmentCounts } from '../domain/data/ledgerParts'
import type { OccurrenceGroup } from '../domain/engine'
import type { ExpenseDataset, Transaction } from '../types'
import type { ExpenseDataSource } from '../data/dataSource'
import type { DescriptionIndex } from '../data/descriptionIndex'
import type { RecentActivity } from '../data/recentActivity'
import type { WriteReach } from '../data/ledgerSession'
import type { Lookup } from './format'
import type { UsageView } from './definitions/recordUsage'
import type { PagedList } from './transactionListView'
import { buildExpenseModel } from './buildExpenseModel'
import { loaderOf, settlersOf, type LoadRun } from './expenseDataLoad'

/**
 * The recurring series of the whole history. The engines that decide what is fixed spend build their own
 * from the rows they are handed, which is the whole history only while the model holds it (see
 * docs/ENGINE-HISTORY.md), so a model that does not carries them.
 */
export interface FixedHistory {
  groups: OccurrenceGroup[]
}

export interface ExpenseModel {
  /** The reference tables and the real transactions: what is shown to the user as a transaction. */
  dataset: ExpenseDataset
  /**
   * The dataset to give the engines that only add amounts, and the spending groups, which read a 12 month
   * trend of sums beside the rows of the viewed month (the lists are named in docs/ENGINE-HISTORY.md).
   * Absent while `dataset` holds every transaction, when `dataset` is that dataset. Otherwise its
   * transactions also hold one row per summed cell, with an empty description, and it must never be
   * listed or searched. Read it with `sumsOf`.
   */
  sums?: ExpenseDataset
  lookup: Lookup
  descriptionIndex: DescriptionIndex
  /** Budget months present in the data, oldest first. */
  months: string[]
  /** Set when `dataset.transactions` is not the whole history. */
  history?: FixedHistory
  /**
   * Present when `history` is read from the server rather than worked out from the rows: a screen that reads
   * `history` calls it while it is mounted (`useHistoryWatch`), and the model has it once it has been read.
   * Returns the call that says the screen has gone.
   */
  watchHistory?: () => () => void
  /**
   * Present for a ledger read in parts: the counts of what names each category, account, flag and label, which a window
   * must ask the server for (`useRecordUsage` calls it while a Settings screen that shows them is on). Its presence
   * does not change while the model lives.
   */
  useUsage?: (model: ExpenseModel) => UsageView
  /**
   * Set while a model that holds only some of the rows has no `history` yet: the words that say the figures that
   * need it (the split of fixed from flexible spend, the pace) are worked out from the months loaded and are not
   * exact, whether the read is still on its way, failed, or has no one to ask because the browser is offline.
   */
  historyNote?: string
  /**
   * Set when `dataset.attachments` holds only the receipt lists that were asked for: how many receipts each
   * transaction has, for the ones whose list has not been read.
   */
  attachmentCounts?: AttachmentCounts
  /** How many transactions have receipts whose list has not been read. */
  receiptsPending?: number
  /** Reads the receipt lists of these transactions into `dataset.attachments`; present with `attachmentCounts`. */
  ensureReceipts?: (ids: readonly number[]) => void
  /** Set when the Transactions list is read in pages from the server rather than filtered from `dataset`. */
  pagedList?: PagedList
  /**
   * Set when `dataset.transactions` is not every transaction: how many there are, and a read of every one of them from
   * the server, for the file that exports them all. Absent while `dataset` holds them all, and then it is the file.
   */
  exportAll?: { count: number; read: () => Promise<Transaction[]> }
  /**
   * Set when `dataset.transactions` is not every transaction: reads of the Dashboard's recent activity from the server,
   * since the newest rows by date or by when they were saved may be in a month the model does not hold.
   */
  recent?: RecentActivity
  /**
   * Set when the model holds a window and has the server's series: the date of each series' newest charge by series key,
   * which the rows the window does not hold may be the newest of (`stillStopped` takes it as `known`).
   */
  newestCharges?: ReadonlyMap<string, string>
  /**
   * Set when the model holds a window and the browser is offline: the budget months whose rows are saved here. The rest
   * have totals and no rows, so a screen that lists rows says so for them.
   */
  savedMonths?: ReadonlySet<string>
}

export interface LoadState {
  status: 'loading' | 'ready' | 'error'
  model?: ExpenseModel
  error?: string
  fromCache?: boolean
  snapshotAt?: string
}

export type RefreshOutcome = 'ok' | 'fail' | null

export interface ExpenseData extends LoadState {
  refreshing: boolean
  refreshOutcome: RefreshOutcome
  reload: () => void
  /**
   * Shows a write in what is held. `reach` says what it did to rows that may not be held (a ledger held as a
   * window reads those again); a model that holds every row ignores it.
   */
  applyPatch: (
    patch: (dataset: ExpenseDataset) => ExpenseDataset,
    reach?: WriteReach,
  ) => void
  /** Present when the model holds only the months being looked at: tells it which month the screens show. */
  viewMonth?: (month: string) => void
  /** True while the rows of the month shown are being read. */
  hydrating?: boolean
  /**
   * Why a read in the background failed, while what is shown may be out of date because of it: set by a read
   * after a write that moved more than the patch shows, of a month or of a receipt list, and cleared by the next
   * refresh that works. Absent when the data has no such reads.
   */
  backgroundError?: string | null
}

/**
 * The dataset of a source. `owner` is who is signed in: the copy kept for when the network does not answer is
 * theirs alone, so with no owner none is kept or shown.
 */
export function useExpenseData(
  source: ExpenseDataSource,
  owner?: string,
): ExpenseData {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcome>(null)
  const modelRef = useRef<ExpenseModel | undefined>(undefined)
  const refreshStartedAt = useRef(0)
  /** How many mutations have been applied locally. See `isStale` in the effect. */
  const patchCount = useRef(0)

  const reload = useCallback(() => {
    refreshStartedAt.current = Date.now()
    setRefreshing(true)
    setRefreshOutcome(null)
    setVersion((v) => v + 1)
  }, [])

  const applyPatch = useCallback((patch: (dataset: ExpenseDataset) => ExpenseDataset) => {
    // Outside the updater, and unconditional: React only runs a useState updater
    // eagerly when the queue is empty, so a bump inside it may not have happened when
    // this returns. A spurious bump costs at most one discarded refresh.
    patchCount.current += 1
    setState((prev) => {
      if (prev.status !== 'ready' || !prev.model) return prev
      const nextDataset = patch(prev.model.dataset)
      const model = buildExpenseModel(nextDataset)
      modelRef.current = model
      return { status: 'ready', model }
    })
  }, [])

  useEffect(() => {
    let active = true
    // Per load() call, not once at mount — captured once, the app would stop
    // refreshing permanently after the first edit.
    const patchesAtStart = patchCount.current
    /**
     * A mutation landed mid-load, so this response predates it and would revert the
     * user's edit on screen. Check after *every* await before a setState — including
     * the offline snapshot write, which is a real IndexedDB round trip.
     */
    const isStale = () => patchCount.current !== patchesAtStart

    const run: LoadRun = {
      source,
      version,
      owner,
      isActive: () => active,
      isStale,
      refreshStartedAt,
      modelRef,
      setState,
      setRefreshing,
      setRefreshOutcome,
    }
    const load = loaderOf(run, settlersOf(run))

    void load()
    return () => {
      active = false
    }
  }, [source, version, owner])

  return { ...state, refreshing, refreshOutcome, reload, applyPatch }
}
