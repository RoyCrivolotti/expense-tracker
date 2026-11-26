import type { Transaction } from '../../types'
import type { PendingReceipt } from '../../data/pendingReceipts'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions, DuplicateOffer, TransactionSeed } from '../actions'
import { SaveButtons } from './TransactionSaveButtons'
import { Fields } from './TransactionFieldsForm'
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

/**
 * The form's buttons. For a captured payment (`queue`) they are a bar that stays in view while the form scrolls under
 * it, since the blocks above its fields push the end of the form off the screen, and "Don't add" is nowhere else. The
 * form's error is said in that bar too, where it is seen. The ordinary add and edit forms end with their buttons.
 */
export function FormActions({
  view,
  editing,
  busy,
  uploading,
  retrying,
  queue,
  duplicate,
  err,
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
  duplicate?: DuplicateOffer | undefined
  err: string | null
  onDelete?: ((id: number) => Promise<void>) | undefined
  onDuplicate?: ((txn: Transaction) => void) | undefined
  onClose: () => void
}) {
  return (
    <div className={queue ? `${styles.actions} ${styles.pinned}` : styles.actions}>
      {queue && view === 'fields' ? <FormError message={err} /> : null}
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
      <SaveButtons
        view={view}
        queue={queue}
        busy={busy}
        uploading={uploading}
        editing={editing}
        retrying={retrying}
        anyway={duplicate?.refused ? duplicate.addAnyway : undefined}
      />
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
      {/* A captured payment's form says its error in the bar that stays in view. */}
      {p.seed?.queue ? null : <FormError message={p.err} />}
    </>
  )
}
