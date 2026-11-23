import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import { parseMoneyToCents, type MoneyFormat } from '../../engine/money'
import { isWithdrawal } from './transactionTypes'
import { revokeStaged, type PendingReceipt } from '../../data/pendingReceipts'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { FormFields } from './transactionFormState'
import { buildInstallmentIntent, type InstallmentDraft, type InstallmentIntent } from './installmentIntent'

export function toInput(
  form: FormFields,
  cents: number,
  editing: Transaction | null,
): NewTransaction {
  return {
    date: form.date,
    budgetMonth: form.budgetMonth,
    description: form.description,
    accountId: form.accountId,
    categoryId: form.categoryId,
    type: form.type,
    // Money out of the portfolio is stored as a negative investment.
    amountCents: form.type === 'investment' && form.outflow ? -cents : cents,
    cancelled: editing?.cancelled ?? false,
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    // Always sent, including as null — on edit that is how the flag is cleared,
    // and an absent key would leave the old one in place.
    flagId: form.flagId,
  }
}

export function initialDraft(
  editing: Transaction | null,
  model: ExpenseModel,
  seed?: TransactionSeed,
): InstallmentDraft {
  if (!editing && seed?.planId != null) {
    const plan = model.lookup.installmentPlan(seed.planId)
    return {
      mode: 'existing',
      planId: seed.planId,
      totalCount: plan ? String(plan.totalCount) : '',
      installmentIndex: seed.installmentIndex != null ? String(seed.installmentIndex) : '',
    }
  }
  return { mode: 'none', totalCount: '', installmentIndex: '', planId: null, splitTotal: false }
}

/**
 * A retry is neither an add nor an edit — the row landed on the first press and
 * this one finished its receipts, so "Transaction added" would be a second,
 * confusing claim about a row already in the list.
 */
export function savedOrEditing(
  editing: Transaction | null,
  savedId: number | null,
): string {
  if (savedId != null) return 'Receipts uploaded'
  return editing ? 'Transaction updated' : 'Transaction added'
}

export function uploadFailureMessage(
  count: number,
  reason: string | null,
): string {
  const noun = count === 1 ? 'receipt' : 'receipts'
  const why = reason ? ` ${reason.replace(/\.$/, '')}.` : ''
  return `The transaction was saved, but ${count} ${noun} could not be uploaded.${why} Try again, or remove them and attach later.`
}

/** A fresh transaction, and one nobody has labelled yet, both start from none. */
export function initialLabelIds(editing: Transaction | null): number[] {
  return editing?.labelIds ?? []
}

/**
 * Labels are not part of NewTransaction — they go through their own PUT
 * endpoint (see setTransactionLabels), which is a replace-whole-set call, not
 * a column patch. Comparing against what the transaction already had avoids
 * firing it on every save of a transaction nobody has ever labelled.
 */
function labelsChanged(
  next: number[],
  previous: number[] | undefined,
): boolean {
  const prev = previous ?? []
  if (next.length !== prev.length) return true
  const prevSet = new Set(prev)
  return next.some((id) => !prevSet.has(id))
}

/**
 * Save the label set if it changed, returning an error message rather than
 * throwing: the transaction itself is already saved by the time this runs, so
 * a labels failure has to be reported without submit's own catch treating it
 * as "could not save" the transaction. `onSaved` fires only once the PUT has
 * actually landed — a rejection leaves the caller's known-good set alone,
 * since the server never moved off it.
 */
export async function saveLabelsIfChanged(
  actions: ExpenseActions | undefined,
  transactionId: number | null,
  next: number[],
  previous: number[] | undefined,
  onSaved: (saved: number[]) => void,
): Promise<string | null> {
  if (transactionId == null || !actions || !labelsChanged(next, previous)) return null
  try {
    await actions.setTransactionLabels(transactionId, next)
    onSaved(next)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not update labels'
  }
}

/**
 * Upload the staged receipts against a now-existing row, one at a time — the
 * server checks the per-transaction cap and the storage quota per request, so
 * parallel uploads would race past both. Returns the files that did not make
 * it, so they stay staged for a retry rather than vanishing.
 */
export async function flushPending(
  actions: ExpenseActions | undefined,
  setUploading: (progress: { done: number; total: number } | null) => void,
  id: number,
  staged: PendingReceipt[],
): Promise<{ failed: PendingReceipt[]; reason: string | null }> {
  if (!actions || staged.length === 0) return { failed: [], reason: null }
  const failed: PendingReceipt[] = []
  let reason: string | null = null
  for (const [index, item] of staged.entries()) {
    setUploading({ done: index, total: staged.length })
    try {
      await actions.uploadAttachment(id, item.file)
      // Uploaded: its blob is no longer previewing anything.
      revokeStaged([item])
    } catch (e) {
      failed.push(item)
      // Keep the first reason. "Receipt storage is full" and a dropped
      // connection are the same sentence without it, and only one is worth
      // pressing Retry for.
      reason ??= e instanceof Error ? e.message : null
    }
  }
  setUploading(null)
  return { failed, reason }
}

/** Validate, or surface the first problem and say which view owns it. */
export function validateForm(
  form: FormFields,
  draft: InstallmentDraft,
  format: MoneyFormat,
  setErr: (message: string) => void,
  onViewChange: (view: 'fields' | 'installment') => void,
): { cents: number; intent: InstallmentIntent | undefined } | null {
  const cents = Math.abs(parseMoneyToCents(form.amount, format))
  if (cents <= 0) {
    setErr('Enter an amount greater than zero')
    return null
  }
  const intent = buildInstallmentIntent(draft)
  if (!intent.ok) {
    setErr(intent.error)
    onViewChange('installment')
    return null
  }
  // The chip is hidden for a withdrawal, but a plan set up before the switch is still here.
  if (isWithdrawal(form) && (intent.intent.kind === 'new' || intent.intent.kind === 'link')) {
    setErr('A withdrawal cannot be split into installments; remove the plan first')
    onViewChange('installment')
    return null
  }
  return { cents, intent: intent.intent }
}
