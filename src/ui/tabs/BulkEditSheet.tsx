import { useState } from 'react'
import type { BulkTransactionPatch } from '../../data/dataSource'
import { defaultBudgetMonth } from '../../domain/engine/dates'
import { todayIso } from '../components/transactionFormState'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { selectableOptions, optionLabel } from '../components/pickerOptions'
import { offScreenNote } from './useTransactionSelection'
import { TypeSelector } from '../components/TransactionFields'
import { STORED_TYPES } from '../components/transactionTypes'
import { FlagField } from '../components/FlagField'
import { createFlagInPlace } from '../components/quickFlag'
import { LabelField } from '../components/LabelField'
import { createLabelInPlace } from '../components/quickLabel'
import { Modal } from '../components/Modal'
import {
  buildBulkLabelAdditions,
  buildBulkPatch,
  canApplyBulkEdit,
  type BulkEditFieldState,
  type DescriptionCount,
} from './bulkEditFields'
import { DescriptionField } from './DescriptionField'
import styles from './BulkEditSheet.module.css'
import { usePopoverTrapPause } from '../hooks/usePopoverTrapPause'

interface BulkEditSheetProps {
  count: number
  /** Chosen rows that are not on screen, which the edit leaves alone. */
  hiddenCount?: number
  /** What the chosen rows are called now, for the rename field's "Replaces" hint. */
  currentDescriptions?: readonly DescriptionCount[]
  model: ExpenseModel
  actions?: ExpenseActions | undefined
  busy: boolean
  onApply: (patch: BulkTransactionPatch, labelIdsToAdd: number[]) => void
  onCancel: () => void
}

/**
 * Its own component so the sheet keeps its branches: the sheet sits on the complexity
 * ceiling of 12.
 */
function OffScreenNote({ hiddenCount }: { hiddenCount: number | undefined }) {
  const note = offScreenNote(hiddenCount ?? 0, 'changed')
  if (!note) return null
  return (
    <p className={styles.offScreen} role="note">
      {note}
    </p>
  )
}

export function BulkEditSheet({
  count,
  hiddenCount,
  currentDescriptions,
  model,
  actions,
  busy,
  onApply,
  onCancel,
}: BulkEditSheetProps) {
  const [popoverOpen, setPopoverOpen] = usePopoverTrapPause()
  const [fields, setFields] = useState<BulkEditFieldState>({
    categoryEnabled: false,
    categoryId: model.dataset.categories[0]?.id ?? 0,
    accountEnabled: false,
    accountId: model.dataset.accounts[0]?.id ?? 0,
    typeEnabled: false,
    type: 'expense',
    dateEnabled: false,
    date: todayIso(),
    budgetMonthEnabled: false,
    // Not the calendar month: an owner whose budget rolls over mid-month would be
    // handed a month a single edit would never produce.
    budgetMonth: defaultBudgetMonth(todayIso(), model.dataset.settings.budgetRolloverDay),
    flagEnabled: false,
    flagId: model.dataset.flags.find((f) => f.active)?.id ?? null,
    labelsEnabled: false,
    labelIds: [],
    descriptionEnabled: false,
    description: '',
  })

  const set = <K extends keyof BulkEditFieldState>(key: K, value: BulkEditFieldState[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const canApply = canApplyBulkEdit(fields)

  const handleApply = () => onApply(buildBulkPatch(fields), buildBulkLabelAdditions(fields))

  const categories = selectableOptions(model.dataset.categories, 0)
  const accounts = selectableOptions(model.dataset.accounts, 0)
  const noun = count === 1 ? 'transaction' : 'transactions'

  return (
    <Modal
      title="Edit selected"
      subtitle={`${count} ${noun}`}
      onClose={onCancel}
      trapPaused={popoverOpen}
    >
      <OffScreenNote hiddenCount={hiddenCount} />
      <div className={styles.fields}>
        <ToggleField
          label="Description"
          enabled={fields.descriptionEnabled}
          onToggle={(v) => set('descriptionEnabled', v)}
        >
          <DescriptionField
            value={fields.description}
            index={model.descriptionIndex}
            replaced={currentDescriptions}
            onChange={(v) => set('description', v)}
          />
        </ToggleField>

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
          <TypeSelector options={STORED_TYPES} value={fields.type} onChange={(t) => set('type', t)} />
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
        <ToggleField
          label="Flag"
          enabled={fields.flagEnabled}
          onToggle={(v) => set('flagEnabled', v)}
        >
          <FlagField
            compact
            flags={model.dataset.flags}
            value={fields.flagId}
            onChange={(flagId) => set('flagId', flagId)}
            onTrapPausedChange={setPopoverOpen}
            {...(actions ? { onCreate: createFlagInPlace(actions, model.dataset.flags) } : {})}
          />
        </ToggleField>
        <ToggleField
          label="Labels"
          enabled={fields.labelsEnabled}
          onToggle={(v) => set('labelsEnabled', v)}
        >
          <LabelField
            labels={model.dataset.labels}
            value={fields.labelIds}
            onChange={(labelIds) => set('labelIds', labelIds)}
            onTrapPausedChange={setPopoverOpen}
            {...(actions ? { onCreate: createLabelInPlace(actions, model.dataset.labels) } : {})}
          />
          {/* Unlike every field above, this can't mean "replace": the rows in one
              bulk edit can each already carry a different set of labels. */}
          <p className={styles.fieldHint}>Added to whatever each transaction already has.</p>
        </ToggleField>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.applyBtn}
          disabled={!canApply || busy}
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
