import { useState } from 'react'
import type { TxnType } from '../../types'
import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import { selectableOptions, optionLabel } from '../components/pickerOptions'
import { TypeSelector } from '../components/TransactionFields'
import { Modal } from '../components/Modal'
import styles from './BulkEditSheet.module.css'

interface BulkEditSheetProps {
  count: number
  model: ExpenseModel
  busy: boolean
  onApply: (patch: BulkTransactionPatch) => void
  onCancel: () => void
}

interface FieldState {
  categoryEnabled: boolean
  categoryId: number
  accountEnabled: boolean
  accountId: number
  typeEnabled: boolean
  type: TxnType
  dateEnabled: boolean
  date: string
  budgetMonthEnabled: boolean
  budgetMonth: string
}

function localDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function BulkEditSheet({ count, model, busy, onApply, onCancel }: BulkEditSheetProps) {
  const [fields, setFields] = useState<FieldState>({
    categoryEnabled: false,
    categoryId: model.dataset.categories[0]?.id ?? 0,
    accountEnabled: false,
    accountId: model.dataset.accounts[0]?.id ?? 0,
    typeEnabled: false,
    type: 'expense',
    dateEnabled: false,
    date: localDate(),
    budgetMonthEnabled: false,
    budgetMonth: localMonth(),
  })

  const set = <K extends keyof FieldState>(key: K, value: FieldState[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const anyEnabled =
    fields.categoryEnabled ||
    fields.accountEnabled ||
    fields.typeEnabled ||
    fields.dateEnabled ||
    fields.budgetMonthEnabled

  const handleApply = () => {
    const patch: BulkTransactionPatch = {}
    if (fields.categoryEnabled) patch.categoryId = fields.categoryId
    if (fields.accountEnabled) patch.accountId = fields.accountId
    if (fields.typeEnabled) patch.type = fields.type
    if (fields.dateEnabled) patch.date = fields.date
    if (fields.budgetMonthEnabled) patch.budgetMonth = fields.budgetMonth
    onApply(patch)
  }

  const categories = selectableOptions(model.dataset.categories, 0)
  const accounts = selectableOptions(model.dataset.accounts, 0)
  const noun = count === 1 ? 'transaction' : 'transactions'

  return (
    <Modal title="Edit selected" subtitle={`${count} ${noun}`} onClose={onCancel}>
      <div className={styles.fields}>
        <ToggleField
          label="Category"
          enabled={fields.categoryEnabled}
          onToggle={(v) => set('categoryEnabled', v)}
        >
          <select
            value={fields.categoryId}
            onChange={(e) => set('categoryId', Number(e.target.value))}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {optionLabel(c)}
              </option>
            ))}
          </select>
        </ToggleField>

        <ToggleField
          label="Account"
          enabled={fields.accountEnabled}
          onToggle={(v) => set('accountEnabled', v)}
        >
          <select
            value={fields.accountId}
            onChange={(e) => set('accountId', Number(e.target.value))}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {optionLabel(a)}
              </option>
            ))}
          </select>
        </ToggleField>

        <ToggleField
          label="Type"
          enabled={fields.typeEnabled}
          onToggle={(v) => set('typeEnabled', v)}
        >
          <TypeSelector value={fields.type} onChange={(t) => set('type', t)} />
        </ToggleField>

        <ToggleField
          label="Date"
          enabled={fields.dateEnabled}
          onToggle={(v) => set('dateEnabled', v)}
        >
          <input
            type="date"
            value={fields.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </ToggleField>

        <ToggleField
          label="Budget month"
          enabled={fields.budgetMonthEnabled}
          onToggle={(v) => set('budgetMonthEnabled', v)}
        >
          <input
            type="month"
            value={fields.budgetMonth}
            onChange={(e) => set('budgetMonth', e.target.value)}
          />
        </ToggleField>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.applyBtn}
          disabled={!anyEnabled || busy}
          onClick={handleApply}
        >
          {busy ? 'Applying…' : 'Apply changes'}
        </button>
      </div>
    </Modal>
  )
}

function ToggleField({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className={`${styles.fieldCard} ${enabled ? styles.fieldCardActive : ''}`}>
      <label className={styles.fieldHeader}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className={styles.fieldLabel}>{label}</span>
      </label>
      {enabled && <div className={styles.fieldInput}>{children}</div>}
    </div>
  )
}
