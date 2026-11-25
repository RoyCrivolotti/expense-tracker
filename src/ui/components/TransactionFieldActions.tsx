import type { ReactNode, RefObject } from 'react'
import type { Transaction, TransactionAttachment } from '../../types'
import { CameraIcon, PlusIcon } from '../icons'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { PendingReceipt } from '../../data/pendingReceipts'
import { FlagField } from './FlagField'
import { createFlagInPlace } from './quickFlag'
import { LabelField } from './LabelField'
import { createLabelInPlace } from './quickLabel'
import { ReceiptStrip } from './ReceiptStrip'
import { ReimbursementLink } from './ReimbursementLink'
import type { FormFields, Setter } from './transactionFormState'
import { Field } from './TransactionFields'
import styles from './TransactionForm.module.css'

interface ChipRowProps {
  form: FormFields
  set: Setter
  model: ExpenseModel
  actions: ExpenseActions
  onTrapPausedChange: ((paused: boolean) => void) | undefined
  receiptAtCap: boolean
  showNoteInput: boolean
  installmentChip: ReactNode
  onAddReceipt: () => void
  onAddNote: () => void
}

/** Receipt, note, flag, labels and the installment toggle, as one row of chips. */
function ChipRow(p: ChipRowProps) {
  const { form, set, model, actions, onTrapPausedChange } = p
  return (
    <div className={styles.chipRow}>
      <button type="button" className={styles.chip} disabled={p.receiptAtCap} onClick={p.onAddReceipt}>
        <span className={styles.chipIcon} aria-hidden>
          <CameraIcon />
        </span>
        {p.receiptAtCap ? 'Limit reached' : 'Add receipt'}
      </button>
      {!p.showNoteInput && (
        <button type="button" className={styles.chip} onClick={p.onAddNote}>
          <span className={styles.chipIcon} aria-hidden>
            <PlusIcon />
          </span>
          Add note
        </button>
      )}
      <FlagField
        compact
        flags={model.dataset.flags}
        value={form.flagId}
        onChange={(flagId) => set('flagId', flagId)}
        onTrapPausedChange={onTrapPausedChange}
        onCreate={createFlagInPlace(actions, model.dataset.flags)}
      />
      <LabelField
        labels={model.dataset.labels}
        value={form.labelIds}
        onChange={(labelIds) => set('labelIds', labelIds)}
        onTrapPausedChange={onTrapPausedChange}
        onCreate={createLabelInPlace(actions, model.dataset.labels)}
      />
      {p.installmentChip}
    </div>
  )
}

/** Notes, flag and labels for a session that cannot touch receipts. */
export function ReadOnlyRows({
  form,
  set,
  model,
  onTrapPausedChange,
}: {
  form: FormFields
  set: Setter
  model: ExpenseModel
  onTrapPausedChange: ((paused: boolean) => void) | undefined
}) {
  return (
    <>
      <Field label="Notes">
        <input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <FlagField
        flags={model.dataset.flags}
        value={form.flagId}
        onChange={(flagId) => set('flagId', flagId)}
        onTrapPausedChange={onTrapPausedChange}
      />
    </>
  )
}

interface ActionRowsProps {
  form: FormFields
  set: Setter
  model: ExpenseModel
  editing: Transaction | null
  actions: ExpenseActions
  onTrapPausedChange: ((paused: boolean) => void) | undefined
  pendingFiles: PendingReceipt[]
  onPendingChange: ((files: PendingReceipt[]) => void) | undefined
  receiptTargetId: number | null
  attachments: TransactionAttachment[]
  receiptAtCap: boolean
  installmentChip: ReactNode
  noteExpanded: boolean
  setNoteExpanded: (expanded: boolean) => void
  receiptInputRef: RefObject<HTMLInputElement | null>
}

/** The chip row (receipt, note, flag, labels, installment), notes, reimbursement link and receipts. */
export function ActionRows(p: ActionRowsProps) {
  const { form, set, model, editing, actions, onTrapPausedChange, pendingFiles, receiptTargetId } = p
  const { attachments, receiptAtCap } = p
  const showNoteInput = p.noteExpanded || form.notes !== ''
  return (
    <>
      <ChipRow
        form={form}
        set={set}
        model={model}
        actions={actions}
        onTrapPausedChange={onTrapPausedChange}
        receiptAtCap={receiptAtCap}
        showNoteInput={showNoteInput}
        installmentChip={p.installmentChip}
        onAddReceipt={() => p.receiptInputRef.current?.click()}
        onAddNote={() => p.setNoteExpanded(true)}
      />
      {showNoteInput && (
        <Field label="Notes">
          <input
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            autoFocus={form.notes === ''}
            onBlur={() => {
              if (form.notes === '') p.setNoteExpanded(false)
            }}
          />
        </Field>
      )}
      {editing ? <ReimbursementLink editing={editing} lookup={model.lookup} onOpen={actions.onEdit} /> : null}
      <ReceiptStrip
        {...(receiptTargetId != null ? { transactionId: receiptTargetId } : {})}
        attachments={attachments}
        actions={actions}
        pendingFiles={pendingFiles}
        onPendingChange={p.onPendingChange}
        onTrapPausedChange={onTrapPausedChange}
        externalInputRef={p.receiptInputRef}
        hideControls
      />
    </>
  )
}
