import { useEffect, useState } from 'react'
import type { ExpenseDataset } from '../../types'
import {
  buildExpenseReport,
  buildSettledReport,
  receiptsOnlyReport,
  type ExpenseReport,
} from '../../domain/engine/expenseReport'
import type { Lookup } from '../format'

/**
 * Names the page while the report is open.
 *
 * The browser names a saved PDF after the page title, which is otherwise the
 * app's own ("Expenses") — the attachment would arrive with no hint of what it is.
 */
export function useDocumentTitle(
  title: string,
  report: ExpenseReport | null,
) {
  const name = report ? `${title} – ${report.from.slice(0, 7)}` : null
  useEffect(() => {
    if (!name) return
    const previous = document.title
    document.title = name
    return () => {
      document.title = previous
    }
  }, [name])
}

/**
 * The report lists receipts, so it waits for the lists of its rows when the model reads them on request: a row
 * whose list is still on its way would otherwise be reported as having none.
 */
export function useReceiptsLoading(
  report: ExpenseReport | null,
  lookup: Lookup,
  ensureReceipts: ((ids: readonly number[]) => void) | undefined,
): boolean {
  const ids = (report ? [...report.lines, ...report.credits] : []).map((line) => line.transaction.id)
  const key = ids.join(',')
  useEffect(() => {
    if (key !== '') ensureReceipts?.(key.split(',').map(Number))
  }, [key, ensureReceipts])
  return ids.some((id) => lookup.attachmentCount(id) > lookup.attachments(id).length)
}

/**
 * The report with the filter applied. Null only when every line left has no receipt: reachable by toggling
 * the filter on a claim that turns out to have none, not by anything a fresh open of the report can produce.
 */
export function shownReport(
  base: ExpenseReport | null,
  receiptsOnly: boolean,
): ExpenseReport | null {
  return base && receiptsOnly ? receiptsOnlyReport(base) : base
}

/** The open claim for a flag, or a past one rebuilt from the payment that settled it. */
export function baseReportOf(
  dataset: ExpenseDataset,
  flagId: number | undefined,
  settledByPaymentId: number | undefined,
): ExpenseReport | null {
  const { transactions, flags, attachments } = dataset
  if (settledByPaymentId != null) return buildSettledReport(settledByPaymentId, transactions, flags, attachments)
  return flagId != null ? buildExpenseReport(flagId, transactions, flags, attachments) : null
}

/** What the claimant types into the report. It lives only for this visit: nothing about a report is stored. */
export interface ReportEdits {
  title: string
  setTitle: (title: string) => void
  purpose: string
  setPurpose: (purpose: string) => void
  showNotes: boolean
  setShowNotes: (showNotes: boolean) => void
}

export function useReportEdits(baseReport: ExpenseReport | null): ReportEdits {
  // Defaults to the flag's name and lives only for this visit: nothing about a
  // report is stored, so there is nowhere to keep an edited title between
  // visits without inventing storage for a document that rebuilds itself fresh
  // every time it is opened.
  const [title, setTitle] = useState(() => baseReport?.flag.name ?? '')
  // Same lifetime as the title. Blank until the claimant writes one, and a blank
  // purpose prints nothing.
  const [purpose, setPurpose] = useState('')
  // Notes are free text the claimant wrote for themselves, so they are on by
  // default (an approver asks what a dinner was for) but can be withheld.
  const [showNotes, setShowNotes] = useState(true)
  return { title, setTitle, purpose, setPurpose, showNotes, setShowNotes }
}

/**
 * Flags the body while the report is open.
 *
 * Guarded on `baseReport`, and called before the early return so the hook order
 * is stable. Setting the flag unconditionally meant an empty report rendered
 * nothing while leaving `<body data-report-open>` set for the rest of the
 * session — and theme.css hides #root under that attribute when printing, so
 * Cmd+P anywhere in the app produced a blank page until reload.
 */
export function useReportOpenFlag(baseReport: ExpenseReport | null) {
  useEffect(() => {
    if (!baseReport) return
    document.body.dataset.reportOpen = 'true'
    return () => {
      delete document.body.dataset.reportOpen
    }
  }, [baseReport])
}
