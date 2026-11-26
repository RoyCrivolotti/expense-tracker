import type { Transaction } from '../../types'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { useToast } from '../hooks/useToast'
import { BatchTransactionForm } from './BatchTransactionForm'
import { Modal } from './Modal'
import { TransactionForm } from './TransactionForm'
import { useQueueAdvance } from './transactionModalQueue'
import { ModalGuards, ModeToggle } from './transactionModalParts'
import { deleteWithToast, installmentNote, titleFor, useDraftGuards, useModalModes } from './transactionModalState'
import { usePopoverTrapPause } from '../hooks/usePopoverTrapPause'

interface Props {
  model: ExpenseModel
  actions: ExpenseActions
  editing: Transaction | null
  seed?: TransactionSeed | undefined
  hint?: string | undefined
  onClose: () => void
}

export function TransactionModal({ model, actions, editing, seed, hint, onClose }: Props) {
  // The flag, date and month pickers portal out of this Modal and run their own
  // focus traps, so this Modal's trap must stand down while any of them is open.
  const [popoverOpen, setPopoverOpen] = usePopoverTrapPause()
  const { showToast } = useToast()
  const { mode, setMode, formView, setFormView, canBatch } = useModalModes(editing, seed)
  const guards = useDraftGuards(onClose)

  /**
   * Resolves with the stored row on create so the form can upload the receipts
   * staged against it, and null on update where the id was already known.
   *
   * Deliberately does not toast: receipts upload *after* this resolves, and a
   * premature "Transaction added" would be replaced by any failure message —
   * ToastProvider holds one message at a time. TransactionForm toasts once
   * everything has landed, the way BatchTransactionForm already does.
   */
  const queue = useQueueAdvance(seed, actions, onClose, editing)
  const remove = deleteWithToast(actions, showToast)

  return (
    <Modal
      title={titleFor(editing, mode, formView)}
      subtitle={hint ?? installmentNote(editing, model)}
      onClose={guards.modalOnClose}
      onBack={formView === 'installment' ? () => setFormView('fields') : undefined}
      trapPaused={guards.confirming || guards.discardingOther || popoverOpen}
    >
      {canBatch && (
        <>
          {/*
           * Not shown on the installment step: that is a sub-page of the single
           * form — the header is already carrying its own title and a back arrow
           * — and these tabs belong to the sheet above it. Pressing one there
           * used to throw the sub-navigation away without saying so.
           * BatchTransactionForm below stays mounted regardless, so hiding only
           * the toggle costs no draft.
           */}
          {formView === 'fields' && <ModeToggle mode={mode} onChange={setMode} />}
          <BatchTransactionForm
            model={model}
            actions={actions}
            onClose={guards.closeFromBatch}
            hidden={mode !== 'batch'}
            onDirtyChange={guards.setBatchDirty}
            onTrapPausedChange={setPopoverOpen}
          />
        </>
      )}
      <TransactionForm
        /*
         * Keyed on the row being edited, so following a link from inside the
         * editor to another transaction rebuilds the form. `initialFields` runs
         * in a `useState` initialiser, so without this the fields kept showing
         * the transaction you came *from* while the header and links described
         * the one you had just opened.
         */
        key={queue.formKey}
        model={model}
        editing={editing}
        seed={seed}
        duplicate={queue.duplicate}
        onSubmit={queue.submit}
        onDelete={remove}
        onDuplicate={actions.onDuplicate}
        onClose={queue.finish}
        queue={queue.forForm}
        hidden={canBatch && mode === 'batch'}
        onDirtyChange={guards.setSingleDirty}
        onPartialSaveChange={guards.setStranded}
        onTrapPausedChange={setPopoverOpen}
        actions={actions}
        view={formView}
        onViewChange={setFormView}
      />
      <ModalGuards
        guards={guards}
        onClose={onClose}
        onKeepOtherDraft={() => {
          guards.setDiscardingOther(false)
          setMode('single')
        }}
      />
    </Modal>
  )
}
