import type { Transaction } from '../../types'
import type { PendingReceipt } from '../../data/pendingReceipts'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions, DuplicateOffer, TransactionSeed } from '../actions'
import { SaveButtons } from './TransactionSaveButtons'
import { Fields } from './TransactionFields'
import { isWithdrawal } from './transactionTypes'
import { installmentControl } from './installmentControl'
import { InstallmentStep } from './InstallmentStep'
import { acceptDescriptionSuggestion } from './transactionFormActions'
import type { FormFields, Setter } from './transactionFormState'
import type { InstallmentDraft } from './installmentIntent'
import type { Dispatch, SetStateAction } from 'react'
import styles from './TransactionForm.module.css'

export function FormError({ message }: { message: string | null }) {
  return message ? (
    <p className={styles.error} role="alert">
      {message}
    </p>
  ) : null
}

export function FormActions({
  view,
  editing,
  busy,
  uploading,
  retrying,
  queue,
  onDelete,
  onDuplicate,
  onClose,
}: {
  view: 'fields' | 'installment'
  editing: Transaction | null
  busy: boolean
  uploading: { done: number; total: number } | null
  retrying: boolean
  queue?: { left: number; onSkip: () => void } | undefined
  onDelete?: ((id: number) => Promise<void>) | undefined
  onDuplicate?: ((txn: Transaction) => void) | undefined
  onClose: () => void
}) {
  return (
    <div className={styles.actions}>
      {view === 'fields' && editing && onDelete && (
        <button
          type="button"
          className={styles.delete}
          disabled={busy}
          onClick={() => void onDelete(editing.id).then(onClose)}
        >
          Delete
        </button>
      )}
      {view === 'fields' && editing && onDuplicate && (
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => onDuplicate(editing)}>
          Duplicate
        </button>
      )}
      <SaveButtons view={view} queue={queue} busy={busy} uploading={uploading} editing={editing} retrying={retrying} />
    </div>
  )
}

interface FormBodyProps {
  view: 'fields' | 'installment'
  model: ExpenseModel
  editing: Transaction | null
  form: FormFields
  set: Setter
  setForm: Dispatch<SetStateAction<FormFields>>
  draft: InstallmentDraft
  setDraftField: <K extends keyof InstallmentDraft>(
    key: K,
    value: InstallmentDraft[K],
  ) => void
  err: string | null
  amountCents: number
  onTrapPausedChange: ((paused: boolean) => void) | undefined
  actions: ExpenseActions | undefined
  receiptTargetId: number | null
  pendingFiles: PendingReceipt[]
  onPendingChange: (files: PendingReceipt[]) => void
  onViewChange: (view: 'fields' | 'installment') => void
  seed: TransactionSeed | undefined
  duplicate: DuplicateOffer | undefined
}

/** The installment step, or the fields with the installment chip and any error. */
export function FormBody(p: FormBodyProps) {
  if (p.view === 'installment') {
    return (
      <InstallmentStep
        model={p.model}
        editing={p.editing}
        draft={p.draft}
        set={p.setDraftField}
        error={p.err}
        amountCents={p.amountCents}
      />
    )
  }
  const installment = installmentControl({
    draft: p.draft,
    editing: p.editing,
    model: p.model,
    onOpen: () => p.onViewChange('installment'),
    withdrawal: isWithdrawal(p.form),
  })
  return (
    <>
      <Fields
        form={p.form}
        set={p.set}
        model={p.model}
        editing={p.editing}
        onAcceptSuggestion={(s) => acceptDescriptionSuggestion(s, p.model, p.setForm)}
        onTrapPausedChange={p.onTrapPausedChange}
        actions={p.actions}
        receiptTargetId={p.receiptTargetId}
        pendingFiles={p.pendingFiles}
        onPendingChange={p.onPendingChange}
        installmentChip={installment.chip}
        seed={p.seed}
        duplicate={p.duplicate}
      />
      {installment.bar}
      <FormError message={p.err} />
    </>
  )
}
