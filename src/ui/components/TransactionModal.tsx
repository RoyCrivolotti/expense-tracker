import type { Transaction } from '../../types'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { BatchTransactionForm } from './BatchTransactionForm'
import { Modal } from './Modal'
import { useReviewSheet } from './reviewPages'
import { ModalForms, SheetPager, type FormShared } from './TransactionModalForms'
import { ModalGuards, ModeToggle } from './transactionModalParts'
import { installmentNote, titleFor, useDraftGuards, useModalModes } from './transactionModalState'
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
  const { mode, setMode, formView, setFormView, canBatch } = useModalModes(editing, seed)
  const guards = useDraftGuards(onClose)
  // Set while working through captured payments: each one shown keeps its form until the sheet closes.
  const sheet = useReviewSheet(seed, actions.onAdd, guards.setSingleDirty)
  const form: FormShared = {
    model,
    actions,
    editing,
    onClose,
    view: formView,
    onViewChange: setFormView,
    onTrapPausedChange: setPopoverOpen,
    onPartialSaveChange: guards.setStranded,
  }
  return (
    <Modal
      title={titleFor(editing, mode, formView, seed?.recommendationId !== undefined)}
      subtitle={hint ?? installmentNote(editing, model)}
      onClose={guards.modalOnClose}
      onBack={formView === 'installment' ? () => setFormView('fields') : undefined}
      trapPaused={guards.confirming || guards.discardingOther || popoverOpen}
      revealFields
      headerExtra={<SheetPager sheet={sheet} seed={seed} view={formView} pickerOpen={popoverOpen} />}
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
      <ModalForms
        sheet={sheet}
        seed={seed}
        hidden={canBatch && mode === 'batch'}
        onDirtyChange={guards.setSingleDirty}
        form={form}
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
