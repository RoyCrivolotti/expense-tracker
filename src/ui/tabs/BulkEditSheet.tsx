import { useState } from 'react'
import type { BulkTransactionPatch } from '../../data/dataSource'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { offScreenNote } from './useTransactionSelection'
import { Modal } from '../components/Modal'
import { BulkFieldCards } from './BulkFieldCards'
import { initialBulkFields } from './bulkEditInitial'
import {
  buildBulkLabelAdditions,
  buildBulkPatch,
  canApplyBulkEdit,
  type BulkEditFieldState,
  type DescriptionCount,
} from './bulkEditFields'
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
  onApply: (
    patch: BulkTransactionPatch,
    labelIdsToAdd: number[],
  ) => void
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
  const [fields, setFields] = useState<BulkEditFieldState>(initialBulkFields(model))

  const set = <K extends keyof BulkEditFieldState>(
    key: K,
    value: BulkEditFieldState[K],
  ) => setFields((prev) => ({ ...prev, [key]: value }))

  const canApply = canApplyBulkEdit(fields)

  const handleApply = () => onApply(buildBulkPatch(fields), buildBulkLabelAdditions(fields))

  const noun = count === 1 ? 'transaction' : 'transactions'

  return (
    <Modal title="Edit selected" subtitle={`${count} ${noun}`} onClose={onCancel} trapPaused={popoverOpen}>
      <OffScreenNote hiddenCount={hiddenCount} />
      <div className={styles.fields}>
        <BulkFieldCards
          fields={fields}
          set={set}
          model={model}
          actions={actions}
          currentDescriptions={currentDescriptions}
          onTrapPausedChange={setPopoverOpen}
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.applyBtn} disabled={!canApply || busy} onClick={handleApply}>
          {busy ? 'Applying…' : 'Apply changes'}
        </button>
      </div>
    </Modal>
  )
}
