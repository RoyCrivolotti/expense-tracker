import type { DescriptionSuggestion } from '../../data/descriptionIndex'
import type { MoneyFormat } from '../../engine/money'
import type { TxnType } from '../../types'
import { CloseIcon } from '../icons'
import type { ExpenseModel } from '../useExpenseData'
import type { BatchRowDraft } from './batchTransactionIntent'
import { rowElementId } from './batchSave'
import { DescriptionCombobox } from './DescriptionCombobox'
import { optionLabel, selectableOptions } from './pickerOptions'
import formStyles from './TransactionForm.module.css'
import styles from './BatchTransactionForm.module.css'

const TYPE_OPTIONS: { value: TxnType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'investment', label: 'Invest' },
  { value: 'refund', label: 'Refund' },
]

type RowUpdate = (
  batchId: string,
  rowId: string,
  patch: Partial<BatchRowDraft>,
) => void

/** The type, account and category selects of one row. */
function RowSelects({
  batchId,
  row,
  model,
  investmentCategoryId,
  updateRow,
}: {
  batchId: string
  row: BatchRowDraft
  model: ExpenseModel
  investmentCategoryId: number | null
  updateRow: RowUpdate
}) {
  return (
    <>
      <select
        className={styles.compactType}
        value={row.type}
        aria-label="Type"
        onChange={(e) => updateRow(batchId, row.id, { type: e.target.value as TxnType })}
      >
        {TYPE_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <select
        className={`${styles.compactSelect} ${styles.compactAccount}`}
        value={row.accountId}
        aria-label="Account"
        onChange={(e) => updateRow(batchId, row.id, { accountId: Number(e.target.value) })}
      >
        {selectableOptions(model.dataset.accounts, row.accountId).map((a) => (
          <option key={a.id} value={a.id}>
            {optionLabel(a)}
          </option>
        ))}
      </select>
      <select
        className={`${styles.compactSelect} ${styles.compactCategory}`}
        value={row.type === 'investment' && investmentCategoryId !== null ? investmentCategoryId : row.categoryId}
        disabled={row.type === 'investment' && investmentCategoryId !== null}
        aria-label="Category"
        onChange={(e) => updateRow(batchId, row.id, { categoryId: Number(e.target.value) })}
      >
        {selectableOptions(model.dataset.categories, row.categoryId).map((c) => (
          <option key={c.id} value={c.id}>
            {optionLabel(c)}
          </option>
        ))}
      </select>
    </>
  )
}

export interface BatchRowProps {
  batchId: string
  row: BatchRowDraft
  model: ExpenseModel
  format: MoneyFormat
  investmentCategoryId: number | null
  error: string | undefined
  updateRow: (
    batchId: string,
    rowId: string,
    patch: Partial<BatchRowDraft>,
  ) => void
  removeRow: (
    batchId: string,
    rowId: string,
  ) => void
  onAcceptSuggestion: (
    batchId: string,
    rowId: string,
    suggestion: DescriptionSuggestion,
  ) => void
}

export function BatchRow({
  batchId,
  row,
  model,
  format,
  investmentCategoryId,
  error,
  updateRow,
  removeRow,
  onAcceptSuggestion,
}: BatchRowProps) {
  return (
    <div key={row.id} id={rowElementId(row.id)} className={styles.row} data-type={row.type}>
      <input
        className={styles.compactAmount}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label="Amount"
        placeholder={`0${format.decimalSeparator}00`}
        value={row.amount}
        onChange={(e) => updateRow(batchId, row.id, { amount: e.target.value })}
      />
      <RowSelects
        batchId={batchId}
        row={row}
        model={model}
        investmentCategoryId={investmentCategoryId}
        updateRow={updateRow}
      />
      <div className={styles.descriptionRow}>
        <div className={styles.compactDescription}>
          <DescriptionCombobox
            value={row.description}
            index={model.descriptionIndex}
            placeholder="e.g. Mercadona"
            onChange={(v) => updateRow(batchId, row.id, { description: v })}
            onAccept={(s) => onAcceptSuggestion(batchId, row.id, s)}
          />
        </div>
        <button
          type="button"
          className={styles.removeRow}
          aria-label="Remove this transaction"
          onClick={() => removeRow(batchId, row.id)}
        >
          <CloseIcon />
        </button>
      </div>
      {error && <p className={formStyles.error}>{error}</p>}
    </div>
  )
}
