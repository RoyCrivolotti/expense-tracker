import { useRef, useState } from 'react'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import { applyDescriptionSuggestion } from '../../data/applyDescriptionSuggestion'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { parseMoneyToCents } from '../../engine/money'
import { CloseIcon, PlusIcon } from '../icons'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useToast } from '../hooks/useToast'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { buildBatchTransactions, type BatchRowDraft, type DateBatchDraft } from './batchTransactionIntent'
import { DescriptionCombobox } from './DescriptionCombobox'
import { Money } from './Money'
import { optionLabel, selectableOptions } from './pickerOptions'
import { Field, TypeSelector } from './TransactionFields'
import formStyles from './TransactionForm.module.css'
import styles from './BatchTransactionForm.module.css'

interface BatchTransactionFormProps {
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/** The calendar day before `iso`, e.g. 2026-03-01 -> 2026-02-28. */
function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - 1)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function isRowEmpty(row: BatchRowDraft): boolean {
  return row.description.trim() === '' && row.amount.trim() === ''
}

export function BatchTransactionForm({ model, actions, onClose }: BatchTransactionFormProps) {
  const format = useMoneyFormat()
  const { showToast } = useToast()
  const nextId = useRef(0)
  const genId = (prefix: string) => `${prefix}-${++nextId.current}`

  const defaultCategoryId = () =>
    model.dataset.categories.find((c) => c.active)?.id ?? model.dataset.categories[0]?.id ?? 0
  const defaultAccountId = () => resolveDefaultAccountId(model.dataset.accounts, model.dataset.settings)

  const makeRow = (categoryId: number): BatchRowDraft => ({
    id: genId('row'),
    type: 'expense',
    amount: '',
    description: '',
    categoryId,
  })
  const makeBatch = (date: string, accountId: number): DateBatchDraft => ({
    id: genId('batch'),
    date,
    accountId,
    rows: [makeRow(defaultCategoryId())],
  })

  // Fixed ids for the initial render: `genId` reads a ref, which lazy useState
  // initializers must not touch during render (only in effects/handlers).
  const [batches, setBatches] = useState<DateBatchDraft[]>(() => [
    {
      id: 'batch-0',
      date: todayIso(),
      accountId: defaultAccountId(),
      rows: [{ id: 'row-0', type: 'expense', amount: '', description: '', categoryId: defaultCategoryId() }],
    },
  ])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const updateBatch = (batchId: string, patch: Partial<DateBatchDraft>) =>
    setBatches((bs) => bs.map((b) => (b.id === batchId ? { ...b, ...patch } : b)))

  const updateRow = (batchId: string, rowId: string, patch: Partial<BatchRowDraft>) =>
    setBatches((bs) =>
      bs.map((b) =>
        b.id !== batchId
          ? b
          : { ...b, rows: b.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) },
      ),
    )

  const addRow = (batchId: string) =>
    setBatches((bs) =>
      bs.map((b) => {
        if (b.id !== batchId) return b
        const lastCategory = b.rows[b.rows.length - 1]?.categoryId ?? defaultCategoryId()
        return { ...b, rows: [...b.rows, makeRow(lastCategory)] }
      }),
    )

  const removeRow = (batchId: string, rowId: string) =>
    setBatches((bs) =>
      bs.map((b) => (b.id !== batchId ? b : { ...b, rows: b.rows.filter((r) => r.id !== rowId) })),
    )

  const addBatch = () =>
    setBatches((bs) => {
      const earliest = bs.reduce((min, b) => (b.date < min ? b.date : min), bs[0]?.date ?? todayIso())
      const accountId = bs[bs.length - 1]?.accountId ?? defaultAccountId()
      return [...bs, makeBatch(dayBefore(earliest), accountId)]
    })

  const removeBatch = (batchId: string) =>
    setBatches((bs) => (bs.length > 1 ? bs.filter((b) => b.id !== batchId) : bs))

  const onAcceptSuggestion = (batchId: string, rowId: string, suggestion: DescriptionSuggestion) =>
    setBatches((bs) =>
      bs.map((b) => {
        if (b.id !== batchId) return b
        return {
          ...b,
          rows: b.rows.map((r) => {
            if (r.id !== rowId) return r
            const patch = applyDescriptionSuggestion(suggestion, model.dataset, {
              categoryId: r.categoryId,
              accountId: b.accountId,
            })
            return { ...r, description: patch.description, categoryId: patch.categoryId, type: patch.type }
          }),
        }
      }),
    )

  const nonEmptyRows = batches.flatMap((b) => b.rows.filter((r) => !isRowEmpty(r)))
  const totalCents = nonEmptyRows.reduce((sum, r) => sum + Math.abs(parseMoneyToCents(r.amount, format)), 0)
  const count = nonEmptyRows.length

  const save = async () => {
    const result = buildBatchTransactions(batches, format, model.dataset.settings.budgetRolloverDay)
    if (!result.ok) {
      setErrors(result.errors)
      if (Object.keys(result.errors).length === 0) {
        showToast('Add at least one transaction', 'error')
      }
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await actions.createTransactions(result.transactions)
      showToast(`Added ${result.transactions.length} transaction${result.transactions.length === 1 ? '' : 's'}`, 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.root}>
      {batches.map((batch) => (
        <div key={batch.id} className={styles.batch}>
          <div className={styles.batchHeader}>
            <Field label="Date">
              <input
                type="date"
                value={batch.date}
                onChange={(e) => updateBatch(batch.id, { date: e.target.value })}
                required
              />
            </Field>
            <Field label="Account">
              <select
                value={batch.accountId}
                onChange={(e) => updateBatch(batch.id, { accountId: Number(e.target.value) })}
              >
                {selectableOptions(model.dataset.accounts, batch.accountId).map((a) => (
                  <option key={a.id} value={a.id}>
                    {optionLabel(a)}
                  </option>
                ))}
              </select>
            </Field>
            {batches.length > 1 && (
              <button
                type="button"
                className={styles.removeBatch}
                aria-label="Remove this date"
                onClick={() => removeBatch(batch.id)}
              >
                <CloseIcon />
              </button>
            )}
          </div>

          {batch.rows.map((row) => (
            <div key={row.id} className={styles.row}>
              <TypeSelector value={row.type} onChange={(t) => updateRow(batch.id, row.id, { type: t })} />
              <div className={styles.rowFields}>
                <input
                  className={styles.rowAmount}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={`0${format.decimalSeparator}00`}
                  value={row.amount}
                  onChange={(e) => updateRow(batch.id, row.id, { amount: e.target.value })}
                />
                <DescriptionCombobox
                  value={row.description}
                  index={model.descriptionIndex}
                  placeholder="e.g. Mercadona"
                  onChange={(v) => updateRow(batch.id, row.id, { description: v })}
                  onAccept={(s) => onAcceptSuggestion(batch.id, row.id, s)}
                />
                <select
                  value={row.categoryId}
                  onChange={(e) => updateRow(batch.id, row.id, { categoryId: Number(e.target.value) })}
                >
                  {selectableOptions(model.dataset.categories, row.categoryId).map((c) => (
                    <option key={c.id} value={c.id}>
                      {optionLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className={styles.removeRow}
                aria-label="Remove this transaction"
                onClick={() => removeRow(batch.id, row.id)}
              >
                <CloseIcon />
              </button>
              {errors[row.id] && <p className={formStyles.error}>{errors[row.id]}</p>}
            </div>
          ))}

          <button type="button" className={styles.addRow} onClick={() => addRow(batch.id)}>
            <PlusIcon /> Add transaction
          </button>
        </div>
      ))}

      <button type="button" className={styles.addBatch} onClick={addBatch}>
        <PlusIcon /> Add another date
      </button>

      <p className={styles.summary}>
        {count} transaction{count === 1 ? '' : 's'} · <Money cents={totalCents} />
      </p>

      <div className={formStyles.actions}>
        <button type="button" className={`${formStyles.save} tapActive`} disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : `Add ${count} transaction${count === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
