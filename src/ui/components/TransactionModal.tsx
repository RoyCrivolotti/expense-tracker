import { useState } from 'react'
import type { Transaction } from '../../types'
import type { NewTransaction } from '../../data/dataSource'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { finalBudgetMonth } from '../../engine'
import { fullMonthLabel } from '../../engine/dates'
import { useToast } from '../hooks/useToast'
import { BatchTransactionForm } from './BatchTransactionForm'
import { ConfirmSheet } from './ConfirmSheet'
import { Modal } from './Modal'
import { TransactionForm } from './TransactionForm'
import type { InstallmentIntent } from './installmentIntent'
import { createTransactionWithIntent, updateTransactionWithIntent } from './transactionSaveIntent'
import styles from './TransactionModal.module.css'

/** "Installment 21 of 24 · Final payment November 2026" for a plan-linked edit. */
function installmentNote(editing: Transaction | null, model: ExpenseModel): string | undefined {
  if (!editing || editing.planId == null || editing.installmentIndex == null) return undefined
  const plan = model.lookup.installmentPlan(editing.planId)
  if (!plan) return undefined
  return `Installment ${editing.installmentIndex} of ${plan.totalCount} · Final payment ${fullMonthLabel(finalBudgetMonth(plan))}`
}

function titleFor(editing: Transaction | null, mode: 'single' | 'batch'): string {
  if (editing) return 'Edit transaction'
  return mode === 'batch' ? 'Add multiple transactions' : 'New transaction'
}

function ModeToggle({ mode, onChange }: { mode: 'single' | 'batch'; onChange: (mode: 'single' | 'batch') => void }) {
  return (
    <div className={styles.modeToggle} role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'single'}
        className={`${styles.modeBtn} ${mode === 'single' ? styles.modeActive : ''}`}
        onClick={() => onChange('single')}
      >
        Add one
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'batch'}
        className={`${styles.modeBtn} ${mode === 'batch' ? styles.modeActive : ''}`}
        onClick={() => onChange('batch')}
      >
        Add multiple
      </button>
    </div>
  )
}

/** Guards a modal's close against silently discarding unsaved input: closing
 * while `isDirty` shows a confirm sheet instead of closing immediately. */
function useCloseGuard(isDirty: boolean, onClose: () => void) {
  const [confirming, setConfirming] = useState(false)
  const requestClose = () => {
    if (isDirty) {
      setConfirming(true)
      return
    }
    onClose()
  }
  const cancel = () => setConfirming(false)
  return { confirming, requestClose, cancel, modalOnClose: confirming ? cancel : requestClose }
}

/**
 * Closing with work at risk. Which work depends on whether the row saved: past a
 * partial save the transaction is safe and only its receipts are stranded, so
 * "you'll lose what you've entered" is both wrong and frightening about the
 * wrong thing.
 */
function CloseConfirm({
  stranded,
  onConfirm,
  onCancel,
}: {
  stranded: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const saved = stranded > 0
  const noun = stranded === 1 ? 'receipt' : 'receipts'
  return (
    <ConfirmSheet
      title={saved ? 'Leave without the receipts?' : 'Discard unsaved changes?'}
      message={
        saved
          ? `The transaction is saved. The ${stranded} ${noun} that failed to upload will be discarded — you can attach them later from the transaction.`
          : "Closing now will lose what you've entered."
      }
      confirmLabel={saved ? 'Leave' : 'Discard'}
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

interface Props {
  model: ExpenseModel
  actions: ExpenseActions
  editing: Transaction | null
  seed?: TransactionSeed | undefined
  hint?: string | undefined
  onClose: () => void
}

export function TransactionModal({ model, actions, editing, seed, hint, onClose }: Props) {
  // The flag picker portals out of this Modal and runs its own focus trap, so
  // this Modal's trap must stand down while it is open.
  const [popoverOpen, setPopoverOpen] = useState(false)
  const { showToast } = useToast()
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  // Batch mode only makes sense for a from-scratch add: a seed (duplicate,
  // "add expense in this category" shortcut, etc.) is a request to prefill one
  // specific transaction, which BatchTransactionForm has no way to honor.
  const canBatch = editing == null && seed == null

  // Both forms stay mounted (see the `hidden` props below) so switching the
  // "Add one" / "Add multiple" tab back and forth never loses what's already
  // typed on either side — each keeps its own state alive while hidden.
  const [singleDirty, setSingleDirty] = useState(false)
  const [batchDirty, setBatchDirty] = useState(false)
  // The batch tab saved while the single tab still holds an unsaved draft.
  const [discardingOther, setDiscardingOther] = useState(false)
  // Receipts stranded on a row that did save. Not "unsaved changes".
  const [stranded, setStranded] = useState(0)
  // Either side counts, not just the currently visible one: closing from an
  // empty batch tab would otherwise silently drop a still-hidden, filled-in
  // single-transaction draft (and vice versa).
  const { confirming, cancel, modalOnClose } = useCloseGuard(singleDirty || batchDirty, onClose)

  /**
   * Resolves with the stored row on create so the form can upload the receipts
   * staged against it, and null on update where the id was already known.
   *
   * Deliberately does not toast: receipts upload *after* this resolves, and a
   * premature "Transaction added" would be replaced by any failure message —
   * ToastProvider holds one message at a time. TransactionForm toasts once
   * everything has landed, the way BatchTransactionForm already does.
   */
  const submit = async (input: NewTransaction, id?: number, intent?: InstallmentIntent) => {
    if (id != null) {
      await updateTransactionWithIntent(actions, id, input, intent)
      return null
    }
    return createTransactionWithIntent(actions, input, intent)
  }

  const remove = async (id: number) => {
    await actions.deleteTransaction(id)
    showToast('Transaction deleted', 'success')
  }

  const subtitle = hint ?? installmentNote(editing, model)

  return (
    <Modal
      title={titleFor(editing, mode)}
      {...(subtitle ? { subtitle } : {})}
      onClose={modalOnClose}
      trapPaused={confirming || discardingOther || popoverOpen}
    >
      {canBatch && <ModeToggle mode={mode} onChange={setMode} />}
      {canBatch && (
        <BatchTransactionForm
          model={model}
          actions={actions}
          // Guarded, not raw: the single form stays mounted behind this tab and
          // keeps its draft — staged receipts included. A successful batch save
          // used to close the modal and take that draft with it silently.
          onClose={() => (singleDirty ? setDiscardingOther(true) : onClose())}
          hidden={mode !== 'batch'}
          onDirtyChange={setBatchDirty}
          onTrapPausedChange={setPopoverOpen}
        />
      )}
      <TransactionForm
        model={model}
        editing={editing}
        seed={seed}
        onSubmit={submit}
        onDelete={remove}
        onDuplicate={actions.onDuplicate}
        onClose={onClose}
        hidden={canBatch && mode === 'batch'}
        onDirtyChange={setSingleDirty}
        onPartialSaveChange={setStranded}
        onTrapPausedChange={setPopoverOpen}
        actions={actions}
      />
      {confirming ? (
        <CloseConfirm stranded={stranded} onConfirm={onClose} onCancel={cancel} />
      ) : null}
      {discardingOther ? (
        <ConfirmSheet
          title="Discard the other draft?"
          message="Your transactions were added. The single transaction you started on the other tab has not been saved."
          confirmLabel="Discard it"
          destructive
          onConfirm={onClose}
          onCancel={() => {
            setDiscardingOther(false)
            setMode('single')
          }}
        />
      ) : null}
    </Modal>
  )
}
