import { useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { Modal } from '../components/Modal'
import { RecordForm } from './RecordForm'
import { ConfigDeleteControl, type DeleteMode } from './ConfigDeleteControl'
import { buildConfig, type EditTarget } from './configModalConfig'
import { useHeldWhileLeaving } from '../hooks/usePresence'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useRecordUsage } from './recordUsage'

interface ConfigModalProps {
  target: EditTarget
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
}

export function ConfigModal({ target, model, actions, onClose }: ConfigModalProps) {
  const { symbol } = useMoneyFormat()
  // The delete or save that closed the editor has usually changed the model already. Built
  // from that, the delete sheets would reword themselves, or give way to the "you need at
  // least one" note, while they are still leaving.
  const shownModel = useHeldWhileLeaving(model)
  const usage = useRecordUsage(shownModel)
  const cfg = buildConfig(target, shownModel, actions, symbol, usage)
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('idle')
  // While a delete confirm/reassign sheet is open, Escape/backdrop should close just that
  // sheet — otherwise the sheet's own Escape handler and this Modal's both fire (they're
  // independent document-level listeners), closing the whole editor out from under it.
  const dismiss = deleteMode !== 'idle' ? () => setDeleteMode('idle') : onClose
  return (
    <Modal title={cfg.title} onClose={dismiss} trapPaused={deleteMode !== 'idle'}>
      <RecordForm
        fields={cfg.fields}
        initial={cfg.initial}
        submitLabel={cfg.submitLabel}
        onSubmit={cfg.onSubmit}
        onClose={onClose}
      />
      {cfg.delete ? (
        <ConfigDeleteControl config={cfg.delete} onDeleted={onClose} mode={deleteMode} onModeChange={setDeleteMode} />
      ) : null}
    </Modal>
  )
}
