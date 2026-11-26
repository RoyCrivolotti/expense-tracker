import type { MoneyFormat } from '../../engine/money'
import { CloseIcon, PlusIcon } from '../icons'
import type { ExpenseModel } from '../useExpenseData'
import type { DateBatchDraft } from './batchTransactionIntent'
import { BatchRow, type BatchRowProps } from './BatchRows'
import { DateInput } from './DateInput'
import { Field } from './TransactionFields'
import styles from './BatchTransactionForm.module.css'

interface BatchGroupProps {
  batch: DateBatchDraft
  /** More than one date: only then can a date be removed. */
  removable: boolean
  model: ExpenseModel
  format: MoneyFormat
  investmentCategoryId: number | null
  errors: Record<string, string>
  onTrapPausedChange: ((paused: boolean) => void) | undefined
  updateBatch: (
    batchId: string,
    patch: Partial<DateBatchDraft>,
  ) => void
  removeBatch: (batchId: string) => void
  addRow: (batchId: string) => void
  updateRow: BatchRowProps['updateRow']
  removeRow: BatchRowProps['removeRow']
  onAcceptSuggestion: BatchRowProps['onAcceptSuggestion']
}

export function BatchGroup(p: BatchGroupProps) {
  const { batch } = p
  return (
    <div className={styles.batch}>
      <div className={styles.batchHeader}>
        <Field label="Date" as="div">
          <DateInput
            value={batch.date}
            ariaLabel="Date"
            onChange={(value) => p.updateBatch(batch.id, { date: value })}
            onTrapPausedChange={p.onTrapPausedChange}
          />
        </Field>
        {p.removable && (
          <button
            type="button"
            className={styles.removeBatch}
            aria-label="Remove this date"
            onClick={() => p.removeBatch(batch.id)}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className={styles.columnHeaders} aria-hidden="true">
        <span className={styles.colHeaderType}>Type</span>
        <span className={styles.colHeaderAmount}>Amount</span>
        <span className={styles.colHeaderCat}>Category</span>
        <span className={styles.colHeaderAcct}>Account</span>
      </div>

      {batch.rows.map((row) => (
        <BatchRow
          key={row.id}
          batchId={batch.id}
          row={row}
          model={p.model}
          format={p.format}
          investmentCategoryId={p.investmentCategoryId}
          error={p.errors[row.id]}
          updateRow={p.updateRow}
          removeRow={p.removeRow}
          onAcceptSuggestion={p.onAcceptSuggestion}
        />
      ))}

      <button type="button" className={styles.addRow} onClick={() => p.addRow(batch.id)}>
        <PlusIcon /> Add transaction
      </button>
    </div>
  )
}
