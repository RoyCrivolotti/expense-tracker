import type { Dispatch } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { selectableOptions, optionLabel } from '../components/pickerOptions'
import { TypeSelector } from '../components/TransactionFields'
import { STORED_TYPES } from '../components/transactionTypes'
import { FlagField } from '../components/FlagField'
import { createFlagInPlace } from '../components/quickFlag'
import { LabelField } from '../components/LabelField'
import { createLabelInPlace } from '../components/quickLabel'
import { BulkDateField, BulkMonthField } from './BulkEditPickers'
import type { BulkEditFieldState, DescriptionCount } from './bulkEditFields'
import { DescriptionField } from './DescriptionField'
import styles from './BulkEditSheet.module.css'

interface Props {
  fields: BulkEditFieldState
  set: <K extends keyof BulkEditFieldState>(
    key: K,
    value: BulkEditFieldState[K],
  ) => void
  model: ExpenseModel
  actions: ExpenseActions | undefined
  currentDescriptions: readonly DescriptionCount[] | undefined
  onTrapPausedChange: Dispatch<boolean>
}

/** The cards that pick a value from a list or type one: description, category, account, type. */
function ListFieldCards({ fields, set, model, currentDescriptions }: Omit<Props, 'actions' | 'onTrapPausedChange'>) {
  const categories = selectableOptions(model.dataset.categories, 0)
  const accounts = selectableOptions(model.dataset.accounts, 0)
  return (
    <>
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

      <ToggleField label="Category" enabled={fields.categoryEnabled} onToggle={(v) => set('categoryEnabled', v)}>
        <select value={fields.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {optionLabel(c)}
            </option>
          ))}
        </select>
      </ToggleField>

      <ToggleField label="Account" enabled={fields.accountEnabled} onToggle={(v) => set('accountEnabled', v)}>
        <select value={fields.accountId} onChange={(e) => set('accountId', Number(e.target.value))}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {optionLabel(a)}
            </option>
          ))}
        </select>
      </ToggleField>

      <ToggleField label="Type" enabled={fields.typeEnabled} onToggle={(v) => set('typeEnabled', v)}>
        <TypeSelector options={STORED_TYPES} value={fields.type} onChange={(t) => set('type', t)} />
      </ToggleField>
    </>
  )
}

/** The cards that open a popover: date, budget month, flag, labels. */
function PopoverFieldCards({
  fields,
  set,
  model,
  actions,
  onTrapPausedChange: setPopoverOpen,
}: Omit<Props, 'currentDescriptions'>) {
  return (
    <>
      <ToggleField label="Date" enabled={fields.dateEnabled} onToggle={(v) => set('dateEnabled', v)}>
        <BulkDateField value={fields.date} onChange={(date) => set('date', date)} onTrapPausedChange={setPopoverOpen} />
      </ToggleField>

      <ToggleField
        label="Budget month"
        enabled={fields.budgetMonthEnabled}
        onToggle={(v) => set('budgetMonthEnabled', v)}
      >
        <BulkMonthField
          value={fields.budgetMonth}
          onChange={(budgetMonth) => set('budgetMonth', budgetMonth)}
          onTrapPausedChange={setPopoverOpen}
        />
      </ToggleField>
      <ToggleField label="Flag" enabled={fields.flagEnabled} onToggle={(v) => set('flagEnabled', v)}>
        <FlagField
          compact
          flags={model.dataset.flags}
          value={fields.flagId}
          onChange={(flagId) => set('flagId', flagId)}
          onTrapPausedChange={setPopoverOpen}
          {...(actions ? { onCreate: createFlagInPlace(actions, model.dataset.flags) } : {})}
        />
      </ToggleField>
      <ToggleField label="Labels" enabled={fields.labelsEnabled} onToggle={(v) => set('labelsEnabled', v)}>
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
    </>
  )
}

/** One switchable card per field the edit can change. */
export function BulkFieldCards(props: Props) {
  return (
    <>
      <ListFieldCards {...props} />
      <PopoverFieldCards {...props} />
    </>
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
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        <span className={styles.fieldLabel}>{label}</span>
      </label>
      {enabled && <div className={styles.fieldInput}>{children}</div>}
    </div>
  )
}
