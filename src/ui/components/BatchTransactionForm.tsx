import { Fragment, useEffect, useState } from 'react'
import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import { applyDescriptionSuggestion } from '../../data/applyDescriptionSuggestion'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { addDaysIso } from '../../engine/dates'
import { parseMoneyToCents } from '../../engine/money'
import type { TxnType } from '../../types'
import { CloseIcon, PlusIcon } from '../icons'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useToast } from '../hooks/useToast'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import {
  buildBatchTransactions,
  isRowEmpty,
  type BatchRowDraft,
  type DateBatchDraft,
} from './batchTransactionIntent'
import { DescriptionCombobox } from './DescriptionCombobox'
import { Money } from './Money'
import { optionLabel, selectableOptions } from './pickerOptions'
import { Field } from './TransactionFields'
import { todayIso } from './transactionFormState'
import formStyles from './TransactionForm.module.css'
import styles from './BatchTransactionForm.module.css'

interface BatchTransactionFormProps {
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
  /** Kept mounted but visually hidden (e.g. while the single-transaction tab is
   * active), so its own state survives switching back rather than losing typed rows. */
  hidden?: boolean
  /** Reports whether any row has content, so a caller can warn before discarding
   * it (e.g. closing the modal without saving). */
  onDirtyChange?: (dirty: boolean) => void
}

/** DOM id for a row's wrapper, so a failed save can scroll the first bad row into view. */
const rowElementId = (rowId: string) => `batch-row-${rowId}`

export function BatchTransactionForm({
  model,
  actions,
  onClose,
  hidden,
  onDirtyChange,
}: BatchTransactionFormProps) {
  const format = useMoneyFormat()
  const { showToast } = useToast()

  const defaultCategoryId = () =>
    model.dataset.categories.find((c) => c.active)?.id ?? model.dataset.categories[0]?.id ?? 0
  const defaultAccountId = () => resolveDefaultAccountId(model.dataset.accounts, model.dataset.settings)

  // crypto.randomUUID() is a plain pure call (unlike a ref-backed counter), so
  // it's safe to use here in the lazy useState initializer below as well as
  // in later event handlers — no useId/useRef split needed.
  const makeRow = (categoryId: number, accountId: number, type: TxnType = 'expense'): BatchRowDraft => ({
    id: crypto.randomUUID(),
    type,
    amount: '',
    description: '',
    categoryId,
    accountId,
  })
  const makeBatch = (date: string, seedRow: BatchRowDraft): DateBatchDraft => ({
    id: crypto.randomUUID(),
    date,
    rows: [seedRow],
  })

  const [batches, setBatches] = useState<DateBatchDraft[]>(() => [
    makeBatch(todayIso(), makeRow(defaultCategoryId(), defaultAccountId())),
  ])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    onDirtyChange?.(batches.some((b) => b.rows.some((r) => !isRowEmpty(r))))
    // onDirtyChange intentionally omitted: callers pass a state setter inline, which
    // would otherwise re-run this on every parent render regardless of `batches`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches])

  const updateBatch = (batchId: string, patch: Partial<DateBatchDraft>) =>
    setBatches((bs) => bs.map((b) => (b.id === batchId ? { ...b, ...patch } : b)))

  const updateRow = (batchId: string, rowId: string, patch: Partial<BatchRowDraft>) => {
    setBatches((bs) =>
      bs.map((b) =>
        b.id !== batchId
          ? b
          : { ...b, rows: b.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) },
      ),
    )
    // Editing a flagged row clears its stale error immediately rather than
    // leaving last save attempt's message showing after the value's fixed;
    // save() re-validates and re-flags it if it's still bad.
    setErrors((e) => {
      if (!(rowId in e)) return e
      const next = { ...e }
      delete next[rowId]
      return next
    })
  }

  const addRow = (batchId: string) =>
    setBatches((bs) =>
      bs.map((b) => {
        if (b.id !== batchId) return b
        const last = b.rows[b.rows.length - 1]
        return {
          ...b,
          rows: [
            ...b.rows,
            makeRow(
              last?.categoryId ?? defaultCategoryId(),
              last?.accountId ?? defaultAccountId(),
              last?.type ?? 'expense',
            ),
          ],
        }
      }),
    )

  const removeRow = (batchId: string, rowId: string) =>
    setBatches((bs) =>
      bs.map((b) => (b.id !== batchId ? b : { ...b, rows: b.rows.filter((r) => r.id !== rowId) })),
    )

  const addBatch = () =>
    setBatches((bs) => {
      const earliest = bs.reduce((min, b) => (b.date < min ? b.date : min), bs[0]?.date ?? todayIso())
      const lastBatchRows = bs[bs.length - 1]?.rows ?? []
      const last = lastBatchRows[lastBatchRows.length - 1]
      const seedRow = makeRow(
        last?.categoryId ?? defaultCategoryId(),
        last?.accountId ?? defaultAccountId(),
        last?.type ?? 'expense',
      )
      return [...bs, makeBatch(addDaysIso(earliest, -1), seedRow)]
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
            // Account is a per-row field (like the single-transaction form), so
            // the suggestion's remembered account applies here, same as there.
            const patch = applyDescriptionSuggestion(suggestion, model.dataset, {
              categoryId: r.categoryId,
              accountId: r.accountId,
            })
            return { ...r, ...patch }
          }),
        }
      }),
    )

  // Same "counts toward saving" rule buildBatchTransactions uses (non-empty
  // AND a positive amount), so this summary never promises more than save()
  // will actually persist.
  const saveableRows = batches.flatMap((b) =>
    b.rows.filter((r) => !isRowEmpty(r) && Math.abs(parseMoneyToCents(r.amount, format)) > 0),
  )
  const totalCents = saveableRows.reduce((sum, r) => sum + Math.abs(parseMoneyToCents(r.amount, format)), 0)
  const count = saveableRows.length

  const save = async () => {
    const result = buildBatchTransactions(batches, format, model.dataset.settings.budgetRolloverDay)
    if (!result.ok) {
      setErrors(result.errors)
      const firstErrorRowId = Object.keys(result.errors)[0]
      if (firstErrorRowId) {
        // `behavior: 'smooth'` is a silent no-op for an element inside this
        // modal's nested `overflow-y: auto` container in at least one real
        // browser engine (verified manually) — 'auto' actually moves it.
        document
          .getElementById(rowElementId(firstErrorRowId))
          ?.scrollIntoView({ behavior: 'auto', block: 'center' })
      } else {
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
    <div className={styles.root} hidden={hidden}>
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

          <div className={styles.gridWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th scope="col" className={styles.gridTypeCol}>
                    Type
                  </th>
                  <th scope="col">Description</th>
                  <th scope="col">Category</th>
                  <th scope="col">Account</th>
                  <th scope="col" className={styles.gridAmountCol}>
                    Amount
                  </th>
                  <th scope="col" className={styles.gridRemoveCol}>
                    <span className={styles.visuallyHidden}>Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr id={rowElementId(row.id)}>
                      <td>
                        <select
                          aria-label="Type"
                          className={`${styles.gridTypeSelect} ${styles[`gridType_${row.type}`]}`}
                          value={row.type}
                          onChange={(e) =>
                            updateRow(batch.id, row.id, { type: e.target.value as TxnType })
                          }
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="investment">Invest</option>
                          <option value="refund">Refund</option>
                        </select>
                      </td>
                      <td>
                        <DescriptionCombobox
                          value={row.description}
                          index={model.descriptionIndex}
                          placeholder="e.g. Mercadona"
                          ariaLabel="Description"
                          onChange={(v) => updateRow(batch.id, row.id, { description: v })}
                          onAccept={(s) => onAcceptSuggestion(batch.id, row.id, s)}
                        />
                      </td>
                      <td>
                        <select
                          aria-label="Category"
                          value={row.categoryId}
                          onChange={(e) =>
                            updateRow(batch.id, row.id, { categoryId: Number(e.target.value) })
                          }
                        >
                          {selectableOptions(model.dataset.categories, row.categoryId).map((c) => (
                            <option key={c.id} value={c.id}>
                              {optionLabel(c)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          aria-label="Account"
                          value={row.accountId}
                          onChange={(e) =>
                            updateRow(batch.id, row.id, { accountId: Number(e.target.value) })
                          }
                        >
                          {selectableOptions(model.dataset.accounts, row.accountId).map((a) => (
                            <option key={a.id} value={a.id}>
                              {optionLabel(a)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className={styles.gridAmount}
                          aria-label="Amount"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={`0${format.decimalSeparator}00`}
                          value={row.amount}
                          onChange={(e) => updateRow(batch.id, row.id, { amount: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.removeRow}
                          aria-label="Remove this transaction"
                          onClick={() => removeRow(batch.id, row.id)}
                        >
                          <CloseIcon />
                        </button>
                      </td>
                    </tr>
                    {errors[row.id] && (
                      <tr>
                        <td colSpan={6} className={styles.gridErrorCell}>
                          {errors[row.id]}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className={styles.addRow} onClick={() => addRow(batch.id)}>
            <PlusIcon /> Add transaction
          </button>
        </div>
      ))}

      <button type="button" className={styles.addBatch} onClick={addBatch}>
        <PlusIcon /> Add another date
      </button>

      <p className={styles.summary} data-testid="batch-summary">
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
