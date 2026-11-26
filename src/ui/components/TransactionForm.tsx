import { useState } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import { parseMoneyToCents } from '../../engine/money'
import { useToast } from '../hooks/useToast'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { DuplicateOffer, TransactionSeed } from '../actions'
import { initialFields, type FormFields, type Setter } from './transactionFormState'
import { type InstallmentDraft, type InstallmentIntent } from './installmentIntent'
import { initialDraft } from './transactionFormSupport'
import { useDirtyReporting, useRevokeStagedOnUnmount, useTransactionSave } from './useTransactionSave'
import { FormActions, FormBody } from './TransactionFormParts'
import styles from './TransactionForm.module.css'

interface FormProps {
  model: ExpenseModel
  editing: Transaction | null
  seed?: TransactionSeed | undefined
  /** A typed row the server says looks like this payment: the form offers to link it or add anyway. */
  duplicate?: DuplicateOffer | undefined
  /** Resolves with the stored row on create, null on update (the id was known). */
  onSubmit: (
    input: NewTransaction,
    id?: number,
    intent?: InstallmentIntent,
  ) => Promise<Transaction | null>
  onDelete?: ((id: number) => Promise<void>) | undefined
  onDuplicate?: ((txn: Transaction) => void) | undefined
  onClose: () => void
  /** Set when this form is one of a queue of captured payments. */
  queue?: { left: number; onSkip: () => void } | undefined
  /** Kept mounted but visually hidden (e.g. while the batch-entry tab is active),
   * so its own state survives switching back rather than losing what was typed. */
  hidden?: boolean
  /** Reports whether the form has diverged from its opening state, so a caller
   * can warn before discarding it (e.g. closing the modal without saving). */
  onDirtyChange?: (dirty: boolean) => void
  /**
   * How many receipts are stranded on an already-saved row (0 when none).
   * Lets the close guard say what is actually at risk: after a partial save the
   * transaction is safe, so "you'll lose what you've entered" is both wrong and
   * frightening in the wrong direction.
   */
  onPartialSaveChange?: (strandedReceipts: number) => void
  /** Raised while a portalled popover owns focus, so the Modal pauses its trap. */
  onTrapPausedChange?: ((paused: boolean) => void) | undefined
  /** Passed through to the receipts strip; absent in read-only sessions. */
  actions?: ExpenseActions | undefined
  view: 'fields' | 'installment'
  onViewChange: (view: 'fields' | 'installment') => void
}

export function TransactionForm(props: FormProps) {
  const { model, editing, seed, view, onViewChange, hidden } = props
  const format = useMoneyFormat()
  const { showToast } = useToast()
  const [form, setForm] = useState<FormFields>(() => initialFields(editing, model, format, seed))
  const [draft, setDraft] = useState<InstallmentDraft>(() => initialDraft(editing, model, seed))
  const save = useTransactionSave({ ...props, form, draft, format, showToast })
  useDirtyReporting(form, draft, save.pendingFiles, save.savedId, props.onDirtyChange, props.onPartialSaveChange)
  useRevokeStagedOnUnmount(save.pendingFiles)

  const set: Setter = (
    key,
    value,
  ) => setForm((f) => ({ ...f, [key]: value }))
  const setDraftField: <K extends keyof InstallmentDraft>(
    key: K,
    value: InstallmentDraft[K],
  ) => void = (
    key,
    value,
  ) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <form
      className={styles.form}
      hidden={hidden}
      onSubmit={(e) => {
        e.preventDefault()
        void save.submit()
      }}
    >
      <FormBody
        view={view}
        model={model}
        editing={editing}
        form={form}
        set={set}
        setForm={setForm}
        draft={draft}
        setDraftField={setDraftField}
        err={save.err}
        amountCents={Math.abs(parseMoneyToCents(form.amount, format) || 0)}
        onTrapPausedChange={props.onTrapPausedChange}
        actions={props.actions}
        onViewChange={onViewChange}
        receiptTargetId={editing?.id ?? save.savedId}
        pendingFiles={save.pendingFiles}
        onPendingChange={save.setPendingFiles}
        seed={seed}
        duplicate={props.duplicate}
      />
      <FormActions
        {...props}
        err={save.err}
        busy={save.busy}
        uploading={save.uploading}
        retrying={save.savedId != null}
      />
    </form>
  )
}
