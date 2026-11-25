import { useState } from 'react'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import { applyDescriptionSuggestion } from '../../data/applyDescriptionSuggestion'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { addDaysIso } from '../../engine/dates'
import type { TxnType } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { BatchRowDraft, DateBatchDraft } from './batchTransactionIntent'
import { todayIso } from './transactionFormState'

const defaultCategoryId = (model: ExpenseModel) =>
  model.dataset.categories.find((c) => c.active)?.id ?? model.dataset.categories[0]?.id ?? 0
const defaultAccountId = (model: ExpenseModel) =>
  resolveDefaultAccountId(model.dataset.accounts, model.dataset.settings)

const makeRow = (
  categoryId: number,
  accountId: number,
  type: TxnType = 'expense',
): BatchRowDraft => ({
  id: crypto.randomUUID(),
  type,
  amount: '',
  description: '',
  categoryId,
  accountId,
})
const makeBatch = (
  date: string,
  seedRow: BatchRowDraft,
): DateBatchDraft => ({
  id: crypto.randomUUID(),
  date,
  rows: [seedRow],
})

/** A new row that starts from the one above it: same category, account and type. */
const rowLike = (
  model: ExpenseModel,
  last: BatchRowDraft | undefined,
) =>
  makeRow(
    last?.categoryId ?? defaultCategoryId(model),
    last?.accountId ?? defaultAccountId(model),
    last?.type ?? 'expense',
  )

const withRowAdded = (
  bs: DateBatchDraft[],
  batchId: string,
  model: ExpenseModel,
) =>
  bs.map((b) => {
    if (b.id !== batchId) return b
    return { ...b, rows: [...b.rows, rowLike(model, b.rows[b.rows.length - 1])] }
  })

const withBatchAdded = (
  bs: DateBatchDraft[],
  model: ExpenseModel,
) => {
  const earliest = bs.reduce((min, b) => (b.date < min ? b.date : min), bs[0]?.date ?? todayIso())
  const lastBatchRows = bs[bs.length - 1]?.rows ?? []
  const seedRow = rowLike(model, lastBatchRows[lastBatchRows.length - 1])
  return [...bs, makeBatch(addDaysIso(earliest, -1), seedRow)]
}

const withSuggestion = (
  bs: DateBatchDraft[],
  batchId: string,
  rowId: string,
  suggestion: DescriptionSuggestion,
  model: ExpenseModel,
) =>
  bs.map((b) => {
    if (b.id !== batchId) return b
    return {
      ...b,
      rows: b.rows.map((r) => {
        if (r.id !== rowId) return r
        const patch = applyDescriptionSuggestion(suggestion, model.dataset, {
          categoryId: r.categoryId,
          accountId: r.accountId,
        })
        return { ...r, ...patch }
      }),
    }
  })

export function useBatchDrafts(model: ExpenseModel) {
  const [batches, setBatches] = useState<DateBatchDraft[]>(() => [
    makeBatch(todayIso(), makeRow(defaultCategoryId(model), defaultAccountId(model))),
  ])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateBatch = (
    batchId: string,
    patch: Partial<DateBatchDraft>,
  ) => setBatches((bs) => bs.map((b) => (b.id === batchId ? { ...b, ...patch } : b)))

  const updateRow = (
    batchId: string,
    rowId: string,
    patch: Partial<BatchRowDraft>,
  ) => {
    setBatches((bs) =>
      bs.map((b) =>
        b.id !== batchId ? b : { ...b, rows: b.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) },
      ),
    )
    setErrors((e) => {
      if (!(rowId in e)) return e
      const next = { ...e }
      delete next[rowId]
      return next
    })
  }

  const addRow = (batchId: string) => setBatches((bs) => withRowAdded(bs, batchId, model))

  const removeRow = (
    batchId: string,
    rowId: string,
  ) => setBatches((bs) => bs.map((b) => (b.id !== batchId ? b : { ...b, rows: b.rows.filter((r) => r.id !== rowId) })))

  const addBatch = () => setBatches((bs) => withBatchAdded(bs, model))

  const removeBatch = (batchId: string) => setBatches((bs) => (bs.length > 1 ? bs.filter((b) => b.id !== batchId) : bs))

  const onAcceptSuggestion = (
    batchId: string,
    rowId: string,
    suggestion: DescriptionSuggestion,
  ) => setBatches((bs) => withSuggestion(bs, batchId, rowId, suggestion, model))

  return {
    batches,
    errors,
    setErrors,
    updateBatch,
    updateRow,
    addRow,
    removeRow,
    addBatch,
    removeBatch,
    onAcceptSuggestion,
  }
}
