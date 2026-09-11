import { useState } from 'react'
import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import { selectableOptions, optionLabel } from '../components/pickerOptions'
import { selectableFlags } from '../components/flagPickerOptions'
import { TypeSelector } from '../components/TransactionFields'
import { Modal } from '../components/Modal'
import {
  anyFieldEnabled,
  buildBulkPatch,
  type BulkEditFieldState,
} from './bulkEditFields'
import styles from './BulkEditSheet.module.css'

interface BulkEditSheetProps {
  count: number
  model: ExpenseModel
  busy: boolean
  onApply: (patch: BulkTransactionPatch) => void
  onCancel: () => void
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
  const [fields, setFields] = useState<BulkEditFieldState>({
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
    flagEnabled: false,
    flagId: model.dataset.flags.find((f) => f.active)?.id ?? null,
  })

  const set = <K extends keyof BulkEditFieldState>(key: K, value: BulkEditFieldState[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const anyEnabled = anyFieldEnabled(fields)

  const handleApply = () => onApply(buildBulkPatch(fields))

  const flags = selectableFlags(model.dataset.flags, fields.flagId)
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
        {model.dataset.flags.length > 0 ? (
          <ToggleField
            label="Flag"
            enabled={fields.flagEnabled}
            onToggle={(v) => set('flagEnabled', v)}
          >
            <select
              value={fields.flagId ?? 'none'}
              aria-label="Flag"
              onChange={(e) =>
                set('flagId', e.target.value === 'none' ? null : Number(e.target.value))
              }
            >
              <option value="none">No flag</option>
              {flags.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </ToggleField>
        ) : null}
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
